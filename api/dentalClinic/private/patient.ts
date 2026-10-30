import {createCrudRouter} from "@coreModule/api/crudRouterFactory";
import {buildCreateDataFromSchemaDef, buildUpdateDataFromSchemaDef} from "@coreModule/api/buildUpdateDataFromSchemaDef";
import {PatientSchemaDef} from "armonia/src/modules/dentalClinic/api/dentalClinic/private/patient/patient.schema-def";
import {createPatientFormSchema} from "armonia/src/modules/dentalClinic/api/dentalClinic/private/patient/createPatient.form.validator";
import {editPatientFormSchema} from "armonia/src/modules/dentalClinic/api/dentalClinic/private/patient/editPatient.form.validator";
import Patient from "@dentalClinicModule/database/schemas/patient/patient";
import {patientService} from "@dentalClinicModule/database/schemas/patient/patient.service";
import {patientToDTO, patientsToDTO} from "@dentalClinicModule/utilities/mappers/patient/patientMapper.dto";
import {patientsToSelect} from "@dentalClinicModule/utilities/mappers/patient/patientMapper.select";
import {patientNumber} from "@dentalClinicModule/utilities/services/patientRecords";

export const basePath = "/api/dentalClinic/patient";

export const {router} = createCrudRouter({
    collectionName: "patients",
    model: Patient,
    service: patientService,
    entityName: "Patient",
    createSchema: createPatientFormSchema,
    editSchema: editPatientFormSchema,
    toDTO: patientToDTO,
    toDTOArray: patientsToDTO,
    toSelect: patientsToSelect,
    selectSearchField: "lastName",
    selectProjection: "_id number firstName lastName",
    defaultSort: {lastName: 1, firstName: 1},
    buildCreateData: (params: any) => ({
        ...buildCreateDataFromSchemaDef(PatientSchemaDef)(params),
        number: patientNumber(),
    }),
    buildUpdateData: (params: any, writeFields) => buildUpdateDataFromSchemaDef(PatientSchemaDef)(params, writeFields),
});
