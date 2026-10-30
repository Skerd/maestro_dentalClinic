import {BaseCrudService} from "@coreModule/database/services/baseCrudService";
import ClinicInquiry, {IClinicInquiry} from "./clinicInquiry";

export class ClinicInquiryService extends BaseCrudService<IClinicInquiry, typeof ClinicInquiry> {
    constructor() {
        super(ClinicInquiry, "ClinicInquiry");
    }
}

export const clinicInquiryService = new ClinicInquiryService();
