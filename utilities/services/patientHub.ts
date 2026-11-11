/**
 * The patient folder as a hub (UX-03): the patient's appointments, quotes, trips and requests on their sheet,
 * with the next visit and what is still owed. Each list is read the way its own list route reads it: only when
 * the caller's role can read that model, with the caller's field grants, and appointments within a linked
 * dentist's own scope.
 */

import type {ObjectId} from "mongodb";
import type {Model} from "mongoose";
import {getModelCollectedData} from "@coreModule/database/collections";
import SchemaGuard from "@coreModule/database/security/schemaGuard";
import type {UserContext} from "@coreModule/utilities/types/types";
import {fromMinor, sumMinor, toMinor} from "armonia/src/modules/core/helpers/money";
import type {Patient} from "armonia/src/modules/dentalClinic/api/dentalClinic/private/patient/patient.dto";
import {APPOINTMENT_BLOCKING_STATUSES} from "armonia/src/modules/dentalClinic/api/dentalClinic/private/appointment/appointment.constants";
import Appointment from "@dentalClinicModule/database/schemas/appointment/appointment";
import {appointmentService} from "@dentalClinicModule/database/schemas/appointment/appointment.service";
import ClinicInquiry from "@dentalClinicModule/database/schemas/clinicInquiry/clinicInquiry";
import {clinicInquiryService} from "@dentalClinicModule/database/schemas/clinicInquiry/clinicInquiry.service";
import PatientTrip from "@dentalClinicModule/database/schemas/patientTrip/patientTrip";
import {patientTripService} from "@dentalClinicModule/database/schemas/patientTrip/patientTrip.service";
import TreatmentPlan from "@dentalClinicModule/database/schemas/treatmentPlan/treatmentPlan";
import {treatmentPlanService} from "@dentalClinicModule/database/schemas/treatmentPlan/treatmentPlan.service";
import {appointmentsToDTO} from "@dentalClinicModule/utilities/mappers/appointment/appointmentMapper.dto";
import {clinicInquiriesToDTO} from "@dentalClinicModule/utilities/mappers/clinicInquiry/clinicInquiryMapper.dto";
import {patientTripsToDTO} from "@dentalClinicModule/utilities/mappers/patientTrip/patientTripMapper.dto";
import {treatmentPlansToDTO} from "@dentalClinicModule/utilities/mappers/treatmentPlan/treatmentPlanMapper.dto";
import {appointmentScopeFilter} from "@dentalClinicModule/utilities/services/clinicAccess";

/** The newest records of each kind; the full history stays on each list page. */
const HUB_LIMIT = 20;

type HubCtx = {companyId: ObjectId; actionUserCtx: UserContext; languageCode: string; now?: Date};
export type PatientHub = Pick<Patient, "appointments" | "plans" | "trips" | "inquiries" | "nextVisitAt" | "balanceDue" | "balanceCurrency">;

/** The populate and projection the caller's role allows on a model, or null when it allows nothing (no access to that list). */
function readableFetch(model: Model<any>, collectionName: string, ctx: HubCtx): ReturnType<typeof SchemaGuard.generatePopulate> | null {
    const collected = getModelCollectedData(collectionName).readFields;
    if (!collected) return null;
    try {
        const readFields = SchemaGuard.sanitizeFields(model, collected, "read", ctx.actionUserCtx, ctx.languageCode);
        return Object.keys(readFields).length ? SchemaGuard.generatePopulate(readFields, model.schema) : null;
    } catch {
        // sanitizeFields refuses a role with no readable field: that list is simply not shown.
        return null;
    }
}

export async function patientHub(patientId: ObjectId, ctx: HubCtx): Promise<PatientHub> {
    const now = ctx.now ?? new Date();
    const base = {company: ctx.companyId, deletedAt: null};
    const appointmentsFetch = readableFetch(Appointment, "appointments", ctx);
    const plansFetch = readableFetch(TreatmentPlan, "treatmentplans", ctx);
    const tripsFetch = readableFetch(PatientTrip, "patienttrips", ctx);
    const inquiriesFetch = readableFetch(ClinicInquiry, "clinicinquiries", ctx);

    const [appointments, plans, trips, inquiries] = await Promise.all([
        appointmentsFetch
            ? appointmentScopeFilter(ctx.companyId, ctx.actionUserCtx).then((scope) => appointmentService.find(
                {...base, ...scope, patientRecord: patientId}, {}, appointmentsFetch.populate, appointmentsFetch.select, {startAt: -1}, HUB_LIMIT,
            ))
            : null,
        plansFetch ? treatmentPlanService.find({...base, patient: patientId}, {}, plansFetch.populate, plansFetch.select, {createdAt: -1}, HUB_LIMIT) : null,
        tripsFetch ? patientTripService.find({...base, patient: patientId}, {}, tripsFetch.populate, tripsFetch.select, {arrivalAt: -1}, HUB_LIMIT) : null,
        inquiriesFetch ? clinicInquiryService.find({...base, patient: patientId}, {}, inquiriesFetch.populate, inquiriesFetch.select, {createdAt: -1}, HUB_LIMIT) : null,
    ]);

    const hub: PatientHub = {};
    if (appointments) {
        hub.appointments = appointmentsToDTO(appointments);
        const next = appointments
            .filter((appointment) => appointment.startAt > now && APPOINTMENT_BLOCKING_STATUSES.includes(appointment.status))
            .sort((a, b) => a.startAt.getTime() - b.startAt.getTime())[0];
        if (next) hub.nextVisitAt = next.startAt.toISOString();
    }
    if (plans) {
        hub.plans = treatmentPlansToDTO(plans);
        // Every quote is in the clinic's one currency; the balance is what accepted quotes still owe.
        const accepted = hub.plans.filter((plan) => plan.status === "accepted" && plan.amountDue);
        const currency = accepted[0]?.currency;
        if (currency) {
            const decimals = currency.decimalPlaces ?? undefined;
            hub.balanceDue = Number(fromMinor(sumMinor(accepted.map((plan) => toMinor(plan.amountDue ?? 0, decimals))), decimals));
            hub.balanceCurrency = currency;
        }
    }
    if (trips) hub.trips = patientTripsToDTO(trips);
    if (inquiries) hub.inquiries = clinicInquiriesToDTO(inquiries);
    return hub;
}
