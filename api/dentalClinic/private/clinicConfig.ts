import type {ClientSession} from "mongoose";
import type {ObjectId} from "mongodb";
import {createCrudRouter} from "@coreModule/api/crudRouterFactory";
import {buildCreateDataFromSchemaDef, buildUpdateDataFromSchemaDef} from "@coreModule/api/buildUpdateDataFromSchemaDef";
import {apiValidationException} from "armonia/src/modules/core/helpers/exceptions";
import {ClinicConfigSchemaDef} from "armonia/src/modules/dentalClinic/api/dentalClinic/private/clinicConfig/clinicConfig.schema-def";
import {createClinicConfigFormSchema} from "armonia/src/modules/dentalClinic/api/dentalClinic/private/clinicConfig/createClinicConfig.form.validator";
import {editClinicConfigFormSchema} from "armonia/src/modules/dentalClinic/api/dentalClinic/private/clinicConfig/editClinicConfig.form.validator";
import ClinicConfig from "@dentalClinicModule/database/schemas/clinicConfig/clinicConfig";
import {clinicConfigService} from "@dentalClinicModule/database/schemas/clinicConfig/clinicConfig.service";
import {ClinicConfigActions} from "@dentalClinicModule/database/schemas/clinicConfig/clinicConfig.actions";
import ClinicLocation from "@dentalClinicModule/database/schemas/clinicLocation/clinicLocation";
import ClinicService from "@dentalClinicModule/database/schemas/clinicService/clinicService";
import Practitioner from "@dentalClinicModule/database/schemas/practitioner/practitioner";
import {clinicConfigToDTO, clinicConfigsToDTO} from "@dentalClinicModule/utilities/mappers/clinicConfig/clinicConfigMapper.dto";
import {clinicConfigsToSelect} from "@dentalClinicModule/utilities/mappers/clinicConfig/clinicConfigMapper.select";

/**
 * Public booking only goes live once a patient could actually complete one: a
 * location, a service offered online, and someone bookable with working hours
 * who does that service there.
 */
async function assertReadyForPublicBooking(companyId: ObjectId, session: ClientSession, languageCode: string): Promise<void> {
    const locations = await ClinicLocation.find({company: companyId, isActive: true, deletedAt: null}).select("_id").session(session);
    if (!locations.length) throw apiValidationException("clinic_setup_missing_location", "", null, languageCode);
    const services = await ClinicService.find({company: companyId, isActive: true, isPublic: true, onlineBookable: true, deletedAt: null}).select("_id").session(session);
    if (!services.length) throw apiValidationException("clinic_setup_missing_service", "", null, languageCode);
    const practitioner = await Practitioner.exists({
        company: companyId,
        isActive: true,
        isBookable: true,
        deletedAt: null,
        "schedule.0": {$exists: true},
        services: {$in: services.map((service) => service._id)},
        locations: {$in: locations.map((location) => location._id)},
    }).session(session);
    if (!practitioner) throw apiValidationException("clinic_setup_missing_practitioner", "", null, languageCode);
}

export const basePath = "/api/dentalClinic/clinicConfig";

// One settings document per company (unique index); the settings page creates it through `ensure`.
export const {router} = createCrudRouter({
    collectionName: "clinicconfigs",
    model: ClinicConfig,
    service: clinicConfigService,
    entityName: "ClinicConfig",
    createSchema: createClinicConfigFormSchema,
    editSchema: editClinicConfigFormSchema,
    toDTO: clinicConfigToDTO,
    toDTOArray: clinicConfigsToDTO,
    toSelect: clinicConfigsToSelect,
    selectSearchField: "_id",
    actions: ClinicConfigActions,
    buildCreateData: buildCreateDataFromSchemaDef(ClinicConfigSchemaDef),
    buildUpdateData: async (params: any, writeFields) => {
        if (params.publicBookingEnabled === true && writeFields.publicBookingEnabled) {
            await assertReadyForPublicBooking(params.company._id, params.session, params.languageCode);
        }
        return buildUpdateDataFromSchemaDef(ClinicConfigSchemaDef)(params, writeFields);
    },
    rateLimits: {read: 60, write: 30, delete: 0},
});
