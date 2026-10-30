import {ObjectId} from "mongodb";
import {apiValidationException} from "armonia/src/modules/core/helpers/exceptions";
import {nestedEntityToRef} from "@coreModule/utilities/mappers/common.mapper";
import {
    INFO_REQUEST_KINDS,
    INQUIRY_OPEN_STATUSES,
    type InfoRequestKind,
    type InquiryStatus,
} from "armonia/src/modules/dentalClinic/constants";
import type {InquiryTimelineEvent} from "armonia/src/modules/dentalClinic/api/dentalClinic/private/clinicInquiry/clinicInquiry.dto";
import type {IClinicInquiry} from "@dentalClinicModule/database/schemas/clinicInquiry/clinicInquiry";
import {NotificationEventCodes} from "@dentalClinicModule/domain/notifications/notificationEventCodes";
import type {ClinicCtx} from "./appointmentBooking";
import {claimPatientUploads, idsOf, inquiryCompanyId, shareFiles, unshareFiles} from "./inquiryIntake";
import {notifyInquiryPatient, notifyInquiryStaff} from "./inquiryNotify";
import {findOrCreatePatient} from "./patientRecords";

type Actor = {userId?: string | ObjectId; now?: Date};

const byOf = (userId?: string | ObjectId) => (userId && ObjectId.isValid(String(userId)) ? new ObjectId(String(userId)) : undefined);

const isInfoKind = (value: string): value is InfoRequestKind => INFO_REQUEST_KINDS.some((kind) => kind === value);

export function isOpenInquiry(inquiry: Pick<IClinicInquiry, "status">): boolean {
    return INQUIRY_OPEN_STATUSES.includes(inquiry.status);
}

function assertStatus(inquiry: IClinicInquiry, allowed: readonly InquiryStatus[], languageCode: string): void {
    if (!allowed.includes(inquiry.status)) {
        throw apiValidationException("inquiry_invalid_status", "", null, languageCode);
    }
}

function record(inquiry: IClinicInquiry, event: InquiryTimelineEvent, actor: Actor, note?: string): Date {
    const at = actor.now ?? new Date();
    inquiry.timeline.push({event, at, by: byOf(actor.userId), ...(note ? {note} : {})});
    return at;
}

/** The first thing the clinic does for the patient: the response time the portal reports. */
export function markResponded(inquiry: IClinicInquiry, at: Date): void {
    if (!inquiry.firstResponseAt) inquiry.firstResponseAt = at;
    if (inquiry.status === "new") inquiry.status = "in_review";
}

/** Info requests the patient has not answered yet. */
export function openInfoRequests(inquiry: Pick<IClinicInquiry, "infoRequests">): InfoRequestKind[] {
    return inquiry.infoRequests.filter((request) => !request.fulfilledAt).map((request) => request.kind);
}

export async function startInquiryReview(inquiry: IClinicInquiry, actor: Actor, ctx: ClinicCtx): Promise<void> {
    assertStatus(inquiry, ["new"], ctx.languageCode);
    markResponded(inquiry, record(inquiry, "review_started", actor));
    await inquiry.save({session: ctx.session});
}

/** The clinic asks for what it needs to quote (an OPG, a CBCT, photos…). */
export async function requestInquiryInfo(
    inquiry: IClinicInquiry,
    input: Actor & {kinds: string[]; note?: string},
    ctx: ClinicCtx,
): Promise<void> {
    assertStatus(inquiry, INQUIRY_OPEN_STATUSES, ctx.languageCode);
    const kinds = [...new Set(input.kinds)].filter(isInfoKind);
    if (!kinds.length || kinds.length !== new Set(input.kinds).size) {
        throw apiValidationException("inquiry_invalid_info_kinds", "", null, ctx.languageCode);
    }
    const note = input.note?.trim() || undefined;
    const at = record(inquiry, "info_requested", input, note);
    const pending = new Set(openInfoRequests(inquiry));
    for (const kind of kinds) {
        if (!pending.has(kind)) inquiry.infoRequests.push({kind, requestedAt: at, requestedBy: byOf(input.userId), ...(note ? {note} : {})});
    }
    markResponded(inquiry, at);
    inquiry.status = "info_requested";
    await inquiry.save({session: ctx.session});
    await notifyInquiryPatient("infoRequested", inquiry, {requested: kinds, note}, ctx);
}

/**
 * Ends the inquiry at this clinic: `declined` when the clinic will not treat, `lost` when the
 * patient went elsewhere. The clinic loses access to the patient's files.
 */
export async function closeInquiry(
    inquiry: IClinicInquiry,
    input: Actor & {outcome: "declined" | "lost"; reason?: string},
    ctx: ClinicCtx,
): Promise<void> {
    assertStatus(inquiry, INQUIRY_OPEN_STATUSES, ctx.languageCode);
    const reason = input.reason?.trim() || undefined;
    const at = record(inquiry, input.outcome, input, reason);
    if (input.outcome === "declined") markResponded(inquiry, at);
    inquiry.status = input.outcome;
    inquiry.closedAt = at;
    inquiry.closeReason = reason;
    await inquiry.save({session: ctx.session});
    await unshareFiles(idsOf(inquiry.files), inquiryCompanyId(inquiry), ctx);
    if (input.outcome === "declined") await notifyInquiryPatient("declined", inquiry, {note: reason}, ctx);
}

/** The patient no longer wants this clinic's answer. */
export async function withdrawInquiry(inquiry: IClinicInquiry, actor: Actor, ctx: ClinicCtx): Promise<void> {
    assertStatus(inquiry, INQUIRY_OPEN_STATUSES, ctx.languageCode);
    inquiry.status = "withdrawn";
    inquiry.closedAt = record(inquiry, "withdrawn", actor);
    await inquiry.save({session: ctx.session});
    await unshareFiles(idsOf(inquiry.files), inquiryCompanyId(inquiry), ctx);
    await notifyInquiryStaff(NotificationEventCodes.INQUIRY_WITHDRAWN, inquiry, ctx);
}

/** The patient lets this clinic see their full name, email and phone numbers. */
export async function shareInquiryContact(inquiry: IClinicInquiry, actor: Actor, ctx: ClinicCtx): Promise<void> {
    if (inquiry.contactShared) return;
    assertStatus(inquiry, INQUIRY_OPEN_STATUSES, ctx.languageCode);
    inquiry.contactShared = true;
    record(inquiry, "contact_shared", actor);
    await inquiry.save({session: ctx.session});
}

/**
 * More files from the patient, optionally answering what the clinic asked for. Once nothing
 * is outstanding the inquiry goes back to the clinic's review.
 */
export async function attachInquiryFiles(
    inquiry: IClinicInquiry,
    input: Actor & {fileIds: string[]; fulfils?: string[]; owner: {accountId: ObjectId; platformCompanyId: ObjectId}},
    ctx: ClinicCtx,
): Promise<void> {
    assertStatus(inquiry, INQUIRY_OPEN_STATUSES, ctx.languageCode);
    const fulfils = new Set((input.fulfils ?? []).filter(isInfoKind));
    const files = await claimPatientUploads(input.fileIds, input.owner, ctx);
    const known = new Set(idsOf(inquiry.files).map(String));
    const added = files.filter((file) => !known.has(String(file)));
    inquiry.set("files", [...idsOf(inquiry.files), ...added]);
    const at = record(inquiry, "files_added", input);
    for (const request of inquiry.infoRequests) {
        if (!request.fulfilledAt && fulfils.has(request.kind)) request.fulfilledAt = at;
    }
    if (inquiry.status === "info_requested" && !openInfoRequests(inquiry).length) inquiry.status = "in_review";
    inquiry.unreadForClinic += 1;
    await inquiry.save({session: ctx.session});
    await shareFiles(added, [inquiryCompanyId(inquiry)], ctx);
    await notifyInquiryStaff(NotificationEventCodes.INQUIRY_FILES_ADDED, inquiry, ctx);
}

export async function assignInquiry(inquiry: IClinicInquiry, input: Actor & {assignedTo?: string}, ctx: ClinicCtx): Promise<void> {
    inquiry.set("assignedTo", input.assignedTo ? new ObjectId(input.assignedTo) : undefined);
    record(inquiry, "assigned", input);
    await inquiry.save({session: ctx.session});
}

/**
 * Opens (or finds) the patient's folder at this clinic from the inquiry. A portal patient must
 * have shared their contact first: the folder is the clinic's own record of them.
 */
export async function convertInquiry(inquiry: IClinicInquiry, actor: Actor, ctx: ClinicCtx): Promise<void> {
    assertStatus(inquiry, INQUIRY_OPEN_STATUSES, ctx.languageCode);
    if (!inquiry.contactShared) {
        throw apiValidationException("inquiry_contact_not_shared", "", null, ctx.languageCode);
    }
    const {contact} = inquiry;
    const patient = await findOrCreatePatient(
        {
            companyId: inquiryCompanyId(inquiry),
            accountId: nestedEntityToRef(inquiry.account),
            contact: {
                firstName: contact.firstName,
                lastName: contact.lastName,
                email: contact.email,
                phone: contact.phone,
                whatsapp: contact.whatsapp,
                country: nestedEntityToRef(contact.country),
            },
            source: inquiry.source,
            preferredLanguage: contact.preferredLanguage,
            now: actor.now,
        },
        ctx,
    );
    inquiry.set("patient", patient._id);
    inquiry.status = "converted";
    inquiry.closedAt = record(inquiry, "converted", actor);
    markResponded(inquiry, inquiry.closedAt);
    await inquiry.save({session: ctx.session});
}
