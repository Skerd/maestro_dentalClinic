import * as crypto from "crypto";
import {ObjectId} from "mongodb";
import type {ClientSession} from "mongoose";
import {apiValidationException} from "armonia/src/modules/core/helpers/exceptions";
import type {serverLogger} from "@coreModule/loggers/serverLog";
import {nestedEntityToRef} from "@coreModule/utilities/mappers/common.mapper";
import {formatPostalAddress} from "@coreModule/utilities/helpers/postalAddress";
import {localDateOf, localDayInterval, localToUtc} from "@coreModule/utilities/time/timeWindows";
import type {CreateInput} from "@coreModule/database/services/baseCrudService";
import type {IClinicConfig} from "@dentalClinicModule/database/schemas/clinicConfig/clinicConfig";
import ClinicLocation, {type IClinicLocation} from "@dentalClinicModule/database/schemas/clinicLocation/clinicLocation";
import ClinicService, {type IClinicService} from "@dentalClinicModule/database/schemas/clinicService/clinicService";
import Practitioner, {type IPractitioner} from "@dentalClinicModule/database/schemas/practitioner/practitioner";
import Appointment, {type IAppointment} from "@dentalClinicModule/database/schemas/appointment/appointment";
import {appointmentService} from "@dentalClinicModule/database/schemas/appointment/appointment.service";
import {blockedWindow, blockingAppointmentFilter, eligiblePractitioners, isStartFree, treatmentWindow} from "./clinicAvailability";

const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;

export type ClinicCtx = {session: ClientSession; logger: serverLogger; languageCode: string; auditUserId?: string | ObjectId};

/**
 * Takes the practitioner's booking lock for the current transaction by bumping
 * `bookingVersion`. Any other transaction that books, moves or blocks time for the
 * same person writes the same document, so MongoDB commits only one of them and
 * the other is retried by asyncHandler and then sees this change. Without it two
 * bookings could each insert their own appointment (write skew).
 */
export async function lockPractitioner(practitionerId: ObjectId, ctx: {companyId: ObjectId; session: ClientSession; languageCode: string}): Promise<void> {
    const result = await Practitioner.updateOne(
        {_id: practitionerId, company: ctx.companyId, deletedAt: null},
        {$inc: {bookingVersion: 1}},
        {session: ctx.session},
    );
    if (result.matchedCount === 0) throw apiValidationException("practitioner_not_found", "", null, ctx.languageCode);
}

/** The service and location of a booking: active, and offered online when booked online. */
export async function loadBookingTargets(
    companyId: ObjectId,
    ids: {service: string; location: string},
    ctx: {languageCode: string; online: boolean; session?: ClientSession | null},
): Promise<{service: IClinicService; location: IClinicLocation}> {
    const service = ObjectId.isValid(ids.service)
        ? await ClinicService.findOne({
            _id: new ObjectId(ids.service),
            company: companyId,
            isActive: true,
            deletedAt: null,
            ...(ctx.online ? {isPublic: true, onlineBookable: true} : {}),
        }).session(ctx.session ?? null)
        : null;
    if (!service) throw apiValidationException("clinic_service_not_found", "", null, ctx.languageCode);
    const location = ObjectId.isValid(ids.location)
        ? await ClinicLocation.findOne({_id: new ObjectId(ids.location), company: companyId, isActive: true, deletedAt: null})
            .populate([{path: "address.city", select: "name"}])
            .session(ctx.session ?? null)
        : null;
    if (!location) throw apiValidationException("clinic_location_not_found", "", null, ctx.languageCode);
    return {service, location};
}

/** The instant a local date and time at the location names. */
export function resolveStart(date: string, time: string, location: Pick<IClinicLocation, "timezone">, languageCode: string): Date {
    const start = localToUtc(date, time, location.timezone);
    if (!start) throw apiValidationException("appointment_invalid_time", "", null, languageCode);
    return start;
}

/** Online limits with their own messages; staff may book at short notice but not in the past. */
export function assertBookingWindow(start: Date, config: IClinicConfig, ctx: {online: boolean; now: Date; languageCode: string}): void {
    const {online, now, languageCode} = ctx;
    if (!online) {
        if (start < now) throw apiValidationException("appointment_in_past", "", null, languageCode);
        return;
    }
    if (start.getTime() < now.getTime() + config.minNoticeHours * HOUR) {
        throw apiValidationException("appointment_too_soon", "", null, languageCode, [String(config.minNoticeHours)]);
    }
    if (start.getTime() > now.getTime() + config.maxAdvanceDays * DAY) {
        throw apiValidationException("appointment_too_far_ahead", "", null, languageCode, [String(config.maxAdvanceDays)]);
    }
}

/** Candidates for "anyone", least busy that day first, then by id so the choice is stable. */
async function byFewestAppointments(candidates: IPractitioner[], location: IClinicLocation, start: Date, session: ClientSession): Promise<IPractitioner[]> {
    const day = localDayInterval(localDateOf(start, location.timezone), location.timezone);
    const counts = await Appointment.aggregate<{_id: ObjectId; count: number}>([
        {$match: {practitioner: {$in: candidates.map((p) => p._id)}, startAt: {$gte: day.start, $lt: day.end}, ...blockingAppointmentFilter()}},
        {$group: {_id: "$practitioner", count: {$sum: 1}}},
    ]).session(session);
    const countOf = new Map(counts.map(({_id, count}) => [String(_id), count]));
    return [...candidates].sort((a, b) => (countOf.get(String(a._id)) ?? 0) - (countOf.get(String(b._id)) ?? 0) || String(a._id).localeCompare(String(b._id)));
}

/**
 * Picks and locks the practitioner for `start`: the requested one, or for
 * "anyone" the eligible one with the fewest appointments that day. Must run in
 * the caller's transaction; the free-time check is repeated under the lock.
 */
export async function allocatePractitioner(
    input: {
        companyId: ObjectId;
        config: IClinicConfig;
        service: IClinicService;
        location: IClinicLocation;
        practitionerId?: string;
        start: Date;
        online: boolean;
        now: Date;
        excludeAppointmentId?: ObjectId;
    },
    ctx: ClinicCtx,
): Promise<IPractitioner> {
    const {companyId, config, service, location, practitionerId, start, online, now, excludeAppointmentId} = input;
    const candidates = await eligiblePractitioners({companyId, serviceId: service._id, locationId: location._id, practitionerId, online, session: ctx.session});
    if (practitionerId && !candidates.length) throw apiValidationException("appointment_practitioner_not_eligible", "", null, ctx.languageCode);

    const ordered = practitionerId ? candidates : await byFewestAppointments(candidates, location, start, ctx.session);
    for (const practitioner of ordered) {
        await lockPractitioner(practitioner._id, {companyId, session: ctx.session, languageCode: ctx.languageCode});
        const free = await isStartFree({
            companyId, practitioner, location, service, rules: config, start, online, now, excludeAppointmentId, session: ctx.session,
        });
        if (free) return practitioner;
    }
    throw apiValidationException(practitionerId ? "appointment_slot_unavailable" : "appointment_no_practitioner_available", "", null, ctx.languageCode);
}

function appointmentNumber(now: Date): string {
    const datePart = now.toISOString().slice(0, 10).replace(/-/g, "");
    return `AP-${datePart}-${crypto.randomBytes(4).toString("hex")}`.toUpperCase();
}

/** The parts of an appointment that follow from its practitioner and start. */
export function scheduledFields(service: IClinicService, practitioner: IPractitioner, start: Date) {
    const treatment = treatmentWindow(start, service);
    const blocked = blockedWindow(start, service);
    return {practitioner: practitioner._id, startAt: treatment.start, endAt: treatment.end, blockedStart: blocked.start, blockedEnd: blocked.end};
}

export type CreateAppointmentInput = {
    companyId: ObjectId;
    config: IClinicConfig;
    service: IClinicService;
    location: IClinicLocation;
    practitionerId?: string;
    date: string;
    time: string;
    patient: {firstName: string; lastName: string; email: string; phone: string};
    customerId?: ObjectId;
    note?: string;
    idempotencyKey: string;
    source: "online" | "staff";
    /** Set for online bookings: the privacy notice the patient accepted. */
    consentAt?: Date;
    now?: Date;
};

/**
 * Checks the start, allocates (and locks) a practitioner and returns the
 * appointment to insert, inside the caller's transaction. Online bookings wait
 * for staff when the clinic asks for that; everything else is confirmed at once.
 */
export async function buildAppointment(input: CreateAppointmentInput, ctx: ClinicCtx): Promise<CreateInput<IAppointment>> {
    const {companyId, config, service, location, patient, idempotencyKey, source} = input;
    const now = input.now ?? new Date();
    const online = source === "online";

    const start = resolveStart(input.date, input.time, location, ctx.languageCode);
    assertBookingWindow(start, config, {online, now, languageCode: ctx.languageCode});
    const practitioner = await allocatePractitioner(
        {companyId, config, service, location, practitionerId: input.practitionerId, start, online, now},
        ctx,
    );

    const confirmed = !(online && config.requireStaffConfirmation);
    // Staff notes are the clinic's own; a patient's note is kept only where the clinic allows it.
    const note = !online || config.patientNoteEnabled ? input.note?.trim() || undefined : undefined;
    return {
        company: companyId,
        number: appointmentNumber(now),
        status: confirmed ? "confirmed" : "pending",
        source,
        service: service._id,
        location: location._id,
        ...scheduledFields(service, practitioner, start),
        ...(input.customerId ? {customer: input.customerId} : {}),
        patient,
        ...(note ? {note} : {}),
        snapshot: {
            serviceName: service.name,
            durationMinutes: service.durationMinutes,
            priceType: service.priceType,
            price: service.priceType === "fixed" || service.priceType === "from" ? service.price : undefined,
            practitionerName: practitioner.displayName,
            locationName: location.name,
            locationAddress: formatPostalAddress(location.address),
            timezone: location.timezone,
        },
        currency: nestedEntityToRef(config.currency),
        policy: {cancellationDeadlineHours: config.cancellationDeadlineHours, rescheduleDeadlineHours: config.rescheduleDeadlineHours},
        ...(input.consentAt ? {consent: {version: config.privacyNoticeVersion, at: input.consentAt}} : {}),
        idempotencyKey,
        timeline: [{event: "created", at: now}, ...(confirmed ? [{event: "confirmed" as const, at: now}] : [])],
        rescheduleCount: 0,
        manageTokenVersion: 1,
    };
}

/**
 * Creates an appointment inside the caller's transaction. A request repeated with
 * the same idempotency key returns the appointment it made the first time.
 */
export async function createAppointment(input: CreateAppointmentInput, ctx: ClinicCtx): Promise<{appointment: IAppointment; created: boolean}> {
    const existing = await Appointment.findOne({company: input.companyId, idempotencyKey: input.idempotencyKey}).session(ctx.session);
    if (existing) return {appointment: existing, created: false};

    const data = await buildAppointment(input, ctx);
    const appointment = await appointmentService.create(data, {
        session: ctx.session,
        logger: ctx.logger,
        languageCode: ctx.languageCode,
        auditUserId: ctx.auditUserId,
    });
    return {appointment, created: true};
}
