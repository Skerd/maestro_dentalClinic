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
const {deletedFiles} = vi.hoisted(() => ({deletedFiles: [] as string[]}));
vi.mock("@coreModule/utilities/gridfs/gridfsStorage", () => ({
    getGridFSStorage: () => ({deleteFile: async (id: string) => void deletedFiles.push(id)}),
}));

import {appFor, callerHeader, type TestCaller} from "@coreModule/_tests/httpHarness";
import * as privacyRoute from "@coreModule/api/company/private/privacy";
import {loadPersonErasers} from "@coreModule/utilities/erasure/personErasure";
import {asCrossTenant} from "@coreModule/utilities/endpoints/tenantScope";
import Media from "@coreModule/database/schemas/media/media";
import AuditLog from "@coreModule/database/schemas/auditLog/auditLog";
import User from "@coreModule/database/schemas/user/user";
import Patient from "@dentalClinicModule/database/schemas/patient/patient";
import ClinicInquiry from "@dentalClinicModule/database/schemas/clinicInquiry/clinicInquiry";
import ClinicMessage from "@dentalClinicModule/database/schemas/clinicMessage/clinicMessage";
import Appointment from "@dentalClinicModule/database/schemas/appointment/appointment";
import PatientTrip from "@dentalClinicModule/database/schemas/patientTrip/patientTrip";

const clinicA = new ObjectId();
const clinicB = new ObjectId();
const accountId = new ObjectId();
const otherAccountId = new ObjectId();
const EMAIL = "giulia@example.com";
const app = appFor([{...privacyRoute, module: "core"}]);
const admin: TestCaller = {userId: new ObjectId().toString(), companyId: clinicA.toString(), isAdmin: true, modules: ["core", "dentalClinic"]};
const staff: TestCaller = {userId: new ObjectId().toString(), companyId: clinicA.toString(), isAdmin: false, modules: ["core", "dentalClinic"]};
// An admin of a company none of whose modules can erase a person.
const shopAdmin: TestCaller = {userId: new ObjectId().toString(), companyId: clinicA.toString(), isAdmin: true, modules: ["core", "propertyDevelopment"]};

const ids = {marco: new ObjectId(), patient: new ObjectId(), otherPatient: new ObjectId(), inquiry: new ObjectId(), message: new ObjectId(), appointment: new ObjectId(), trip: new ObjectId(), xray: new ObjectId(), photo: new ObjectId()};
const files = {xray: new ObjectId(), photo: new ObjectId()};
const history = {version: "2026-10", answers: [{question: "diabetes", answer: "yes", detail: "type 2"}], signedName: "Giulia Bianchi", submittedAt: new Date()};
const erase = (caller: TestCaller, preview: boolean) =>
    request(app).post("/api/privacy/erasePerson").set(callerHeader(caller)).send({email: EMAIL, preview});
const raw = <T>(fn: () => Promise<T>) => asCrossTenant("test reads raw collections", fn);

beforeAll(async () => {
    await connectTestDatabase();
    // Every module's eraser (and so its models) first, then every index: a collection or index created while the
    // erasure's transaction is open aborts it.
    await loadPersonErasers();
    await Promise.all(Object.values(mongoose.models).map((model) => model.init()));
}, 120000);

afterAll(async () => {
    await disconnectTestDatabase();
});

beforeEach(async () => {
    deletedFiles.length = 0;
    await raw(async () => {
        for (const model of [Patient, ClinicInquiry, ClinicMessage, Appointment, PatientTrip, Media, AuditLog, User]) await model.collection.deleteMany({});
        // Another person in the same clinic, with an account too: the erasure must not reach them.
        await User.collection.insertMany([
            {_id: accountId, username: EMAIL, name: "Giulia"},
            {_id: otherAccountId, username: "marco@example.com", name: "Marco"},
        ]);
        await Patient.collection.insertMany([
            {_id: ids.patient, company: clinicA, number: "PT-1", firstName: "Giulia", lastName: "Bianchi", email: EMAIL, phone: "+39 1", account: accountId, medicalHistory: history, notes: "nervous", preferredLanguage: "it-IT", deletedAt: null},
            {_id: ids.marco, company: clinicA, number: "PT-2", firstName: "Marco", lastName: "Rossi", email: "marco@example.com", account: otherAccountId, medicalHistory: history, preferredLanguage: "it-IT", deletedAt: null},
            {_id: ids.otherPatient, company: clinicB, number: "PT-9", firstName: "Giulia", lastName: "Bianchi", email: EMAIL, medicalHistory: history, preferredLanguage: "it-IT", deletedAt: null},
        ]);
        await Media.collection.insertMany([
            {_id: ids.xray, company: clinicA, fileId: files.xray, type: "image", deletedAt: null},
            {_id: ids.photo, company: clinicA, fileId: files.photo, type: "image", deletedAt: null},
        ]);
        await ClinicInquiry.collection.insertOne({_id: ids.inquiry, company: clinicA, number: "INQ-1", account: accountId, contact: {firstName: "Giulia", lastName: "B.", email: EMAIL, preferredLanguage: "it-IT"}, description: "my implant hurts", files: [ids.xray], medicalHistory: history, patient: ids.patient, deletedAt: null});
        await ClinicMessage.collection.insertOne({_id: ids.message, company: clinicA, inquiry: ids.inquiry, from: "patient", body: "here is a photo", attachments: [ids.photo], deletedAt: null});
        await Appointment.collection.insertOne({_id: ids.appointment, company: clinicA, number: "AP-1", customer: accountId, patientRecord: ids.patient, patient: {firstName: "Giulia", lastName: "Bianchi", email: EMAIL, phone: "+39 1"}, note: "allergic", deletedAt: null});
        await PatientTrip.collection.insertOne({_id: ids.trip, company: clinicA, patient: ids.patient, arrivalFlight: "LH123", deletedAt: null});
        await AuditLog.collection.insertOne({company: clinicA, collectionName: "patients", documentId: ids.patient, action: "UPDATE", diff: {medicalHistory: {from: null, to: history}, notes: {from: null, to: "nervous"}}});
    });
});

describe("person erasure (D57)", {timeout: 60000}, () => {
    it("is for admins of a company with a module that can erase a person", async () => {
        const refused = await erase(staff, false);
        expect(refused.body.error_code).toBe("user_permissions_not_sufficient");
        expect((await erase(shopAdmin, false)).body.error_code).toBe("user_permissions_not_sufficient");
        expect((await raw(() => Patient.collection.findOne({_id: ids.patient})))!.email).toBe(EMAIL);
    });

    it("previews what it would erase without changing anything", async () => {
        const preview = await erase(admin, true);
        expect(preview.status).toBe(200);
        expect(preview.body.counts).toEqual(expect.arrayContaining([
            {collection: "patients", anonymised: 1, deleted: 0},
            {collection: "clinicinquiries", anonymised: 1, deleted: 0},
            {collection: "clinicmessages", anonymised: 0, deleted: 1},
            {collection: "appointments", anonymised: 1, deleted: 0},
            {collection: "patienttrips", anonymised: 0, deleted: 1},
            {collection: "media", anonymised: 0, deleted: 2},
        ]));
        expect((await raw(() => Patient.collection.findOne({_id: ids.patient})))!.medicalHistory).toBeTruthy();
        expect(await raw(() => ClinicMessage.collection.countDocuments({}))).toBe(1);
    });

    it("anonymises kept records, deletes health data and files for good, and blanks old audit values; other clinics keep theirs", async () => {
        const erased = await erase(admin, false);
        expect(erased.body.error_code ?? "ok").toBe("ok");
        expect(erased.status).toBe(200);

        const patient = (await raw(() => Patient.collection.findOne({_id: ids.patient})))!;
        expect(patient).toMatchObject({firstName: "Erased", lastName: "person", number: "PT-1"});
        for (const field of ["email", "phone", "account", "medicalHistory", "notes"]) expect(patient[field]).toBeUndefined();

        const inquiry = (await raw(() => ClinicInquiry.collection.findOne({_id: ids.inquiry})))!;
        expect(inquiry.contact).toEqual({firstName: "Erased", lastName: "person", preferredLanguage: "it-IT"});
        expect(inquiry.files).toEqual([]);
        expect(inquiry.medicalHistory).toBeUndefined();
        expect(inquiry.description).toBeUndefined();

        const appointment = (await raw(() => Appointment.collection.findOne({_id: ids.appointment})))!;
        expect(appointment.patient).toEqual({firstName: "Erased", lastName: "person", email: "erased@erased.invalid", phone: "-"});
        expect(appointment.customer).toBeUndefined();

        expect(await raw(() => ClinicMessage.collection.countDocuments({}))).toBe(0);
        expect(await raw(() => PatientTrip.collection.countDocuments({}))).toBe(0);
        expect(await raw(() => Media.collection.countDocuments({}))).toBe(0);
        expect(deletedFiles.sort()).toEqual([files.xray.toString(), files.photo.toString()].sort());

        // Each erased record says who erased it and when, nothing about the person (TD-B34).
        const erasures = await raw(() => AuditLog.collection.find({action: "ERASE"}).toArray());
        expect(erasures.map((entry) => String(entry.documentId)).sort()).toEqual([ids.patient, ids.inquiry, ids.message, ids.appointment, ids.trip].map(String).sort());
        expect(erasures.every((entry) => String(entry.actorId) === admin.userId && JSON.stringify(entry.diff) === "{}")).toBe(true);

        const audit = (await raw(() => AuditLog.collection.findOne({documentId: ids.patient, action: "UPDATE"})))!;
        expect(audit.diff).toEqual({medicalHistory: {from: null, to: null}, notes: {from: null, to: null}});

        const marco = (await raw(() => Patient.collection.findOne({_id: ids.marco})))!;
        expect(marco).toMatchObject({firstName: "Marco", email: "marco@example.com"});
        expect(marco.medicalHistory).toBeTruthy();

        const elsewhere = (await raw(() => Patient.collection.findOne({_id: ids.otherPatient})))!;
        expect(elsewhere).toMatchObject({email: EMAIL, firstName: "Giulia"});
        expect(elsewhere.medicalHistory).toBeTruthy();
        expect(await raw(() => User.collection.countDocuments({_id: accountId}))).toBe(1);
    });
});
