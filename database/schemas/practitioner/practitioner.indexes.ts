import {Schema} from "mongoose";

export function applyPractitionerIndexes(schema: Schema): void {
    // A staff login backs at most one live profile.
    schema.index({company: 1, staffUser: 1}, {unique: true, partialFilterExpression: {staffUser: {$type: "objectId"}, deletedAt: null}});
    // Eligibility lookups: who does this service, who works at this location.
    // (Two indexes: MongoDB cannot index two array fields together.)
    schema.index({company: 1, services: 1});
    schema.index({company: 1, locations: 1});
}
