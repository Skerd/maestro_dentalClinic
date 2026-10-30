import {BaseCrudService} from "@coreModule/database/services/baseCrudService";
import Patient, {IPatient} from "./patient";

export class PatientService extends BaseCrudService<IPatient, typeof Patient> {
    constructor() {
        super(Patient, "Patient");
    }
}

export const patientService = new PatientService();
