import type {ModuleEnvironmentContext, ValidationError} from "@coreModule/environment/validator";

/**
 * dentalClinic's boot checks (D67): medical histories and X-rays are stored encrypted (D102), so the health-data
 * master key must be set; core checks its format.
 */
export function validateEnvironment({env, validateString}: ModuleEnvironmentContext): ValidationError[] {
    return [
        validateString("HEALTH_DATA_MASTER_KEY", env.HEALTH_DATA_MASTER_KEY, true),
    ].filter((error): error is ValidationError => error !== null);
}
