import type {PatientSimple} from "armonia/src/modules/dentalClinic/dto/patient.dto";
import type {IPatient} from "./patient";
import {defineSnippet} from "@coreModule/database/utilities/snippet";

export const PatientSimpleSnippet = defineSnippet<IPatient, PatientSimple>()({
    keys: {
        _id: {},
        number: {},
        firstName: {},
        lastName: {},
    },
});
