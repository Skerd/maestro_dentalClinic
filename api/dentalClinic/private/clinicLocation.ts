import {createCrudRouter} from "@coreModule/api/crudRouterFactory";
import {buildCreateDataFromSchemaDef, buildUpdateDataFromSchemaDef} from "@coreModule/api/buildUpdateDataFromSchemaDef";
import {restoreUnlessKeyTaken} from "@coreModule/api/restoreUnlessKeyTaken";
import {isValidTimeZone} from "@coreModule/utilities/time/timeWindows";
import {apiValidationException} from "armonia/src/modules/core/helpers/exceptions";
import {ClinicLocationSchemaDef} from "armonia/src/modules/dentalClinic/api/dentalClinic/private/clinicLocation/clinicLocation.schema-def";
import {createClinicLocationFormSchema} from "armonia/src/modules/dentalClinic/api/dentalClinic/private/clinicLocation/createClinicLocation.form.validator";
import {editClinicLocationFormSchema} from "armonia/src/modules/dentalClinic/api/dentalClinic/private/clinicLocation/editClinicLocation.form.validator";
import ClinicLocation from "@dentalClinicModule/database/schemas/clinicLocation/clinicLocation";
import {clinicLocationService} from "@dentalClinicModule/database/schemas/clinicLocation/clinicLocation.service";
import {clinicLocationToDTO, clinicLocationsToDTO} from "@dentalClinicModule/utilities/mappers/clinicLocation/clinicLocationMapper.dto";
import {clinicLocationsToSelect} from "@dentalClinicModule/utilities/mappers/clinicLocation/clinicLocationMapper.select";
import {ClinicLocationActions} from "@dentalClinicModule/database/schemas/clinicLocation/clinicLocation.actions";

/** The Zod contract can't compare fields, so the timezone name and each hours row are checked here. */
function assertValidSchedule(data: {timezone?: string; openingHours?: {startTime: string; endTime: string}[]}, languageCode: string): void {
    if (data.timezone !== undefined && !isValidTimeZone(data.timezone)) {
        throw apiValidationException("clinic_invalid_timezone", "", null, languageCode, [data.timezone]);
    }
    for (const row of data.openingHours ?? []) {
        if (row.endTime <= row.startTime) {
            throw apiValidationException("clinic_hours_end_before_start", "", null, languageCode);
        }
    }
}

export const basePath = "/api/dentalClinic/clinicLocation";

export const {router} = createCrudRouter({
    collectionName: "cliniclocations",
    model: ClinicLocation,
    service: clinicLocationService,
    entityName: "ClinicLocation",
    createSchema: createClinicLocationFormSchema,
    editSchema: editClinicLocationFormSchema,
    toDTO: clinicLocationToDTO,
    toDTOArray: clinicLocationsToDTO,
    toSelect: clinicLocationsToSelect,
    defaultSort: {name: 1},
    extraSelectFilter: () => ({isActive: true}),
    actions: ClinicLocationActions,
    buildCreateData: (params: any) => {
        assertValidSchedule(params, params.languageCode);
        return buildCreateDataFromSchemaDef(ClinicLocationSchemaDef)(params);
    },
    buildUpdateData: (params: any, writeFields) => {
        assertValidSchedule(params, params.languageCode);
        return buildUpdateDataFromSchemaDef(ClinicLocationSchemaDef)(params, writeFields);
    },
    overrideRestoreHandler: restoreUnlessKeyTaken({
        model: ClinicLocation,
        service: clinicLocationService,
        entityName: "ClinicLocation",
        keys: ["name"],
        errorCode: "clinic_location_name_taken",
    }),
});
