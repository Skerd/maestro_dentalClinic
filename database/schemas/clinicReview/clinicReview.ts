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

/**
 * A review is the patient's own words, written from their appointment email's link: staff publish or hide it, but never
 * write or change it, so the stars on the portal stay the patients'.
 */
const PatientWrittenOnly = {self: {write: "no-permission"}, others: {write: "no-permission"}};

const ClinicReviewSchema = new Schema<IClinicReview>(
    {
        authorName: {type: SchemaTypes.String, required: true, trim: true, minlength: 1, maxlength: CLINIC_REVIEW_AUTHOR_NAME_MAX, permissions: PatientWrittenOnly},
        rating: {type: SchemaTypes.Number, required: true, ...CLINIC_REVIEW_RATING, permissions: PatientWrittenOnly},
        comment: {type: SchemaTypes.String, trim: true, maxlength: CLINIC_REVIEW_COMMENT_MAX, permissions: PatientWrittenOnly, dynamicTableConfiguration: {hideColumn: true}},
        appointment: {type: SchemaTypes.ObjectId, ref: "Appointment", required: true, refAllowlist: AppointmentSimpleSnippet, permissions: PatientWrittenOnly, dynamicTableConfiguration: {refDisplayKey: ["number"]}},
        isPublished: {type: SchemaTypes.Boolean, default: false},
    },
    {
        accessMode: "loose",
        // Only the patient's link route creates a review (`clinicStorefront` `/manage/review`).
        permissions: {
            self: {create: "no-permission"},
            others: {create: "no-permission"},
        },
    },
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
