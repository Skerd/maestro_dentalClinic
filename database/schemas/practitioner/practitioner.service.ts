import {BaseCrudService} from "@coreModule/database/services/baseCrudService";
import Practitioner, {IPractitioner} from "./practitioner";

export class PractitionerService extends BaseCrudService<IPractitioner, typeof Practitioner> {
    constructor() {
        super(Practitioner, "Practitioner");
    }
}

export const practitionerService = new PractitionerService();
