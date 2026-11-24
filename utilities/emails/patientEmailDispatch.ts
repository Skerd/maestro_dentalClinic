import type {serverLogger} from "@coreModule/loggers/serverLog";
import {sendInquiryMail, sendPatientMail} from "@dentalClinicModule/utilities/emails/sendPatientMail";
import {publishPatientAppointmentEmail, publishPatientInquiryEmail} from "@dentalClinicModule/kafka/kafkaProducer";
import type {PatientAppointmentEmailEvent, PatientInquiryEmailEvent} from "@dentalClinicModule/kafka/types";

/**
 * Hands an appointment email to its kind's Kafka topic, so it survives a restart and is retried (D188); sends it
 * directly when Kafka is off or the publish fails.
 */
export async function dispatchPatientAppointmentEmail(event: PatientAppointmentEmailEvent, log?: serverLogger): Promise<void> {
    if (!(await publishPatientAppointmentEmail(event, log))) await sendPatientMail(event);
}

/** Same for an estimate-request email (D188). */
export async function dispatchPatientInquiryEmail(event: PatientInquiryEmailEvent, log?: serverLogger): Promise<void> {
    if (!(await publishPatientInquiryEmail(event, log))) await sendInquiryMail(event);
}
