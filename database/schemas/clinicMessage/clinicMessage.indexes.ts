import {Schema} from "mongoose";

export function applyClinicMessageIndexes(schema: Schema): void {
    // One inquiry's thread in order.
    schema.index({company: 1, inquiry: 1, createdAt: 1});
}
