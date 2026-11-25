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
// A gateway that answers like Stripe and records what it was asked, at the currency's own decimals.
vi.mock("@financeModule/environment", () => ({PAYMENTS: {STRIPE_ENABLED: true, STRIPE_PUBLISHABLE_KEY: "pk_test"}}));
// These tests take cards: as if card payments were on (D190; treatmentPlanFlow.test.ts also covers them off).
vi.mock("armonia/src/modules/finance/helpers/cardPaymentAvailability", () => ({CARD_PAYMENTS_AVAILABLE: true}));
const {gateway} = vi.hoisted(() => ({
    gateway: {
        intents: [] as {amount: number; currencyCode: string; decimalPlaces?: number}[],
        refunds: [] as {amount?: number; currencyCode: string; decimalPlaces?: number}[],
    },
}));
vi.mock("@financeModule/utilities/services/payment/paymentService", async () => {
    const {toMinor} = await import("armonia/src/modules/core/helpers/money");
    const adapter = {
        isEnabled: () => true,
        createPaymentIntent: async (input: {amount: number; currencyCode: string; decimalPlaces?: number; idempotencyKey: string}) => {
            gateway.intents.push({amount: input.amount, currencyCode: input.currencyCode, decimalPlaces: input.decimalPlaces});
            return {id: `pi_${input.idempotencyKey}`, clientSecret: `cs_${input.idempotencyKey}`};
        },
        createRefund: async (input: {amount?: number; currencyCode: string; decimalPlaces?: number}) => {
            gateway.refunds.push({amount: input.amount, currencyCode: input.currencyCode, decimalPlaces: input.decimalPlaces});
            return {id: `re_${gateway.refunds.length}`, status: "succeeded"};
        },
        toMinorUnits: (amount: string | number, _currencyCode: string, decimalPlaces = 2) => Number(toMinor(amount, decimalPlaces)),
    };
    return {getPaymentAdapter: () => adapter, stripeAdapter: adapter};
});

import {allPermissionTags, appFor, callerHeader, type TestCaller} from "@coreModule/_tests/httpHarness";
import Company from "@coreModule/database/schemas/company/company";
import Currency from "@coreModule/database/schemas/currency/currency";
import {getLogger} from "@coreModule/loggers/serverLog";
import {withTenant} from "@coreModule/utilities/endpoints/tenantScope";
import {runInTransaction} from "@coreModule/utilities/middlewares/runInTransaction";
import {paymentTransactionService} from "@financeModule/database/schemas/paymentTransaction/paymentTransaction.service";
import PaymentTransaction from "@financeModule/database/schemas/paymentTransaction/paymentTransaction";
import type {SettledPaymentIntent} from "@financeModule/utilities/services/payment/paymentSourceHandlers";
import * as planRoute from "@dentalClinicModule/api/dentalClinic/private/treatmentPlan";
import ClinicConfig from "@dentalClinicModule/database/schemas/clinicConfig/clinicConfig";
import Patient from "@dentalClinicModule/database/schemas/patient/patient";
import TreatmentPlan from "@dentalClinicModule/database/schemas/treatmentPlan/treatmentPlan";
import {failDepositPayment, settleDepositPayment, startDepositPayment} from "@dentalClinicModule/utilities/services/treatmentPlanPayments";

const clinicId = new ObjectId();
const asClinic = <T>(fn: () => PromiseLike<T>): Promise<T> => withTenant(clinicId, fn);
const logger = getLogger("clinic_plan_payments_test");
const app = appFor([{...planRoute, module: "dentalClinic"}]);

let staff: TestCaller;
let patientId: string;

type Line = {unitPrice: number; quantity?: number; discount?: number};
const action = (name: string, body: Record<string, unknown>) =>
    request(app).post(`/api/dentalClinic/treatmentPlan/${name}`).set(callerHeader(staff)).send(body);

/** The clinic quotes in this currency from now on. */
async function clinicCurrency(abbreviation: string, decimalPlaces: number) {
    const currency = await Currency.create({name: abbreviation, symbol: abbreviation, abbreviation, decimalPlaces, company: clinicId});
    await ClinicConfig.updateOne({company: clinicId}, {$set: {currency: currency._id}});
}

/** A quote for the patient, created the way the panel does, then accepted by them. */
async function acceptedPlan(lines: Line[], deposit: {depositType: "none" | "fixed" | "percent"; depositValue?: number}): Promise<string> {
    const created = await request(app).put("/api/dentalClinic/treatmentPlan").set(callerHeader(staff)).send({
        patient: patientId,
        phases: [{title: "Treatment", visits: 1, estimatedDays: 1}],
        lines: lines.map((line, index) => ({phase: 1, kind: "treatment", name: `Line ${index + 1}`, quantity: 1, ...line})),
        ...deposit,
    });
    expect(created.body.error_code ?? "created").toBe("created");
    await TreatmentPlan.updateOne({_id: new ObjectId(created.body._id)}, {$set: {status: "accepted"}});
    return created.body._id;
}

const startDeposit = (id: string) => runInTransaction(logger, async (session) => {
    const plan = await TreatmentPlan.findById(id).session(session);
    return startDepositPayment(plan!, {session, logger, languageCode: "en-US"});
});
const settle = (id: string, intent: SettledPaymentIntent) => runInTransaction(logger, async (session) => {
    const plan = await TreatmentPlan.findById(id).session(session);
    await settleDepositPayment(plan!, intent, {session, logger, languageCode: "en-US"});
});
/** The finance webhook marks the ledger row paid before handing the intent to the plan. */
async function cardPaid(id: string, amountMinor: number, currencyCode: string): Promise<void> {
    const [pending] = await paymentTransactionService.find({sourceType: "treatmentPlan", sourceId: new ObjectId(id), gateway: "stripe"}, {});
    await PaymentTransaction.updateOne({_id: pending._id}, {$set: {status: "succeeded"}});
    await settle(id, {id: pending.gatewayTransactionId!, amountMinor, currencyCode});
}
const ledger = async (id: string) => (await paymentTransactionService.find({sourceType: "treatmentPlan", sourceId: new ObjectId(id)}, {}, undefined, undefined, {createdAt: 1}))
    .map((row) => ({type: row.type, gateway: row.gateway, amount: String(row.amount), refunded: String(row.refundedAmount)}));

beforeAll(async () => {
    await connectTestDatabase();
    await Promise.all([TreatmentPlan, Patient, ClinicConfig, Currency, PaymentTransaction].map((model) => model.init()));
    staff = {userId: new ObjectId().toString(), companyId: clinicId.toString(), isAdmin: true, permissions: allPermissionTags([TreatmentPlan])};
    await Company.collection.insertOne({_id: clinicId, name: "Smile Tirana", vat: "VAT-1"});
}, 120000);

afterAll(async () => {
    await disconnectTestDatabase();
});

beforeEach(() => asClinic(async () => {
    await Promise.all([TreatmentPlan, Patient, ClinicConfig, Currency, PaymentTransaction].map((model) => model.collection.deleteMany({})));
    gateway.intents.length = 0;
    gateway.refunds.length = 0;
    const euro = await Currency.create({name: "Euro", symbol: "€", abbreviation: "EUR", decimalPlaces: 2, company: clinicId});
    await ClinicConfig.create({company: clinicId, currency: euro._id, inquiriesEnabled: true});
    const patient = await Patient.create({company: clinicId, number: "PT-1", firstName: "Giulia", lastName: "Bianchi", preferredLanguage: "it-IT", source: "phone"});
    patientId = patient._id.toString();
}));

describe("a quote in a currency without decimals (TD-B38)", {timeout: 60000}, () => {
    it("rounds the deposit to whole units, half away from zero", () => asClinic(async () => {
        await clinicCurrency("JPY", 0);
        const id = await acceptedPlan([{unitPrice: 1999}, {unitPrice: 16}], {depositType: "percent", depositValue: 10});
        // 10 % of 2015 is 201.5
        expect((await TreatmentPlan.findById(id))!.totals).toMatchObject({subtotal: 2015, discount: 0, total: 2015, deposit: 202});
    }));

    it("takes the deposit online in whole units and the rest at the clinic, never more than is due", () => asClinic(async () => {
        await clinicCurrency("JPY", 0);
        const id = await acceptedPlan([{unitPrice: 1999}, {unitPrice: 16}], {depositType: "percent", depositValue: 10});

        expect((await startDeposit(id)).amount).toBe(202);
        expect(gateway.intents).toEqual([{amount: 202, currencyCode: "jpy", decimalPlaces: 0}]);
        expect(await ledger(id)).toEqual([{type: "charge", gateway: "stripe", amount: "202", refunded: "0"}]);

        await cardPaid(id, 202, "jpy");
        expect(await TreatmentPlan.findById(id)).toMatchObject({amountPaid: 202, paymentStatus: "deposit_paid"});

        expect((await action("recordPayment", {_id: id, amount: 1814})).body.error_code).toBe("treatment_plan_payment_exceeds_due");
        const settled = await action("recordPayment", {_id: id, amount: 1813, note: "cash"});
        expect(settled.body).toMatchObject({paymentStatus: "paid", amountPaid: 2015, amountDue: 0});
    }));

    it("refunds the newest charge first and the card part through the gateway, in whole units", () => asClinic(async () => {
        await clinicCurrency("JPY", 0);
        const id = await acceptedPlan([{unitPrice: 1999}, {unitPrice: 16}], {depositType: "percent", depositValue: 10});
        await startDeposit(id);
        await cardPaid(id, 202, "jpy");
        await action("recordPayment", {_id: id, amount: 1813});

        const partly = await action("refund", {_id: id, amount: 1900, reason: "Second phase cancelled"});
        expect(partly.body).toMatchObject({paymentStatus: "partially_refunded", amountPaid: 115, amountDue: 1900});
        // The cash (1813) is paid back by hand; the 87 left comes off the card.
        expect(gateway.refunds).toEqual([{amount: 87, currencyCode: "jpy", decimalPlaces: 0}]);
        expect(await ledger(id)).toEqual(expect.arrayContaining([
            {type: "charge", gateway: "stripe", amount: "202", refunded: "87"},
            {type: "charge", gateway: "manual", amount: "1813", refunded: "1813"},
        ]));

        const all = await action("refund", {_id: id, amount: 115, reason: "Treatment cancelled"});
        expect(all.body).toMatchObject({paymentStatus: "refunded", amountPaid: 0});
        expect((await action("refund", {_id: id, amount: 1, reason: "x"})).body.error_code).toBe("treatment_plan_refund_exceeds_paid");
    }));
});

describe("a quote in a currency with three decimals", {timeout: 60000}, () => {
    it("keeps the third decimal in the totals and refuses a payment a fraction over what is due", () => asClinic(async () => {
        await clinicCurrency("KWD", 3);
        const id = await acceptedPlan([{unitPrice: 10.125}], {depositType: "fixed", depositValue: 5.0625});
        expect((await TreatmentPlan.findById(id))!.totals).toMatchObject({total: 10.125, deposit: 5.063});

        const deposit = await action("recordPayment", {_id: id, amount: 5.063});
        // The panel sees the plan at the currency's precision too (D90).
        expect(deposit.body).toMatchObject({currency: {abbreviation: "KWD", decimalPlaces: 3}, amountDue: 5.062, lines: [expect.objectContaining({total: 10.125})]});
        // 5.062 is due: four thousandths more is still too much.
        expect((await action("recordPayment", {_id: id, amount: 5.066})).body.error_code).toBe("treatment_plan_payment_exceeds_due");
        const paid = await action("recordPayment", {_id: id, amount: 5.062});
        expect(paid.body).toMatchObject({paymentStatus: "paid", amountPaid: 10.125, amountDue: 0});
    }));
});

describe("payments in cents", {timeout: 60000}, () => {
    it("adds partial payments exactly", () => asClinic(async () => {
        const id = await acceptedPlan([{unitPrice: 0.1, quantity: 3}], {depositType: "none"});
        await action("recordPayment", {_id: id, amount: 0.1});
        const paid = await action("recordPayment", {_id: id, amount: 0.2});
        expect(paid.body).toMatchObject({paymentStatus: "paid", amountPaid: 0.3, amountDue: 0});
    }));

    it("takes nothing before the patient accepts the quote", () => asClinic(async () => {
        const id = await acceptedPlan([{unitPrice: 100}], {depositType: "fixed", depositValue: 20});
        await TreatmentPlan.updateOne({_id: new ObjectId(id)}, {$set: {status: "sent"}});
        expect((await action("recordPayment", {_id: id, amount: 20})).body.error_code).toBe("treatment_plan_invalid_status");
        await expect(startDeposit(id)).rejects.toMatchObject({error_code: "treatment_plan_invalid_status"});
        expect((await action("refund", {_id: id, amount: 1, reason: "x"})).body.error_code).toBe("treatment_plan_refund_exceeds_paid");
    }));
});

describe("the gateway's answer", {timeout: 60000}, () => {
    it("leaves a charge that does not match the ledger for staff to review", () => asClinic(async () => {
        const id = await acceptedPlan([{unitPrice: 1000}], {depositType: "percent", depositValue: 10});
        await startDeposit(id);
        await cardPaid(id, 9999, "eur");
        await cardPaid(id, 10000, "usd");
        expect(await TreatmentPlan.findById(id)).toMatchObject({amountPaid: 0, paymentStatus: "pending"});
        await cardPaid(id, 10000, "eur");
        expect(await TreatmentPlan.findById(id)).toMatchObject({amountPaid: 100, paymentStatus: "deposit_paid"});
    }));

    it("marks a declined card failed and lets the patient try again with the same payment", () => asClinic(async () => {
        const id = await acceptedPlan([{unitPrice: 1000}], {depositType: "percent", depositValue: 10});
        const first = await startDeposit(id);
        const intentId = (await TreatmentPlan.findById(id))!.stripePaymentIntentId!;
        await runInTransaction(logger, async (session) => {
            const plan = await TreatmentPlan.findById(id).session(session);
            await failDepositPayment(plan!, {id: intentId, amountMinor: 10000, currencyCode: "eur", failureReason: "card_declined"}, {session, logger, languageCode: "en-US"});
        });
        const failed = await TreatmentPlan.findById(id);
        expect(failed).toMatchObject({paymentStatus: "failed", amountPaid: 0});
        expect(failed!.timeline.at(-1)).toMatchObject({event: "payment_failed", note: "card_declined"});

        const retry = await startDeposit(id);
        expect(retry).toEqual(first);
        expect(await ledger(id)).toHaveLength(1);
    }));
});
