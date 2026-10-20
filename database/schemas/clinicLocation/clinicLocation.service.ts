import {BaseCrudService} from "@coreModule/database/services/baseCrudService";
import ClinicLocation, {IClinicLocation} from "./clinicLocation";

export class ClinicLocationService extends BaseCrudService<IClinicLocation, typeof ClinicLocation> {
    constructor() {
        super(ClinicLocation, "ClinicLocation");
    }
}

export const clinicLocationService = new ClinicLocationService();
