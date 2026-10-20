import {ObjectId} from "mongodb";
import {action} from "@coreModule/api/actionDecorator";
import {getModelCollectedData} from "@coreModule/database/collections";
import SchemaGuard from "@coreModule/database/security/schemaGuard";
import type {TransactionRequiredParams} from "@coreModule/utilities/middlewares/transactionUtils";
import type {UserContext} from "@coreModule/utilities/types/types";
import {apiValidationException} from "armonia/src/modules/core/helpers/exceptions";
import {validateSingleForm} from "armonia/src/modules/core/utilities/zod/shared.validator";
import type {Appointment as AppointmentDto} from "armonia/src/modules/dentalClinic/api/dentalClinic/private/appointment/appointment.dto";
import {cancelAppointmentFormSchema, rescheduleAppointmentFormSchema} from "armonia/src/modules/dentalClinic/api/dentalClinic/private/appointment/appointment.form.validators";
import type {CancelAppointmentFormType, RescheduleAppointmentFormType} from "armonia/src/modules/dentalClinic/api/dentalClinic/private/appointment/appointment.forms";
import Appointment, {type IAppointment} from "./appointment";
import {clinicConfigService} from "../clinicConfig/clinicConfig.service";
import {appointmentToDTO} from "@dentalClinicModule/utilities/mappers/appointment/appointmentMapper.dto";
import {assertAppointmentAccess} from "@dentalClinicModule/utilities/services/clinicAccess";
import {
    cancelAppointment,
    completeAppointment,
    confirmAppointment,
    markNoShow,
    rescheduleAppointment,
} from "@dentalClinicModule/utilities/services/appointmentLifecycle";

type ActionParams<F> = TransactionRequiredParams & F;

/**
 * Actions get no permission check from the CRUD router: each requires write
 * access to `status`, which role packs grant to receptionists and dentists, and
 * a dentist linked to a profile may act only on their own appointments.
 */
function assertWriteStatus(actionUserCtx: UserContext, languageCode: string): void {
    const writeFields = SchemaGuard.sanitizeFields(
        Appointment,
        getModelCollectedData("appointments").writeFields!,
        "write",
        actionUserCtx,
        languageCode,
    );
    if (!writeFields.status) {
        throw apiValidationException("user_permissions_not_sufficient", "", null, languageCode);
    }
}

async function loadAppointment(params: TransactionRequiredParams & {_id: string}): Promise<IAppointment> {
    const {_id, company, session, languageCode, actionUserCtx} = params;
    assertWriteStatus(actionUserCtx, languageCode);
    const appointment = ObjectId.isValid(_id)
        ? await Appointment.findOne({_id: new ObjectId(_id), company: company._id, deletedAt: null}).session(session)
        : null;
    if (!appointment) throw apiValidationException("appointment_not_found", "", null, languageCode);
    await assertAppointmentAccess(appointment, company._id, actionUserCtx, {languageCode, session});
    return appointment;
}

async function toDto(appointment: IAppointment, params: TransactionRequiredParams): Promise<AppointmentDto> {
    const {session, actionUserCtx, languageCode} = params;
    const readFields = SchemaGuard.sanitizeFields(
        Appointment,
        getModelCollectedData("appointments").readFields!,
        "read",
        actionUserCtx,
        languageCode,
    );
    const populate = SchemaGuard.generatePopulate(readFields, Appointment.schema);
    const fresh = await Appointment.findById(appointment._id).populate(populate.populate).session(session);
    return appointmentToDTO(fresh ?? appointment);
}

function ctxOf(params: TransactionRequiredParams) {
    return {session: params.session, logger: params.logger, languageCode: params.languageCode, auditUserId: params.actionUserCtx.userId};
}

export class AppointmentActions {
    /** Accepts an online request the clinic wanted to review first. */
    @action({auth: "private", transaction: true, rateLimit: {windowMs: 60000, max: 60}, schema: validateSingleForm})
    async confirm(params: ActionParams<{_id: string}>): Promise<AppointmentDto> {
        const appointment = await loadAppointment(params);
        await confirmAppointment(appointment, {by: "staff", userId: params.actionUserCtx.userId}, ctxOf(params));
        return toDto(appointment, params);
    }

    /** Moves the appointment; staff are not bound by the online notice rules and may change the practitioner. */
    @action({auth: "private", transaction: true, rateLimit: {windowMs: 60000, max: 30}, schema: rescheduleAppointmentFormSchema})
    async reschedule(params: ActionParams<RescheduleAppointmentFormType>): Promise<AppointmentDto> {
        const appointment = await loadAppointment(params);
        await rescheduleAppointment(
            appointment,
            {by: "staff", userId: params.actionUserCtx.userId, date: params.date, time: params.time, practitionerId: params.practitioner},
            ctxOf(params),
        );
        return toDto(appointment, params);
    }

    @action({auth: "private", transaction: true, rateLimit: {windowMs: 60000, max: 30}, schema: cancelAppointmentFormSchema})
    async cancel(params: ActionParams<CancelAppointmentFormType>): Promise<AppointmentDto> {
        const appointment = await loadAppointment(params);
        await cancelAppointment(appointment, {by: "staff", userId: params.actionUserCtx.userId, reason: params.reason}, ctxOf(params));
        return toDto(appointment, params);
    }

    @action({auth: "private", transaction: true, rateLimit: {windowMs: 60000, max: 60}, schema: validateSingleForm})
    async complete(params: ActionParams<{_id: string}>): Promise<AppointmentDto> {
        const appointment = await loadAppointment(params);
        await completeAppointment(appointment, {by: "staff", userId: params.actionUserCtx.userId}, ctxOf(params));
        return toDto(appointment, params);
    }

    /** The patient never came. Allowed once the start plus the clinic's grace period has passed. */
    @action({auth: "private", transaction: true, rateLimit: {windowMs: 60000, max: 60}, schema: validateSingleForm})
    async noShow(params: ActionParams<{_id: string}>): Promise<AppointmentDto> {
        const appointment = await loadAppointment(params);
        const config = await clinicConfigService.getOrCreateForCompany(params.company._id, ctxOf(params));
        await markNoShow(appointment, {by: "staff", userId: params.actionUserCtx.userId, graceMinutes: config.noShowGraceMinutes}, ctxOf(params));
        return toDto(appointment, params);
    }
}
