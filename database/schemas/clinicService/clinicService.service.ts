import {BaseCrudService} from "@coreModule/database/services/baseCrudService";
import ClinicService, {IClinicService} from "./clinicService";
import type {ClientSession, FilterQuery, SortOrder} from "mongoose";
import type {ObjectId} from "mongodb";
import type {TreatmentCategory} from "armonia/src/modules/dentalClinic/constants";
import type {ClinicServicePriceType} from "armonia/src/modules/dentalClinic/api/dentalClinic/private/clinicService/clinicService.schema-def";

export class ClinicServiceService extends BaseCrudService<IClinicService, typeof ClinicService> {
    constructor() {
        super(ClinicService, "ClinicService");
    }

    /** The categories the clinics offer publicly. */
    findCategoriesLean(filter: FilterQuery<IClinicService>) {
        return this.model.find(filter).select("company category").lean<{company: ObjectId; category: TreatmentCategory}[]>();
    }

    /** One page of treatment cards for the portal. */
    findPortalCards(filter: FilterQuery<IClinicService>, sort: Record<string, SortOrder>, skip: number, limit: number) {
        return this.model.find(filter)
            .select("company name slug images price priceType")
            .sort(sort)
            .skip(skip).limit(limit)
            .lean<{_id: ObjectId; company: ObjectId; name: string; slug?: string; images?: ObjectId[]; price?: number; priceType: ClinicServicePriceType}[]>();
    }

    /** A live treatment as the platform's report desk reads it (D191): by its id alone, whichever clinic owns it. */
    findReportable(id: ObjectId, session?: ClientSession) {
        return this.model.findOne({_id: id, deletedAt: null})
            .select("company name slug hiddenByPlatform")
            .session(session ?? null)
            .lean<{_id: ObjectId; company: ObjectId; name: string; slug?: string; hiddenByPlatform?: boolean}>();
    }
}

export const clinicServiceService = new ClinicServiceService();
