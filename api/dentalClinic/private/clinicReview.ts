import {ObjectId} from "mongodb";
import {createCrudRouter} from "@coreModule/api/crudRouterFactory";
import {buildCreateDataFromSchemaDef, buildUpdateDataFromSchemaDef} from "@coreModule/api/buildUpdateDataFromSchemaDef";
import {ClinicReviewSchemaDef} from "armonia/src/modules/dentalClinic/api/dentalClinic/private/clinicReview/clinicReview.schema-def";
import {createClinicReviewFormSchema} from "armonia/src/modules/dentalClinic/api/dentalClinic/private/clinicReview/createClinicReview.form.validator";
import {editClinicReviewFormSchema} from "armonia/src/modules/dentalClinic/api/dentalClinic/private/clinicReview/editClinicReview.form.validator";
import ClinicReview from "@dentalClinicModule/database/schemas/clinicReview/clinicReview";
import {assertAppointmentReviewable, clinicReviewService} from "@dentalClinicModule/database/schemas/clinicReview/clinicReview.service";
import {ClinicReviewActions} from "@dentalClinicModule/database/schemas/clinicReview/clinicReview.actions";
import {appointmentService} from "@dentalClinicModule/database/schemas/appointment/appointment.service";
import {clinicReviewToDTO, clinicReviewsToDTO} from "@dentalClinicModule/utilities/mappers/clinicReview/clinicReviewMapper.dto";
import {clinicReviewsToSelect} from "@dentalClinicModule/utilities/mappers/clinicReview/clinicReviewMapper.select";

export const basePath = "/api/dentalClinic/clinicReview";

const buildReviewCreate = buildCreateDataFromSchemaDef(ClinicReviewSchemaDef);
const buildReviewUpdate = buildUpdateDataFromSchemaDef(ClinicReviewSchemaDef);

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
    /** A review staff record (a patient's words from the phone or the desk) also needs a visit that took place. */
    buildCreateData: async (params) => {
        const {company, session, logger, languageCode} = params;
        const appointment = await appointmentService.findOneOrThrow(
            {_id: new ObjectId(params.appointment), company: company._id},
            {session, logger, languageCode},
        );
        assertAppointmentReviewable(appointment, languageCode);
        return buildReviewCreate(params);
    },
    buildUpdateData: async (params, writeFields) => {
        const data = await buildReviewUpdate(params, writeFields);
        // A review stays with the appointment it was written for.
        delete data.appointment;
        return data;
    },
});
