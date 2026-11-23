import type {ObjectId} from "mongodb";
import type {AccountVerifiedContext} from "@coreModule/utilities/modules/moduleCompanyDefaults";
import {asCrossTenant, withTenant} from "@coreModule/utilities/endpoints/tenantScope";
import {nestedEntityToRef} from "@coreModule/utilities/mappers/common.mapper";
import {userService} from "@coreModule/database/schemas/user/user.service";
import {appointmentService} from "@dentalClinicModule/database/schemas/appointment/appointment.service";
import {linkClaimedFolder} from "@dentalClinicModule/utilities/services/patientRecords";

/**
 * P23.9: the appointments a guest booked with an email become the account's once it holds that email, verified; the
 * portal's appointments list shows them from then on, at every clinic. Only bookings with no account are taken. At each
 * clinic, the folder those bookings opened is tied to the account too when it carries the account's name.
 */
export async function claimGuestAppointments({userId, email, session, logger, languageCode}: AccountVerifiedContext): Promise<void> {
    const claimed = await asCrossTenant("an account claims its guest appointments at every clinic", async () => {
        const guestBookings = await appointmentService.find(
            {"patient.email": email, customer: null, anonymizedAt: null, deletedAt: null},
            {session},
            undefined,
            "_id company patientRecord",
        );
        if (guestBookings.length > 0) {
            await appointmentService.updateMany(
                {_id: {$in: guestBookings.map((booking) => booking._id)}, customer: null},
                {$set: {customer: userId}},
                {session},
            );
        }
        return guestBookings;
    });
    if (claimed.length === 0) return;
    logger.info(`Account ${userId} claimed ${claimed.length} guest appointment(s)`);

    const foldersByClinic = new Map<string, {clinicId: ObjectId; folderIds: ObjectId[]}>();
    for (const booking of claimed) {
        const clinicId = nestedEntityToRef(booking.company);
        const folderId = nestedEntityToRef(booking.patientRecord);
        if (!clinicId || !folderId) continue;
        const clinic = foldersByClinic.get(clinicId.toString()) ?? {clinicId, folderIds: []};
        clinic.folderIds.push(folderId);
        foldersByClinic.set(clinicId.toString(), clinic);
    }
    if (foldersByClinic.size === 0) return;
    const account = await userService.findByIdOrThrow(userId, {session}, undefined, "name surname");
    for (const {clinicId, folderIds} of foldersByClinic.values()) {
        await withTenant(clinicId, () => linkClaimedFolder(
            {companyId: clinicId, accountId: userId, folderIds, email, firstName: account.name, lastName: account.surname},
            {session, logger, languageCode, auditUserId: userId},
        ), "dentalClinic");
    }
}
