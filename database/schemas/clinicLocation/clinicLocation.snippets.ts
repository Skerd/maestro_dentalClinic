import type {ClinicLocationSimple} from "armonia/src/modules/dentalClinic/dto/clinicLocation.dto";
import type {IClinicLocation} from "./clinicLocation";
import {defineSnippet} from "@coreModule/database/utilities/snippet";

export const ClinicLocationSimpleSnippet = defineSnippet<IClinicLocation, ClinicLocationSimple>()({
    keys: {
        _id: {},
        name: {},
        timezone: {},
    },
});
