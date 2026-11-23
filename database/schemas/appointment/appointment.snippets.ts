import type {AppointmentSimple} from "armonia/src/modules/dentalClinic/dto/appointment.dto";
import type {IAppointment} from "./appointment";
import {defineSnippet} from "@coreModule/database/utilities/snippet";

export const AppointmentSimpleSnippet = defineSnippet<IAppointment, AppointmentSimple>()({
    keys: {
        _id: {},
        number: {},
    },
});
