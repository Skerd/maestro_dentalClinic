import {Document, model, Schema, SchemaTypes} from "mongoose";
import {normalizeSchemaPermissions} from "@coreModule/database/utilities";
import ownershipPlugin from "@coreModule/database/plugins/ownershipPlugin";
import auditPlugin from "@coreModule/database/plugins/auditPlugin";
import softDeletePlugin from "@coreModule/database/plugins/softDeletePlugin";
import lifeCyclePlugin from "@coreModule/database/plugins/lifeCyclePlugin";
import {ILifeCyclePluginFields, IOwnershipPluginFields, ISoftDeletePluginFields} from "@coreModule/database/types/plugin-fields";
import {addModelData} from "@coreModule/database/collections";
import {validateSchemaDefAgainstMongoose} from "@coreModule/database/utilities/validateSchemaDefAgainstMongoose";
import {
    CLINIC_REVIEW_AUTHOR_NAME_MAX,
    CLINIC_REVIEW_COMMENT_MAX,
    CLINIC_REVIEW_RATING,
    ClinicReviewSchemaDef,
} from "armonia/src/modules/dentalClinic/api/dentalClinic/private/clinicReview/clinicReview.schema-def";
import type {IAppointment} from "../appointment/appointment";
import {AppointmentSimpleSnippet} from "../appointment/appointment.snippets";
import {applyClinicReviewIndexes} from "./clinicReview.indexes";
import {clinicReviewViews} from "./clinicReview.views";

/** A patient's review of a completed appointment (D178). Nothing about their health is kept here (SEC-06). */
export interface IClinicReview extends Document, IOwnershipPluginFields, ISoftDeletePluginFields, ILifeCyclePluginFields {
    authorName: string;
    rating: number;
    comment?: string;
    appointment: IAppointment;
    isPublished: boolean;
}

const ClinicReviewSchema = new Schema<IClinicReview>(
    {
        authorName: {type: SchemaTypes.String, required: true, trim: true, minlength: 1, maxlength: CLINIC_REVIEW_AUTHOR_NAME_MAX},
        rating: {type: SchemaTypes.Number, required: true, ...CLINIC_REVIEW_RATING},
        comment: {type: SchemaTypes.String, trim: true, maxlength: CLINIC_REVIEW_COMMENT_MAX, dynamicTableConfiguration: {hideColumn: true}},
        // Fixed once written: the edit route drops it.
        appointment: {type: SchemaTypes.ObjectId, ref: "Appointment", required: true, refAllowlist: AppointmentSimpleSnippet, dynamicTableConfiguration: {refDisplayKey: ["number"]}},
        isPublished: {type: SchemaTypes.Boolean, default: false},
    },
    {accessMode: "loose"},
);

ownershipPlugin(ClinicReviewSchema);
auditPlugin(ClinicReviewSchema);
softDeletePlugin(ClinicReviewSchema);
lifeCyclePlugin(ClinicReviewSchema);
applyClinicReviewIndexes(ClinicReviewSchema);
const ClinicReview = model<IClinicReview>("ClinicReview", ClinicReviewSchema);
normalizeSchemaPermissions(ClinicReview);
export default ClinicReview;

addModelData(ClinicReview, clinicReviewViews);
validateSchemaDefAgainstMongoose(ClinicReviewSchema, ClinicReviewSchemaDef, "ClinicReview");
