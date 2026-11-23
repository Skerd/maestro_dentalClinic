import {
    ERASED_EMAIL,
    ERASED_FIRST_NAME,
    ERASED_LAST_NAME,
    ERASED_NAME,
    ERASED_PHONE,
    objectIds as ids,
    registerPersonEraser,
    type ErasureContext,
    type ErasureCount,
} from "@coreModule/utilities/erasure/personErasure";
import {patientService} from "@dentalClinicModule/database/schemas/patient/patient.service";
import {clinicInquiryService} from "@dentalClinicModule/database/schemas/clinicInquiry/clinicInquiry.service";
import {clinicMessageService} from "@dentalClinicModule/database/schemas/clinicMessage/clinicMessage.service";
import {appointmentService} from "@dentalClinicModule/database/schemas/appointment/appointment.service";
import {patientTripService} from "@dentalClinicModule/database/schemas/patientTrip/patientTrip.service";
import {treatmentPlanService} from "@dentalClinicModule/database/schemas/treatmentPlan/treatmentPlan.service";
import {clinicReviewService} from "@dentalClinicModule/database/schemas/clinicReview/clinicReview.service";


/**
 * A dental clinic's records of one person (D57): patient folders and appointments stay, anonymised (treatment plans
 * keep pointing at the anonymised folder, with their amounts); medical histories, request X-rays/photos and the
 * message threads are deleted for good; travel plans are deleted. An accepted plan keeps its proof of acceptance
 * (content hash and time) but not the signer: the name is replaced and the IP and browser removed (D89). Reviews of
 * their appointments keep their rating under an erased name.
 */
async function eraseDentalClinicPerson(ctx: ErasureContext): Promise<ErasureCount[]> {
    const {companyId, subject, preview, session} = ctx;
    const found = {session, withDeleted: true};

    const patients = await patientService.find({company: companyId, $or: [{account: {$in: subject.accountIds}}, {email: {$in: subject.emails}}]}, found, undefined, "_id");
    const patientIds = ids(patients);
    const inquiries = await clinicInquiryService.find({
        company: companyId,
        $or: [{account: {$in: subject.accountIds}}, {"contact.email": {$in: subject.emails}}, {patient: {$in: patientIds}}],
    }, found); // whole documents: code reading them is not a person opening the X-rays (no READ audit)
    const inquiryIds = ids(inquiries);
    const messages = inquiryIds.length > 0 ? await clinicMessageService.find({company: companyId, inquiry: {$in: inquiryIds}}, found, undefined, "_id attachments") : [];
    const appointments = await appointmentService.find({
        company: companyId,
        $or: [{customer: {$in: subject.accountIds}}, {"patient.email": {$in: subject.emails}}, {patientRecord: {$in: patientIds}}],
    }, found, undefined, "_id");
    const reviews = appointments.length > 0
        ? await clinicReviewService.find({company: companyId, appointment: {$in: ids(appointments)}}, found, undefined, "_id")
        : [];
    const trips = patientIds.length > 0 ? await patientTripService.find({company: companyId, patient: {$in: patientIds}}, found, undefined, "_id") : [];
    const signedPlans = patientIds.length > 0 || inquiryIds.length > 0
        ? await treatmentPlanService.find({
            company: companyId,
            acceptance: {$exists: true},
            $or: [{patient: {$in: patientIds}}, {inquiry: {$in: inquiryIds}}],
        }, found, undefined, "_id")
        : [];

    const counts: ErasureCount[] = [
        {collection: "patients", anonymised: patients.length, deleted: 0},
        {collection: "clinicinquiries", anonymised: inquiries.length, deleted: 0},
        {collection: "clinicmessages", anonymised: 0, deleted: messages.length},
        {collection: "appointments", anonymised: appointments.length, deleted: 0},
        {collection: "clinicreviews", anonymised: reviews.length, deleted: 0},
        {collection: "patienttrips", anonymised: 0, deleted: trips.length},
        {collection: "treatmentplans", anonymised: signedPlans.length, deleted: 0},
    ];
    ctx.deleteMedia([
        ...inquiries.flatMap((inquiry) => ids(inquiry.files)),
        ...messages.flatMap((message) => ids(message.attachments)),
    ]);
    if (preview) return counts;

    if (patientIds.length > 0) {
        await patientService.eraseFields({company: companyId, _id: {$in: patientIds}}, {
            $set: {firstName: ERASED_FIRST_NAME, lastName: ERASED_LAST_NAME},
            $unset: {email: "", phone: "", whatsapp: "", dateOfBirth: "", address: "", emergencyContact: "", homeDentist: "", notes: "", tags: "", account: "", medicalHistory: ""},
        }, {session});
        ctx.scrubAudit("patients", patientIds, ["firstName", "lastName", "email", "phone", "whatsapp", "dateOfBirth", "address", "emergencyContact", "homeDentist", "notes", "tags", "account", "medicalHistory"]);
    }
    if (inquiryIds.length > 0) {
        await clinicInquiryService.eraseFields({company: companyId, _id: {$in: inquiryIds}}, {
            $set: {"contact.firstName": ERASED_FIRST_NAME, "contact.lastName": ERASED_LAST_NAME, files: []},
            $unset: {"contact.email": "", "contact.phone": "", "contact.whatsapp": "", description: "", account: "", medicalHistory: ""},
        }, {session});
        ctx.scrubAudit("clinicinquiries", inquiryIds, ["contact", "description", "account", "medicalHistory", "files"]);
    }
    if (messages.length > 0) {
        await clinicMessageService.deleteMany({company: companyId, _id: {$in: ids(messages)}}, {session, hard: true});
        ctx.scrubAudit("clinicmessages", ids(messages), "all");
    }
    if (appointments.length > 0) {
        const appointmentIds = ids(appointments);
        await appointmentService.eraseFields({company: companyId, _id: {$in: appointmentIds}}, {
            $set: {"patient.firstName": ERASED_FIRST_NAME, "patient.lastName": ERASED_LAST_NAME, "patient.email": ERASED_EMAIL, "patient.phone": ERASED_PHONE},
            $unset: {customer: "", note: ""},
        }, {session});
        ctx.scrubAudit("appointments", appointmentIds, ["patient", "customer", "note"]);
    }
    if (reviews.length > 0) {
        await clinicReviewService.eraseFields({company: companyId, _id: {$in: ids(reviews)}}, {$set: {authorName: ERASED_NAME}}, {session});
        ctx.scrubAudit("clinicreviews", ids(reviews), ["authorName"]);
    }
    if (signedPlans.length > 0) {
        await treatmentPlanService.eraseFields({company: companyId, _id: {$in: ids(signedPlans)}}, {
            $set: {"acceptance.name": ERASED_NAME},
            $unset: {"acceptance.ip": "", "acceptance.userAgent": ""},
        }, {session});
        ctx.scrubAudit("treatmentplans", ids(signedPlans), ["acceptance"]);
    }
    if (trips.length > 0) {
        await patientTripService.deleteMany({company: companyId, _id: {$in: ids(trips)}}, {session, hard: true});
        ctx.scrubAudit("patienttrips", ids(trips), "all");
    }
    return counts;
}

export function registerDentalClinicPersonErasers(): void {
    registerPersonEraser({module: "dentalClinic", erase: eraseDentalClinicPerson});
}
