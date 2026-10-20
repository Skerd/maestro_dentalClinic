import {Schema} from "mongoose";

export function applyAppointmentIndexes(schema: Schema): void {
    // Overlap lookups: one dentist's appointments around a window (status is filtered in the query).
    schema.index({company: 1, practitioner: 1, blockedStart: 1, blockedEnd: 1});
    // A retried request (same key) returns the appointment it already made.
    schema.index({company: 1, idempotencyKey: 1}, {unique: true});
    schema.index({company: 1, number: 1}, {unique: true});
    schema.index({company: 1, location: 1, startAt: 1});
    schema.index({company: 1, customer: 1, startAt: -1});
    // Reminders and the retention purge.
    schema.index({status: 1, startAt: 1});
    schema.index({endAt: 1, anonymizedAt: 1});
}
