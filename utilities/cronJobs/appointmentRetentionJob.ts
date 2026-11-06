/**
 * Daily: removes patient details from appointments that ended longer ago than the
 * clinic's retention period. The appointment itself stays (for counts and the
 * schedule history) with the name, contact, note, customer link and treatment
 * name blanked out.
 */

import type {ObjectId} from "mongodb";
import {getLogger, serverLogger} from "@coreModule/loggers/serverLog";

import {clinicConfigService} from "@dentalClinicModule/database/schemas/clinicConfig/clinicConfig.service";
import {appointmentService} from "@dentalClinicModule/database/schemas/appointment/appointment.service";
const BATCH_SIZE = 500;
const REMOVED = "—";

export async function runAppointmentRetention(company: ObjectId, parentLogger?: serverLogger): Promise<void> {
    const logger = getLogger("appointment_retention", parentLogger);
    const now = new Date();
    logger.start("Removing expired patient details...");

    let anonymized = 0;
    const configs = await clinicConfigService.find({company, deletedAt: null}, {}, undefined, "company retentionMonths");
    for (const config of configs) {
        const cutoff = new Date(now);
        cutoff.setMonth(cutoff.getMonth() - config.retentionMonths);
        const due = await appointmentService.find({
            company: config.company,
            endAt: {$lt: cutoff},
            anonymizedAt: {$exists: false},
            status: {$in: ["completed", "cancelled", "no_show"]},
        }, {}, undefined, "_id", undefined, BATCH_SIZE);
        if (!due.length) continue;

        const result = await appointmentService.updateMany({_id: {$in: due.map((appointment) => appointment._id)}, anonymizedAt: {$exists: false}}, {
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
            });
        anonymized += result.modifiedCount;
    }
    logger.finish(`Appointments anonymized: ${anonymized}`);
}
