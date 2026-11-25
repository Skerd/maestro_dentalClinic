import {createCrudRouter} from "@coreModule/api/crudRouterFactory";
import {buildCreateDataFromSchemaDef, buildUpdateDataFromSchemaDef} from "@coreModule/api/buildUpdateDataFromSchemaDef";
import {apiValidationException} from "armonia/src/modules/core/helpers/exceptions";
import {ClinicReviewSchemaDef} from "armonia/src/modules/dentalClinic/api/dentalClinic/private/clinicReview/clinicReview.schema-def";
import {createClinicReviewFormSchema} from "armonia/src/modules/dentalClinic/api/dentalClinic/private/clinicReview/createClinicReview.form.validator";
import {editClinicReviewFormSchema} from "armonia/src/modules/dentalClinic/api/dentalClinic/private/clinicReview/editClinicReview.form.validator";
import ClinicReview from "@dentalClinicModule/database/schemas/clinicReview/clinicReview";
import {clinicReviewService} from "@dentalClinicModule/database/schemas/clinicReview/clinicReview.service";
import {ClinicReviewActions} from "@dentalClinicModule/database/schemas/clinicReview/clinicReview.actions";
import {clinicReviewToDTO, clinicReviewsToDTO} from "@dentalClinicModule/utilities/mappers/clinicReview/clinicReviewMapper.dto";
import {clinicReviewsToSelect} from "@dentalClinicModule/utilities/mappers/clinicReview/clinicReviewMapper.select";

export const basePath = "/api/dentalClinic/clinicReview";

export const {router} = createCrudRouter({
    collectionName: "clinicreviews",
    model: ClinicReview,
    service: clinicReviewService,
    entityName: "ClinicReview",
    createSchema: createClinicReviewFormSchema,
    editSchema: editClinicReviewFormSchema,
    toDTO: clinicReviewToDTO,
    toDTOArray: clinicReviewsToDTO,
    toSelect: clinicReviewsToSelect,
    selectSearchField: "authorName",
    defaultSort: {createdAt: -1},
    actions: ClinicReviewActions,
    // A review comes only from the patient, through their appointment email's link: staff never write one.
    checkCreatePermission: ({languageCode}) => {
        throw apiValidationException("clinic_review_written_by_patient_only", "", null, languageCode);
    },
    buildCreateData: buildCreateDataFromSchemaDef(ClinicReviewSchemaDef),
    buildUpdateData: buildUpdateDataFromSchemaDef(ClinicReviewSchemaDef),
});
