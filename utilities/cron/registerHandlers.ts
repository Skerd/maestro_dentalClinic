import {registerCronHandler} from "@coreModule/cronjobs/registry/handlerRegistry";
import {runAppointmentReminders} from "@dentalClinicModule/utilities/cronJobs/appointmentReminderJob";
import {runAppointmentRetention} from "@dentalClinicModule/utilities/cronJobs/appointmentRetentionJob";

export function registerDentalClinicCronHandlers(): void {
    registerCronHandler({
        code: "dentalClinic.reminders",
        handler: async (ctx) => {
            await runAppointmentReminders(ctx.logger);
        },
        version: "1",
        defaultJob: {
            name: "Appointment reminders",
            cronExpression: "0 */15 * * * *",
            priority: 10,
        },
    });

    registerCronHandler({
        code: "dentalClinic.retention",
        handler: async (ctx) => {
            await runAppointmentRetention(ctx.logger);
        },
        version: "1",
        defaultJob: {
            name: "Appointment data retention",
            cronExpression: "0 30 3 * * *",
            priority: 5,
        },
    });
}
