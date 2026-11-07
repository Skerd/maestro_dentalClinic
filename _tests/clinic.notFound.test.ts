import {afterAll, beforeAll, describe, expect, it, vi} from "vitest";
import {connectTestDatabase, disconnectTestDatabase} from "@coreModule/_tests/testDatabase";

import type {Router} from "express";
import type {Model} from "mongoose";
import {ObjectId} from "mongodb";
import request from "supertest";

vi.mock("@coreModule/utilities/middlewares/authMW", async () =>
    (await import("@coreModule/_tests/httpHarness")).authMWStub);
vi.mock("@coreModule/utilities/middlewares/rateLimiter", () => ({
    rateLimiter: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

import deCH from "armonia/src/modules/dentalClinic/helpers/static/exceptions/de_CH.json";
import enUS from "armonia/src/modules/dentalClinic/helpers/static/exceptions/en_US.json";
import frFR from "armonia/src/modules/dentalClinic/helpers/static/exceptions/fr_FR.json";
import itIT from "armonia/src/modules/dentalClinic/helpers/static/exceptions/it_IT.json";
import sqAL from "armonia/src/modules/dentalClinic/helpers/static/exceptions/sq_AL.json";
import {allPermissionTags, appFor, callerHeader, type TestCaller} from "@coreModule/_tests/httpHarness";
import {asCrossTenant} from "@coreModule/utilities/endpoints/tenantScope";
import * as appointmentRoute from "@dentalClinicModule/api/dentalClinic/private/appointment";
import * as clinicConfigRoute from "@dentalClinicModule/api/dentalClinic/private/clinicConfig";
import * as clinicInquiryRoute from "@dentalClinicModule/api/dentalClinic/private/clinicInquiry";
import * as clinicLocationRoute from "@dentalClinicModule/api/dentalClinic/private/clinicLocation";
import * as clinicServiceRoute from "@dentalClinicModule/api/dentalClinic/private/clinicService";
import * as patientRoute from "@dentalClinicModule/api/dentalClinic/private/patient";
import * as patientTripRoute from "@dentalClinicModule/api/dentalClinic/private/patientTrip";
import * as practitionerRoute from "@dentalClinicModule/api/dentalClinic/private/practitioner";
import * as scheduleExceptionRoute from "@dentalClinicModule/api/dentalClinic/private/scheduleException";
import * as treatmentPlanRoute from "@dentalClinicModule/api/dentalClinic/private/treatmentPlan";
import Appointment from "@dentalClinicModule/database/schemas/appointment/appointment";
import ClinicConfig from "@dentalClinicModule/database/schemas/clinicConfig/clinicConfig";
import ClinicInquiry from "@dentalClinicModule/database/schemas/clinicInquiry/clinicInquiry";
import ClinicLocation from "@dentalClinicModule/database/schemas/clinicLocation/clinicLocation";
import ClinicService from "@dentalClinicModule/database/schemas/clinicService/clinicService";
import Patient from "@dentalClinicModule/database/schemas/patient/patient";
import PatientTrip from "@dentalClinicModule/database/schemas/patientTrip/patientTrip";
import Practitioner from "@dentalClinicModule/database/schemas/practitioner/practitioner";
import ScheduleException from "@dentalClinicModule/database/schemas/scheduleException/scheduleException";
import TreatmentPlan from "@dentalClinicModule/database/schemas/treatmentPlan/treatmentPlan";

const clinicA = new ObjectId();
const clinicB = new ObjectId();

/** Every generic CRUD route of the module, with the record type its not-found key names (TD-T10). */
const ROUTES: {route: {basePath: string; router: Router}; model: Model<any>; key: string}[] = [
    {route: appointmentRoute, model: Appointment, key: "appointment_not_found"},
    {route: clinicConfigRoute, model: ClinicConfig, key: "clinicConfig_not_found"},
    {route: clinicInquiryRoute, model: ClinicInquiry, key: "clinicInquiry_not_found"},
    {route: clinicLocationRoute, model: ClinicLocation, key: "clinicLocation_not_found"},
    {route: clinicServiceRoute, model: ClinicService, key: "clinicService_not_found"},
    {route: patientRoute, model: Patient, key: "patient_not_found"},
    {route: patientTripRoute, model: PatientTrip, key: "patientTrip_not_found"},
    {route: practitionerRoute, model: Practitioner, key: "practitioner_not_found"},
    {route: scheduleExceptionRoute, model: ScheduleException, key: "scheduleException_not_found"},
    {route: treatmentPlanRoute, model: TreatmentPlan, key: "treatmentPlan_not_found"},
];
const app = appFor(ROUTES.map(({route}) => ({...route, module: "dentalClinic"})));
/** Clinic A's record of each type, as its id. */
const recordOf = new Map<string, string>();

let clinicBAdmin: TestCaller;

beforeAll(async () => {
    await connectTestDatabase();
    clinicBAdmin = {userId: new ObjectId().toString(), companyId: clinicB.toString(), isAdmin: true, permissions: allPermissionTags(ROUTES.map(({model}) => model))};
    // Only the record's existence matters: the routes must not find it from another clinic.
    await asCrossTenant("fixtures belong to clinic A", async () => {
        for (const {model, key} of ROUTES) {
            const _id = new ObjectId();
            await model.collection.insertOne({_id, company: clinicA, deletedAt: null});
            recordOf.set(key, _id.toString());
        }
    });
}, 120000);

afterAll(async () => {
    await disconnectTestDatabase();
});

describe("another clinic's records (TD-T10)", {timeout: 60000}, () => {
    for (const {route, key} of ROUTES) {
        it(`answers ${key} for ${route.basePath}, opening or deleting it`, async () => {
            const _id = recordOf.get(key)!;
            const opened = await request(app).post(`${route.basePath}/single`).set(callerHeader(clinicBAdmin)).send({_id});
            expect(opened.body).toMatchObject({error_code: key, status: 404});
            const deleted = await request(app).delete(route.basePath).set(callerHeader(clinicBAdmin)).send({_id});
            expect(deleted.body.error_code).toBe(key);
        });
    }

    it("has each key's message in all five languages", () => {
        for (const [language, messages] of Object.entries({deCH, enUS, frFR, itIT, sqAL})) {
            for (const {key} of ROUTES) {
                const message = (messages as Record<string, {message?: string; error_code?: string}>)[key];
                expect(message?.error_code, `${language} ${key}`).toBe(key);
                expect(message?.message, `${language} ${key}`).toBeTruthy();
            }
        }
    });
});
