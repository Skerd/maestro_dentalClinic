import {ObjectId} from "mongodb";
import {createCrudRouter} from "@coreModule/api/crudRouterFactory";
import {apiValidationException} from "armonia/src/modules/core/helpers/exceptions";
import {createScheduleExceptionFormSchema} from "armonia/src/modules/dentalClinic/api/dentalClinic/private/scheduleException/createScheduleException.form.validator";
import {editScheduleExceptionFormSchema} from "armonia/src/modules/dentalClinic/api/dentalClinic/private/scheduleException/editScheduleException.form.validator";
import ScheduleException from "@dentalClinicModule/database/schemas/scheduleException/scheduleException";
import {scheduleExceptionService} from "@dentalClinicModule/database/schemas/scheduleException/scheduleException.service";
import ClinicLocation from "@dentalClinicModule/database/schemas/clinicLocation/clinicLocation";
import Practitioner from "@dentalClinicModule/database/schemas/practitioner/practitioner";
import Appointment from "@dentalClinicModule/database/schemas/appointment/appointment";
import {scheduleExceptionToDTO, scheduleExceptionsToDTO} from "@dentalClinicModule/utilities/mappers/scheduleException/scheduleExceptionMapper.dto";
import {blockingAppointmentFilter} from "@dentalClinicModule/utilities/services/clinicAvailability";
import {lockPractitioner} from "@dentalClinicModule/utilities/services/appointmentBooking";
import {scheduleExceptionScopeFilter} from "@dentalClinicModule/utilities/services/clinicAccess";

/** At most this many clashing booking numbers are named in the error. */
const CLASHES_SHOWN = 5;

export const basePath = "/api/dentalClinic/scheduleException";

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
    /**
     * Time off over existing appointments would strand those patients: they must
     * be moved or cancelled first. Locking every practitioner affected stops a
     * booking slipping in while this commits.
     */
    buildCreateData: async ({practitioner, location, startAt, endAt, internalNote, company, session, languageCode}: any) => {
        if (Boolean(practitioner) === Boolean(location)) {
            throw apiValidationException("schedule_exception_target_required", "", null, languageCode);
        }
        const companyId = company._id;
        const start = new Date(startAt);
        const end = new Date(endAt);
        let practitionerIds: ObjectId[];
        if (practitioner) {
            practitionerIds = [new ObjectId(String(practitioner))];
        } else {
            const locationId = new ObjectId(String(location));
            if (!(await ClinicLocation.exists({_id: locationId, company: companyId, deletedAt: null}).session(session))) {
                throw apiValidationException("clinic_location_not_found", "", null, languageCode);
            }
            practitionerIds = (await Practitioner.find({company: companyId, locations: locationId, deletedAt: null}).select("_id").session(session)).map((p) => p._id);
        }
        for (const id of practitionerIds) await lockPractitioner(id, {companyId, session, languageCode});

        const clashes = await Appointment.find({
            company: companyId,
            ...(practitioner ? {practitioner: practitionerIds[0]} : {location: new ObjectId(String(location))}),
            startAt: {$lt: end},
            endAt: {$gt: start},
            ...blockingAppointmentFilter(),
        }).select("number").sort({startAt: 1}).limit(CLASHES_SHOWN).session(session);
        if (clashes.length) {
            throw apiValidationException("schedule_exception_overlaps_appointments", "", null, languageCode, [clashes.map((a) => a.number).join(", ")]);
        }
        return {
            ...(practitioner ? {practitioner: practitionerIds[0]} : {location: new ObjectId(String(location))}),
            startAt: start,
            endAt: end,
            internalNote,
        };
    },
    // The window was checked against appointments at create; only the note changes.
    buildUpdateData: ({internalNote}: any, writeFields) => ({
        ...(internalNote !== undefined && writeFields.internalNote && {internalNote}),
    }),
});
