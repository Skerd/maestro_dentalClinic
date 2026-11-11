import {afterAll, beforeAll, beforeEach, describe, expect, it, vi} from "vitest";
import {connectTestDatabase, disconnectTestDatabase} from "@coreModule/_tests/testDatabase";

import {ObjectId} from "mongodb";
import request from "supertest";

vi.mock("@coreModule/utilities/middlewares/authMW", async () =>
    (await import("@coreModule/_tests/httpHarness")).authMWStub);
vi.mock("@coreModule/utilities/middlewares/rateLimiter", () => ({
    rateLimiter: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

import {allPermissionTags, appFor, callerHeader, type TestCaller} from "@coreModule/_tests/httpHarness";
import {withTenant} from "@coreModule/utilities/endpoints/tenantScope";
import * as patientRoute from "@dentalClinicModule/api/dentalClinic/private/patient";
import Appointment from "@dentalClinicModule/database/schemas/appointment/appointment";
import ClinicInquiry from "@dentalClinicModule/database/schemas/clinicInquiry/clinicInquiry";
import Patient from "@dentalClinicModule/database/schemas/patient/patient";
import PatientTrip from "@dentalClinicModule/database/schemas/patientTrip/patientTrip";
import TreatmentPlan from "@dentalClinicModule/database/schemas/treatmentPlan/treatmentPlan";

const clinicId = new ObjectId();
const asClinic = <T>(fn: () => PromiseLike<T>): Promise<T> => withTenant(clinicId, fn);
const app = appFor([{...patientRoute, module: "dentalClinic"}]);
const single = (caller: TestCaller, _id: string) => request(app).post("/api/dentalClinic/patient/single").set(callerHeader(caller)).send({_id});

let frontDesk: TestCaller;
let patientsOnly: TestCaller;

beforeAll(async () => {
    await connectTestDatabase();
    await Promise.all([Patient, ClinicInquiry, Appointment, TreatmentPlan, PatientTrip].map((model) => model.init()));
    const caller = (permissions: string[]): TestCaller => ({userId: new ObjectId().toString(), companyId: clinicId.toString(), isAdmin: false, permissions});
    frontDesk = caller(allPermissionTags([Patient, ClinicInquiry, Appointment, TreatmentPlan, PatientTrip]));
    patientsOnly = caller(allPermissionTags([Patient]));
}, 120000);

afterAll(async () => {
    await disconnectTestDatabase();
});

beforeEach(() => asClinic(async () => {
    await Promise.all([Patient, ClinicInquiry].map((model) => model.collection.deleteMany({})));
}));

describe("the patient folder as a hub (P8.5)", () => {
    it("lists the patient's requests for a role that may read them, and leaves them out for one that may not", () => asClinic(async () => {
        const patient = await Patient.create({company: clinicId, number: "PT-1", firstName: "Arta", lastName: "Hoxha", preferredLanguage: "sq-AL", source: "phone"});
        const other = await Patient.create({company: clinicId, number: "PT-2", firstName: "Bo", lastName: "Other", preferredLanguage: "en-US", source: "phone"});
        const inquiry = (number: string, patientId: ObjectId) => ClinicInquiry.create({
            company: clinicId, number, source: "phone", status: "new", patient: patientId, contact: {firstName: "Arta", lastName: "Hoxha", preferredLanguage: "sq-AL"},
            contactShared: true, idempotencyKey: new ObjectId().toString(), timeline: [],
        });
        await inquiry("INQ-1", patient._id);
        await inquiry("INQ-2", other._id);

        const full = await single(frontDesk, patient._id.toString());
        expect(full.status).toBe(200);
        expect(full.body.inquiries.map((row: {number: string}) => row.number)).toEqual(["INQ-1"]);
        expect(full.body.appointments).toEqual([]);
        expect(full.body.nextVisitAt).toBeUndefined();

        const limited = await single(patientsOnly, patient._id.toString());
        expect(limited.status).toBe(200);
        expect(limited.body.firstName).toBe("Arta");
        for (const key of ["inquiries", "appointments", "plans", "trips", "balanceDue"]) expect(limited.body).not.toHaveProperty(key);
    }));
});
