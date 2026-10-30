/**
 * Hourly: tells the clinic's request watchers about new requests nobody has answered within
 * the clinic's response target. `slaAlertedAt` is stamped first, so each request alerts once.
 */

import type {ObjectId} from "mongodb";
import {CONSTANTS} from "@coreModule/environment";
import {getLogger, serverLogger} from "@coreModule/loggers/serverLog";
import ClinicConfig from "@dentalClinicModule/database/schemas/clinicConfig/clinicConfig";
import ClinicInquiry from "@dentalClinicModule/database/schemas/clinicInquiry/clinicInquiry";
import {NotificationEventCodes} from "@dentalClinicModule/domain/notifications/notificationEventCodes";
import {notifyInquiryStaff} from "@dentalClinicModule/utilities/services/inquiryNotify";

const HOUR = 3600 * 1000;
const BATCH_SIZE = 200;

export async function runInquiryResponseAlerts(company: ObjectId, parentLogger?: serverLogger): Promise<void> {
    const logger = getLogger("inquiry_response_alerts", parentLogger);
    const languageCode = CONSTANTS.DEFAULT_LANGUAGE ?? "en-US";
    const now = new Date();
    logger.start("Checking unanswered estimate requests...");

    let alerted = 0;
    const config = await ClinicConfig.findOne({company, deletedAt: null, inquiriesEnabled: true}).select("responseTargetHours");
    if (config) {
        const overdue = await ClinicInquiry.find({
            company,
            status: "new",
            deletedAt: null,
            firstResponseAt: null,
            slaAlertedAt: null,
            createdAt: {$lte: new Date(now.getTime() - config.responseTargetHours * HOUR)},
        }).limit(BATCH_SIZE);

        for (const inquiry of overdue) {
            // Claim it: only the run that sets the stamp alerts.
            const claimed = await ClinicInquiry.updateOne({_id: inquiry._id, slaAlertedAt: null}, {$set: {slaAlertedAt: now}});
            if (!claimed.modifiedCount) continue;
            try {
                await notifyInquiryStaff(NotificationEventCodes.INQUIRY_UNANSWERED, inquiry, {languageCode});
                alerted += 1;
            } catch (error) {
                logger.err(`Failed to alert about request ${inquiry.number}`, error);
            }
        }
    }
    logger.finish(`Unanswered requests alerted: ${alerted}`);
}
