import {Router} from "express";
import {ObjectId} from "mongodb";
import authMW, {type AuthenticatedMWType} from "@coreModule/utilities/middlewares/authMW";
import {asyncHandler} from "@coreModule/utilities/middlewares/asyncHandler";
import {rateLimiter} from "@coreModule/utilities/middlewares/rateLimiter";
import {validateFormZod} from "@coreModule/utilities/middlewares/validateFormZod";
import {getModelCollectedData} from "@coreModule/database/collections";
import SchemaGuard from "@coreModule/database/security/schemaGuard";
import {localDayInterval} from "@coreModule/utilities/time/timeWindows";
import {apiValidationException} from "armonia/src/modules/core/helpers/exceptions";
import {clinicDayFormSchema} from "armonia/src/modules/dentalClinic/api/dentalClinic/private/appointment/appointment.form.validators";
import type {ClinicDayFormType} from "armonia/src/modules/dentalClinic/api/dentalClinic/private/appointment/appointment.forms";
import type {ClinicDayResponse} from "armonia/src/modules/dentalClinic/api/dentalClinic/private/appointment/appointment.dto";
import ClinicLocation from "@dentalClinicModule/database/schemas/clinicLocation/clinicLocation";
import Practitioner from "@dentalClinicModule/database/schemas/practitioner/practitioner";
import Appointment from "@dentalClinicModule/database/schemas/appointment/appointment";
import ScheduleException from "@dentalClinicModule/database/schemas/scheduleException/scheduleException";
import {workingIntervals} from "@dentalClinicModule/utilities/services/clinicAvailability";
import {appointmentScopeFilter} from "@dentalClinicModule/utilities/services/clinicAccess";

/**
 * One location's day for the panel: a column per practitioner who works there,
 * their working hours and time off, and the appointments (scoped like the list:
 * a linked dentist sees only their own). Needs read access to appointments.
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

        const location = ObjectId.isValid(params.location)
            ? await ClinicLocation.findOne({_id: new ObjectId(params.location), company: company._id, deletedAt: null})
            : null;
        if (!location) throw apiValidationException("clinic_location_not_found", "", null, languageCode);
        const day = localDayInterval(date, location.timezone);

        const [practitioners, appointments] = await Promise.all([
            Practitioner.find({company: company._id, locations: location._id, isActive: true, deletedAt: null}).sort({sortOrder: 1, displayName: 1}),
            Appointment.find({
                company: company._id,
                location: location._id,
                deletedAt: null,
                startAt: {$lt: day.end},
                endAt: {$gt: day.start},
                status: {$ne: "cancelled"},
                ...(await appointmentScopeFilter(company._id, actionUserCtx)),
            }).sort({startAt: 1}),
        ]);
        const exceptions = await ScheduleException.find({
            company: company._id,
            deletedAt: null,
            startAt: {$lt: day.end},
            endAt: {$gt: day.start},
            $or: [{practitioner: {$in: practitioners.map((practitioner) => practitioner._id)}}, {location: location._id}],
        });
        const timeOffOf = (practitionerId: ObjectId) => exceptions
            .filter((exception) => !exception.practitioner || String(exception.practitioner) === String(practitionerId))
            .map((exception) => iso({start: exception.startAt, end: exception.endAt}));

        return {
            data: {
                date,
                timezone: location.timezone,
                practitioners: practitioners.map((practitioner) => ({
                    _id: practitioner._id.toString(),
                    displayName: practitioner.displayName,
                    title: practitioner.title,
                    working: workingIntervals(practitioner, location, day).map(iso),
                    timeOff: timeOffOf(practitioner._id),
                })),
                appointments: appointments.map((appointment) => ({
                    _id: appointment._id.toString(),
                    number: appointment.number,
                    status: appointment.status,
                    practitionerId: String(appointment.practitioner),
                    startAt: appointment.startAt.toISOString(),
                    endAt: appointment.endAt.toISOString(),
                    patientName: readFields.patient ? `${appointment.patient.firstName} ${appointment.patient.lastName}` : undefined,
                    serviceName: appointment.snapshot.serviceName,
                })),
            },
        };
    }),
);
