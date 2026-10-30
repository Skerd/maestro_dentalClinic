import type {ClientSession} from "mongoose";
import Company from "@coreModule/database/schemas/company/company";
import User from "@coreModule/database/schemas/user/user";
import {clientHostFor} from "@coreModule/environment";
import {emitNotificationEvent} from "@coreModule/domain/notifications/notificationEventBus";
import {nestedEntityToRef} from "@coreModule/utilities/mappers/common.mapper";
import {runAfterCommit} from "@coreModule/utilities/middlewares/transactionUtils";
import type {IClinicInquiry} from "@dentalClinicModule/database/schemas/clinicInquiry/clinicInquiry";
import {clinicConfigService} from "@dentalClinicModule/database/schemas/clinicConfig/clinicConfig.service";
import {NotificationEventCodes} from "@dentalClinicModule/domain/notifications/notificationEventCodes";
import {sendInquiryMail, type InquiryMessage, type InquiryMessageKind} from "@dentalClinicModule/utilities/emails/sendPatientMail";

type NotifyCtx = {session?: ClientSession | null; languageCode: string};

/** The patient's case on the portal, behind their login. */
export function patientCaseUrl(requestGroup: string): string {
    return `${clientHostFor("portal")}/account?case=${encodeURIComponent(requestGroup)}`;
}

/** Where to write to a portal patient: the email they gave, else their account's. */
async function patientEmail(inquiry: IClinicInquiry): Promise<string | undefined> {
    if (inquiry.contact.email) return inquiry.contact.email;
    const accountId = nestedEntityToRef(inquiry.account);
    if (!accountId) return undefined;
    const account = await User.findById(accountId).select("username");
    return account?.username;
}

/**
 * In-app alert to the clinic's request watchers and the assignee, after the caller's
 * transaction commits. It carries the reference only, never health details.
 */
export async function notifyInquiryStaff(
    code: (typeof NotificationEventCodes)[keyof typeof NotificationEventCodes],
    inquiry: IClinicInquiry,
    ctx: NotifyCtx,
): Promise<void> {
    const companyId = nestedEntityToRef(inquiry.company);
    const config = await clinicConfigService.findForCompany(companyId, {languageCode: ctx.languageCode});
    const assignee = nestedEntityToRef(inquiry.assignedTo);
    const receiverIds = [...new Set([
        ...(config?.inquiryNotifyUsers ?? []).map((user) => String(nestedEntityToRef(user))),
        ...(assignee ? [String(assignee)] : []),
    ])];
    if (!receiverIds.length) return;
    await runAfterCommit(ctx.session, async () => {
        emitNotificationEvent(code, {
            receiverIds,
            payload: {
                companyId: String(companyId),
                languageCode: ctx.languageCode,
                inquiryId: inquiry._id.toString(),
                number: inquiry.number,
            },
        });
    });
}

/**
 * Email to a portal patient about their request at one clinic, after the caller's transaction
 * commits. Leads the clinic entered itself have no portal case, so nothing is sent for them.
 */
export async function notifyInquiryPatient(
    kind: Exclude<InquiryMessageKind, "requestSent">,
    inquiry: IClinicInquiry,
    extra: Pick<InquiryMessage, "requested" | "note">,
    ctx: NotifyCtx,
): Promise<void> {
    if (!inquiry.requestGroup) return;
    const requestGroup = inquiry.requestGroup;
    await runAfterCommit(ctx.session, async () => {
        const companyId = nestedEntityToRef(inquiry.company);
        const [company, email] = await Promise.all([Company.findById(companyId).select("name"), patientEmail(inquiry)]);
        if (!company || !email) return;
        await sendInquiryMail({
            kind,
            senderCompanyId: String(companyId),
            companyName: company.name,
            languageCode: inquiry.contact.preferredLanguage,
            email,
            fullName: `${inquiry.contact.firstName} ${inquiry.contact.lastName}`.trim(),
            number: inquiry.number,
            ...extra,
            caseUrl: patientCaseUrl(requestGroup),
        });
    });
}

/** One confirmation for a request sent to several clinics, from the platform. */
export async function notifyRequestSent(
    inquiries: IClinicInquiry[],
    platform: {companyId: string; name: string},
    ctx: NotifyCtx,
): Promise<void> {
    const [first] = inquiries;
    if (!first?.requestGroup) return;
    const requestGroup = first.requestGroup;
    await runAfterCommit(ctx.session, async () => {
        const [clinics, email] = await Promise.all([
            Company.find({_id: {$in: inquiries.map((inquiry) => nestedEntityToRef(inquiry.company))}}).select("name").sort({name: 1}),
            patientEmail(first),
        ]);
        if (!email) return;
        await sendInquiryMail({
            kind: "requestSent",
            senderCompanyId: platform.companyId,
            companyName: platform.name,
            languageCode: first.contact.preferredLanguage,
            email,
            fullName: `${first.contact.firstName} ${first.contact.lastName}`.trim(),
            clinics: clinics.map((clinic) => clinic.name),
            caseUrl: patientCaseUrl(requestGroup),
        });
    });
}
