import type {ObjectId} from "mongodb";
import {apiValidationException} from "armonia/src/modules/core/helpers/exceptions";
import type {ClinicMessageSender} from "armonia/src/modules/dentalClinic/api/dentalClinic/private/clinicMessage/clinicMessage.forms";
import type {IClinicInquiry} from "@dentalClinicModule/database/schemas/clinicInquiry/clinicInquiry";
import {type IClinicMessage} from "@dentalClinicModule/database/schemas/clinicMessage/clinicMessage";
import {clinicMessageService} from "@dentalClinicModule/database/schemas/clinicMessage/clinicMessage.service";
import {NotificationEventCodes} from "@dentalClinicModule/domain/notifications/notificationEventCodes";
import type {ClinicCtx} from "./appointmentBooking";
import {inquiryCompanyId, shareFiles} from "./inquiryIntake";
import {isOpenInquiry, markResponded} from "./inquiryLifecycle";
import {notifyInquiryPatient, notifyInquiryStaff} from "./inquiryNotify";

const UNREAD_FIELD: Record<ClinicMessageSender, "unreadForClinic" | "unreadForPatient"> = {
    clinic: "unreadForClinic",
    patient: "unreadForPatient",
};

const otherSide = (side: ClinicMessageSender): ClinicMessageSender => (side === "clinic" ? "patient" : "clinic");

/** Both sides keep talking until the inquiry closes; after conversion the clinic and its patient still do. */
function assertCanMessage(inquiry: IClinicInquiry, languageCode: string): void {
    if (!isOpenInquiry(inquiry) && inquiry.status !== "converted") {
        throw apiValidationException("inquiry_invalid_status", "", null, languageCode);
    }
}

/**
 * The inquiry's thread, oldest first, as `reader` opens it: the other side's messages are
 * marked read and the reader's unread count goes back to zero.
 */
export async function readThread(inquiry: IClinicInquiry, reader: ClinicMessageSender, ctx: ClinicCtx): Promise<IClinicMessage[]> {
    const filter = {company: inquiryCompanyId(inquiry), inquiry: inquiry._id, deletedAt: null};
    const messages = await clinicMessageService.find(filter, {session: ctx.session}, [{path: "author", select: "name surname"}, {path: "attachments", select: "originalName fileName mimeType sizeInBytes type"}], undefined, {createdAt: 1});
    const now = new Date();
    const unread = await clinicMessageService.updateMany({...filter, from: otherSide(reader), readAt: null}, {$set: {readAt: now}}, {session: ctx.session});
    if (unread.modifiedCount || inquiry[UNREAD_FIELD[reader]]) {
        inquiry[UNREAD_FIELD[reader]] = 0;
        await inquiry.save({session: ctx.session});
    }
    return messages;
}

/**
 * Adds a message to the thread. A clinic message counts as its response; a patient's
 * attachments become readable by the clinic. The other side is told after commit.
 */
export async function postInquiryMessage(
    inquiry: IClinicInquiry,
    input: {from: ClinicMessageSender; authorId: ObjectId; body: string; attachments: ObjectId[]; now?: Date},
    ctx: ClinicCtx,
): Promise<IClinicMessage> {
    assertCanMessage(inquiry, ctx.languageCode);
    const now = input.now ?? new Date();
    const companyId = inquiryCompanyId(inquiry);
    const message = await clinicMessageService.create(
        {
            company: companyId,
            inquiry: inquiry._id,
            from: input.from,
            author: input.authorId,
            body: input.body.trim(),
            attachments: input.attachments,
        },
        {session: ctx.session, logger: ctx.logger, languageCode: ctx.languageCode, auditUserId: input.authorId},
    );

    inquiry.lastMessageAt = now;
    inquiry[UNREAD_FIELD[otherSide(input.from)]] += 1;
    if (input.from === "clinic") markResponded(inquiry, now);
    await inquiry.save({session: ctx.session});

    if (input.from === "patient") {
        await shareFiles(input.attachments, [companyId], ctx);
        await notifyInquiryStaff(NotificationEventCodes.INQUIRY_MESSAGE, inquiry, ctx);
    } else {
        await notifyInquiryPatient("clinicMessage", inquiry, {}, ctx);
    }
    return message;
}
