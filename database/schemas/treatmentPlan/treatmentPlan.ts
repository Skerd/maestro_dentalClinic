import {Document, model, Schema, SchemaTypes, Types} from "mongoose";
import {ICurrency} from "@coreModule/database/schemas/currency/currency";
import {normalizeSchemaPermissions} from "@coreModule/database/utilities";
import ownershipPlugin from "@coreModule/database/plugins/ownershipPlugin";
import auditPlugin from "@coreModule/database/plugins/auditPlugin";
import softDeletePlugin from "@coreModule/database/plugins/softDeletePlugin";
import lifeCyclePlugin from "@coreModule/database/plugins/lifeCyclePlugin";
import {ILifeCyclePluginFields, IOwnershipPluginFields, ISoftDeletePluginFields} from "@coreModule/database/types/plugin-fields";
import {addModelData} from "@coreModule/database/collections";
import {COLUMN_TYPE} from "armonia/src/modules/core/database/filter/typeOperators";
import {CurrencySimpleSnippet} from "@coreModule/database/schemas/currency/currency.snippets";
import {validateSchemaDefAgainstMongoose} from "@coreModule/database/utilities/validateSchemaDefAgainstMongoose";
import {
    DEPOSIT_TYPES,
    TREATMENT_PLAN_LINE_KINDS,
    TREATMENT_PLAN_PAYMENT_STATUSES,
    TREATMENT_PLAN_STATUSES,
    TREATMENT_PLAN_TEXT_MAX,
    type DepositType,
    type TreatmentPlanLineKind,
    type TreatmentPlanPaymentStatus,
    type TreatmentPlanStatus,
} from "armonia/src/modules/dentalClinic/constants";
import {
    TREATMENT_PLAN_DAYS,
    TREATMENT_PLAN_GAP_DAYS,
    TREATMENT_PLAN_LABEL_MAX,
    TREATMENT_PLAN_LINE_DETAIL_MAX,
    TREATMENT_PLAN_LINE_NAME_MAX,
    TREATMENT_PLAN_PHASE_TITLE_MAX,
    TREATMENT_PLAN_QUANTITY,
    TREATMENT_PLAN_REFUNDABLE_DAYS,
    TREATMENT_PLAN_VISITS,
    TREATMENT_PLAN_WARRANTY_YEARS,
    TreatmentPlanSchemaDef,
} from "armonia/src/modules/dentalClinic/api/dentalClinic/private/treatmentPlan/treatmentPlan.schema-def";
import {TREATMENT_PLAN_TIMELINE_EVENTS, type TreatmentPlanTimelineEvent} from "armonia/src/modules/dentalClinic/api/dentalClinic/private/treatmentPlan/treatmentPlan.dto";
import type {IClinicInquiry} from "../clinicInquiry/clinicInquiry";
import type {IPatient} from "../patient/patient";
import type {IClinicService} from "../clinicService/clinicService";
import {PatientSimpleSnippet} from "../patient/patient.snippets";
import {ClinicServiceSimpleSnippet} from "../clinicService/clinicService.snippets";
import {ClinicInquirySimpleSnippet} from "../clinicInquiry/clinicInquiry.snippets";
import {TreatmentPlanSimpleSnippet} from "./treatmentPlan.snippets";
import {applyTreatmentPlanIndexes} from "./treatmentPlan.indexes";
import {treatmentPlanViews} from "./treatmentPlan.views";

/** Server-managed: set by the plan's actions and the patient's acceptance only. */
const NoWritePermission = {self: {write: "no-permission"}, others: {write: "no-permission"}};

/** Nested rows show on the sheet; the list shows the plan. */
const hiddenNestedColumn = {hideColumn: true, filterable: false, sortable: false};

export type ITreatmentPlanLine = {
    phase: number;
    kind: TreatmentPlanLineKind;
    service?: IClinicService | Types.ObjectId;
    name: string;
    teeth: string[];
    material?: string;
    brand?: string;
    quantity: number;
    unitPrice: number;
    discount?: number;
    warrantyYears?: number;
};

export interface ITreatmentPlan extends Document, IOwnershipPluginFields, ISoftDeletePluginFields, ILifeCyclePluginFields {
    number: string;
    status: TreatmentPlanStatus;
    inquiry?: IClinicInquiry | Types.ObjectId;
    patient?: IPatient | Types.ObjectId;
    optionLabel?: string;
    version: number;
    /** The sent quote this revision replaces once it is sent. */
    supersedes?: ITreatmentPlan | Types.ObjectId;
    currency: ICurrency | Types.ObjectId;
    phases: {title: string; visits: number; estimatedDays: number; minGapDaysAfterPrevious?: number}[];
    lines: ITreatmentPlanLine[];
    depositType: DepositType;
    depositValue?: number;
    refundableUntilDays?: number;
    /** Computed from the lines on every save. */
    totals: {subtotal: number; discount: number; total: number; deposit: number};
    validUntil?: string;
    notes?: string;
    terms?: string;
    sentAt?: Date;
    /** The patient's signature: their typed name, when, from where, and a hash of what they accepted. */
    acceptance?: {name: string; at: Date; ip?: string; userAgent?: string; contentHash: string};
    /** Follows from the payments; set by the payment service only. */
    paymentStatus: TreatmentPlanPaymentStatus;
    amountPaid: number;
    /** The open online deposit payment the webhook settles. */
    stripePaymentIntentId?: string;
    timeline: {event: TreatmentPlanTimelineEvent; at: Date; by?: Types.ObjectId; note?: string}[];
}

const TreatmentPlanSchema = new Schema<ITreatmentPlan>(
    {
        number: {type: SchemaTypes.String, required: true, immutable: true, permissions: NoWritePermission},
        status: {
            type: SchemaTypes.String,
            enum: TREATMENT_PLAN_STATUSES,
            required: true,
            // Changed only by the plan actions (each has its own action permission, D14).
            dynamicTableConfiguration: {
                enumTones: {draft: "neutral", sent: "info", accepted: "success", rejected: "neutral", expired: "warning", superseded: "neutral"},
            },
        },
        inquiry: {
            type: SchemaTypes.ObjectId,
            ref: "ClinicInquiry",
            refAllowlist: ClinicInquirySimpleSnippet,
            immutable: true,
            dynamicTableConfiguration: {refDisplayKey: ["number"]},
        },
        patient: {
            type: SchemaTypes.ObjectId,
            ref: "Patient",
            refAllowlist: PatientSimpleSnippet,
            dynamicTableConfiguration: {refDisplayKey: ["firstName", "lastName"]},
        },
        optionLabel: {type: SchemaTypes.String, trim: true, maxlength: TREATMENT_PLAN_LABEL_MAX},
        version: {type: SchemaTypes.Number, default: 1, permissions: NoWritePermission, dynamicTableConfiguration: {hideColumn: true}},
        supersedes: {
            type: SchemaTypes.ObjectId,
            ref: "TreatmentPlan",
            refAllowlist: TreatmentPlanSimpleSnippet,
            immutable: true,
            permissions: NoWritePermission,
            dynamicTableConfiguration: {hideColumn: true, refDisplayKey: ["number"]},
        },
        currency: {
            type: SchemaTypes.ObjectId,
            ref: "Currency",
            required: true,
            immutable: true,
            refAllowlist: CurrencySimpleSnippet,
            permissions: NoWritePermission,
            dynamicTableConfiguration: {refDisplayKey: ["abbreviation"]},
        },
        phases: {
            type: [{
                _id: false,
                title: {type: SchemaTypes.String, required: true, trim: true, maxlength: TREATMENT_PLAN_PHASE_TITLE_MAX, dynamicTableConfiguration: hiddenNestedColumn},
                visits: {type: SchemaTypes.Number, required: true, ...TREATMENT_PLAN_VISITS, dynamicTableConfiguration: hiddenNestedColumn},
                estimatedDays: {type: SchemaTypes.Number, required: true, ...TREATMENT_PLAN_DAYS, dynamicTableConfiguration: hiddenNestedColumn},
                minGapDaysAfterPrevious: {type: SchemaTypes.Number, ...TREATMENT_PLAN_GAP_DAYS, dynamicTableConfiguration: hiddenNestedColumn},
            }],
            default: [],
            dynamicTableConfiguration: {filterable: false, sortable: false, hideColumn: true},
        },
        lines: {
            type: [{
                _id: false,
                phase: {type: SchemaTypes.Number, required: true, min: 1, dynamicTableConfiguration: hiddenNestedColumn},
                kind: {type: SchemaTypes.String, enum: TREATMENT_PLAN_LINE_KINDS, required: true, dynamicTableConfiguration: hiddenNestedColumn},
                service: {type: SchemaTypes.ObjectId, ref: "ClinicService", refAllowlist: ClinicServiceSimpleSnippet, dynamicTableConfiguration: hiddenNestedColumn},
                name: {type: SchemaTypes.String, required: true, trim: true, maxlength: TREATMENT_PLAN_LINE_NAME_MAX, dynamicTableConfiguration: hiddenNestedColumn},
                teeth: {type: [SchemaTypes.String], default: [], dynamicTableConfiguration: hiddenNestedColumn},
                material: {type: SchemaTypes.String, trim: true, maxlength: TREATMENT_PLAN_LINE_DETAIL_MAX, dynamicTableConfiguration: hiddenNestedColumn},
                brand: {type: SchemaTypes.String, trim: true, maxlength: TREATMENT_PLAN_LINE_DETAIL_MAX, dynamicTableConfiguration: hiddenNestedColumn},
                quantity: {type: SchemaTypes.Number, required: true, ...TREATMENT_PLAN_QUANTITY, dynamicTableConfiguration: hiddenNestedColumn},
                unitPrice: {type: SchemaTypes.Number, required: true, min: 0, dynamicTableConfiguration: hiddenNestedColumn},
                discount: {type: SchemaTypes.Number, min: 0, dynamicTableConfiguration: hiddenNestedColumn},
                warrantyYears: {type: SchemaTypes.Number, ...TREATMENT_PLAN_WARRANTY_YEARS, dynamicTableConfiguration: hiddenNestedColumn},
            }],
            default: [],
            dynamicTableConfiguration: {filterable: false, sortable: false, hideColumn: true},
        },
        depositType: {type: SchemaTypes.String, enum: DEPOSIT_TYPES, required: true, default: "none"},
        depositValue: {type: SchemaTypes.Number, min: 0, dynamicTableConfiguration: {hideColumn: true}},
        refundableUntilDays: {type: SchemaTypes.Number, ...TREATMENT_PLAN_REFUNDABLE_DAYS, dynamicTableConfiguration: {hideColumn: true}},
        totals: {
            type: {
                subtotal: {type: SchemaTypes.Number, required: true, dynamicTableConfiguration: hiddenNestedColumn},
                discount: {type: SchemaTypes.Number, required: true, dynamicTableConfiguration: hiddenNestedColumn},
                total: {type: SchemaTypes.Number, required: true},
                deposit: {type: SchemaTypes.Number, required: true, dynamicTableConfiguration: hiddenNestedColumn},
            },
            required: true,
            permissions: NoWritePermission,
        },
        validUntil: {type: SchemaTypes.String},
        notes: {type: SchemaTypes.String, maxlength: TREATMENT_PLAN_TEXT_MAX, dynamicTableConfiguration: {hideColumn: true, filterable: false}},
        terms: {type: SchemaTypes.String, maxlength: TREATMENT_PLAN_TEXT_MAX, dynamicTableConfiguration: {hideColumn: true, filterable: false}},
        sentAt: {type: SchemaTypes.Date, permissions: NoWritePermission, dynamicTableConfiguration: {cellType: COLUMN_TYPE.DATETIME}},
        acceptance: {
            type: {
                name: {type: SchemaTypes.String, required: true, dynamicTableConfiguration: hiddenNestedColumn},
                at: {type: SchemaTypes.Date, required: true, dynamicTableConfiguration: hiddenNestedColumn},
                ip: {type: SchemaTypes.String, dynamicTableConfiguration: hiddenNestedColumn},
                userAgent: {type: SchemaTypes.String, dynamicTableConfiguration: hiddenNestedColumn},
                contentHash: {type: SchemaTypes.String, required: true, dynamicTableConfiguration: hiddenNestedColumn},
            },
            required: false,
            permissions: NoWritePermission,
            dynamicTableConfiguration: {filterable: false, sortable: false, hideColumn: true},
        },
        paymentStatus: {
            type: SchemaTypes.String,
            enum: TREATMENT_PLAN_PAYMENT_STATUSES,
            required: true,
            default: "unpaid",
            permissions: NoWritePermission,
            dynamicTableConfiguration: {
                enumTones: {
                    unpaid: "neutral", pending: "info", failed: "danger", deposit_paid: "info", paid: "success", partially_refunded: "warning", refunded: "neutral",
                },
            },
        },
        // Changed only by the payment and refund actions (D14 action permissions).
        amountPaid: {type: SchemaTypes.Number, default: 0},
        stripePaymentIntentId: {type: SchemaTypes.String, permissions: NoWritePermission, dynamicTableConfiguration: {hideColumn: true}},
        timeline: {
            type: [{
                _id: false,
                event: {type: SchemaTypes.String, enum: TREATMENT_PLAN_TIMELINE_EVENTS, required: true, dynamicTableConfiguration: hiddenNestedColumn},
                at: {type: SchemaTypes.Date, required: true, dynamicTableConfiguration: hiddenNestedColumn},
                by: {type: SchemaTypes.ObjectId, ref: "User", dynamicTableConfiguration: hiddenNestedColumn},
                note: {type: SchemaTypes.String, dynamicTableConfiguration: hiddenNestedColumn},
            }],
            default: [],
            permissions: NoWritePermission,
            dynamicTableConfiguration: {filterable: false, sortable: false, hideColumn: true},
        },
    },
    {accessMode: "loose"},
);

ownershipPlugin(TreatmentPlanSchema);
auditPlugin(TreatmentPlanSchema);
softDeletePlugin(TreatmentPlanSchema);
lifeCyclePlugin(TreatmentPlanSchema);
applyTreatmentPlanIndexes(TreatmentPlanSchema);
const TreatmentPlan = model<ITreatmentPlan>("TreatmentPlan", TreatmentPlanSchema);
normalizeSchemaPermissions(TreatmentPlan);
export default TreatmentPlan;

addModelData(TreatmentPlan, treatmentPlanViews);
// Status, totals and payment status are set by the server (actions, the lines, the payments), never by the form.
validateSchemaDefAgainstMongoose(TreatmentPlanSchema, TreatmentPlanSchemaDef, "TreatmentPlan", ["status", "totals", "paymentStatus"]);
