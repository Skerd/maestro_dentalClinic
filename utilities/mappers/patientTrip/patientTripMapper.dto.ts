import type {IPatientTrip} from "@dentalClinicModule/database/schemas/patientTrip/patientTrip";
import type {PatientTrip} from "armonia/src/modules/dentalClinic/api/dentalClinic/private/patientTrip/patientTrip.dto";
import type {PatientSimple} from "armonia/src/modules/dentalClinic/dto/patient.dto";
import type {TreatmentPlanSimple} from "armonia/src/modules/dentalClinic/dto/treatmentPlan.dto";
import {dateToISOString, mapSnippet} from "@coreModule/utilities/mappers/common.mapper";
import {PatientSimpleSnippet} from "@dentalClinicModule/database/schemas/patient/patient.snippets";
import {TreatmentPlanSimpleSnippet} from "@dentalClinicModule/database/schemas/treatmentPlan/treatmentPlan.snippets";
import {mapLifeCycleToDTO, mapOwnershipToDTO, mapSoftDeleteToDTO} from "@coreModule/utilities/mappers/plugin/pluginMappers.dto";

export function patientTripToDTO(trip: IPatientTrip): PatientTrip {
    return {
        _id: trip._id.toString(),
        patient: mapSnippet<PatientSimple>()(trip.patient, PatientSimpleSnippet),
        plan: mapSnippet<TreatmentPlanSimple>()(trip.plan, TreatmentPlanSimpleSnippet),
        phase: trip.phase,
        status: trip.status,
        arrivalAt: dateToISOString(trip.arrivalAt),
        departureAt: dateToISOString(trip.departureAt),
        arrivalFlight: trip.arrivalFlight,
        departureFlight: trip.departureFlight,
        accommodation: trip.accommodation,
        transfer: trip.transfer,
        companions: trip.companions,
        notes: trip.notes,
        ...mapSoftDeleteToDTO(trip),
        ...mapOwnershipToDTO(trip),
        ...mapLifeCycleToDTO(trip),
    };
}

export function patientTripsToDTO(trips: IPatientTrip[]): PatientTrip[] {
    return trips.map(patientTripToDTO);
}
