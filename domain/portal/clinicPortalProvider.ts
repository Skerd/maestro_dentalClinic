import type {ObjectId} from "mongodb";
import {registerPortalProvider} from "@coreModule/domain/portal/portalProviderRegistry";
import type {PortalBrowseParams} from "@coreModule/domain/portal/portalProvider.types";
import {catalogItems, configCurrencies, priceRange} from "@coreModule/domain/portal/portalCatalog";
import {addressCitiesByCompany, portalListedCompanyIds, type PortalScope} from "@coreModule/utilities/marketing/portalCompanies";
import {escapeRegex} from "@coreModule/utilities/helpers";
import {publicMediaUrl} from "@coreModule/utilities/media/publicMediaUrl";
import type {ClinicServicePriceType} from "armonia/src/modules/dentalClinic/api/dentalClinic/private/clinicService/clinicService.schema-def";
import ClinicConfig from "@dentalClinicModule/database/schemas/clinicConfig/clinicConfig";
import ClinicLocation from "@dentalClinicModule/database/schemas/clinicLocation/clinicLocation";
import ClinicService from "@dentalClinicModule/database/schemas/clinicService/clinicService";

/** Clinics taking public bookings (and on the apex, opted in to the portal). */
export function clinicPortalCompanyIds(scope: PortalScope) {
    return portalListedCompanyIds("dentalClinic", {
        configModel: ClinicConfig,
        configFilter: {publicBookingEnabled: true},
        listedOn: {listedOnPortal: true},
    }, scope);
}

const SERVICE_SORTS = {newest: {createdAt: -1}, priceAsc: {price: 1}, priceDesc: {price: -1}} as const;

/** Public treatments of these clinics; each opens the booking wizard on it. */
async function browseTreatments({companyIds, query, priceMin, priceMax, sort, skip, limit}: PortalBrowseParams) {
    const clause: Record<string, unknown> = {company: {$in: companyIds}, isActive: true, isPublic: true, deletedAt: null};
    if (query) clause.name = {$regex: escapeRegex(query), $options: "i"};
    const price = priceRange(priceMin, priceMax);
    if (price) clause.price = price;
    const [services, total, currencies] = await Promise.all([
        ClinicService.find(clause)
            .select("company name images price priceType")
            .sort(SERVICE_SORTS[sort ?? "newest"])
            .skip(skip).limit(limit)
            .lean<{_id: ObjectId; company: ObjectId; name: string; images?: ObjectId[]; price?: number; priceType: ClinicServicePriceType}[]>(),
        ClinicService.countDocuments(clause),
        configCurrencies(ClinicConfig, companyIds),
    ]);
    const items = await catalogItems(services, (service) => {
        const currency = currencies.get(service.company.toString());
        // "On request" and "free" treatments show no price.
        const priced = service.priceType === "fixed" || service.priceType === "from";
        return {
            kind: "treatment",
            id: service._id.toString(),
            title: service.name,
            image: publicMediaUrl(service.images?.[0]),
            ...(priced && service.price != null && currency ? {price: {amount: service.price, currency, from: service.priceType === "from"}} : {}),
            section: "dentalClinic",
            path: `/treatments/${service._id.toString()}`,
        };
    });
    return {items, total};
}

/** The dentists section of the portal: clinics by their locations' cities, and their treatments. */
export function registerClinicPortalProvider(): void {
    registerPortalProvider({
        key: "dentalClinic",
        order: 30,
        kinds: ["treatment"],
        companyIds: clinicPortalCompanyIds,
        citiesByCompany: (companyIds) => addressCitiesByCompany(ClinicLocation, companyIds, {isActive: true}),
        browse: browseTreatments,
    });
}
