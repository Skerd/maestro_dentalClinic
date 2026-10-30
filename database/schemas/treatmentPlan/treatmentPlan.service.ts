import {BaseCrudService} from "@coreModule/database/services/baseCrudService";
import TreatmentPlan, {ITreatmentPlan} from "./treatmentPlan";

export class TreatmentPlanService extends BaseCrudService<ITreatmentPlan, typeof TreatmentPlan> {
    constructor() {
        super(TreatmentPlan, "TreatmentPlan");
    }
}

export const treatmentPlanService = new TreatmentPlanService();
