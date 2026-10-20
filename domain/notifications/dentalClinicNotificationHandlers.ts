import {ObjectId} from "mongodb";
import {type NotificationEvent, notificationEventBus} from "@coreModule/domain/notifications/notificationEventBus";
import {createAndPushNotification} from "@coreModule/domain/notifications/notificationDomainService";
import {NotificationImportance} from "@coreModule/database/schemas/notification/notification";
import {NotificationCategory} from "armonia/src/modules/core/api/user/private/notifications/notifications.enum";
import {NotificationEventCodes} from "@dentalClinicModule/domain/notifications/notificationEventCodes";

type ClinicCode = (typeof NotificationEventCodes)[keyof typeof NotificationEventCodes];

// Staff alerts carry the booking number and time only, never patient or treatment details.
const DESCRIPTIONS: Record<ClinicCode, (payload: Record<string, unknown>) => string> = {
    [NotificationEventCodes.APPOINTMENT_NEW]: (p) => `New appointment ${p.number ?? ""} on ${p.when ?? ""}`,
    [NotificationEventCodes.APPOINTMENT_CANCELLED]: (p) => `Appointment ${p.number ?? ""} on ${p.when ?? ""} was cancelled by the patient`,
};

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
                        content: {appointmentId: payload.appointmentId, number: payload.number},
                        importance: NotificationImportance.HIGH,
                        category: NotificationCategory.SYSTEM,
                    },
                    {languageCode: (payload.languageCode as string) ?? "en-US"},
                );
            } catch (error) {
                console.error(`Failed to create ${code} notification for ${receiverId}:`, error);
            }
        }
    });
}

export function registerDentalClinicNotificationHandlers(): void {
    bindHandler(NotificationEventCodes.APPOINTMENT_NEW);
    bindHandler(NotificationEventCodes.APPOINTMENT_CANCELLED);
}
