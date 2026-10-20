import {BaseCrudService} from "@coreModule/database/services/baseCrudService";
import ScheduleException, {IScheduleException} from "./scheduleException";

export class ScheduleExceptionService extends BaseCrudService<IScheduleException, typeof ScheduleException> {
    constructor() {
        super(ScheduleException, "ScheduleException");
    }
}

export const scheduleExceptionService = new ScheduleExceptionService();
