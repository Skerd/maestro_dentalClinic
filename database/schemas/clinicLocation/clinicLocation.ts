import {Document, model, Schema, SchemaTypes} from "mongoose";
import {ICountry} from "@coreModule/database/schemas/country/country";
import {ICity} from "@coreModule/database/schemas/city/city";
import {normalizeSchemaPermissions} from "@coreModule/database/utilities";
import ownershipPlugin from "@coreModule/database/plugins/ownershipPlugin";
import auditPlugin from "@coreModule/database/plugins/auditPlugin";
import softDeletePlugin from "@coreModule/database/plugins/softDeletePlugin";
import lifeCyclePlugin from "@coreModule/database/plugins/lifeCyclePlugin";
import {ILifeCyclePluginFields, IOwnershipPluginFields, ISoftDeletePluginFields} from "@coreModule/database/types/plugin-fields";
import {addModelData} from "@coreModule/database/collections";
import {validateSchemaDefAgainstMongoose} from "@coreModule/database/utilities/validateSchemaDefAgainstMongoose";
import {CountrySimpleSnippet} from "@coreModule/database/schemas/country/country.snippets";
import {CitySimpleSnippet} from "@coreModule/database/schemas/city/city.snippets";
import {COLUMN_TYPE} from "armonia/src/modules/core/database/filter/typeOperators";
import type {WeeklyHoursSlot} from "armonia/src/modules/core/helpers/weeklyHours.schema-def";
import {
    CLINIC_LOCATION_CLOSURE_REASON_MAX,
    CLINIC_LOCATION_NAME_MAX,
    CLINIC_LOCATION_PHONE_MAX,
    CLINIC_LOCATION_POSTAL_CODE_MAX,
    CLINIC_LOCATION_STREET_MAX,
    CLINIC_LOCATION_TIMEZONE_MAX,
    ClinicLocationSchemaDef,
} from "armonia/src/modules/dentalClinic/api/dentalClinic/private/clinicLocation/clinicLocation.schema-def";
import {applyClinicLocationIndexes} from "./clinicLocation.indexes";
import {clinicLocationViews} from "./clinicLocation.views";

export interface IClinicLocationAddress {
    country?: ICountry;
    city?: ICity;
    street?: string;
    postalCode?: string;
    latitude?: number;
    longitude?: number;
}

export interface IClinicLocation extends Document, IOwnershipPluginFields, ISoftDeletePluginFields, ILifeCyclePluginFields {
    name: string;
    phone?: string;
    email?: string;
    address?: IClinicLocationAddress;
    timezone: string;
    openingHours: WeeklyHoursSlot[];
    closures: {date: string; reason?: string}[];
    isActive: boolean;
}

const ClinicLocationSchema = new Schema<IClinicLocation>(
    {
        name: {type: SchemaTypes.String, required: true, trim: true, minlength: 1, maxlength: CLINIC_LOCATION_NAME_MAX},
        phone: {type: SchemaTypes.String, trim: true, maxlength: CLINIC_LOCATION_PHONE_MAX},
        email: {type: SchemaTypes.String, trim: true, lowercase: true},
        address: {
            type: {
                country: {type: SchemaTypes.ObjectId, ref: "Country", refAllowlist: CountrySimpleSnippet, dynamicTableConfiguration: {hideColumn: true, filterable: false, sortable: false}},
                city: {type: SchemaTypes.ObjectId, ref: "City", refAllowlist: CitySimpleSnippet, dynamicTableConfiguration: {hideColumn: true, filterable: false, sortable: false}},
                street: {type: SchemaTypes.String, maxlength: CLINIC_LOCATION_STREET_MAX, dynamicTableConfiguration: {hideColumn: true, filterable: false, sortable: false}},
                postalCode: {type: SchemaTypes.String, maxlength: CLINIC_LOCATION_POSTAL_CODE_MAX, dynamicTableConfiguration: {hideColumn: true, filterable: false, sortable: false}},
                latitude: {type: SchemaTypes.Number, min: -90, max: 90, dynamicTableConfiguration: {hideColumn: true, filterable: false, sortable: false}},
                longitude: {type: SchemaTypes.Number, min: -180, max: 180, dynamicTableConfiguration: {hideColumn: true, filterable: false, sortable: false}},
            },
            required: false,
            dynamicTableConfiguration: {filterable: false, sortable: false, cellType: COLUMN_TYPE.ADDRESS},
        },
        timezone: {type: SchemaTypes.String, required: true, trim: true, minlength: 1, maxlength: CLINIC_LOCATION_TIMEZONE_MAX},
        openingHours: {
            type: [{
                _id: false,
                dayOfWeek: {type: SchemaTypes.Number, required: true, min: 0, max: 6, dynamicTableConfiguration: {hideColumn: true, filterable: false, sortable: false}},
                startTime: {type: SchemaTypes.String, required: true, dynamicTableConfiguration: {hideColumn: true, filterable: false, sortable: false}},
                endTime: {type: SchemaTypes.String, required: true, dynamicTableConfiguration: {hideColumn: true, filterable: false, sortable: false}},
            }],
            default: [],
            dynamicTableConfiguration: {hideColumn: true, filterable: false, sortable: false},
        },
        closures: {
            type: [{
                _id: false,
                date: {type: SchemaTypes.String, required: true, dynamicTableConfiguration: {hideColumn: true, filterable: false, sortable: false}},
                reason: {type: SchemaTypes.String, maxlength: CLINIC_LOCATION_CLOSURE_REASON_MAX, dynamicTableConfiguration: {hideColumn: true, filterable: false, sortable: false}},
            }],
            default: [],
            dynamicTableConfiguration: {hideColumn: true, filterable: false, sortable: false},
        },
        isActive: {type: SchemaTypes.Boolean, default: true},
    },
    {accessMode: "loose"},
);

ownershipPlugin(ClinicLocationSchema);
auditPlugin(ClinicLocationSchema);
softDeletePlugin(ClinicLocationSchema);
lifeCyclePlugin(ClinicLocationSchema);
applyClinicLocationIndexes(ClinicLocationSchema);
const ClinicLocation = model<IClinicLocation>("ClinicLocation", ClinicLocationSchema);
normalizeSchemaPermissions(ClinicLocation);
export default ClinicLocation;

addModelData(ClinicLocation, clinicLocationViews);
validateSchemaDefAgainstMongoose(ClinicLocationSchema, ClinicLocationSchemaDef, "ClinicLocation");
