import type {TreatmentPlanSimple} from "armonia/src/modules/dentalClinic/dto/treatmentPlan.dto";
import type {ITreatmentPlan} from "./treatmentPlan";
import {defineSnippet} from "@coreModule/database/utilities/snippet";

export const TreatmentPlanSimpleSnippet = defineSnippet<ITreatmentPlan, TreatmentPlanSimple>()({
    keys: {
        _id: {},
        number: {},
    },
});
