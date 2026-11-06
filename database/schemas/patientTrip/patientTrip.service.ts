import {BaseCrudService} from "@coreModule/database/services/baseCrudService";
import PatientTrip, {IPatientTrip} from "./patientTrip";
import type {ClientSession, FilterQuery} from "mongoose";

export class PatientTripService extends BaseCrudService<IPatientTrip, typeof PatientTrip> {
    constructor() {
        super(PatientTrip, "PatientTrip");
    }

    /** The matching trip that leaves last. */
    findLatestDeparture(filter: FilterQuery<IPatientTrip>, session: ClientSession | undefined) {
        return this.model.findOne(filter).sort({departureAt: -1}).session(session ?? null);
    }
}

export const patientTripService = new PatientTripService();
