import {afterAll, beforeAll, beforeEach, describe, expect, it, vi} from "vitest";
import {connectTestDatabase, disconnectTestDatabase} from "@coreModule/_tests/testDatabase";

import {ObjectId} from "mongodb";
import request from "supertest";

vi.mock("@coreModule/utilities/middlewares/authMW", async () =>
    (await import("@coreModule/_tests/httpHarness")).authMWStub);
// No Redis in tests; the public routes' limiter fails closed without it.
vi.mock("@coreModule/utilities/middlewares/rateLimiter", () => ({
    rateLimiter: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));
const {originCompany} = vi.hoisted(() => ({originCompany: {current: null as {_id: {toString(): string}; name?: string} | null}}));
vi.mock("@coreModule/utilities/marketing/resolveCompanyByOrigin", async () => {
    // Records the tenant like the real resolver (D16).
    const {setRequestTenant} = await import("@coreModule/utilities/endpoints/tenantScope");
    return {
        resolveCompanyByOrigin: async () => {
            if (originCompany.current) setRequestTenant(originCompany.current._id.toString());
            return originCompany.current;
        },
    };
});
const {mail} = vi.hoisted(() => ({mail: {sent: [] as {kind: string}[]}}));
vi.mock("@dentalClinicModule/utilities/emails/sendPatientMail", () => ({
    sendPatientMail: vi.fn(async (message: {kind: string}) => {
        mail.sent.push(message);
    }),
    patientSmsText: () => "",
}));

import {allPermissionTags, appFor, callerHeader, type TestCaller} from "@coreModule/_tests/httpHarness";
import Company from "@coreModule/database/schemas/company/company";
import Role from "@coreModule/database/schemas/role/role";
import Currency from "@coreModule/database/schemas/currency/currency";
import {addLocalDays, localDateOf} from "@coreModule/utilities/time/timeWindows";
import {withTenant} from "@coreModule/utilities/endpoints/tenantScope";
import * as appointmentRoute from "@dentalClinicModule/api/dentalClinic/private/appointment";
import * as clinicDayRoute from "@dentalClinicModule/api/dentalClinic/private/clinicDay";
import * as myAppointmentRoute from "@dentalClinicModule/api/dentalClinic/private/myAppointment";
import * as scheduleExceptionRoute from "@dentalClinicModule/api/dentalClinic/private/scheduleException";
import * as storefrontRoute from "@dentalClinicModule/api/dentalClinic/public/clinicStorefront";
import ClinicConfig from "@dentalClinicModule/database/schemas/clinicConfig/clinicConfig";
import ClinicLocation from "@dentalClinicModule/database/schemas/clinicLocation/clinicLocation";
import ClinicService from "@dentalClinicModule/database/schemas/clinicService/clinicService";
import Practitioner from "@dentalClinicModule/database/schemas/practitioner/practitioner";
import ScheduleException from "@dentalClinicModule/database/schemas/scheduleException/scheduleException";
import Appointment from "@dentalClinicModule/database/schemas/appointment/appointment";
import Patient from "@dentalClinicModule/database/schemas/patient/patient";

const companyId = new ObjectId();
const otherCompanyId = new ObjectId();
/** The tests act on this company's data, as its requests and jobs do (D16). */
const asCompany = <T>(fn: () => PromiseLike<T>): Promise<T> => withTenant(companyId, fn);
const app = appFor([appointmentRoute, clinicDayRoute, myAppointmentRoute, scheduleExceptionRoute, storefrontRoute].map((route) => ({...route, module: "dentalClinic"})));

const ZURICH = "Europe/Zurich";
const HOUR = 3600 * 1000;
const EVERY_DAY = [0, 1, 2, 3, 4, 5, 6];
const weekday = (date: string) => new Date(`${date}T12:00:00Z`).getUTCDay();
/** The first `dayOfWeek` at least `minDays` after today at the clinic, so the dates never fall into the past. */
function localDateAhead(minDays: number, dayOfWeek: number): string {
    let date = addLocalDays(localDateOf(new Date(), ZURICH), minDays);
    while (weekday(date) !== dayOfWeek) date = addLocalDays(date, 1);
    return date;
}
/** The next Sunday the clocks go forward in Zurich (last Sunday of March, 02:00 → 03:00). */
function nextSpringForward(): string {
    const today = localDateOf(new Date(), ZURICH);
    for (let year = Number(today.slice(0, 4)); ; year++) {
        let date = `${year}-03-31`;
        while (weekday(date) !== 0) date = addLocalDays(date, -1);
        if (date > addLocalDays(today, 1)) return date;
    }
}
/** A Wednesday a month ahead; Zurich is on UTC+1 or UTC+2, so times are checked through the API's own instants. */
const DATE = localDateAhead(30, 3);

let admin: TestCaller;
let outsider: TestCaller;
let patientCaller: TestCaller;
let otherPatientCaller: TestCaller;
let locationId: string;
let serviceId: string;
let anaId: string;
let benId: string;

const patient = {firstName: "Ada", lastName: "Lovelace", email: "ada@example.com", phone: "+41 79 000 00 00"};
const key = () => `key-${new ObjectId().toString()}`;
const book = (body: Record<string, unknown> = {}) => request(app).post("/api/dentalClinic/clinicStorefront/book").set(callerHeader(admin)).send({
    service: serviceId, location: locationId, practitioner: anaId, date: DATE, time: "09:00", patient, acceptPrivacy: true, idempotencyKey: key(), ...body,
});
const staffBook = (body: Record<string, unknown> = {}) => request(app).put("/api/dentalClinic/appointment").set(callerHeader(admin)).send({
    service: serviceId, location: locationId, practitioner: anaId, date: DATE, time: "09:00", patient, idempotencyKey: key(), ...body,
});
const slots = (body: Record<string, unknown> = {}) => request(app).post("/api/dentalClinic/clinicStorefront/slots").set(callerHeader(admin))
    .send({service: serviceId, location: locationId, practitioner: anaId, fromDate: DATE, days: 1, ...body});
const slotTimes = (response: request.Response, day = 0): string[] => response.body.data.days[day].slots.map((slot: {time: string}) => slot.time);
const action = (name: string, body: Record<string, unknown>, caller: TestCaller = admin) =>
    request(app).post(`/api/dentalClinic/appointment/${name}`).set(callerHeader(caller)).send(body);
const manage = (path: string, body: Record<string, unknown>) =>
    request(app).post(`/api/dentalClinic/clinicStorefront/manage${path}`).set(callerHeader(admin)).send(body);
const timeOff = (body: Record<string, unknown>) => request(app).put("/api/dentalClinic/scheduleException").set(callerHeader(admin)).send(body);
/** The UTC instant the clinic's API gives a local start, read back from a slot listing. */
async function instantOf(date: string, time: string): Promise<string> {
    const listed = await slots({fromDate: date, practitioner: undefined});
    const slot = listed.body.data.days[0].slots.find((entry: {time: string}) => entry.time === time);
    return slot.startAt;
}

beforeAll(async () => {
    await connectTestDatabase();
    await Promise.all([Appointment, Practitioner, ClinicConfig, Patient, ScheduleException].map((model) => model.init()));
    const permissions = allPermissionTags([Appointment, ScheduleException]);
    admin = {userId: new ObjectId().toString(), companyId: companyId.toString(), isAdmin: true, permissions};
    outsider = {...admin, companyId: otherCompanyId.toString()};
    // A signed-in patient: the signup role has no collection permission, only their own appointments.
    patientCaller = {userId: new ObjectId().toString(), companyId: companyId.toString(), isAdmin: false, permissions: []};
    otherPatientCaller = {userId: new ObjectId().toString(), companyId: companyId.toString(), isAdmin: false, permissions: []};
    originCompany.current = {_id: companyId, name: "Smile Clinic"};
    await Company.collection.insertOne({_id: companyId, name: "Smile Clinic", vat: "VAT-1"});
    // The clinic's sign-up role, as every company has from its creation: without it a signed-in patient's first booking
    // builds the whole default role set, about ten seconds (TD-T19).
    await Role.collection.insertOne({name: "Patient", slug: "patient_smile_clinic", company: companyId, isSignupDefault: true, isAdmin: false, permissions: []});
}, 120000);

afterAll(async () => {
    await disconnectTestDatabase();
});

beforeEach(() => asCompany(async () => {
    // Raw collection deletes: the soft-delete plugin would only mark the rows deleted
    await Promise.all([ClinicConfig, ClinicLocation, ClinicService, Practitioner, ScheduleException, Appointment, Patient, Currency]
        .map((model) => model.collection.deleteMany({})));
    mail.sent = [];
    const currency = await Currency.create({name: "Swiss franc", symbol: "CHF", abbreviation: "CHF", decimalPlaces: 2, company: companyId});
    await ClinicConfig.create({
        company: companyId, currency: currency._id, publicBookingEnabled: true, slotIntervalMinutes: 30, minNoticeHours: 0, maxAdvanceDays: 365,
        cancellationDeadlineHours: 24, rescheduleDeadlineHours: 12, noShowGraceMinutes: 15,
    });
    const location = await ClinicLocation.create({
        company: companyId,
        name: "Zurich Centre",
        timezone: ZURICH,
        openingHours: EVERY_DAY.map((dayOfWeek) => ({dayOfWeek, startTime: "08:00", endTime: "18:00"})),
    });
    const service = await ClinicService.create({
        company: companyId, name: "Check-up", slug: "check-up", durationMinutes: 30, bufferAfterMinutes: 15, priceType: "fixed", price: 120,
    });
    const schedule = EVERY_DAY.map((dayOfWeek) => ({location: location._id, dayOfWeek, startTime: "08:00", endTime: "12:00"}));
    const ana = await Practitioner.create({company: companyId, displayName: "Dr. Ana", role: "dentist", services: [service._id], locations: [location._id], schedule});
    const ben = await Practitioner.create({company: companyId, displayName: "Dr. Ben", role: "dentist", services: [service._id], locations: [location._id], schedule});
    locationId = location._id.toString();
    serviceId = service._id.toString();
    anaId = ana._id.toString();
    benId = ben._id.toString();
}));

describe("local dates and times at the clinic (GLB-09)", {timeout: 60000}, () => {
    it("reads a booking's date and time on the location's clock, across the change to summer time", () => asCompany(async () => {
        const sunday = nextSpringForward();
        const saturday = addLocalDays(sunday, -1);
        const listed = await slots({fromDate: saturday, days: 3});
        const firstSlots = listed.body.data.days.map((day: {date: string; slots: {time: string; startAt: string}[]}) => [day.date, day.slots[0].time, day.slots[0].startAt.slice(11)]);
        // 08:00 in Zurich is 07:00 UTC in winter and 06:00 UTC from the Sunday the clocks go forward.
        expect(firstSlots).toEqual([
            [saturday, "08:00", "07:00:00.000Z"],
            [sunday, "08:00", "06:00:00.000Z"],
            [addLocalDays(sunday, 1), "08:00", "06:00:00.000Z"],
        ]);
    }));

    it("refuses a time that does not exist on the clock, and a calendar date that does not exist", () => asCompany(async () => {
        // 02:30 is skipped on the morning the clocks go forward.
        expect((await book({date: nextSpringForward(), time: "02:30"})).body.error_code).toBe("appointment_invalid_time");
        expect((await book({date: `${DATE.slice(0, 4)}-02-30`})).body.error_code).toBe("appointment_invalid_time");
        // Not a local date or a time of day at all (24:00 ends a window, it does not start a visit):
        // refused by the contract before any rule runs.
        expect((await book({date: "09/06/2027"})).status).toBe(400);
        expect((await book({time: "9:00"})).status).toBe(400);
        expect((await book({time: "24:00"})).status).toBe(400);
        expect(await Appointment.countDocuments({})).toBe(0);
    }));

    it("stores the treatment's instant, so the patient's 09:00 is the clinic's 09:00", () => asCompany(async () => {
        const nine = await instantOf(DATE, "09:00");
        const booked = await book();
        expect(booked.status).toBe(200);
        const stored = await Appointment.findById(booked.body.data.appointment._id);
        expect(stored!.startAt.toISOString()).toBe(nine);
        expect(localDateOf(stored!.startAt, ZURICH)).toBe(DATE);
        expect(stored!.snapshot.timezone).toBe(ZURICH);
    }));
});

describe("when online booking is open", {timeout: 60000}, () => {
    it("keeps the clinic's minimum notice and how far ahead patients may book", () => asCompany(async () => {
        await ClinicConfig.updateOne({company: companyId}, {$set: {minNoticeHours: 48, maxAdvanceDays: 60}});
        const tomorrow = addLocalDays(localDateOf(new Date(), ZURICH), 1);
        expect((await book({date: tomorrow, time: "11:00"})).body.error_code).toBe("appointment_too_soon");
        expect((await book({date: addLocalDays(localDateOf(new Date(), ZURICH), 62)})).body.error_code).toBe("appointment_too_far_ahead");
        // Staff are not bound by the online notice, but cannot book in the past.
        expect((await staffBook({date: "2020-01-08"})).body.error_code).toBe("appointment_in_past");
    }));

    it("refuses a dentist who does not do the treatment there", () => asCompany(async () => {
        await Practitioner.updateOne({_id: new ObjectId(benId)}, {$set: {services: []}});
        expect((await book({practitioner: benId})).body.error_code).toBe("appointment_practitioner_not_eligible");
        // Nor can a booking name another company's dentist.
        expect((await book({practitioner: new ObjectId().toString()})).body.error_code).toBe("appointment_practitioner_not_eligible");
    }));
});

describe("time off and closures", {timeout: 60000}, () => {
    it("takes a dentist's time off out of their free times; 'anyone' goes to a colleague", () => asCompany(async () => {
        const nine = await instantOf(DATE, "09:00");
        const ten = await instantOf(DATE, "10:00");
        expect((await timeOff({practitioner: anaId, startAt: nine, endAt: ten})).status).toBe(200);

        // 08:30 would run its clean-up into the time off.
        expect(slotTimes(await slots())).toEqual(["08:00", "10:00", "10:30", "11:00", "11:30"]);
        expect((await book()).body.error_code).toBe("appointment_slot_unavailable");
        const anyone = await book({practitioner: undefined});
        expect(anyone.body.data.appointment.practitionerName).toBe("Dr. Ben");
    }));

    it("blocks every dentist when the whole location is closed for a while", () => asCompany(async () => {
        const lastSlot = await instantOf(DATE, "11:30");
        const noon = new Date(new Date(lastSlot).getTime() + HOUR / 2).toISOString();
        expect((await timeOff({location: locationId, startAt: await instantOf(DATE, "08:00"), endAt: noon})).status).toBe(200);
        expect(slotTimes(await slots({practitioner: undefined}))).toEqual([]);
        expect((await book({practitioner: undefined})).body.error_code).toBe("appointment_no_practitioner_available");
    }));

    it("offers nothing on a closed day, and the day after as usual", () => asCompany(async () => {
        await ClinicLocation.updateOne({_id: new ObjectId(locationId)}, {$set: {closures: [{date: DATE, reason: "Holiday"}]}});
        const listed = await slots({days: 2});
        expect(slotTimes(listed, 0)).toEqual([]);
        expect(slotTimes(listed, 1)).toHaveLength(8);
        expect((await book()).body.error_code).toBe("appointment_slot_unavailable");
    }));

    it("needs exactly one of a dentist or a location, and only this clinic's dentist", () => asCompany(async () => {
        const window = {startAt: await instantOf(DATE, "09:00"), endAt: await instantOf(DATE, "10:00")};
        expect((await timeOff({...window, practitioner: anaId, location: locationId})).body.error_code).toBe("schedule_exception_target_required");
        expect((await timeOff(window)).body.error_code).toBe("schedule_exception_target_required");
        const foreign = await request(app).put("/api/dentalClinic/scheduleException").set(callerHeader(outsider)).send({...window, practitioner: anaId});
        expect(foreign.body.error_code).toBe("practitioner_not_found");
    }));

    it("lets time off cover a cancelled appointment", () => asCompany(async () => {
        const booked = await staffBook();
        expect((await action("cancel", {_id: booked.body._id, reason: "Patient called"})).body.status).toBe("cancelled");
        const created = await timeOff({practitioner: anaId, startAt: await instantOf(DATE, "08:00"), endAt: await instantOf(DATE, "11:00")});
        expect(created.status).toBe(200);
    }));

    it("moves time off only where it clashes with no appointment, and keeps its end after its start", () => asCompany(async () => {
        // Hours on DATE, from its 09:00 slot (instantOf reads free slots, which time off removes).
        const nine = Date.parse(await instantOf(DATE, "09:00"));
        const at = (hour: number) => new Date(nine + (hour - 9) * 3_600_000).toISOString();
        expect((await staffBook()).status).toBe(200);
        const created = await timeOff({practitioner: anaId, startAt: at(13), endAt: at(14)});
        expect(created.status).toBe(200);
        const edit = (body: Record<string, unknown>) => request(app).patch("/api/dentalClinic/scheduleException").set(callerHeader(admin)).send({_id: created.body._id, ...body});

        expect((await edit({startAt: at(8), endAt: at(11)})).body.error_code).toBe("schedule_exception_overlaps_appointments");
        expect((await edit({startAt: at(15), endAt: at(14)})).body.error_code).toBe("form_not_correct");

        const moved = await edit({startAt: at(14), endAt: at(17), reason: "training"});
        expect(moved.status).toBe(200);
        const stored = await ScheduleException.findById(created.body._id);
        expect(stored!.startAt.toISOString()).toBe(at(14));
        expect(stored!.reason).toBe("training");
    }));
});

// TD-B235: the picker list answered 500, since its label (the start) was not read. TD-B242: the label was a raw UTC
// timestamp; it names the dentist and the local start in the clinic's zone.
describe("time off picker", {timeout: 60000}, () => {
    it("lists time off newest first, labelled with the dentist and local start, and finds one by its note", () => asCompany(async () => {
        const nine = await instantOf(DATE, "09:00");
        const ten = await instantOf(DATE, "10:00");
        const eleven = await instantOf(DATE, "11:00");
        expect((await timeOff({practitioner: anaId, startAt: nine, endAt: ten, internalNote: "Dentist congress"})).status).toBe(200);
        expect((await timeOff({practitioner: anaId, startAt: ten, endAt: eleven})).status).toBe(200);
        const select = (body: Record<string, unknown>) => request(app).post("/api/dentalClinic/scheduleException/select").set(callerHeader(admin)).send({page: 1, limit: 10, ...body});

        const all = await select({});
        expect(all.status).toBe(200);
        expect(all.body.data.map((option: {label: string}) => option.label)).toEqual([`Dr. Ana · ${DATE} 10:00`, `Dr. Ana · ${DATE} 09:00`]);
        expect((await select({name: "congress"})).body.data.map((option: {label: string}) => option.label)).toEqual([`Dr. Ana · ${DATE} 09:00`]);
    }));
});

describe("the panel's day view (P8.6)", {timeout: 60000}, () => {
    const dayView = (body: Record<string, unknown>) => request(app).post("/api/dentalClinic/clinicDay/view").set(callerHeader(admin)).send(body);

    it("lays out every active location when none is picked, with its opening hours, its dentists and the booking grid", () => asCompany(async () => {
        const second = await ClinicLocation.create({company: companyId, name: "Zurich West", timezone: ZURICH, openingHours: [], isActive: true});
        await ClinicLocation.create({company: companyId, name: "Closed branch", timezone: ZURICH, openingHours: [], isActive: false});
        expect((await staffBook()).status).toBe(200);

        const all = await dayView({date: DATE});
        expect(all.status).toBe(200);
        expect(all.body.data.slotIntervalMinutes).toBe(30);
        expect(all.body.data.locations.map((entry: {name: string}) => entry.name).sort()).toEqual(["Zurich Centre", "Zurich West"]);
        const centre = all.body.data.locations.find((entry: {_id: string}) => entry._id === locationId);
        expect(centre.opening).toHaveLength(1);
        expect(centre.practitioners.map((p: {displayName: string}) => p.displayName).sort()).toEqual(["Dr. Ana", "Dr. Ben"]);
        expect(all.body.data.locations.find((entry: {_id: string}) => entry._id === second._id.toString()).practitioners).toEqual([]);
        expect(all.body.data.appointments).toEqual([expect.objectContaining({locationId, practitionerId: anaId, serviceId})]);
        // Each dentist says which treatments they do, so a drag can tell whether they could take the appointment.
        expect(centre.practitioners.map((p: {serviceIds: string[]}) => p.serviceIds)).toEqual([[serviceId], [serviceId]]);

        const one = await dayView({date: DATE, location: locationId});
        expect(one.body.data.locations.map((entry: {_id: string}) => entry._id)).toEqual([locationId]);
    }));
});

describe("moving an appointment", {timeout: 60000}, () => {
    it("lets the patient move it into its own old window, keeping the dentist", () => asCompany(async () => {
        const {body} = await book();
        // 09:30 overlaps the 09:00 booking's clean-up; the booking does not block itself.
        const moved = await manage("/reschedule", {token: body.data.manageToken, date: DATE, time: "09:30"});
        expect(moved.status).toBe(200);
        const stored = await Appointment.findById(body.data.appointment._id);
        expect(String(stored!.practitioner)).toBe(anaId);
        expect(stored!.rescheduleCount).toBe(1);
        // The history reads the location's clock, the date once when the day stays the same.
        expect(stored!.timeline.at(-1)).toMatchObject({event: "rescheduled", note: `${DATE} 09:00 → 09:30`});
        expect(mail.sent.at(-1)).toMatchObject({kind: "rescheduled"});
    }));

    it("does not hand the patient to another dentist when theirs is busy", () => asCompany(async () => {
        const {body} = await book();
        await book({time: "10:00", patient: {...patient, email: "bob@example.com", firstName: "Bob"}});
        const refused = await manage("/reschedule", {token: body.data.manageToken, date: DATE, time: "10:00"});
        expect(refused.body.error_code).toBe("appointment_slot_unavailable");
        const stored = await Appointment.findById(body.data.appointment._id);
        expect(stored!.startAt.toISOString()).toBe(body.data.appointment.startAt);
        expect(stored!.rescheduleCount).toBe(0);
    }));

    it("refuses a patient's move after the reschedule deadline the booking was made with", () => asCompany(async () => {
        const {body} = await book();
        // The clinic shortens its deadline later; the patient keeps the 12 hours they booked under.
        await ClinicConfig.updateOne({company: companyId}, {$set: {rescheduleDeadlineHours: 1}});
        await Appointment.updateOne({}, {$set: {startAt: new Date(Date.now() + 3 * HOUR)}});
        const refused = await manage("/reschedule", {token: body.data.manageToken, date: DATE, time: "10:30"});
        expect(refused.body.error_code).toBe("appointment_reschedule_deadline_passed");
        expect(refused.body.message).toContain("12");
    }));

    it("lets staff move it to another dentist, freeing the old time and asking for a new reminder", () => asCompany(async () => {
        const booked = await staffBook();
        await Appointment.updateOne({_id: new ObjectId(booked.body._id)}, {$set: {reminderSentAt: new Date()}});
        const moved = await action("reschedule", {_id: booked.body._id, date: DATE, time: "10:00", practitioner: benId});
        expect(moved.status).toBe(200);
        const stored = await Appointment.findById(booked.body._id);
        expect(String(stored!.practitioner)).toBe(benId);
        expect(stored!.snapshot.practitionerName).toBe("Dr. Ben");
        expect(stored!.reminderSentAt).toBeUndefined();
        expect(stored!.manageTokenVersion).toBe(2);
        expect(slotTimes(await slots())).toContain("09:00");
    }));
});

describe("cancelling and closing", {timeout: 60000}, () => {
    it("keeps the cancellation deadline the patient booked under, while staff may cancel any time", () => asCompany(async () => {
        const {body} = await book();
        await ClinicConfig.updateOne({company: companyId}, {$set: {cancellationDeadlineHours: 1}});
        await Appointment.updateOne({}, {$set: {startAt: new Date(Date.now() + 3 * HOUR)}});
        expect((await manage("/cancel", {token: body.data.manageToken})).body.error_code).toBe("appointment_cancel_deadline_passed");

        const cancelled = await action("cancel", {_id: body.data.appointment._id, reason: "Dentist ill"});
        expect(cancelled.body).toMatchObject({status: "cancelled"});
        const stored = await Appointment.findById(body.data.appointment._id);
        expect(stored).toMatchObject({cancelledBy: "staff", cancellationReason: "Dentist ill"});
        expect((await action("cancel", {_id: body.data.appointment._id})).body.error_code).toBe("appointment_invalid_status");
        expect((await action("reschedule", {_id: body.data.appointment._id, date: DATE, time: "10:00"})).body.error_code).toBe("appointment_invalid_status");
        expect((await action("confirm", {_id: body.data.appointment._id})).body.error_code).toBe("appointment_invalid_status");
    }));

    it("closes a visit as completed only once it has started, and as missed only after the grace period", () => asCompany(async () => {
        const first = await staffBook();
        const second = await staffBook({time: "10:00"});
        expect((await action("complete", {_id: first.body._id})).body.error_code).toBe("appointment_too_early_to_close");

        await Appointment.updateOne({_id: new ObjectId(first.body._id)}, {$set: {startAt: new Date(Date.now() - 60000)}});
        expect((await action("complete", {_id: first.body._id})).body.status).toBe("completed");
        expect((await action("cancel", {_id: first.body._id})).body.error_code).toBe("appointment_invalid_status");

        // Grace is 15 minutes.
        await Appointment.updateOne({_id: new ObjectId(second.body._id)}, {$set: {startAt: new Date(Date.now() - 10 * 60000)}});
        expect((await action("noShow", {_id: second.body._id})).body.error_code).toBe("appointment_too_early_to_close");
        await Appointment.updateOne({_id: new ObjectId(second.body._id)}, {$set: {startAt: new Date(Date.now() - 20 * 60000)}});
        expect((await action("noShow", {_id: second.body._id})).body.status).toBe("no_show");
    }));

    it("lets a signed-in patient cancel their own appointment and nobody else's", () => asCompany(async () => {
        const own = await staffBook({customer: patientCaller.userId});
        const cancel = (caller: TestCaller) => request(app).post("/api/dentalClinic/myAppointment/cancel").set(callerHeader(caller)).send({_id: own.body._id});

        expect((await cancel(otherPatientCaller)).body.error_code).toBe("appointment_not_found");
        const listed = await request(app).post("/api/dentalClinic/myAppointment/list").set(callerHeader(otherPatientCaller)).send({});
        expect(listed.body.data).toEqual([]);

        const cancelled = await cancel(patientCaller);
        expect(cancelled.body.data.status).toBe("cancelled");
        expect(await Appointment.findById(own.body._id)).toMatchObject({cancelledBy: "patient", status: "cancelled"});
    }));
});
