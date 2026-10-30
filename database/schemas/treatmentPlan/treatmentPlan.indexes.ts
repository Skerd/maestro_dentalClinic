import {Schema} from "mongoose";

export function applyTreatmentPlanIndexes(schema: Schema): void {
    schema.index({company: 1, number: 1}, {unique: true});
    // The quotes of one request, and of one patient.
    schema.index({company: 1, inquiry: 1, createdAt: -1});
    schema.index({company: 1, patient: 1, createdAt: -1});
    // Sent quotes past their date, for the expiry job.
    schema.index({status: 1, validUntil: 1});
}
