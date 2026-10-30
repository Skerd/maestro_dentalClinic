import {Schema} from "mongoose";

export function applyClinicInquiryIndexes(schema: Schema): void {
    schema.index({company: 1, number: 1}, {unique: true});
    // A retried request (same key) returns the inquiries it already opened.
    schema.index({company: 1, idempotencyKey: 1}, {unique: true});
    // The clinic's inbox, newest first, per status.
    schema.index({company: 1, status: 1, createdAt: -1});
    // The patient's cases across clinics.
    schema.index({account: 1, requestGroup: 1, createdAt: -1});
    // Unanswered requests for the response-time alert.
    schema.index({status: 1, firstResponseAt: 1, slaAlertedAt: 1, createdAt: 1});
}
