import type {PractitionerSimple} from "armonia/src/modules/dentalClinic/dto/practitioner.dto";
import type {IPractitioner} from "./practitioner";
import {defineSnippet} from "@coreModule/database/utilities/snippet";

export const PractitionerSimpleSnippet = defineSnippet<IPractitioner, PractitionerSimple>()({
    keys: {
        _id: {},
        displayName: {},
        title: {},
    },
});
