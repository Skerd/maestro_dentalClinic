/**
 * D188: every patient email kind (5 appointment, 8 estimate request) goes through its own Kafka topic, and is sent
 * directly when the publish fails.
 */
import {beforeEach, describe, expect, it, vi} from "vitest";

const {published, publishResult, sent, specs} = vi.hoisted(() => ({
    published: [] as {topic: string | undefined; key: string; event: {eventType: string}}[],
    publishResult: {value: true},
    sent: [] as {mail: string; kind: string}[],
    specs: [] as {topic?: string; groupId?: string; expectedEventType: string}[],
}));

vi.mock("@dentalClinicModule/environment", async (importOriginal) => {
    const {DENTAL_CLINIC_KAFKA} = await importOriginal<typeof import("@dentalClinicModule/environment")>();
    const keys = Object.keys(DENTAL_CLINIC_KAFKA.TOPICS);
    return {
        DENTAL_CLINIC_KAFKA: {
            TOPICS: Object.fromEntries(keys.map((key) => [key, `topic-${key}`])),
            CONSUMER_GROUP: Object.fromEntries(keys.map((key) => [key, `group-${key}`])),
        },
    };
});
vi.mock("@coreModule/environment", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@coreModule/environment")>();
    return {...actual, KAFKA: {...actual.KAFKA, ENABLED: true}};
});
vi.mock("@coreModule/kafka/kafkaProducer", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@coreModule/kafka/kafkaProducer")>()),
    publishEvent: vi.fn(async (topic: string | undefined, key: string, event: {eventType: string}) => {
        published.push({topic, key, event});
        return publishResult.value;
    }),
}));
vi.mock("@coreModule/kafka/kafkaConsumer", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@coreModule/kafka/kafkaConsumer")>()),
    startKafkaTopicConsumers: vi.fn(async (_parent: unknown, _log: unknown, given: typeof specs) => {
        specs.push(...given);
    }),
}));
vi.mock("@dentalClinicModule/utilities/emails/sendPatientMail", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@dentalClinicModule/utilities/emails/sendPatientMail")>()),
    sendPatientMail: vi.fn(async (mail: {kind: string}) => {
        sent.push({mail: "appointment", kind: mail.kind});
    }),
    sendInquiryMail: vi.fn(async (mail: {kind: string}) => {
        sent.push({mail: "inquiry", kind: mail.kind});
    }),
}));

import {dispatchPatientAppointmentEmail, dispatchPatientInquiryEmail} from "@dentalClinicModule/utilities/emails/patientEmailDispatch";
import {
    APPOINTMENT_EMAIL_TOPIC_BY_KIND,
    appointmentEmailEventType,
    INQUIRY_EMAIL_TOPIC_BY_KIND,
    inquiryEmailEventType,
} from "@dentalClinicModule/kafka/kafkaProducer";
import {startDentalClinicKafkaConsumers} from "@dentalClinicModule/kafka/kafkaConsumer";
import type {InquiryMessageKind, PatientMessageKind} from "@dentalClinicModule/utilities/emails/sendPatientMail";

const APPOINTMENT_KINDS = Object.keys(APPOINTMENT_EMAIL_TOPIC_BY_KIND) as PatientMessageKind[];
const INQUIRY_KINDS = Object.keys(INQUIRY_EMAIL_TOPIC_BY_KIND) as InquiryMessageKind[];

const appointment = (kind: PatientMessageKind) => ({
    eventType: appointmentEmailEventType(kind),
    timestamp: Date.now(),
    appointmentId: "a1",
    kind,
    companyId: "c1",
    companyName: "Smile",
    languageCode: "sq-AL",
    email: "ann@example.com",
    fullName: "Ann Lee",
    number: "AP-1",
    when: "Monday",
    practitionerName: "Dr. Kola",
    location: "Tirana",
    manageToken: "token",
    manageUrl: "https://smile.example/dentists/manage",
});

const inquiry = (kind: InquiryMessageKind) => ({
    eventType: inquiryEmailEventType(kind),
    timestamp: Date.now(),
    companyId: "c1",
    recordId: "i1",
    kind,
    senderCompanyId: "c1",
    companyName: "Smile",
    languageCode: "sq-AL",
    email: "ann@example.com",
    fullName: "Ann Lee",
    caseUrl: "https://portal.example/account?case=g1",
});

beforeEach(() => {
    published.length = 0;
    sent.length = 0;
    specs.length = 0;
    publishResult.value = true;
});

describe("patient emails on Kafka (D188)", () => {
    it("publishes each of the 13 kinds on its own topic and sends nothing directly", async () => {
        for (const kind of APPOINTMENT_KINDS) await dispatchPatientAppointmentEmail(appointment(kind));
        for (const kind of INQUIRY_KINDS) await dispatchPatientInquiryEmail(inquiry(kind));

        const keys = [...APPOINTMENT_KINDS.map((kind) => APPOINTMENT_EMAIL_TOPIC_BY_KIND[kind]), ...INQUIRY_KINDS.map((kind) => INQUIRY_EMAIL_TOPIC_BY_KIND[kind])];
        expect(keys).toHaveLength(13);
        expect(published.map((p) => p.topic)).toEqual(keys.map((key) => `topic-${key}`));
        expect(published.map((p) => p.event.eventType)).toEqual(keys.map((key) => key.toLowerCase()));
        expect(published.map((p) => p.key)).toEqual([...APPOINTMENT_KINDS.map(() => "a1"), ...INQUIRY_KINDS.map(() => "i1")]);
        expect(sent).toEqual([]);
    });

    it("sends it directly when it is not published", async () => {
        publishResult.value = false;
        await dispatchPatientAppointmentEmail(appointment("reminder"));
        await dispatchPatientInquiryEmail(inquiry("quoteReceived"));

        expect(sent).toEqual([{mail: "appointment", kind: "reminder"}, {mail: "inquiry", kind: "quoteReceived"}]);
    });

    it("starts one consumer per kind, each on its own topic and group", async () => {
        await startDentalClinicKafkaConsumers();

        expect(specs).toHaveLength(13);
        expect(new Set(specs.map((spec) => spec.topic)).size).toBe(13);
        expect(specs.every((spec) => spec.groupId === spec.topic?.replace("topic-", "group-"))).toBe(true);
    });
});
