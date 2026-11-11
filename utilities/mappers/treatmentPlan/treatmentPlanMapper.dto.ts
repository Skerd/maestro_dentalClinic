import type {ITreatmentPlan} from "@dentalClinicModule/database/schemas/treatmentPlan/treatmentPlan";
import type {TreatmentPlan, TreatmentPlanLine, TreatmentPlanPhase} from "armonia/src/modules/dentalClinic/api/dentalClinic/private/treatmentPlan/treatmentPlan.dto";
import type {PatientPlan} from "armonia/src/modules/dentalClinic/api/dentalClinic/public/patientPortal/patientPortal.response.types";
import type {CurrencySimple} from "armonia/src/modules/core/dto/currency.dto";
import type {ClinicInquirySimple} from "armonia/src/modules/dentalClinic/dto/clinicInquiry.dto";
import type {ClinicServiceSimple} from "armonia/src/modules/dentalClinic/dto/clinicService.dto";
import type {PatientSimple} from "armonia/src/modules/dentalClinic/dto/patient.dto";
import type {TreatmentPlanSimple} from "armonia/src/modules/dentalClinic/dto/treatmentPlan.dto";
import {dateToISOString, mapSnippet, nestedEntityToRef} from "@coreModule/utilities/mappers/common.mapper";
import {CurrencySimpleSnippet} from "@coreModule/database/schemas/currency/currency.snippets";
import {ClinicServiceSimpleSnippet} from "@dentalClinicModule/database/schemas/clinicService/clinicService.snippets";
import {ClinicInquirySimpleSnippet} from "@dentalClinicModule/database/schemas/clinicInquiry/clinicInquiry.snippets";
import {PatientSimpleSnippet} from "@dentalClinicModule/database/schemas/patient/patient.snippets";
import {TreatmentPlanSimpleSnippet} from "@dentalClinicModule/database/schemas/treatmentPlan/treatmentPlan.snippets";
import {mapLifeCycleToDTO, mapOwnershipToDTO, mapSoftDeleteToDTO} from "@coreModule/utilities/mappers/plugin/pluginMappers.dto";
import {lineTotal} from "@dentalClinicModule/utilities/services/treatmentPlans";
import {amountDue, depositDue} from "@dentalClinicModule/utilities/services/treatmentPlanPayments";
import {DEFAULT_DECIMAL_PLACES} from "armonia/src/modules/core/helpers/money";

/** The plan currency's `decimalPlaces` when it is populated (D90), else 2. */
function decimalsOf(currency: CurrencySimple | undefined): number {
    return currency?.decimalPlaces ?? DEFAULT_DECIMAL_PLACES;
}

// Subdocuments are copied field by field: spreading one would copy Mongoose's internal state.
function phasesToDTO(plan: ITreatmentPlan): TreatmentPlanPhase[] {
    return plan.phases.map(({title, visits, estimatedDays, minGapDaysAfterPrevious}) => ({title, visits, estimatedDays, minGapDaysAfterPrevious}));
}

function linesToDTO(plan: ITreatmentPlan, decimals: number): TreatmentPlanLine[] {
    return plan.lines.map((line) => ({
        phase: line.phase,
        kind: line.kind,
        service: mapSnippet<ClinicServiceSimple>()(line.service, ClinicServiceSimpleSnippet),
        name: line.name,
        teeth: [...(line.teeth ?? [])],
        material: line.material,
        brand: line.brand,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        discount: line.discount,
        warrantyYears: line.warrantyYears,
        total: lineTotal(line, decimals),
    }));
}

function totalsToDTO(plan: ITreatmentPlan) {
    const {subtotal, discount, total, deposit} = plan.totals;
    return {subtotal, discount, total, deposit};
}

export function treatmentPlanToDTO(plan: ITreatmentPlan): TreatmentPlan {
    const currency = mapSnippet<CurrencySimple>()(plan.currency, CurrencySimpleSnippet);
    const decimals = decimalsOf(currency);
    return {
        _id: plan._id.toString(),
        number: plan.number,
        status: plan.status,
        inquiry: mapSnippet<ClinicInquirySimple>()(plan.inquiry, ClinicInquirySimpleSnippet),
        patient: mapSnippet<PatientSimple>()(plan.patient, PatientSimpleSnippet),
        optionLabel: plan.optionLabel,
        version: plan.version,
        supersedes: mapSnippet<TreatmentPlanSimple>()(plan.supersedes, TreatmentPlanSimpleSnippet),
        currency,
        phases: phasesToDTO(plan),
        lines: linesToDTO(plan, decimals),
        depositType: plan.depositType,
        depositValue: plan.depositValue,
        refundableUntilDays: plan.refundableUntilDays,
        totals: totalsToDTO(plan),
        validUntil: plan.validUntil,
        notes: plan.notes,
        terms: plan.terms,
        sentAt: plan.sentAt ? dateToISOString(plan.sentAt) : undefined,
        acceptance: plan.acceptance ? {name: plan.acceptance.name, at: dateToISOString(plan.acceptance.at), ...(plan.acceptance.channel ? {channel: plan.acceptance.channel} : {})} : undefined,
        paymentStatus: plan.paymentStatus ?? "unpaid",
        amountPaid: plan.amountPaid ?? 0,
        amountDue: amountDue(plan, decimals),
        timeline: (plan.timeline ?? []).map(({event, at, note}) => ({event, at: dateToISOString(at), note})),
        ...mapSoftDeleteToDTO(plan),
        ...mapOwnershipToDTO(plan),
        ...mapLifeCycleToDTO(plan),
    };
}

export function treatmentPlansToDTO(plans: ITreatmentPlan[]): TreatmentPlan[] {
    return plans.map(treatmentPlanToDTO);
}

/** A quote as the patient compares it; `currency` must be populated. */
export function treatmentPlanToPatient(plan: ITreatmentPlan, clinic: {_id: string; name: string}): PatientPlan {
    const currency = mapSnippet<CurrencySimple>()(plan.currency, CurrencySimpleSnippet);
    const decimals = decimalsOf(currency);
    return {
        _id: plan._id.toString(),
        number: plan.number,
        inquiry: String(nestedEntityToRef(plan.inquiry)),
        clinic,
        status: plan.status,
        optionLabel: plan.optionLabel,
        currency,
        phases: phasesToDTO(plan),
        lines: linesToDTO(plan, decimals).map(({service: _service, ...line}) => line),
        totals: totalsToDTO(plan),
        depositType: plan.depositType,
        depositValue: plan.depositValue,
        refundableUntilDays: plan.refundableUntilDays,
        validUntil: plan.validUntil,
        notes: plan.notes,
        terms: plan.terms,
        sentAt: plan.sentAt ? dateToISOString(plan.sentAt) : undefined,
        acceptedAt: plan.acceptance ? dateToISOString(plan.acceptance.at) : undefined,
        paymentStatus: plan.paymentStatus ?? "unpaid",
        amountPaid: plan.amountPaid ?? 0,
        depositDue: depositDue(plan, decimals),
    };
}
