import {afterAll, beforeAll, beforeEach, describe, expect, it, vi} from "vitest";
import {connectTestDatabase, disconnectTestDatabase} from "@coreModule/_tests/testDatabase";

import fs from "fs";
import path from "path";
import {ObjectId} from "mongodb";
import request from "supertest";

vi.mock("@coreModule/utilities/middlewares/authMW", async () =>
    (await import("@coreModule/_tests/httpHarness")).authMWStub);
vi.mock("@coreModule/utilities/middlewares/rateLimiter", () => ({
    rateLimiter: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

import {appFor, callerHeader, type TestCaller} from "@coreModule/_tests/httpHarness";
import AuditLog from "@coreModule/database/schemas/auditLog/auditLog";
import Media from "@coreModule/database/schemas/media/media";
import RolePermission from "@coreModule/database/schemas/rolePermission/rolePermission";
import {createRolePermissions} from "@coreModule/database/schemas/rolePermission/rolePermission.default";
import {resolveDefaultRolePermissionIds, type DefaultRoleDefinition} from "@coreModule/database/schemas/role/role.defaults";
import {getLogger} from "@coreModule/loggers/serverLog";
import {asCrossTenant, withTenant} from "@coreModule/utilities/endpoints/tenantScope";
import {runInTransaction} from "@coreModule/utilities/middlewares/runInTransaction";
import {findSensitiveSnippetFields, sensitivePaths} from "@coreModule/utilities/security/sensitiveFields";
// Every dentalClinic model, so the snippet and grant checks see the whole module.
import * as inquiryRoute from "@dentalClinicModule/api/dentalClinic/private/clinicInquiry";
import * as patientRoute from "@dentalClinicModule/api/dentalClinic/private/patient";
import Appointment from "@dentalClinicModule/database/schemas/appointment/appointment";
import ClinicConfig from "@dentalClinicModule/database/schemas/clinicConfig/clinicConfig";
import ClinicInquiry from "@dentalClinicModule/database/schemas/clinicInquiry/clinicInquiry";
import ClinicLocation from "@dentalClinicModule/database/schemas/clinicLocation/clinicLocation";
import ClinicMessage from "@dentalClinicModule/database/schemas/clinicMessage/clinicMessage";
import ClinicService from "@dentalClinicModule/database/schemas/clinicService/clinicService";
import Patient from "@dentalClinicModule/database/schemas/patient/patient";
import PatientTrip from "@dentalClinicModule/database/schemas/patientTrip/patientTrip";
import Practitioner from "@dentalClinicModule/database/schemas/practitioner/practitioner";
import ScheduleException from "@dentalClinicModule/database/schemas/scheduleException/scheduleException";
import TreatmentPlan from "@dentalClinicModule/database/schemas/treatmentPlan/treatmentPlan";
import {dentalClinicDefaultRoles} from "@dentalClinicModule/database/schemas/role/dentalClinic.role.defaults";
import type {IMedicalHistory} from "@dentalClinicModule/database/schemas/shared/medicalHistory";
import {keepMedicalHistory} from "@dentalClinicModule/utilities/services/patientRecords";

const clinicId = new ObjectId();
const asClinic = <T>(fn: () => PromiseLike<T>): Promise<T> => withTenant(clinicId, fn);
const raw = <T>(fn: () => PromiseLike<T>): Promise<T> => asCrossTenant("test reads raw audit entries", async () => fn());
const app = appFor([patientRoute, inquiryRoute].map((route) => ({...route, module: "dentalClinic"})));
const logger = getLogger("clinic_health_data_test");

const DENTAL_MODELS = [Appointment, ClinicConfig, ClinicInquiry, ClinicLocation, ClinicMessage, ClinicService, Patient, PatientTrip, Practitioner, ScheduleException, TreatmentPlan];
/** Values that must never leave a single read: the questionnaire's detail, the medication, the X-ray's name. */
const SECRET_DETAIL = "type 2, insulin";
const SECRET_MEDICATION = "Apixaban 5 mg";
const SECRET_FILE = "opg-giulia.jpg";
const history = (submittedAt: Date, diabetes = "yes"): IMedicalHistory => ({
    version: "2026-10",
    answers: [{question: "diabetes", answer: diabetes === "yes" ? "yes" : "no", ...(diabetes === "yes" ? {detail: SECRET_DETAIL} : {})}],
    medications: SECRET_MEDICATION,
    signedName: "Giulia Bianchi",
    submittedAt,
});

const role = (slug: string): DefaultRoleDefinition => dentalClinicDefaultRoles.find((definition) => definition.slug === slug)!;
/** The permission tags a company's copy of a default role is given. */
async function tagsOf(definition: DefaultRoleDefinition): Promise<string[]> {
    const ids = await resolveDefaultRolePermissionIds(definition);
    const permissions = await RolePermission.find({_id: {$in: ids}}).select("tag").lean();
    return permissions.map((permission) => permission.tag);
}
const isHealthTag = (tag: string) => /^patients\[.*:medicalHistory/.test(tag) || /^clinicinquiries\[.*:(medicalHistory|files)/.test(tag);

let receptionist: TestCaller;
let dentist: TestCaller;
let coordinator: TestCaller;
let patientId: string;
let inquiryId: string;

const readsOf = (documentId: string) => raw(() => AuditLog.find({action: "READ", documentId: new ObjectId(documentId)}).lean());
const post = (caller: TestCaller, path: string, body: Record<string, unknown>) => request(app).post(path).set(callerHeader(caller)).send(body);

beforeAll(async () => {
    await connectTestDatabase();
    await Promise.all(DENTAL_MODELS.map((model) => model.init()));
    // Boot's permission sync: it also refuses to start when a snippet carries a sensitive field.
    await createRolePermissions();
    const caller = async (slug: string): Promise<TestCaller> => ({
        userId: new ObjectId().toString(), companyId: clinicId.toString(), isAdmin: false, permissions: await tagsOf(role(slug)),
    });
    receptionist = await caller("clinic_receptionist");
    dentist = await caller("clinic_dentist");
    coordinator = await caller("clinic_coordinator");
}, 120000);

afterAll(async () => {
    await disconnectTestDatabase();
});

beforeEach(() => asClinic(async () => {
    await Promise.all([Patient, ClinicInquiry, Media].map((model) => model.collection.deleteMany({})));
    await raw(() => AuditLog.deleteMany({}));
    const xray = await Media.create({
        type: "image", originalName: SECRET_FILE, fileName: SECRET_FILE, mimeType: "image/jpeg", extension: ".jpg",
        metadata: {size: 10, extension: ".jpg", mime: "image/jpeg", safeCheckedFlag: true}, company: clinicId,
    });
    const patient = await Patient.create({
        company: clinicId, number: "PT-1", firstName: "Giulia", lastName: "Bianchi", preferredLanguage: "it-IT", source: "portal", medicalHistory: history(new Date()),
    });
    const inquiry = await ClinicInquiry.create({
        company: clinicId, number: "INQ-1", source: "phone", status: "new", contact: {firstName: "Giulia", lastName: "Bianchi", preferredLanguage: "it-IT"},
        contactShared: true, files: [xray._id], medicalHistory: history(new Date()), idempotencyKey: new ObjectId().toString(), timeline: [],
    });
    patientId = patient._id.toString();
    inquiryId = inquiry._id.toString();
}));

describe("which fields are health data (D56)", () => {
    it("tags the medical history in folders and requests, and a request's X-rays and photos", () => {
        expect([...sensitivePaths(Patient.schema)]).toEqual([["medicalHistory", "health"]]);
        expect([...sensitivePaths(ClinicInquiry.schema)].sort()).toEqual([["files", "health"], ["medicalHistory", "health"]]);
    });

    it("keeps them out of every snippet, so no list, notification or other module carries them", () => {
        expect(findSensitiveSnippetFields()).toEqual([]);
    });

    it("grants them to the roles that treat or quote, and never to the receptionist", () => asClinic(async () => {
        const receptionistTags = await tagsOf(role("clinic_receptionist"));
        expect(receptionistTags.filter(isHealthTag)).toEqual([]);
        // The receptionist still keeps the folders themselves.
        expect(receptionistTags.some((tag) => /^patients\[.*:lastName/.test(tag))).toBe(true);

        for (const slug of ["clinic_admin", "clinic_dentist", "clinic_coordinator"]) {
            const tags = await tagsOf(role(slug));
            expect(tags.some((tag) => /^patients\[read.*:medicalHistory/.test(tag)), slug).toBe(true);
            expect(tags.some((tag) => /^clinicinquiries\[read.*:files/.test(tag)), slug).toBe(true);
        }
    }));
});

describe("reading health data", {timeout: 60000}, () => {
    it("records who opened a folder's medical history, without the answers", () => asClinic(async () => {
        const opened = await post(dentist, "/api/dentalClinic/patient/single", {_id: patientId});
        expect(opened.body.medicalHistory.medications).toBe(SECRET_MEDICATION);

        const reads = await readsOf(patientId);
        expect(reads).toHaveLength(1);
        expect(reads[0]).toMatchObject({collectionName: "patients", diff: {medicalHistory: {from: null, to: null}}});
        expect(String(reads[0]!.actorId)).toBe(dentist.userId);
        expect(JSON.stringify(reads)).not.toContain(SECRET_MEDICATION);
    }));

    it("records the request's X-rays and history as one read", () => asClinic(async () => {
        const opened = await post(coordinator, "/api/dentalClinic/clinicInquiry/single", {_id: inquiryId});
        expect(opened.body.files).toHaveLength(1);
        const reads = await readsOf(inquiryId);
        expect(reads).toHaveLength(1);
        expect(Object.keys(reads[0]!.diff).sort()).toEqual(["files", "medicalHistory"]);
        expect(String(reads[0]!.actorId)).toBe(coordinator.userId);
    }));

    it("never sends health data in a list, and a list is not a read of it", () => asClinic(async () => {
        const patients = await post(dentist, "/api/dentalClinic/patient", {limit: 10, offset: 0});
        const inquiries = await post(coordinator, "/api/dentalClinic/clinicInquiry", {limit: 10, offset: 0});
        expect(patients.body.data).toHaveLength(1);
        expect(inquiries.body.data).toHaveLength(1);
        expect(patients.body.data[0].medicalHistory).toBeUndefined();
        expect(inquiries.body.data[0]).toMatchObject({number: "INQ-1"});
        expect(inquiries.body.data[0].files).toBeUndefined();
        expect(inquiries.body.data[0].medicalHistory).toBeUndefined();
        for (const body of [patients.body, inquiries.body]) {
            for (const secret of [SECRET_DETAIL, SECRET_MEDICATION, SECRET_FILE]) expect(JSON.stringify(body)).not.toContain(secret);
        }
        expect(await raw(() => AuditLog.countDocuments({action: "READ"}))).toBe(0);
    }));

    it("shows the receptionist the folder and the request without them, and records nothing", () => asClinic(async () => {
        const folder = await post(receptionist, "/api/dentalClinic/patient/single", {_id: patientId});
        expect(folder.body).toMatchObject({firstName: "Giulia", lastName: "Bianchi"});
        const inquiry = await post(receptionist, "/api/dentalClinic/clinicInquiry/single", {_id: inquiryId});
        expect(inquiry.body).toMatchObject({number: "INQ-1"});
        for (const body of [folder.body, inquiry.body]) {
            expect(body.medicalHistory).toBeUndefined();
            for (const secret of [SECRET_DETAIL, SECRET_MEDICATION, SECRET_FILE]) expect(JSON.stringify(body)).not.toContain(secret);
        }
        expect(inquiry.body.files).toBeUndefined();
        expect(await raw(() => AuditLog.countDocuments({action: "READ"}))).toBe(0);
    }));
});

describe("the folder's questionnaire", {timeout: 60000}, () => {
    it("keeps the newest one: an older questionnaire never replaces it", () => asClinic(async () => {
        const keep = (answers: IMedicalHistory) => runInTransaction(logger, async (session) => {
            const patient = await Patient.findById(patientId).session(session);
            await keepMedicalHistory(patient!, answers, {session, logger, languageCode: "en-US"});
        });
        const stored = (await Patient.findById(patientId))!.medicalHistory!.submittedAt;

        await keep(history(new Date(stored.getTime() - 86400000), "no"));
        expect((await Patient.findById(patientId))!.medicalHistory!.answers[0]!.answer).toBe("yes");

        await keep(history(new Date(stored.getTime() + 86400000), "no"));
        const newer = (await Patient.findById(patientId))!.medicalHistory!;
        expect(newer.answers[0]).toMatchObject({question: "diabetes", answer: "no"});
        expect(newer.answers[0]!.detail).toBeUndefined();
    }));
});

// Keeps the model list honest: a new dentalClinic model must be added above to be checked.
it("checks every dentalClinic model", () => {
    const schemaDirs = fs.readdirSync(path.join(__dirname, "../database/schemas")).filter((name) => !["role", "shared"].includes(name));
    const lowerFirst = (name: string) => name.charAt(0).toLowerCase() + name.slice(1);
    expect(DENTAL_MODELS.map((model) => lowerFirst(model.modelName)).sort()).toEqual(schemaDirs.sort());
});
