import {emailEventType, publishEvent} from "@coreModule/kafka/kafkaProducer";
import type {serverLogger} from "@coreModule/loggers/serverLog";
import {DENTAL_CLINIC_KAFKA} from "@dentalClinicModule/environment";
import type {InquiryMessageKind, PatientMessageKind} from "@dentalClinicModule/utilities/emails/sendPatientMail";
import type {PatientAppointmentEmailEvent, PatientInquiryEmailEvent} from "./types";

type TopicKey = keyof typeof DENTAL_CLINIC_KAFKA.TOPICS;

/** Each appointment email kind's own topic (D188). */
export const APPOINTMENT_EMAIL_TOPIC_BY_KIND: Record<PatientMessageKind, TopicKey> = {
    requested: "DENTAL_APPOINTMENT_REQUESTED_EMAIL",
    confirmed: "DENTAL_APPOINTMENT_CONFIRMED_EMAIL",
    rescheduled: "DENTAL_APPOINTMENT_RESCHEDULED_EMAIL",
    cancelled: "DENTAL_APPOINTMENT_CANCELLED_EMAIL",
    reminder: "DENTAL_APPOINTMENT_REMINDER_EMAIL",
};

/** Each estimate-request email kind's own topic (D188). */
export const INQUIRY_EMAIL_TOPIC_BY_KIND: Record<InquiryMessageKind, TopicKey> = {
    requestSent: "DENTAL_INQUIRY_REQUEST_SENT_EMAIL",
    infoRequested: "DENTAL_INQUIRY_INFO_REQUESTED_EMAIL",
    clinicMessage: "DENTAL_INQUIRY_CLINIC_MESSAGE_EMAIL",
    declined: "DENTAL_INQUIRY_DECLINED_EMAIL",
    quoteReceived: "DENTAL_INQUIRY_QUOTE_RECEIVED_EMAIL",
    planAccepted: "DENTAL_INQUIRY_PLAN_ACCEPTED_EMAIL",
    depositPaid: "DENTAL_INQUIRY_DEPOSIT_PAID_EMAIL",
    tripPlanned: "DENTAL_INQUIRY_TRIP_PLANNED_EMAIL",
};

export function appointmentEmailEventType(kind: PatientMessageKind): string {
    return emailEventType(APPOINTMENT_EMAIL_TOPIC_BY_KIND[kind]);
}

export function inquiryEmailEventType(kind: InquiryMessageKind): string {
    return emailEventType(INQUIRY_EMAIL_TOPIC_BY_KIND[kind]);
}

/**
 * Publishes an appointment email on its kind's topic, keyed by the appointment.
 * @returns false when not published (see core `publishEvent`); the caller then sends it directly
 */
export function publishPatientAppointmentEmail(event: PatientAppointmentEmailEvent, log?: serverLogger): Promise<boolean> {
    return publishEvent(DENTAL_CLINIC_KAFKA.TOPICS[APPOINTMENT_EMAIL_TOPIC_BY_KIND[event.kind]], event.appointmentId, event, log);
}

/**
 * Publishes an estimate-request email on its kind's topic, keyed by the inquiry (or request group).
 * @returns false when not published (see core `publishEvent`); the caller then sends it directly
 */
export function publishPatientInquiryEmail(event: PatientInquiryEmailEvent, log?: serverLogger): Promise<boolean> {
    return publishEvent(DENTAL_CLINIC_KAFKA.TOPICS[INQUIRY_EMAIL_TOPIC_BY_KIND[event.kind]], event.recordId, event, log);
}
