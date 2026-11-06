import {BaseCrudService} from "@coreModule/database/services/baseCrudService";
import Patient, {IPatient} from "./patient";
import type {ClientSession, FilterQuery} from "mongoose";

export class PatientService extends BaseCrudService<IPatient, typeof Patient> {
    constructor() {
        super(Patient, "Patient");
    }

    /** The matching patient, names compared with `collation` (case and accents ignored). */
    findOneByName(filter: FilterQuery<IPatient>, collation: {locale: string; strength: number}, session: ClientSession | undefined) {
        return this.model.findOne(filter)
            .collation(collation)
            .session(session ?? null);
    }
}

export const patientService = new PatientService();
