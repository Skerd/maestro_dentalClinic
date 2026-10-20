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
import {
    SCHEDULE_EXCEPTION_NOTE_MAX,
    ScheduleExceptionSchemaDef,
} from "armonia/src/modules/dentalClinic/api/dentalClinic/private/scheduleException/scheduleException.schema-def";
import type {IPractitioner} from "../practitioner/practitioner";
import type {IClinicLocation} from "../clinicLocation/clinicLocation";
import {PractitionerSimpleSnippet} from "../practitioner/practitioner.snippets";
import {ClinicLocationSimpleSnippet} from "../clinicLocation/clinicLocation.snippets";
import {applyScheduleExceptionIndexes} from "./scheduleException.indexes";
import {scheduleExceptionViews} from "./scheduleException.views";

export interface IScheduleException extends Document, IOwnershipPluginFields, ISoftDeletePluginFields, ILifeCyclePluginFields {
    practitioner?: IPractitioner;
    location?: IClinicLocation;
    startAt: Date;
    endAt: Date;
    internalNote?: string;
}

const ScheduleExceptionSchema = new Schema<IScheduleException>(
    {
        practitioner: {
            type: SchemaTypes.ObjectId,
            ref: "Practitioner",
            refAllowlist: PractitionerSimpleSnippet,
            dynamicTableConfiguration: {refDisplayKey: ["displayName"]},
        },
        location: {
            type: SchemaTypes.ObjectId,
            ref: "ClinicLocation",
            refAllowlist: ClinicLocationSimpleSnippet,
            dynamicTableConfiguration: {refDisplayKey: ["name"]},
        },
        startAt: {type: SchemaTypes.Date, required: true, dynamicTableConfiguration: {cellType: COLUMN_TYPE.DATETIME}},
        endAt: {type: SchemaTypes.Date, required: true, dynamicTableConfiguration: {cellType: COLUMN_TYPE.DATETIME}},
        internalNote: {type: SchemaTypes.String, maxlength: SCHEDULE_EXCEPTION_NOTE_MAX},
    },
    {accessMode: "loose"},
);

ownershipPlugin(ScheduleExceptionSchema);
auditPlugin(ScheduleExceptionSchema);
softDeletePlugin(ScheduleExceptionSchema);
lifeCyclePlugin(ScheduleExceptionSchema);
applyScheduleExceptionIndexes(ScheduleExceptionSchema);
const ScheduleException = model<IScheduleException>("ScheduleException", ScheduleExceptionSchema);
normalizeSchemaPermissions(ScheduleException);
export default ScheduleException;

addModelData(ScheduleException, scheduleExceptionViews);
validateSchemaDefAgainstMongoose(ScheduleExceptionSchema, ScheduleExceptionSchemaDef, "ScheduleException");
