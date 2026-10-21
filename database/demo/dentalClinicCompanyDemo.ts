/**
 * Seeds a small dental clinic for local development: settings with public booking
 * on, two locations, five services, three practitioners with weekly schedules, an
 * afternoon off and four staff-booked appointments on the coming weekdays.
 *
 * Every row is keyed by a natural key (location name, service slug, practitioner
 * name, exception note, appointment idempotency key), so running it twice changes
 * nothing. Appointments go through `createAppointment`, the same path staff use,
 * so they take the practitioner lock and respect schedules and the time off.
 *
 * Practitioners are not linked to staff users: a linked user only sees their own
 * appointments, which would hide the demo from the seeded admin.
 */

import type {Model} from "mongoose";
import {getLogger, serverLogger} from "@coreModule/loggers/serverLog";
import {ICompany} from "@coreModule/database/schemas/company/company";
import {runInTransaction} from "@coreModule/utilities/middlewares/runInTransaction";
import {addLocalDays, localDateOf, localToUtc} from "@coreModule/utilities/time/timeWindows";
import ClinicConfig from "@dentalClinicModule/database/schemas/clinicConfig/clinicConfig";
import {clinicConfigService} from "@dentalClinicModule/database/schemas/clinicConfig/clinicConfig.service";
import ClinicLocation, {type IClinicLocation} from "@dentalClinicModule/database/schemas/clinicLocation/clinicLocation";
import ClinicService, {type IClinicService} from "@dentalClinicModule/database/schemas/clinicService/clinicService";
import Practitioner from "@dentalClinicModule/database/schemas/practitioner/practitioner";
import ScheduleException from "@dentalClinicModule/database/schemas/scheduleException/scheduleException";
import {createAppointment, loadBookingTargets} from "@dentalClinicModule/utilities/services/appointmentBooking";

const TIMEZONE = "Europe/Tirane";
const LANGUAGE = "en-US";
const WEEKDAYS = [1, 2, 3, 4, 5];

const locations = [
    {
        name: "Blloku Dental Studio",
        phone: "+355 69 000 2001",
        email: "blloku@clinic.demo",
        address: {street: "Rruga Pjetër Bogdani 7", postalCode: "1019", latitude: 41.3194, longitude: 19.8167},
        openingHours: [
            ...WEEKDAYS.map((dayOfWeek) => ({dayOfWeek, startTime: "08:00", endTime: "18:00"})),
            {dayOfWeek: 6, startTime: "09:00", endTime: "13:00"},
        ],
    },
    {
        name: "Kombinat Family Dental",
        phone: "+355 69 000 2002",
        email: "kombinat@clinic.demo",
        address: {street: "Rruga Teodor Keko 22", postalCode: "1023", latitude: 41.3237, longitude: 19.7711},
        openingHours: WEEKDAYS.map((dayOfWeek) => ({dayOfWeek, startTime: "09:00", endTime: "17:00"})),
    },
];

const services = [
    {name: "Check-up & consultation", slug: "check-up", durationMinutes: 30, bufferAfterMinutes: 10, priceType: "fixed", price: 25, sortOrder: 1,
        description: "Examination, X-ray review and a treatment plan."},
    {name: "Professional cleaning", slug: "cleaning", durationMinutes: 45, bufferAfterMinutes: 15, priceType: "fixed", price: 45, sortOrder: 2,
        description: "Scaling, polishing and fluoride."},
    {name: "Tooth filling", slug: "filling", durationMinutes: 60, bufferAfterMinutes: 15, priceType: "from", price: 60, sortOrder: 3,
        description: "Composite filling; the price depends on the size."},
    {name: "Teeth whitening", slug: "whitening", durationMinutes: 60, bufferAfterMinutes: 10, priceType: "fixed", price: 150, sortOrder: 4,
        description: "In-chair whitening in one visit."},
    {name: "Orthodontic consultation", slug: "ortho-consult", durationMinutes: 45, bufferAfterMinutes: 0, priceType: "free", sortOrder: 5,
        description: "Braces and aligners: is it right for you?"},
];

/** `days` are the weekdays a practitioner works, at the location (index) and hours given. */
const practitioners = [
    {displayName: "Dr. Elira Shehu", title: "DMD", role: "dentist", languages: ["sq", "en", "it"], sortOrder: 1,
        bio: "General and cosmetic dentistry, fifteen years in practice.",
        services: ["check-up", "filling", "whitening"], shifts: [{location: 0, days: [1, 2, 3, 4], startTime: "09:00", endTime: "17:00"}]},
    {displayName: "Dr. Marco Rossi", title: "DDS, MSc Ortho", role: "orthodontist", languages: ["it", "en"], sortOrder: 2,
        bio: "Braces and clear aligners for children and adults.",
        services: ["check-up", "ortho-consult"], shifts: [
            {location: 0, days: [2, 4], startTime: "10:00", endTime: "18:00"},
            {location: 1, days: [1, 3, 5], startTime: "09:00", endTime: "16:00"},
        ]},
    {displayName: "Anila Doda", title: "RDH", role: "hygienist", languages: ["sq", "en"], sortOrder: 3,
        bio: "Gentle cleanings and prevention advice.",
        services: ["cleaning"], shifts: [{location: 1, days: WEEKDAYS, startTime: "09:00", endTime: "17:00"}]},
];

/** `nth` counts the coming days (from tomorrow) the practitioner works at that location. */
const appointments = [
    {key: "demo-seed-clinic-1", practitioner: "Dr. Elira Shehu", service: "check-up", location: 0, nth: 1, time: "09:00",
        patient: {firstName: "Besa", lastName: "Leka", email: "besa.leka@clinic.demo", phone: "+355 69 222 3301"}},
    {key: "demo-seed-clinic-2", practitioner: "Anila Doda", service: "cleaning", location: 1, nth: 1, time: "10:00",
        patient: {firstName: "Gent", lastName: "Mema", email: "gent.mema@clinic.demo", phone: "+355 69 222 3302"}},
    {key: "demo-seed-clinic-3", practitioner: "Dr. Marco Rossi", service: "ortho-consult", location: 1, nth: 2, time: "11:00",
        patient: {firstName: "Sara", lastName: "Conti", email: "sara.conti@clinic.demo", phone: "+39 333 000 4403"}},
    {key: "demo-seed-clinic-4", practitioner: "Dr. Elira Shehu", service: "filling", location: 0, nth: 3, time: "10:30",
        patient: {firstName: "Ilir", lastName: "Gjoka", email: "ilir.gjoka@clinic.demo", phone: "+355 69 222 3304"}},
] as const;

async function upsert<T>(model: Model<T>, filter: Record<string, unknown>, payload: Record<string, unknown>) {
    const existing = await model.findOne(filter);
    if (existing) {
        existing.set(payload);
        return existing.save();
    }
    return model.create({...filter, ...payload});
}

/** The n-th local date after `today` whose day of week is one of `days`. */
function comingDay(today: string, days: readonly number[], n: number): string {
    let date = today;
    for (let found = 0; found < n;) {
        date = addLocalDays(date, 1);
        if (days.includes(new Date(`${date}T12:00:00Z`).getUTCDay())) found += 1;
    }
    return date;
}

function workingDays(displayName: string, location: number): number[] {
    const practitioner = practitioners.find((p) => p.displayName === displayName)!;
    return practitioner.shifts.filter((shift) => shift.location === location).flatMap((shift) => shift.days);
}

export async function seedDentalClinicDemoData(parentLogger: serverLogger | undefined, company: ICompany): Promise<void> {
    const logger = getLogger("dentalClinic_demo_data", parentLogger);
    logger.start(`Seeding dental clinic demo data for '${company.name}'...`);
    const owned = {company: company._id, createdBy: company.createdBy};

    try {
        const created = await clinicConfigService.getOrCreateForCompany(company._id, {logger, languageCode: LANGUAGE});
        await ClinicConfig.updateOne({_id: created._id}, {
            $set: {publicBookingEnabled: true, requireStaffConfirmation: false, patientNoteEnabled: true, privacyNoticeVersion: "demo-1"},
        });

        const locationDocs: IClinicLocation[] = [];
        for (const location of locations) {
            locationDocs.push(await upsert(ClinicLocation, {company: company._id, name: location.name}, {
                ...owned, ...location, timezone: TIMEZONE, closures: [], isActive: true,
            }) as unknown as IClinicLocation);
        }

        const serviceBySlug = new Map<string, IClinicService>();
        for (const service of services) {
            const doc = await upsert(ClinicService, {company: company._id, slug: service.slug}, {
                bufferBeforeMinutes: 0, ...owned, ...service, onlineBookable: true, isPublic: true, isActive: true,
            });
            serviceBySlug.set(service.slug, doc as unknown as IClinicService);
        }

        for (const {services: slugs, shifts, ...practitioner} of practitioners) {
            const usedLocations = [...new Set(shifts.map((shift) => shift.location))];
            await upsert(Practitioner, {company: company._id, displayName: practitioner.displayName}, {
                ...owned, ...practitioner,
                services: slugs.map((slug) => serviceBySlug.get(slug)!._id),
                locations: usedLocations.map((index) => locationDocs[index]._id),
                schedule: shifts.flatMap((shift) => shift.days.map((dayOfWeek) => ({
                    location: locationDocs[shift.location]._id, dayOfWeek, startTime: shift.startTime, endTime: shift.endTime,
                }))),
                isBookable: true,
                isActive: true,
            });
        }

        const today = localDateOf(new Date(), TIMEZONE);
        // Elira's third working day: her filling (appointment 4) is that morning.
        const offDay = comingDay(today, workingDays("Dr. Elira Shehu", 0), 3);
        const elira = await Practitioner.findOne({company: company._id, displayName: "Dr. Elira Shehu"}).select("_id");
        await upsert(ScheduleException, {company: company._id, practitioner: elira!._id, internalNote: "Demo: afternoon off (training)"}, {
            ...owned,
            startAt: localToUtc(offDay, "13:00", TIMEZONE),
            endAt: localToUtc(offDay, "17:00", TIMEZONE),
        });

        const config = (await clinicConfigService.findForCompany(company._id, {logger, languageCode: LANGUAGE}))!;
        let booked = 0;
        for (const appointment of appointments) {
            const practitioner = await Practitioner.findOne({company: company._id, displayName: appointment.practitioner}).select("_id");
            booked += await runInTransaction(logger, async (session) => {
                const {service, location} = await loadBookingTargets(company._id, {
                    service: String(serviceBySlug.get(appointment.service)!._id),
                    location: String(locationDocs[appointment.location]._id),
                }, {languageCode: LANGUAGE, online: false, session});
                const {created: isNew} = await createAppointment({
                    companyId: company._id,
                    config,
                    service,
                    location,
                    practitionerId: String(practitioner!._id),
                    date: comingDay(today, workingDays(appointment.practitioner, appointment.location), appointment.nth),
                    time: appointment.time,
                    patient: {...appointment.patient},
                    idempotencyKey: appointment.key,
                    source: "staff",
                }, {session, logger, languageCode: LANGUAGE, auditUserId: company.createdBy as any});
                return isNew ? 1 : 0;
            });
        }

        logger.finish(`Finished seeding dental clinic demo data (${booked} new appointments)!`);
    } catch (error: unknown) {
        logger.err("Error seeding dental clinic demo data", error);
        logger.fail("Failed to seed dental clinic demo data!");
    }
}
