import {registerPortalProvider} from "@coreModule/domain/portal/portalProviderRegistry";
import type {PortalBrowseParams, PortalNewSinceContext} from "@coreModule/domain/portal/portalProvider.types";
import {catalogItems, catalogRating, configCurrencies, itemPagePath, newSinceClause, priceRange, samePriceCurrencyCompanies, slugOrIdClause} from "@coreModule/domain/portal/portalCatalog";
import {addressCitiesByCompany, portalListedCompanyIds, type PortalScope} from "@coreModule/utilities/marketing/portalCompanies";
import {escapeRegex} from "@coreModule/utilities/helpers";
import {publicMediaUrl} from "@coreModule/utilities/media/publicMediaUrl";
import type {ClinicServicePriceType} from "armonia/src/modules/dentalClinic/api/dentalClinic/private/clinicService/clinicService.schema-def";
import ClinicConfig from "@dentalClinicModule/database/schemas/clinicConfig/clinicConfig";
import ClinicLocation from "@dentalClinicModule/database/schemas/clinicLocation/clinicLocation";

import {clinicServiceService} from "@dentalClinicModule/database/schemas/clinicService/clinicService.service";
import {clinicReviewService} from "@dentalClinicModule/database/schemas/clinicReview/clinicReview.service";
import {notHiddenByPlatform} from "@coreModule/database/plugins/platformHiddenPlugin";
/** Clinics taking public bookings or estimate requests (and on the apex, opted in to the portal). */
export function clinicPortalCompanyIds(scope: PortalScope) {
    return portalListedCompanyIds("dentalClinic", {
        configModel: ClinicConfig,
        configFilter: {$or: [{publicBookingEnabled: true}, {inquiriesEnabled: true}]},
        listedOn: {listedOnPortal: true},
    }, scope);
}

const SERVICE_SORTS = {newest: {createdAt: -1}, priceAsc: {price: 1}, priceDesc: {price: -1}} as const;

/**
 * Public treatments of these clinics; each opens the booking wizard on it. `narrowing` keeps only the treatments a
 * "new since" ask is about.
 */
async function browseTreatments({companyIds, query, priceMin, priceMax, sort, filters, skip, limit}: PortalBrowseParams, narrowing: Record<string, unknown> = {}) {
    const currencies = await configCurrencies(ClinicConfig, companyIds);
    // Prices are compared only between clinics charging in one currency.
    const comparable = samePriceCurrencyCompanies(companyIds, currencies, {priceMin, priceMax, sort, filters});
    // A treatment the platform hid after a report is gone from every portal list and page (D191).
    const clause: Record<string, unknown> = {...narrowing, company: {$in: comparable}, isActive: true, isPublic: true, ...notHiddenByPlatform(), deletedAt: null};
    if (query) clause.name = {$regex: escapeRegex(query), $options: "i"};
    const price = priceRange(priceMin, priceMax);
    if (price) clause.price = price;
    const [services, total, ratings] = await Promise.all([
        clinicServiceService.findPortalCards(clause, SERVICE_SORTS[sort ?? "newest"], skip, limit),
        clinicServiceService.count(clause),
        // Reviews rate the clinic, so each of its treatments shows the clinic's average (D178).
        clinicReviewService.publishedRatingsByCompany(companyIds),
    ]);
    const items = await catalogItems(services, (service) => {
        const currency = currencies.get(service.company.toString());
        const rating = ratings.get(service.company.toString());
        // "On request" and "free" treatments show no price.
        const priced = service.priceType === "fixed" || service.priceType === "from";
        return {
            kind: "treatment",
            id: service._id.toString(),
            title: service.name,
            image: publicMediaUrl(service.images?.[0]),
            ...(priced && service.price != null && currency ? {price: {amount: service.price, currency, from: service.priceType === "from"}} : {}),
            ...catalogRating(rating?.average, rating?.count),
            section: "dentalClinic",
            path: `/treatments/${service.slug || service._id.toString()}`,
        };
    });
    return {items, total};
}

/** The dentists section of the portal: clinics by their locations' cities, and their treatments. */
export function registerClinicPortalProvider(): void {
    registerPortalProvider({
        key: "dentalClinic",
        order: 30,
        sitePath: "dentists",
        // As the portal names it: the section (sinfonia `portalSectionName`) and its kinds' tabs (`portalKindName`).
        names: {
            "en-US": {title: "Dentists", description: "Find a clinic and book an appointment online.", kinds: {treatment: "Dental"}},
            "sq-AL": {title: "Dentistët", description: "Gjeni një klinikë dhe rezervoni një takim online.", kinds: {treatment: "Dentare"}},
            "it-IT": {title: "Dentisti", description: "Trova uno studio e prenota un appuntamento online.", kinds: {treatment: "Dentista"}},
            "fr-FR": {title: "Dentistes", description: "Trouvez un cabinet et prenez rendez-vous en ligne.", kinds: {treatment: "Dentaire"}},
            "de-CH": {title: "Zahnärzte", description: "Finden Sie eine Praxis und buchen Sie online einen Termin.", kinds: {treatment: "Zahnmedizin"}},
        },
        kinds: ["treatment"],
        companyIds: clinicPortalCompanyIds,
        citiesByCompany: (companyIds) => addressCitiesByCompany(ClinicLocation, companyIds, {isActive: true}),
        browse: (params) => browseTreatments(params),
        // Treatments offered after the date (D178): a saved search's alert, a person's kept items.
        newSince: (context: PortalNewSinceContext) => browseTreatments({...context, sort: "newest", skip: 0}, newSinceClause(context)),
        // A treatment's page (D181): `/treatments/{slug or id}`.
        itemAt: async ({scope, companyId, path, languageCode}) => {
            const [page, ref] = itemPagePath(path).segments;
            if (page !== "treatments" || !ref) return undefined;
            const {items} = await browseTreatments({kind: "treatment", scope, companyIds: [companyId], filters: {}, skip: 0, limit: 1, languageCode}, slugOrIdClause(ref));
            return items[0] ? {item: items[0], schemaType: "MedicalProcedure"} : undefined;
        },
    });
}
