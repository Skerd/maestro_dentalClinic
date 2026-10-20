import type {IClinicLocation} from "@dentalClinicModule/database/schemas/clinicLocation/clinicLocation";
import type {ClinicLocation} from "armonia/src/modules/dentalClinic/api/dentalClinic/private/clinicLocation/clinicLocation.dto";
import type {CountrySimple} from "armonia/src/modules/core/dto/country.dto";
import type {CitySimple} from "armonia/src/modules/core/dto/city.dto";
import {mapSnippet} from "@coreModule/utilities/mappers/common.mapper";
import {CountrySimpleSnippet} from "@coreModule/database/schemas/country/country.snippets";
import {CitySimpleSnippet} from "@coreModule/database/schemas/city/city.snippets";
import {mapLifeCycleToDTO, mapOwnershipToDTO, mapSoftDeleteToDTO} from "@coreModule/utilities/mappers/plugin/pluginMappers.dto";

export function clinicLocationToDTO(location: IClinicLocation): ClinicLocation {
    return {
        _id: location._id.toString(),
        name: location.name,
        phone: location.phone,
        email: location.email,
        address: location.address ? {
            country: mapSnippet<CountrySimple>()(location.address.country, CountrySimpleSnippet),
            city: mapSnippet<CitySimple>()(location.address.city, CitySimpleSnippet),
            street: location.address.street,
            postalCode: location.address.postalCode,
            latitude: location.address.latitude,
            longitude: location.address.longitude,
        } : undefined,
        timezone: location.timezone,
        openingHours: (location.openingHours ?? []).map(({dayOfWeek, startTime, endTime}) => ({dayOfWeek, startTime, endTime})),
        closures: (location.closures ?? []).map(({date, reason}) => ({date, reason})),
        isActive: location.isActive,
        ...mapSoftDeleteToDTO(location),
        ...mapOwnershipToDTO(location),
        ...mapLifeCycleToDTO(location),
    };
}

export function clinicLocationsToDTO(locations: IClinicLocation[]): ClinicLocation[] {
    return locations.map(clinicLocationToDTO);
}
