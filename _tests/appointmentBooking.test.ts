import {afterAll, beforeAll, beforeEach, describe, expect, it, vi} from "vitest";
import {MongoMemoryReplSet} from "mongodb-memory-server";
import mongoose from "mongoose";
import {ObjectId} from "mongodb";
import request from "supertest";

vi.mock("@coreModule/utilities/middlewares/authMW", async () =>
    (await import("@coreModule/_tests/httpHarness")).authMWStub);
// No Redis in tests; the public routes' limiter fails closed without it.
vi.mock("@coreModule/utilities/middlewares/rateLimiter", () => ({
    rateLimiter: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));
const {originCompany} = vi.hoisted(() => ({originCompany: {current: null as unknown}}));
vi.mock("@coreModule/utilities/marketing/resolveCompanyByOrigin", () => ({
    resolveCompanyByOrigin: async () => originCompany.current,
}));
const {mail} = vi.hoisted(() => ({mail: {sent: [] as {kind: string; serviceName?: string}[]}}));
vi.mock("@dentalClinicModule/utilities/emails/sendPatientMail", () => ({
    sendPatientMail: vi.fn(async (message: {kind: string; serviceName?: string}) => {
        mail.sent.push(message);
    }),
    patientSmsText: () => "",
}));

import {allPermissionTags, appFor, callerHeader, type TestCaller} from "@coreModule/_tests/httpHarness";
import Currency from "@coreModule/database/schemas/currency/currency";
import * as appointmentRoute from "@dentalClinicModule/api/dentalClinic/private/appointment";
import * as scheduleExceptionRoute from "@dentalClinicModule/api/dentalClinic/private/scheduleException";
import * as storefrontRoute from "@dentalClinicModule/api/dentalClinic/public/clinicStorefront";
import ClinicConfig from "@dentalClinicModule/database/schemas/clinicConfig/clinicConfig";
import ClinicLocation from "@dentalClinicModule/database/schemas/clinicLocation/clinicLocation";
import ClinicService from "@dentalClinicModule/database/schemas/clinicService/clinicService";
import Practitioner from "@dentalClinicModule/database/schemas/practitioner/practitioner";
import ScheduleException from "@dentalClinicModule/database/schemas/scheduleException/scheduleException";
import Appointment from "@dentalClinicModule/database/schemas/appointment/appointment";
import {runAppointmentRetention} from "@dentalClinicModule/utilities/cronJobs/appointmentRetentionJob";

// Transactions need a replica set; WiredTiger so concurrent requests really conflict
let replSet: MongoMemoryReplSet;
const companyId = new ObjectId();
const otherCompanyId = new ObjectId();
const adminId = new ObjectId();
const dentistUserId = new ObjectId();
const app = appFor([appointmentRoute, scheduleExceptionRoute, storefrontRoute]);

let admin: TestCaller;
let outsider: TestCaller;
let dentist: TestCaller;
let locationId: string;
let serviceId: string;
let anaId: string;
let benId: string;

const WEEKDAYS = [1, 2, 3, 4, 5];
/** Wednesday 9 June 2027, Zurich summer time (UTC+2). */
const DATE = "2027-06-09";
const patient = {firstName: "Ada", lastName: "Lovelace", email: "ada@example.com", phone: "+41 79 000 00 00"};
const book = (body: Record<string, unknown> = {}) => request(app).post("/api/dentalClinic/clinicStorefront/book").set(callerHeader(admin)).send({
    service: serviceId,
    location: locationId,
    practitioner: anaId,
    date: DATE,
    time: "09:00",
    patient,
    acceptPrivacy: true,
    idempotencyKey: `key-${new ObjectId().toString()}`,
    ...body,
});
const manage = (path: string, body: Record<string, unknown>) =>
    request(app).post(`/api/dentalClinic/clinicStorefront/manage${path}`).set(callerHeader(admin)).send(body);

beforeAll(async () => {
    replSet = await MongoMemoryReplSet.create({replSet: {count: 1, storageEngine: "wiredTiger"}});
    await mongoose.connect(replSet.getUri());
    await Promise.all([Appointment.init(), Practitioner.init(), ClinicConfig.init()]);
    const permissions = allPermissionTags([Appointment, ScheduleException]);
    admin = {userId: adminId.toString(), companyId: companyId.toString(), isAdmin: true, permissions};
    outsider = {...admin, companyId: otherCompanyId.toString()};
    dentist = {userId: dentistUserId.toString(), companyId: companyId.toString(), isAdmin: false, permissions};
    originCompany.current = {_id: companyId, name: "Smile Clinic"};
}, 120000);

afterAll(async () => {
    await mongoose.disconnect();
    await replSet.stop();
});

beforeEach(async () => {
    // Raw collection deletes: the soft-delete plugin would only mark the rows deleted
    await Promise.all([ClinicConfig, ClinicLocation, ClinicService, Practitioner, ScheduleException, Appointment, Currency]
        .map((model) => model.collection.deleteMany({})));
    mail.sent = [];
    const currency = await Currency.create({name: "Swiss franc", symbol: "CHF", abbreviation: "CHF", decimalPlaces: 2, company: companyId});
    await ClinicConfig.create({company: companyId, currency: currency._id, publicBookingEnabled: true, slotIntervalMinutes: 30, cancellationDeadlineHours: 24, maxAdvanceDays: 365});
    const location = await ClinicLocation.create({
        company: companyId,
        name: "Zurich Centre",
        timezone: "Europe/Zurich",
        openingHours: WEEKDAYS.map((dayOfWeek) => ({dayOfWeek, startTime: "08:00", endTime: "18:00"})),
    });
    const service = await ClinicService.create({
        company: companyId, name: "Check-up", slug: "check-up", durationMinutes: 30, bufferAfterMinutes: 15, priceType: "fixed", price: 120,
    });
    const schedule = WEEKDAYS.map((dayOfWeek) => ({location: location._id, dayOfWeek, startTime: "08:00", endTime: "12:00"}));
    const ana = await Practitioner.create({
        company: companyId, displayName: "Dr. Ana", role: "dentist", staffUser: dentistUserId, services: [service._id], locations: [location._id], schedule,
    });
    const ben = await Practitioner.create({
        company: companyId, displayName: "Dr. Ben", role: "dentist", services: [service._id], locations: [location._id], schedule,
    });
    locationId = location._id.toString();
    serviceId = service._id.toString();
    anaId = ana._id.toString();
    benId = ben._id.toString();
});

describe("booking an appointment", {timeout: 60000}, () => {
    it("confirms a booking with the treatment time, the busy window and a snapshot", async () => {
        const response = await book();
        expect(response.status).toBe(200);
        expect(response.body.data.appointment).toMatchObject({status: "confirmed", serviceName: "Check-up", practitionerName: "Dr. Ana", price: 120});
        expect(response.body.data.manageToken).toBeTruthy();

        const stored = await Appointment.findOne({});
        expect(stored!.startAt.toISOString()).toBe("2027-06-09T07:00:00.000Z");
        expect(stored!.endAt.toISOString()).toBe("2027-06-09T07:30:00.000Z");
        expect(stored!.blockedEnd.toISOString()).toBe("2027-06-09T07:45:00.000Z");
        expect(stored!.consent?.at).toBeInstanceOf(Date);
        // Messages leave the treatment out unless the clinic opts in
        expect(mail.sent).toEqual([expect.objectContaining({kind: "confirmed", serviceName: undefined})]);
    });

    it("books one dentist's slot exactly once when three patients try at the same moment", async () => {
        const responses = await Promise.all([book(), book(), book()]);
        expect(responses.map((response) => response.status).sort()).toEqual([200, 409, 409]);
        // A loser either sees the winner's appointment or runs out of retries while the winner commits
        for (const failed of responses.filter((response) => response.status === 409)) {
            expect(["appointment_slot_unavailable", "concurrent_request_retry"]).toContain(failed.body.error_code);
        }
        expect(await Appointment.countDocuments({})).toBe(1);
    });

    it("gives 'anyone' bookings to different dentists until nobody is free", async () => {
        const [first, second] = await Promise.all([book({practitioner: undefined}), book({practitioner: undefined})]);
        expect([first.status, second.status]).toEqual([200, 200]);
        const names = [first.body.data.appointment.practitionerName, second.body.data.appointment.practitionerName].sort();
        expect(names).toEqual(["Dr. Ana", "Dr. Ben"]);
        expect((await book({practitioner: undefined})).body.error_code).toBe("appointment_no_practitioner_available");
    });

    it("keeps the clean-up buffer free and only offers grid times online", async () => {
        expect((await book()).status).toBe(200);
        // 09:00 + 30 min + 15 min clean-up: 09:30 is taken, 10:00 is free
        expect((await book({time: "09:30"})).body.error_code).toBe("appointment_slot_unavailable");
        expect((await book({time: "10:00"})).status).toBe(200);
        expect((await book({time: "10:10"})).body.error_code).toBe("appointment_slot_unavailable");
    });

    it("lists free times per day and leaves out booked ones", async () => {
        await book();
        const {body} = await request(app).post("/api/dentalClinic/clinicStorefront/slots").set(callerHeader(admin))
            .send({service: serviceId, location: locationId, practitioner: anaId, fromDate: DATE, days: 1});
        expect(body.data.timezone).toBe("Europe/Zurich");
        // 08:30 would run its clean-up into the 09:00 appointment; 09:00 and 09:30 are taken
        expect(body.data.days[0].slots.map((slot: {time: string}) => slot.time)).toEqual(["08:00", "10:00", "10:30", "11:00", "11:30"]);
    });

    it("returns the same appointment for a retried request", async () => {
        const idempotencyKey = `key-${new ObjectId().toString()}`;
        const first = await book({idempotencyKey});
        const second = await book({idempotencyKey});
        expect(second.body.data.appointment._id).toBe(first.body.data.appointment._id);
        expect(await Appointment.countDocuments({})).toBe(1);
    });

    it("waits for the clinic when it reviews online bookings", async () => {
        await ClinicConfig.updateOne({company: companyId}, {$set: {requireStaffConfirmation: true}});
        const {body} = await book();
        expect(body.data.appointment.status).toBe("pending");
        expect(mail.sent[0].kind).toBe("requested");
        const confirmed = await request(app).post("/api/dentalClinic/appointment/confirm").set(callerHeader(admin)).send({_id: body.data.appointment._id});
        expect(confirmed.body.status).toBe("confirmed");
    });

    it("refuses bookings without privacy consent, and before public booking is on", async () => {
        expect((await book({acceptPrivacy: false})).body.error_code).toBe("appointment_privacy_not_accepted");
        await ClinicConfig.updateOne({company: companyId}, {$set: {publicBookingEnabled: false}});
        expect((await book()).body.error_code).toBe("dental_clinic_not_configured");
    });
});

describe("the patient's manage link", {timeout: 60000}, () => {
    it("moves the appointment, invalidating the old link, then cancels it", async () => {
        const {body} = await book();
        const oldToken = body.data.manageToken;
        const moved = await manage("/reschedule", {token: oldToken, date: DATE, time: "10:30"});
        expect(moved.status).toBe(200);
        expect(moved.body.data.appointment.startAt).toBe("2027-06-09T08:30:00.000Z");

        expect((await manage("", {token: oldToken})).body.error_code).toBe("token_verification_failed");
        const cancelled = await manage("/cancel", {token: moved.body.data.manageToken});
        expect(cancelled.body.data.status).toBe("cancelled");
        // The freed time can be booked again
        expect((await book({time: "10:30"})).status).toBe(200);
    });

    it("refuses an online cancellation after the deadline", async () => {
        const {body} = await book();
        await Appointment.updateOne({}, {$set: {startAt: new Date(Date.now() + 3600 * 1000)}});
        const response = await manage("/cancel", {token: body.data.manageToken});
        expect(response.body.error_code).toBe("appointment_cancel_deadline_passed");
    });
});

describe("staff and dentists", {timeout: 60000}, () => {
    it("never shows one company's appointment to another", async () => {
        const {body} = await book();
        const id = body.data.appointment._id;
        expect((await request(app).post("/api/dentalClinic/appointment/single").set(callerHeader(admin)).send({_id: id})).status).toBe(200);
        expect((await request(app).post("/api/dentalClinic/appointment/single").set(callerHeader(outsider)).send({_id: id})).status).not.toBe(200);
        const foreignCancel = await request(app).post("/api/dentalClinic/appointment/cancel").set(callerHeader(outsider)).send({_id: id});
        expect(foreignCancel.body.error_code).toBe("appointment_not_found");
    });

    it("shows a linked dentist only their own appointments", async () => {
        const own = await book();
        const other = await book({practitioner: benId});
        const list = await request(app).post("/api/dentalClinic/appointment").set(callerHeader(dentist)).send({limit: 20, offset: 0});
        expect(list.body.data.map((row: {_id: string}) => row._id)).toEqual([own.body.data.appointment._id]);
        const foreign = await request(app).post("/api/dentalClinic/appointment/cancel").set(callerHeader(dentist)).send({_id: other.body.data.appointment._id});
        expect(foreign.body.error_code).toBe("user_permissions_not_sufficient");
    });

    it("lets staff book off the grid but refuses time off over an appointment", async () => {
        const staff = await request(app).put("/api/dentalClinic/appointment").set(callerHeader(admin)).send({
            service: serviceId, location: locationId, practitioner: anaId, date: DATE, time: "09:10", patient, idempotencyKey: `key-${new ObjectId().toString()}`,
        });
        expect(staff.status).toBe(200);
        expect(staff.body.source).toBe("staff");

        const timeOff = await request(app).put("/api/dentalClinic/scheduleException").set(callerHeader(admin)).send({
            practitioner: anaId, startAt: "2027-06-09T06:00:00.000Z", endAt: "2027-06-09T10:00:00.000Z",
        });
        expect(timeOff.body.error_code).toBe("schedule_exception_overlaps_appointments");
    });

    it("removes patient details once the retention period has passed", async () => {
        await book();
        const longAgo = new Date(Date.now() - 30 * 31 * 24 * 3600 * 1000);
        await Appointment.updateOne({}, {$set: {status: "completed", startAt: longAgo, endAt: longAgo}});
        await runAppointmentRetention(companyId);
        const stored = await Appointment.findOne({});
        expect(stored!.anonymizedAt).toBeInstanceOf(Date);
        expect(stored!.patient.email).toBe("—");
        expect(stored!.timeline.at(-1)?.event).toBe("anonymized");
    });
});
