import type {ObjectId} from "mongodb";
import type {ClientSession} from "mongoose";
import {apiValidationException} from "armonia/src/modules/core/helpers/exceptions";
import type {TreatmentPlanPaymentStatus} from "armonia/src/modules/dentalClinic/constants";
import {addMoney, roundToCurrency, subtractMoney} from "armonia/src/modules/core/helpers/money";
import {nestedEntityToRef} from "@coreModule/utilities/mappers/common.mapper";
import Currency from "@coreModule/database/schemas/currency/currency";
import {PAYMENTS} from "@financeModule/environment";
import PaymentTransaction from "@financeModule/database/schemas/paymentTransaction/paymentTransaction";
import {paymentTransactionService} from "@financeModule/database/schemas/paymentTransaction/paymentTransaction.service";
import {getPaymentAdapter} from "@financeModule/utilities/services/payment/paymentService";
import type {SettledPaymentIntent} from "@financeModule/utilities/services/payment/paymentSourceHandlers";
import {recordManualCharge, refundSourceCharges, type PaymentSource} from "@financeModule/utilities/services/payment/sourcePayments";
import type {ITreatmentPlan} from "@dentalClinicModule/database/schemas/treatmentPlan/treatmentPlan";
import ClinicInquiry from "@dentalClinicModule/database/schemas/clinicInquiry/clinicInquiry";
import {NotificationEventCodes} from "@dentalClinicModule/domain/notifications/notificationEventCodes";
import type {ClinicCtx} from "./appointmentBooking";
import {notifyInquiryPatient, notifyInquiryStaff} from "./inquiryNotify";

type Payable = Pick<ITreatmentPlan, "status" | "totals" | "amountPaid">;

/** The plan's total less what was paid. */
export function amountDue(plan: Payable): number {
    return Math.max(0, subtractMoney(plan.totals.total, plan.amountPaid ?? 0));
}

/** What the patient can still pay online: the deposit less what was paid, once the plan is accepted. */
export function depositDue(plan: Payable): number {
    if (plan.status !== "accepted") return 0;
    return Math.max(0, subtractMoney(Math.min(plan.totals.deposit, plan.totals.total), plan.amountPaid ?? 0));
}

/** Payment status that follows from what was paid and refunded; never set it any other way. */
export function paymentStatusFor(plan: Payable, refunded: boolean): TreatmentPlanPaymentStatus {
    const paid = plan.amountPaid ?? 0;
    if (refunded) return paid > 0 ? "partially_refunded" : "refunded";
    if (plan.totals.total > 0 && amountDue(plan) <= 0) return "paid";
    if (plan.totals.deposit > 0 && paid >= plan.totals.deposit) return "deposit_paid";
    return "unpaid";
}

/** Card payments are taken only where the platform has a gateway set up. */
export function onlinePaymentAvailable(): boolean {
    return Boolean(PAYMENTS.STRIPE_ENABLED && getPaymentAdapter("stripe")?.isEnabled());
}

async function currencyCodeOf(plan: ITreatmentPlan, session: ClientSession): Promise<string> {
    const currency = await Currency.findById(nestedEntityToRef(plan.currency)).select("abbreviation").session(session);
    return (currency?.abbreviation ?? "eur").toLowerCase();
}

async function planSource(plan: ITreatmentPlan, session: ClientSession): Promise<PaymentSource> {
    return {
        sourceType: "treatmentPlan",
        sourceId: plan._id,
        company: nestedEntityToRef(plan.company),
        currency: nestedEntityToRef(plan.currency),
        currencyCode: await currencyCodeOf(plan, session),
    };
}

function assertAccepted(plan: ITreatmentPlan, languageCode: string): void {
    if (plan.status !== "accepted") throw apiValidationException("treatment_plan_invalid_status", "", null, languageCode);
}

/** The clinic and the patient hear about money received, after the caller's transaction commits. */
async function notifyPaid(plan: ITreatmentPlan, ctx: ClinicCtx): Promise<void> {
    const inquiry = await ClinicInquiry.findById(nestedEntityToRef(plan.inquiry)).session(ctx.session);
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
    const amount = depositDue(plan);
    if (amount <= 0) throw apiValidationException("treatment_plan_nothing_to_pay", "", null, ctx.languageCode);
    const adapter = getPaymentAdapter("stripe");
    if (!onlinePaymentAvailable() || !adapter) {
        throw apiValidationException("treatment_plan_online_payment_unavailable", "", null, ctx.languageCode);
    }
    const source = await planSource(plan, ctx.session);
    const intent = await adapter.createPaymentIntent({
        amount,
        currencyCode: source.currencyCode,
        metadata: {sourceType: "treatmentPlan", planId: plan._id.toString(), companyId: String(source.company)},
        idempotencyKey: `plan-deposit-${plan._id.toString()}-${plan.amountPaid ?? 0}`,
    });
    if (!(await PaymentTransaction.exists({gatewayTransactionId: intent.id}).session(ctx.session))) {
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
    const charge = await PaymentTransaction.findOne({gatewayTransactionId: intent.id, type: "charge"}).session(ctx.session);
    const adapter = getPaymentAdapter("stripe");
    const currencyCode = await currencyCodeOf(plan, ctx.session);
    if (!charge || !adapter || adapter.toMinorUnits(charge.amount, currencyCode) !== intent.amountMinor
        || (intent.currencyCode && intent.currencyCode.toLowerCase() !== currencyCode)) {
        ctx.logger.err(`Deposit payment ${intent.id} does not match plan ${plan.number}; left for staff to review`);
        return;
    }
    plan.amountPaid = addMoney(plan.amountPaid ?? 0, charge.amount);
    plan.paymentStatus = paymentStatusFor(plan, false);
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
    const due = amountDue(plan);
    if (input.amount > due + 0.005) {
        throw apiValidationException("treatment_plan_payment_exceeds_due", "", null, ctx.languageCode, [String(due)]);
    }
    await recordManualCharge(await planSource(plan, ctx.session), input.amount, input.note, ctx);
    plan.amountPaid = addMoney(plan.amountPaid ?? 0, input.amount);
    plan.paymentStatus = paymentStatusFor(plan, false);
    plan.timeline.push({event: "payment_received", at: now, by: input.by, note: input.note ?? `manual ${roundToCurrency(input.amount)}`});
    await plan.save({session: ctx.session});
}

/** Gives back up to `amount` of what was paid. Returns the amount refunded. */
export async function refundPlanPayments(
    plan: ITreatmentPlan,
    input: {amount: number; reason: string; by?: ObjectId},
    ctx: ClinicCtx,
): Promise<number> {
    const paid = plan.amountPaid ?? 0;
    if (input.amount > paid + 0.005) {
        throw apiValidationException("treatment_plan_refund_exceeds_paid", "", null, ctx.languageCode, [String(paid)]);
    }
    const refunded = await refundSourceCharges(
        await planSource(plan, ctx.session),
        {amount: input.amount, paid, reason: input.reason, idempotencyPrefix: `plan-refund-${plan._id.toString()}`},
        ctx,
    );
    if (refunded > 0) {
        plan.amountPaid = subtractMoney(paid, refunded);
        plan.paymentStatus = paymentStatusFor(plan, true);
        plan.timeline.push({event: "refunded", at: new Date(), by: input.by, note: `${refunded} · ${input.reason}`});
        await plan.save({session: ctx.session});
    }
    return refunded;
}
