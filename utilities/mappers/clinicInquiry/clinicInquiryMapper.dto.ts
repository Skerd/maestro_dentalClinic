import type {IClinicInquiry} from "@dentalClinicModule/database/schemas/clinicInquiry/clinicInquiry";
import type {ClinicInquiry} from "armonia/src/modules/dentalClinic/api/dentalClinic/private/clinicInquiry/clinicInquiry.dto";
import type {CountrySimple} from "armonia/src/modules/core/dto/country.dto";
import type {CurrencySimple} from "armonia/src/modules/core/dto/currency.dto";
import type {SimpleBlankUser} from "armonia/src/modules/core/dto/user.dto";
import type {PatientSimple} from "armonia/src/modules/dentalClinic/dto/patient.dto";
import {dateToISOString, mapMedia, mapSnippet} from "@coreModule/utilities/mappers/common.mapper";
import {CountrySimpleSnippet} from "@coreModule/database/schemas/country/country.snippets";
import {CurrencySimpleSnippet} from "@coreModule/database/schemas/currency/currency.snippets";
import {SimpleBlankUserSnippet} from "@coreModule/database/schemas/user/user.snippets";
import {PatientSimpleSnippet} from "@dentalClinicModule/database/schemas/patient/patient.snippets";
import {mapLifeCycleToDTO, mapOwnershipToDTO, mapSoftDeleteToDTO} from "@coreModule/utilities/mappers/plugin/pluginMappers.dto";

const optionalIso = (date: Date | undefined) => (date ? dateToISOString(date) : undefined);

/**
 * The patient's contact as the clinic may see it: until a portal patient shares their details,
 * only the first name, the initial of the last name, the country and the language.
 */
function contactToDTO(inquiry: IClinicInquiry): ClinicInquiry["contact"] {
    const {firstName, lastName, email, phone, whatsapp, country, preferredLanguage} = inquiry.contact;
    const mappedCountry = mapSnippet<CountrySimple>()(country, CountrySimpleSnippet);
    if (!inquiry.contactShared) {
        return {firstName, lastName: lastName ? `${lastName.charAt(0)}.` : undefined, country: mappedCountry, preferredLanguage};
    }
    return {firstName, lastName, email, phone, whatsapp, country: mappedCountry, preferredLanguage};
}

export function clinicInquiryToDTO(inquiry: IClinicInquiry): ClinicInquiry {
    return {
        _id: inquiry._id.toString(),
        number: inquiry.number,
        status: inquiry.status,
        source: inquiry.source,
        contact: contactToDTO(inquiry),
        contactShared: inquiry.contactShared,
        treatmentsWanted: [...(inquiry.treatmentsWanted ?? [])],
        description: inquiry.description,
        travelFrom: inquiry.travelFrom,
        travelTo: inquiry.travelTo,
        budget: inquiry.budget,
        budgetCurrency: mapSnippet<CurrencySimple>()(inquiry.budgetCurrency, CurrencySimpleSnippet),
        files: inquiry.files?.length ? inquiry.files.map(mapMedia).filter((media) => media !== undefined) : undefined,
        // Subdocuments are copied field by field: spreading one would copy Mongoose's internal state.
        infoRequests: (inquiry.infoRequests ?? []).map(({kind, note, requestedAt, fulfilledAt}) => ({
            kind,
            note,
            requestedAt: dateToISOString(requestedAt),
            fulfilledAt: optionalIso(fulfilledAt),
        })),
        assignedTo: mapSnippet<SimpleBlankUser>()(inquiry.assignedTo, SimpleBlankUserSnippet),
        patient: mapSnippet<PatientSimple>()(inquiry.patient, PatientSimpleSnippet),
        firstResponseAt: optionalIso(inquiry.firstResponseAt),
        lastMessageAt: optionalIso(inquiry.lastMessageAt),
        unreadForClinic: inquiry.unreadForClinic ?? 0,
        closedAt: optionalIso(inquiry.closedAt),
        closeReason: inquiry.closeReason,
        timeline: (inquiry.timeline ?? []).map(({event, at, note}) => ({event, at: dateToISOString(at), note})),
        ...mapSoftDeleteToDTO(inquiry),
        ...mapOwnershipToDTO(inquiry),
        ...mapLifeCycleToDTO(inquiry),
    };
}

export function clinicInquiriesToDTO(inquiries: IClinicInquiry[]): ClinicInquiry[] {
    return inquiries.map(clinicInquiryToDTO);
}
