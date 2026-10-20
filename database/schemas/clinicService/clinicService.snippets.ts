import type {ClinicServiceSimple} from "armonia/src/modules/dentalClinic/dto/clinicService.dto";
import type {IClinicService} from "./clinicService";
import {defineSnippet} from "@coreModule/database/utilities/snippet";

export const ClinicServiceSimpleSnippet = defineSnippet<IClinicService, ClinicServiceSimple>()({
    keys: {
        _id: {},
        name: {},
        durationMinutes: {},
    },
});
