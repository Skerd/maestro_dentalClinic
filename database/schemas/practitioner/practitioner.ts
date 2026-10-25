import {Document, model, Schema, SchemaTypes, Types} from "mongoose";
import {IMedia} from "@coreModule/database/schemas/media/media";
import {IUser} from "@coreModule/database/schemas/user/user";
import {normalizeSchemaPermissions} from "@coreModule/database/utilities";
import ownershipPlugin from "@coreModule/database/plugins/ownershipPlugin";
import auditPlugin from "@coreModule/database/plugins/auditPlugin";
import softDeletePlugin from "@coreModule/database/plugins/softDeletePlugin";
import lifeCyclePlugin from "@coreModule/database/plugins/lifeCyclePlugin";
import publicMediaPlugin from "@coreModule/database/plugins/publicMediaPlugin";
import {ILifeCyclePluginFields, IOwnershipPluginFields, ISoftDeletePluginFields} from "@coreModule/database/types/plugin-fields";
import {addModelData} from "@coreModule/database/collections";
import {validateSchemaDefAgainstMongoose} from "@coreModule/database/utilities/validateSchemaDefAgainstMongoose";
import {MediaSimpleSnippet} from "@coreModule/database/schemas/media/media.snippets";
import {SimpleBlankUserSnippet} from "@coreModule/database/schemas/user/user.snippets";
import {COLUMN_TYPE} from "armonia/src/modules/core/database/filter/typeOperators";
import {
    PRACTITIONER_BIO_MAX,
    PRACTITIONER_NAME_MAX,
    PRACTITIONER_ROLES,
    PRACTITIONER_TITLE_MAX,
    PractitionerSchemaDef,
    type PractitionerRole,
} from "armonia/src/modules/dentalClinic/api/dentalClinic/private/practitioner/practitioner.schema-def";
import type {IClinicService} from "../clinicService/clinicService";
import type {IClinicLocation} from "../clinicLocation/clinicLocation";
import {ClinicServiceSimpleSnippet} from "../clinicService/clinicService.snippets";
import {ClinicLocationSimpleSnippet} from "../clinicLocation/clinicLocation.snippets";
import {applyPractitionerIndexes} from "./practitioner.indexes";
import {practitionerViews} from "./practitioner.views";

const NoWritePermission = {self: {write: "no-permission"}, others: {write: "no-permission"}};

export type IPractitionerScheduleRow = {
    location: IClinicLocation | Types.ObjectId;
    dayOfWeek: number;
    startTime: string;
    endTime: string;
};

export interface IPractitioner extends Document, IOwnershipPluginFields, ISoftDeletePluginFields, ILifeCyclePluginFields {
    staffUser?: IUser;
    displayName: string;
    title?: string;
    role: PractitionerRole;
    bio?: string;
    photo?: IMedia;
    languages: string[];
    services: IClinicService[];
    locations: IClinicLocation[];
    schedule: IPractitionerScheduleRow[];
    isBookable: boolean;
    isActive: boolean;
    sortOrder: number;
    /**
     * Bumped inside every transaction that books, moves or blocks time for this
     * person, and whenever their schedule changes. Two such transactions write the
     * same document, so MongoDB lets only one commit and the other retries and
     * sees the first one's change. Never read for logic.
     */
    bookingVersion: number;
}

const PractitionerSchema = new Schema<IPractitioner>(
    {
        staffUser: {
            type: SchemaTypes.ObjectId,
            ref: "User",
            refAllowlist: SimpleBlankUserSnippet,
            dynamicTableConfiguration: {refDisplayKey: ["name", "surname"]},
        },
        displayName: {type: SchemaTypes.String, required: true, trim: true, minlength: 1, maxlength: PRACTITIONER_NAME_MAX},
        title: {type: SchemaTypes.String, trim: true, maxlength: PRACTITIONER_TITLE_MAX},
        role: {
            type: SchemaTypes.String,
            enum: PRACTITIONER_ROLES,
            required: true,
            default: "dentist",
            dynamicTableConfiguration: {enumTones: {dentist: "info", hygienist: "success", orthodontist: "info", other: "neutral"}},
        },
        bio: {type: SchemaTypes.String, maxlength: PRACTITIONER_BIO_MAX, dynamicTableConfiguration: {hideColumn: true}},
        photo: {
            type: SchemaTypes.ObjectId,
            ref: "Media",
            refAllowlist: MediaSimpleSnippet,
            dynamicTableConfiguration: {sortable: false, filterable: false, cellType: COLUMN_TYPE.AVATAR},
        },
        languages: {type: [SchemaTypes.String], default: [], dynamicTableConfiguration: {hideColumn: true}},
        services: {
            type: [{type: SchemaTypes.ObjectId, ref: "ClinicService"}],
            default: [],
            refAllowlist: ClinicServiceSimpleSnippet,
            dynamicTableConfiguration: {refDisplayKey: ["name"], hideColumn: true},
        },
        locations: {
            type: [{type: SchemaTypes.ObjectId, ref: "ClinicLocation"}],
            default: [],
            refAllowlist: ClinicLocationSimpleSnippet,
            dynamicTableConfiguration: {refDisplayKey: ["name"]},
        },
        schedule: {
            type: [{
                _id: false,
                location: {
                    type: SchemaTypes.ObjectId,
                    ref: "ClinicLocation",
                    required: true,
                    refAllowlist: ClinicLocationSimpleSnippet,
                    dynamicTableConfiguration: {hideColumn: true, filterable: false, sortable: false},
                },
                dayOfWeek: {type: SchemaTypes.Number, required: true, min: 0, max: 6, dynamicTableConfiguration: {hideColumn: true, filterable: false, sortable: false}},
                startTime: {type: SchemaTypes.String, required: true, dynamicTableConfiguration: {hideColumn: true, filterable: false, sortable: false}},
                endTime: {type: SchemaTypes.String, required: true, dynamicTableConfiguration: {hideColumn: true, filterable: false, sortable: false}},
            }],
            default: [],
            dynamicTableConfiguration: {hideColumn: true, filterable: false, sortable: false},
        },
        isBookable: {type: SchemaTypes.Boolean, default: true},
        isActive: {type: SchemaTypes.Boolean, default: true},
        sortOrder: {type: SchemaTypes.Number, default: 0},
        bookingVersion: {
            type: SchemaTypes.Number,
            default: 0,
            permissions: NoWritePermission,
            dynamicTableConfiguration: {hideColumn: true, filterable: false},
        },
    },
    {accessMode: "loose"},
);

ownershipPlugin(PractitionerSchema);
publicMediaPlugin(PractitionerSchema, {schemaDef: PractitionerSchemaDef});
auditPlugin(PractitionerSchema);
softDeletePlugin(PractitionerSchema);
lifeCyclePlugin(PractitionerSchema);
applyPractitionerIndexes(PractitionerSchema);
const Practitioner = model<IPractitioner>("Practitioner", PractitionerSchema);
normalizeSchemaPermissions(Practitioner);
export default Practitioner;

addModelData(Practitioner, practitionerViews);
validateSchemaDefAgainstMongoose(PractitionerSchema, PractitionerSchemaDef, "Practitioner");
