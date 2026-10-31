/**
 * Seeds a small dental clinic for local development: settings with public booking
 * on, two locations, five services with photos and videos, three practitioners
 * with weekly schedules, an afternoon off, four staff-booked appointments on
 * the coming weekdays, and the folders those visits belong to: patients, two
 * inquiries with messages, two treatment plans and a trip.
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
import type {ObjectId} from "mongodb";
import {getLogger, serverLogger} from "@coreModule/loggers/serverLog";
import {ICompany} from "@coreModule/database/schemas/company/company";
import {
    resolveDemoImagesFromUnsplash,
    resolveDemoVideosFromUrls,
} from "@coreModule/database/demo/demoMedia";
import {nestedEntityToRef} from "@coreModule/utilities/mappers/common.mapper";
import {runInTransaction} from "@coreModule/utilities/middlewares/runInTransaction";
import {
    addLocalDays,
    localDateOf,
    localToUtc,
} from "@coreModule/utilities/time/timeWindows";
import Currency from "@coreModule/database/schemas/currency/currency";
import ClinicConfig from "@dentalClinicModule/database/schemas/clinicConfig/clinicConfig";
import Patient from "@dentalClinicModule/database/schemas/patient/patient";
import ClinicInquiry from "@dentalClinicModule/database/schemas/clinicInquiry/clinicInquiry";
import ClinicMessage from "@dentalClinicModule/database/schemas/clinicMessage/clinicMessage";
import TreatmentPlan from "@dentalClinicModule/database/schemas/treatmentPlan/treatmentPlan";
import PatientTrip from "@dentalClinicModule/database/schemas/patientTrip/patientTrip";
import {clinicConfigService} from "@dentalClinicModule/database/schemas/clinicConfig/clinicConfig.service";
import ClinicLocation, {
    type IClinicLocation,
} from "@dentalClinicModule/database/schemas/clinicLocation/clinicLocation";
import ClinicService, {
    type IClinicService,
} from "@dentalClinicModule/database/schemas/clinicService/clinicService";
import Practitioner from "@dentalClinicModule/database/schemas/practitioner/practitioner";
import ScheduleException from "@dentalClinicModule/database/schemas/scheduleException/scheduleException";
import {
    createAppointment,
    loadBookingTargets,
} from "@dentalClinicModule/utilities/services/appointmentBooking";
import City from "@coreModule/database/schemas/city/city";
import {MEDICAL_HISTORY_QUESTIONS} from "armonia/src/modules/dentalClinic/constants";
import {
    DEMO_VIDEO_URLS,
    PRACTITIONER_PHOTO_SIZE,
    PRACTITIONER_PHOTOS,
    SERVICE_PHOTOS,
    SERVICE_PHOTO_SIZE,
    SERVICE_VIDEOS,
} from "./dentalClinic.demo.media";

const TIMEZONE = "Europe/Tirane";
const LANGUAGE = "en-US";
const WEEKDAYS = [1, 2, 3, 4, 5];

/** The company's own City record by name; cities are seeded per company. */
async function demoCityId(companyId: unknown, name: string) {
    return (await City.findOne({company: companyId, name}).select("_id"))?._id;
}

const locations = [
    {
        name: "Blloku Dental Studio",
        cityName: "Tirana",
        phone: "+355 69 000 2001",
        email: "blloku@clinic.demo",
        address: {
            street: "Rruga Pjetër Bogdani 7",
            postalCode: "1019",
            latitude: 41.3194,
            longitude: 19.8167,
        },
        openingHours: [
            ...WEEKDAYS.map((dayOfWeek) => ({
                dayOfWeek,
                startTime: "08:00",
                endTime: "18:00",
            })),
            {dayOfWeek: 6, startTime: "09:00", endTime: "13:00"},
        ],
    },
    {
        name: "Kombinat Family Dental",
        cityName: "Tirana",
        phone: "+355 69 000 2002",
        email: "kombinat@clinic.demo",
        address: {
            street: "Rruga Teodor Keko 22",
            postalCode: "1023",
            latitude: 41.3237,
            longitude: 19.7711,
        },
        openingHours: WEEKDAYS.map((dayOfWeek) => ({
            dayOfWeek,
            startTime: "09:00",
            endTime: "17:00",
        })),
    },
];

const services = [
    {
        name: "Check-up & consultation",
        slug: "check-up" as const,
        category: "checkup" as const,
        durationMinutes: 30,
        bufferAfterMinutes: 10,
        priceType: "fixed",
        price: 25,
        sortOrder: 1,
        description: "Examination, X-ray review and a treatment plan.",
    },
    {
        name: "Professional cleaning",
        slug: "cleaning" as const,
        category: "hygiene" as const,
        durationMinutes: 45,
        bufferAfterMinutes: 15,
        priceType: "fixed",
        price: 45,
        sortOrder: 2,
        description: "Scaling, polishing and fluoride.",
    },
    {
        name: "Tooth filling",
        slug: "filling" as const,
        category: "filling" as const,
        durationMinutes: 60,
        bufferAfterMinutes: 15,
        priceType: "from",
        price: 60,
        sortOrder: 3,
        description: "Composite filling; the price depends on the size.",
    },
    {
        name: "Teeth whitening",
        slug: "whitening" as const,
        category: "whitening" as const,
        durationMinutes: 60,
        bufferAfterMinutes: 10,
        priceType: "fixed",
        price: 150,
        sortOrder: 4,
        description: "In-chair whitening in one visit.",
    },
    {
        name: "Orthodontic consultation",
        slug: "ortho-consult" as const,
        category: "orthodontics" as const,
        durationMinutes: 45,
        bufferAfterMinutes: 0,
        priceType: "free",
        sortOrder: 5,
        description: "Braces and aligners: is it right for you?",
    },
];

/** `days` are the weekdays a practitioner works, at the location (index) and hours given. */
const practitioners = [
    {
        displayName: "Dr. Elira Shehu",
        title: "DMD",
        role: "dentist",
        languages: ["sq", "en", "it"],
        sortOrder: 1,
        bio: "General and cosmetic dentistry, fifteen years in practice.",
        services: ["check-up", "filling", "whitening"],
        shifts: [
            {
                location: 0,
                days: [1, 2, 3, 4],
                startTime: "09:00",
                endTime: "17:00",
            },
        ],
    },
    {
        displayName: "Dr. Marco Rossi",
        title: "DDS, MSc Ortho",
        role: "orthodontist",
        languages: ["it", "en"],
        sortOrder: 2,
        bio: "Braces and clear aligners for children and adults.",
        services: ["check-up", "ortho-consult"],
        shifts: [
            {location: 0, days: [2, 4], startTime: "10:00", endTime: "18:00"},
            {
                location: 1,
                days: [1, 3, 5],
                startTime: "09:00",
                endTime: "16:00",
            },
        ],
    },
    {
        displayName: "Anila Doda",
        title: "RDH",
        role: "hygienist",
        languages: ["sq", "en"],
        sortOrder: 3,
        bio: "Gentle cleanings and prevention advice.",
        services: ["cleaning"],
        shifts: [
            {location: 1, days: WEEKDAYS, startTime: "09:00", endTime: "17:00"},
        ],
    },
];

/** `nth` counts the coming days (from tomorrow) the practitioner works at that location. */
const appointments = [
    {
        key: "demo-seed-clinic-1",
        practitioner: "Dr. Elira Shehu",
        service: "check-up",
        location: 0,
        nth: 1,
        time: "09:00",
        patient: {
            firstName: "Besa",
            lastName: "Leka",
            email: "besa.leka@clinic.demo",
            phone: "+355 69 222 3301",
        },
    },
    {
        key: "demo-seed-clinic-2",
        practitioner: "Anila Doda",
        service: "cleaning",
        location: 1,
        nth: 1,
        time: "10:00",
        patient: {
            firstName: "Gent",
            lastName: "Mema",
            email: "gent.mema@clinic.demo",
            phone: "+355 69 222 3302",
        },
    },
    {
        key: "demo-seed-clinic-3",
        practitioner: "Dr. Marco Rossi",
        service: "ortho-consult",
        location: 1,
        nth: 2,
        time: "11:00",
        patient: {
            firstName: "Sara",
            lastName: "Conti",
            email: "sara.conti@clinic.demo",
            phone: "+39 333 000 4403",
        },
    },
    {
        key: "demo-seed-clinic-4",
        practitioner: "Dr. Elira Shehu",
        service: "filling",
        location: 0,
        nth: 3,
        time: "10:30",
        patient: {
            firstName: "Ilir",
            lastName: "Gjoka",
            email: "ilir.gjoka@clinic.demo",
            phone: "+355 69 222 3304",
        },
    },
] as const;

async function upsert<T>(
    model: Model<T>,
    filter: Record<string, unknown>,
    payload: Record<string, unknown>,
) {
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
    for (let found = 0; found < n; ) {
        date = addLocalDays(date, 1);
        if (days.includes(new Date(`${date}T12:00:00Z`).getUTCDay()))
            found += 1;
    }
    return date;
}

function workingDays(displayName: string, location: number): number[] {
    const practitioner = practitioners.find(
        (p) => p.displayName === displayName,
    )!;
    return practitioner.shifts
        .filter((shift) => shift.location === location)
        .flatMap((shift) => shift.days);
}

export async function seedDentalClinicDemoData(
    parentLogger: serverLogger | undefined,
    company: ICompany,
): Promise<void> {
    const logger = getLogger("dentalClinic_demo_data", parentLogger);
    logger.start(`Seeding dental clinic demo data for '${company.name}'...`);
    const createdBy = nestedEntityToRef(company.createdBy);
    if (!createdBy) {
        logger.fail(
            "Company has no createdBy; cannot seed dental clinic demo data.",
        );
        return;
    }
    const owned = {company: company._id, createdBy};

    try {
        const created = await clinicConfigService.getOrCreateForCompany(
            company._id,
            {logger, languageCode: LANGUAGE},
        );
        await ClinicConfig.updateOne(
            {_id: created._id},
            {
                $set: {
                    publicBookingEnabled: true,
                    listedOnPortal: true,
                    requireStaffConfirmation: false,
                    patientNoteEnabled: true,
                    privacyNoticeVersion: "demo-1",
                },
            },
        );

        const locationDocs: IClinicLocation[] = [];
        for (const {cityName, ...location} of locations) {
            locationDocs.push(
                (await upsert(
                    ClinicLocation,
                    {company: company._id, name: location.name},
                    {
                        ...owned,
                        ...location,
                        address: {
                            ...location.address,
                            city: await demoCityId(company._id, cityName),
                        },
                        timezone: TIMEZONE,
                        closures: [],
                        isActive: true,
                    },
                )) as unknown as IClinicLocation,
            );
        }

        const videoIds = await resolveDemoVideosFromUrls(
            DEMO_VIDEO_URLS,
            company,
            createdBy,
            logger,
        );
        const clips = (urls: string[]) =>
            urls.flatMap((url) => videoIds.get(url) ?? []);

        const serviceBySlug = new Map<string, IClinicService>();
        for (const service of services) {
            const {galleryIds} = await resolveDemoImagesFromUnsplash(
                SERVICE_PHOTOS[service.slug],
                `${company._id}:${service.slug}`,
                service.name,
                company,
                createdBy,
                logger,
                "clinicService",
                SERVICE_PHOTO_SIZE,
            );
            const doc = await upsert(
                ClinicService,
                {company: company._id, slug: service.slug},
                {
                    bufferBeforeMinutes: 0,
                    ...owned,
                    ...service,
                    images: galleryIds,
                    videos: clips(SERVICE_VIDEOS[service.slug]),
                    onlineBookable: true,
                    isPublic: true,
                    isActive: true,
                },
            );
            serviceBySlug.set(service.slug, doc as unknown as IClinicService);
        }

        for (const {
            services: slugs,
            shifts,
            ...practitioner
        } of practitioners) {
            const usedLocations = [
                ...new Set(shifts.map((shift) => shift.location)),
            ];
            const {galleryIds} = await resolveDemoImagesFromUnsplash(
                PRACTITIONER_PHOTOS[practitioner.displayName] ?? [],
                `${company._id}:${practitioner.displayName}`,
                practitioner.displayName,
                company,
                createdBy,
                logger,
                "practitioner",
                PRACTITIONER_PHOTO_SIZE,
            );
            await upsert(
                Practitioner,
                {company: company._id, displayName: practitioner.displayName},
                {
                    ...owned,
                    ...practitioner,
                    ...(galleryIds[0] ? {photo: galleryIds[0]} : {}),
                    services: slugs.map((slug) => serviceBySlug.get(slug)!._id),
                    locations: usedLocations.map(
                        (index) => locationDocs[index]._id,
                    ),
                    schedule: shifts.flatMap((shift) =>
                        shift.days.map((dayOfWeek) => ({
                            location: locationDocs[shift.location]._id,
                            dayOfWeek,
                            startTime: shift.startTime,
                            endTime: shift.endTime,
                        })),
                    ),
                    isBookable: true,
                    isActive: true,
                },
            );
        }

        const today = localDateOf(new Date(), TIMEZONE);
        // Elira's third working day: her filling (appointment 4) is that morning.
        const offDay = comingDay(today, workingDays("Dr. Elira Shehu", 0), 3);
        const elira = await Practitioner.findOne({
            company: company._id,
            displayName: "Dr. Elira Shehu",
        }).select("_id");
        await upsert(
            ScheduleException,
            {
                company: company._id,
                practitioner: elira!._id,
                internalNote: "Demo: afternoon off (training)",
            },
            {
                ...owned,
                startAt: localToUtc(offDay, "13:00", TIMEZONE),
                endAt: localToUtc(offDay, "17:00", TIMEZONE),
            },
        );

        const config = (await clinicConfigService.findForCompany(company._id, {
            logger,
            languageCode: LANGUAGE,
        }))!;
        let booked = 0;
        for (const appointment of appointments) {
            const practitioner = await Practitioner.findOne({
                company: company._id,
                displayName: appointment.practitioner,
            }).select("_id");
            booked += await runInTransaction(logger, async (session) => {
                const {service, location} = await loadBookingTargets(
                    company._id,
                    {
                        service: String(
                            serviceBySlug.get(appointment.service)!._id,
                        ),
                        location: String(
                            locationDocs[appointment.location]._id,
                        ),
                    },
                    {languageCode: LANGUAGE, online: false, session},
                );
                const {created: isNew} = await createAppointment(
                    {
                        companyId: company._id,
                        config,
                        service,
                        location,
                        practitionerId: String(practitioner!._id),
                        date: comingDay(
                            today,
                            workingDays(
                                appointment.practitioner,
                                appointment.location,
                            ),
                            appointment.nth,
                        ),
                        time: appointment.time,
                        patient: {...appointment.patient},
                        idempotencyKey: appointment.key,
                        source: "staff",
                    },
                    {
                        session,
                        logger,
                        languageCode: LANGUAGE,
                        auditUserId: company.createdBy as any,
                    },
                );
                return isNew ? 1 : 0;
            });
        }

        await seedPatientRecords({
            companyId: company._id,
            owned,
            today,
            services: serviceBySlug,
        });

        logger.finish(
            `Finished seeding dental clinic demo data (${booked} new appointments)!`,
        );
    } catch (error: unknown) {
        logger.err("Error seeding dental clinic demo data", error);
        logger.fail("Failed to seed dental clinic demo data!");
    }
}

/** Inserts when the natural key is new and leaves an existing row alone, so a second run adds nothing. */
async function ensure<T>(
    model: Model<T>,
    filter: Record<string, unknown>,
    insert: Record<string, unknown>,
) {
    const existing = await model.findOne(filter);
    if (existing) return existing;
    return model.create({...filter, ...insert});
}

/**
 * Patient folders for the four booked visits, plus an inquiry from abroad, two
 * treatment plans and the trip those plans are for. Keyed by email, inquiry key,
 * plan number and trip note.
 */
async function seedPatientRecords(input: {
    companyId: ObjectId;
    owned: {company: ObjectId; createdBy: ObjectId};
    today: string;
    services: Map<string, IClinicService>;
}): Promise<void> {
    const {companyId, owned, today, services} = input;
    const currency = await Currency.findOne({company: companyId}).select("_id");
    if (!currency)
        throw new Error(
            "Demo clinic has no currency; treatment plans need one",
        );

    const people = [
        {
            number: "PT-DEMO-0001",
            firstName: "Besa",
            lastName: "Leka",
            email: "besa.leka@clinic.demo",
            phone: "+355 69 222 3301",
            preferredLanguage: "sq-AL" as const,
            source: "walk_in" as const,
        },
        {
            number: "PT-DEMO-0002",
            firstName: "Gent",
            lastName: "Mema",
            email: "gent.mema@clinic.demo",
            phone: "+355 69 222 3302",
            preferredLanguage: "sq-AL" as const,
            source: "walk_in" as const,
        },
        {
            number: "PT-DEMO-0003",
            firstName: "Sara",
            lastName: "Conti",
            email: "sara.conti@clinic.demo",
            phone: "+39 333 000 4403",
            preferredLanguage: "it-IT" as const,
            source: "referral" as const,
        },
        {
            number: "PT-DEMO-0004",
            firstName: "Ilir",
            lastName: "Gjoka",
            email: "ilir.gjoka@clinic.demo",
            phone: "+355 69 222 3304",
            preferredLanguage: "sq-AL" as const,
            source: "phone" as const,
        },
        {
            number: "PT-DEMO-0005",
            firstName: "Elena",
            lastName: "Fischer",
            email: "elena.fischer@clinic.demo",
            phone: "+49 170 000 5505",
            preferredLanguage: "de-CH" as const,
            source: "portal" as const,
        },
    ];
    const patientByEmail = new Map<string, ObjectId>();
    for (const person of people) {
        const history =
            person.email === "besa.leka@clinic.demo"
                ? {
                      medicalHistory: {
                          version: "demo-1",
                          answers: MEDICAL_HISTORY_QUESTIONS.map((question) =>
                              question === "allergies"
                                  ? {
                                        question,
                                        answer: "yes" as const,
                                        detail: "Penicillin",
                                    }
                                  : {question, answer: "no" as const},
                          ),
                          medications: "None",
                          signedName: "Besa Leka",
                          submittedAt: localToUtc(today, "09:00", TIMEZONE),
                      },
                  }
                : {};
        const patient = await ensure(
            Patient,
            {company: companyId, email: person.email},
            {
                ...owned,
                ...person,
                tags: [],
                ...history,
            },
        );
        patientByEmail.set(person.email, patient._id);
    }

    const besaInquiry = await ensure(
        ClinicInquiry,
        {company: companyId, idempotencyKey: "demo-inquiry-besa"},
        {
            ...owned,
            number: "INQ-DEMO-0001",
            source: "walk_in",
            status: "converted",
            contact: {
                firstName: "Besa",
                lastName: "Leka",
                email: "besa.leka@clinic.demo",
                phone: "+355 69 222 3301",
                preferredLanguage: "sq-AL",
            },
            contactShared: true,
            treatmentsWanted: ["filling"],
            description: "A chipped molar, hoping to repair it this month.",
            patient: patientByEmail.get("besa.leka@clinic.demo"),
            files: [],
        },
    );
    const elenaInquiry = await ensure(
        ClinicInquiry,
        {company: companyId, idempotencyKey: "demo-inquiry-elena"},
        {
            ...owned,
            number: "INQ-DEMO-0002",
            source: "portal",
            status: "in_review",
            contact: {
                firstName: "Elena",
                lastName: "Fischer",
                email: "elena.fischer@clinic.demo",
                phone: "+49 170 000 5505",
                preferredLanguage: "de-CH",
            },
            contactShared: true,
            treatmentsWanted: ["implant"],
            description:
                "Travelling from Munich in the spring and looking for an implant quote.",
            budget: 2500,
            budgetCurrency: currency._id,
            travelFrom: addLocalDays(today, 40),
            travelTo: addLocalDays(today, 47),
            patient: patientByEmail.get("elena.fischer@clinic.demo"),
            files: [],
        },
    );

    await ensure(
        ClinicMessage,
        {
            company: companyId,
            inquiry: besaInquiry._id,
            body: "The chip is on a lower molar and it catches when I eat.",
        },
        {
            ...owned,
            from: "patient",
        },
    );
    await ensure(
        ClinicMessage,
        {
            company: companyId,
            inquiry: besaInquiry._id,
            body: "We can see you this week and send a short plan after the visit.",
        },
        {
            ...owned,
            from: "clinic",
        },
    );
    await ensure(
        ClinicMessage,
        {
            company: companyId,
            inquiry: elenaInquiry._id,
            body: "Could you tell me the cost and how many days I should stay?",
        },
        {
            ...owned,
            from: "patient",
        },
    );
    await ensure(
        ClinicMessage,
        {
            company: companyId,
            inquiry: elenaInquiry._id,
            body: "An implant is usually two visits, a few months apart. We will send a written plan.",
        },
        {
            ...owned,
            from: "clinic",
        },
    );

    const ortho = services.get("ortho-consult");
    const filling = services.get("filling");
    if (!ortho || !filling) throw new Error("Demo services are missing");

    const aligners = await ensure(
        TreatmentPlan,
        {company: companyId, number: "TP-DEMO-0001"},
        {
            ...owned,
            status: "sent",
            patient: patientByEmail.get("sara.conti@clinic.demo"),
            optionLabel: "Clear aligners",
            version: 1,
            currency: currency._id,
            phases: [
                {title: "Records and aligners", visits: 2, estimatedDays: 4},
            ],
            lines: [
                {
                    phase: 1,
                    kind: "treatment",
                    service: ortho._id,
                    name: "Clear aligners",
                    teeth: ["11", "21"],
                    quantity: 1,
                    unitPrice: 1800,
                },
            ],
            depositType: "percent",
            depositValue: 20,
            totals: {subtotal: 1800, discount: 0, total: 1800, deposit: 360},
            validUntil: addLocalDays(today, 30),
            sentAt: localToUtc(today, "11:00", TIMEZONE),
            notes: "Quoted after the orthodontic consultation.",
        },
    );
    await ensure(
        TreatmentPlan,
        {company: companyId, number: "TP-DEMO-0002"},
        {
            ...owned,
            status: "draft",
            patient: patientByEmail.get("ilir.gjoka@clinic.demo"),
            optionLabel: "Composite filling",
            version: 1,
            currency: currency._id,
            phases: [{title: "Repair", visits: 1, estimatedDays: 1}],
            lines: [
                {
                    phase: 1,
                    kind: "treatment",
                    service: filling._id,
                    name: "Composite filling",
                    teeth: ["36"],
                    quantity: 1,
                    unitPrice: 80,
                },
            ],
            depositType: "none",
            totals: {subtotal: 80, discount: 0, total: 80, deposit: 0},
            notes: "Draft until the check-up confirms the tooth.",
        },
    );

    await ensure(
        PatientTrip,
        {company: companyId, notes: "Demo trip: Sara Conti"},
        {
            ...owned,
            patient: patientByEmail.get("sara.conti@clinic.demo"),
            plan: aligners._id,
            phase: 1,
            status: "confirmed",
            arrivalAt: localToUtc(addLocalDays(today, 21), "14:30", TIMEZONE),
            departureAt: localToUtc(addLocalDays(today, 26), "10:15", TIMEZONE),
            arrivalFlight: "AZ 580",
            departureFlight: "AZ 581",
            accommodation: "Hotel Rogner, Tirana",
            transfer: true,
            companions: 1,
        },
    );
}
