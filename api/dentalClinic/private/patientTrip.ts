import {ObjectId} from "mongodb";
import {createCrudRouter} from "@coreModule/api/crudRouterFactory";
import {buildCreateDataFromSchemaDef, buildUpdateDataFromSchemaDef} from "@coreModule/api/buildUpdateDataFromSchemaDef";
import {nestedEntityToRef} from "@coreModule/utilities/mappers/common.mapper";
import {PatientTripSchemaDef} from "armonia/src/modules/dentalClinic/api/dentalClinic/private/patientTrip/patientTrip.schema-def";
import {createPatientTripFormSchema} from "armonia/src/modules/dentalClinic/api/dentalClinic/private/patientTrip/createPatientTrip.form.validator";
import {editPatientTripFormSchema} from "armonia/src/modules/dentalClinic/api/dentalClinic/private/patientTrip/editPatientTrip.form.validator";
import PatientTrip from "@dentalClinicModule/database/schemas/patientTrip/patientTrip";
import {patientTripService} from "@dentalClinicModule/database/schemas/patientTrip/patientTrip.service";
import {patientTripToDTO, patientTripsToDTO} from "@dentalClinicModule/utilities/mappers/patientTrip/patientTripMapper.dto";
import {assertTripFits, notifyTripPlanned} from "@dentalClinicModule/utilities/services/patientTrips";

export const basePath = "/api/dentalClinic/patientTrip";

const idOf = (value: unknown): ObjectId | undefined => (value ? nestedEntityToRef(value) ?? new ObjectId(String(value)) : undefined);
const ctxOf = (params: any) => ({session: params.session, logger: params.logger, languageCode: params.languageCode, auditUserId: params.actionUserCtx?.userId});

// Listed by arrival: the week's airport pickups come first.
export const {router} = createCrudRouter({
    collectionName: "patienttrips",
    model: PatientTrip,
    service: patientTripService,
    entityName: "PatientTrip",
    createSchema: createPatientTripFormSchema,
    editSchema: editPatientTripFormSchema,
    toDTO: patientTripToDTO,
    toDTOArray: patientTripsToDTO,
    toSelect: (trips) => trips.map((trip) => ({value: trip._id.toString(), label: trip.arrivalAt.toISOString().slice(0, 10)})),
    selectSearchField: "accommodation",
    defaultSort: {arrivalAt: 1},
    buildCreateData: async (params: any) => {
        await assertTripFits(
            params.company._id,
            {patient: idOf(params.patient)!, plan: idOf(params.plan), phase: params.phase, arrivalAt: new Date(params.arrivalAt)},
            ctxOf(params),
        );
        return buildCreateDataFromSchemaDef(PatientTripSchemaDef)(params);
    },
    buildUpdateData: async (params: any, writeFields) => {
        const {existing} = params;
        await assertTripFits(
            params.company._id,
            {
                patient: idOf(writeFields.patient && params.patient ? params.patient : existing.patient)!,
                plan: idOf(writeFields.plan && params.plan !== undefined ? params.plan : existing.plan),
                phase: writeFields.phase && params.phase !== undefined ? params.phase : existing.phase,
                arrivalAt: new Date(writeFields.arrivalAt && params.arrivalAt ? params.arrivalAt : existing.arrivalAt),
                tripId: existing._id,
            },
            ctxOf(params),
        );
        return buildUpdateDataFromSchemaDef(PatientTripSchemaDef)(params, writeFields);
    },
    afterCreate: async (created, params: any) => notifyTripPlanned(created, ctxOf(params)),
});
