import {KAFKA} from "@coreModule/environment";
import {emailTopicSpec, startKafkaTopicConsumers} from "@coreModule/kafka/kafkaConsumer";
import {getLogger, serverLogger} from "@coreModule/loggers/serverLog";
import {DENTAL_CLINIC_KAFKA} from "@dentalClinicModule/environment";
import {sendPatientMail, sendInquiryMail} from "@dentalClinicModule/utilities/emails/sendPatientMail";
import {APPOINTMENT_EMAIL_TOPIC_BY_KIND, INQUIRY_EMAIL_TOPIC_BY_KIND} from "./kafkaProducer";
import type {PatientAppointmentEmailEvent, PatientInquiryEmailEvent} from "./types";

/** One consumer per patient email kind (D188), each on its own topic; the kafkaServer starts them. */
export async function startDentalClinicKafkaConsumers(parentLogger?: serverLogger): Promise<void> {
    const log = getLogger("dentalClinic_kafka_consumers", parentLogger);
    if (!KAFKA.ENABLED) {
        log.warn("Kafka is disabled; skipping dental clinic consumers.");
        return;
    }
    log.start("Starting dental clinic Kafka consumers");
    const specs = [
        ...Object.values(APPOINTMENT_EMAIL_TOPIC_BY_KIND).map((topicKey) =>
            emailTopicSpec(DENTAL_CLINIC_KAFKA, topicKey, (event) => sendPatientMail(event as PatientAppointmentEmailEvent))),
        ...Object.values(INQUIRY_EMAIL_TOPIC_BY_KIND).map((topicKey) =>
            emailTopicSpec(DENTAL_CLINIC_KAFKA, topicKey, (event) => sendInquiryMail(event as PatientInquiryEmailEvent))),
    ];
    await startKafkaTopicConsumers(parentLogger, log, specs);
    log.finish("Dental clinic Kafka consumers startup pass complete");
}
