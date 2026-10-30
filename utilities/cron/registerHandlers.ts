import {registerCronHandler} from "@coreModule/cronjobs/registry/handlerRegistry";
import {runAppointmentReminders} from "@dentalClinicModule/utilities/cronJobs/appointmentReminderJob";
import {runAppointmentRetention} from "@dentalClinicModule/utilities/cronJobs/appointmentRetentionJob";
import {runInquiryResponseAlerts} from "@dentalClinicModule/utilities/cronJobs/inquiryResponseAlertJob";
import {expirePlans} from "@dentalClinicModule/utilities/services/treatmentPlans";

export function registerDentalClinicCronHandlers(): void {
    registerCronHandler({
        code: "dentalClinic.reminders",
        handler: async (ctx) => {
            await runAppointmentReminders(ctx.company, ctx.logger);
        },
        defaultJob: {
            name: "Appointment reminders",
            cronExpression: "0 */15 * * * *",
            priority: 10,
        },
    });

    registerCronHandler({
        code: "dentalClinic.retention",
        handler: async (ctx) => {
            await runAppointmentRetention(ctx.company, ctx.logger);
        },
        defaultJob: {
            name: "Appointment data retention",
            cronExpression: "0 30 3 * * *",
            priority: 5,
        },
    });

    registerCronHandler({
        code: "dentalClinic.inquiryResponseAlerts",
        handler: async (ctx) => {
            await runInquiryResponseAlerts(ctx.company, ctx.logger);
        },
        defaultJob: {
            name: "Unanswered estimate requests",
            cronExpression: "0 5 * * * *",
            priority: 5,
        },
    });

    registerCronHandler({
        code: "dentalClinic.quoteExpiry",
        handler: async (ctx) => {
            const expired = await expirePlans(ctx.company);
            ctx.logger.finish(`Quotes expired: ${expired}`);
        },
        defaultJob: {
            name: "Expire quotes past their date",
            cronExpression: "0 15 2 * * *",
            priority: 5,
        },
    });
}
