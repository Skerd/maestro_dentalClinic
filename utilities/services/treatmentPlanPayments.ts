import type {ObjectId} from "mongodb";
import {apiValidationException} from "armonia/src/modules/core/helpers/exceptions";
import type {TreatmentPlanPaymentStatus} from "armonia/src/modules/dentalClinic/constants";
import {DEFAULT_DECIMAL_PLACES, minorToNumber, roundToCurrency, subtractMoney, toMinor, type MoneyInput} from "armonia/src/modules/core/helpers/money";
import {nestedEntityToRef} from "@coreModule/utilities/mappers/common.mapper";
import {PAYMENTS} from "@financeModule/environment";
import {paymentTransactionService} from "@financeModule/database/schemas/paymentTransaction/paymentTransaction.service";
import {getPaymentAdapter} from "@financeModule/utilities/services/payment/paymentService";
import type {SettledPaymentIntent} from "@financeModule/utilities/services/payment/paymentSourceHandlers";
import {recordManualCharge, refundSourceCharges, type PaymentSource} from "@financeModule/utilities/services/payment/sourcePayments";
import type {ITreatmentPlan} from "@dentalClinicModule/database/schemas/treatmentPlan/treatmentPlan";
import {NotificationEventCodes} from "@dentalClinicModule/domain/notifications/notificationEventCodes";
import type {ClinicCtx} from "./appointmentBooking";
import {notifyInquiryPatient, notifyInquiryStaff} from "./inquiryNotify";

import {currencyService} from "@coreModule/database/schemas/currency/currency.service";
import {clinicInquiryService} from "@dentalClinicModule/database/schemas/clinicInquiry/clinicInquiry.service";
type Payable = Pick<ITreatmentPlan, "status" | "totals" | "amountPaid">;

/** The plan's total less what was paid, at the plan currency's `decimals`. */
export function amountDue(plan: Payable, decimals = DEFAULT_DECIMAL_PLACES): number {
    return Math.max(0, subtractMoney(plan.totals.total, plan.amountPaid ?? 0, decimals));
}

/** What the patient can still pay online: the deposit less what was paid, once the plan is accepted. */
export function depositDue(plan: Payable, decimals = DEFAULT_DECIMAL_PLACES): number {
    if (plan.status !== "accepted") return 0;
    return Math.max(0, subtractMoney(Math.min(plan.totals.deposit, plan.totals.total), plan.amountPaid ?? 0, decimals));
}

/** Payment status that follows from what was paid and refunded; never set it any other way. */
export function paymentStatusFor(plan: Payable, refunded: boolean, decimals = DEFAULT_DECIMAL_PLACES): TreatmentPlanPaymentStatus {
    const paid = plan.amountPaid ?? 0;
    if (refunded) return paid > 0 ? "partially_refunded" : "refunded";
    if (plan.totals.total > 0 && amountDue(plan, decimals) <= 0) return "paid";
    if (plan.totals.deposit > 0 && paid >= plan.totals.deposit) return "deposit_paid";
    return "unpaid";
}

/** Card payments are taken only where the platform has a gateway set up. */
export function onlinePaymentAvailable(): boolean {
    return Boolean(PAYMENTS.STRIPE_ENABLED && getPaymentAdapter("stripe")?.isEnabled());
}

/**
 * The plan currency: its lowercase code for the gateway and its `decimalPlaces` (TD-B38).
 * A plan always carries the clinic's currency; a missing one is refused rather than guessed (GLB-08).
 */
async function planCurrency(plan: ITreatmentPlan, ctx: ClinicCtx): Promise<{code: string; decimalPlaces: number}> {
    const currency = await currencyService.findById(nestedEntityToRef(plan.currency), {session: ctx.session}, undefined, "abbreviation decimalPlaces");
    if (!currency?.abbreviation) throw apiValidationException("clinic_currency_not_configured", "", null, ctx.languageCode);
    return {
        code: currency.abbreviation.toLowerCase(),
        decimalPlaces: currency.decimalPlaces ?? DEFAULT_DECIMAL_PLACES,
    };
}

/** `amount` added to (or, negative, taken from) what was paid, at the currency's decimals. */
function paidAfter(plan: ITreatmentPlan, amount: MoneyInput, decimalPlaces: number): number {
    return minorToNumber(toMinor(plan.amountPaid ?? 0, decimalPlaces) + toMinor(amount, decimalPlaces), decimalPlaces);
}

async function planSource(plan: ITreatmentPlan, ctx: ClinicCtx): Promise<PaymentSource> {
    const currency = await planCurrency(plan, ctx);
    return {
        sourceType: "treatmentPlan",
        sourceId: plan._id,
        company: nestedEntityToRef(plan.company),
        currency: nestedEntityToRef(plan.currency),
        currencyCode: currency.code,
        decimalPlaces: currency.decimalPlaces,
    };
}

function assertAccepted(plan: ITreatmentPlan, languageCode: string): void {
    if (plan.status !== "accepted") throw apiValidationException("treatment_plan_invalid_status", "", null, languageCode);
}

/** The clinic and the patient hear about money received, after the caller's transaction commits. */
async function notifyPaid(plan: ITreatmentPlan, ctx: ClinicCtx): Promise<void> {
    const inquiry = await clinicInquiryService.findById(nestedEntityToRef(plan.inquiry), {session: ctx.session});
    if (!inquiry) return;
    await notifyInquiryStaff(NotificationEventCodes.DEPOSIT_PAID, inquiry, ctx);
    await notifyInquiryPatient("depositPaid", inquiry, {}, ctx);
}

/**
 * Starts the online payment of what is left of the deposit: a gateway intent keyed on the plan
 * and what was paid so far (a replayed request reuses it) and a pending ledger row the webhook
 * settles. Returns the client secret the portal confirms the card with.
 */
export async function startDepositPayment(plan: ITreatmentPlan, ctx: ClinicCtx): Promise<{clientSecret: string; amount: number}> {
    assertAccepted(plan, ctx.languageCode);
    const source = await planSource(plan, ctx);
    const amount = depositDue(plan, source.decimalPlaces);
    if (amount <= 0) throw apiValidationException("treatment_plan_nothing_to_pay", "", null, ctx.languageCode);
    const adapter = getPaymentAdapter("stripe");
    if (!onlinePaymentAvailable() || !adapter) {
        throw apiValidationException("treatment_plan_online_payment_unavailable", "", null, ctx.languageCode);
    }
    const intent = await adapter.createPaymentIntent({
        amount,
        currencyCode: source.currencyCode,
        decimalPlaces: source.decimalPlaces,
        metadata: {sourceType: "treatmentPlan", planId: plan._id.toString(), companyId: String(source.company)},
        idempotencyKey: `plan-deposit-${plan._id.toString()}-${plan.amountPaid ?? 0}`,
    });
    if (!(await paymentTransactionService.exists({gatewayTransactionId: intent.id}, {session: ctx.session}))) {
        await paymentTransactionService.createPending(
            {
                sourceType: "treatmentPlan",
                sourceId: plan._id,
                gateway: "stripe",
                amount,
                currency: source.currency,
                gatewayTransactionId: intent.id,
                company: source.company,
            },
            ctx,
        );
    }
    plan.stripePaymentIntentId = intent.id;
    plan.paymentStatus = "pending";
    await plan.save({session: ctx.session});
    return {clientSecret: intent.clientSecret ?? "", amount};
}

/**
 * The gateway took the deposit: what its ledger row says is added to the plan. A charge that
 * does not match its row is left for staff to review. Settles once: the plan forgets the intent.
 */
export async function settleDepositPayment(plan: ITreatmentPlan, intent: SettledPaymentIntent, ctx: ClinicCtx, now = new Date()): Promise<void> {
    if (plan.stripePaymentIntentId !== intent.id) return;
    const charge = await paymentTransactionService.findOne({gatewayTransactionId: intent.id, type: "charge"}, {session: ctx.session});
    const adapter = getPaymentAdapter("stripe");
    const currency = await planCurrency(plan, ctx);
    if (!charge || !adapter || adapter.toMinorUnits(charge.amount, currency.code, currency.decimalPlaces) !== intent.amountMinor
        || (intent.currencyCode && intent.currencyCode.toLowerCase() !== currency.code)) {
        ctx.logger.err(`Deposit payment ${intent.id} does not match plan ${plan.number}; left for staff to review`);
        return;
    }
    plan.amountPaid = paidAfter(plan, charge.amount, currency.decimalPlaces);
    plan.paymentStatus = paymentStatusFor(plan, false, currency.decimalPlaces);
    plan.stripePaymentIntentId = undefined;
    plan.timeline.push({event: "payment_received", at: now, note: `online ${charge.amount}`});
    await plan.save({session: ctx.session});
    await notifyPaid(plan, ctx);
}

/** The card was declined; the patient can try again with the same payment. */
export async function failDepositPayment(plan: ITreatmentPlan, intent: SettledPaymentIntent, ctx: ClinicCtx): Promise<void> {
    if (plan.stripePaymentIntentId !== intent.id) return;
    plan.paymentStatus = "failed";
    plan.timeline.push({event: "payment_failed", at: new Date(), note: intent.failureReason});
    await plan.save({session: ctx.session});
}

/** Money the clinic took itself, up to what is still due. */
export async function recordClinicPayment(
    plan: ITreatmentPlan,
    input: {amount: number; note?: string; by?: ObjectId},
    ctx: ClinicCtx,
    now = new Date(),
): Promise<void> {
    assertAccepted(plan, ctx.languageCode);
    const source = await planSource(plan, ctx);
    const decimals = source.decimalPlaces ?? DEFAULT_DECIMAL_PLACES;
    const due = amountDue(plan, decimals);
    // Compared in the currency's minor units: a fixed tolerance would let a 3-decimal currency overpay.
    if (toMinor(input.amount, decimals) > toMinor(due, decimals)) {
        throw apiValidationException("treatment_plan_payment_exceeds_due", "", null, ctx.languageCode, [String(due)]);
    }
    await recordManualCharge(source, input.amount, input.note, ctx);
    plan.amountPaid = paidAfter(plan, input.amount, decimals);
    plan.paymentStatus = paymentStatusFor(plan, false, decimals);
    plan.timeline.push({event: "payment_received", at: now, by: input.by, note: input.note ?? `manual ${roundToCurrency(input.amount, decimals)}`});
    await plan.save({session: ctx.session});
}

/** Gives back up to `amount` of what was paid. Returns the amount refunded. */
export async function refundPlanPayments(
    plan: ITreatmentPlan,
    input: {amount: number; reason: string; by?: ObjectId},
    ctx: ClinicCtx,
): Promise<number> {
    const paid = plan.amountPaid ?? 0;
    const source = await planSource(plan, ctx);
    const decimals = source.decimalPlaces ?? DEFAULT_DECIMAL_PLACES;
    if (toMinor(input.amount, decimals) > toMinor(paid, decimals)) {
        throw apiValidationException("treatment_plan_refund_exceeds_paid", "", null, ctx.languageCode, [String(paid)]);
    }
    const refunded = await refundSourceCharges(
        source,
        {amount: input.amount, paid, reason: input.reason, idempotencyPrefix: `plan-refund-${plan._id.toString()}`},
        ctx,
    );
    if (refunded > 0) {
        plan.amountPaid = paidAfter(plan, -refunded, decimals);
        plan.paymentStatus = paymentStatusFor(plan, true, decimals);
        plan.timeline.push({event: "refunded", at: new Date(), by: input.by, note: `${refunded} · ${input.reason}`});
        await plan.save({session: ctx.session});
    }
    return refunded;
}
