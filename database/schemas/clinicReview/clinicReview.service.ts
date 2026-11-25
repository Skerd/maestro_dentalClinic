import type {ObjectId} from "mongodb";
import {BaseCrudService, type CrudOptions} from "@coreModule/database/services/baseCrudService";
import {apiValidationException} from "armonia/src/modules/core/helpers/exceptions";
import type {IAppointment} from "@dentalClinicModule/database/schemas/appointment/appointment";
import ClinicReview, {IClinicReview} from "./clinicReview";
import {publicPersonName} from "@coreModule/utilities/helpers/publicName";

type PublishedReview = {rating: number; comment?: string; authorName: string; createdAt: Date};

export class ClinicReviewService extends BaseCrudService<IClinicReview, typeof ClinicReview> {
    constructor() {
        super(ClinicReview, "ClinicReview");
    }

    /** Each clinic's published reviews, for the portal's treatment cards (D178): the average out of 5 and how many. */
    async publishedRatingsByCompany(companyIds: ObjectId[]): Promise<Map<string, {average: number; count: number}>> {
        if (companyIds.length === 0) return new Map();
        const rows: {_id: ObjectId; average: number; count: number}[] = await this.aggregate([
            {$match: {company: {$in: companyIds}, isPublished: true, deletedAt: null}},
            {$group: {_id: "$company", average: {$avg: "$rating"}, count: {$sum: 1}}},
        ]);
        return new Map(rows.map((row) => [String(row._id), {average: row.average, count: row.count}]));
    }

    /** One clinic's published reviews (D178): the average, how many, and the latest `limit`, newest first. */
    async publishedForCompany(companyId: ObjectId, limit: number): Promise<{average: number; count: number; reviews: PublishedReview[]}> {
        const [row]: {stats: {average: number; count: number}[]; latest: PublishedReview[]}[] = await this.aggregate([
            {$match: {company: companyId, isPublished: true, deletedAt: null}},
            {$sort: {createdAt: -1}},
            {$facet: {
                stats: [{$group: {_id: null, average: {$avg: "$rating"}, count: {$sum: 1}}}],
                latest: [{$limit: limit}, {$project: {_id: 0, rating: 1, comment: 1, authorName: 1, createdAt: 1}}],
            }},
        ]);
        const stats = row?.stats[0];
        return {average: stats ? Math.round(stats.average * 10) / 10 : 0, count: stats?.count ?? 0, reviews: row?.latest ?? []};
    }

    /**
     * The patient's one review of their appointment, from the emailed link (D178): only once the visit took place,
     * and only once. It waits for staff to publish it.
     */
    async writeForAppointment(
        company: ObjectId,
        appointment: IAppointment,
        input: {rating: number; comment?: string},
        options: CrudOptions & {languageCode: string},
    ): Promise<IClinicReview> {
        assertAppointmentReviewable(appointment, options.languageCode);
        if (await this.exists({company, appointment: appointment._id, deletedAt: null}, options)) {
            throw apiValidationException("clinicReview_already_exists", "", null, options.languageCode);
        }
        return this.create({
            company,
            appointment: appointment._id,
            rating: input.rating,
            comment: input.comment,
            authorName: reviewAuthorName(appointment.patient),
            isPublished: false,
        }, options);
    }
}

export const clinicReviewService = new ClinicReviewService();

/** A review belongs to a visit that took place: a completed appointment. */
function assertAppointmentReviewable(appointment: Pick<IAppointment, "status">, languageCode: string): void {
    if (appointment.status !== "completed") throw apiValidationException("clinic_review_not_open", "", null, languageCode);
}

/**
 * The name a patient's review is shown under: the first name and the last name's initial ("Gent M."). Being a
 * clinic's patient is itself personal, so a public review never carries the full name (SEC-06).
 */
export function reviewAuthorName(patient: {firstName: string; lastName: string}): string {
    return publicPersonName(patient.firstName, patient.lastName);
}
