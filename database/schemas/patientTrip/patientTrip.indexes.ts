import {Schema} from "mongoose";

export function applyPatientTripIndexes(schema: Schema): void {
    // Arrivals in date order: the airport pickups of the week.
    schema.index({company: 1, arrivalAt: 1});
    schema.index({company: 1, patient: 1, arrivalAt: 1});
    schema.index({company: 1, plan: 1, phase: 1});
}
