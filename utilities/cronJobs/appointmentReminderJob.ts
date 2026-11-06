/**
 * Every 15 minutes: reminds patients of confirmed appointments that start within
 * their clinic's reminder window. `reminderSentAt` is stamped first, so a
 * reminder goes out at most once even if two runs overlap; a reschedule clears it.
 */

import type {ObjectId} from "mongodb";
import {CONSTANTS} from "@coreModule/environment";
import {getLogger, serverLogger} from "@coreModule/loggers/serverLog";
import Appointment from "@dentalClinicModule/database/schemas/appointment/appointment";
import {notifyPatient} from "@dentalClinicModule/utilities/services/appointmentNotify";

import {clinicConfigService} from "@dentalClinicModule/database/schemas/clinicConfig/clinicConfig.service";
import {appointmentService} from "@dentalClinicModule/database/schemas/appointment/appointment.service";
const HOUR = 3600 * 1000;
const BATCH_SIZE = 200;

export async function runAppointmentReminders(company: ObjectId, parentLogger?: serverLogger): Promise<void> {
    const logger = getLogger("appointment_reminders", parentLogger);
    const languageCode = CONSTANTS.DEFAULT_LANGUAGE ?? "en-US";
    const now = new Date();
    logger.start("Sending appointment reminders...");

    let sent = 0;
    const configs = await clinicConfigService.find({company, deletedAt: null, reminderHoursBefore: {$gt: 0}}, {}, undefined, "company reminderHoursBefore");
    for (const config of configs) {
        const due = await appointmentService.find({
            company: config.company,
            status: "confirmed",
            deletedAt: null,
            reminderSentAt: {$exists: false},
            startAt: {$gt: now, $lte: new Date(now.getTime() + config.reminderHoursBefore * HOUR)},
        }, {}, undefined, undefined, undefined, BATCH_SIZE);

        for (const appointment of due) {
            // Claim it: only the run that sets the stamp sends.
            const claimed = await appointmentService.updateOne({_id: appointment._id, reminderSentAt: {$exists: false}}, {$set: {reminderSentAt: now}});
            if (!claimed.modifiedCount) continue;
            try {
                await notifyPatient("reminder", appointment, {languageCode});
                sent += 1;
            } catch (error) {
                logger.err(`Failed to send reminder for appointment ${appointment.number}`, error);
            }
        }
    }
    logger.finish(`Appointment reminders sent: ${sent}`);
}
