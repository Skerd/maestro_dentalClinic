import type {IScheduleException} from "@dentalClinicModule/database/schemas/scheduleException/scheduleException";
import type {ScheduleException} from "armonia/src/modules/dentalClinic/api/dentalClinic/private/scheduleException/scheduleException.dto";
import type {ClinicLocationSimple} from "armonia/src/modules/dentalClinic/dto/clinicLocation.dto";
import type {PractitionerSimple} from "armonia/src/modules/dentalClinic/dto/practitioner.dto";
import {dateToISOString, mapSnippet} from "@coreModule/utilities/mappers/common.mapper";
import {ClinicLocationSimpleSnippet} from "@dentalClinicModule/database/schemas/clinicLocation/clinicLocation.snippets";
import {PractitionerSimpleSnippet} from "@dentalClinicModule/database/schemas/practitioner/practitioner.snippets";
import {mapLifeCycleToDTO, mapOwnershipToDTO, mapSoftDeleteToDTO} from "@coreModule/utilities/mappers/plugin/pluginMappers.dto";

export function scheduleExceptionToDTO(exception: IScheduleException): ScheduleException {
    return {
        _id: exception._id.toString(),
        practitioner: mapSnippet<PractitionerSimple>()(exception.practitioner, PractitionerSimpleSnippet),
        location: mapSnippet<ClinicLocationSimple>()(exception.location, ClinicLocationSimpleSnippet),
        startAt: dateToISOString(exception.startAt),
        endAt: dateToISOString(exception.endAt),
        internalNote: exception.internalNote,
        ...mapSoftDeleteToDTO(exception),
        ...mapOwnershipToDTO(exception),
        ...mapLifeCycleToDTO(exception),
    };
}

export function scheduleExceptionsToDTO(exceptions: IScheduleException[]): ScheduleException[] {
    return exceptions.map(scheduleExceptionToDTO);
}
