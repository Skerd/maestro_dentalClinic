import {ObjectId} from "mongodb";
import {action} from "@coreModule/api/actionDecorator";
import {getModelCollectedData} from "@coreModule/database/collections";
import SchemaGuard from "@coreModule/database/security/schemaGuard";
import type {TransactionRequiredParams} from "@coreModule/utilities/middlewares/transactionUtils";
import {apiValidationException} from "armonia/src/modules/core/helpers/exceptions";
import {validateSingleForm} from "armonia/src/modules/core/utilities/zod/shared.validator";
import type {TreatmentPlan as TreatmentPlanDto} from "armonia/src/modules/dentalClinic/api/dentalClinic/private/treatmentPlan/treatmentPlan.dto";
import {recordPlanPaymentFormSchema, refundPlanPaymentFormSchema} from "armonia/src/modules/dentalClinic/api/dentalClinic/private/treatmentPlan/treatmentPlan.form.validators";
import type {RecordPlanPaymentFormType, RefundPlanPaymentFormType} from "armonia/src/modules/dentalClinic/api/dentalClinic/private/treatmentPlan/treatmentPlan.schema-def";
import TreatmentPlan, {type ITreatmentPlan} from "./treatmentPlan";
import {treatmentPlanToDTO} from "@dentalClinicModule/utilities/mappers/treatmentPlan/treatmentPlanMapper.dto";
import {revisePlan, sendPlan} from "@dentalClinicModule/utilities/services/treatmentPlans";
import {recordClinicPayment, refundPlanPayments} from "@dentalClinicModule/utilities/services/treatmentPlanPayments";

type ActionParams<F> = TransactionRequiredParams & F;

/** The action permission (D14) is checked before the body. */
async function loadPlan(params: TransactionRequiredParams & {_id: string}): Promise<ITreatmentPlan> {
    const {_id, company, session, languageCode} = params;
    const plan = ObjectId.isValid(_id)
        ? await TreatmentPlan.findOne({_id: new ObjectId(_id), company: company._id, deletedAt: null}).session(session)
        : null;
    if (!plan) throw apiValidationException("treatment_plan_not_found", "", null, languageCode);
    return plan;
}

async function toDto(plan: ITreatmentPlan, params: TransactionRequiredParams): Promise<TreatmentPlanDto> {
    const {session, actionUserCtx, languageCode} = params;
    const readFields = SchemaGuard.sanitizeFields(TreatmentPlan, getModelCollectedData("treatmentplans").readFields!, "read", actionUserCtx, languageCode);
    const populate = SchemaGuard.generatePopulate(readFields, TreatmentPlan.schema);
    const fresh = await TreatmentPlan.findById(plan._id).populate(populate.populate).session(session);
    return treatmentPlanToDTO(fresh ?? plan);
}

function ctxOf(params: TransactionRequiredParams) {
    return {session: params.session, logger: params.logger, languageCode: params.languageCode, auditUserId: params.actionUserCtx.userId};
}

export class TreatmentPlanActions {
    /** Sends the draft to the patient; it replaces the quote it was revised from. */
    @action({auth: "private", transaction: true, rateLimit: {windowMs: 60000, max: 30}, schema: validateSingleForm})
    async send(params: ActionParams<{_id: string}>): Promise<TreatmentPlanDto> {
        const plan = await loadPlan(params);
        await sendPlan(plan, {userId: params.actionUserCtx.userId}, ctxOf(params));
        return toDto(plan, params);
    }

    /** A new draft copied from a sent quote, to change it. */
    @action({auth: "private", transaction: true, rateLimit: {windowMs: 60000, max: 30}, schema: validateSingleForm})
    async revise(params: ActionParams<{_id: string}>): Promise<TreatmentPlanDto> {
        const plan = await loadPlan(params);
        const revision = await revisePlan(plan, {userId: params.actionUserCtx.userId}, ctxOf(params));
        return toDto(revision, params);
    }

    /** Money the clinic took itself (cash, card terminal, transfer), up to what is still due. */
    @action({auth: "private", transaction: true, rateLimit: {windowMs: 60000, max: 30}, schema: recordPlanPaymentFormSchema})
    async recordPayment(params: ActionParams<RecordPlanPaymentFormType>): Promise<TreatmentPlanDto> {
        const plan = await loadPlan(params);
        await recordClinicPayment(plan, {amount: params.amount, note: params.note, by: new ObjectId(params.actionUserCtx.userId)}, ctxOf(params));
        return toDto(plan, params);
    }

    /** Gives back up to the amount asked: online charges through the gateway, the rest by hand. */
    @action({auth: "private", transaction: true, rateLimit: {windowMs: 60000, max: 10}, schema: refundPlanPaymentFormSchema})
    async refund(params: ActionParams<RefundPlanPaymentFormType>): Promise<TreatmentPlanDto> {
        const plan = await loadPlan(params);
        await refundPlanPayments(plan, {amount: params.amount, reason: params.reason, by: new ObjectId(params.actionUserCtx.userId)}, ctxOf(params));
        return toDto(plan, params);
    }
}
