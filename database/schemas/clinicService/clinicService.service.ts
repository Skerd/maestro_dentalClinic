import {BaseCrudService} from "@coreModule/database/services/baseCrudService";
import ClinicService, {IClinicService} from "./clinicService";

export class ClinicServiceService extends BaseCrudService<IClinicService, typeof ClinicService> {
    constructor() {
        super(ClinicService, "ClinicService");
    }
}

export const clinicServiceService = new ClinicServiceService();
