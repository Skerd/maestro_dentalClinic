import {Document, model, Schema, SchemaTypes} from "mongoose";
import {normalizeSchemaPermissions} from "@coreModule/database/utilities";
import ownershipPlugin from "@coreModule/database/plugins/ownershipPlugin";
import auditPlugin from "@coreModule/database/plugins/auditPlugin";
import softDeletePlugin from "@coreModule/database/plugins/softDeletePlugin";
import lifeCyclePlugin from "@coreModule/database/plugins/lifeCyclePlugin";
import {ILifeCyclePluginFields, IOwnershipPluginFields, ISoftDeletePluginFields} from "@coreModule/database/types/plugin-fields";
import {addModelData} from "@coreModule/database/collections";
import {validateSchemaDefAgainstMongoose} from "@coreModule/database/utilities/validateSchemaDefAgainstMongoose";
import {COLUMN_TYPE} from "armonia/src/modules/core/database/filter/typeOperators";
import {PATIENT_TRIP_STATUSES, type PatientTripStatus} from "armonia/src/modules/dentalClinic/constants";
import {
    PATIENT_TRIP_ACCOMMODATION_MAX,
    PATIENT_TRIP_COMPANIONS,
    PATIENT_TRIP_FLIGHT_MAX,
    PATIENT_TRIP_NOTES_MAX,
    PATIENT_TRIP_PHASE,
    PatientTripSchemaDef,
} from "armonia/src/modules/dentalClinic/api/dentalClinic/private/patientTrip/patientTrip.schema-def";
import type {IPatient} from "../patient/patient";
import type {ITreatmentPlan} from "../treatmentPlan/treatmentPlan";
import {PatientSimpleSnippet} from "../patient/patient.snippets";
import {TreatmentPlanSimpleSnippet} from "../treatmentPlan/treatmentPlan.snippets";
import {applyPatientTripIndexes} from "./patientTrip.indexes";
import {patientTripViews} from "./patientTrip.views";

export interface IPatientTrip extends Document, IOwnershipPluginFields, ISoftDeletePluginFields, ILifeCyclePluginFields {
    patient: IPatient;
    plan?: ITreatmentPlan;
    phase?: number;
    status: PatientTripStatus;
    arrivalAt: Date;
    departureAt: Date;
    arrivalFlight?: string;
    departureFlight?: string;
    accommodation?: string;
    transfer?: boolean;
    companions?: number;
    notes?: string;
}

const PatientTripSchema = new Schema<IPatientTrip>(
    {
        patient: {
            type: SchemaTypes.ObjectId,
            ref: "Patient",
            required: true,
            refAllowlist: PatientSimpleSnippet,
            dynamicTableConfiguration: {refDisplayKey: ["firstName", "lastName"]},
        },
        plan: {
            type: SchemaTypes.ObjectId,
            ref: "TreatmentPlan",
            refAllowlist: TreatmentPlanSimpleSnippet,
            dynamicTableConfiguration: {refDisplayKey: ["number"]},
        },
        phase: {type: SchemaTypes.Number, ...PATIENT_TRIP_PHASE},
        status: {
            type: SchemaTypes.String,
            enum: PATIENT_TRIP_STATUSES,
            required: true,
            default: "planned",
            dynamicTableConfiguration: {enumTones: {planned: "info", confirmed: "success", completed: "neutral", cancelled: "neutral"}},
        },
        arrivalAt: {type: SchemaTypes.Date, required: true, dynamicTableConfiguration: {cellType: COLUMN_TYPE.DATETIME}},
        departureAt: {type: SchemaTypes.Date, required: true, dynamicTableConfiguration: {cellType: COLUMN_TYPE.DATETIME}},
        arrivalFlight: {type: SchemaTypes.String, trim: true, maxlength: PATIENT_TRIP_FLIGHT_MAX},
        departureFlight: {type: SchemaTypes.String, trim: true, maxlength: PATIENT_TRIP_FLIGHT_MAX, dynamicTableConfiguration: {hideColumn: true}},
        accommodation: {type: SchemaTypes.String, trim: true, maxlength: PATIENT_TRIP_ACCOMMODATION_MAX},
        transfer: {type: SchemaTypes.Boolean, default: false},
        companions: {type: SchemaTypes.Number, ...PATIENT_TRIP_COMPANIONS, dynamicTableConfiguration: {hideColumn: true}},
        notes: {type: SchemaTypes.String, maxlength: PATIENT_TRIP_NOTES_MAX, dynamicTableConfiguration: {hideColumn: true, filterable: false}},
    },
    {accessMode: "loose"},
);

ownershipPlugin(PatientTripSchema);
auditPlugin(PatientTripSchema);
softDeletePlugin(PatientTripSchema);
lifeCyclePlugin(PatientTripSchema);
applyPatientTripIndexes(PatientTripSchema);
const PatientTrip = model<IPatientTrip>("PatientTrip", PatientTripSchema);
normalizeSchemaPermissions(PatientTrip);
export default PatientTrip;

addModelData(PatientTrip, patientTripViews);
validateSchemaDefAgainstMongoose(PatientTripSchema, PatientTripSchemaDef, "PatientTrip");
