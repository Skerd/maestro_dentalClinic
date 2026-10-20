/**
 * Who sees which appointments. A staff user linked to a practitioner profile
 * (and not an admin) sees and acts on only that practitioner's appointments and
 * time off; everyone else gets what their role grants. Reuses the
 * marketplace idea of record filters instead of new permission machinery.
 */

import {ObjectId} from "mongodb";
import type {ClientSession} from "mongoose";
import {apiValidationException} from "armonia/src/modules/core/helpers/exceptions";
import {nestedEntityToRef} from "@coreModule/utilities/mappers/common.mapper";
import type {UserContext} from "@coreModule/utilities/types/types";
import Practitioner from "@dentalClinicModule/database/schemas/practitioner/practitioner";

type Caller = Pick<UserContext, "userId" | "isAdmin">;

/** The practitioner profile the caller is linked to, or null for admins and unlinked staff. */
export async function linkedPractitionerId(companyId: ObjectId, caller: Caller, session?: ClientSession | null): Promise<ObjectId | null> {
    if (caller.isAdmin || !ObjectId.isValid(caller.userId)) return null;
    const practitioner = await Practitioner.findOne({company: companyId, staffUser: new ObjectId(caller.userId), deletedAt: null})
        .select("_id")
        .session(session ?? null);
    return practitioner?._id ?? null;
}

/** Appointment filter limiting a linked practitioner to their own appointments. */
export async function appointmentScopeFilter(companyId: ObjectId, caller: Caller, session?: ClientSession | null): Promise<Record<string, unknown>> {
    const practitionerId = await linkedPractitionerId(companyId, caller, session);
    return practitionerId ? {practitioner: practitionerId} : {};
}

/** Time-off filter: a linked practitioner sees their own time off and whole-location closures. */
export async function scheduleExceptionScopeFilter(companyId: ObjectId, caller: Caller, session?: ClientSession | null): Promise<Record<string, unknown>> {
    const practitionerId = await linkedPractitionerId(companyId, caller, session);
    return practitionerId ? {$or: [{practitioner: practitionerId}, {location: {$exists: true}}]} : {};
}

/** Throws unless the caller may act on this appointment (repeats the list scoping after a load by id). */
export async function assertAppointmentAccess(
    appointment: {practitioner: unknown},
    companyId: ObjectId,
    caller: Caller,
    ctx: {languageCode: string; session?: ClientSession | null},
): Promise<void> {
    const practitionerId = await linkedPractitionerId(companyId, caller, ctx.session);
    if (practitionerId && String(nestedEntityToRef(appointment.practitioner)) !== String(practitionerId)) {
        throw apiValidationException("user_permissions_not_sufficient", "", null, ctx.languageCode);
    }
}
