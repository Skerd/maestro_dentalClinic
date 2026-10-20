import {ObjectId} from "mongodb";
import {BaseCrudService, CrudOptions} from "@coreModule/database/services/baseCrudService";
import Currency from "@coreModule/database/schemas/currency/currency";
import {apiValidationException} from "armonia/src/modules/core/helpers/exceptions";
import ClinicConfig, {IClinicConfig} from "./clinicConfig";

export class ClinicConfigService extends BaseCrudService<IClinicConfig, typeof ClinicConfig> {
    constructor() {
        super(ClinicConfig, "ClinicConfig");
    }

    /** The company's clinic settings, or null when the company never set up online booking. */
    async findForCompany(companyId: ObjectId, options: CrudOptions = {}): Promise<IClinicConfig | null> {
        return this.findOne({company: companyId}, {...options, withDeleted: false});
    }

    /**
     * The company's clinic settings, created with defaults (public booking off, the
     * company's first currency) the first time staff open them.
     */
    async getOrCreateForCompany(companyId: ObjectId, options: CrudOptions = {}): Promise<IClinicConfig> {
        const existing = await this.findForCompany(companyId, options);
        if (existing) return existing;

        const currency =
            (await Currency.findOne({company: companyId}).sort({createdAt: 1}).select("_id").session(options.session ?? null))
            ?? (await Currency.findOne({}).sort({createdAt: 1}).select("_id").session(options.session ?? null));
        if (!currency) {
            throw apiValidationException("clinic_currency_not_configured", "", null, options.languageCode ?? "en-US");
        }

        try {
            return await this.create({company: companyId, currency: currency._id}, options);
        } catch (err: unknown) {
            // Race: another request created the singleton — re-read.
            const raced = await this.findForCompany(companyId, options);
            if (raced) return raced;
            throw err;
        }
    }
}

export const clinicConfigService = new ClinicConfigService();
