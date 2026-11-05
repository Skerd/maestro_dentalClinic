import {SchemaTypes} from "mongoose";
import {
    MEDICAL_HISTORY_ANSWERS,
    MEDICAL_HISTORY_DETAIL_MAX,
    MEDICAL_HISTORY_MEDICATIONS_MAX,
    MEDICAL_HISTORY_QUESTIONS,
    type MedicalHistoryAnswer,
    type MedicalHistoryQuestion,
} from "armonia/src/modules/dentalClinic/constants";

/** A signed questionnaire: on each clinic's inquiry while the patient chooses, then in the chosen clinic's folder. */
export type IMedicalHistory = {
    version: string;
    answers: {question: MedicalHistoryQuestion; answer: MedicalHistoryAnswer; detail?: string}[];
    medications?: string;
    signedName: string;
    submittedAt: Date;
};

const hiddenNestedColumn = {hideColumn: true, filterable: false, sortable: false};
const NoWritePermission = {self: {write: "no-permission"}, others: {write: "no-permission"}};

/** Set by the patient's portal only, never by a staff form. */
export const medicalHistoryField = {
    type: {
        version: {type: SchemaTypes.String, required: true, dynamicTableConfiguration: hiddenNestedColumn},
        answers: {
            type: [{
                _id: false,
                question: {type: SchemaTypes.String, enum: MEDICAL_HISTORY_QUESTIONS, required: true, dynamicTableConfiguration: hiddenNestedColumn},
                answer: {type: SchemaTypes.String, enum: MEDICAL_HISTORY_ANSWERS, required: true, dynamicTableConfiguration: hiddenNestedColumn},
                detail: {type: SchemaTypes.String, maxlength: MEDICAL_HISTORY_DETAIL_MAX, dynamicTableConfiguration: hiddenNestedColumn},
            }],
            default: [],
            dynamicTableConfiguration: hiddenNestedColumn,
        },
        medications: {type: SchemaTypes.String, maxlength: MEDICAL_HISTORY_MEDICATIONS_MAX, dynamicTableConfiguration: hiddenNestedColumn},
        signedName: {type: SchemaTypes.String, required: true, dynamicTableConfiguration: hiddenNestedColumn},
        submittedAt: {type: SchemaTypes.Date, required: true, dynamicTableConfiguration: hiddenNestedColumn},
    },
    required: false,
    // Health data (SEC-06): only roles that list the group for sensitive fields read it.
    sensitivity: "health" as const,
    permissions: NoWritePermission,
    dynamicTableConfiguration: {filterable: false, sortable: false, hideColumn: true},
};

/** Subdocuments are copied field by field: spreading one would copy Mongoose's internal state. */
export function copyMedicalHistory(history: IMedicalHistory): IMedicalHistory {
    return {
        version: history.version,
        answers: history.answers.map(({question, answer, detail}) => ({question, answer, ...(detail ? {detail} : {})})),
        ...(history.medications ? {medications: history.medications} : {}),
        signedName: history.signedName,
        submittedAt: history.submittedAt,
    };
}
