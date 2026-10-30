import type {ApiSelectDatum} from "armonia/src/modules/core/types/shared.types";
import type {IPatient} from "@dentalClinicModule/database/schemas/patient/patient";

export function patientsToSelect(patients: IPatient[]): ApiSelectDatum[] {
    return patients.map((patient) => ({
        value: patient._id.toString(),
        label: `${patient.firstName} ${patient.lastName} · ${patient.number}`,
    }));
}
