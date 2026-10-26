import {registerPortalProvider} from "@coreModule/domain/portal/portalProviderRegistry";
import {
    addressCitiesByCompany,
    portalCompanyRefs,
    portalListedCompanyIds,
} from "@coreModule/utilities/marketing/portalCompanies";
import {escapeRegex} from "@coreModule/utilities/helpers";
import {publicMediaUrl} from "@coreModule/utilities/media/publicMediaUrl";
import ClinicConfig from "@dentalClinicModule/database/schemas/clinicConfig/clinicConfig";
import ClinicLocation from "@dentalClinicModule/database/schemas/clinicLocation/clinicLocation";
import ClinicService from "@dentalClinicModule/database/schemas/clinicService/clinicService";
import Practitioner from "@dentalClinicModule/database/schemas/practitioner/practitioner";

/** Clinics on the portal: taking public bookings and opted in to the portal. */
export function clinicPortalCompanyIds() {
    return portalListedCompanyIds("dentalClinic", {
        configModel: ClinicConfig,
        configFilter: {publicBookingEnabled: true, listedOnPortal: true},
    });
}

export function clinicPortalPath(slug: string): string {
    return `/dentists/${slug}`;
}

/** The dentists section of the portal: clinics by their locations' cities, public treatments and dentists by name. */
export function registerClinicPortalProvider(): void {
    registerPortalProvider({
        key: "dentalClinic",
        order: 30,
        companyPath: (company) => clinicPortalPath(company.slug),
        listedCompanyIds: clinicPortalCompanyIds,
        citiesByCompany: (companyIds) => addressCitiesByCompany(ClinicLocation, companyIds, {isActive: true}),
        async search({query, companyIds, limit}) {
            const name = {$regex: escapeRegex(query), $options: "i"};
            const [services, practitioners] = await Promise.all([
                ClinicService.find({company: {$in: companyIds}, isActive: true, isPublic: true, deletedAt: null, name})
                    .select("company name images").sort({name: 1}).limit(limit).lean(),
                Practitioner.find({company: {$in: companyIds}, isActive: true, deletedAt: null, displayName: name})
                    .select("company displayName title photo").sort({displayName: 1}).limit(limit).lean(),
            ]);
            const companies = await portalCompanyRefs([...services, ...practitioners].map((row) => row.company as any));
            const items = [
                ...services.map((service) => ({
                    row: service,
                    kind: "service",
                    title: service.name,
                    image: publicMediaUrl(service.images?.[0]),
                    query: `?service=${service._id}`,
                })),
                ...practitioners.map((practitioner) => ({
                    row: practitioner,
                    kind: "practitioner",
                    title: practitioner.title ? `${practitioner.title} ${practitioner.displayName}` : practitioner.displayName,
                    image: publicMediaUrl(practitioner.photo),
                    query: `?practitioner=${practitioner._id}`,
                })),
            ];
            return items.flatMap(({row, kind, title, image, query: bookQuery}) => {
                const company = companies.get(String(row.company));
                return company ? [{kind, title, subtitle: company.name, image, path: `${clinicPortalPath(company.slug)}/book${bookQuery}`, company}] : [];
            }).slice(0, limit);
        },
    });
}
