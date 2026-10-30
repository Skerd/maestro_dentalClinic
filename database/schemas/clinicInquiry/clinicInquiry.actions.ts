import {ObjectId} from "mongodb";
import type {Model} from "mongoose";
import {action} from "@coreModule/api/actionDecorator";
import {getModelCollectedData} from "@coreModule/database/collections";
import SchemaGuard from "@coreModule/database/security/schemaGuard";
import {mediaUploadMW} from "@coreModule/utilities/middlewares/mediaUploadMW";
import type {TransactionRequiredParams} from "@coreModule/utilities/middlewares/transactionUtils";
import {apiValidationException} from "armonia/src/modules/core/helpers/exceptions";
import {validateSingleForm} from "armonia/src/modules/core/utilities/zod/shared.validator";
import {CLINIC_MESSAGE_ATTACHMENTS_MAX, PATIENT_FILE_MAX_BYTES, PATIENT_FILE_MIME_TYPES} from "armonia/src/modules/dentalClinic/constants";
import type {ClinicInquiry as ClinicInquiryDto} from "armonia/src/modules/dentalClinic/api/dentalClinic/private/clinicInquiry/clinicInquiry.dto";
import {
    assignInquiryFormSchema,
    closeInquiryFormSchema,
    requestInquiryInfoFormSchema,
} from "armonia/src/modules/dentalClinic/api/dentalClinic/private/clinicInquiry/clinicInquiry.form.validators";
import type {
    AssignInquiryFormType,
    CloseInquiryFormType,
    RequestInquiryInfoFormType,
} from "armonia/src/modules/dentalClinic/api/dentalClinic/private/clinicInquiry/clinicInquiry.schema-def";
import {inquiryThreadFormSchema, sendClinicMessageFormSchema} from "armonia/src/modules/dentalClinic/api/dentalClinic/private/clinicMessage/clinicMessage.form.validators";
import type {SendClinicMessageFormType} from "armonia/src/modules/dentalClinic/api/dentalClinic/private/clinicMessage/clinicMessage.forms";
import type {ClinicMessage as ClinicMessageDto} from "armonia/src/modules/dentalClinic/api/dentalClinic/private/clinicMessage/clinicMessage.dto";
import ClinicInquiry, {type IClinicInquiry} from "./clinicInquiry";
import ClinicMessage from "../clinicMessage/clinicMessage";
import {clinicInquiryToDTO} from "@dentalClinicModule/utilities/mappers/clinicInquiry/clinicInquiryMapper.dto";
import {clinicMessageToDTO} from "@dentalClinicModule/utilities/mappers/clinicMessage/clinicMessageMapper.dto";
import {idsOf} from "@dentalClinicModule/utilities/services/inquiryIntake";
import {
    assignInquiry,
    closeInquiry,
    convertInquiry,
    requestInquiryInfo,
    startInquiryReview,
} from "@dentalClinicModule/utilities/services/inquiryLifecycle";
import {postInquiryMessage, readThread} from "@dentalClinicModule/utilities/services/inquiryThread";

type ActionParams<F> = TransactionRequiredParams & F;

const attachmentsUpload = mediaUploadMW({
    fields: {attachments: CLINIC_MESSAGE_ATTACHMENTS_MAX},
    fieldMimeTypes: {attachments: [...PATIENT_FILE_MIME_TYPES]},
    maxFileSize: PATIENT_FILE_MAX_BYTES,
});

/**
 * Actions get no permission check from the CRUD router. Working the request needs write
 * access to its `status`; the thread needs read or write access to message bodies.
 */
function assertFieldAccess(model: Model<any>, collection: string, field: string, mode: "read" | "write", params: TransactionRequiredParams): void {
    const collected = getModelCollectedData(collection);
    const fields = SchemaGuard.sanitizeFields(model, (mode === "read" ? collected.readFields : collected.writeFields)!, mode, params.actionUserCtx, params.languageCode);
    if (!fields[field]) {
        throw apiValidationException("user_permissions_not_sufficient", "", null, params.languageCode);
    }
}

async function loadInquiry(params: TransactionRequiredParams & {_id: string}): Promise<IClinicInquiry> {
    const {_id, company, session, languageCode} = params;
    const inquiry = ObjectId.isValid(_id)
        ? await ClinicInquiry.findOne({_id: new ObjectId(_id), company: company._id, deletedAt: null}).session(session)
        : null;
    if (!inquiry) throw apiValidationException("inquiry_not_found", "", null, languageCode);
    return inquiry;
}

async function loadForStatusChange(params: TransactionRequiredParams & {_id: string}): Promise<IClinicInquiry> {
    assertFieldAccess(ClinicInquiry, "clinicinquiries", "status", "write", params);
    return loadInquiry(params);
}

async function toDto(inquiry: IClinicInquiry, params: TransactionRequiredParams): Promise<ClinicInquiryDto> {
    const {session, actionUserCtx, languageCode} = params;
    const readFields = SchemaGuard.sanitizeFields(ClinicInquiry, getModelCollectedData("clinicinquiries").readFields!, "read", actionUserCtx, languageCode);
    const populate = SchemaGuard.generatePopulate(readFields, ClinicInquiry.schema);
    const fresh = await ClinicInquiry.findById(inquiry._id).populate(populate.populate).session(session);
    return clinicInquiryToDTO(fresh ?? inquiry);
}

function ctxOf(params: TransactionRequiredParams) {
    return {session: params.session, logger: params.logger, languageCode: params.languageCode, auditUserId: params.actionUserCtx.userId};
}

const actorOf = (params: TransactionRequiredParams) => ({userId: params.actionUserCtx.userId});

export class ClinicInquiryActions {
    /** The clinic has started looking at a new request. */
    @action({auth: "private", transaction: true, rateLimit: {windowMs: 60000, max: 60}, schema: validateSingleForm})
    async startReview(params: ActionParams<{_id: string}>): Promise<ClinicInquiryDto> {
        const inquiry = await loadForStatusChange(params);
        await startInquiryReview(inquiry, actorOf(params), ctxOf(params));
        return toDto(inquiry, params);
    }

    /** Asks the patient for an OPG, a CBCT, photos, their medical history… */
    @action({auth: "private", transaction: true, rateLimit: {windowMs: 60000, max: 30}, schema: requestInquiryInfoFormSchema})
    async requestInfo(params: ActionParams<RequestInquiryInfoFormType>): Promise<ClinicInquiryDto> {
        const inquiry = await loadForStatusChange(params);
        await requestInquiryInfo(inquiry, {...actorOf(params), kinds: params.kinds, note: params.note}, ctxOf(params));
        return toDto(inquiry, params);
    }

    /** The clinic will not treat this patient; they are told, with the reason if given. */
    @action({auth: "private", transaction: true, rateLimit: {windowMs: 60000, max: 30}, schema: closeInquiryFormSchema})
    async decline(params: ActionParams<CloseInquiryFormType>): Promise<ClinicInquiryDto> {
        const inquiry = await loadForStatusChange(params);
        await closeInquiry(inquiry, {...actorOf(params), outcome: "declined", reason: params.reason}, ctxOf(params));
        return toDto(inquiry, params);
    }

    /** The patient went elsewhere or stopped answering. */
    @action({auth: "private", transaction: true, rateLimit: {windowMs: 60000, max: 30}, schema: closeInquiryFormSchema})
    async markLost(params: ActionParams<CloseInquiryFormType>): Promise<ClinicInquiryDto> {
        const inquiry = await loadForStatusChange(params);
        await closeInquiry(inquiry, {...actorOf(params), outcome: "lost", reason: params.reason}, ctxOf(params));
        return toDto(inquiry, params);
    }

    @action({auth: "private", transaction: true, rateLimit: {windowMs: 60000, max: 60}, schema: assignInquiryFormSchema})
    async assign(params: ActionParams<AssignInquiryFormType>): Promise<ClinicInquiryDto> {
        assertFieldAccess(ClinicInquiry, "clinicinquiries", "assignedTo", "write", params);
        const inquiry = await loadInquiry(params);
        await assignInquiry(inquiry, {...actorOf(params), assignedTo: params.assignedTo}, ctxOf(params));
        return toDto(inquiry, params);
    }

    /** Opens (or finds) the patient's folder from the request. */
    @action({auth: "private", transaction: true, rateLimit: {windowMs: 60000, max: 30}, schema: validateSingleForm})
    async convert(params: ActionParams<{_id: string}>): Promise<ClinicInquiryDto> {
        const inquiry = await loadForStatusChange(params);
        await convertInquiry(inquiry, actorOf(params), ctxOf(params));
        return toDto(inquiry, params);
    }

    /** The thread with the patient, oldest first; opening it marks the patient's messages read. */
    @action({auth: "private", transaction: true, rateLimit: {windowMs: 60000, max: 120}, schema: inquiryThreadFormSchema})
    async thread(params: ActionParams<{_id: string}>): Promise<{data: ClinicMessageDto[]}> {
        assertFieldAccess(ClinicMessage, "clinicmessages", "body", "read", params);
        const inquiry = await loadInquiry(params);
        const messages = await readThread(inquiry, "clinic", ctxOf(params));
        return {data: messages.map(clinicMessageToDTO)};
    }

    /** A message to the patient, with files uploaded alongside. */
    @action({auth: "private", transaction: true, rateLimit: {windowMs: 60000, max: 30}, middleware: [attachmentsUpload], schema: sendClinicMessageFormSchema})
    async sendMessage(params: ActionParams<SendClinicMessageFormType>): Promise<{data: ClinicMessageDto}> {
        assertFieldAccess(ClinicMessage, "clinicmessages", "body", "write", params);
        const inquiry = await loadInquiry(params);
        const message = await postInquiryMessage(
            inquiry,
            {from: "clinic", authorId: new ObjectId(params.actionUserCtx.userId), body: params.body, attachments: idsOf(params.attachments ?? [])},
            ctxOf(params),
        );
        await message.populate([{path: "author", select: "name surname"}, {path: "attachments", select: "originalName fileName mimeType sizeInBytes type"}]);
        return {data: clinicMessageToDTO(message)};
    }
}
