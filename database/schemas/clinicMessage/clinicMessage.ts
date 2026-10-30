import {Document, model, Schema, SchemaTypes, Types} from "mongoose";
import {IMedia} from "@coreModule/database/schemas/media/media";
import {IUser} from "@coreModule/database/schemas/user/user";
import {normalizeSchemaPermissions} from "@coreModule/database/utilities";
import ownershipPlugin from "@coreModule/database/plugins/ownershipPlugin";
import auditPlugin from "@coreModule/database/plugins/auditPlugin";
import softDeletePlugin from "@coreModule/database/plugins/softDeletePlugin";
import lifeCyclePlugin from "@coreModule/database/plugins/lifeCyclePlugin";
import {ILifeCyclePluginFields, IOwnershipPluginFields, ISoftDeletePluginFields} from "@coreModule/database/types/plugin-fields";
import {addModelData} from "@coreModule/database/collections";
import {MediaSimpleSnippet} from "@coreModule/database/schemas/media/media.snippets";
import {SimpleBlankUserSnippet} from "@coreModule/database/schemas/user/user.snippets";
import {CLINIC_MESSAGE_BODY_MAX} from "armonia/src/modules/dentalClinic/constants";
import {CLINIC_MESSAGE_SENDERS, type ClinicMessageSender} from "armonia/src/modules/dentalClinic/api/dentalClinic/private/clinicMessage/clinicMessage.forms";
import type {IClinicInquiry} from "../clinicInquiry/clinicInquiry";
import {applyClinicMessageIndexes} from "./clinicMessage.indexes";

/** Messages are written by the thread routes only and never edited. */
const NoWritePermission = {self: {write: "no-permission"}, others: {write: "no-permission"}};

/**
 * One message between a patient and the clinic about an inquiry. Owned by the clinic:
 * the thread is part of the clinic's record of the request.
 */
export interface IClinicMessage extends Document, IOwnershipPluginFields, ISoftDeletePluginFields, ILifeCyclePluginFields {
    inquiry: IClinicInquiry | Types.ObjectId;
    from: ClinicMessageSender;
    /** The staff member who wrote it; patient messages carry the portal account. */
    author?: IUser;
    body: string;
    attachments: IMedia[];
    /** When the other side first listed it. */
    readAt?: Date;
}

const ClinicMessageSchema = new Schema<IClinicMessage>(
    {
        inquiry: {type: SchemaTypes.ObjectId, ref: "ClinicInquiry", required: true, immutable: true, permissions: NoWritePermission},
        from: {type: SchemaTypes.String, enum: CLINIC_MESSAGE_SENDERS, required: true, immutable: true, permissions: NoWritePermission},
        author: {
            type: SchemaTypes.ObjectId,
            ref: "User",
            refAllowlist: SimpleBlankUserSnippet,
            immutable: true,
            permissions: NoWritePermission,
            dynamicTableConfiguration: {refDisplayKey: ["name", "surname"]},
        },
        body: {type: SchemaTypes.String, required: true, maxlength: CLINIC_MESSAGE_BODY_MAX, immutable: true},
        attachments: {
            type: [{type: SchemaTypes.ObjectId, ref: "Media"}],
            default: [],
            refAllowlist: MediaSimpleSnippet,
            immutable: true,
            dynamicTableConfiguration: {sortable: false, filterable: false, hideColumn: true},
        },
        readAt: {type: SchemaTypes.Date, permissions: NoWritePermission},
    },
    {accessMode: "loose"},
);

ownershipPlugin(ClinicMessageSchema);
auditPlugin(ClinicMessageSchema);
softDeletePlugin(ClinicMessageSchema);
lifeCyclePlugin(ClinicMessageSchema);
applyClinicMessageIndexes(ClinicMessageSchema);
const ClinicMessage = model<IClinicMessage>("ClinicMessage", ClinicMessageSchema);
normalizeSchemaPermissions(ClinicMessage);
export default ClinicMessage;

// No panel views: the thread is shown inside the inquiry. Registered for its permission group.
addModelData(ClinicMessage);
