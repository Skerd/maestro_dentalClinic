import type {MedicalHistory} from "armonia/src/modules/dentalClinic/dto/medicalHistory.dto";
import {dateToISOString} from "@coreModule/utilities/mappers/common.mapper";
import type {IMedicalHistory} from "@dentalClinicModule/database/schemas/shared/medicalHistory";

export function medicalHistoryToDTO(history: IMedicalHistory | undefined): MedicalHistory | undefined {
    if (!history?.submittedAt) return undefined;
    return {
        version: history.version,
        answers: history.answers.map(({question, answer, detail}) => ({question, answer, detail})),
        medications: history.medications,
        signedName: history.signedName,
        submittedAt: dateToISOString(history.submittedAt),
    };
}
