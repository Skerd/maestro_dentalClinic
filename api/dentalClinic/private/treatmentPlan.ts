import {ObjectId} from "mongodb";
import {createCrudRouter, type CrudCreateParams} from "@coreModule/api/crudRouterFactory";
import {buildUpdateDataFromSchemaDef} from "@coreModule/api/buildUpdateDataFromSchemaDef";
import {nestedEntityToRef} from "@coreModule/utilities/mappers/common.mapper";
import {apiValidationException} from "armonia/src/modules/core/helpers/exceptions";
import {TreatmentPlanSchemaDef, type CreateTreatmentPlanFormType} from "armonia/src/modules/dentalClinic/api/dentalClinic/private/treatmentPlan/treatmentPlan.schema-def";
import {
    createTreatmentPlanFormSchema,
    editTreatmentPlanFormSchema,
} from "armonia/src/modules/dentalClinic/api/dentalClinic/private/treatmentPlan/treatmentPlan.form.validators";
import TreatmentPlan, {type ITreatmentPlanLine} from "@dentalClinicModule/database/schemas/treatmentPlan/treatmentPlan";
import {treatmentPlanService} from "@dentalClinicModule/database/schemas/treatmentPlan/treatmentPlan.service";
import {TreatmentPlanActions} from "@dentalClinicModule/database/schemas/treatmentPlan/treatmentPlan.actions";
import {clinicConfigService} from "@dentalClinicModule/database/schemas/clinicConfig/clinicConfig.service";
import {treatmentPlanToDTO, treatmentPlansToDTO} from "@dentalClinicModule/utilities/mappers/treatmentPlan/treatmentPlanMapper.dto";
import {assertPlanContent, loadPlanInquiry, planNumber, planTotals} from "@dentalClinicModule/utilities/services/treatmentPlans";
import {loadPatientOrThrow} from "@dentalClinicModule/utilities/services/patientRecords";

export const basePath = "/api/dentalClinic/treatmentPlan";

const optionalId = (value: string | undefined) => (value ? new ObjectId(value) : undefined);

type PlanLineInput = {phase: number; kind: ITreatmentPlanLine["kind"]; service?: string; name: string; teeth?: string[]; material?: string; brand?: string; quantity: number; unitPrice: number; discount?: number; warrantyYears?: number};

const linesOf = (lines: PlanLineInput[]): ITreatmentPlanLine[] =>
    lines.map((line) => ({...line, service: optionalId(line.service), teeth: line.teeth ?? []}));

// A plan is edited while it is a draft; once sent it changes only through its actions.
export const {router} = createCrudRouter({
    collectionName: "treatmentplans",
    model: TreatmentPlan,
    service: treatmentPlanService,
    entityName: "TreatmentPlan",
    createSchema: createTreatmentPlanFormSchema,
    editSchema: editTreatmentPlanFormSchema,
    toDTO: treatmentPlanToDTO,
    toDTOArray: treatmentPlansToDTO,
    toSelect: (plans) => plans.map((plan) => ({value: plan._id.toString(), label: plan.optionLabel ? `${plan.number} · ${plan.optionLabel}` : plan.number})),
    selectSearchField: "number",
    selectProjection: "_id number optionLabel",
    defaultSort: {createdAt: -1},
    actions: TreatmentPlanActions,
    /** A new draft in the clinic's currency, answering a request or for a patient, with the clinic's standard terms. */
    buildCreateData: async (params: CrudCreateParams<CreateTreatmentPlanFormType>) => {
        const {company, session, logger, languageCode, actionUserCtx} = params;
        const ctx = {session, logger, languageCode, auditUserId: actionUserCtx.userId};
        assertPlanContent(params, languageCode);
        if (!params.inquiry && !params.patient) throw apiValidationException("treatment_plan_target_required", "", null, languageCode);
        const inquiry = params.inquiry ? await loadPlanInquiry(company._id, params.inquiry, ctx) : undefined;
        const patient = params.patient ? await loadPatientOrThrow(company._id, params.patient, ctx) : undefined;
        const config = await clinicConfigService.getOrCreateForCompany(company._id, ctx);
        const lines = linesOf(params.lines);
        const patientId = patient?._id ?? nestedEntityToRef(inquiry?.patient);
        const now = new Date();
        return {
            number: planNumber(now),
            status: "draft",
            ...(inquiry ? {inquiry: inquiry._id} : {}),
            ...(patientId ? {patient: patientId} : {}),
            ...(params.optionLabel ? {optionLabel: params.optionLabel} : {}),
            version: 1,
            currency: nestedEntityToRef(config.currency),
            phases: params.phases,
            lines,
            depositType: params.depositType,
            depositValue: params.depositValue,
            refundableUntilDays: params.refundableUntilDays,
            totals: planTotals(lines, params.depositType, params.depositValue),
            ...(params.validUntil ? {validUntil: params.validUntil} : {}),
            ...(params.notes ? {notes: params.notes} : {}),
            terms: params.terms ?? config.quoteTerms,
            timeline: [{event: "created", at: now, by: new ObjectId(actionUserCtx.userId)}],
        };
    },
    buildUpdateData: (params: any, writeFields) => {
        if (params.existing.status !== "draft") throw apiValidationException("treatment_plan_invalid_status", "", null, params.languageCode);
        assertPlanContent(params, params.languageCode);
        const update = buildUpdateDataFromSchemaDef(TreatmentPlanSchemaDef)(params, writeFields);
        // What it answers and who it is for are fixed once the draft exists.
        delete update.inquiry;
        delete update.patient;
        const lines = params.lines ? linesOf(params.lines) : params.existing.lines;
        if (params.lines) update.lines = lines;
        update.totals = planTotals(lines, params.depositType ?? params.existing.depositType, params.depositValue ?? params.existing.depositValue);
        return update;
    },
});
