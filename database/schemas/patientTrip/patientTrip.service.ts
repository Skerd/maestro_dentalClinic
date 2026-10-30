import {BaseCrudService} from "@coreModule/database/services/baseCrudService";
import PatientTrip, {IPatientTrip} from "./patientTrip";

export class PatientTripService extends BaseCrudService<IPatientTrip, typeof PatientTrip> {
    constructor() {
        super(PatientTrip, "PatientTrip");
    }
}

export const patientTripService = new PatientTripService();
