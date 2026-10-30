import type {IPatient} from "@dentalClinicModule/database/schemas/patient/patient";
import type {Patient} from "armonia/src/modules/dentalClinic/api/dentalClinic/private/patient/patient.dto";
import type {CountrySimple} from "armonia/src/modules/core/dto/country.dto";
import type {SimpleBlankUser} from "armonia/src/modules/core/dto/user.dto";
import {mapSnippet} from "@coreModule/utilities/mappers/common.mapper";
import {CountrySimpleSnippet} from "@coreModule/database/schemas/country/country.snippets";
import {SimpleBlankUserSnippet} from "@coreModule/database/schemas/user/user.snippets";
import {mapLifeCycleToDTO, mapOwnershipToDTO, mapSoftDeleteToDTO} from "@coreModule/utilities/mappers/plugin/pluginMappers.dto";
import {medicalHistoryToDTO} from "@dentalClinicModule/utilities/mappers/medicalHistory/medicalHistoryMapper.dto";

export function patientToDTO(patient: IPatient): Patient {
    return {
        _id: patient._id.toString(),
        number: patient.number,
        firstName: patient.firstName,
        lastName: patient.lastName,
        dateOfBirth: patient.dateOfBirth?.toISOString(),
        sex: patient.sex,
        email: patient.email,
        phone: patient.phone,
        whatsapp: patient.whatsapp,
        preferredLanguage: patient.preferredLanguage,
        address: patient.address ? {
            country: mapSnippet<CountrySimple>()(patient.address.country, CountrySimpleSnippet),
            city: patient.address.city,
            street: patient.address.street,
            postalCode: patient.address.postalCode,
        } : undefined,
        emergencyContact: patient.emergencyContact ? {
            name: patient.emergencyContact.name,
            phone: patient.emergencyContact.phone,
            relation: patient.emergencyContact.relation,
        } : undefined,
        homeDentist: patient.homeDentist ? {
            name: patient.homeDentist.name,
            practice: patient.homeDentist.practice,
            email: patient.homeDentist.email,
            phone: patient.homeDentist.phone,
        } : undefined,
        source: patient.source,
        tags: patient.tags ?? [],
        notes: patient.notes,
        account: mapSnippet<SimpleBlankUser>()(patient.account, SimpleBlankUserSnippet),
        medicalHistory: medicalHistoryToDTO(patient.medicalHistory),
        ...mapSoftDeleteToDTO(patient),
        ...mapOwnershipToDTO(patient),
        ...mapLifeCycleToDTO(patient),
    };
}

export function patientsToDTO(patients: IPatient[]): Patient[] {
    return patients.map(patientToDTO);
}
