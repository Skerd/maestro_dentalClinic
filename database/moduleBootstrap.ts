import type {Model} from "mongoose";
import ClinicConfig from "@dentalClinicModule/database/schemas/clinicConfig/clinicConfig";
import ClinicLocation from "@dentalClinicModule/database/schemas/clinicLocation/clinicLocation";
import ClinicService from "@dentalClinicModule/database/schemas/clinicService/clinicService";
import Practitioner from "@dentalClinicModule/database/schemas/practitioner/practitioner";
import ScheduleException from "@dentalClinicModule/database/schemas/scheduleException/scheduleException";
import Appointment from "@dentalClinicModule/database/schemas/appointment/appointment";
import Patient from "@dentalClinicModule/database/schemas/patient/patient";
import ClinicInquiry from "@dentalClinicModule/database/schemas/clinicInquiry/clinicInquiry";
import ClinicMessage from "@dentalClinicModule/database/schemas/clinicMessage/clinicMessage";
import TreatmentPlan from "@dentalClinicModule/database/schemas/treatmentPlan/treatmentPlan";
import {registerDefaultRoles} from "@coreModule/database/schemas/role/role.defaults";
import {registerPublicMediaBackfillSource} from "@coreModule/utilities/media/publicMediaBackfillRegistry";
import {dentalClinicDefaultRoles} from "@dentalClinicModule/database/schemas/role/dentalClinic.role.defaults";
import {ClinicServiceSchemaDef} from "armonia/src/modules/dentalClinic/api/dentalClinic/private/clinicService/clinicService.schema-def";
import {PractitionerSchemaDef} from "armonia/src/modules/dentalClinic/api/dentalClinic/private/practitioner/practitioner.schema-def";
import {ClinicConfigSchemaDef} from "armonia/src/modules/dentalClinic/api/dentalClinic/private/clinicConfig/clinicConfig.schema-def";
import {clinicConfigService} from "@dentalClinicModule/database/schemas/clinicConfig/clinicConfig.service";
import type {SelfServeBusinessType} from "@coreModule/domain/company/selfServeBusinessTypes";

export const dentalClinicModels: Model<any>[] = [
    ClinicConfig,
    ClinicLocation,
    ClinicService,
    Practitioner,
    ScheduleException,
    Patient,
    Appointment,
    ClinicInquiry,
    ClinicMessage,
    TreatmentPlan,
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
registerPublicMediaBackfillSource({
    name: "ClinicConfig",
    schemaDef: ClinicConfigSchemaDef,
    loadModel: () => import("@dentalClinicModule/database/schemas/clinicConfig/clinicConfig").then((m) => m.default),
});

/** A dental clinic may sign itself up on the portal; it is listed there once the platform approves it (D178). */
const selfServeBusinessTypes: SelfServeBusinessType[] = [{
    key: "dentalClinic",
    modules: ["dentalClinic"],
    onCreated: async ({company, session, logger, languageCode}) => {
        const config = await clinicConfigService.getOrCreateForCompany(company._id, {session, logger, languageCode});
        await clinicConfigService.updateOne({_id: config._id}, {$set: {listedOnPortal: true}}, {session, logger});
    },
}];

export const moduleBootstrap = {
    models: dentalClinicModels,
    dropModuleCollections: dropDentalClinicCollections,
    defaultRoles: dentalClinicDefaultRoles,
    selfServeBusinessTypes,
};
