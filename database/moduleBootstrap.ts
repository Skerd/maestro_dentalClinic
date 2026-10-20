import type {Model} from "mongoose";
import ClinicConfig from "@dentalClinicModule/database/schemas/clinicConfig/clinicConfig";
import ClinicLocation from "@dentalClinicModule/database/schemas/clinicLocation/clinicLocation";
import ClinicService from "@dentalClinicModule/database/schemas/clinicService/clinicService";
import Practitioner from "@dentalClinicModule/database/schemas/practitioner/practitioner";
import ScheduleException from "@dentalClinicModule/database/schemas/scheduleException/scheduleException";
import Appointment from "@dentalClinicModule/database/schemas/appointment/appointment";
import {registerDefaultRoles} from "@coreModule/database/schemas/role/role.defaults";
import {registerPublicMediaBackfillSource} from "@coreModule/utilities/media/publicMediaBackfillRegistry";
import {dentalClinicDefaultRoles} from "@dentalClinicModule/database/schemas/role/dentalClinic.role.defaults";
import {ClinicServiceSchemaDef} from "armonia/src/modules/dentalClinic/api/dentalClinic/private/clinicService/clinicService.schema-def";
import {PractitionerSchemaDef} from "armonia/src/modules/dentalClinic/api/dentalClinic/private/practitioner/practitioner.schema-def";

export const dentalClinicModels: Model<any>[] = [
    ClinicConfig,
    ClinicLocation,
    ClinicService,
    Practitioner,
    ScheduleException,
    Appointment,
];

export async function dropDentalClinicCollections(): Promise<void> {
    for (const model of dentalClinicModels) {
        try {
            await model.collection.drop();
        } catch {
            // collection may not exist
        }
    }
}

registerDefaultRoles(dentalClinicDefaultRoles);
registerPublicMediaBackfillSource({
    name: "ClinicService",
    schemaDef: ClinicServiceSchemaDef,
    loadModel: () => import("@dentalClinicModule/database/schemas/clinicService/clinicService").then((m) => m.default),
});
registerPublicMediaBackfillSource({
    name: "Practitioner",
    schemaDef: PractitionerSchemaDef,
    loadModel: () => import("@dentalClinicModule/database/schemas/practitioner/practitioner").then((m) => m.default),
});

export const moduleBootstrap = {
    models: dentalClinicModels,
    dropModuleCollections: dropDentalClinicCollections,
    defaultRoles: dentalClinicDefaultRoles,
};
