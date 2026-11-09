import {afterAll, beforeAll, beforeEach, describe, expect, it, vi} from "vitest";
import {connectTestDatabase, disconnectTestDatabase} from "@coreModule/_tests/testDatabase";

import {ObjectId} from "mongodb";
import request from "supertest";

vi.mock("@coreModule/utilities/middlewares/authMW", async () =>
    (await import("@coreModule/_tests/httpHarness")).authMWStub);
vi.mock("@coreModule/utilities/middlewares/rateLimiter", () => ({
    rateLimiter: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));
vi.mock("@dentalClinicModule/utilities/emails/sendPatientMail", () => ({
    sendPatientMail: vi.fn(async () => undefined),
    sendInquiryMail: vi.fn(async () => undefined),
    patientSmsText: () => "",
}));
// Staff alerts are captured where they leave the module.
const {alerts} = vi.hoisted(() => ({alerts: [] as {code: string; receiverIds: string[]; payload: Record<string, unknown>}[]}));
vi.mock("@coreModule/domain/notifications/notificationEventBus", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@coreModule/domain/notifications/notificationEventBus")>()),
    emitNotificationEvent: (code: string, args: {receiverIds: string[]; payload: Record<string, unknown>}) => {
        alerts.push({code, receiverIds: [...args.receiverIds].sort(), payload: args.payload});
    },
}));

import {allPermissionTags, appFor, callerHeader, type TestCaller} from "@coreModule/_tests/httpHarness";
import Company from "@coreModule/database/schemas/company/company";
import Currency from "@coreModule/database/schemas/currency/currency";
import User from "@coreModule/database/schemas/user/user";
import {getLogger} from "@coreModule/loggers/serverLog";
import {withTenant} from "@coreModule/utilities/endpoints/tenantScope";
import {runInTransaction} from "@coreModule/utilities/middlewares/runInTransaction";
import * as inquiryRoute from "@dentalClinicModule/api/dentalClinic/private/clinicInquiry";
import ClinicConfig from "@dentalClinicModule/database/schemas/clinicConfig/clinicConfig";
import ClinicInquiry from "@dentalClinicModule/database/schemas/clinicInquiry/clinicInquiry";
import ClinicMessage from "@dentalClinicModule/database/schemas/clinicMessage/clinicMessage";
import Patient from "@dentalClinicModule/database/schemas/patient/patient";
import {postInquiryMessage} from "@dentalClinicModule/utilities/services/inquiryThread";
import sharp from "sharp";
import express from "express";
import Media from "@coreModule/database/schemas/media/media";
import {getGridFSStorage} from "@coreModule/utilities/gridfs/gridfsStorage";
import {readMediaBytes} from "@coreModule/utilities/media/serveMedia";

const clinicId = new ObjectId();
const otherClinicId = new ObjectId();
const asClinic = <T>(fn: () => PromiseLike<T>): Promise<T> => withTenant(clinicId, fn);
const logger = getLogger("clinic_inquiry_work_test");
// The uploader, which authMW sets in production (`userInfo`) and the stub does not.
const uploader = express.Router().use((req, _res, next) => {
    req.body.userInfo = {_id: new ObjectId(staff.userId)};
    next();
});
const app = appFor([{basePath: "/api/dentalClinic/clinicInquiry", router: uploader}, {...inquiryRoute, module: "dentalClinic"}]);

const coordinatorId = new ObjectId();
const watcherId = new ObjectId();
/** Staff of another company: never this clinic's assignee. */
const strangerId = new ObjectId();
let staff: TestCaller;
let otherClinicStaff: TestCaller;
/** Can work requests but may not read message bodies (no Clinicmessages read grant). */
let requestsOnly: TestCaller;

const call = (path: string, body: Record<string, unknown>, caller: TestCaller = staff) =>
    request(app).post(`/api/dentalClinic/clinicInquiry${path}`).set(callerHeader(caller)).send(body);
const timelineOf = async (id: string) => (await ClinicInquiry.findById(id))!.timeline.map((entry) => entry.event);

/** A phone lead the clinic enters itself. */
async function lead(): Promise<string> {
    const created = await request(app).put("/api/dentalClinic/clinicInquiry").set(callerHeader(staff)).send({
        contact: {firstName: "Marco", lastName: "Rossi", phone: "+39 333 111 2222", email: "marco@example.com", preferredLanguage: "it-IT"},
        source: "phone",
        treatmentsWanted: ["implant"],
    });
    expect(created.status).toBe(200);
    return created.body._id;
}

/** A message from the patient's side, as the portal posts it. */
const patientWrites = (id: string, body: string) => runInTransaction(logger, async (session) => {
    const inquiry = await ClinicInquiry.findById(id).session(session);
    await postInquiryMessage(inquiry!, {from: "patient", authorId: new ObjectId(), body, attachments: []}, {session, logger, languageCode: "en-US"});
});

beforeAll(async () => {
    await connectTestDatabase();
    await Promise.all([ClinicInquiry, ClinicMessage, Patient, ClinicConfig].map((model) => model.init()));
    const permissions = allPermissionTags([ClinicInquiry, ClinicMessage]);
    staff = {userId: new ObjectId().toString(), companyId: clinicId.toString(), isAdmin: true, permissions};
    otherClinicStaff = {...staff, userId: new ObjectId().toString(), companyId: otherClinicId.toString()};
    requestsOnly = {userId: new ObjectId().toString(), companyId: clinicId.toString(), isAdmin: false, permissions: allPermissionTags([ClinicInquiry])};
    await Company.collection.insertMany([clinicId, otherClinicId].map((_id, index) => ({_id, name: `Clinic ${index}`, vat: `VAT-${index}`})));
    // Membership is a role entry for the company, as the company's user list reads it.
    const member = (company: ObjectId) => ({companies: [company], roles: [{_id: new ObjectId(), company, roles: [], active: "active"}]});
    await User.collection.insertMany([
        {_id: coordinatorId, username: "coordinator@clinic.test", ...member(clinicId)},
        {_id: strangerId, username: "staff@elsewhere.test", ...member(otherClinicId)},
    ]);
}, 120000);

afterAll(async () => {
    await disconnectTestDatabase();
});

beforeEach(() => asClinic(async () => {
    await Promise.all([ClinicInquiry, ClinicMessage, Patient, ClinicConfig, Currency].map((model) => model.collection.deleteMany({})));
    alerts.length = 0;
    const currency = await Currency.create({name: "Euro", symbol: "€", abbreviation: "EUR", decimalPlaces: 2, company: clinicId});
    await ClinicConfig.create({company: clinicId, currency: currency._id, inquiriesEnabled: true, inquiryNotifyUsers: [watcherId]});
}));

describe("a request's status at the clinic", {timeout: 60000}, () => {
    it("starts the review once, counting it as the clinic's first response", () => asClinic(async () => {
        const id = await lead();
        const started = await call("/startReview", {_id: id});
        expect(started.body.status).toBe("in_review");
        expect(started.body.firstResponseAt).toBeTruthy();
        expect((await call("/startReview", {_id: id})).body.error_code).toBe("inquiry_invalid_status");
    }));

    it("asks for each missing item once, and refuses kinds it does not know", () => asClinic(async () => {
        const id = await lead();
        await call("/requestInfo", {_id: id, kinds: ["opg"]});
        const again = await call("/requestInfo", {_id: id, kinds: ["opg", "photos"]});
        expect(again.body.status).toBe("info_requested");
        const stored = await ClinicInquiry.findById(id);
        expect(stored!.infoRequests.map((entry) => entry.kind).sort()).toEqual(["opg", "photos"]);
        expect((await call("/requestInfo", {_id: id, kinds: ["opg", "horoscope"]})).body.error_code).toBe("inquiry_invalid_info_kinds");
    }));

    it("marks a request lost without counting it as an answer, and closes it to every further step", () => asClinic(async () => {
        const id = await lead();
        const lost = await call("/markLost", {_id: id, reason: "  Stopped answering  "});
        expect(lost.body).toMatchObject({status: "lost", closeReason: "Stopped answering"});
        const stored = await ClinicInquiry.findById(id);
        expect(stored!.closedAt).toBeInstanceOf(Date);
        expect(stored!.firstResponseAt).toBeUndefined();

        for (const [path, body] of [
            ["/startReview", {}],
            ["/requestInfo", {kinds: ["opg"]}],
            ["/decline", {}],
            ["/markLost", {}],
            ["/convert", {}],
        ] as const) {
            expect((await call(path, {_id: id, ...body})).body.error_code).toBe("inquiry_invalid_status");
        }
        const message = await request(app).post("/api/dentalClinic/clinicInquiry/sendMessage").set(callerHeader(staff)).field("_id", id).field("body", "Still there?");
        expect(message.body.error_code).toBe("inquiry_invalid_status");
        expect(await ClinicMessage.countDocuments({})).toBe(0);
    }));

    it("keeps the conversation open with a converted patient", () => asClinic(async () => {
        const id = await lead();
        expect((await call("/convert", {_id: id})).body.status).toBe("converted");
        const message = await request(app).post("/api/dentalClinic/clinicInquiry/sendMessage").set(callerHeader(staff)).field("_id", id).field("body", "See you Monday");
        expect(message.status).toBe(200);
        expect((await ClinicInquiry.findById(id))!.unreadForPatient).toBe(1);
    }));
});

describe("assigning a request", {timeout: 60000}, () => {
    it("records who took it and alerts them, with the watchers, about the patient's messages", () => asClinic(async () => {
        const id = await lead();
        const assigned = await call("/assign", {_id: id, assignedTo: coordinatorId.toString()});
        expect(assigned.status).toBe(200);
        expect(String((await ClinicInquiry.findById(id))!.assignedTo)).toBe(coordinatorId.toString());
        expect(await timelineOf(id)).toContain("assigned");

        await patientWrites(id, "I take blood thinners, is that a problem?");
        expect(alerts).toEqual([{
            code: "INQUIRY_MESSAGE",
            receiverIds: [coordinatorId.toString(), watcherId.toString()].sort(),
            // The alert names the request only: nothing the patient wrote travels with it.
            payload: {companyId: clinicId.toString(), languageCode: "en-US", inquiryId: id, number: expect.any(String)},
        }]);
        expect(JSON.stringify(alerts)).not.toContain("blood");
    }));

    it("assigns only a member of this clinic, also on a lead staff enter", () => asClinic(async () => {
        const id = await lead();
        expect((await call("/assign", {_id: id, assignedTo: strangerId.toString()})).body.error_code).toBe("inquiry_assignee_not_member");
        expect((await call("/assign", {_id: id, assignedTo: new ObjectId().toString()})).body.error_code).toBe("inquiry_assignee_not_member");
        expect((await ClinicInquiry.findById(id))!.assignedTo).toBeUndefined();
        expect(await timelineOf(id)).not.toContain("assigned");

        const created = await request(app).put("/api/dentalClinic/clinicInquiry").set(callerHeader(staff)).send({
            contact: {firstName: "Anna", lastName: "Verdi", phone: "+39 333 222 3333", preferredLanguage: "it-IT"},
            source: "phone",
            treatmentsWanted: ["crown"],
            assignedTo: strangerId.toString(),
        });
        expect(created.body.error_code).toBe("inquiry_assignee_not_member");
    }));

    it("stops alerting the former assignee once the request is unassigned", () => asClinic(async () => {
        const id = await lead();
        await call("/assign", {_id: id, assignedTo: coordinatorId.toString()});
        await call("/assign", {_id: id});
        expect((await ClinicInquiry.findById(id))!.assignedTo).toBeUndefined();

        await patientWrites(id, "Hello?");
        expect(alerts.map((alert) => alert.receiverIds)).toEqual([[watcherId.toString()]]);
    }));
});

describe("the request's thread", {timeout: 60000}, () => {
    it("marks only the patient's messages read when the clinic opens it", () => asClinic(async () => {
        const id = await lead();
        await request(app).post("/api/dentalClinic/clinicInquiry/sendMessage").set(callerHeader(staff)).field("_id", id).field("body", "Buongiorno");
        await patientWrites(id, "Grazie");
        expect((await ClinicInquiry.findById(id))!.unreadForClinic).toBe(1);

        const thread = await call("/thread", {_id: id});
        expect(thread.body.data.map((message: {from: string; body: string}) => [message.from, message.body])).toEqual([["clinic", "Buongiorno"], ["patient", "Grazie"]]);
        const stored = await ClinicMessage.find({inquiry: new ObjectId(id)}).sort({createdAt: 1});
        expect(stored.map((message) => [message.from, message.readAt instanceof Date])).toEqual([["clinic", false], ["patient", true]]);
        expect((await ClinicInquiry.findById(id))!.unreadForClinic).toBe(0);
    }));

    it("stores the clinic's attachments encrypted, like the patient's (D103)", () => asClinic(async () => {
        const id = await lead();
        const photo = await sharp({create: {width: 8, height: 8, channels: 3, background: "#808080"}}).png().toBuffer();
        const sent = await request(app).post("/api/dentalClinic/clinicInquiry/sendMessage").set(callerHeader(staff))
            .field("_id", id).field("body", "Your X-ray").attach("attachments", photo, {filename: "opg.png", contentType: "image/png"});
        expect(sent.body.data.attachments).toHaveLength(1);
        const message = await ClinicMessage.findOne({inquiry: new ObjectId(id)});
        const media = await Media.findById(message!.attachments[0]);
        expect(media?.encrypted).toBe(true);
        const stored = await getGridFSStorage("en-US").getFileBuffer(String(media!.fileId));
        expect(stored.subarray(0, 4).toString()).toBe("HFE2");
        const opened = await readMediaBytes(media!, "en-US");
        expect(opened.subarray(1, 4).toString()).toBe("PNG");
        expect(opened.length).toBe(media!.fileSize);
    }));

    it("returns each attachment's real size from sendMessage and the thread (TD-B107)", () => asClinic(async () => {
        const id = await lead();
        const photo = await sharp({create: {width: 8, height: 8, channels: 3, background: "#808080"}}).png().toBuffer();
        const sent = await request(app).post("/api/dentalClinic/clinicInquiry/sendMessage").set(callerHeader(staff))
            .field("_id", id).field("body", "Your X-ray").attach("attachments", photo, {filename: "opg.png", contentType: "image/png"});
        const message = await ClinicMessage.findOne({inquiry: new ObjectId(id)});
        const media = await Media.findById(message!.attachments[0]);
        expect(media!.sizeInBytes).toBeGreaterThan(0);
        expect(sent.body.data.attachments[0].size).toBe(media!.sizeInBytes);

        const thread = await call("/thread", {_id: id});
        expect(thread.body.data[0].attachments[0].size).toBe(media!.sizeInBytes);
    }));

    it("shows the thread only to staff who may read the messages, and only for their own clinic's request", () => asClinic(async () => {
        const id = await lead();
        await patientWrites(id, "My medical details");
        expect((await call("/thread", {_id: id}, requestsOnly)).body.error_code).toBe("user_permissions_not_sufficient");
        const foreign = await call("/thread", {_id: id}, otherClinicStaff);
        expect(foreign.body.error_code).toBe("inquiry_not_found");
        expect(JSON.stringify(foreign.body)).not.toContain("medical");
        // Opening it was refused, so the patient's message is still unread.
        expect((await ClinicInquiry.findById(id))!.unreadForClinic).toBe(1);
    }));
});
