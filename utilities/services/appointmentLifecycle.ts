import {ObjectId} from "mongodb";
import {apiValidationException} from "armonia/src/modules/core/helpers/exceptions";
import {nestedEntityToRef} from "@coreModule/utilities/mappers/common.mapper";
import type {AppointmentStatus} from "armonia/src/modules/dentalClinic/api/dentalClinic/private/appointment/appointment.constants";
import type {IAppointment} from "@dentalClinicModule/database/schemas/appointment/appointment";
import {clinicConfigService} from "@dentalClinicModule/database/schemas/clinicConfig/clinicConfig.service";
import {NotificationEventCodes} from "@dentalClinicModule/domain/notifications/notificationEventCodes";
import {allocatePractitioner, assertBookingWindow, loadBookingTargets, resolveStart, scheduledFields, type ClinicCtx} from "./appointmentBooking";
import {notifyClinicStaff, notifyPatient} from "./appointmentNotify";

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

type Actor = {by: "patient" | "staff"; userId?: string; now?: Date};

export function assertStatus(appointment: IAppointment, allowed: AppointmentStatus[], languageCode: string): void {
    if (!allowed.includes(appointment.status)) {
        throw apiValidationException("appointment_invalid_status", "", null, languageCode);
    }
}

/** Last moment the patient may cancel, under the policy they booked with. */
export function cancelUntil(appointment: Pick<IAppointment, "startAt" | "policy">): Date {
    return new Date(appointment.startAt.getTime() - appointment.policy.cancellationDeadlineHours * HOUR);
}

/** Last moment the patient may move the appointment. */
export function rescheduleUntil(appointment: Pick<IAppointment, "startAt" | "policy">): Date {
    return new Date(appointment.startAt.getTime() - appointment.policy.rescheduleDeadlineHours * HOUR);
}

const byOf = (userId?: string) => (userId && ObjectId.isValid(userId) ? new ObjectId(userId) : undefined);

/** A pending appointment the clinic accepts. */
export async function confirmAppointment(appointment: IAppointment, actor: Actor, ctx: ClinicCtx): Promise<void> {
    assertStatus(appointment, ["pending"], ctx.languageCode);
    appointment.status = "confirmed";
    appointment.timeline.push({event: "confirmed", at: actor.now ?? new Date(), by: byOf(actor.userId)});
    await appointment.save({session: ctx.session});
    await notifyPatient("confirmed", appointment, ctx);
}

/**
 * Cancels a pending or confirmed appointment. Patients must do it before the
 * deadline; staff any time. Old guest links stop working.
 */
export async function cancelAppointment(appointment: IAppointment, input: Actor & {reason?: string}, ctx: ClinicCtx): Promise<void> {
    assertStatus(appointment, ["pending", "confirmed"], ctx.languageCode);
    const now = input.now ?? new Date();
    if (input.by === "patient" && now > cancelUntil(appointment)) {
        throw apiValidationException("appointment_cancel_deadline_passed", "", null, ctx.languageCode, [String(appointment.policy.cancellationDeadlineHours)]);
    }
    appointment.status = "cancelled";
    appointment.cancelledAt = now;
    appointment.cancelledBy = input.by;
    appointment.cancellationReason = input.reason;
    appointment.manageTokenVersion += 1;
    appointment.timeline.push({event: "cancelled", at: now, by: byOf(input.userId), note: input.reason});
    await appointment.save({session: ctx.session});
    await notifyPatient("cancelled", appointment, ctx);
    if (input.by === "patient") await notifyClinicStaff(NotificationEventCodes.APPOINTMENT_CANCELLED, appointment, ctx);
}

/**
 * Moves the appointment to a new start (and, for staff, optionally another
 * practitioner), with the same free-time checks and lock as a new booking.
 * Patients keep their practitioner and must stay before the deadline and inside
 * the online booking rules. Old guest links stop working.
 */
export async function rescheduleAppointment(
    appointment: IAppointment,
    input: Actor & {date: string; time: string; practitionerId?: string},
    ctx: ClinicCtx,
): Promise<void> {
    assertStatus(appointment, ["pending", "confirmed"], ctx.languageCode);
    const now = input.now ?? new Date();
    const online = input.by === "patient";
    if (online && now > rescheduleUntil(appointment)) {
        throw apiValidationException("appointment_reschedule_deadline_passed", "", null, ctx.languageCode, [String(appointment.policy.rescheduleDeadlineHours)]);
    }
    const companyId = nestedEntityToRef(appointment.company);
    const config = await clinicConfigService.getOrCreateForCompany(companyId, ctx);
    const {service, location} = await loadBookingTargets(
        companyId,
        {service: String(nestedEntityToRef(appointment.service)), location: String(nestedEntityToRef(appointment.location))},
        {languageCode: ctx.languageCode, online, session: ctx.session},
    );
    const start = resolveStart(input.date, input.time, location, ctx.languageCode);
    assertBookingWindow(start, config, {online, now, languageCode: ctx.languageCode});
    const practitioner = await allocatePractitioner(
        {
            companyId,
            config,
            service,
            location,
            practitionerId: online ? String(nestedEntityToRef(appointment.practitioner)) : input.practitionerId ?? String(nestedEntityToRef(appointment.practitioner)),
            start,
            online,
            now,
            excludeAppointmentId: appointment._id,
        },
        ctx,
    );

    const from = appointment.startAt.toISOString();
    Object.assign(appointment, scheduledFields(service, practitioner, start));
    appointment.snapshot.practitionerName = practitioner.displayName;
    appointment.rescheduleCount += 1;
    appointment.reminderSentAt = undefined;
    appointment.manageTokenVersion += 1;
    appointment.timeline.push({event: "rescheduled", at: now, by: byOf(input.userId), note: `${from} → ${start.toISOString()}`});
    await appointment.save({session: ctx.session});
    await notifyPatient("rescheduled", appointment, ctx);
}

/** The visit happened. Allowed once it has started. */
export async function completeAppointment(appointment: IAppointment, actor: Actor, ctx: ClinicCtx): Promise<void> {
    assertStatus(appointment, ["confirmed"], ctx.languageCode);
    const now = actor.now ?? new Date();
    if (now < appointment.startAt) throw apiValidationException("appointment_too_early_to_close", "", null, ctx.languageCode);
    appointment.status = "completed";
    appointment.timeline.push({event: "completed", at: now, by: byOf(actor.userId)});
    await appointment.save({session: ctx.session});
}

/** The patient never came. Allowed once the start plus the clinic's grace period has passed. */
export async function markNoShow(appointment: IAppointment, actor: Actor & {graceMinutes: number}, ctx: ClinicCtx): Promise<void> {
    assertStatus(appointment, ["confirmed"], ctx.languageCode);
    const now = actor.now ?? new Date();
    if (now.getTime() < appointment.startAt.getTime() + actor.graceMinutes * MINUTE) {
        throw apiValidationException("appointment_too_early_to_close", "", null, ctx.languageCode);
    }
    appointment.status = "no_show";
    appointment.timeline.push({event: "no_show", at: now, by: byOf(actor.userId)});
    await appointment.save({session: ctx.session});
}
