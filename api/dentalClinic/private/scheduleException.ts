import {ObjectId} from "mongodb";
import type {ClientSession} from "mongoose";
import {nestedEntityToRef} from "@coreModule/utilities/mappers/common.mapper";
import {createCrudRouter} from "@coreModule/api/crudRouterFactory";
import {apiValidationException} from "armonia/src/modules/core/helpers/exceptions";
import {createScheduleExceptionFormSchema} from "armonia/src/modules/dentalClinic/api/dentalClinic/private/scheduleException/createScheduleException.form.validator";
import {editScheduleExceptionFormSchema} from "armonia/src/modules/dentalClinic/api/dentalClinic/private/scheduleException/editScheduleException.form.validator";
import ScheduleException from "@dentalClinicModule/database/schemas/scheduleException/scheduleException";
import {scheduleExceptionService} from "@dentalClinicModule/database/schemas/scheduleException/scheduleException.service";
import {scheduleExceptionToDTO, scheduleExceptionsToDTO} from "@dentalClinicModule/utilities/mappers/scheduleException/scheduleExceptionMapper.dto";
import {blockingAppointmentFilter} from "@dentalClinicModule/utilities/services/clinicAvailability";
import {lockPractitioner} from "@dentalClinicModule/utilities/services/appointmentBooking";
import {scheduleExceptionScopeFilter} from "@dentalClinicModule/utilities/services/clinicAccess";

import {clinicLocationService} from "@dentalClinicModule/database/schemas/clinicLocation/clinicLocation.service";
import {practitionerService} from "@dentalClinicModule/database/schemas/practitioner/practitioner.service";
import {appointmentService} from "@dentalClinicModule/database/schemas/appointment/appointment.service";
/** At most this many clashing booking numbers are named in the error. */
const CLASHES_SHOWN = 5;

export const basePath = "/api/dentalClinic/scheduleException";

/**
 * Time off over existing appointments would strand those patients: they must be moved or cancelled first. Locking
 * every practitioner affected stops a booking slipping in while this commits (create and moved windows alike).
 */
async function assertNoClashes(
    target: {practitioner: ObjectId} | {location: ObjectId},
    start: Date,
    end: Date,
    ctx: {companyId: ObjectId; session: ClientSession; languageCode: string},
): Promise<void> {
    const {companyId, session, languageCode} = ctx;
    let practitionerIds: ObjectId[];
    if ("practitioner" in target) {
        practitionerIds = [target.practitioner];
    } else {
        if (!(await clinicLocationService.exists({_id: target.location, company: companyId, deletedAt: null}, {session}))) {
            throw apiValidationException("clinic_location_not_found", "", null, languageCode);
        }
        practitionerIds = (await practitionerService.find({company: companyId, locations: target.location, deletedAt: null}, {session}, undefined, "_id")).map((p) => p._id);
    }
    for (const id of practitionerIds) await lockPractitioner(id, {companyId, session, languageCode});
    const clashes = await appointmentService.find({
        company: companyId,
        ...target,
        startAt: {$lt: end},
        endAt: {$gt: start},
        ...blockingAppointmentFilter(),
    }, {session}, undefined, "number", {startAt: 1}, CLASHES_SHOWN);
    if (clashes.length) {
        throw apiValidationException("schedule_exception_overlaps_appointments", "", null, languageCode, [clashes.map((a) => a.number).join(", ")]);
    }
}

export const {router} = createCrudRouter({
    collectionName: "scheduleexceptions",
    model: ScheduleException,
    service: scheduleExceptionService,
    entityName: "ScheduleException",
    createSchema: createScheduleExceptionFormSchema,
    editSchema: editScheduleExceptionFormSchema,
    toDTO: scheduleExceptionToDTO,
    toDTOArray: scheduleExceptionsToDTO,
    toSelect: (exceptions) => exceptions.map((exception) => ({value: exception._id.toString(), label: exception.startAt.toISOString()})),
    selectSearchField: "internalNote",
    defaultSort: {startAt: -1},
    extraListFilter: ({company, actionUserCtx}: any) => scheduleExceptionScopeFilter(company._id, actionUserCtx),
    buildCreateData: async ({practitioner, location, startAt, endAt, reason, internalNote, company, session, languageCode}: any) => {
        if (Boolean(practitioner) === Boolean(location)) {
            throw apiValidationException("schedule_exception_target_required", "", null, languageCode);
        }
        const target = practitioner ? {practitioner: new ObjectId(String(practitioner))} : {location: new ObjectId(String(location))};
        const start = new Date(startAt);
        const end = new Date(endAt);
        await assertNoClashes(target, start, end, {companyId: company._id, session, languageCode});
        return {...target, startAt: start, endAt: end, reason, internalNote};
    },
    /** Who it is for stays fixed; a moved window is checked against appointments like a new one. */
    buildUpdateData: async ({startAt, endAt, reason, internalNote, existing, company, session, languageCode}: any, writeFields) => {
        const start = startAt !== undefined && writeFields.startAt ? new Date(startAt) : existing.startAt;
        const end = endAt !== undefined && writeFields.endAt ? new Date(endAt) : existing.endAt;
        if (start.getTime() !== existing.startAt.getTime() || end.getTime() !== existing.endAt.getTime()) {
            if (end <= start) throw apiValidationException("schedule_exception_end_before_start", "", null, languageCode);
            const practitionerId = nestedEntityToRef(existing.practitioner);
            const locationId = nestedEntityToRef(existing.location);
            const target = practitionerId ? {practitioner: practitionerId} : {location: locationId!};
            await assertNoClashes(target, start, end, {companyId: company._id, session, languageCode});
        }
        return {
            startAt: start,
            endAt: end,
            ...(reason !== undefined && writeFields.reason && {reason}),
            ...(internalNote !== undefined && writeFields.internalNote && {internalNote}),
        };
    },
});
