import type {IAppointment} from "@dentalClinicModule/database/schemas/appointment/appointment";
import type {Appointment} from "armonia/src/modules/dentalClinic/api/dentalClinic/private/appointment/appointment.dto";
import type {PublicAppointment} from "armonia/src/modules/dentalClinic/api/dentalClinic/public/clinicStorefront/clinicStorefront.response.types";
import type {CurrencySimple} from "armonia/src/modules/core/dto/currency.dto";
import type {SimpleBlankUser} from "armonia/src/modules/core/dto/user.dto";
import type {ClinicLocationSimple} from "armonia/src/modules/dentalClinic/dto/clinicLocation.dto";
import type {ClinicServiceSimple} from "armonia/src/modules/dentalClinic/dto/clinicService.dto";
import type {PractitionerSimple} from "armonia/src/modules/dentalClinic/dto/practitioner.dto";
import {dateToISOString, mapSnippet, nestedEntityToRef} from "@coreModule/utilities/mappers/common.mapper";
import {CurrencySimpleSnippet} from "@coreModule/database/schemas/currency/currency.snippets";
import {SimpleBlankUserSnippet} from "@coreModule/database/schemas/user/user.snippets";
import {ClinicLocationSimpleSnippet} from "@dentalClinicModule/database/schemas/clinicLocation/clinicLocation.snippets";
import {ClinicServiceSimpleSnippet} from "@dentalClinicModule/database/schemas/clinicService/clinicService.snippets";
import {PractitionerSimpleSnippet} from "@dentalClinicModule/database/schemas/practitioner/practitioner.snippets";
import {mapLifeCycleToDTO, mapOwnershipToDTO, mapSoftDeleteToDTO} from "@coreModule/utilities/mappers/plugin/pluginMappers.dto";
import {cancelUntil, rescheduleUntil} from "@dentalClinicModule/utilities/services/appointmentLifecycle";

const optionalIso = (date: Date | undefined) => (date ? dateToISOString(date) : undefined);

// Subdocuments are copied field by field: spreading one would copy Mongoose's internal state.
function patientToDTO({firstName, lastName, email, phone}: IAppointment["patient"]) {
    return {firstName, lastName, email, phone};
}

function snapshotToDTO(snapshot: IAppointment["snapshot"]) {
    const {serviceName, durationMinutes, priceType, price, practitionerName, locationName, locationAddress, timezone} = snapshot;
    return {serviceName, durationMinutes, priceType, price, practitionerName, locationName, locationAddress, timezone};
}

export function appointmentToDTO(appointment: IAppointment): Appointment {
    return {
        _id: appointment._id.toString(),
        number: appointment.number,
        status: appointment.status,
        source: appointment.source,
        service: mapSnippet<ClinicServiceSimple>()(appointment.service, ClinicServiceSimpleSnippet),
        location: mapSnippet<ClinicLocationSimple>()(appointment.location, ClinicLocationSimpleSnippet),
        practitioner: mapSnippet<PractitionerSimple>()(appointment.practitioner, PractitionerSimpleSnippet),
        customer: mapSnippet<SimpleBlankUser>()(appointment.customer, SimpleBlankUserSnippet),
        startAt: dateToISOString(appointment.startAt),
        endAt: dateToISOString(appointment.endAt),
        patient: patientToDTO(appointment.patient),
        note: appointment.note,
        snapshot: snapshotToDTO(appointment.snapshot),
        currency: mapSnippet<CurrencySimple>()(appointment.currency, CurrencySimpleSnippet),
        policy: {
            cancellationDeadlineHours: appointment.policy.cancellationDeadlineHours,
            rescheduleDeadlineHours: appointment.policy.rescheduleDeadlineHours,
        },
        consent: appointment.consent ? {version: appointment.consent.version, at: dateToISOString(appointment.consent.at)} : undefined,
        timeline: (appointment.timeline ?? []).map(({event, at, note}) => ({event, at: dateToISOString(at), note})),
        rescheduleCount: appointment.rescheduleCount ?? 0,
        cancelledAt: optionalIso(appointment.cancelledAt),
        cancelledBy: appointment.cancelledBy,
        cancellationReason: appointment.cancellationReason,
        anonymizedAt: optionalIso(appointment.anonymizedAt),
        ...mapSoftDeleteToDTO(appointment),
        ...mapOwnershipToDTO(appointment),
        ...mapLifeCycleToDTO(appointment),
    };
}

export function appointmentsToDTO(appointments: IAppointment[]): Appointment[] {
    return appointments.map(appointmentToDTO);
}

/**
 * What the patient sees: their own appointment without staff data (timeline,
 * who did what). `currency` must be populated to show a price.
 */
export function appointmentToPublic(appointment: IAppointment, now = new Date()): PublicAppointment {
    const open = appointment.status === "pending" || appointment.status === "confirmed";
    const {snapshot} = appointment;
    return {
        _id: appointment._id.toString(),
        number: appointment.number,
        status: appointment.status,
        serviceId: String(nestedEntityToRef(appointment.service)),
        locationId: String(nestedEntityToRef(appointment.location)),
        practitionerId: String(nestedEntityToRef(appointment.practitioner)),
        serviceName: snapshot.serviceName,
        durationMinutes: snapshot.durationMinutes,
        priceType: snapshot.priceType,
        price: snapshot.price,
        currency: mapSnippet<CurrencySimple>()(appointment.currency, CurrencySimpleSnippet),
        practitionerName: snapshot.practitionerName,
        locationName: snapshot.locationName,
        locationAddress: snapshot.locationAddress,
        timezone: snapshot.timezone,
        startAt: dateToISOString(appointment.startAt),
        endAt: dateToISOString(appointment.endAt),
        patient: patientToDTO(appointment.patient),
        note: appointment.note,
        cancelUntil: dateToISOString(cancelUntil(appointment)),
        rescheduleUntil: dateToISOString(rescheduleUntil(appointment)),
        canCancel: open && now <= cancelUntil(appointment),
        canReschedule: open && now <= rescheduleUntil(appointment),
    };
}
