import {Schema} from "mongoose";

export function applyClinicLocationIndexes(schema: Schema): void {
    schema.index({company: 1, name: 1}, {unique: true, partialFilterExpression: {deletedAt: null}});
    schema.index({company: 1, isActive: 1});
}
