import type {ObjectId} from "mongodb";
import type {ReportableDefinition} from "@coreModule/domain/reports/reportables";
import {portalCompanyRefs} from "@coreModule/utilities/marketing/portalCompanies";
import {nestedEntityToRef} from "@coreModule/utilities/mappers/common.mapper";
import {clinicServiceService} from "@dentalClinicModule/database/schemas/clinicService/clinicService.service";
import {clinicReviewService} from "@dentalClinicModule/database/schemas/clinicReview/clinicReview.service";
import {appointmentService} from "@dentalClinicModule/database/schemas/appointment/appointment.service";
import ClinicService from "@dentalClinicModule/database/schemas/clinicService/clinicService";
import ClinicReview from "@dentalClinicModule/database/schemas/clinicReview/clinicReview";
import {CLINIC_REVIEW_REPORT_KIND} from "armonia/src/modules/dentalClinic/api/dentalClinic/private/clinicReview/clinicReview.dto";

/** How much of a review's words the report desk shows as its title. */
const REVIEW_EXCERPT_MAX = 80;

/** A page of the clinic's site on the portal (`sitePath` of the dentists portal provider): its home, or a treatment. */
async function clinicSitePath(companyId: ObjectId, page = ""): Promise<string | undefined> {
    const company = (await portalCompanyRefs([companyId])).get(companyId.toString());
    return company ? `/dentists/${company.slug}${page}` : undefined;
}

/** A review as the report desk names it: its stars and the start of its words, else who wrote it. */
function reviewTitle(review: {rating: number; comment?: string; authorName: string}): string {
    const words = review.comment?.trim();
    const excerpt = words && words.length > REVIEW_EXCERPT_MAX ? `${words.slice(0, REVIEW_EXCERPT_MAX - 1)}…` : words;
    return `${"★".repeat(review.rating)} ${excerpt || review.authorName}`;
}

/**
 * What people can report to the platform about dental clinics (D191): a treatment the portal and the clinic's site show,
 * and a patient's review of the clinic. Hiding either takes it off every public page and, for a review, out of every
 * rating. A review never carries anything about the patient's health (SEC-06), so neither does its snapshot.
 */
export const dentalClinicReportables: ReportableDefinition[] = [
    {
        kind: "dentalClinic.treatment",
        typeLabel: {
            "en-US": "Dental treatment",
            "de-CH": "Zahnbehandlung",
            "fr-FR": "Soin dentaire",
            "it-IT": "Trattamento dentale",
            "sq-AL": "Trajtim dentar",
        },
        snapshot: async ({recordId, session}) => {
            const service = await clinicServiceService.findReportable(recordId, session);
            if (!service) return null;
            return {
                title: service.name,
                companyId: service.company,
                url: await clinicSitePath(service.company, `/treatments/${service.slug || service._id.toString()}`),
                hidden: service.hiddenByPlatform === true,
            };
        },
        model: ClinicService,
    },
    {
        kind: CLINIC_REVIEW_REPORT_KIND,
        typeLabel: {
            "en-US": "Dental clinic review",
            "de-CH": "Bewertung einer Zahnarztpraxis",
            "fr-FR": "Avis sur un cabinet dentaire",
            "it-IT": "Recensione di uno studio dentistico",
            "sq-AL": "Vlerësim për klinikën dentare",
        },
        snapshot: async ({recordId, session}) => {
            const review = await clinicReviewService.findReportable(recordId, session);
            if (!review) return null;
            // The appointment names the patient's account, when they booked signed in.
            const appointment = await appointmentService.findOne({_id: review.appointment}, {session}, undefined, "customer");
            const authorAccountId = nestedEntityToRef(appointment?.customer);
            return {
                title: reviewTitle(review),
                companyId: review.company,
                ...(authorAccountId ? {authorAccountId} : {}),
                // Reviews rate the clinic, and its site's home page lists them.
                url: await clinicSitePath(review.company),
                hidden: review.hiddenByPlatform === true,
            };
        },
        // Ratings are counted when they are read, so hiding the review takes it out of them at once.
        model: ClinicReview,
    },
];
