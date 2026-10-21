import {getLogger, serverLogger} from "@coreModule/loggers/serverLog";
import {seedDentalClinicDemoData} from "@dentalClinicModule/database/demo/dentalClinicCompanyDemo";

/** After finance (50); the clinic depends on nothing else seeded. */
export const companyDemoSeedOrder = 60;

export async function seedCompanyDemoData(parentLogger: serverLogger | undefined, company: any): Promise<void> {
    const logger = getLogger("dentalClinic_company_demo_seed", parentLogger);
    await seedDentalClinicDemoData(logger, company);
}
