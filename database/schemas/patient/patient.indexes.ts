import {Schema} from "mongoose";

export function applyPatientIndexes(schema: Schema): void {
    schema.index({company: 1, number: 1}, {unique: true});
    // One folder per account per clinic: a signed-in booking or request always lands in the same folder.
    schema.index(
        {company: 1, account: 1},
        {unique: true, partialFilterExpression: {account: {$type: "objectId"}, deletedAt: null}},
    );
    schema.index({company: 1, email: 1});
    schema.index({company: 1, lastName: 1, firstName: 1});
}
