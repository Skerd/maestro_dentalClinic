import {kafkaTopicErrors, type ModuleEnvironmentContext, type ValidationError} from "@coreModule/environment/validator";
import {DENTAL_CLINIC_KAFKA} from "@dentalClinicModule/environment";

/**
 * dentalClinic's boot checks (D67): medical histories and X-rays are stored encrypted (D102), so the health-data
 * master key must be set; core checks its format. While Kafka is on, each patient email kind needs its topic (D188).
 */
export function validateEnvironment(ctx: ModuleEnvironmentContext): ValidationError[] {
    return [
        ctx.validateString("HEALTH_DATA_MASTER_KEY", ctx.env.HEALTH_DATA_MASTER_KEY, true),
        ...kafkaTopicErrors(ctx, DENTAL_CLINIC_KAFKA),
    ].filter((error): error is ValidationError => error !== null);
}
