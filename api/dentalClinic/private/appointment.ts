import {ObjectId} from "mongodb";
import {apiValidationException} from "armonia/src/modules/core/helpers/exceptions";
import type {AppointmentPatient} from "armonia/src/modules/dentalClinic/api/dentalClinic/private/appointment/appointment.dto";
import type {IPatient} from "@dentalClinicModule/database/schemas/patient/patient";
import {noEditAppointmentFormSchema} from "armonia/src/modules/dentalClinic/api/dentalClinic/private/appointment/noEditAppointment.form.validator";
import {createCrudRouter} from "@coreModule/api/crudRouterFactory";
import {appointmentListFormSchema, createAppointmentFormSchema} from "armonia/src/modules/dentalClinic/api/dentalClinic/private/appointment/appointment.form.validators";
import type {AppointmentWhen} from "armonia/src/modules/dentalClinic/api/dentalClinic/private/appointment/appointment.constants";
import {companyTodayOf, companyTimeZoneOf} from "@coreModule/utilities/time/companyTimeZone";
import {localDayInterval} from "@coreModule/utilities/time/timeWindows";
import Appointment from "@dentalClinicModule/database/schemas/appointment/appointment";
import {appointmentService} from "@dentalClinicModule/database/schemas/appointment/appointment.service";
import {AppointmentActions} from "@dentalClinicModule/database/schemas/appointment/appointment.actions";
import {clinicConfigService} from "@dentalClinicModule/database/schemas/clinicConfig/clinicConfig.service";
import {appointmentToDTO, appointmentsToDTO} from "@dentalClinicModule/utilities/mappers/appointment/appointmentMapper.dto";
import {buildAppointment, loadBookingTargets} from "@dentalClinicModule/utilities/services/appointmentBooking";
import {appointmentScopeFilter} from "@dentalClinicModule/utilities/services/clinicAccess";
import {notifyPatient} from "@dentalClinicModule/utilities/services/appointmentNotify";
import {findOrCreatePatient, loadPatientOrThrow} from "@dentalClinicModule/utilities/services/patientRecords";

export const basePath = "/api/dentalClinic/appointment";

/** The contact a booking copies from a picked folder; a folder without email or phone can't be booked from. */
function folderContact(folder: IPatient, languageCode: string): AppointmentPatient {
    if (!folder.email || !folder.phone) throw apiValidationException("appointment_patient_folder_incomplete", "", null, languageCode);
    return {firstName: folder.firstName, lastName: folder.lastName, email: folder.email, phone: folder.phone};
}

/** The typed contact of a new patient: all four fields, since no folder supplies them. */
function typedContact(typed: Partial<AppointmentPatient> | undefined, languageCode: string): AppointmentPatient {
    const firstName = typed?.firstName?.trim();
    const lastName = typed?.lastName?.trim();
    const email = typed?.email?.trim();
    const phone = typed?.phone?.trim();
    if (!firstName || !lastName || !email || !phone) throw apiValidationException("appointment_patient_contact_required", "", null, languageCode);
    return {firstName, lastName, email, phone};
}

/** The "When" quick filter: under way or still to come, on the company's today (GLB-09), or over. */
async function whenFilter(when: AppointmentWhen | undefined, companyId: ObjectId): Promise<Record<string, unknown>> {
    if (!when) return {};
    const now = new Date();
    if (when === "upcoming") return {endAt: {$gt: now}};
    if (when === "past") return {endAt: {$lte: now}};
    const day = localDayInterval(await companyTodayOf(companyId, {now}), await companyTimeZoneOf(companyId));
    return {startAt: {$gte: day.start, $lt: day.end}};
}

// Appointments are immutable after create — every change goes through AppointmentActions.
// editSchema/buildUpdateData are stubs required by createCrudRouter; PATCH is a no-op.
export const {router} = createCrudRouter({
    collectionName: "appointments",
    model: Appointment,
    service: appointmentService,
    entityName: "Appointment",
    createSchema: createAppointmentFormSchema,
    editSchema: noEditAppointmentFormSchema,
    toDTO: appointmentToDTO,
    toDTOArray: appointmentsToDTO,
    toSelect: (appointments) => appointments.map((appointment) => ({value: appointment._id.toString(), label: appointment.number})),
    selectSearchField: "number",
    defaultSort: {startAt: -1},
    actions: AppointmentActions,
    listSchema: appointmentListFormSchema,
    // A dentist linked to a profile sees only their own appointments.
    extraListFilter: async ({company, actionUserCtx, when}: any) => ({
        ...(await appointmentScopeFilter(company._id, actionUserCtx)),
        ...(await whenFilter(when, company._id)),
    }),
    extraSelectFilter: ({company, actionUserCtx}: any) => appointmentScopeFilter(company._id, actionUserCtx),
    documentFilter: async ({company, actionUserCtx}: any) => ({company: company._id, ...(await appointmentScopeFilter(company._id, actionUserCtx))}),
    /** Staff booking: the same free-time checks and practitioner lock as online, without the online notice rules. */
    buildCreateData: async (params: any) => {
        const {company, session, logger, languageCode, actionUserCtx} = params;
        const ctx = {session, logger, languageCode, auditUserId: actionUserCtx.userId};
        const config = await clinicConfigService.getOrCreateForCompany(company._id, ctx);
        const {service, location} = await loadBookingTargets(company._id, params, {languageCode, online: false, session});
        const customerId = params.customer ? new ObjectId(String(params.customer)) : undefined;
        // Staff pick the folder when they know the patient, and its contact is used; otherwise the typed contact
        // is required and a folder is found or opened from it (UX-05: pick before type).
        const folder = params.patientRecord ? await loadPatientOrThrow(company._id, String(params.patientRecord), ctx) : undefined;
        const contact = folder ? folderContact(folder, languageCode) : typedContact(params.patient, languageCode);
        const patient = folder ?? await findOrCreatePatient({companyId: company._id, accountId: customerId, contact, source: "other"}, ctx);
        return buildAppointment(
            {
                companyId: company._id,
                config,
                service,
                location,
                practitionerId: params.practitioner,
                date: params.date,
                time: params.time,
                patient: contact,
                customerId,
                patientId: patient._id,
                note: params.note,
                idempotencyKey: params.idempotencyKey,
                source: "staff",
            },
            ctx,
        );
    },
    afterCreate: async (created, {session, languageCode}: any) => {
        await notifyPatient("confirmed", created, {session, languageCode});
    },
    buildUpdateData: () => ({}),
});
