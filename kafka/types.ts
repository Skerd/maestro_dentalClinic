import type {InquiryMessage, PatientMessage} from "@dentalClinicModule/utilities/emails/sendPatientMail";

/** An appointment email to the patient, on its kind's own topic (D188), already formatted in their language. */
export interface PatientAppointmentEmailEvent extends PatientMessage {
    eventType: string;
    timestamp: number;
    appointmentId: string;
}

/** An estimate-request email to a portal patient, on its kind's own topic (D188). */
export interface PatientInquiryEmailEvent extends InquiryMessage {
    eventType: string;
    timestamp: number;
    /** The sending company (`senderCompanyId`), whose mail servers and data the consumer works with. */
    companyId: string;
    /** The inquiry, or the request group for a request sent to several clinics: its emails keep their order. */
    recordId: string;
}
