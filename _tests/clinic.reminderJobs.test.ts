import {afterAll, beforeAll, beforeEach, describe, expect, it, vi} from "vitest";
import {connectTestDatabase, disconnectTestDatabase} from "@coreModule/_tests/testDatabase";

import {ObjectId} from "mongodb";

// Patient messages are captured where they leave the module.
const {mail} = vi.hoisted(() => ({mail: {sent: [] as {kind: string; languageCode: string; email: string; when: string}[]}}));
vi.mock("@dentalClinicModule/utilities/emails/sendPatientMail", () => ({
    sendPatientMail: vi.fn(async (message: {kind: string; languageCode: string; email: string; when: string}) => {
        mail.sent.push(message);
    }),
    sendInquiryMail: vi.fn(async () => undefined),
    patientSmsText: () => "",
}));
// Staff alerts too.
const {alerts} = vi.hoisted(() => ({alerts: [] as {code: string; receiverIds: string[]; payload: Record<string, unknown>}[]}));
vi.mock("@coreModule/domain/notifications/notificationEventBus", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@coreModule/domain/notifications/notificationEventBus")>()),
    emitNotificationEvent: (code: string, args: {receiverIds: string[]; payload: Record<string, unknown>}) => {
        alerts.push({code, receiverIds: [...args.receiverIds].sort(), payload: args.payload});
    },
}));

import {CONSTANTS} from "@coreModule/environment";
import Company from "@coreModule/database/schemas/company/company";
import {withTenant} from "@coreModule/utilities/endpoints/tenantScope";
import Appointment from "@dentalClinicModule/database/schemas/appointment/appointment";
import ClinicConfig from "@dentalClinicModule/database/schemas/clinicConfig/clinicConfig";
import ClinicInquiry from "@dentalClinicModule/database/schemas/clinicInquiry/clinicInquiry";
import Patient from "@dentalClinicModule/database/schemas/patient/patient";
import {NotificationEventCodes} from "@dentalClinicModule/domain/notifications/notificationEventCodes";
import {runAppointmentReminders} from "@dentalClinicModule/utilities/cronJobs/appointmentReminderJob";
import {runInquiryResponseAlerts} from "@dentalClinicModule/utilities/cronJobs/inquiryResponseAlertJob";

/**
 * The two dentalClinic sweeps: appointment reminders (the clinic's reminder window, once each, in the patient's
 * language) and unanswered-request alerts (the clinic's response target, claimed once).
 */

const companyId = new ObjectId();
const otherCompanyId = new ObjectId();
/** The jobs run as one company, as the cron runner runs them (D16). */
const asCompany = <T>(fn: () => PromiseLike<T>): Promise<T> => withTenant(companyId, fn);
const watcherId = new ObjectId();
const assigneeId = new ObjectId();
const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

beforeAll(async () => {
    await connectTestDatabase();
    await Promise.all([Appointment.init(), ClinicConfig.init(), ClinicInquiry.init(), Patient.init()]);
}, 120000);

afterAll(async () => {
    await disconnectTestDatabase();
});

beforeEach(async () => {
    // Raw deletes: the soft-delete plugin would only mark the rows deleted.
    await Promise.all([Appointment, ClinicConfig, ClinicInquiry, Patient, Company].map((model) => model.collection.deleteMany({})));
    mail.sent = [];
    alerts.length = 0;
    // Messages name the clinic: raw rows, only the fields read.
    await Company.collection.insertMany([
        {_id: companyId, name: "Smile Clinic", vat: "VAT-1"},
        {_id: otherCompanyId, name: "Other Clinic", vat: "VAT-2"},
    ]);
});

/** The clinic settings the jobs read (raw: only those fields). */
const seedConfig = (company: ObjectId, extra: Record<string, unknown> = {}) => ClinicConfig.collection.insertOne({
    company, deletedAt: null, reminderHoursBefore: 2, reminderSms: false, includeServiceInMessages: false,
    inquiriesEnabled: true, responseTargetHours: 24, inquiryNotifyUsers: [watcherId], notifyUsers: [], ...extra,
});

const seedFolder = (preferredLanguage: string) => asCompany(() => Patient.create({
    company: companyId, number: `PT-${new ObjectId().toString()}`, firstName: "Ada", lastName: "Lovelace", preferredLanguage, source: "phone",
}));

/** A booking as the reminder and the message read it (raw: only those fields). */
async function seedAppointment(startAt: Date, extra: Record<string, unknown> = {}): Promise<ObjectId> {
    const _id = new ObjectId();
    await Appointment.collection.insertOne({
        _id,
        company: companyId,
        number: `AP-${_id.toString()}`,
        idempotencyKey: `key-${_id.toString()}`,
        status: "confirmed",
        startAt,
        patient: {firstName: "Ada", lastName: "Lovelace", email: "ada@example.com", phone: "+41 79 000 00 00"},
        snapshot: {serviceName: "Check-up", practitionerName: "Dr. Ana", locationName: "Zurich Centre", timezone: "Europe/Zurich"},
        manageTokenVersion: 1,
        deletedAt: null,
        ...extra,
    });
    return _id;
}

const reminderStamp = async (id: ObjectId) => (await Appointment.collection.findOne({_id: id}))?.reminderSentAt;

describe("appointment reminders", {timeout: 60000}, () => {
    const now = new Date("2027-03-10T08:00:00.000Z");

    it("reminds a confirmed appointment once, from just after now up to the end of the window", () => asCompany(async () => {
        await seedConfig(companyId);
        const atWindowEnd = await seedAppointment(new Date(now.getTime() + 2 * HOUR));
        const pastWindow = await seedAppointment(new Date(now.getTime() + 2 * HOUR + MINUTE));
        const startingNow = await seedAppointment(now);
        const pending = await seedAppointment(new Date(now.getTime() + HOUR), {status: "pending"});
        const alreadyReminded = await seedAppointment(new Date(now.getTime() + HOUR), {reminderSentAt: new Date("2027-03-10T07:00:00.000Z")});

        await runAppointmentReminders(companyId, undefined, {now});
        await runAppointmentReminders(companyId, undefined, {now});

        expect(mail.sent.map((message) => message.kind)).toEqual(["reminder"]);
        expect(await reminderStamp(atWindowEnd)).toEqual(now);
        for (const id of [pastWindow, startingNow, pending]) expect(await reminderStamp(id)).toBeUndefined();
        expect(await reminderStamp(alreadyReminded)).toEqual(new Date("2027-03-10T07:00:00.000Z"));
    }));

    it("writes to the patient in their folder's language, not the job's", () => asCompany(async () => {
        await seedConfig(companyId);
        const folder = await seedFolder("it-IT");
        await seedAppointment(new Date(now.getTime() + HOUR), {patientRecord: folder._id});

        await runAppointmentReminders(companyId, undefined, {now});

        expect(mail.sent).toHaveLength(1);
        expect(mail.sent[0].languageCode).toBe("it-IT");
        expect(mail.sent[0].when).toContain("marzo");
    }));

    it("falls back to the platform default language for a booking without a folder", () => asCompany(async () => {
        await seedConfig(companyId);
        await seedAppointment(new Date(now.getTime() + HOUR));

        await runAppointmentReminders(companyId, undefined, {now});

        expect(mail.sent[0].languageCode).toBe(CONSTANTS.DEFAULT_LANGUAGE ?? "en-US");
    }));

    it("counts the window in hours across the clinic's local midnight, and names the local day", () => asCompany(async () => {
        await seedConfig(companyId, {reminderHoursBefore: 1});
        const folder = await seedFolder("de-CH");
        // 23:45 on 10 March in Zurich (UTC+1); the visit is at 00:30 on 11 March, 45 minutes later.
        const lateEvening = new Date("2027-03-10T22:45:00.000Z");
        await seedAppointment(new Date("2027-03-10T23:30:00.000Z"), {patientRecord: folder._id});
        const beyond = await seedAppointment(new Date("2027-03-10T23:46:00.000Z"), {patientRecord: folder._id});

        await runAppointmentReminders(companyId, undefined, {now: lateEvening});

        expect(mail.sent).toHaveLength(1);
        expect(mail.sent[0].languageCode).toBe("de-CH");
        expect(mail.sent[0].when).toContain("11. März 2027");
        expect(mail.sent[0].when).toContain("00:30");
        expect(await reminderStamp(beyond)).toBeUndefined();
    }));

    it("leaves another company's appointments to that company's run", async () => {
        await withTenant(otherCompanyId, async () => {
            await seedConfig(otherCompanyId);
        });
        await asCompany(() => seedConfig(companyId));
        const foreign = new ObjectId();
        await Appointment.collection.insertOne({
            _id: foreign, company: otherCompanyId, number: "AP-OTHER", idempotencyKey: "key-other", status: "confirmed", startAt: new Date(now.getTime() + HOUR),
            patient: {firstName: "Eve", lastName: "Other", email: "eve@example.com", phone: "+41 79 111 11 11"},
            snapshot: {serviceName: "Check-up", practitionerName: "Dr. Bo", locationName: "Bern", timezone: "Europe/Zurich"},
            manageTokenVersion: 1, deletedAt: null,
        });

        await asCompany(() => runAppointmentReminders(companyId, undefined, {now}));

        expect(mail.sent).toHaveLength(0);
        expect(await reminderStamp(foreign)).toBeUndefined();
    });
});

/** A request as the alert reads it (raw: only those fields). */
async function seedInquiry(createdAt: Date, extra: Record<string, unknown> = {}): Promise<ObjectId> {
    const _id = new ObjectId();
    await ClinicInquiry.collection.insertOne({
        _id, company: companyId, number: `RQ-${_id.toString()}`, idempotencyKey: `key-${_id.toString()}`, status: "new", createdAt, firstResponseAt: null, slaAlertedAt: null, deletedAt: null, ...extra,
    });
    return _id;
}

const alertStamp = async (id: ObjectId) => (await ClinicInquiry.collection.findOne({_id: id}))?.slaAlertedAt;

describe("unanswered request alerts", {timeout: 60000}, () => {
    const now = new Date("2027-03-10T08:00:00.000Z");

    it("alerts the watchers and the assignee once about a new request unanswered for the response target", () => asCompany(async () => {
        await seedConfig(companyId);
        const due = await seedInquiry(new Date(now.getTime() - 24 * HOUR), {assignedTo: assigneeId});
        const recent = await seedInquiry(new Date(now.getTime() - 24 * HOUR + MINUTE));
        const answered = await seedInquiry(new Date(now.getTime() - 48 * HOUR), {firstResponseAt: new Date(now.getTime() - 47 * HOUR)});
        const inReview = await seedInquiry(new Date(now.getTime() - 48 * HOUR), {status: "in_review"});
        const alreadyAlerted = await seedInquiry(new Date(now.getTime() - 48 * HOUR), {slaAlertedAt: new Date(now.getTime() - HOUR)});

        await runInquiryResponseAlerts(companyId, undefined, {now});
        await runInquiryResponseAlerts(companyId, undefined, {now});

        expect(alerts).toEqual([{
            code: NotificationEventCodes.INQUIRY_UNANSWERED,
            receiverIds: [assigneeId.toString(), watcherId.toString()].sort(),
            payload: expect.objectContaining({companyId: companyId.toString(), inquiryId: due.toString()}),
        }]);
        expect(await alertStamp(due)).toEqual(now);
        for (const id of [recent, answered, inReview]) expect(await alertStamp(id)).toBeNull();
        expect(await alertStamp(alreadyAlerted)).toEqual(new Date(now.getTime() - HOUR));
    }));

    it("counts the target in elapsed hours, not the company's calendar days", () => asCompany(async () => {
        await Company.collection.updateOne({_id: companyId}, {$set: {timezone: "Pacific/Kiritimati"}});
        await seedConfig(companyId);
        // 00:30 on 11 March in Kiritimati (UTC+14); both requests came in on 10 March there, a minute apart.
        const justAfterMidnight = new Date("2027-03-10T10:30:00.000Z");
        const due = await seedInquiry(new Date("2027-03-09T10:30:00.000Z"));
        const notYet = await seedInquiry(new Date("2027-03-09T10:31:00.000Z"));

        await runInquiryResponseAlerts(companyId, undefined, {now: justAfterMidnight});

        expect(alerts.map((alert) => alert.payload.inquiryId)).toEqual([due.toString()]);
        expect(await alertStamp(notYet)).toBeNull();
    }));

    it("alerts nobody while the clinic does not take requests", () => asCompany(async () => {
        await seedConfig(companyId, {inquiriesEnabled: false});
        const due = await seedInquiry(new Date(now.getTime() - 48 * HOUR));

        await runInquiryResponseAlerts(companyId, undefined, {now});

        expect(alerts).toHaveLength(0);
        expect(await alertStamp(due)).toBeNull();
    }));
});
