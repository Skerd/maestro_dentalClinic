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
const {mail} = vi.hoisted(() => ({mail: {sent: [] as {kind: string; serviceName?: string; languageCode?: string}[]}}));
vi.mock("@dentalClinicModule/utilities/emails/sendPatientMail", () => ({
    sendPatientMail: vi.fn(async (message: {kind: string; serviceName?: string; languageCode?: string}) => {
        mail.sent.push(message);
    }),
    patientSmsText: () => "",
}));

import {allPermissionTags, appFor, callerHeader, type TestCaller} from "@coreModule/_tests/httpHarness";
import Company from "@coreModule/database/schemas/company/company";
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
import Patient from "@dentalClinicModule/database/schemas/patient/patient";
import {runAppointmentRetention} from "@dentalClinicModule/utilities/cronJobs/appointmentRetentionJob";
import {withTenant} from "@coreModule/utilities/endpoints/tenantScope";

const companyId = new ObjectId();
/** The tests act on this company's data, as its requests and jobs do (D16). */
const asCompany = <T>(fn: () => PromiseLike<T>): Promise<T> => withTenant(companyId, fn);
const otherCompanyId = new ObjectId();
const adminId = new ObjectId();
const dentistUserId = new ObjectId();
// dentalClinic routes run with tenant scoping enforced (D16), as in the dev profiles.
const app = appFor([appointmentRoute, scheduleExceptionRoute, storefrontRoute].map((route) => ({...route, module: "dentalClinic"})));

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
    await connectTestDatabase();
    await Promise.all([Appointment.init(), Practitioner.init(), ClinicConfig.init(), Patient.init()]);
    const permissions = allPermissionTags([Appointment, ScheduleException]);
    admin = {userId: adminId.toString(), companyId: companyId.toString(), isAdmin: true, permissions};
    outsider = {...admin, companyId: otherCompanyId.toString()};
    dentist = {userId: dentistUserId.toString(), companyId: companyId.toString(), isAdmin: false, permissions};
    originCompany.current = {_id: companyId, name: "Smile Clinic"};
    // Patient messages look the clinic's company up (name, site slug) after commit.
    await Company.collection.insertOne({_id: companyId, name: "Smile Clinic", vat: "VAT-1"});
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
}));

describe("booking an appointment", {timeout: 60000}, () => {
    it("confirms a booking with the treatment time, the busy window and a snapshot", () => asCompany(async () => {
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
    }));

    it("books one dentist's slot exactly once when three patients try at the same moment", () => asCompany(async () => {
        const responses = await Promise.all([book(), book(), book()]);
        expect(responses.map((response) => response.status).sort()).toEqual([200, 409, 409]);
        // A loser either sees the winner's appointment or runs out of retries while the winner commits
        for (const failed of responses.filter((response) => response.status === 409)) {
            expect(["appointment_slot_unavailable", "concurrent_request_retry"]).toContain(failed.body.error_code);
        }
        expect(await Appointment.countDocuments({})).toBe(1);
    }));

    it("gives 'anyone' bookings to different dentists until nobody is free", () => asCompany(async () => {
        // Under load one of two simultaneous bookings can run out of transaction retries (TD-B124); a client sends it again.
        const retryIfConflicted = async (response: Awaited<ReturnType<typeof book>>) =>
            response.body.error_code === "concurrent_request_retry" ? book({practitioner: undefined}) : response;
        const [first, second] = await Promise.all([book({practitioner: undefined}), book({practitioner: undefined})].map(async (call) => retryIfConflicted(await call)));
        expect([first.status, second.status]).toEqual([200, 200]);
        const names = [first.body.data.appointment.practitionerName, second.body.data.appointment.practitionerName].sort();
        expect(names).toEqual(["Dr. Ana", "Dr. Ben"]);
        expect((await book({practitioner: undefined})).body.error_code).toBe("appointment_no_practitioner_available");
    }));

    it("keeps the clean-up buffer free and only offers grid times online", () => asCompany(async () => {
        expect((await book()).status).toBe(200);
        // 09:00 + 30 min + 15 min clean-up: 09:30 is taken, 10:00 is free
        expect((await book({time: "09:30"})).body.error_code).toBe("appointment_slot_unavailable");
        expect((await book({time: "10:00"})).status).toBe(200);
        expect((await book({time: "10:10"})).body.error_code).toBe("appointment_slot_unavailable");
    }));

    it("lists free times per day and leaves out booked ones", () => asCompany(async () => {
        await book();
        const {body} = await request(app).post("/api/dentalClinic/clinicStorefront/slots").set(callerHeader(admin))
            .send({service: serviceId, location: locationId, practitioner: anaId, fromDate: DATE, days: 1});
        expect(body.data.timezone).toBe("Europe/Zurich");
        // 08:30 would run its clean-up into the 09:00 appointment; 09:00 and 09:30 are taken
        expect(body.data.days[0].slots.map((slot: {time: string}) => slot.time)).toEqual(["08:00", "10:00", "10:30", "11:00", "11:30"]);
    }));

    it("returns the same appointment for a retried request", () => asCompany(async () => {
        const idempotencyKey = `key-${new ObjectId().toString()}`;
        const first = await book({idempotencyKey});
        const second = await book({idempotencyKey});
        expect(second.body.data.appointment._id).toBe(first.body.data.appointment._id);
        expect(await Appointment.countDocuments({})).toBe(1);
    }));

    it("waits for the clinic when it reviews online bookings", () => asCompany(async () => {
        await ClinicConfig.updateOne({company: companyId}, {$set: {requireStaffConfirmation: true}});
        const {body} = await book();
        expect(body.data.appointment.status).toBe("pending");
        expect(mail.sent[0].kind).toBe("requested");
        // A role that can see appointments but not confirm them is stopped before the action (D14).
        const viewer: TestCaller = {...admin, isAdmin: false, permissions: admin.permissions!.filter((tag) => !tag.includes("[action:"))};
        const refused = await request(app).post("/api/dentalClinic/appointment/confirm").set(callerHeader(viewer)).send({_id: body.data.appointment._id});
        expect(refused.body.error_code).toBe("user_permissions_not_sufficient");
        const confirmed = await request(app).post("/api/dentalClinic/appointment/confirm").set(callerHeader(admin)).send({_id: body.data.appointment._id});
        expect(confirmed.body.status).toBe("confirmed");
    }));

    it("refuses bookings without privacy consent, and before public booking is on", () => asCompany(async () => {
        expect((await book({acceptPrivacy: false})).body.error_code).toBe("appointment_privacy_not_accepted");
        await ClinicConfig.updateOne({company: companyId}, {$set: {publicBookingEnabled: false}});
        expect((await book()).body.error_code).toBe("dental_clinic_not_configured");
    }));
});

describe("the patient's manage link", {timeout: 60000}, () => {
    it("moves the appointment, invalidating the old link, then cancels it", () => asCompany(async () => {
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
    }));

    it("refuses an online cancellation after the deadline", () => asCompany(async () => {
        const {body} = await book();
        await Appointment.updateOne({}, {$set: {startAt: new Date(Date.now() + 3600 * 1000)}});
        const response = await manage("/cancel", {token: body.data.manageToken});
        expect(response.body.error_code).toBe("appointment_cancel_deadline_passed");
    }));
});

describe("staff and dentists", {timeout: 60000}, () => {
    it("never shows one company's appointment to another", () => asCompany(async () => {
        const {body} = await book();
        const id = body.data.appointment._id;
        expect((await request(app).post("/api/dentalClinic/appointment/single").set(callerHeader(admin)).send({_id: id})).status).toBe(200);
        expect((await request(app).post("/api/dentalClinic/appointment/single").set(callerHeader(outsider)).send({_id: id})).status).not.toBe(200);
        const foreignCancel = await request(app).post("/api/dentalClinic/appointment/cancel").set(callerHeader(outsider)).send({_id: id});
        expect(foreignCancel.body.error_code).toBe("appointment_not_found");
    }));

    it("shows a linked dentist only their own appointments", () => asCompany(async () => {
        const own = await book();
        const other = await book({practitioner: benId});
        const list = await request(app).post("/api/dentalClinic/appointment").set(callerHeader(dentist)).send({limit: 20, offset: 0});
        expect(list.body.data.map((row: {_id: string}) => row._id)).toEqual([own.body.data.appointment._id]);
        const foreign = await request(app).post("/api/dentalClinic/appointment/cancel").set(callerHeader(dentist)).send({_id: other.body.data.appointment._id});
        expect(foreign.body.error_code).toBe("user_permissions_not_sufficient");
    }));

    it("lets staff book off the grid but refuses time off over an appointment", () => asCompany(async () => {
        const staff = await request(app).put("/api/dentalClinic/appointment").set(callerHeader(admin)).send({
            service: serviceId, location: locationId, practitioner: anaId, date: DATE, time: "09:10", patient, idempotencyKey: `key-${new ObjectId().toString()}`,
        });
        expect(staff.status).toBe(200);
        expect(staff.body.source).toBe("staff");

        const timeOff = await request(app).put("/api/dentalClinic/scheduleException").set(callerHeader(admin)).send({
            practitioner: anaId, startAt: "2027-06-09T06:00:00.000Z", endAt: "2027-06-09T10:00:00.000Z",
        });
        expect(timeOff.body.error_code).toBe("schedule_exception_overlaps_appointments");
    }));

    it("removes patient details once the retention period has passed", () => asCompany(async () => {
        await book();
        const longAgo = new Date(Date.now() - 30 * 31 * 24 * 3600 * 1000);
        await Appointment.updateOne({}, {$set: {status: "completed", startAt: longAgo, endAt: longAgo}});
        await runAppointmentRetention(companyId);
        const stored = await Appointment.findOne({});
        expect(stored!.anonymizedAt).toBeInstanceOf(Date);
        expect(stored!.patient.email).toBe("—");
        expect(stored!.timeline.at(-1)?.event).toBe("anonymized");
    }));
});

describe("patient folders", {timeout: 60000}, () => {
    it("files a returning patient's bookings in one folder, and a namesake's email user in their own", () => asCompany(async () => {
        await book({time: "09:00"});
        await book({time: "10:00", patient: {...patient, email: "ADA@example.com", lastName: "lovelace"}});
        await book({time: "11:00", patient: {...patient, firstName: "Byron"}});

        const folders = await Patient.find({company: companyId}).sort({firstName: 1});
        expect(folders.map((folder) => folder.firstName)).toEqual(["Ada", "Byron"]);
        expect(folders[0].source).toBe("booking");
        const ada = await Appointment.find({patientRecord: folders[0]._id});
        expect(ada).toHaveLength(2);
    }));

    it("lets staff book into an existing folder, but only one of their own clinic", () => asCompany(async () => {
        const folder = await Patient.create({company: companyId, number: "PT-1", firstName: "Ada", lastName: "Lovelace", email: patient.email, phone: patient.phone, preferredLanguage: "it-IT", source: "phone"});
        const foreign = await withTenant(otherCompanyId, () => Patient.create({company: otherCompanyId, number: "PT-2", firstName: "Eve", lastName: "Other", preferredLanguage: "en-US", source: "phone"}));
        const staffBook = (patientRecord: string, time: string) => request(app).put("/api/dentalClinic/appointment").set(callerHeader(admin)).send({
            service: serviceId, location: locationId, practitioner: anaId, date: DATE, time, patient, patientRecord, idempotencyKey: `key-${new ObjectId().toString()}`,
        });

        const refused = await staffBook(foreign._id.toString(), "09:00");
        expect(refused.body.error_code).toBe("patient_not_found");

        const booked = await staffBook(folder._id.toString(), "09:00");
        expect(booked.status).toBe(200);
        const stored = await Appointment.findById(booked.body._id);
        expect(String(stored!.patientRecord)).toBe(folder._id.toString());
        expect(await Patient.countDocuments({company: companyId})).toBe(1);
    }));

    it("confirms a staff booking in the patient's language, not the staff member's (FE-08)", () => asCompany(async () => {
        const folder = await Patient.create({company: companyId, number: "PT-1", firstName: "Ada", lastName: "Lovelace", email: patient.email, phone: patient.phone, preferredLanguage: "sq-AL", source: "phone"});

        // The staff member's request is in en-US (the auth stub's language).
        const booked = await request(app).put("/api/dentalClinic/appointment").set(callerHeader(admin)).send({
            service: serviceId, location: locationId, practitioner: anaId, date: DATE, time: "09:00", patient,
            patientRecord: folder._id.toString(), idempotencyKey: `key-${new ObjectId().toString()}`,
        });

        expect(booked.status).toBe(200);
        expect(mail.sent).toEqual([expect.objectContaining({kind: "confirmed", languageCode: "sq-AL"})]);
    }));

    it("books a picked folder with the folder's contact, and refuses a folder that has no email or phone (UX-05)", () => asCompany(async () => {
        const complete = await Patient.create({company: companyId, number: "PT-1", firstName: "Ada", lastName: "Lovelace", email: "folder@example.com", phone: "+355 69 000 0000", preferredLanguage: "en-US", source: "phone"});
        const incomplete = await Patient.create({company: companyId, number: "PT-2", firstName: "Bo", lastName: "Noemail", preferredLanguage: "en-US", source: "phone"});
        const staffBook = (patientRecord: string, time: string) => request(app).put("/api/dentalClinic/appointment").set(callerHeader(admin)).send({
            service: serviceId, location: locationId, practitioner: anaId, date: DATE, time, patientRecord, idempotencyKey: `key-${new ObjectId().toString()}`,
        });

        const refused = await staffBook(incomplete._id.toString(), "09:00");
        expect(refused.body.error_code).toBe("appointment_patient_folder_incomplete");

        const booked = await staffBook(complete._id.toString(), "09:00");
        expect(booked.status).toBe(200);
        const stored = await Appointment.findById(booked.body._id);
        expect(stored!.patient.email).toBe("folder@example.com");
    }));
});
