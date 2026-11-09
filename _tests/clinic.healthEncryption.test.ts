import {afterAll, beforeAll, beforeEach, describe, expect, it, vi} from "vitest";
import {connectTestDatabase, disconnectTestDatabase} from "@coreModule/_tests/testDatabase";
import mongoose from "mongoose";
import {ObjectId} from "mongodb";
import request from "supertest";

vi.mock("@coreModule/utilities/middlewares/authMW", async () =>
    (await import("@coreModule/_tests/httpHarness")).authMWStub);
vi.mock("@coreModule/utilities/middlewares/rateLimiter", () => ({
    rateLimiter: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

import {appFor, callerHeader, type TestCaller} from "@coreModule/_tests/httpHarness";
import * as auditLogRoute from "@coreModule/api/auxiliary/private/auditLog";
import AuditLog from "@coreModule/database/schemas/auditLog/auditLog";
import RolePermission from "@coreModule/database/schemas/rolePermission/rolePermission";
import {createRolePermissions} from "@coreModule/database/schemas/rolePermission/rolePermission.default";
import {resolveDefaultRolePermissionIds, type DefaultRoleDefinition} from "@coreModule/database/schemas/role/role.defaults";
import {getLogger} from "@coreModule/loggers/serverLog";
import {asCrossTenant, withTenant} from "@coreModule/utilities/endpoints/tenantScope";
import {erasePersonInCompany, erasureSubject, loadPersonErasers} from "@coreModule/utilities/erasure/personErasure";
import {runInTransaction} from "@coreModule/utilities/middlewares/runInTransaction";
import {isHealthCiphertext} from "@coreModule/utilities/security/healthDataCrypto";
import type {ModuleEnvironmentContext} from "@coreModule/environment/validator";
import * as inquiryRoute from "@dentalClinicModule/api/dentalClinic/private/clinicInquiry";
import * as patientRoute from "@dentalClinicModule/api/dentalClinic/private/patient";
import ClinicInquiry from "@dentalClinicModule/database/schemas/clinicInquiry/clinicInquiry";
import Patient from "@dentalClinicModule/database/schemas/patient/patient";
import {dentalClinicDefaultRoles} from "@dentalClinicModule/database/schemas/role/dentalClinic.role.defaults";
import type {IMedicalHistory} from "@dentalClinicModule/database/schemas/shared/medicalHistory";
import {keepMedicalHistory} from "@dentalClinicModule/utilities/services/patientRecords";
import {validateEnvironment} from "@dentalClinicModule/environment.validator";

const clinicId = new ObjectId();
const otherClinicId = new ObjectId();
const asClinic = <T>(fn: () => PromiseLike<T>): Promise<T> => withTenant(clinicId, fn);
const raw = <T>(fn: () => PromiseLike<T>): Promise<T> => asCrossTenant("test reads raw documents", async () => fn());
const app = appFor([
    ...[patientRoute, inquiryRoute].map((route) => ({...route, module: "dentalClinic"})),
    {...auditLogRoute, module: "core"},
]);
const logger = getLogger("clinic_health_encryption_test");

const EMAIL = "giulia@example.com";
const SECRET_DETAIL = "type 2, insulin";
const SECRET_MEDICATION = "Apixaban 5 mg";
const history = (submittedAt: Date, medications = SECRET_MEDICATION): IMedicalHistory => ({
    version: "2026-10",
    answers: [{question: "diabetes", answer: "yes", detail: SECRET_DETAIL}],
    medications,
    signedName: "Giulia Bianchi",
    submittedAt,
});

const role = (slug: string): DefaultRoleDefinition => dentalClinicDefaultRoles.find((definition) => definition.slug === slug)!;
async function tagsOf(definition: DefaultRoleDefinition): Promise<string[]> {
    const ids = await resolveDefaultRolePermissionIds(definition);
    return (await RolePermission.find({_id: {$in: ids}}).select("tag").lean()).map((permission) => permission.tag);
}

let receptionist: TestCaller;
let dentist: TestCaller;
let patientId: ObjectId;
let inquiryId: ObjectId;

const post = (caller: TestCaller, path: string, body: Record<string, unknown>) => request(app).post(path).set(callerHeader(caller)).send(body);
const timeline = (caller: TestCaller, documentId: ObjectId, collectionName: string) =>
    request(app).get("/api/auxiliary/auditLog/document").query({documentId: documentId.toString(), collectionName}).set(callerHeader(caller));
const stored = (model: typeof Patient | typeof ClinicInquiry, _id: ObjectId) => raw(() => model.collection.findOne({_id}));

beforeAll(async () => {
    await connectTestDatabase();
    // Erasers (and their models) first, then every index: one built inside the erasure's transaction would abort it.
    await loadPersonErasers();
    await Promise.all(Object.values(mongoose.models).map((model) => model.init()));
    await createRolePermissions();
    const caller = async (slug: string): Promise<TestCaller> => ({
        userId: new ObjectId().toString(), companyId: clinicId.toString(), isAdmin: false, permissions: await tagsOf(role(slug)), modules: ["dentalClinic"],
    });
    receptionist = await caller("clinic_receptionist");
    dentist = await caller("clinic_dentist");
}, 120000);

afterAll(async () => {
    await disconnectTestDatabase();
});

beforeEach(() => asClinic(async () => {
    await raw(async () => {
        for (const model of [Patient, ClinicInquiry, AuditLog]) await model.collection.deleteMany({});
    });
    const patient = await Patient.create({
        company: clinicId, number: "PT-1", firstName: "Giulia", lastName: "Bianchi", email: EMAIL, preferredLanguage: "it-IT", source: "portal",
        medicalHistory: history(new Date("2026-10-01T09:00:00Z")),
    });
    const inquiry = await ClinicInquiry.create({
        company: clinicId, number: "INQ-1", source: "phone", status: "new", contact: {firstName: "Giulia", lastName: "Bianchi", email: EMAIL, preferredLanguage: "it-IT"},
        contactShared: true, files: [], medicalHistory: history(new Date("2026-10-01T09:00:00Z")), idempotencyKey: new ObjectId().toString(), timeline: [],
    });
    patientId = patient._id;
    inquiryId = inquiry._id;
}));

describe("medical histories at rest (D102)", {timeout: 60000}, () => {
    it("stores no plaintext in the folder or the request", async () => {
        for (const document of [await stored(Patient, patientId), await stored(ClinicInquiry, inquiryId)]) {
            expect(isHealthCiphertext(document?.medicalHistory)).toBe(true);
            for (const secret of [SECRET_DETAIL, SECRET_MEDICATION, "Giulia Bianchi\""]) expect(JSON.stringify(document?.medicalHistory)).not.toContain(secret);
        }
    });

    it("gives a dentist the same plaintext through the folder and the request, and records the read", async () => {
        const folder = await post(dentist, "/api/dentalClinic/patient/single", {_id: patientId.toString()});
        expect(folder.status).toBe(200);
        expect(folder.body.medicalHistory).toMatchObject({
            version: "2026-10", medications: SECRET_MEDICATION, signedName: "Giulia Bianchi",
            answers: [{question: "diabetes", answer: "yes", detail: SECRET_DETAIL}],
        });
        expect(new Date(folder.body.medicalHistory.submittedAt).toISOString()).toBe("2026-10-01T09:00:00.000Z");

        const coordinator: TestCaller = {...dentist, userId: new ObjectId().toString(), permissions: await tagsOf(role("clinic_coordinator"))};
        const inquiryRead = await post(coordinator, "/api/dentalClinic/clinicInquiry/single", {_id: inquiryId.toString()});
        expect(inquiryRead.body.medicalHistory).toMatchObject({medications: SECRET_MEDICATION});

        const reads = await raw(() => AuditLog.find({action: "READ"}).lean());
        expect(reads.map((entry) => entry.collectionName).sort()).toEqual(["clinicinquiries", "patients"]);
    });

    it("still shows the receptionist nothing, and lists carry none of it", async () => {
        const folder = await post(receptionist, "/api/dentalClinic/patient/single", {_id: patientId.toString()});
        expect(folder.body).toMatchObject({firstName: "Giulia"});
        expect(folder.body.medicalHistory).toBeUndefined();
        const list = await post(dentist, "/api/dentalClinic/patient", {limit: 10, offset: 0});
        expect(list.body.data).toHaveLength(1);
        expect(list.body.data[0].medicalHistory).toBeUndefined();
        for (const body of [folder.body, list.body]) {
            expect(JSON.stringify(body)).not.toContain(SECRET_MEDICATION);
            expect(JSON.stringify(body)).not.toContain("hfe1.");
        }
    });

    it("answers a tampered or moved history with health_data_unreadable, not a 500", async () => {
        const sealed = String((await stored(Patient, patientId))?.medicalHistory);
        const at = sealed.length - 10;
        await raw(() => Patient.collection.updateOne({_id: patientId}, {$set: {medicalHistory: `${sealed.slice(0, at)}${sealed[at] === "A" ? "B" : "A"}${sealed.slice(at + 1)}`}}));
        const tampered = await post(dentist, "/api/dentalClinic/patient/single", {_id: patientId.toString()});
        expect(tampered.status).toBe(409);
        expect(tampered.body.error_code).toBe("health_data_unreadable");

        // The request's history put into another clinic's folder: another record, another company's key.
        const otherFolder = await withTenant(otherClinicId, () => Patient.create({
            company: otherClinicId, number: "PT-9", firstName: "Marco", lastName: "Rossi", preferredLanguage: "it-IT", source: "portal", medicalHistory: history(new Date()),
        }));
        await raw(() => Patient.collection.updateOne({_id: otherFolder._id}, {$set: {medicalHistory: sealed}}));
        const otherDentist: TestCaller = {...dentist, companyId: otherClinicId.toString()};
        const moved = await post(otherDentist, "/api/dentalClinic/patient/single", {_id: otherFolder._id.toString()});
        expect(moved.status).toBe(409);
        expect(moved.body.error_code).toBe("health_data_unreadable");
    });

    it("reads a history stored before encryption and encrypts it on the folder's next save", async () => {
        const legacyId = new ObjectId();
        await raw(() => Patient.collection.insertOne({
            _id: legacyId, company: clinicId, number: "PT-2", firstName: "Anna", lastName: "Neri", preferredLanguage: "it-IT", source: "portal",
            medicalHistory: history(new Date("2026-09-01T09:00:00Z")), deletedAt: null,
        }));
        const read = await post(dentist, "/api/dentalClinic/patient/single", {_id: legacyId.toString()});
        expect(read.body.medicalHistory).toMatchObject({medications: SECRET_MEDICATION});

        await asClinic(async () => {
            const folder = await Patient.findById(legacyId);
            folder!.set("notes", "called back");
            await folder!.save();
        });
        const after = await stored(Patient, legacyId);
        expect(isHealthCiphertext(after?.medicalHistory)).toBe(true);
        expect(JSON.stringify(after)).not.toContain(SECRET_MEDICATION);
    });

    it("keeps the change history sealed, and shows it only to a reader of the history", async () => {
        await asClinic(() => runInTransaction(logger, async (session) => {
            const folder = await Patient.findById(patientId).session(session);
            await keepMedicalHistory(folder!, history(new Date("2026-11-01T09:00:00Z"), "Metformin 500 mg"), {session, logger, languageCode: "en-US"});
        }));
        const entries = await raw(() => AuditLog.find({documentId: patientId}).lean());
        expect(entries.some((entry) => entry.action === "UPDATE" && entry.diff.medicalHistory)).toBe(true);
        for (const secret of [SECRET_MEDICATION, "Metformin", SECRET_DETAIL]) expect(JSON.stringify(entries)).not.toContain(secret);

        const forDentist = await timeline(dentist, patientId, "patients");
        expect(forDentist.status).toBe(200);
        const change = forDentist.body.entries.flatMap((entry: {changes: {field: string; from: unknown; to: unknown}[]}) => entry.changes)
            .find((candidate: {field: string; from: unknown}) => candidate.field === "medicalHistory" && candidate.from);
        expect(change).toMatchObject({from: {medications: SECRET_MEDICATION}, to: {medications: "Metformin 500 mg"}});

        const forReceptionist = await timeline(receptionist, patientId, "patients");
        expect(forReceptionist.status).toBe(200);
        expect(forReceptionist.body.entries.length).toBeGreaterThan(0);
        expect(JSON.stringify(forReceptionist.body)).not.toContain("Metformin");
        expect(JSON.stringify(forReceptionist.body)).not.toContain("medicalHistory");
    });

    it("erasure still deletes the encrypted history and blanks it in the change history", async () => {
        await asClinic(() => runInTransaction(logger, async (session) => {
            const folder = await Patient.findById(patientId).session(session);
            await keepMedicalHistory(folder!, history(new Date("2026-11-01T09:00:00Z"), "Metformin 500 mg"), {session, logger, languageCode: "en-US"});
        }));
        await withTenant(clinicId, () => runInTransaction(logger, (session) => erasePersonInCompany({
            companyId: clinicId, subject: erasureSubject({emails: [EMAIL]}), preview: false, actorId: new ObjectId(), session, logger,
        })));
        expect((await stored(Patient, patientId))?.medicalHistory).toBeUndefined();
        expect((await stored(ClinicInquiry, inquiryId))?.medicalHistory).toBeUndefined();
        const changes = await raw(() => AuditLog.find({documentId: patientId, action: {$in: ["CREATE", "UPDATE"]}}).lean());
        expect(changes.some((entry) => entry.diff.medicalHistory)).toBe(true);
        for (const entry of changes) {
            if (entry.diff.medicalHistory) expect(entry.diff.medicalHistory).toEqual({from: null, to: null});
        }
    });

    it("refuses to start without the master key", () => {
        const ctx = (env: NodeJS.ProcessEnv): ModuleEnvironmentContext => ({
            env, kafkaEnabled: false,
            validateString: (key, value, required) => (required && !value ? {key, message: "missing"} : null),
            validateNumber: () => null, validateBoolean: () => null, validateArray: () => null,
        });
        expect(validateEnvironment(ctx({})).map((error) => error.key)).toEqual(["HEALTH_DATA_MASTER_KEY"]);
        expect(validateEnvironment(ctx({HEALTH_DATA_MASTER_KEY: Buffer.alloc(32, 1).toString("base64")}))).toEqual([]);
    });
});
