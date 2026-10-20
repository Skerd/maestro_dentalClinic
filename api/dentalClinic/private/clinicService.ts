import {createCrudRouter} from "@coreModule/api/crudRouterFactory";
import {buildCreateDataFromSchemaDef, buildUpdateDataFromSchemaDef} from "@coreModule/api/buildUpdateDataFromSchemaDef";
import {restoreUnlessKeyTaken} from "@coreModule/api/restoreUnlessKeyTaken";
import {mediaUploadMW} from "@coreModule/utilities/middlewares/mediaUploadMW";
import {apiValidationException} from "armonia/src/modules/core/helpers/exceptions";
import {ClinicServiceSchemaDef} from "armonia/src/modules/dentalClinic/api/dentalClinic/private/clinicService/clinicService.schema-def";
import {createClinicServiceFormSchema} from "armonia/src/modules/dentalClinic/api/dentalClinic/private/clinicService/createClinicService.form.validator";
import {editClinicServiceFormSchema} from "armonia/src/modules/dentalClinic/api/dentalClinic/private/clinicService/editClinicService.form.validator";
import ClinicService from "@dentalClinicModule/database/schemas/clinicService/clinicService";
import {clinicServiceService} from "@dentalClinicModule/database/schemas/clinicService/clinicService.service";
import {clinicServiceToDTO, clinicServicesToDTO} from "@dentalClinicModule/utilities/mappers/clinicService/clinicServiceMapper.dto";
import {clinicServicesToSelect} from "@dentalClinicModule/utilities/mappers/clinicService/clinicServiceMapper.select";

const mediaUpload = mediaUploadMW({fields: {images: 8}, maxFileSize: 20 * 1024 * 1024});

/** A shown price needs an amount; the Zod contract can't compare fields. */
function assertPrice(data: {priceType?: string; price?: number}, existing: {priceType?: string; price?: number} | undefined, languageCode: string): void {
    const priceType = data.priceType ?? existing?.priceType;
    const price = data.price ?? existing?.price;
    if ((priceType === "fixed" || priceType === "from") && price === undefined) {
        throw apiValidationException("clinic_service_price_required", "", null, languageCode);
    }
}

export const basePath = "/api/dentalClinic/clinicService";

export const {router} = createCrudRouter({
    collectionName: "clinicservices",
    model: ClinicService,
    service: clinicServiceService,
    entityName: "ClinicService",
    createSchema: createClinicServiceFormSchema,
    editSchema: editClinicServiceFormSchema,
    toDTO: clinicServiceToDTO,
    toDTOArray: clinicServicesToDTO,
    toSelect: clinicServicesToSelect,
    defaultSort: {sortOrder: 1, name: 1},
    extraSelectFilter: () => ({isActive: true}),
    createMiddleware: [mediaUpload],
    editMiddleware: [mediaUpload],
    buildCreateData: (params: any) => {
        assertPrice(params, undefined, params.languageCode);
        return buildCreateDataFromSchemaDef(ClinicServiceSchemaDef)(params);
    },
    buildUpdateData: (params: any, writeFields) => buildUpdateDataFromSchemaDef(ClinicServiceSchemaDef)(params, writeFields),
    afterUpdate: async (params: any, existing) => {
        assertPrice(params, existing, params.languageCode);
    },
    overrideRestoreHandler: restoreUnlessKeyTaken({
        model: ClinicService,
        service: clinicServiceService,
        entityName: "ClinicService",
        keys: ["slug"],
        errorCode: "clinic_service_slug_taken",
    }),
});
