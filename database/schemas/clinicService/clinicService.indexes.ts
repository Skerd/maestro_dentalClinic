import {Schema} from "mongoose";

export function applyClinicServiceIndexes(schema: Schema): void {
    schema.index({company: 1, slug: 1}, {unique: true, partialFilterExpression: {deletedAt: null}});
    schema.index({company: 1, isPublic: 1, sortOrder: 1});
}
