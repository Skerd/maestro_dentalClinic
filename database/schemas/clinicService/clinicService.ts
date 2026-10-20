import {Document, model, Schema, SchemaTypes} from "mongoose";
import {IMedia} from "@coreModule/database/schemas/media/media";
import {normalizeSchemaPermissions} from "@coreModule/database/utilities";
import ownershipPlugin from "@coreModule/database/plugins/ownershipPlugin";
import auditPlugin from "@coreModule/database/plugins/auditPlugin";
import softDeletePlugin from "@coreModule/database/plugins/softDeletePlugin";
import lifeCyclePlugin from "@coreModule/database/plugins/lifeCyclePlugin";
import {ILifeCyclePluginFields, IOwnershipPluginFields, ISoftDeletePluginFields} from "@coreModule/database/types/plugin-fields";
import {addModelData} from "@coreModule/database/collections";
import {validateSchemaDefAgainstMongoose} from "@coreModule/database/utilities/validateSchemaDefAgainstMongoose";
import publicMediaPlugin from "@coreModule/database/plugins/publicMediaPlugin";
import {MediaSimpleSnippet} from "@coreModule/database/schemas/media/media.snippets";
import {
    CLINIC_SERVICE_BUFFER_MINUTES,
    CLINIC_SERVICE_DESCRIPTION_MAX,
    CLINIC_SERVICE_DURATION_MINUTES,
    CLINIC_SERVICE_NAME_MAX,
    CLINIC_SERVICE_PRICE_TYPES,
    CLINIC_SERVICE_SLUG_MAX,
    ClinicServiceSchemaDef,
    type ClinicServicePriceType,
} from "armonia/src/modules/dentalClinic/api/dentalClinic/private/clinicService/clinicService.schema-def";
import {applyClinicServiceIndexes} from "./clinicService.indexes";
import {clinicServiceViews} from "./clinicService.views";

export interface IClinicService extends Document, IOwnershipPluginFields, ISoftDeletePluginFields, ILifeCyclePluginFields {
    name: string;
    slug: string;
    description?: string;
    images: IMedia[];
    durationMinutes: number;
    bufferBeforeMinutes: number;
    bufferAfterMinutes: number;
    priceType: ClinicServicePriceType;
    price?: number;
    onlineBookable: boolean;
    isPublic: boolean;
    isActive: boolean;
    sortOrder: number;
}

const ClinicServiceSchema = new Schema<IClinicService>(
    {
        name: {type: SchemaTypes.String, required: true, trim: true, minlength: 1, maxlength: CLINIC_SERVICE_NAME_MAX},
        slug: {type: SchemaTypes.String, required: true, trim: true, lowercase: true, minlength: 1, maxlength: CLINIC_SERVICE_SLUG_MAX},
        description: {type: SchemaTypes.String, maxlength: CLINIC_SERVICE_DESCRIPTION_MAX, dynamicTableConfiguration: {hideColumn: true}},
        images: {
            type: [{type: SchemaTypes.ObjectId, ref: "Media"}],
            default: [],
            refAllowlist: MediaSimpleSnippet,
            dynamicTableConfiguration: {sortable: false, filterable: false, hideColumn: true},
        },
        durationMinutes: {type: SchemaTypes.Number, required: true, ...CLINIC_SERVICE_DURATION_MINUTES},
        bufferBeforeMinutes: {type: SchemaTypes.Number, default: 0, ...CLINIC_SERVICE_BUFFER_MINUTES},
        bufferAfterMinutes: {type: SchemaTypes.Number, default: 0, ...CLINIC_SERVICE_BUFFER_MINUTES},
        priceType: {
            type: SchemaTypes.String,
            enum: CLINIC_SERVICE_PRICE_TYPES,
            required: true,
            default: "on_request",
            dynamicTableConfiguration: {enumTones: {fixed: "info", from: "info", on_request: "neutral", free: "success"}},
        },
        price: {type: SchemaTypes.Number, min: 0},
        onlineBookable: {type: SchemaTypes.Boolean, default: true},
        isPublic: {type: SchemaTypes.Boolean, default: true},
        isActive: {type: SchemaTypes.Boolean, default: true},
        sortOrder: {type: SchemaTypes.Number, default: 0},
    },
    {accessMode: "loose"},
);

ownershipPlugin(ClinicServiceSchema);
publicMediaPlugin(ClinicServiceSchema, {schemaDef: ClinicServiceSchemaDef});
auditPlugin(ClinicServiceSchema);
softDeletePlugin(ClinicServiceSchema);
lifeCyclePlugin(ClinicServiceSchema);
applyClinicServiceIndexes(ClinicServiceSchema);
const ClinicService = model<IClinicService>("ClinicService", ClinicServiceSchema);
normalizeSchemaPermissions(ClinicService);
export default ClinicService;

addModelData(ClinicService, clinicServiceViews);
validateSchemaDefAgainstMongoose(ClinicServiceSchema, ClinicServiceSchemaDef, "ClinicService");
