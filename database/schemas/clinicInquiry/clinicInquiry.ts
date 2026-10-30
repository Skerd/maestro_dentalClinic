import {Document, model, Schema, SchemaTypes, Types} from "mongoose";
import {ICountry} from "@coreModule/database/schemas/country/country";
import {ICurrency} from "@coreModule/database/schemas/currency/currency";
import {IMedia} from "@coreModule/database/schemas/media/media";
import {IUser} from "@coreModule/database/schemas/user/user";
import {normalizeSchemaPermissions} from "@coreModule/database/utilities";
import ownershipPlugin from "@coreModule/database/plugins/ownershipPlugin";
import auditPlugin from "@coreModule/database/plugins/auditPlugin";
import softDeletePlugin from "@coreModule/database/plugins/softDeletePlugin";
import lifeCyclePlugin from "@coreModule/database/plugins/lifeCyclePlugin";
import {ILifeCyclePluginFields, IOwnershipPluginFields, ISoftDeletePluginFields} from "@coreModule/database/types/plugin-fields";
import {addModelData} from "@coreModule/database/collections";
import {COLUMN_TYPE} from "armonia/src/modules/core/database/filter/typeOperators";
import {CountrySimpleSnippet} from "@coreModule/database/schemas/country/country.snippets";
import {CurrencySimpleSnippet} from "@coreModule/database/schemas/currency/currency.snippets";
import {MediaSimpleSnippet} from "@coreModule/database/schemas/media/media.snippets";
import {SimpleBlankUserSnippet} from "@coreModule/database/schemas/user/user.snippets";
import {
    INFO_REQUEST_KINDS,
    INQUIRY_DESCRIPTION_MAX,
    INQUIRY_REASON_MAX,
    INQUIRY_STATUSES,
    PATIENT_LANGUAGES,
    PATIENT_SOURCES,
    TREATMENT_CATEGORIES,
    type InfoRequestKind,
    type InquiryStatus,
    type PatientLanguage,
    type PatientSource,
    type TreatmentCategory,
} from "armonia/src/modules/dentalClinic/constants";
import {PATIENT_NAME_MAX, PATIENT_PHONE_MAX} from "armonia/src/modules/dentalClinic/api/dentalClinic/private/patient/patient.schema-def";
import {INQUIRY_TIMELINE_EVENTS, type InquiryTimelineEvent} from "armonia/src/modules/dentalClinic/api/dentalClinic/private/clinicInquiry/clinicInquiry.dto";
import type {IPatient} from "../patient/patient";
import {PatientSimpleSnippet} from "../patient/patient.snippets";
import {applyClinicInquiryIndexes} from "./clinicInquiry.indexes";
import {clinicInquiryViews} from "./clinicInquiry.views";
import {medicalHistoryField, type IMedicalHistory} from "../shared/medicalHistory";

/** Server-managed: written by intake, the lifecycle actions and the message thread only. */
const NoWritePermission = {self: {write: "no-permission"}, others: {write: "no-permission"}};

/** Nested copies show on the sheet; the list shows the inquiry itself. */
const hiddenNestedColumn = {hideColumn: true, filterable: false, sortable: false};

export type IInquiryContact = {
    firstName: string;
    lastName: string;
    email?: string;
    phone?: string;
    whatsapp?: string;
    country?: ICountry | Types.ObjectId;
    preferredLanguage: PatientLanguage;
};

export interface IClinicInquiry extends Document, IOwnershipPluginFields, ISoftDeletePluginFields, ILifeCyclePluginFields {
    number: string;
    /** Shared by the inquiries one portal request opened at several clinics. */
    requestGroup?: string;
    /** The patient's portal account. */
    account?: IUser;
    source: PatientSource;
    status: InquiryStatus;
    contact: IInquiryContact;
    /** Portal patients decide when the clinic sees their full name, email and phones. */
    contactShared: boolean;
    treatmentsWanted: TreatmentCategory[];
    description?: string;
    /** Local dates the patient could travel between. */
    travelFrom?: string;
    travelTo?: string;
    budget?: number;
    budgetCurrency?: ICurrency | Types.ObjectId;
    files: IMedia[];
    infoRequests: {kind: InfoRequestKind; note?: string; requestedAt: Date; requestedBy?: Types.ObjectId; fulfilledAt?: Date}[];
    medicalHistory?: IMedicalHistory;
    assignedTo?: IUser;
    /** The folder opened from this inquiry. */
    patient?: IPatient;
    consent?: {version: string; at: Date};
    /** First clinic action or message: the response time the portal shows. */
    firstResponseAt?: Date;
    lastMessageAt?: Date;
    unreadForClinic: number;
    unreadForPatient: number;
    /** When the unanswered-request alert went out, so it goes once. */
    slaAlertedAt?: Date;
    closedAt?: Date;
    closeReason?: string;
    idempotencyKey: string;
    /** Bumped on every inquiry of a request when the patient accepts a quote, so two acceptances cannot both commit. */
    acceptLock: number;
    timeline: {event: InquiryTimelineEvent; at: Date; by?: Types.ObjectId; note?: string}[];
}

const ClinicInquirySchema = new Schema<IClinicInquiry>(
    {
        number: {type: SchemaTypes.String, required: true, immutable: true, permissions: NoWritePermission},
        requestGroup: {type: SchemaTypes.String, immutable: true, permissions: NoWritePermission, dynamicTableConfiguration: {hideColumn: true}},
        account: {
            type: SchemaTypes.ObjectId,
            ref: "User",
            refAllowlist: SimpleBlankUserSnippet,
            immutable: true,
            permissions: NoWritePermission,
            dynamicTableConfiguration: {hideColumn: true, refDisplayKey: ["name", "surname"]},
        },
        source: {type: SchemaTypes.String, enum: PATIENT_SOURCES, required: true, immutable: true},
        status: {
            type: SchemaTypes.String,
            enum: INQUIRY_STATUSES,
            required: true,
            // Writable by permission only so roles can be granted the lifecycle actions (they gate on write:status).
            dynamicTableConfiguration: {
                enumTones: {
                    new: "warning",
                    in_review: "info",
                    info_requested: "info",
                    quoted: "info",
                    declined: "neutral",
                    lost: "neutral",
                    withdrawn: "neutral",
                    converted: "success",
                },
            },
        },
        contact: {
            type: {
                firstName: {type: SchemaTypes.String, required: true, trim: true, maxlength: PATIENT_NAME_MAX},
                lastName: {type: SchemaTypes.String, required: true, trim: true, maxlength: PATIENT_NAME_MAX, dynamicTableConfiguration: hiddenNestedColumn},
                email: {type: SchemaTypes.String, trim: true, lowercase: true, dynamicTableConfiguration: hiddenNestedColumn},
                phone: {type: SchemaTypes.String, trim: true, maxlength: PATIENT_PHONE_MAX, dynamicTableConfiguration: hiddenNestedColumn},
                whatsapp: {type: SchemaTypes.String, trim: true, maxlength: PATIENT_PHONE_MAX, dynamicTableConfiguration: hiddenNestedColumn},
                country: {
                    type: SchemaTypes.ObjectId,
                    ref: "Country",
                    refAllowlist: CountrySimpleSnippet,
                    dynamicTableConfiguration: {refDisplayKey: ["name"]},
                },
                preferredLanguage: {type: SchemaTypes.String, enum: PATIENT_LANGUAGES, required: true},
            },
            required: true,
            immutable: true,
            permissions: NoWritePermission,
        },
        contactShared: {type: SchemaTypes.Boolean, default: false, permissions: NoWritePermission},
        treatmentsWanted: {type: [{type: SchemaTypes.String, enum: TREATMENT_CATEGORIES}], default: [], immutable: true, permissions: NoWritePermission},
        description: {type: SchemaTypes.String, maxlength: INQUIRY_DESCRIPTION_MAX, immutable: true, permissions: NoWritePermission, dynamicTableConfiguration: {hideColumn: true, filterable: false}},
        travelFrom: {type: SchemaTypes.String, immutable: true, permissions: NoWritePermission, dynamicTableConfiguration: {hideColumn: true}},
        travelTo: {type: SchemaTypes.String, immutable: true, permissions: NoWritePermission, dynamicTableConfiguration: {hideColumn: true}},
        budget: {type: SchemaTypes.Number, min: 0, immutable: true, permissions: NoWritePermission, dynamicTableConfiguration: {hideColumn: true}},
        budgetCurrency: {
            type: SchemaTypes.ObjectId,
            ref: "Currency",
            refAllowlist: CurrencySimpleSnippet,
            immutable: true,
            permissions: NoWritePermission,
            dynamicTableConfiguration: {hideColumn: true, refDisplayKey: ["abbreviation"]},
        },
        files: {
            type: [{type: SchemaTypes.ObjectId, ref: "Media"}],
            default: [],
            refAllowlist: MediaSimpleSnippet,
            permissions: NoWritePermission,
            dynamicTableConfiguration: {sortable: false, filterable: false, hideColumn: true},
        },
        infoRequests: {
            type: [{
                _id: false,
                kind: {type: SchemaTypes.String, enum: INFO_REQUEST_KINDS, required: true, dynamicTableConfiguration: hiddenNestedColumn},
                note: {type: SchemaTypes.String, maxlength: INQUIRY_REASON_MAX, dynamicTableConfiguration: hiddenNestedColumn},
                requestedAt: {type: SchemaTypes.Date, required: true, dynamicTableConfiguration: hiddenNestedColumn},
                requestedBy: {type: SchemaTypes.ObjectId, ref: "User", dynamicTableConfiguration: hiddenNestedColumn},
                fulfilledAt: {type: SchemaTypes.Date, dynamicTableConfiguration: hiddenNestedColumn},
            }],
            default: [],
            permissions: NoWritePermission,
            dynamicTableConfiguration: {filterable: false, sortable: false, hideColumn: true},
        },
        medicalHistory: medicalHistoryField,
        assignedTo: {
            type: SchemaTypes.ObjectId,
            ref: "User",
            refAllowlist: SimpleBlankUserSnippet,
            dynamicTableConfiguration: {refDisplayKey: ["name", "surname"]},
        },
        patient: {
            type: SchemaTypes.ObjectId,
            ref: "Patient",
            refAllowlist: PatientSimpleSnippet,
            permissions: NoWritePermission,
            dynamicTableConfiguration: {hideColumn: true, refDisplayKey: ["firstName", "lastName"]},
        },
        consent: {
            type: {
                version: {type: SchemaTypes.String, required: true, dynamicTableConfiguration: hiddenNestedColumn},
                at: {type: SchemaTypes.Date, required: true, dynamicTableConfiguration: hiddenNestedColumn},
            },
            required: false,
            immutable: true,
            permissions: NoWritePermission,
            dynamicTableConfiguration: {filterable: false, sortable: false, hideColumn: true},
        },
        firstResponseAt: {type: SchemaTypes.Date, permissions: NoWritePermission, dynamicTableConfiguration: {hideColumn: true, cellType: COLUMN_TYPE.DATETIME}},
        lastMessageAt: {type: SchemaTypes.Date, permissions: NoWritePermission, dynamicTableConfiguration: {cellType: COLUMN_TYPE.DATETIME}},
        unreadForClinic: {type: SchemaTypes.Number, default: 0, permissions: NoWritePermission},
        unreadForPatient: {type: SchemaTypes.Number, default: 0, permissions: NoWritePermission, dynamicTableConfiguration: {hideColumn: true}},
        slaAlertedAt: {type: SchemaTypes.Date, permissions: NoWritePermission, dynamicTableConfiguration: {hideColumn: true}},
        closedAt: {type: SchemaTypes.Date, permissions: NoWritePermission, dynamicTableConfiguration: {hideColumn: true, cellType: COLUMN_TYPE.DATETIME}},
        closeReason: {type: SchemaTypes.String, maxlength: INQUIRY_REASON_MAX, permissions: NoWritePermission, dynamicTableConfiguration: {hideColumn: true}},
        idempotencyKey: {type: SchemaTypes.String, required: true, immutable: true, permissions: NoWritePermission, dynamicTableConfiguration: {hideColumn: true, filterable: false}},
        acceptLock: {type: SchemaTypes.Number, default: 0, permissions: NoWritePermission, dynamicTableConfiguration: {hideColumn: true, filterable: false}},
        timeline: {
            type: [{
                _id: false,
                event: {type: SchemaTypes.String, enum: INQUIRY_TIMELINE_EVENTS, required: true, dynamicTableConfiguration: hiddenNestedColumn},
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

ownershipPlugin(ClinicInquirySchema);
auditPlugin(ClinicInquirySchema);
softDeletePlugin(ClinicInquirySchema);
lifeCyclePlugin(ClinicInquirySchema);
applyClinicInquiryIndexes(ClinicInquirySchema);
const ClinicInquiry = model<IClinicInquiry>("ClinicInquiry", ClinicInquirySchema);
normalizeSchemaPermissions(ClinicInquiry);
export default ClinicInquiry;

addModelData(ClinicInquiry, clinicInquiryViews);
