import {ObjectId} from "mongodb";
import {type NotificationEvent, notificationEventBus} from "@coreModule/domain/notifications/notificationEventBus";
import {createAndPushNotification} from "@coreModule/domain/notifications/notificationDomainService";
import {NotificationImportance} from "@coreModule/database/schemas/notification/notification";
import {NotificationCategory} from "armonia/src/modules/core/api/user/private/notifications/notifications.enum";
import {NotificationEventCodes} from "@dentalClinicModule/domain/notifications/notificationEventCodes";
import {getLogger} from "@coreModule/loggers/serverLog";

const logger = getLogger("dentalClinic_notifications");

type ClinicCode = (typeof NotificationEventCodes)[keyof typeof NotificationEventCodes];

// Staff alerts carry the reference (and booking time) only, never patient or treatment details.
const DESCRIPTIONS: Record<ClinicCode, (payload: Record<string, unknown>) => string> = {
    [NotificationEventCodes.APPOINTMENT_NEW]: (p) => `New appointment ${p.number ?? ""} on ${p.when ?? ""}`,
    [NotificationEventCodes.APPOINTMENT_CANCELLED]: (p) => `Appointment ${p.number ?? ""} on ${p.when ?? ""} was cancelled by the patient`,
    [NotificationEventCodes.INQUIRY_NEW]: (p) => `New estimate request ${p.number ?? ""}`,
    [NotificationEventCodes.INQUIRY_MESSAGE]: (p) => `New patient message on request ${p.number ?? ""}`,
    [NotificationEventCodes.INQUIRY_FILES_ADDED]: (p) => `The patient added files to request ${p.number ?? ""}`,
    [NotificationEventCodes.INQUIRY_MEDICAL_HISTORY]: (p) => `The patient filled in the medical history for request ${p.number ?? ""}`,
    [NotificationEventCodes.INQUIRY_WITHDRAWN]: (p) => `Request ${p.number ?? ""} was withdrawn by the patient`,
    [NotificationEventCodes.INQUIRY_UNANSWERED]: (p) => `Request ${p.number ?? ""} is still unanswered`,
    [NotificationEventCodes.INQUIRY_CHOSE_ANOTHER_CLINIC]: (p) => `The patient of request ${p.number ?? ""} chose another clinic`,
    [NotificationEventCodes.PLAN_ACCEPTED]: (p) => `The patient accepted your quote on request ${p.number ?? ""}`,
    [NotificationEventCodes.DEPOSIT_PAID]: (p) => `The patient paid the deposit on request ${p.number ?? ""}`,
    [NotificationEventCodes.TRIP_DETAILS_ADDED]: (p) => `The patient added flight or hotel details on request ${p.number ?? ""}`,
};

/** What the notification opens: the appointment or the estimate request. */
function contentOf(payload: Record<string, unknown>): Record<string, unknown> {
    return payload.inquiryId
        ? {inquiryId: payload.inquiryId, number: payload.number}
        : {appointmentId: payload.appointmentId, number: payload.number};
}

function bindHandler(code: ClinicCode): void {
    notificationEventBus.on(code, async (event: NotificationEvent) => {
        const {receiverIds, payload} = event;
        for (const receiverId of receiverIds) {
            try {
                await createAndPushNotification(
                    {
                        receiver: new ObjectId(receiverId),
                        company: new ObjectId(payload.companyId as string),
                        code,
                        description: DESCRIPTIONS[code](payload),
                        content: contentOf(payload),
                        importance: NotificationImportance.HIGH,
                        category: NotificationCategory.SYSTEM,
                    },
                    {languageCode: (payload.languageCode as string) ?? "en-US"},
                );
            } catch (error) {
                logger.err(`Failed to create ${code} notification for ${receiverId}:`, error);
            }
        }
    });
}

export function registerDentalClinicNotificationHandlers(): void {
    for (const code of Object.values(NotificationEventCodes)) bindHandler(code);
}
