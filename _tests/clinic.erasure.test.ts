import {afterAll, beforeAll, beforeEach, describe, expect, it, vi} from "vitest";
import {connectTestDatabase, disconnectTestDatabase} from "@coreModule/_tests/testDatabase";
import mongoose from "mongoose";
import {ObjectId} from "mongodb";

const {deletedFiles} = vi.hoisted(() => ({deletedFiles: [] as string[]}));
vi.mock("@coreModule/utilities/gridfs/gridfsStorage", () => ({
    getGridFSStorage: () => ({deleteFile: async (id: string) => void deletedFiles.push(id)}),
}));

import {getLogger} from "@coreModule/loggers/serverLog";
import {erasePersonInCompany, erasureSubject, loadPersonErasers} from "@coreModule/utilities/erasure/personErasure";
import {asCrossTenant, withTenant} from "@coreModule/utilities/endpoints/tenantScope";
import {runInTransaction} from "@coreModule/utilities/middlewares/runInTransaction";
import Media from "@coreModule/database/schemas/media/media";
import AuditLog from "@coreModule/database/schemas/auditLog/auditLog";
import Patient from "@dentalClinicModule/database/schemas/patient/patient";
import ClinicInquiry from "@dentalClinicModule/database/schemas/clinicInquiry/clinicInquiry";
import ClinicMessage from "@dentalClinicModule/database/schemas/clinicMessage/clinicMessage";
import TreatmentPlan from "@dentalClinicModule/database/schemas/treatmentPlan/treatmentPlan";

const clinicId = new ObjectId();
const adminId = new ObjectId();
const EMAIL = "giulia@example.com";
const logger = getLogger("clinic_erasure_test");
const raw = <T>(fn: () => Promise<T>) => asCrossTenant("test reads raw collections", fn);
const history = {version: "2026-10", answers: [{question: "diabetes", answer: "yes", detail: "type 2"}], signedName: "Giulia Bianchi", submittedAt: new Date()};
const ids = {patient: new ObjectId(), oldInquiry: new ObjectId(), phoneLead: new ObjectId(), message: new ObjectId(), plan: new ObjectId(), xray: new ObjectId(), xrayFile: new ObjectId()};
const DELETED = {deletedAt: new Date("2026-01-01T00:00:00Z")};
const ACCEPTED_AT = new Date("2026-09-01T10:00:00Z");
const HASH = "a".repeat(64);

/** As the clinic's admin erases from the privacy screen: in the clinic's tenant, in one transaction. */
const erase = () => withTenant(clinicId, () => runInTransaction(logger, (session) => erasePersonInCompany({
    companyId: clinicId, subject: erasureSubject({emails: [EMAIL]}), preview: false, actorId: adminId, session, logger,
})));

beforeAll(async () => {
    await connectTestDatabase();
    // Every module's eraser (and so its models) first, then every index: one created inside the erasure's
    // transaction would abort it.
    await loadPersonErasers();
    await Promise.all(Object.values(mongoose.models).map((model) => model.init()));
}, 120000);

afterAll(async () => {
    await disconnectTestDatabase();
});

beforeEach(async () => {
    deletedFiles.length = 0;
    await raw(async () => {
        for (const model of [Patient, ClinicInquiry, ClinicMessage, TreatmentPlan, Media, AuditLog]) await model.collection.deleteMany({});
        // A folder staff deleted, found by its email; everything else hangs off it.
        await Patient.collection.insertOne({_id: ids.patient, company: clinicId, number: "PT-1", firstName: "Giulia", lastName: "Bianchi", email: EMAIL, phone: "+39 1", medicalHistory: history, preferredLanguage: "it-IT", ...DELETED});
        await Media.collection.insertOne({_id: ids.xray, company: clinicId, fileId: ids.xrayFile, type: "image", ...DELETED});
        await ClinicInquiry.collection.insertMany([
            // An old request staff deleted, still holding her X-ray and history.
            {_id: ids.oldInquiry, company: clinicId, number: "INQ-1", source: "portal", contact: {firstName: "Giulia", lastName: "B.", email: EMAIL, preferredLanguage: "it-IT"}, files: [ids.xray], medicalHistory: history, description: "implant pain", idempotencyKey: "k-1", ...DELETED},
            // A phone lead without her email: found through the folder it was converted into.
            {_id: ids.phoneLead, company: clinicId, number: "INQ-2", source: "phone", contact: {firstName: "Giulia", lastName: "Bianchi", phone: "+39 1", preferredLanguage: "it-IT"}, patient: ids.patient, medicalHistory: history, files: [], idempotencyKey: "k-2", deletedAt: null},
        ]);
        await ClinicMessage.collection.insertOne({_id: ids.message, company: clinicId, inquiry: ids.oldInquiry, from: "patient", body: "it still hurts", attachments: [], ...DELETED});
        // The accepted, paid quote: a record the clinic must keep.
        await TreatmentPlan.collection.insertOne({
            _id: ids.plan, company: clinicId, number: "TP-1", status: "accepted", patient: ids.patient, version: 1, currency: new ObjectId(),
            phases: [{title: "Implants", visits: 2, estimatedDays: 5}],
            lines: [{phase: 1, kind: "treatment", name: "Implant", teeth: ["36"], quantity: 1, unitPrice: 700}],
            depositType: "fixed", depositValue: 70, totals: {subtotal: 700, discount: 0, total: 700, deposit: 70},
            paymentStatus: "paid", amountPaid: 700, timeline: [], deletedAt: null,
            acceptance: {name: "Giulia Bianchi", at: ACCEPTED_AT, ip: "203.0.113.7", userAgent: "Mozilla/5.0 (iPhone)", contentHash: HASH},
        });
        // Her signature as the change history recorded it.
        await AuditLog.collection.insertOne({company: clinicId, collectionName: "treatmentplans", documentId: ids.plan, action: "UPDATE", diff: {acceptance: {from: null, to: {name: "Giulia Bianchi", ip: "203.0.113.7"}}}});
        // Someone opened her history last month: who and when stay on record (the entry holds no values).
        await AuditLog.collection.insertOne({company: clinicId, collectionName: "patients", documentId: ids.patient, actorId: new ObjectId(), action: "READ", diff: {medicalHistory: {from: null, to: null}}});
    });
});

describe("erasing a patient (D57)", {timeout: 60000}, () => {
    it("reaches records staff had deleted: their health data and files go for good", async () => {
        await erase();

        const folder = (await raw(() => Patient.collection.findOne({_id: ids.patient})))!;
        expect(folder).toMatchObject({firstName: "Erased", lastName: "person", number: "PT-1"});
        expect(folder.medicalHistory).toBeUndefined();
        expect(folder.email).toBeUndefined();

        const old = (await raw(() => ClinicInquiry.collection.findOne({_id: ids.oldInquiry})))!;
        expect(old.medicalHistory).toBeUndefined();
        expect(old.description).toBeUndefined();
        expect(old.files).toEqual([]);
        expect(await raw(() => ClinicMessage.collection.countDocuments({}))).toBe(0);
        expect(await raw(() => Media.collection.countDocuments({}))).toBe(0);
        expect(deletedFiles).toEqual([ids.xrayFile.toString()]);
    });

    it("anonymises a lead found only through her folder", async () => {
        await erase();
        const lead = (await raw(() => ClinicInquiry.collection.findOne({_id: ids.phoneLead})))!;
        expect(lead.contact).toEqual({firstName: "Erased", lastName: "person", preferredLanguage: "it-IT"});
        expect(lead.medicalHistory).toBeUndefined();
        expect(lead.number).toBe("INQ-2");
    });

    it("keeps the accepted quote's numbers, lines and payments, pointing at the anonymised folder", async () => {
        await erase();
        const plan = (await raw(() => TreatmentPlan.collection.findOne({_id: ids.plan})))!;
        expect(plan).toMatchObject({
            number: "TP-1", status: "accepted", paymentStatus: "paid", amountPaid: 700,
            totals: {subtotal: 700, discount: 0, total: 700, deposit: 70},
            lines: [expect.objectContaining({name: "Implant", unitPrice: 700, teeth: ["36"]})],
        });
        expect(String(plan.patient)).toBe(ids.patient.toString());
    });

    it("keeps the proof the quote was accepted but not who signed it (D89)", async () => {
        await erase();
        const plan = (await raw(() => TreatmentPlan.collection.findOne({_id: ids.plan})))!;
        expect(plan.acceptance).toEqual({name: "Erased person", at: ACCEPTED_AT, contentHash: HASH});

        const history = (await raw(() => AuditLog.collection.findOne({documentId: ids.plan, action: "UPDATE"})))!;
        expect(history.diff).toEqual({acceptance: {from: null, to: null}});
        expect(await raw(() => AuditLog.collection.countDocuments({documentId: ids.plan, action: "ERASE"}))).toBe(1);
        expect(JSON.stringify(await raw(() => AuditLog.collection.find({}).toArray()))).not.toContain("203.0.113.7");
    });

    it("keeps who read the history and when, and records the erasure by the admin", async () => {
        await erase();
        const reads = await raw(() => AuditLog.collection.find({action: "READ"}).toArray());
        expect(reads).toHaveLength(1);
        expect(reads[0]!.diff).toEqual({medicalHistory: {from: null, to: null}});
        const erasures = await raw(() => AuditLog.collection.find({action: "ERASE", documentId: ids.patient}).toArray());
        expect(erasures).toHaveLength(1);
        expect(String(erasures[0]!.actorId)).toBe(adminId.toString());
        expect(JSON.stringify(await raw(() => AuditLog.collection.find({}).toArray()))).not.toContain("type 2");
    });
});
