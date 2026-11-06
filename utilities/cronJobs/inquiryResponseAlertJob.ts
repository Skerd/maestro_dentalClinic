/**
 * Hourly: tells the clinic's request watchers about new requests nobody has answered within
 * the clinic's response target. `slaAlertedAt` is stamped first, so each request alerts once.
 */

import type {ObjectId} from "mongodb";
import {CONSTANTS} from "@coreModule/environment";
import {getLogger, serverLogger} from "@coreModule/loggers/serverLog";
import {NotificationEventCodes} from "@dentalClinicModule/domain/notifications/notificationEventCodes";
import {notifyInquiryStaff} from "@dentalClinicModule/utilities/services/inquiryNotify";

import {clinicConfigService} from "@dentalClinicModule/database/schemas/clinicConfig/clinicConfig.service";
import {clinicInquiryService} from "@dentalClinicModule/database/schemas/clinicInquiry/clinicInquiry.service";
const HOUR = 3600 * 1000;
const BATCH_SIZE = 200;

export async function runInquiryResponseAlerts(company: ObjectId, parentLogger?: serverLogger): Promise<void> {
    const logger = getLogger("inquiry_response_alerts", parentLogger);
    const languageCode = CONSTANTS.DEFAULT_LANGUAGE ?? "en-US";
    const now = new Date();
    logger.start("Checking unanswered estimate requests...");

    let alerted = 0;
    const config = await clinicConfigService.findOne({company, deletedAt: null, inquiriesEnabled: true}, {}, undefined, "responseTargetHours");
    if (config) {
        const overdue = await clinicInquiryService.find({
            company,
            status: "new",
            deletedAt: null,
            firstResponseAt: null,
            slaAlertedAt: null,
            createdAt: {$lte: new Date(now.getTime() - config.responseTargetHours * HOUR)},
        }, {}, undefined, undefined, undefined, BATCH_SIZE);

        for (const inquiry of overdue) {
            // Claim it: only the run that sets the stamp alerts.
            const claimed = await clinicInquiryService.updateOne({_id: inquiry._id, slaAlertedAt: null}, {$set: {slaAlertedAt: now}});
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
