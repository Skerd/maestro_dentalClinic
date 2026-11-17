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

import {allPermissionTags, appFor, callerHeader, type TestCaller} from "@coreModule/_tests/httpHarness";
import {allowForeignReferences, withTenant} from "@coreModule/utilities/endpoints/tenantScope";
import * as tripRoute from "@dentalClinicModule/api/dentalClinic/private/patientTrip";
import Patient from "@dentalClinicModule/database/schemas/patient/patient";
import PatientTrip from "@dentalClinicModule/database/schemas/patientTrip/patientTrip";
import TreatmentPlan from "@dentalClinicModule/database/schemas/treatmentPlan/treatmentPlan";
import type {TreatmentPlanStatus} from "armonia/src/modules/dentalClinic/constants";

const clinicId = new ObjectId();
const otherClinicId = new ObjectId();
const asClinic = <T>(fn: () => PromiseLike<T>): Promise<T> => withTenant(clinicId, fn);
const app = appFor([{...tripRoute, module: "dentalClinic"}]);

let staff: TestCaller;
let patientId: string;
let otherPatientId: string;

/** Implants, then crowns at least 90 days after the implant stay ends. */
async function plan(status: TreatmentPlanStatus = "accepted", patient = patientId, company = clinicId): Promise<string> {
    const created = await withTenant(company, () => TreatmentPlan.create({
        company,
        number: `TP-${new ObjectId().toString()}`,
        status,
        patient: new ObjectId(patient),
        version: 1,
        currency: new ObjectId(),
        phases: [{title: "Implants", visits: 2, estimatedDays: 5}, {title: "Crowns", visits: 2, estimatedDays: 4, minGapDaysAfterPrevious: 90}],
        lines: [{phase: 1, kind: "treatment", name: "Implant", teeth: ["36"], quantity: 1, unitPrice: 700}],
        depositType: "none",
        totals: {subtotal: 700, discount: 0, total: 700, deposit: 0},
        timeline: [],
    }));
    return created._id.toString();
}

const trip = (body: Record<string, unknown>) => request(app).put("/api/dentalClinic/patientTrip").set(callerHeader(staff)).send({
    patient: patientId, status: "planned", arrivalAt: "2027-01-10T10:00:00.000Z", departureAt: "2027-01-15T16:00:00.000Z", ...body,
});
const editTrip = (body: Record<string, unknown>) => request(app).patch("/api/dentalClinic/patientTrip").set(callerHeader(staff)).send(body);

beforeAll(async () => {
    await connectTestDatabase();
    await Promise.all([Patient, PatientTrip, TreatmentPlan].map((model) => model.init()));
    staff = {userId: new ObjectId().toString(), companyId: clinicId.toString(), isAdmin: true, permissions: allPermissionTags([PatientTrip])};
}, 120000);

afterAll(async () => {
    await disconnectTestDatabase();
});

beforeEach(() => asClinic(async () => {
    await Promise.all([Patient, PatientTrip, TreatmentPlan].map((model) => model.collection.deleteMany({})));
    const [giulia, marco] = await Patient.create([
        {company: clinicId, number: "PT-1", firstName: "Giulia", lastName: "Bianchi", preferredLanguage: "it-IT", source: "portal"},
        {company: clinicId, number: "PT-2", firstName: "Marco", lastName: "Rossi", preferredLanguage: "it-IT", source: "phone"},
    ]);
    patientId = giulia._id.toString();
    otherPatientId = marco._id.toString();
}));

describe("which plan a trip is for", {timeout: 60000}, () => {
    it("plans a stay without a plan, but never a phase without one", () => asClinic(async () => {
        expect((await trip({})).status).toBe(200);
        expect((await trip({phase: 1})).body.error_code).toBe("patient_trip_phase_without_plan");
    }));

    it("takes only this patient's accepted plan at this clinic", () => asClinic(async () => {
        expect((await trip({plan: await plan("sent"), phase: 1})).body.error_code).toBe("patient_trip_plan_invalid");
        expect((await trip({plan: await plan("accepted", otherPatientId), phase: 1})).body.error_code).toBe("patient_trip_plan_invalid");
        // Since D104 another clinic's plan cannot name this clinic's patient: this stands for a plan stored before.
        const storedBefore = {reason: "a pre-D104 plan of another clinic", fields: ["TreatmentPlan.patient"]};
        const foreignPlan = await allowForeignReferences(storedBefore, () => plan("accepted", patientId, otherClinicId));
        expect((await trip({plan: foreignPlan, phase: 1})).body.error_code).toBe("patient_trip_plan_invalid");
        expect((await trip({plan: await plan(), phase: 1})).status).toBe(200);
    }));

    it("refuses a stay that leaves before it arrives", () => asClinic(async () => {
        const backwards = await trip({arrivalAt: "2027-01-15T10:00:00.000Z", departureAt: "2027-01-10T10:00:00.000Z"});
        expect(backwards.status).toBe(400);
        // Same day, later hour: a day trip is fine.
        expect((await trip({arrivalAt: "2027-01-15T08:00:00.000Z", departureAt: "2027-01-15T18:00:00.000Z"})).status).toBe(200);
        expect(await PatientTrip.countDocuments({})).toBe(1);
    }));
});

describe("the healing time between phases", {timeout: 60000}, () => {
    it("opens the next phase exactly the healing time after the latest stay of the previous one, and names that day", () => asClinic(async () => {
        const planId = await plan();
        await trip({plan: planId, phase: 1});
        // A second implant stay ends later: the gap counts from it.
        await trip({plan: planId, phase: 1, arrivalAt: "2027-02-01T10:00:00.000Z", departureAt: "2027-02-03T12:00:00.000Z"});

        const early = await trip({plan: planId, phase: 2, arrivalAt: "2027-05-04T11:59:00.000Z", departureAt: "2027-05-08T12:00:00.000Z"});
        expect(early.body.error_code).toBe("patient_trip_too_early");
        expect(early.body.message).toContain("2027-05-04");
        expect((await trip({plan: planId, phase: 2, arrivalAt: "2027-05-04T12:00:00.000Z", departureAt: "2027-05-08T12:00:00.000Z"})).status).toBe(200);
    }));

    it("ignores a cancelled stay of the previous phase", () => asClinic(async () => {
        const planId = await plan();
        await trip({plan: planId, phase: 1, status: "cancelled"});
        expect((await trip({plan: planId, phase: 2, arrivalAt: "2027-01-20T10:00:00.000Z", departureAt: "2027-01-25T10:00:00.000Z"})).status).toBe(200);
    }));

    it("checks the gap again when a later stay is moved, but not when only its details change", () => asClinic(async () => {
        const planId = await plan();
        await trip({plan: planId, phase: 1});
        const crowns = await trip({plan: planId, phase: 2, arrivalAt: "2027-05-01T10:00:00.000Z", departureAt: "2027-05-05T10:00:00.000Z"});
        expect(crowns.status).toBe(200);

        // The panel sends the whole form.
        const form = {_id: crowns.body._id, patient: patientId, plan: planId, phase: 2, status: "planned", arrivalAt: "2027-05-01T10:00:00.000Z", departureAt: "2027-05-05T10:00:00.000Z"};
        const noted = await editTrip({...form, accommodation: "Hotel Rogner", transfer: true});
        expect(noted.body.error_code ?? "saved").toBe("saved");
        const moved = await editTrip({...form, accommodation: "Hotel Rogner", arrivalAt: "2027-03-01T10:00:00.000Z", departureAt: "2027-03-05T10:00:00.000Z"});
        expect(moved.body.error_code).toBe("patient_trip_too_early");
        const stored = await PatientTrip.findById(crowns.body._id);
        expect(stored!.arrivalAt.toISOString()).toBe("2027-05-01T10:00:00.000Z");
        expect(stored!.accommodation).toBe("Hotel Rogner");
    }));
});

// TD-B235: the picker list answered 500, since its label (the arrival date) was not read. TD-B242: it names the patient too.
describe("trip picker", {timeout: 60000}, () => {
    it("lists trips by arrival, labelled with the arrival date, and finds one by its accommodation", () => asClinic(async () => {
        await trip({arrivalAt: "2027-03-02T10:00:00.000Z", departureAt: "2027-03-04T10:00:00.000Z", accommodation: "Hotel Rogner"});
        await trip({accommodation: "Villa Tirana"});
        const select = (body: Record<string, unknown>) => request(app).post("/api/dentalClinic/patientTrip/select").set(callerHeader(staff)).send({page: 1, limit: 10, ...body});

        const all = await select({});
        expect(all.status).toBe(200);
        expect(all.body.data.map((option: {label: string}) => option.label)).toEqual(["Giulia Bianchi · 2027-01-10", "Giulia Bianchi · 2027-03-02"]);
        expect((await select({name: "rogner"})).body.data.map((option: {label: string}) => option.label)).toEqual(["Giulia Bianchi · 2027-03-02"]);
    }));
});
