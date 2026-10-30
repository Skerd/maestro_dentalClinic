import {ObjectId} from "mongodb";
import {action} from "@coreModule/api/actionDecorator";
import {getModelCollectedData} from "@coreModule/database/collections";
import SchemaGuard from "@coreModule/database/security/schemaGuard";
import type {TransactionRequiredParams} from "@coreModule/utilities/middlewares/transactionUtils";
import {apiValidationException} from "armonia/src/modules/core/helpers/exceptions";
import {validateSingleForm} from "armonia/src/modules/core/utilities/zod/shared.validator";
import type {TreatmentPlan as TreatmentPlanDto} from "armonia/src/modules/dentalClinic/api/dentalClinic/private/treatmentPlan/treatmentPlan.dto";
import TreatmentPlan, {type ITreatmentPlan} from "./treatmentPlan";
import {treatmentPlanToDTO} from "@dentalClinicModule/utilities/mappers/treatmentPlan/treatmentPlanMapper.dto";
import {revisePlan, sendPlan} from "@dentalClinicModule/utilities/services/treatmentPlans";

type ActionParams<F> = TransactionRequiredParams & F;

/** Plan actions need write access to the plan's `status`, like the inquiry actions. */
async function loadPlan(params: TransactionRequiredParams & {_id: string}): Promise<ITreatmentPlan> {
    const {_id, company, session, languageCode, actionUserCtx} = params;
    const writeFields = SchemaGuard.sanitizeFields(TreatmentPlan, getModelCollectedData("treatmentplans").writeFields!, "write", actionUserCtx, languageCode);
    if (!writeFields.status) throw apiValidationException("user_permissions_not_sufficient", "", null, languageCode);
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
}
