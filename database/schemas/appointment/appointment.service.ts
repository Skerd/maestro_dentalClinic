import {BaseCrudService} from "@coreModule/database/services/baseCrudService";
import Appointment, {IAppointment} from "./appointment";

export class AppointmentService extends BaseCrudService<IAppointment, typeof Appointment> {
    constructor() {
        super(Appointment, "Appointment");
    }
}

export const appointmentService = new AppointmentService();
