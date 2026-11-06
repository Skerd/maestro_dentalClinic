import {BaseCrudService} from "@coreModule/database/services/baseCrudService";
import ClinicInquiry, {IClinicInquiry} from "./clinicInquiry";
import type {FilterQuery} from "mongoose";
import type {ObjectId} from "mongodb";

export class ClinicInquiryService extends BaseCrudService<IClinicInquiry, typeof ClinicInquiry> {
    constructor() {
        super(ClinicInquiry, "ClinicInquiry");
    }

    /** When each recent request got its first answer, for the clinics' response times. */
    findFirstResponsesLean(filter: FilterQuery<IClinicInquiry>) {
        return this.model.find(filter)
            .select("company createdAt firstResponseAt")
            .lean<{company: ObjectId; createdAt: Date; firstResponseAt: Date}[]>();
    }
}

export const clinicInquiryService = new ClinicInquiryService();
