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
const {portal} = vi.hoisted(() => ({portal: {platformId: "", listed: [] as string[]}}));
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
const {mail} = vi.hoisted(() => ({mail: {sent: [] as {kind: string}[]}}));
vi.mock("@dentalClinicModule/utilities/emails/sendPatientMail", () => ({
    sendPatientMail: vi.fn(async () => undefined),
    sendInquiryMail: vi.fn(async (message: {kind: string}) => {
        mail.sent.push(message);
    }),
    patientSmsText: () => "",
}));

// A gateway that answers like Stripe: one intent per idempotency key.
vi.mock("@financeModule/environment", () => ({PAYMENTS: {STRIPE_ENABLED: true, STRIPE_PUBLISHABLE_KEY: "pk_test"}}));
const {gateway} = vi.hoisted(() => {
    const adapter = {
        isEnabled: () => true,
        createPaymentIntent: async ({idempotencyKey}: {idempotencyKey: string}) => ({id: `pi_${idempotencyKey}`, clientSecret: `cs_${idempotencyKey}`}),
        createRefund: async () => ({id: "re_1"}),
        toMinorUnits: (amount: number) => Math.round(amount * 100),
    };
    return {gateway: adapter};
});
vi.mock("@financeModule/utilities/services/payment/paymentService", () => ({getPaymentAdapter: () => gateway, stripeAdapter: gateway}));

import {allPermissionTags, appFor, callerHeader, type TestCaller} from "@coreModule/_tests/httpHarness";
import PaymentTransaction from "@financeModule/database/schemas/paymentTransaction/paymentTransaction";
import {getPaymentSourceHandler} from "@financeModule/utilities/services/payment/paymentSourceHandlers";
import {getLogger} from "@coreModule/loggers/serverLog";
import Media from "@coreModule/database/schemas/media/media";
import Company from "@coreModule/database/schemas/company/company";
import Currency from "@coreModule/database/schemas/currency/currency";
import Role from "@coreModule/database/schemas/role/role";
import User from "@coreModule/database/schemas/user/user";
import {getGridFSStorage} from "@coreModule/utilities/gridfs/gridfsStorage";
import * as inquiryRoute from "@dentalClinicModule/api/dentalClinic/private/clinicInquiry";
import * as planRoute from "@dentalClinicModule/api/dentalClinic/private/treatmentPlan";
import * as portalRoute from "@dentalClinicModule/api/dentalClinic/public/patientPortal";
import * as tripRoute from "@dentalClinicModule/api/dentalClinic/private/patientTrip";
import PatientTrip from "@dentalClinicModule/database/schemas/patientTrip/patientTrip";
import ClinicConfig from "@dentalClinicModule/database/schemas/clinicConfig/clinicConfig";
import ClinicInquiry from "@dentalClinicModule/database/schemas/clinicInquiry/clinicInquiry";
import ClinicMessage from "@dentalClinicModule/database/schemas/clinicMessage/clinicMessage";
import Patient from "@dentalClinicModule/database/schemas/patient/patient";
import TreatmentPlan from "@dentalClinicModule/database/schemas/treatmentPlan/treatmentPlan";
import {expirePlans, planTotals} from "@dentalClinicModule/utilities/services/treatmentPlans";
import {generateTreatmentPlanPdf} from "@dentalClinicModule/utilities/pdf/treatmentPlanPdf";
import {treatmentPlanToDTO} from "@dentalClinicModule/utilities/mappers/treatmentPlan/treatmentPlanMapper.dto";

let replSet: MongoMemoryReplSet;
const webhookLogger = getLogger("treatment_plan_payment_test");
const platformId = new ObjectId();
const clinicA = new ObjectId();
const clinicB = new ObjectId();
const accountId = new ObjectId();
const app = appFor([inquiryRoute, planRoute, portalRoute, tripRoute]);

let staffA: TestCaller;
let staffB: TestCaller;
let patientCaller: TestCaller;

const asPatient = (path: string, body: Record<string, unknown>) =>
    request(app).post(`/api/dentalClinic/patientPortal${path}`)
        .set(callerHeader(patientCaller))
        .set("x-auth-token", `account:${accountId.toString()}`)
        .send({origin: "http://portal.localhost", ...body});
const asStaff = (caller: TestCaller, method: "put" | "patch" | "post", path: string, body: Record<string, unknown>) =>
    request(app)[method](`/api/dentalClinic/treatmentPlan${path}`).set(callerHeader(caller)).send(body);

/** A patient upload stored in GridFS, the way `/upload` leaves it. */
async function upload(name: string) {
    const fileId = await getGridFSStorage("en-US", "media").uploadFile(Buffer.from(`x-ray ${name}`), name, {});
    return Media.create({
        type: "image",
        originalName: name,
        fileName: name,
        fileId,
        mimeType: "image/jpeg",
        extension: ".jpg",
        metadata: {size: 10, extension: ".jpg", mime: "image/jpeg", safeCheckedFlag: true},
        company: platformId,
        createdBy: accountId,
        pendingReference: true,
    });
}

const plan = (inquiry: string, overrides: Record<string, unknown> = {}) => ({
    inquiry,
    optionLabel: "Straumann",
    phases: [
        {title: "Implants", visits: 2, estimatedDays: 5},
        {title: "Crowns", visits: 2, estimatedDays: 4, minGapDaysAfterPrevious: 90},
    ],
    lines: [
        {phase: 1, kind: "treatment", name: "Implant Straumann BLX", teeth: ["36", "37"], brand: "Straumann", quantity: 2, unitPrice: 700, warrantyYears: 10},
        {phase: 2, kind: "treatment", name: "Zirconia crown", teeth: ["36", "37"], material: "Zirconia", quantity: 2, unitPrice: 250, discount: 50},
        {phase: 1, kind: "package", name: "Hotel, 4 nights", quantity: 4, unitPrice: 40},
    ],
    depositType: "percent",
    depositValue: 10,
    refundableUntilDays: 14,
    ...overrides,
});

/** A request to clinics A and B with one X-ray; returns both inquiries. */
async function requestToBoth() {
    const opg = await upload("opg.jpg");
    const {body} = await asPatient("/requests", {
        clinics: [clinicA.toString(), clinicB.toString()],
        contact: {firstName: "Giulia", lastName: "Bianchi", email: "giulia@example.com", preferredLanguage: "it-IT"},
        treatmentsWanted: ["implant", "crown"],
        files: [opg._id.toString()],
        acceptConsent: true,
        consentVersion: "2026-10",
        idempotencyKey: `key-${new ObjectId().toString()}`,
    });
    const atA = await ClinicInquiry.findOne({requestGroup: body.data.requestGroup, company: clinicA});
    const atB = await ClinicInquiry.findOne({requestGroup: body.data.requestGroup, company: clinicB});
    return {requestGroup: body.data.requestGroup as string, atA: atA!._id.toString(), atB: atB!._id.toString(), opg};
}

async function sentPlan(caller: TestCaller, inquiry: string, overrides: Record<string, unknown> = {}): Promise<string> {
    const created = await asStaff(caller, "put", "", plan(inquiry, overrides));
    expect(created.status).toBe(200);
    const sent = await asStaff(caller, "post", "/send", {_id: created.body._id});
    expect(sent.body.status).toBe("sent");
    return created.body._id;
}

beforeAll(async () => {
    replSet = await MongoMemoryReplSet.create({replSet: {count: 1, storageEngine: "wiredTiger"}});
    await mongoose.connect(replSet.getUri());
    // Every model's indexes built up front: a build running beside a transaction makes it retry.
    await Promise.all([ClinicInquiry, ClinicMessage, Patient, ClinicConfig, TreatmentPlan, Media, Currency, PaymentTransaction, PatientTrip].map((model) => model.init()));
    portal.platformId = platformId.toString();
    portal.listed = [clinicA.toString(), clinicB.toString()];
    const permissions = allPermissionTags([ClinicInquiry, ClinicMessage, TreatmentPlan, PatientTrip]);
    staffA = {userId: new ObjectId().toString(), companyId: clinicA.toString(), isAdmin: true, permissions};
    staffB = {userId: new ObjectId().toString(), companyId: clinicB.toString(), isAdmin: true, permissions};
    patientCaller = {userId: accountId.toString(), companyId: platformId.toString()};
}, 120000);

afterAll(async () => {
    await mongoose.disconnect();
    await replSet.stop();
});

beforeEach(async () => {
    await Promise.all([ClinicInquiry, ClinicMessage, Patient, ClinicConfig, TreatmentPlan, Media, Currency, PaymentTransaction, PatientTrip].map((model) => model.collection.deleteMany({})));
    await Company.collection.deleteMany({});
    await Company.collection.insertMany([clinicA, clinicB, platformId].map((_id, index) => ({_id, name: `Company ${index}`, vat: `VAT-${index}`})));
    mail.sent = [];
    // The portal account, a member of the platform only, and each clinic's signup role.
    await Promise.all([User, Role].map((model) => model.collection.deleteMany({})));
    await User.collection.insertOne({_id: accountId, username: "giulia@example.com", companies: [platformId], roles: [{_id: new ObjectId(), company: platformId, roles: [], active: "active"}]});
    await Role.collection.insertMany([clinicA, clinicB].map((company, index) => ({
        company, name: "Web Client", slug: `company ${index}:default:webclient`, isSignupDefault: true,
    })));
    for (const company of [clinicA, clinicB]) {
        const currency = await Currency.create({name: "Euro", symbol: "€", abbreviation: "EUR", decimalPlaces: 2, company});
        await ClinicConfig.create({company, currency: currency._id, inquiriesEnabled: true, quoteValidityDays: 14, quoteTerms: "Payment at the clinic."});
    }
});

describe("a clinic's quote", {timeout: 60000}, () => {
    it("computes the totals and deposit itself, and refuses unknown teeth or phases", async () => {
        const {atA} = await requestToBoth();
        const created = await asStaff(staffA, "put", "", plan(atA));
        expect(created.body).toMatchObject({status: "draft", currency: {abbreviation: "EUR"}, terms: "Payment at the clinic."});
        // 2×700 + (2×250 − 50) + 4×40 = 2010; 10 % deposit
        expect(created.body.totals).toEqual({subtotal: 2060, discount: 50, total: 2010, deposit: 201});

        const badTooth = await asStaff(staffA, "put", "", plan(atA, {lines: [{phase: 1, kind: "treatment", name: "Crown", teeth: ["19"], quantity: 1, unitPrice: 1}]}));
        expect(badTooth.body.error_code).toBe("treatment_plan_tooth_invalid");
        const badPhase = await asStaff(staffA, "put", "", plan(atA, {lines: [{phase: 3, kind: "treatment", name: "Crown", quantity: 1, unitPrice: 1}]}));
        expect(badPhase.body.error_code).toBe("treatment_plan_line_phase_invalid");
    });

    it("answers the request when sent, shows the patient only sent quotes, and replaces a quote with its revision", async () => {
        const {atA, requestGroup} = await requestToBoth();
        await asStaff(staffA, "put", "", plan(atA, {optionLabel: "Still a draft"}));
        const first = await sentPlan(staffA, atA);

        const inquiry = await ClinicInquiry.findById(atA);
        expect(inquiry).toMatchObject({status: "quoted", unreadForPatient: 1});
        expect(inquiry!.firstResponseAt).toBeInstanceOf(Date);
        expect(mail.sent.at(-1)).toMatchObject({kind: "quoteReceived"});
        const stored = await TreatmentPlan.findById(first);
        expect(stored!.validUntil).toMatch(/^\d{4}-\d{2}-\d{2}$/);

        let offers = await asPatient("/plans", {requestGroup});
        expect(offers.body.data.map((offer: {optionLabel: string}) => offer.optionLabel)).toEqual(["Straumann"]);

        const revision = await asStaff(staffA, "post", "/revise", {_id: first});
        expect(revision.body).toMatchObject({status: "draft", version: 2, supersedes: {_id: first}});
        expect((await asStaff(staffA, "patch", "", {...plan(atA), _id: revision.body._id, depositType: "fixed", depositValue: 300})).body.totals.deposit).toBe(300);
        await asStaff(staffA, "post", "/send", {_id: revision.body._id});
        expect((await TreatmentPlan.findById(first))!.status).toBe("superseded");
        offers = await asPatient("/plans", {requestGroup});
        expect(offers.body.data.map((offer: {status: string}) => offer.status)).toEqual(["superseded", "sent"]);
        expect((await asStaff(staffA, "patch", "", {...plan(atA), _id: first})).body.error_code).toBe("treatment_plan_invalid_status");
    });
});

describe("the patient accepting a quote", {timeout: 60000}, () => {
    it("makes them this clinic's patient, closes their other clinics and moves the X-ray to the chosen clinic", async () => {
        const {atA, atB, requestGroup, opg} = await requestToBoth();
        const chosen = await sentPlan(staffA, atA);
        const alternative = await sentPlan(staffA, atA, {optionLabel: "Osstem"});
        const elsewhere = await sentPlan(staffB, atB);

        const accepted = await asPatient("/acceptPlan", {plan: chosen, signedName: "Giulia Bianchi", acceptTerms: true});
        expect(accepted.status).toBe(200);
        expect(accepted.body.data.plan).toMatchObject({status: "accepted", clinic: {_id: clinicA.toString()}});

        const plan = await TreatmentPlan.findById(chosen);
        expect(plan!.acceptance).toMatchObject({name: "Giulia Bianchi"});
        expect(plan!.acceptance!.contentHash).toMatch(/^[0-9a-f]{64}$/);
        expect((await TreatmentPlan.findById(alternative))!.status).toBe("rejected");
        expect((await TreatmentPlan.findById(elsewhere))!.status).toBe("rejected");

        const won = await ClinicInquiry.findById(atA);
        expect(won).toMatchObject({status: "converted", contactShared: true});
        const folder = await Patient.findOne({company: clinicA});
        expect(String(folder!.account)).toBe(accountId.toString());
        expect(String(plan!.patient)).toBe(folder!._id.toString());
        expect(await ClinicInquiry.findById(atB)).toMatchObject({status: "lost", closeReason: "patient_chose_another_clinic"});

        // The account joins the chosen clinic as a customer (its signup role), and only that clinic.
        const account = await User.collection.findOne({_id: accountId});
        const memberships = (account!.roles as {company: ObjectId; roles: ObjectId[]}[]).map((entry) => String(entry.company));
        expect(memberships.sort()).toEqual([clinicA.toString(), platformId.toString()].sort());
        const signupRole = await Role.collection.findOne({company: clinicA, isSignupDefault: true});
        const atClinic = (account!.roles as {company: ObjectId; roles: ObjectId[]}[]).find((entry) => String(entry.company) === clinicA.toString());
        expect(atClinic!.roles.map(String)).toEqual([signupRole!._id.toString()]);
        expect(mail.sent.at(-1)).toMatchObject({kind: "planAccepted"});

        // After commit: clinic A holds its own copy; the patient's original is shared with nobody.
        await vi.waitFor(async () => {
            const files = (await ClinicInquiry.findById(atA))!.files.map(String);
            expect(files).toHaveLength(1);
            expect(files[0]).not.toBe(opg._id.toString());
        });
        const copy = await Media.findById((await ClinicInquiry.findById(atA))!.files[0]);
        expect(String(copy!.company)).toBe(clinicA.toString());
        expect((await Media.findById(opg._id))!.sharedWithCompanies).toEqual([]);

        expect((await asPatient("/acceptPlan", {plan: elsewhere, signedName: "Giulia Bianchi", acceptTerms: true})).body.error_code).toBe("treatment_plan_invalid_status");
        expect((await asPatient("/plans", {requestGroup})).body.data.filter((offer: {status: string}) => offer.status === "accepted")).toHaveLength(1);
    });

    it("lets only one of two simultaneous acceptances at different clinics through", async () => {
        const {atA, atB} = await requestToBoth();
        const atClinicA = await sentPlan(staffA, atA);
        const atClinicB = await sentPlan(staffB, atB);
        const results = await Promise.all([
            asPatient("/acceptPlan", {plan: atClinicA, signedName: "Giulia Bianchi", acceptTerms: true}),
            asPatient("/acceptPlan", {plan: atClinicB, signedName: "Giulia Bianchi", acceptTerms: true}),
        ]);
        expect(results.filter((result) => result.status === 200)).toHaveLength(1);
        expect(await TreatmentPlan.countDocuments({status: "accepted"})).toBe(1);
        expect(await ClinicInquiry.countDocuments({status: "converted"})).toBe(1);
        expect(await ClinicInquiry.countDocuments({status: "lost"})).toBe(1);
    });

    it("refuses an expired quote", async () => {
        const {atA} = await requestToBoth();
        const id = await sentPlan(staffA, atA, {validUntil: "2020-01-01"});
        expect(await expirePlans(clinicA)).toBe(1);
        expect((await TreatmentPlan.findById(id))!.status).toBe("expired");
        expect((await asPatient("/acceptPlan", {plan: id, signedName: "Giulia Bianchi", acceptTerms: true})).body.error_code).toBe("treatment_plan_invalid_status");
    });
});

describe("the medical history", {timeout: 60000}, () => {
    const answers = (overrides: Record<string, string> = {}) => [
        "allergies", "anticoagulants", "bisphosphonates", "diabetes", "heart_condition",
        "high_blood_pressure", "bleeding_disorder", "infectious_disease", "pregnancy", "smoking",
    ].map((question) => ({question, answer: overrides[question] ?? "no", detail: "only kept where the answer is not no"}));

    it("goes to every clinic of the request, answers what they asked for, and follows the patient to the chosen clinic", async () => {
        const {atA, atB, requestGroup} = await requestToBoth();
        await request(app).post("/api/dentalClinic/clinicInquiry/requestInfo").set(callerHeader(staffB)).send({_id: atB, kinds: ["medical_history"]});

        const duplicate = answers().map((row, index) => (index === 9 ? {...row, question: "allergies"} : row));
        expect((await asPatient("/medicalHistory", {requestGroup, answers: duplicate, signedName: "Giulia Bianchi"})).body.error_code).toBe("medical_history_incomplete");

        const sent = await asPatient("/medicalHistory", {requestGroup, answers: answers({anticoagulants: "yes"}), medications: "Apixaban 5 mg", signedName: "Giulia Bianchi"});
        expect(sent.status).toBe(200);
        expect(sent.body.data.medicalHistory).toMatchObject({signedName: "Giulia Bianchi", medications: "Apixaban 5 mg"});

        const [a, b] = await Promise.all([ClinicInquiry.findById(atA), ClinicInquiry.findById(atB)]);
        for (const inquiry of [a!, b!]) {
            expect(inquiry.medicalHistory!.answers).toHaveLength(10);
            expect(inquiry.medicalHistory!.answers.find((row) => row.question === "anticoagulants")).toMatchObject({answer: "yes", detail: "only kept where the answer is not no"});
            expect(inquiry.medicalHistory!.answers.find((row) => row.question === "allergies")!.detail).toBeUndefined();
        }
        expect(b!.status).toBe("in_review");
        expect(b!.infoRequests[0].fulfilledAt).toBeInstanceOf(Date);

        const id = await sentPlan(staffA, atA);
        await asPatient("/acceptPlan", {plan: id, signedName: "Giulia Bianchi", acceptTerms: true});
        const folder = await Patient.findOne({company: clinicA});
        expect(folder!.medicalHistory).toMatchObject({signedName: "Giulia Bianchi", medications: "Apixaban 5 mg"});

        // Filled in again after choosing: the chosen clinic's folder gets the newer answers.
        await asPatient("/medicalHistory", {requestGroup, answers: answers({diabetes: "yes"}), signedName: "Giulia Bianchi"});
        const updated = await Patient.findById(folder!._id);
        expect(updated!.medicalHistory!.answers.find((row) => row.question === "diabetes")!.answer).toBe("yes");
        expect((await ClinicInquiry.findById(atB))!.medicalHistory!.answers.find((row) => row.question === "diabetes")!.answer).toBe("no");
    });
});

describe("the patient's trips", {timeout: 60000}, () => {
    it("keeps a later phase after the plan's healing time, and lets the patient add flights and hotel", async () => {
        const {atA, requestGroup} = await requestToBoth();
        const id = await sentPlan(staffA, atA);
        await asPatient("/acceptPlan", {plan: id, signedName: "Giulia Bianchi", acceptTerms: true});
        const folder = await Patient.findOne({company: clinicA});
        const trip = (phase: number, arrivalAt: string, departureAt: string) => request(app).put("/api/dentalClinic/patientTrip").set(callerHeader(staffA)).send({
            patient: folder!._id.toString(), plan: id, phase, status: "planned", arrivalAt, departureAt, transfer: true,
        });

        const first = await trip(1, "2027-01-10T10:00:00.000Z", "2027-01-15T16:00:00.000Z");
        expect(first.status).toBe(200);
        await vi.waitFor(() => expect(mail.sent.at(-1)).toMatchObject({kind: "tripPlanned"}));
        // The crowns phase waits 90 days after the implants trip ends.
        expect((await trip(2, "2027-02-01T10:00:00.000Z", "2027-02-05T16:00:00.000Z")).body).toMatchObject({error_code: "patient_trip_too_early"});
        expect((await trip(3, "2027-06-01T10:00:00.000Z", "2027-06-05T16:00:00.000Z")).body.error_code).toBe("patient_trip_phase_invalid");
        expect((await trip(2, "2027-04-20T10:00:00.000Z", "2027-04-25T16:00:00.000Z")).status).toBe(200);
        // Another clinic cannot plan a trip for this clinic's patient.
        const elsewhere = await request(app).put("/api/dentalClinic/patientTrip").set(callerHeader(staffB)).send({
            patient: folder!._id.toString(), status: "planned", arrivalAt: "2027-01-10T10:00:00.000Z", departureAt: "2027-01-15T16:00:00.000Z",
        });
        expect(elsewhere.body.error_code).toBe("patient_not_found");

        const trips = await asPatient("/trips", {requestGroup});
        expect(trips.body.data.map((entry: {phaseTitle: string}) => entry.phaseTitle)).toEqual(["Implants", "Crowns"]);
        const details = await asPatient("/tripDetails", {trip: first.body._id, arrivalFlight: "W6 4567", accommodation: "Hotel Rogner"});
        expect(details.body.data).toMatchObject({arrivalFlight: "W6 4567", accommodation: "Hotel Rogner", transfer: true});
        await PatientTrip.updateOne({_id: first.body._id}, {$set: {status: "completed"}});
        expect((await asPatient("/tripDetails", {trip: first.body._id, arrivalFlight: "X"})).body.error_code).toBe("patient_trip_closed");
    });
});

describe("paying for an accepted plan", {timeout: 60000}, () => {
    it("takes the deposit by card once, then records the clinic's payments and refunds newest first", async () => {
        const {atA, requestGroup} = await requestToBoth();
        const id = await sentPlan(staffA, atA);
        // Not before acceptance
        expect((await asPatient("/payDeposit", {plan: id})).body.error_code).toBe("treatment_plan_invalid_status");
        await asPatient("/acceptPlan", {plan: id, signedName: "Giulia Bianchi", acceptTerms: true});

        let offers = await asPatient("/plans", {requestGroup});
        expect(offers.body.onlinePayment).toBe(true);
        expect(offers.body.data[0]).toMatchObject({paymentStatus: "unpaid", amountPaid: 0, depositDue: 201});

        // A replayed start reuses the intent and its ledger row.
        const started = await asPatient("/payDeposit", {plan: id});
        expect(started.body.data).toMatchObject({amount: 201, publishableKey: "pk_test"});
        await asPatient("/payDeposit", {plan: id});
        const pending = await PaymentTransaction.find({sourceType: "treatmentPlan", sourceId: new ObjectId(id)});
        expect(pending).toHaveLength(1);
        expect(pending[0]).toMatchObject({status: "pending", amount: 201, gateway: "stripe"});
        expect((await TreatmentPlan.findById(id))!.paymentStatus).toBe("pending");

        // The webhook marks the row paid, then the handler settles the plan, once.
        const intent = {id: pending[0].gatewayTransactionId!, amountMinor: 20100, currencyCode: "eur"};
        await PaymentTransaction.updateOne({_id: pending[0]._id}, {$set: {status: "succeeded"}});
        const handler = getPaymentSourceHandler("treatmentPlan")!;
        await handler.succeeded(intent, {logger: webhookLogger, languageCode: "en-US"});
        await handler.succeeded(intent, {logger: webhookLogger, languageCode: "en-US"});
        let stored = await TreatmentPlan.findById(id);
        expect(stored).toMatchObject({amountPaid: 201, paymentStatus: "deposit_paid"});
        expect(stored!.stripePaymentIntentId).toBeUndefined();
        await vi.waitFor(() => expect(mail.sent.at(-1)).toMatchObject({kind: "depositPaid"}));
        expect((await asPatient("/payDeposit", {plan: id})).body.error_code).toBe("treatment_plan_nothing_to_pay");

        // The rest at the clinic: never more than is due.
        expect((await asStaff(staffA, "post", "/recordPayment", {_id: id, amount: 2000})).body.error_code).toBe("treatment_plan_payment_exceeds_due");
        const settled = await asStaff(staffA, "post", "/recordPayment", {_id: id, amount: 1809, note: "cash"});
        expect(settled.body).toMatchObject({paymentStatus: "paid", amountPaid: 2010, amountDue: 0});

        // A refund comes off the newest charge first: the cash.
        const refunded = await asStaff(staffA, "post", "/refund", {_id: id, amount: 300, reason: "Second phase cancelled"});
        expect(refunded.body).toMatchObject({paymentStatus: "partially_refunded", amountPaid: 1710, amountDue: 300});
        const cash = await PaymentTransaction.findOne({sourceId: new ObjectId(id), type: "charge", gateway: "manual"});
        expect(cash!.refundedAmount).toBe(300);
        expect(await PaymentTransaction.countDocuments({sourceId: new ObjectId(id), type: "refund", gateway: "manual"})).toBe(1);
        expect((await asStaff(staffA, "post", "/refund", {_id: id, amount: 5000, reason: "x"})).body.error_code).toBe("treatment_plan_refund_exceeds_paid");

        offers = await asPatient("/plans", {requestGroup});
        expect(offers.body.data[0]).toMatchObject({paymentStatus: "partially_refunded", amountPaid: 1710, depositDue: 0});
        stored = await TreatmentPlan.findById(id);
        expect(stored!.timeline.map((entry) => entry.event)).toEqual(expect.arrayContaining(["payment_received", "refunded"]));
    });
});

describe("the quote document", () => {
    it("renders a PDF in the patient's language", async () => {
        const doc = new TreatmentPlan({
            company: clinicA,
            number: "TP-1",
            status: "sent",
            version: 1,
            currency: new ObjectId(),
            phases: [{title: "Impianti", visits: 2, estimatedDays: 5}],
            lines: [{phase: 1, kind: "treatment", name: "Impianto Straumann", teeth: ["36"], quantity: 1, unitPrice: 700, warrantyYears: 10}],
            depositType: "none",
            totals: planTotals([{phase: 1, kind: "treatment", name: "x", teeth: [], quantity: 1, unitPrice: 700}], "none"),
            terms: "Pagamento in clinica — garanzia scritta.",
            timeline: [],
        });
        const pdf = await generateTreatmentPlanPdf({plan: treatmentPlanToDTO(doc), clinicName: "Smile Tirana", patientName: "Giulia Bianchi", languageCode: "it-IT"});
        expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
        expect(pdf.length).toBeGreaterThan(1000);
    });
});
