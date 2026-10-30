import {afterAll, beforeAll, beforeEach, describe, expect, it, vi} from "vitest";
import {MongoMemoryReplSet} from "mongodb-memory-server";
import mongoose from "mongoose";
import {ObjectId} from "mongodb";
import request from "supertest";

vi.mock("@coreModule/utilities/middlewares/authMW", async () =>
    (await import("@coreModule/_tests/httpHarness")).authMWStub);
vi.mock("@coreModule/utilities/middlewares/rateLimiter", () => ({
    rateLimiter: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));
const {portal} = vi.hoisted(() => ({
    portal: {platformId: "", listed: [] as string[]},
}));
// A portal account is the `x-auth-token` "account:<id>"; it belongs to the platform company.
vi.mock("@coreModule/domain/publicChat/publicChatCustomer", () => ({
    tryResolvePublicChatCustomer: async ({token}: {token: string}) => {
        const [kind, id] = token.split(":");
        if (kind !== "account") return null;
        const {ObjectId: Id} = await import("mongodb");
        return {user: {_id: new Id(id)}, companyId: new Id(portal.platformId)};
    },
    requirePortalAccount: async (customer: {user: unknown} | undefined) => {
        if (!customer) {
            const {apiValidationException} = await import("armonia/src/modules/core/helpers/exceptions");
            throw apiValidationException("no_token", "token", null, "en-US");
        }
        return customer.user;
    },
}));
vi.mock("@coreModule/utilities/marketing/portalCompanies", async (importOriginal) => {
    const original = await importOriginal<typeof import("@coreModule/utilities/marketing/portalCompanies")>();
    const {ObjectId: Id} = await import("mongodb");
    return {
        ...original,
        portalListedCompanyIds: async () => portal.listed.map((id) => new Id(id)),
        findPlatformCompany: async () => ({_id: new Id(portal.platformId), name: "Platform"}),
        portalCompanyCards: async (ids: {toString(): string}[]) => ids.map((id) => ({_id: id.toString(), name: `Clinic ${id.toString().slice(-4)}`, slug: id.toString(), cities: []})),
        addressCitiesByCompany: async () => new Map(),
    };
});
const {mail} = vi.hoisted(() => ({mail: {sent: [] as {kind: string; email: string}[]}}));
vi.mock("@dentalClinicModule/utilities/emails/sendPatientMail", () => ({
    sendPatientMail: vi.fn(async () => undefined),
    sendInquiryMail: vi.fn(async (message: {kind: string; email: string}) => {
        mail.sent.push(message);
    }),
    patientSmsText: () => "",
}));

import {allPermissionTags, appFor, callerHeader, type TestCaller} from "@coreModule/_tests/httpHarness";
import Media from "@coreModule/database/schemas/media/media";
import Company from "@coreModule/database/schemas/company/company";
import * as inquiryRoute from "@dentalClinicModule/api/dentalClinic/private/clinicInquiry";
import * as portalRoute from "@dentalClinicModule/api/dentalClinic/public/patientPortal";
import ClinicConfig from "@dentalClinicModule/database/schemas/clinicConfig/clinicConfig";
import ClinicInquiry from "@dentalClinicModule/database/schemas/clinicInquiry/clinicInquiry";
import ClinicMessage from "@dentalClinicModule/database/schemas/clinicMessage/clinicMessage";
import Patient from "@dentalClinicModule/database/schemas/patient/patient";

let replSet: MongoMemoryReplSet;
const platformId = new ObjectId();
const clinicA = new ObjectId();
const clinicB = new ObjectId();
const clinicC = new ObjectId();
const accountId = new ObjectId();
const otherAccountId = new ObjectId();
const app = appFor([inquiryRoute, portalRoute]);

let staffA: TestCaller;
let staffB: TestCaller;
let patientCaller: TestCaller;

const ORIGIN = "http://portal.localhost";
const asPatient = (path: string, body: Record<string, unknown>, account: ObjectId = accountId) =>
    request(app).post(`/api/dentalClinic/patientPortal${path}`)
        .set(callerHeader(patientCaller))
        .set("x-auth-token", `account:${account.toString()}`)
        .send({origin: ORIGIN, ...body});
const asClinic = (caller: TestCaller, path: string, body: Record<string, unknown>) =>
    request(app).post(`/api/dentalClinic/clinicInquiry${path}`).set(callerHeader(caller)).send(body);

/** A file the patient uploaded ahead of the request, as `/upload` leaves it. */
const upload = (name: string, owner: ObjectId = accountId) => Media.create({
    type: "image",
    originalName: name,
    fileName: name,
    mimeType: "image/jpeg",
    extension: ".jpg",
    metadata: {size: 10, extension: ".jpg", mime: "image/jpeg", safeCheckedFlag: true},
    company: platformId,
    createdBy: owner,
    pendingReference: true,
});

const sendRequest = (body: Record<string, unknown> = {}) => asPatient("/requests", {
    clinics: [clinicA.toString(), clinicB.toString()],
    contact: {firstName: "Giulia", lastName: "Bianchi", email: "giulia@example.com", phone: "+39 333 000 0000", preferredLanguage: "it-IT"},
    treatmentsWanted: ["implant", "crown"],
    description: "Two missing molars, lower left.",
    acceptConsent: true,
    consentVersion: "2026-10",
    idempotencyKey: `key-${new ObjectId().toString()}`,
    ...body,
});

beforeAll(async () => {
    replSet = await MongoMemoryReplSet.create({replSet: {count: 1, storageEngine: "wiredTiger"}});
    await mongoose.connect(replSet.getUri());
    // Every model's indexes built up front: a build running beside a transaction makes it retry.
    await Promise.all([ClinicInquiry, ClinicMessage, Patient, ClinicConfig, Media].map((model) => model.init()));
    portal.platformId = platformId.toString();
    portal.listed = [clinicA.toString(), clinicB.toString()];
    const permissions = allPermissionTags([ClinicInquiry, ClinicMessage]);
    staffA = {userId: new ObjectId().toString(), companyId: clinicA.toString(), isAdmin: true, permissions};
    staffB = {userId: new ObjectId().toString(), companyId: clinicB.toString(), isAdmin: true, permissions};
    patientCaller = {userId: accountId.toString(), companyId: platformId.toString()};
}, 120000);

afterAll(async () => {
    await mongoose.disconnect();
    await replSet.stop();
});

beforeEach(async () => {
    await Promise.all([ClinicInquiry, ClinicMessage, Patient, ClinicConfig, Media].map((model) => model.collection.deleteMany({})));
    mail.sent = [];
    // Emails name the clinic, so the companies must exist; only their names are read.
    await Company.collection.deleteMany({});
    await Company.collection.insertMany([clinicA, clinicB, clinicC, platformId].map((_id, index) => ({_id, name: `Company ${index}`, vat: `VAT-${index}`})));
});

describe("a patient's request to several clinics", {timeout: 60000}, () => {
    it("opens one inquiry per clinic, shares the X-ray with exactly those clinics, and answers a retry with the same request", async () => {
        const opg = await upload("opg.jpg");
        const key = `key-${new ObjectId().toString()}`;
        const first = await sendRequest({files: [opg._id.toString()], idempotencyKey: key});
        expect(first.status).toBe(200);
        expect(first.body.data.inquiries).toBe(2);

        const inquiries = await ClinicInquiry.find({requestGroup: first.body.data.requestGroup});
        expect(inquiries.map((inquiry) => String(inquiry.company)).sort()).toEqual([clinicA.toString(), clinicB.toString()].sort());
        expect(inquiries.every((inquiry) => inquiry.status === "new" && !inquiry.contactShared && inquiry.source === "portal")).toBe(true);

        const shared = await Media.findById(opg._id);
        expect(shared!.sharedWithCompanies.map(String).sort()).toEqual([clinicA.toString(), clinicB.toString()].sort());
        expect(shared!.pendingReference).toBeUndefined();
        expect(mail.sent).toEqual([expect.objectContaining({kind: "requestSent", email: "giulia@example.com"})]);

        const retry = await sendRequest({files: [opg._id.toString()], idempotencyKey: key});
        expect(retry.body.data.requestGroup).toBe(first.body.data.requestGroup);
        expect(await ClinicInquiry.countDocuments({})).toBe(2);
    });

    it("refuses clinics that do not take requests here, someone else's files, and a request without consent", async () => {
        expect((await sendRequest({clinics: [clinicC.toString()]})).body.error_code).toBe("inquiry_clinic_not_available");
        const foreign = await upload("theirs.jpg", otherAccountId);
        expect((await sendRequest({files: [foreign._id.toString()]})).body.error_code).toBe("inquiry_file_not_found");
        expect((await sendRequest({acceptConsent: false})).body.error_code).toBe("inquiry_consent_required");
        expect((await sendRequest({treatmentsWanted: ["teleportation"]})).body.error_code).toBe("inquiry_invalid_treatments");
        expect(await ClinicInquiry.countDocuments({})).toBe(0);
    });
});

describe("working the request at a clinic", {timeout: 60000}, () => {
    it("hides the patient's contact until they share it, and opens their folder only then", async () => {
        const {body} = await sendRequest();
        const inquiry = await ClinicInquiry.findOne({requestGroup: body.data.requestGroup, company: clinicA});

        const listed = await request(app).post("/api/dentalClinic/clinicInquiry").set(callerHeader(staffA)).send({limit: 10, offset: 0});
        expect(listed.body.data).toHaveLength(1);
        expect(listed.body.data[0].contact).toMatchObject({firstName: "Giulia", lastName: "B."});
        expect(listed.body.data[0].contact.email).toBeUndefined();

        expect((await asClinic(staffA, "/convert", {_id: inquiry!._id.toString()})).body.error_code).toBe("inquiry_contact_not_shared");

        await asPatient("/shareContact", {inquiry: inquiry!._id.toString()});
        const converted = await asClinic(staffA, "/convert", {_id: inquiry!._id.toString()});
        expect(converted.body.status).toBe("converted");
        expect(converted.body.contact.email).toBe("giulia@example.com");
        const folder = await Patient.findOne({company: clinicA});
        expect(folder).toMatchObject({firstName: "Giulia", lastName: "Bianchi", source: "portal", preferredLanguage: "it-IT"});
        expect(String(folder!.account)).toBe(accountId.toString());
        // The other clinic still sees a masked request.
        expect((await ClinicInquiry.findOne({company: clinicB}))!.contactShared).toBe(false);
    });

    it("asks for a panoramic X-ray, which the patient sends to that clinic only", async () => {
        const {body} = await sendRequest();
        const atA = await ClinicInquiry.findOne({requestGroup: body.data.requestGroup, company: clinicA});

        const asked = await asClinic(staffA, "/requestInfo", {_id: atA!._id.toString(), kinds: ["opg"], note: "A recent panoramic, please."});
        expect(asked.body.status).toBe("info_requested");
        expect(asked.body.firstResponseAt).toBeTruthy();
        expect(mail.sent.at(-1)).toMatchObject({kind: "infoRequested", requested: ["opg"]});

        const opg = await upload("opg.jpg");
        const attached = await asPatient("/attach", {inquiry: atA!._id.toString(), files: [opg._id.toString()], fulfils: ["opg"]});
        expect(attached.body.data).toMatchObject({status: "in_review", openInfoRequests: []});
        expect((await Media.findById(opg._id))!.sharedWithCompanies.map(String)).toEqual([clinicA.toString()]);

        // Another account cannot touch this inquiry.
        expect((await asPatient("/attach", {inquiry: atA!._id.toString(), files: [opg._id.toString()]}, otherAccountId)).body.error_code).toBe("inquiry_not_found");
    });

    it("takes a declining clinic's access to the files away and tells the patient", async () => {
        const opg = await upload("opg.jpg");
        const {body} = await sendRequest({files: [opg._id.toString()]});
        const atB = await ClinicInquiry.findOne({requestGroup: body.data.requestGroup, company: clinicB});

        const declined = await asClinic(staffB, "/decline", {_id: atB!._id.toString(), reason: "We do not place implants."});
        expect(declined.body.status).toBe("declined");
        expect((await Media.findById(opg._id))!.sharedWithCompanies.map(String)).toEqual([clinicA.toString()]);
        expect(mail.sent.at(-1)).toMatchObject({kind: "declined"});
        expect((await asClinic(staffB, "/requestInfo", {_id: atB!._id.toString(), kinds: ["cbct"]})).body.error_code).toBe("inquiry_invalid_status");
    });

    it("keeps a thread with unread counts on both sides", async () => {
        const {body} = await sendRequest();
        const atA = await ClinicInquiry.findOne({requestGroup: body.data.requestGroup, company: clinicA});
        const id = atA!._id.toString();

        const sent = await request(app).post("/api/dentalClinic/clinicInquiry/sendMessage").set(callerHeader(staffA)).field("_id", id).field("body", "Buongiorno Giulia!");
        expect(sent.status).toBe(200);
        expect((await ClinicInquiry.findById(id))).toMatchObject({unreadForPatient: 1, status: "in_review"});
        expect(mail.sent.at(-1)).toMatchObject({kind: "clinicMessage"});

        const thread = await asPatient("/thread", {inquiry: id});
        expect(thread.body.data).toEqual([expect.objectContaining({from: "clinic", body: "Buongiorno Giulia!"})]);
        expect((await ClinicInquiry.findById(id))!.unreadForPatient).toBe(0);

        await asPatient("/message", {inquiry: id, body: "Grazie, when can I come?"});
        expect((await ClinicInquiry.findById(id))!.unreadForClinic).toBe(1);
        const staffThread = await asClinic(staffA, "/thread", {_id: id});
        expect(staffThread.body.data.map((message: {from: string}) => message.from)).toEqual(["clinic", "patient"]);
        expect((await ClinicInquiry.findById(id))!.unreadForClinic).toBe(0);
    });

    it("lets the patient withdraw from one clinic and lists the request with each clinic's status", async () => {
        const {body} = await sendRequest();
        const atB = await ClinicInquiry.findOne({requestGroup: body.data.requestGroup, company: clinicB});
        expect((await asPatient("/withdraw", {inquiry: atB!._id.toString()})).body.data.status).toBe("withdrawn");

        const cases = await asPatient("/cases", {});
        expect(cases.body.data).toHaveLength(1);
        expect(cases.body.data[0].treatmentsWanted).toEqual(["implant", "crown"]);
        expect(cases.body.data[0].inquiries.map((inquiry: {status: string}) => inquiry.status).sort()).toEqual(["new", "withdrawn"]);
        expect((await asPatient("/cases", {}, otherAccountId)).body.data).toEqual([]);
    });
});

describe("leads the clinic enters itself", {timeout: 60000}, () => {
    it("records a phone lead with its contact visible", async () => {
        const created = await request(app).put("/api/dentalClinic/clinicInquiry").set(callerHeader(staffA)).send({
            contact: {firstName: "Marco", lastName: "Rossi", phone: "+39 333 111 2222", preferredLanguage: "it-IT"},
            source: "phone",
            treatmentsWanted: ["all_on_x"],
        });
        expect(created.status).toBe(200);
        expect(created.body).toMatchObject({status: "new", source: "phone", contactShared: true, contact: {lastName: "Rossi", phone: "+39 333 111 2222"}});
        const converted = await asClinic(staffA, "/convert", {_id: created.body._id});
        expect(converted.body.status).toBe("converted");
        expect(await Patient.countDocuments({company: clinicA, lastName: "Rossi"})).toBe(1);
    });
});
