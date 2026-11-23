import {Schema} from "mongoose";

export function applyClinicReviewIndexes(schema: Schema): void {
    // One review per appointment.
    schema.index({company: 1, appointment: 1}, {unique: true, partialFilterExpression: {deletedAt: null}});
    // The published filter: the clinic's site, the portal's card averages, the panel's quick filter.
    schema.index({company: 1, isPublished: 1, createdAt: -1});
}
