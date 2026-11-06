import {ObjectId} from "mongodb";
import {noEditAppointmentFormSchema} from "armonia/src/modules/dentalClinic/api/dentalClinic/private/appointment/noEditAppointment.form.validator";
import {createCrudRouter} from "@coreModule/api/crudRouterFactory";
import {createAppointmentFormSchema} from "armonia/src/modules/dentalClinic/api/dentalClinic/private/appointment/appointment.form.validators";
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
    // A dentist linked to a profile sees only their own appointments.
    extraListFilter: ({company, actionUserCtx}: any) => appointmentScopeFilter(company._id, actionUserCtx),
    extraSelectFilter: ({company, actionUserCtx}: any) => appointmentScopeFilter(company._id, actionUserCtx),
    documentFilter: async ({company, actionUserCtx}: any) => ({company: company._id, ...(await appointmentScopeFilter(company._id, actionUserCtx))}),
    /** Staff booking: the same free-time checks and practitioner lock as online, without the online notice rules. */
    buildCreateData: async (params: any) => {
        const {company, session, logger, languageCode, actionUserCtx} = params;
        const ctx = {session, logger, languageCode, auditUserId: actionUserCtx.userId};
        const config = await clinicConfigService.getOrCreateForCompany(company._id, ctx);
        const {service, location} = await loadBookingTargets(company._id, params, {languageCode, online: false, session});
        const customerId = params.customer ? new ObjectId(String(params.customer)) : undefined;
        // Staff pick the folder when they know the patient; otherwise it is found or opened from the contact.
        const patient = params.patientRecord
            ? await loadPatientOrThrow(company._id, String(params.patientRecord), ctx)
            : await findOrCreatePatient({companyId: company._id, accountId: customerId, contact: params.patient, source: "other"}, ctx);
        return buildAppointment(
            {
                companyId: company._id,
                config,
                service,
                location,
                practitionerId: params.practitioner,
                date: params.date,
                time: params.time,
                patient: params.patient,
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
