import {Document, model, Schema, SchemaTypes} from "mongoose";
import {ICurrency} from "@coreModule/database/schemas/currency/currency";
import {IUser} from "@coreModule/database/schemas/user/user";
import {normalizeSchemaPermissions} from "@coreModule/database/utilities";
import ownershipPlugin from "@coreModule/database/plugins/ownershipPlugin";
import auditPlugin from "@coreModule/database/plugins/auditPlugin";
import softDeletePlugin from "@coreModule/database/plugins/softDeletePlugin";
import lifeCyclePlugin from "@coreModule/database/plugins/lifeCyclePlugin";
import {ILifeCyclePluginFields, IOwnershipPluginFields, ISoftDeletePluginFields} from "@coreModule/database/types/plugin-fields";
import {addModelData} from "@coreModule/database/collections";
import {CurrencySimpleSnippet} from "@coreModule/database/schemas/currency/currency.snippets";
import {SimpleBlankUserSnippet} from "@coreModule/database/schemas/user/user.snippets";
import {validateSchemaDefAgainstMongoose} from "@coreModule/database/utilities/validateSchemaDefAgainstMongoose";
import {
    CLINIC_ADVANCE_DAYS,
    CLINIC_DEADLINE_HOURS,
    CLINIC_NO_SHOW_GRACE_MINUTES,
    CLINIC_NOTICE_HOURS,
    CLINIC_PRIVACY_TEXT_MAX,
    CLINIC_PRIVACY_VERSION_MAX,
    CLINIC_REMINDER_HOURS,
    CLINIC_RETENTION_MONTHS,
    CLINIC_SLOT_INTERVAL_MINUTES,
    ClinicConfigSchemaDef,
} from "armonia/src/modules/dentalClinic/api/dentalClinic/private/clinicConfig/clinicConfig.schema-def";
import {applyClinicConfigIndexes} from "./clinicConfig.indexes";
import {clinicConfigViews} from "./clinicConfig.views";

export interface IClinicConfig extends Document, IOwnershipPluginFields, ISoftDeletePluginFields, ILifeCyclePluginFields {
    publicBookingEnabled: boolean;
    /** The company opts in to being listed and booked on the central portal. */
    listedOnPortal: boolean;
    currency: ICurrency;
    slotIntervalMinutes: number;
    minNoticeHours: number;
    maxAdvanceDays: number;
    cancellationDeadlineHours: number;
    rescheduleDeadlineHours: number;
    noShowGraceMinutes: number;
    guestBookingAllowed: boolean;
    requireStaffConfirmation: boolean;
    patientNoteEnabled: boolean;
    reminderHoursBefore: number;
    reminderSms: boolean;
    includeServiceInMessages: boolean;
    retentionMonths: number;
    privacyNoticeVersion?: string;
    privacyNoticeText?: string;
    notifyUsers: IUser[];
}

const ClinicConfigSchema = new Schema<IClinicConfig>(
    {
        publicBookingEnabled: {type: SchemaTypes.Boolean, default: false},
        listedOnPortal: {type: SchemaTypes.Boolean, default: false},
        currency: {
            type: SchemaTypes.ObjectId,
            ref: "Currency",
            required: true,
            refAllowlist: CurrencySimpleSnippet,
            dynamicTableConfiguration: {refDisplayKey: ["abbreviation"]},
        },
        slotIntervalMinutes: {type: SchemaTypes.Number, required: true, default: 15, ...CLINIC_SLOT_INTERVAL_MINUTES},
        minNoticeHours: {type: SchemaTypes.Number, required: true, default: 2, ...CLINIC_NOTICE_HOURS},
        maxAdvanceDays: {type: SchemaTypes.Number, required: true, default: 90, ...CLINIC_ADVANCE_DAYS},
        cancellationDeadlineHours: {type: SchemaTypes.Number, required: true, default: 24, ...CLINIC_DEADLINE_HOURS},
        rescheduleDeadlineHours: {type: SchemaTypes.Number, required: true, default: 24, ...CLINIC_DEADLINE_HOURS},
        noShowGraceMinutes: {type: SchemaTypes.Number, required: true, default: 15, ...CLINIC_NO_SHOW_GRACE_MINUTES},
        guestBookingAllowed: {type: SchemaTypes.Boolean, default: true},
        requireStaffConfirmation: {type: SchemaTypes.Boolean, default: false},
        patientNoteEnabled: {type: SchemaTypes.Boolean, default: false},
        reminderHoursBefore: {type: SchemaTypes.Number, required: true, default: 24, ...CLINIC_REMINDER_HOURS},
        reminderSms: {type: SchemaTypes.Boolean, default: false},
        includeServiceInMessages: {type: SchemaTypes.Boolean, default: false},
        retentionMonths: {type: SchemaTypes.Number, required: true, default: 24, ...CLINIC_RETENTION_MONTHS},
        privacyNoticeVersion: {type: SchemaTypes.String, trim: true, maxlength: CLINIC_PRIVACY_VERSION_MAX},
        privacyNoticeText: {type: SchemaTypes.String, maxlength: CLINIC_PRIVACY_TEXT_MAX, dynamicTableConfiguration: {hideColumn: true}},
        notifyUsers: {
            type: [{type: SchemaTypes.ObjectId, ref: "User"}],
            default: [],
            refAllowlist: SimpleBlankUserSnippet,
            dynamicTableConfiguration: {refDisplayKey: ["name", "surname"]},
        },
    },
    {accessMode: "loose"},
);

ownershipPlugin(ClinicConfigSchema);
auditPlugin(ClinicConfigSchema);
softDeletePlugin(ClinicConfigSchema);
lifeCyclePlugin(ClinicConfigSchema);
applyClinicConfigIndexes(ClinicConfigSchema);
const ClinicConfig = model<IClinicConfig>("ClinicConfig", ClinicConfigSchema);
normalizeSchemaPermissions(ClinicConfig);
export default ClinicConfig;

addModelData(ClinicConfig, clinicConfigViews);
validateSchemaDefAgainstMongoose(ClinicConfigSchema, ClinicConfigSchemaDef, "ClinicConfig");
