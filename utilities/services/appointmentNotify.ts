import type {ClientSession} from "mongoose";
import Company from "@coreModule/database/schemas/company/company";
import {emitNotificationEvent} from "@coreModule/domain/notifications/notificationEventBus";
import {nestedEntityToRef} from "@coreModule/utilities/mappers/common.mapper";
import {runAfterCommit} from "@coreModule/utilities/middlewares/transactionUtils";
import {generateRecordAccessToken} from "@coreModule/utilities/security/recordAccessToken";
import {sendMessagingNotification} from "@coreModule/utilities/messaging/messagingDispatchService";
import {APPOINTMENT_LINK_PURPOSE} from "armonia/src/modules/dentalClinic/api/dentalClinic/private/appointment/appointment.constants";
import type {IAppointment} from "@dentalClinicModule/database/schemas/appointment/appointment";
import {clinicConfigService} from "@dentalClinicModule/database/schemas/clinicConfig/clinicConfig.service";
import {NotificationEventCodes} from "@dentalClinicModule/domain/notifications/notificationEventCodes";
import {sendPatientMail, patientSmsText, type PatientMessageKind} from "@dentalClinicModule/utilities/emails/sendPatientMail";
import {portalSlug} from "@coreModule/utilities/marketing/portalCompanies";

function formatLocal(date: Date, timeZone: string, languageCode: string): string {
    return new Intl.DateTimeFormat(languageCode, {timeZone, dateStyle: "full", timeStyle: "short"}).format(date);
}

/** A fresh guest link for the appointment's current version. */
export function manageTokenFor(appointment: IAppointment): string {
    return generateRecordAccessToken({
        purpose: APPOINTMENT_LINK_PURPOSE,
        companyId: nestedEntityToRef(appointment.company),
        recordId: appointment._id,
        version: appointment.manageTokenVersion,
    });
}

/**
 * Tells the patient about their appointment once the caller's transaction has
 * committed (right away without one): an email, plus a text for reminders when
 * the clinic turned that on. Messages say when, where and with whom; the
 * treatment is named only if the clinic opted in, since it can reveal a condition.
 */
export async function notifyPatient(
    kind: PatientMessageKind,
    appointment: IAppointment,
    ctx: {session?: ClientSession | null; languageCode: string},
): Promise<void> {
    await runAfterCommit(ctx.session, async () => {
        const companyId = nestedEntityToRef(appointment.company);
        const [company, config] = await Promise.all([
            Company.findById(companyId).select("name shopSlug"),
            clinicConfigService.findForCompany(companyId, {languageCode: ctx.languageCode}),
        ]);
        const {snapshot, patient} = appointment;
        const message = {
            kind,
            companyId: String(companyId),
            companyName: company?.name ?? "",
            languageCode: ctx.languageCode,
            email: patient.email,
            fullName: `${patient.firstName} ${patient.lastName}`.trim(),
            number: appointment.number,
            when: formatLocal(appointment.startAt, snapshot.timezone, ctx.languageCode),
            practitionerName: snapshot.practitionerName,
            location: [snapshot.locationName, snapshot.locationAddress].filter(Boolean).join(", "),
            serviceName: config?.includeServiceInMessages ? snapshot.serviceName : undefined,
            manageToken: manageTokenFor(appointment),
            portalSlug: appointment.bookedVia === "portal" && company ? portalSlug(company) : undefined,
        };
        await sendPatientMail(message);
        if (kind === "reminder" && config?.reminderSms && patient.phone) {
            await sendMessagingNotification({to: patient.phone, body: patientSmsText(message), channel: "sms", companyId});
        }
    });
}

/** In-app alert to the staff listed in the clinic settings. */
export async function notifyClinicStaff(
    code: (typeof NotificationEventCodes)[keyof typeof NotificationEventCodes],
    appointment: IAppointment,
    ctx: {session?: ClientSession | null; languageCode: string},
): Promise<void> {
    const companyId = nestedEntityToRef(appointment.company);
    const config = await clinicConfigService.findForCompany(companyId, {languageCode: ctx.languageCode});
    const receiverIds = (config?.notifyUsers ?? []).map((user) => String(nestedEntityToRef(user)));
    if (!receiverIds.length) return;
    await runAfterCommit(ctx.session, async () => {
        emitNotificationEvent(code, {
            receiverIds,
            payload: {
                companyId: String(companyId),
                languageCode: ctx.languageCode,
                appointmentId: appointment._id.toString(),
                number: appointment.number,
                when: formatLocal(appointment.startAt, appointment.snapshot.timezone, ctx.languageCode),
            },
        });
    });
}
