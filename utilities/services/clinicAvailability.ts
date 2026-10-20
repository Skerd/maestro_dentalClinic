import {ObjectId} from "mongodb";
import type {ClientSession} from "mongoose";
import {nestedEntityToRef} from "@coreModule/utilities/mappers/common.mapper";
import {
    addLocalDays,
    expandWeeklyHours,
    intersectIntervals,
    isCovered,
    localDateOf,
    localDayInterval,
    localTimeOf,
    overlaps,
    subtractIntervals,
    type TimeInterval,
} from "@coreModule/utilities/time/timeWindows";
import {APPOINTMENT_BLOCKING_STATUSES} from "armonia/src/modules/dentalClinic/api/dentalClinic/private/appointment/appointment.constants";
import type {IClinicConfig} from "@dentalClinicModule/database/schemas/clinicConfig/clinicConfig";
import type {IClinicLocation} from "@dentalClinicModule/database/schemas/clinicLocation/clinicLocation";
import type {IClinicService} from "@dentalClinicModule/database/schemas/clinicService/clinicService";
import Practitioner, {type IPractitioner} from "@dentalClinicModule/database/schemas/practitioner/practitioner";
import ScheduleException from "@dentalClinicModule/database/schemas/scheduleException/scheduleException";
import Appointment from "@dentalClinicModule/database/schemas/appointment/appointment";

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export type ServiceTiming = Pick<IClinicService, "durationMinutes" | "bufferBeforeMinutes" | "bufferAfterMinutes">;
export type LocationHours = Pick<IClinicLocation, "_id" | "timezone" | "openingHours" | "closures">;
export type SlotRules = Pick<IClinicConfig, "slotIntervalMinutes" | "minNoticeHours" | "maxAdvanceDays">;

/** Appointments that keep a practitioner busy. */
export function blockingAppointmentFilter(): Record<string, unknown> {
    return {deletedAt: null, status: {$in: [...APPOINTMENT_BLOCKING_STATUSES]}};
}

/** The treatment itself: what the patient is told. */
export function treatmentWindow(start: Date, service: ServiceTiming): TimeInterval {
    return {start, end: new Date(start.getTime() + service.durationMinutes * MINUTE)};
}

/** The treatment plus preparation and clean-up: the time the practitioner is busy. */
export function blockedWindow(start: Date, service: ServiceTiming): TimeInterval {
    return {
        start: new Date(start.getTime() - (service.bufferBeforeMinutes ?? 0) * MINUTE),
        end: new Date(start.getTime() + (service.durationMinutes + (service.bufferAfterMinutes ?? 0)) * MINUTE),
    };
}

/** `range` widened so every appointment whose blocked window can touch a slot in it is loaded. */
function paddedRange(range: TimeInterval, service: ServiceTiming): TimeInterval {
    return {
        start: new Date(range.start.getTime() - (service.bufferBeforeMinutes ?? 0) * MINUTE),
        end: new Date(range.end.getTime() + (service.durationMinutes + (service.bufferAfterMinutes ?? 0)) * MINUTE),
    };
}

/**
 * When a practitioner works at a location within `range`: their weekly rows for
 * that location, inside the location's opening hours (none = always open), minus
 * the location's closed days. All in the location's timezone.
 */
export function workingIntervals(practitioner: Pick<IPractitioner, "schedule">, location: LocationHours, range: TimeInterval): TimeInterval[] {
    const timeZone = location.timezone;
    const rows = (practitioner.schedule ?? []).filter((row) => String(nestedEntityToRef(row.location)) === String(location._id));
    let work = expandWeeklyHours(rows, timeZone, range.start, range.end);
    if (location.openingHours?.length) {
        work = intersectIntervals(work, expandWeeklyHours(location.openingHours, timeZone, range.start, range.end));
    }
    const closedDays = (location.closures ?? []).map((closure) => localDayInterval(closure.date, timeZone));
    return subtractIntervals(work, closedDays);
}

/**
 * Busy time per practitioner (hex id) within `range`: their blocking appointments
 * anywhere, their time off, and closures of this location.
 */
export async function busyIntervals(query: {
    companyId: ObjectId;
    practitionerIds: ObjectId[];
    locationId: ObjectId;
    range: TimeInterval;
    excludeAppointmentId?: ObjectId;
    session?: ClientSession | null;
}): Promise<Map<string, TimeInterval[]>> {
    const {companyId, practitionerIds, locationId, range, excludeAppointmentId, session} = query;
    const [appointments, exceptions] = await Promise.all([
        Appointment.find({
            company: companyId,
            practitioner: {$in: practitionerIds},
            blockedStart: {$lt: range.end},
            blockedEnd: {$gt: range.start},
            ...(excludeAppointmentId ? {_id: {$ne: excludeAppointmentId}} : {}),
            ...blockingAppointmentFilter(),
        }).select("practitioner blockedStart blockedEnd").session(session ?? null),
        ScheduleException.find({
            company: companyId,
            deletedAt: null,
            startAt: {$lt: range.end},
            endAt: {$gt: range.start},
            $or: [{practitioner: {$in: practitionerIds}}, {location: locationId}],
        }).select("practitioner location startAt endAt").session(session ?? null),
    ]);

    const busy = new Map<string, TimeInterval[]>(practitionerIds.map((id) => [String(id), []]));
    for (const appointment of appointments) {
        busy.get(String(appointment.practitioner))?.push({start: appointment.blockedStart, end: appointment.blockedEnd});
    }
    for (const exception of exceptions) {
        const interval = {start: exception.startAt, end: exception.endAt};
        if (exception.practitioner) busy.get(String(exception.practitioner))?.push(interval);
        else for (const intervals of busy.values()) intervals.push(interval);
    }
    return busy;
}

/**
 * Online start times: on the slot grid from the start of each working interval,
 * with the treatment inside working time, the whole blocked window free, and
 * within the notice and advance-booking limits.
 */
export function slotStarts(work: TimeInterval[], busy: TimeInterval[], service: ServiceTiming, rules: SlotRules, now: Date): Date[] {
    const earliest = now.getTime() + rules.minNoticeHours * HOUR;
    const latest = now.getTime() + rules.maxAdvanceDays * DAY;
    const step = rules.slotIntervalMinutes * MINUTE;
    const duration = service.durationMinutes * MINUTE;
    const starts: Date[] = [];
    for (const interval of work) {
        for (let time = interval.start.getTime(); time + duration <= interval.end.getTime(); time += step) {
            if (time < earliest || time > latest) continue;
            const start = new Date(time);
            const blocked = blockedWindow(start, service);
            if (!busy.some((interval) => overlaps(interval, blocked))) starts.push(start);
        }
    }
    return starts;
}

/** Staff may book any free moment inside working time: off the grid and at short notice. */
export function fitsWorkingTime(start: Date, work: TimeInterval[], busy: TimeInterval[], service: ServiceTiming): boolean {
    const blocked = blockedWindow(start, service);
    return isCovered(treatmentWindow(start, service), work) && !busy.some((interval) => overlaps(interval, blocked));
}

/** Active practitioners who do a service at a location; online also needs them bookable. */
export async function eligiblePractitioners(query: {
    companyId: ObjectId;
    serviceId: ObjectId;
    locationId: ObjectId;
    practitionerId?: string;
    online: boolean;
    session?: ClientSession | null;
}): Promise<IPractitioner[]> {
    const {companyId, serviceId, locationId, practitionerId, online, session} = query;
    if (practitionerId !== undefined && !ObjectId.isValid(practitionerId)) return [];
    return Practitioner.find({
        company: companyId,
        deletedAt: null,
        isActive: true,
        services: serviceId,
        locations: locationId,
        ...(online ? {isBookable: true} : {}),
        ...(practitionerId ? {_id: new ObjectId(practitionerId)} : {}),
    }).sort({sortOrder: 1, displayName: 1}).session(session ?? null);
}

/** Whether `start` can be booked with this practitioner. Call under their lock to make the answer final. */
export async function isStartFree(input: {
    companyId: ObjectId;
    practitioner: IPractitioner;
    location: LocationHours;
    service: ServiceTiming;
    rules: SlotRules;
    start: Date;
    online: boolean;
    now: Date;
    excludeAppointmentId?: ObjectId;
    session?: ClientSession | null;
}): Promise<boolean> {
    const {companyId, practitioner, location, service, rules, start, online, now, excludeAppointmentId, session} = input;
    const day = localDayInterval(localDateOf(start, location.timezone), location.timezone);
    const busyMap = await busyIntervals({
        companyId,
        practitionerIds: [practitioner._id],
        locationId: location._id,
        range: paddedRange(day, service),
        excludeAppointmentId,
        session,
    });
    const work = workingIntervals(practitioner, location, day);
    const busy = busyMap.get(String(practitioner._id)) ?? [];
    if (online) return slotStarts(work, busy, service, rules, now).some((slot) => slot.getTime() === start.getTime());
    return fitsWorkingTime(start, work, busy, service);
}

export type DaySlots = {date: string; slots: {time: string; startAt: string; practitioners: string[]}[]};

/** Free online start times per local day, merged across the candidates ("anyone" lists everyone free). */
export async function availableSlots(input: {
    companyId: ObjectId;
    rules: SlotRules;
    service: ServiceTiming;
    location: LocationHours;
    practitioners: IPractitioner[];
    fromDate: string;
    days: number;
    now: Date;
}): Promise<DaySlots[]> {
    const {companyId, rules, service, location, practitioners, fromDate, days, now} = input;
    const timeZone = location.timezone;
    const lastDate = addLocalDays(fromDate, days - 1);
    const range = {start: localDayInterval(fromDate, timeZone).start, end: localDayInterval(lastDate, timeZone).end};
    const busy = practitioners.length
        ? await busyIntervals({companyId, practitionerIds: practitioners.map((p) => p._id), locationId: location._id, range: paddedRange(range, service)})
        : new Map<string, TimeInterval[]>();

    const byStart = new Map<number, string[]>();
    for (const practitioner of practitioners) {
        const id = String(practitioner._id);
        for (const start of slotStarts(workingIntervals(practitioner, location, range), busy.get(id) ?? [], service, rules, now)) {
            const ids = byStart.get(start.getTime()) ?? [];
            ids.push(id);
            byStart.set(start.getTime(), ids);
        }
    }

    const result: DaySlots[] = [];
    for (let i = 0; i < days; i++) result.push({date: addLocalDays(fromDate, i), slots: []});
    const byDate = new Map(result.map((day) => [day.date, day]));
    for (const time of [...byStart.keys()].sort((a, b) => a - b)) {
        const start = new Date(time);
        byDate.get(localDateOf(start, timeZone))?.slots.push({
            time: localTimeOf(start, timeZone),
            startAt: start.toISOString(),
            practitioners: byStart.get(time) ?? [],
        });
    }
    return result;
}
