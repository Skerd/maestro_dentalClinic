import {Router} from "express";
import {ObjectId} from "mongodb";
import authMW, {type AuthenticatedMWType} from "@coreModule/utilities/middlewares/authMW";
import {asyncHandler} from "@coreModule/utilities/middlewares/asyncHandler";
import {rateLimiter} from "@coreModule/utilities/middlewares/rateLimiter";
import {validateFormZod} from "@coreModule/utilities/middlewares/validateFormZod";
import {getModelCollectedData} from "@coreModule/database/collections";
import SchemaGuard from "@coreModule/database/security/schemaGuard";
import {expandWeeklyHours, intersectIntervals, localDayInterval, subtractIntervals} from "@coreModule/utilities/time/timeWindows";
import {apiValidationException} from "armonia/src/modules/core/helpers/exceptions";
import {clinicDayFormSchema} from "armonia/src/modules/dentalClinic/api/dentalClinic/private/appointment/appointment.form.validators";
import type {ClinicDayFormType} from "armonia/src/modules/dentalClinic/api/dentalClinic/private/appointment/appointment.forms";
import type {ClinicDayResponse} from "armonia/src/modules/dentalClinic/api/dentalClinic/private/appointment/appointment.dto";
import Appointment from "@dentalClinicModule/database/schemas/appointment/appointment";
import type {IClinicLocation} from "@dentalClinicModule/database/schemas/clinicLocation/clinicLocation";
import {nestedEntityToRef} from "@coreModule/utilities/mappers/common.mapper";
import {workingIntervals} from "@dentalClinicModule/utilities/services/clinicAvailability";
import {appointmentScopeFilter} from "@dentalClinicModule/utilities/services/clinicAccess";

import {clinicConfigService} from "@dentalClinicModule/database/schemas/clinicConfig/clinicConfig.service";
import {clinicLocationService} from "@dentalClinicModule/database/schemas/clinicLocation/clinicLocation.service";
import {practitionerService} from "@dentalClinicModule/database/schemas/practitioner/practitioner.service";
import {appointmentService} from "@dentalClinicModule/database/schemas/appointment/appointment.service";
import {scheduleExceptionService} from "@dentalClinicModule/database/schemas/scheduleException/scheduleException.service";
/**
 * The panel's day view: for one location, or every active location when none is given, a column per practitioner
 * who works there with their working hours and time off, the location's opening hours, and the appointments (scoped
 * like the list: a linked dentist sees only their own). Each location is laid out in its own time zone. Needs read
 * access to appointments.
 */
export const basePath = "/api/dentalClinic/clinicDay";
export const router = Router();

const iso = ({start, end}: {start: Date; end: Date}) => ({start: start.toISOString(), end: end.toISOString()});

router.post(
    "/view",
    authMW("private"),
    rateLimiter({windowMs: 60000, max: 120}),
    validateFormZod(clinicDayFormSchema),
    asyncHandler(async (params: AuthenticatedMWType & ClinicDayFormType): Promise<ClinicDayResponse> => {
        const {company, actionUserCtx, languageCode, date} = params;
        const readFields = SchemaGuard.sanitizeFields(Appointment, getModelCollectedData("appointments").readFields!, "read", actionUserCtx, languageCode);
        if (!readFields.startAt) throw apiValidationException("user_permissions_not_sufficient", "", null, languageCode);

        let locations: IClinicLocation[];
        if (params.location) {
            const location = ObjectId.isValid(params.location)
                ? await clinicLocationService.findOne({_id: new ObjectId(params.location), company: company._id, deletedAt: null}, {})
                : null;
            if (!location) throw apiValidationException("clinic_location_not_found", "", null, languageCode);
            locations = [location];
        } else {
            locations = await clinicLocationService.find({company: company._id, isActive: true, deletedAt: null}, {}, undefined, undefined, {sortOrder: 1, name: 1});
        }
        const days = new Map(locations.map((location) => [String(location._id), localDayInterval(date, location.timezone)]));
        const earliest = new Date(Math.min(...[...days.values()].map((day) => day.start.getTime())));
        const latest = new Date(Math.max(...[...days.values()].map((day) => day.end.getTime())));

        const [config, practitioners, appointments, exceptions] = locations.length
            ? await Promise.all([
                clinicConfigService.findForCompany(company._id),
                practitionerService.find({company: company._id, locations: {$in: locations.map((location) => location._id)}, isActive: true, deletedAt: null}, {}, undefined, undefined, {sortOrder: 1, displayName: 1}),
                appointmentService.find({
                    company: company._id,
                    location: {$in: locations.map((location) => location._id)},
                    deletedAt: null,
                    startAt: {$lt: latest},
                    endAt: {$gt: earliest},
                    status: {$ne: "cancelled"},
                    ...(await appointmentScopeFilter(company._id, actionUserCtx)),
                }, {}, undefined, undefined, {startAt: 1}),
                scheduleExceptionService.find({
                    company: company._id,
                    deletedAt: null,
                    startAt: {$lt: latest},
                    endAt: {$gt: earliest},
                }, {}),
            ])
            : [null, [], [], []];

        return {
            data: {
                date,
                slotIntervalMinutes: config?.slotIntervalMinutes ?? 15,
                locations: locations.map((location) => {
                    const day = days.get(String(location._id))!;
                    const inDay = <T extends {startAt: Date; endAt: Date}>(row: T) => row.startAt < day.end && row.endAt > day.start;
                    const closedDays = (location.closures ?? []).map((closure) => localDayInterval(closure.date, location.timezone));
                    const opening = subtractIntervals(intersectIntervals(expandWeeklyHours(location.openingHours ?? [], location.timezone, day.start, day.end), [day]), closedDays);
                    const here = practitioners.filter((practitioner) => (practitioner.locations ?? []).some((ref) => String(nestedEntityToRef(ref)) === String(location._id)));
                    // Time off of the practitioner anywhere, and whole-location closures of this location.
                    const timeOffOf = (practitionerId: ObjectId) => exceptions
                        .filter(inDay)
                        .filter((exception) => exception.practitioner
                            ? String(nestedEntityToRef(exception.practitioner)) === String(practitionerId)
                            : String(nestedEntityToRef(exception.location)) === String(location._id))
                        .map((exception) => iso({start: exception.startAt, end: exception.endAt}));
                    return {
                        _id: location._id.toString(),
                        name: location.name,
                        timezone: location.timezone,
                        opening: opening.map(iso),
                        practitioners: here.map((practitioner) => ({
                            _id: practitioner._id.toString(),
                            displayName: practitioner.displayName,
                            title: practitioner.title,
                            working: workingIntervals(practitioner, location, day).map(iso),
                            timeOff: timeOffOf(practitioner._id),
                        })),
                    };
                }),
                appointments: appointments.map((appointment) => ({
                    _id: appointment._id.toString(),
                    number: appointment.number,
                    status: appointment.status,
                    locationId: String(nestedEntityToRef(appointment.location)),
                    practitionerId: String(nestedEntityToRef(appointment.practitioner)),
                    startAt: appointment.startAt.toISOString(),
                    endAt: appointment.endAt.toISOString(),
                    patientName: readFields.patient ? `${appointment.patient.firstName} ${appointment.patient.lastName}` : undefined,
                    serviceName: appointment.snapshot.serviceName,
                })),
            },
        };
    }),
);
