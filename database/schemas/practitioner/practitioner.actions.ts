import {ObjectId} from "mongodb";
import {action} from "@coreModule/api/actionDecorator";
import {apiValidationException} from "armonia/src/modules/core/helpers/exceptions";
import {validateSingleForm} from "armonia/src/modules/core/utilities/zod/shared.validator";
import type {ActionMessage} from "armonia/src/modules/core/types/shared.types";
import {blockingAppointmentFilter} from "@dentalClinicModule/utilities/services/clinicAvailability";
import {lockPractitioner} from "@dentalClinicModule/utilities/services/appointmentBooking";
import PractitionerModel from "./practitioner";
import {practitionerService} from "./practitioner.service";

import {appointmentService} from "@dentalClinicModule/database/schemas/appointment/appointment.service";
export class PractitionerActions {
    @action({
        auth: "private",
        rateLimit: {windowMs: 60000, max: 30},
        schema: validateSingleForm,
        transaction: true,
    })
    async activate(params: Record<string, any>): Promise<ActionMessage> {
        return setActiveState(params, true);
    }

    @action({
        auth: "private",
        rateLimit: {windowMs: 60000, max: 30},
        schema: validateSingleForm,
        transaction: true,
    })
    async deactivate(params: Record<string, any>): Promise<ActionMessage> {
        return setActiveState(params, false);
    }
}

async function setActiveState(params: Record<string, any>, isActive: boolean): Promise<ActionMessage> {
    const {logger, languageCode, session, company, actionUserCtx, _id} = params;

    const existing = await practitionerService.findOneOrThrow(
        {_id: new ObjectId(_id), company: company._id},
        {session, logger, languageCode},
    );

    if (existing.isActive === isActive) {
        return {message: isActive ? "Practitioner already active" : "Practitioner already inactive"};
    }

    // Same lock the edit form takes, so a booking in flight retries against this change.
    await lockPractitioner(existing._id, {companyId: company._id, session, languageCode});
    if (!isActive) {
        const upcoming = await appointmentService.count({
            company: company._id,
            practitioner: existing._id,
            startAt: {$gt: new Date()},
            ...blockingAppointmentFilter(),
        }, {session: session});
        if (upcoming > 0) {
            throw apiValidationException("practitioner_has_future_appointments", "", null, languageCode, [String(upcoming)]);
        }
    }

    await practitionerService.updateByIdOrThrow(
        existing._id,
        {isActive},
        {session, logger, languageCode, auditUserId: actionUserCtx.userId},
    );

    return {message: isActive ? "Practitioner activated" : "Practitioner deactivated"};
}
