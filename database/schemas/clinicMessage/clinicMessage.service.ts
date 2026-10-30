import {BaseCrudService} from "@coreModule/database/services/baseCrudService";
import ClinicMessage, {IClinicMessage} from "./clinicMessage";

export class ClinicMessageService extends BaseCrudService<IClinicMessage, typeof ClinicMessage> {
    constructor() {
        super(ClinicMessage, "ClinicMessage");
    }
}

export const clinicMessageService = new ClinicMessageService();
