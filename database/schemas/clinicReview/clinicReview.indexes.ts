import {Schema} from "mongoose";

export function applyClinicReviewIndexes(schema: Schema): void {
    // One review per appointment.
    schema.index({company: 1, appointment: 1}, {unique: true, partialFilterExpression: {deletedAt: null}});
    // The clinic's reviews newest first: its site, the portal's card averages, the panel's list.
    schema.index({company: 1, createdAt: -1});
}
