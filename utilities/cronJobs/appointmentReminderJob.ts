/**
 * Every 15 minutes: reminds patients of confirmed appointments that start within
 * their clinic's reminder window. `reminderSentAt` is stamped first, so a
 * reminder goes out at most once even if two runs overlap; a reschedule clears it.
 */

import {CONSTANTS} from "@coreModule/environment";
import {getLogger, serverLogger} from "@coreModule/loggers/serverLog";
import ClinicConfig from "@dentalClinicModule/database/schemas/clinicConfig/clinicConfig";
import Appointment from "@dentalClinicModule/database/schemas/appointment/appointment";
import {notifyPatient} from "@dentalClinicModule/utilities/services/appointmentNotify";

const HOUR = 3600 * 1000;
const BATCH_SIZE = 200;

export async function runAppointmentReminders(parentLogger?: serverLogger): Promise<void> {
    const logger = getLogger("appointment_reminders", parentLogger);
    const languageCode = CONSTANTS.DEFAULT_LANGUAGE ?? "en-US";
    const now = new Date();
    logger.start("Sending appointment reminders...");

    let sent = 0;
    const configs = await ClinicConfig.find({deletedAt: null, reminderHoursBefore: {$gt: 0}}).select("company reminderHoursBefore");
    for (const config of configs) {
        const due = await Appointment.find({
            company: config.company,
            status: "confirmed",
            deletedAt: null,
            reminderSentAt: {$exists: false},
            startAt: {$gt: now, $lte: new Date(now.getTime() + config.reminderHoursBefore * HOUR)},
        }).limit(BATCH_SIZE);

        for (const appointment of due) {
            // Claim it: only the run that sets the stamp sends.
            const claimed = await Appointment.updateOne(
                {_id: appointment._id, reminderSentAt: {$exists: false}},
                {$set: {reminderSentAt: now}},
            );
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
