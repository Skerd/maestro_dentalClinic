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
    // "Giulia Bianchi · 2027-01-10": whose stay and when they arrive (TD-B242: the picker showed the date alone).
    toSelect: (trips) => trips.map((trip) => {
        const patient = [trip.patient?.firstName, trip.patient?.lastName].filter(Boolean).join(" ");
        const arrival = trip.arrivalAt.toISOString().slice(0, 10);
        return {value: trip._id.toString(), label: patient ? `${patient} · ${arrival}` : arrival};
    }),
    selectSearchField: "accommodation",
    // The label is the arrival date (TD-B235: without it in the projection every select answered 500).
    selectProjection: "_id accommodation arrivalAt patient",
    selectPopulate: [{path: "patient", select: "firstName lastName"}],
    selectSort: {arrivalAt: 1},
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
