import {Document, model, Schema, SchemaTypes, Types} from "mongoose";
import {ICountry} from "@coreModule/database/schemas/country/country";
import {IUser} from "@coreModule/database/schemas/user/user";
import {normalizeSchemaPermissions} from "@coreModule/database/utilities";
import ownershipPlugin from "@coreModule/database/plugins/ownershipPlugin";
import auditPlugin from "@coreModule/database/plugins/auditPlugin";
import softDeletePlugin from "@coreModule/database/plugins/softDeletePlugin";
import lifeCyclePlugin from "@coreModule/database/plugins/lifeCyclePlugin";
import {ILifeCyclePluginFields, IOwnershipPluginFields, ISoftDeletePluginFields} from "@coreModule/database/types/plugin-fields";
import {addModelData} from "@coreModule/database/collections";
import {CountrySimpleSnippet} from "@coreModule/database/schemas/country/country.snippets";
import {SimpleBlankUserSnippet} from "@coreModule/database/schemas/user/user.snippets";
import {validateSchemaDefAgainstMongoose} from "@coreModule/database/utilities/validateSchemaDefAgainstMongoose";
import {PATIENT_LANGUAGES, PATIENT_SOURCES, type PatientLanguage, type PatientSource} from "armonia/src/modules/dentalClinic/constants";
import {
    PATIENT_CITY_MAX,
    PATIENT_NAME_MAX,
    PATIENT_NOTES_MAX,
    PATIENT_PHONE_MAX,
    PATIENT_POSTAL_CODE_MAX,
    PATIENT_PRACTICE_MAX,
    PATIENT_RELATION_MAX,
    PATIENT_SEXES,
    PATIENT_STREET_MAX,
    PatientSchemaDef,
    type PatientSex,
} from "armonia/src/modules/dentalClinic/api/dentalClinic/private/patient/patient.schema-def";
import {applyPatientIndexes} from "./patient.indexes";
import {patientViews} from "./patient.views";
import {medicalHistoryField, type IMedicalHistory} from "../shared/medicalHistory";

/** Server-managed: set when the folder is opened, never through the form. */
const NoWritePermission = {self: {write: "no-permission"}, others: {write: "no-permission"}};

/** Nested parts show on the sheet; the list shows the patient. */
const hiddenNestedColumn = {hideColumn: true, filterable: false, sortable: false};

export interface IPatient extends Document, IOwnershipPluginFields, ISoftDeletePluginFields, ILifeCyclePluginFields {
    number: string;
    firstName: string;
    lastName: string;
    dateOfBirth?: Date;
    sex?: PatientSex;
    email?: string;
    phone?: string;
    whatsapp?: string;
    preferredLanguage: PatientLanguage;
    address?: {country?: ICountry | Types.ObjectId; city?: string; street?: string; postalCode?: string};
    emergencyContact?: {name?: string; phone?: string; relation?: string};
    homeDentist?: {name?: string; practice?: string; email?: string; phone?: string};
    source: PatientSource;
    tags: string[];
    notes?: string;
    /** The patient's own portal (or clinic-site) account. One folder per account per clinic. */
    account?: IUser;
    medicalHistory?: IMedicalHistory;
}

const PatientSchema = new Schema<IPatient>(
    {
        number: {type: SchemaTypes.String, required: true, immutable: true, permissions: NoWritePermission},
        firstName: {type: SchemaTypes.String, required: true, trim: true, minlength: 1, maxlength: PATIENT_NAME_MAX},
        lastName: {type: SchemaTypes.String, required: true, trim: true, minlength: 1, maxlength: PATIENT_NAME_MAX},
        dateOfBirth: {type: SchemaTypes.Date, dynamicTableConfiguration: {visible: false}},
        sex: {type: SchemaTypes.String, enum: PATIENT_SEXES, dynamicTableConfiguration: {visible: false}},
        email: {type: SchemaTypes.String, trim: true, lowercase: true},
        phone: {type: SchemaTypes.String, trim: true, maxlength: PATIENT_PHONE_MAX},
        whatsapp: {type: SchemaTypes.String, trim: true, maxlength: PATIENT_PHONE_MAX, dynamicTableConfiguration: {hideColumn: true}},
        preferredLanguage: {type: SchemaTypes.String, enum: PATIENT_LANGUAGES, required: true, default: "en-US"},
        address: {
            type: {
                country: {
                    type: SchemaTypes.ObjectId,
                    ref: "Country",
                    refAllowlist: CountrySimpleSnippet,
                    dynamicTableConfiguration: {refDisplayKey: ["name"]},
                },
                city: {type: SchemaTypes.String, trim: true, maxlength: PATIENT_CITY_MAX, dynamicTableConfiguration: hiddenNestedColumn},
                street: {type: SchemaTypes.String, trim: true, maxlength: PATIENT_STREET_MAX, dynamicTableConfiguration: hiddenNestedColumn},
                postalCode: {type: SchemaTypes.String, trim: true, maxlength: PATIENT_POSTAL_CODE_MAX, dynamicTableConfiguration: hiddenNestedColumn},
            },
            required: false,
        },
        emergencyContact: {
            type: {
                name: {type: SchemaTypes.String, trim: true, maxlength: PATIENT_NAME_MAX, dynamicTableConfiguration: hiddenNestedColumn},
                phone: {type: SchemaTypes.String, trim: true, maxlength: PATIENT_PHONE_MAX, dynamicTableConfiguration: hiddenNestedColumn},
                relation: {type: SchemaTypes.String, trim: true, maxlength: PATIENT_RELATION_MAX, dynamicTableConfiguration: hiddenNestedColumn},
            },
            required: false,
            dynamicTableConfiguration: {filterable: false, sortable: false, hideColumn: true},
        },
        homeDentist: {
            type: {
                name: {type: SchemaTypes.String, trim: true, maxlength: PATIENT_NAME_MAX, dynamicTableConfiguration: hiddenNestedColumn},
                practice: {type: SchemaTypes.String, trim: true, maxlength: PATIENT_PRACTICE_MAX, dynamicTableConfiguration: hiddenNestedColumn},
                email: {type: SchemaTypes.String, trim: true, lowercase: true, dynamicTableConfiguration: hiddenNestedColumn},
                phone: {type: SchemaTypes.String, trim: true, maxlength: PATIENT_PHONE_MAX, dynamicTableConfiguration: hiddenNestedColumn},
            },
            required: false,
            dynamicTableConfiguration: {filterable: false, sortable: false, hideColumn: true},
        },
        source: {
            type: SchemaTypes.String,
            enum: PATIENT_SOURCES,
            required: true,
            default: "other",
        },
        tags: {type: [SchemaTypes.String], default: []},
        notes: {type: SchemaTypes.String, maxlength: PATIENT_NOTES_MAX, dynamicTableConfiguration: {hideColumn: true, filterable: false}},
        account: {
            type: SchemaTypes.ObjectId,
            ref: "User",
            refAllowlist: SimpleBlankUserSnippet,
            permissions: NoWritePermission,
            dynamicTableConfiguration: {hideColumn: true, refDisplayKey: ["name", "surname"]},
        },
        medicalHistory: medicalHistoryField,
    },
    {accessMode: "loose"},
);

ownershipPlugin(PatientSchema);
auditPlugin(PatientSchema);
softDeletePlugin(PatientSchema);
lifeCyclePlugin(PatientSchema);
applyPatientIndexes(PatientSchema);
const Patient = model<IPatient>("Patient", PatientSchema);
normalizeSchemaPermissions(Patient);
export default Patient;

addModelData(Patient, patientViews);
validateSchemaDefAgainstMongoose(PatientSchema, PatientSchemaDef, "Patient");
