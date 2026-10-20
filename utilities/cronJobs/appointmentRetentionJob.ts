/**
 * Daily: removes patient details from appointments that ended longer ago than the
 * clinic's retention period. The appointment itself stays (for counts and the
 * schedule history) with the name, contact, note, customer link and treatment
 * name blanked out.
 */

import {getLogger, serverLogger} from "@coreModule/loggers/serverLog";
import ClinicConfig from "@dentalClinicModule/database/schemas/clinicConfig/clinicConfig";
import Appointment from "@dentalClinicModule/database/schemas/appointment/appointment";

const BATCH_SIZE = 500;
const REMOVED = "—";

export async function runAppointmentRetention(parentLogger?: serverLogger): Promise<void> {
    const logger = getLogger("appointment_retention", parentLogger);
    const now = new Date();
    logger.start("Removing expired patient details...");

    let anonymized = 0;
    const configs = await ClinicConfig.find({deletedAt: null}).select("company retentionMonths");
    for (const config of configs) {
        const cutoff = new Date(now);
        cutoff.setMonth(cutoff.getMonth() - config.retentionMonths);
        const due = await Appointment.find({
            company: config.company,
            endAt: {$lt: cutoff},
            anonymizedAt: {$exists: false},
            status: {$in: ["completed", "cancelled", "no_show"]},
        }).select("_id").limit(BATCH_SIZE);
        if (!due.length) continue;

        const result = await Appointment.updateMany(
            {_id: {$in: due.map((appointment) => appointment._id)}, anonymizedAt: {$exists: false}},
            {
                $set: {
                    "patient.firstName": REMOVED,
                    "patient.lastName": REMOVED,
                    "patient.email": REMOVED,
                    "patient.phone": REMOVED,
                    "snapshot.serviceName": REMOVED,
                    anonymizedAt: now,
                },
                $unset: {note: "", customer: "", cancellationReason: ""},
                $push: {timeline: {event: "anonymized", at: now}},
            },
        );
        anonymized += result.modifiedCount;
    }
    logger.finish(`Appointments anonymized: ${anonymized}`);
}
