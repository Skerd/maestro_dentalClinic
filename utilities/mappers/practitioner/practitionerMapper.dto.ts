import type {IPractitioner} from "@dentalClinicModule/database/schemas/practitioner/practitioner";
import type {Practitioner} from "armonia/src/modules/dentalClinic/api/dentalClinic/private/practitioner/practitioner.dto";
import type {SimpleBlankUser} from "armonia/src/modules/core/dto/user.dto";
import type {ClinicLocationSimple} from "armonia/src/modules/dentalClinic/dto/clinicLocation.dto";
import type {ClinicServiceSimple} from "armonia/src/modules/dentalClinic/dto/clinicService.dto";
import {mapMedia, mapSnippet} from "@coreModule/utilities/mappers/common.mapper";
import {SimpleBlankUserSnippet} from "@coreModule/database/schemas/user/user.snippets";
import {ClinicLocationSimpleSnippet} from "@dentalClinicModule/database/schemas/clinicLocation/clinicLocation.snippets";
import {ClinicServiceSimpleSnippet} from "@dentalClinicModule/database/schemas/clinicService/clinicService.snippets";
import {mapLifeCycleToDTO, mapOwnershipToDTO, mapSoftDeleteToDTO} from "@coreModule/utilities/mappers/plugin/pluginMappers.dto";

const isDefined = <T>(value: T | undefined): value is T => value !== undefined;

export function practitionerToDTO(practitioner: IPractitioner): Practitioner {
    return {
        _id: practitioner._id.toString(),
        staffUser: mapSnippet<SimpleBlankUser>()(practitioner.staffUser, SimpleBlankUserSnippet),
        displayName: practitioner.displayName,
        title: practitioner.title,
        role: practitioner.role,
        bio: practitioner.bio,
        photo: practitioner.photo ? mapMedia(practitioner.photo) : undefined,
        languages: practitioner.languages ?? [],
        services: practitioner.services?.map((service) => mapSnippet<ClinicServiceSimple>()(service, ClinicServiceSimpleSnippet)).filter(isDefined),
        locations: practitioner.locations?.map((location) => mapSnippet<ClinicLocationSimple>()(location, ClinicLocationSimpleSnippet)).filter(isDefined),
        schedule: (practitioner.schedule ?? []).map(({location, dayOfWeek, startTime, endTime}) => ({
            location: mapSnippet<ClinicLocationSimple>()(location, ClinicLocationSimpleSnippet),
            dayOfWeek,
            startTime,
            endTime,
        })),
        isBookable: practitioner.isBookable,
        isActive: practitioner.isActive,
        sortOrder: practitioner.sortOrder ?? 0,
        ...mapSoftDeleteToDTO(practitioner),
        ...mapOwnershipToDTO(practitioner),
        ...mapLifeCycleToDTO(practitioner),
    };
}

export function practitionersToDTO(practitioners: IPractitioner[]): Practitioner[] {
    return practitioners.map(practitionerToDTO);
}
