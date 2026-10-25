import {ObjectId} from "mongodb";
import {createCrudRouter} from "@coreModule/api/crudRouterFactory";
import {buildCreateDataFromSchemaDef, buildUpdateDataFromSchemaDef} from "@coreModule/api/buildUpdateDataFromSchemaDef";
import {restoreUnlessKeyTaken} from "@coreModule/api/restoreUnlessKeyTaken";
import {mediaUploadMW} from "@coreModule/utilities/middlewares/mediaUploadMW";
import {nestedEntityToRef} from "@coreModule/utilities/mappers/common.mapper";
import {apiValidationException} from "armonia/src/modules/core/helpers/exceptions";
import {PractitionerSchemaDef} from "armonia/src/modules/dentalClinic/api/dentalClinic/private/practitioner/practitioner.schema-def";
import {createPractitionerFormSchema} from "armonia/src/modules/dentalClinic/api/dentalClinic/private/practitioner/createPractitioner.form.validator";
import {editPractitionerFormSchema} from "armonia/src/modules/dentalClinic/api/dentalClinic/private/practitioner/editPractitioner.form.validator";
import {practitionerSelectFormSchema} from "armonia/src/modules/dentalClinic/api/dentalClinic/private/practitioner/practitionerSelect.form.validator";
import Practitioner from "@dentalClinicModule/database/schemas/practitioner/practitioner";
import {practitionerService} from "@dentalClinicModule/database/schemas/practitioner/practitioner.service";
import Appointment from "@dentalClinicModule/database/schemas/appointment/appointment";
import {practitionerToDTO, practitionersToDTO} from "@dentalClinicModule/utilities/mappers/practitioner/practitionerMapper.dto";
import {practitionersToSelect} from "@dentalClinicModule/utilities/mappers/practitioner/practitionerMapper.select";
import {PractitionerActions} from "@dentalClinicModule/database/schemas/practitioner/practitioner.actions";
import {blockingAppointmentFilter} from "@dentalClinicModule/utilities/services/clinicAvailability";
import {lockPractitioner} from "@dentalClinicModule/utilities/services/appointmentBooking";

const mediaUpload = mediaUploadMW({fields: {photo: 1}, maxFileSize: 10 * 1024 * 1024});

type ScheduleInput = {schedule?: {location: unknown; startTime: string; endTime: string}[]; locations?: unknown[]};

/** Each working-hours row must be a real span at one of the person's own locations. */
function assertValidSchedule(data: ScheduleInput, existing: ScheduleInput | undefined, languageCode: string): void {
    const schedule = data.schedule ?? existing?.schedule ?? [];
    const locations = new Set((data.locations ?? existing?.locations ?? []).map((location) => String(nestedEntityToRef(location))));
    for (const row of schedule) {
        if (row.endTime <= row.startTime) throw apiValidationException("clinic_hours_end_before_start", "", null, languageCode);
        if (!locations.has(String(nestedEntityToRef(row.location)))) {
            throw apiValidationException("practitioner_schedule_location_not_listed", "", null, languageCode);
        }
    }
}

const SCHEDULE_FIELDS = ["schedule", "services", "locations", "isBookable", "isActive"] as const;

export const basePath = "/api/dentalClinic/practitioner";

export const {router} = createCrudRouter({
    collectionName: "practitioners",
    model: Practitioner,
    service: practitionerService,
    entityName: "Practitioner",
    createSchema: createPractitionerFormSchema,
    editSchema: editPractitionerFormSchema,
    selectSchema: practitionerSelectFormSchema,
    toDTO: practitionerToDTO,
    toDTOArray: practitionersToDTO,
    toSelect: practitionersToSelect,
    selectSearchField: "displayName",
    selectProjection: "_id displayName",
    defaultSort: {sortOrder: 1, displayName: 1},
    actions: PractitionerActions,
    extraSelectFilter: ({service, location}: any) => ({
        isActive: true,
        ...(service ? {services: new ObjectId(String(service))} : {}),
        ...(location ? {locations: new ObjectId(String(location))} : {}),
    }),
    createMiddleware: [mediaUpload],
    editMiddleware: [mediaUpload],
    buildCreateData: (params: any) => {
        assertValidSchedule(params, undefined, params.languageCode);
        return buildCreateDataFromSchemaDef(PractitionerSchemaDef)(params);
    },
    buildUpdateData: (params: any, writeFields) => buildUpdateDataFromSchemaDef(PractitionerSchemaDef)(params, writeFields),
    /**
     * Schedule and eligibility changes take the booking lock, so a booking racing
     * the edit is retried against the new hours. Taking someone out of service
     * with upcoming appointments is refused: those must be moved first.
     */
    afterUpdate: async (params: any, existing) => {
        const {company, session, languageCode} = params;
        if (!SCHEDULE_FIELDS.some((field) => params[field] !== undefined)) return;
        assertValidSchedule(params, existing, languageCode);
        await lockPractitioner(existing._id, {companyId: company._id, session, languageCode});
        if (params.isActive === false && existing.isActive) {
            const upcoming = await Appointment.countDocuments({
                company: company._id,
                practitioner: existing._id,
                startAt: {$gt: new Date()},
                ...blockingAppointmentFilter(),
            }).session(session);
            if (upcoming > 0) {
                throw apiValidationException("practitioner_has_future_appointments", "", null, languageCode, [String(upcoming)]);
            }
        }
    },
    overrideRestoreHandler: restoreUnlessKeyTaken({
        model: Practitioner,
        service: practitionerService,
        entityName: "Practitioner",
        keys: ["staffUser"],
        errorCode: "practitioner_user_taken",
    }),
});
