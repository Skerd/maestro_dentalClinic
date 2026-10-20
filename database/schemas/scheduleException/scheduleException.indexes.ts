import {Schema} from "mongoose";

export function applyScheduleExceptionIndexes(schema: Schema): void {
    // Overlap lookups: live time off of one dentist, or closures of one location, around a window.
    schema.index({company: 1, practitioner: 1, startAt: 1, endAt: 1}, {partialFilterExpression: {deletedAt: null}});
    schema.index({company: 1, location: 1, startAt: 1, endAt: 1}, {partialFilterExpression: {deletedAt: null}});
}
