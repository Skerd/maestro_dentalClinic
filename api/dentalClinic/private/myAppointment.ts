import {Router} from "express";
import {ObjectId} from "mongodb";
import authMW, {type AuthenticatedMWType} from "@coreModule/utilities/middlewares/authMW";
import {asyncHandler} from "@coreModule/utilities/middlewares/asyncHandler";
import {rateLimiter} from "@coreModule/utilities/middlewares/rateLimiter";
import {validateFormZod} from "@coreModule/utilities/middlewares/validateFormZod";
import {transactionHandler, type TransactionRequiredParams} from "@coreModule/utilities/middlewares/transactionUtils";
import {apiValidationException} from "armonia/src/modules/core/helpers/exceptions";
import {validateSingleForm} from "armonia/src/modules/core/utilities/zod/shared.validator";
import type {
    PublicAppointmentResponse,
    PublicAppointmentsResponse,
} from "armonia/src/modules/dentalClinic/api/dentalClinic/public/clinicStorefront/clinicStorefront.response.types";
import Appointment from "@dentalClinicModule/database/schemas/appointment/appointment";
import {appointmentToPublic} from "@dentalClinicModule/utilities/mappers/appointment/appointmentMapper.dto";
import {cancelAppointment} from "@dentalClinicModule/utilities/services/appointmentLifecycle";

/**
 * A signed-in patient's own appointments. Scoped to the caller as `customer`, so
 * it needs no collection permission: the signup role has none, and staff
 * permissions are not what lets someone see their own booking.
 */
export const basePath = "/api/dentalClinic/myAppointment";
export const router = Router();

const CURRENCY = {path: "currency", select: "name symbol abbreviation"};

router.post(
    "/list",
    authMW("private"),
    rateLimiter({windowMs: 60000, max: 60}),
    asyncHandler(async ({actionUserCtx, company}: AuthenticatedMWType): Promise<PublicAppointmentsResponse> => {
        const appointments = await Appointment.find({
            company: company._id,
            customer: new ObjectId(actionUserCtx.userId),
            deletedAt: null,
        }).sort({startAt: -1}).limit(100).populate(CURRENCY);
        return {data: appointments.map((appointment) => appointmentToPublic(appointment))};
    }),
);

router.post(
    "/cancel",
    authMW("private"),
    rateLimiter({windowMs: 60000, max: 10}),
    transactionHandler(),
    validateFormZod(validateSingleForm),
    asyncHandler(async (params: TransactionRequiredParams & {_id: string}): Promise<PublicAppointmentResponse> => {
        const {_id, actionUserCtx, company, session, logger, languageCode} = params;
        const appointment = ObjectId.isValid(_id)
            ? await Appointment.findOne({
                _id: new ObjectId(_id),
                company: company._id,
                customer: new ObjectId(actionUserCtx.userId),
                deletedAt: null,
            }).session(session)
            : null;
        if (!appointment) throw apiValidationException("appointment_not_found", "", null, languageCode);
        await cancelAppointment(
            appointment,
            {by: "patient", userId: actionUserCtx.userId, reason: "cancelled_by_patient"},
            {session, logger, languageCode, auditUserId: actionUserCtx.userId},
        );
        await appointment.populate(CURRENCY);
        return {data: appointmentToPublic(appointment)};
    }),
);
