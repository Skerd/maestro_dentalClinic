import type {ClientSession} from "mongoose";
import type {ObjectId} from "mongodb";
import {createCrudRouter} from "@coreModule/api/crudRouterFactory";
import {buildCreateDataFromSchemaDef, buildUpdateDataFromSchemaDef} from "@coreModule/api/buildUpdateDataFromSchemaDef";
import {apiValidationException} from "armonia/src/modules/core/helpers/exceptions";
import {mediaUploadMW} from "@coreModule/utilities/middlewares/mediaUploadMW";
import {CLINIC_GALLERY_MAX_ITEMS} from "armonia/src/modules/dentalClinic/api/dentalClinic/private/clinicConfig/clinicConfig.schema-def";
import {ClinicConfigSchemaDef} from "armonia/src/modules/dentalClinic/api/dentalClinic/private/clinicConfig/clinicConfig.schema-def";
import {createClinicConfigFormSchema} from "armonia/src/modules/dentalClinic/api/dentalClinic/private/clinicConfig/createClinicConfig.form.validator";
import {editClinicConfigFormSchema} from "armonia/src/modules/dentalClinic/api/dentalClinic/private/clinicConfig/editClinicConfig.form.validator";
import ClinicConfig from "@dentalClinicModule/database/schemas/clinicConfig/clinicConfig";
import {clinicConfigService} from "@dentalClinicModule/database/schemas/clinicConfig/clinicConfig.service";
import {ClinicConfigActions} from "@dentalClinicModule/database/schemas/clinicConfig/clinicConfig.actions";
import {clinicConfigToDTO, clinicConfigsToDTO} from "@dentalClinicModule/utilities/mappers/clinicConfig/clinicConfigMapper.dto";
import {clinicConfigsToSelect} from "@dentalClinicModule/utilities/mappers/clinicConfig/clinicConfigMapper.select";

import {clinicLocationService} from "@dentalClinicModule/database/schemas/clinicLocation/clinicLocation.service";
import {clinicServiceService} from "@dentalClinicModule/database/schemas/clinicService/clinicService.service";
import {practitionerService} from "@dentalClinicModule/database/schemas/practitioner/practitioner.service";
/**
 * Public booking only goes live once a patient could actually complete one: a
 * location, a service offered online, and someone bookable with working hours
 * who does that service there.
 */
async function assertReadyForPublicBooking(companyId: ObjectId, session: ClientSession, languageCode: string): Promise<void> {
    const locations = await clinicLocationService.find({company: companyId, isActive: true, deletedAt: null}, {session: session}, undefined, "_id");
    if (!locations.length) throw apiValidationException("clinic_setup_missing_location", "", null, languageCode);
    const services = await clinicServiceService.find({company: companyId, isActive: true, isPublic: true, onlineBookable: true, deletedAt: null}, {session: session}, undefined, "_id");
    if (!services.length) throw apiValidationException("clinic_setup_missing_service", "", null, languageCode);
    const practitioner = await practitionerService.exists({
        company: companyId,
        isActive: true,
        isBookable: true,
        deletedAt: null,
        "schedule.0": {$exists: true},
        services: {$in: services.map((service) => service._id)},
        locations: {$in: locations.map((location) => location._id)},
    }, {session: session});
    if (!practitioner) throw apiValidationException("clinic_setup_missing_practitioner", "", null, languageCode);
}

const galleryUpload = mediaUploadMW({
    fields: {gallery: CLINIC_GALLERY_MAX_ITEMS},
    fieldMimeTypes: {gallery: ["image/jpeg", "image/png", "image/webp"]},
    maxFileSize: 20 * 1024 * 1024,
});

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
    createMiddleware: [galleryUpload],
    editMiddleware: [galleryUpload],
    buildCreateData: buildCreateDataFromSchemaDef(ClinicConfigSchemaDef),
    buildUpdateData: async (params: any, writeFields) => {
        if (params.publicBookingEnabled === true && writeFields.publicBookingEnabled) {
            await assertReadyForPublicBooking(params.company._id, params.session, params.languageCode);
        }
        return buildUpdateDataFromSchemaDef(ClinicConfigSchemaDef)(params, writeFields);
    },
    rateLimits: {read: 60, write: 30, delete: 0},
});
