import {ObjectId} from "mongodb";
import {apiValidationException} from "armonia/src/modules/core/helpers/exceptions";
import {nestedEntityToRef} from "@coreModule/utilities/mappers/common.mapper";
import {localDateOf} from "@coreModule/utilities/time/timeWindows";
import {type IPatientTrip} from "@dentalClinicModule/database/schemas/patientTrip/patientTrip";
import type {ClinicCtx} from "./appointmentBooking";
import {notifyInquiryPatient, notifyInquiryStaff} from "./inquiryNotify";
import {NotificationEventCodes} from "@dentalClinicModule/domain/notifications/notificationEventCodes";

import {patientService} from "@dentalClinicModule/database/schemas/patient/patient.service";
import {treatmentPlanService} from "@dentalClinicModule/database/schemas/treatmentPlan/treatmentPlan.service";
import {clinicInquiryService} from "@dentalClinicModule/database/schemas/clinicInquiry/clinicInquiry.service";
import {patientTripService} from "@dentalClinicModule/database/schemas/patientTrip/patientTrip.service";
const DAY = 24 * 3600 * 1000;

export type TripInput = {
    patient: ObjectId;
    plan?: ObjectId;
    phase?: number;
    arrivalAt: Date;
    tripId?: ObjectId;
};

/**
 * A trip belongs to one of this clinic's patients; when it is for a plan, that plan is the
 * patient's accepted one and the phase is one of its phases. A later phase cannot start before
 * the previous phase's trip ended plus the healing time the plan gives (the error names the date).
 */
export async function assertTripFits(companyId: ObjectId, input: TripInput, ctx: ClinicCtx): Promise<void> {
    const {languageCode, session} = ctx;
    if (!(await patientService.exists({_id: input.patient, company: companyId, deletedAt: null}, {session: session}))) {
        throw apiValidationException("patient_not_found", "", null, languageCode);
    }
    if (!input.plan) {
        if (input.phase) throw apiValidationException("patient_trip_phase_without_plan", "", null, languageCode);
        return;
    }
    const plan = await treatmentPlanService.findOne({_id: input.plan, company: companyId, patient: input.patient, status: "accepted", deletedAt: null}, {session: session}, undefined, "phases");
    if (!plan) throw apiValidationException("patient_trip_plan_invalid", "", null, languageCode);
    if (!input.phase) return;
    if (input.phase > plan.phases.length) {
        throw apiValidationException("patient_trip_phase_invalid", "", null, languageCode, [String(plan.phases.length)]);
    }
    if (input.phase === 1) return;

    const previous = await patientTripService.findLatestDeparture({
        company: companyId,
        plan: input.plan,
        phase: input.phase - 1,
        status: {$ne: "cancelled"},
        deletedAt: null,
        ...(input.tripId ? {_id: {$ne: input.tripId}} : {}),
    }, session);
    if (!previous) return;
    const gapDays = plan.phases[input.phase - 1].minGapDaysAfterPrevious ?? 0;
    const earliest = new Date(previous.departureAt.getTime() + gapDays * DAY);
    if (input.arrivalAt < earliest) {
        throw apiValidationException("patient_trip_too_early", "", null, languageCode, [localDateOf(earliest, "UTC"), String(gapDays)]);
    }
}

/** A portal patient is told when the clinic plans a stay, so they can add their flights and hotel. */
export async function notifyTripPlanned(trip: IPatientTrip, ctx: ClinicCtx): Promise<void> {
    const planId = nestedEntityToRef(trip.plan);
    if (!planId) return;
    const plan = await treatmentPlanService.findById(planId, {session: ctx.session}, undefined, "inquiry");
    const inquiry = plan ? await clinicInquiryService.findById(nestedEntityToRef(plan.inquiry), {session: ctx.session}) : null;
    if (inquiry) await notifyInquiryPatient("tripPlanned", inquiry, {}, ctx);
}

/** The patient's stays for their accepted plans among these inquiries, cancelled ones left out. */
export async function tripsOfInquiries(inquiryIds: ObjectId[], ctx: {session?: ClinicCtx["session"]}): Promise<IPatientTrip[]> {
    const plans = await treatmentPlanService.find({inquiry: {$in: inquiryIds}, status: "accepted", deletedAt: null}, {session: ctx.session ?? undefined}, undefined, "_id");
    if (!plans.length) return [];
    return patientTripService.find({plan: {$in: plans.map((plan) => plan._id)}, status: {$ne: "cancelled"}, deletedAt: null}, {session: ctx.session ?? undefined}, {path: "plan", select: "phases inquiry"}, undefined, {arrivalAt: 1});
}

/**
 * The patient fills in their flights and where they stay for a coming trip; the clinic is told
 * so it can arrange the pickup. Past and cancelled trips no longer change.
 */
export async function updateTripDetails(
    trip: IPatientTrip,
    input: {arrivalFlight?: string; departureFlight?: string; accommodation?: string},
    ctx: ClinicCtx,
): Promise<void> {
    if (trip.status === "cancelled" || trip.status === "completed") {
        throw apiValidationException("patient_trip_closed", "", null, ctx.languageCode);
    }
    for (const key of ["arrivalFlight", "departureFlight", "accommodation"] as const) {
        if (input[key] !== undefined) trip.set(key, input[key]?.trim() || undefined);
    }
    await trip.save({session: ctx.session});
    const plan = await treatmentPlanService.findById(nestedEntityToRef(trip.plan), {session: ctx.session}, undefined, "inquiry");
    const inquiry = plan ? await clinicInquiryService.findById(nestedEntityToRef(plan.inquiry), {session: ctx.session}) : null;
    if (inquiry) await notifyInquiryStaff(NotificationEventCodes.TRIP_DETAILS_ADDED, inquiry, ctx);
}
