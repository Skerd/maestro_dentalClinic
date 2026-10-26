import {Router} from "express";
import {ObjectId} from "mongodb";
import authMW, {type NotAuthenticatedMWType} from "@coreModule/utilities/middlewares/authMW";
import {asyncHandler} from "@coreModule/utilities/middlewares/asyncHandler";
import {rateLimiter} from "@coreModule/utilities/middlewares/rateLimiter";
import {validateFormZod} from "@coreModule/utilities/middlewares/validateFormZod";
import {transactionHandler, type TransactionRequiredParams} from "@coreModule/utilities/middlewares/transactionUtils";
import publicChatCustomerMW, {type PublicChatCustomerMWType} from "@coreModule/utilities/middlewares/publicChatCustomerMW";
import {publicCustomerFor, requirePortalAccount} from "@coreModule/domain/publicChat/publicChatCustomer";
import {companyIdsWithModule} from "@coreModule/utilities/modules/companyModules";
import {portalCompanyRefs} from "@coreModule/utilities/marketing/portalCompanies";
import {resolveCompanyByOrigin} from "@coreModule/utilities/marketing/resolveCompanyByOrigin";
import {isPortalOrigin} from "@coreModule/utilities/marketing/platformShopOrigin";
import {publicMediaUrl, publicMediaUrls} from "@coreModule/utilities/media/publicMediaUrl";
import {validateRecordAccessToken} from "@coreModule/utilities/security/recordAccessToken";
import {mapSnippet, nestedEntityToRef} from "@coreModule/utilities/mappers/common.mapper";
import {formatPostalAddress} from "@coreModule/utilities/helpers/postalAddress";
import Currency from "@coreModule/database/schemas/currency/currency";
import {CurrencySimpleSnippet} from "@coreModule/database/schemas/currency/currency.snippets";
import type {CurrencySimple} from "armonia/src/modules/core/dto/currency.dto";
import type {ICompany} from "@coreModule/database/schemas/company/company";
import {apiValidationException} from "armonia/src/modules/core/helpers/exceptions";
import {
    bookAppointmentFormSchema,
    clinicSlotsFormSchema,
    manageAppointmentFormSchema,
    rescheduleManagedAppointmentFormSchema,
} from "armonia/src/modules/dentalClinic/api/dentalClinic/public/clinicStorefront/clinicStorefront.form.validators";
import type {
    BookAppointmentFormType,
    ClinicSlotsFormType,
    ManageAppointmentFormType,
    RescheduleManagedAppointmentFormType,
} from "armonia/src/modules/dentalClinic/api/dentalClinic/public/clinicStorefront/clinicStorefront.forms";
import type {
    AppointmentBookingResponse,
    MyAppointmentsResponse,
    ClinicSlotsResponse,
    ClinicStorefrontConfigResponse,
    PublicAppointmentResponse,
    RescheduledAppointmentResponse,
} from "armonia/src/modules/dentalClinic/api/dentalClinic/public/clinicStorefront/clinicStorefront.response.types";
import {APPOINTMENT_LINK_PURPOSE} from "armonia/src/modules/dentalClinic/api/dentalClinic/private/appointment/appointment.constants";
import type {IClinicConfig} from "@dentalClinicModule/database/schemas/clinicConfig/clinicConfig";
import {clinicConfigService} from "@dentalClinicModule/database/schemas/clinicConfig/clinicConfig.service";
import ClinicLocation from "@dentalClinicModule/database/schemas/clinicLocation/clinicLocation";
import ClinicService from "@dentalClinicModule/database/schemas/clinicService/clinicService";
import Practitioner from "@dentalClinicModule/database/schemas/practitioner/practitioner";
import Appointment, {type IAppointment} from "@dentalClinicModule/database/schemas/appointment/appointment";
import {appointmentToPublic} from "@dentalClinicModule/utilities/mappers/appointment/appointmentMapper.dto";
import {availableSlots, eligiblePractitioners} from "@dentalClinicModule/utilities/services/clinicAvailability";
import {createAppointment, loadBookingTargets} from "@dentalClinicModule/utilities/services/appointmentBooking";
import {cancelAppointment, rescheduleAppointment} from "@dentalClinicModule/utilities/services/appointmentLifecycle";
import {manageTokenFor, notifyClinicStaff, notifyPatient} from "@dentalClinicModule/utilities/services/appointmentNotify";
import {NotificationEventCodes} from "@dentalClinicModule/domain/notifications/notificationEventCodes";

export const basePath = "/api/dentalClinic/clinicStorefront";

const MY_APPOINTMENTS_MAX = 50;
export const router = Router();

type PublicParams<F> = NotAuthenticatedMWType & F;

/** The tenant behind the site and its clinic settings; 404 until public booking is switched on. */
async function storefrontContext(origin: string, languageCode: string): Promise<{company: ICompany; config: IClinicConfig}> {
    const company = await resolveCompanyByOrigin(origin, languageCode);
    const config = await clinicConfigService.findForCompany(company._id, {languageCode});
    if (!config?.publicBookingEnabled) {
        throw apiValidationException("dental_clinic_not_configured", "", null, languageCode);
    }
    // On the portal, only clinics that opted in to being listed there.
    if (isPortalOrigin(origin) && !config.listedOnPortal) {
        throw apiValidationException("portal_company_not_listed", "", null, languageCode);
    }
    return {company, config};
}

async function currencyOf(config: IClinicConfig, languageCode: string): Promise<CurrencySimple> {
    const currency = mapSnippet<CurrencySimple>()(await Currency.findById(config.currency).select("name symbol abbreviation"), CurrencySimpleSnippet);
    if (!currency) throw apiValidationException("clinic_currency_not_configured", "", null, languageCode);
    return currency;
}

/** An appointment for its patient, with the currency populated for display. */
async function publicAppointment(appointment: IAppointment) {
    await appointment.populate({path: "currency", select: "name symbol abbreviation"});
    return appointmentToPublic(appointment);
}

/** The appointment a guest link opens, if the link is still the current one. */
async function appointmentFromLink(token: string, company: ICompany, languageCode: string, session?: TransactionRequiredParams["session"]): Promise<IAppointment> {
    const payload = validateRecordAccessToken(token, APPOINTMENT_LINK_PURPOSE, languageCode);
    if (payload.companyId !== company._id.toString()) {
        throw apiValidationException("token_verification_failed", "", null, languageCode);
    }
    const appointment = await Appointment.findOne({_id: new ObjectId(payload.recordId), company: company._id, deletedAt: null}).session(session ?? null);
    if (!appointment || appointment.manageTokenVersion !== payload.version || appointment.anonymizedAt) {
        throw apiValidationException("token_verification_failed", "", null, languageCode);
    }
    return appointment;
}

router.post(
    "/config",
    authMW("public"),
    rateLimiter({windowMs: 60000, max: 60}),
    asyncHandler(async ({origin, languageCode}: NotAuthenticatedMWType): Promise<ClinicStorefrontConfigResponse> => {
        const {company, config} = await storefrontContext(origin, languageCode);
        const [locations, services, practitioners, currency] = await Promise.all([
            ClinicLocation.find({company: company._id, isActive: true, deletedAt: null}).populate([{path: "address.city", select: "name"}]).sort({name: 1}),
            ClinicService.find({company: company._id, isActive: true, isPublic: true, deletedAt: null}).sort({sortOrder: 1, name: 1}),
            Practitioner.find({company: company._id, isActive: true, deletedAt: null}).sort({sortOrder: 1, displayName: 1}),
            currencyOf(config, languageCode),
        ]);
        const bookableServiceIds = new Set(services.filter((service) => service.onlineBookable).map((service) => String(service._id)));
        return {
            data: {
                company: {
                    name: company.name,
                    logo: publicMediaUrl(company.logo),
                    email: company.email,
                    phoneNumber: company.phoneNumber,
                    website: company.website,
                },
                currency,
                guestBookingAllowed: config.guestBookingAllowed,
                requireStaffConfirmation: config.requireStaffConfirmation,
                patientNoteEnabled: config.patientNoteEnabled,
                minNoticeHours: config.minNoticeHours,
                maxAdvanceDays: config.maxAdvanceDays,
                cancellationDeadlineHours: config.cancellationDeadlineHours,
                rescheduleDeadlineHours: config.rescheduleDeadlineHours,
                privacyNoticeVersion: config.privacyNoticeVersion,
                privacyNoticeText: config.privacyNoticeText,
                locations: locations.map((location) => ({
                    _id: location._id.toString(),
                    name: location.name,
                    address: formatPostalAddress(location.address),
                    phone: location.phone,
                    email: location.email,
                    timezone: location.timezone,
                    openingHours: location.openingHours.map(({dayOfWeek, startTime, endTime}) => ({dayOfWeek, startTime, endTime})),
                })),
                services: services.map((service) => ({
                    _id: service._id.toString(),
                    name: service.name,
                    slug: service.slug,
                    description: service.description,
                    images: publicMediaUrls(service.images),
                    durationMinutes: service.durationMinutes,
                    priceType: service.priceType,
                    price: service.priceType === "fixed" || service.priceType === "from" ? service.price : undefined,
                })),
                practitioners: practitioners.map((practitioner) => ({
                    _id: practitioner._id.toString(),
                    displayName: practitioner.displayName,
                    title: practitioner.title,
                    role: practitioner.role,
                    bio: practitioner.bio,
                    photo: publicMediaUrl(practitioner.photo),
                    languages: practitioner.languages ?? [],
                    // Only what can be booked online: someone not bookable still shows on the team page.
                    services: practitioner.isBookable
                        ? practitioner.services.map((service) => String(nestedEntityToRef(service))).filter((id) => bookableServiceIds.has(id))
                        : [],
                    locations: practitioner.isBookable ? practitioner.locations.map((location) => String(nestedEntityToRef(location))) : [],
                })),
            },
        };
    }),
);

/** Free start times. Advisory: booking checks again under the practitioner's lock. */
router.post(
    "/slots",
    authMW("public"),
    rateLimiter({windowMs: 60000, max: 60}),
    validateFormZod(clinicSlotsFormSchema),
    asyncHandler(async (params: PublicParams<ClinicSlotsFormType>): Promise<ClinicSlotsResponse> => {
        const {origin, languageCode} = params;
        const {company, config} = await storefrontContext(origin, languageCode);
        const {service, location} = await loadBookingTargets(company._id, params, {languageCode, online: true});
        const practitioners = await eligiblePractitioners({
            companyId: company._id,
            serviceId: service._id,
            locationId: location._id,
            practitionerId: params.practitioner,
            online: true,
        });
        const days = await availableSlots({
            companyId: company._id,
            rules: config,
            service,
            location,
            practitioners,
            fromDate: params.fromDate,
            days: params.days,
            now: new Date(),
        });
        return {data: {timezone: location.timezone, days}};
    }),
);

/**
 * Online booking. A signed-in patient (login token on the request) is linked to
 * the appointment; guests need the clinic to allow guest booking. Without a
 * practitioner, the clinic assigns whoever is free.
 */
router.post(
    "/book",
    authMW("public"),
    rateLimiter({windowMs: 60000, max: 10, failClosed: true}),
    transactionHandler(),
    validateFormZod(bookAppointmentFormSchema),
    publicChatCustomerMW(),
    asyncHandler(async (params: TransactionRequiredParams & PublicParams<BookAppointmentFormType> & PublicChatCustomerMWType): Promise<AppointmentBookingResponse> => {
        const {origin, languageCode, session, logger} = params;
        const {company, config} = await storefrontContext(origin, languageCode);
        const customer = await publicCustomerFor(params.customer, company, origin);
        if (!customer && !config.guestBookingAllowed) {
            throw apiValidationException("appointment_guest_booking_disabled", "", null, languageCode);
        }
        if (!params.acceptPrivacy) {
            throw apiValidationException("appointment_privacy_not_accepted", "", null, languageCode);
        }

        const ctx = {session, logger, languageCode, auditUserId: customer?._id};
        const {service, location} = await loadBookingTargets(company._id, params, {languageCode, online: true, session});
        const {appointment, created} = await createAppointment(
            {
                companyId: company._id,
                config,
                service,
                location,
                practitionerId: params.practitioner,
                date: params.date,
                time: params.time,
                patient: params.patient,
                customerId: customer?._id,
                note: params.note,
                idempotencyKey: params.idempotencyKey,
                source: "online",
                bookedVia: isPortalOrigin(origin) ? "portal" : "site",
                consentAt: new Date(),
            },
            ctx,
        );
        if (created) {
            await notifyPatient(appointment.status === "pending" ? "requested" : "confirmed", appointment, ctx);
            await notifyClinicStaff(NotificationEventCodes.APPOINTMENT_NEW, appointment, ctx);
        }
        return {data: {appointment: await publicAppointment(appointment), manageToken: manageTokenFor(appointment)}};
    }),
);

/**
 * A portal account's appointments at every clinic that still has the module, latest first.
 * Each comes with the clinic's portal slug and a fresh manage token, so the existing
 * manage/cancel/reschedule endpoints serve it under `x-site-company`.
 */
router.post(
    "/mine",
    authMW("public"),
    rateLimiter({windowMs: 60000, max: 30}),
    publicChatCustomerMW(),
    asyncHandler(async (params: PublicParams<object> & PublicChatCustomerMWType): Promise<MyAppointmentsResponse> => {
        const {origin, languageCode} = params;
        const user = await requirePortalAccount(params.customer, origin, languageCode);
        const appointments = await Appointment.find({
            customer: user._id,
            deletedAt: null,
            anonymizedAt: null,
            company: {$in: await companyIdsWithModule("dentalClinic")},
        }).sort({startAt: -1}).limit(MY_APPOINTMENTS_MAX);
        const companies = await portalCompanyRefs(appointments.map((appointment) => nestedEntityToRef(appointment.company)!));
        const data = await Promise.all(appointments.map(async (appointment) => ({
            appointment: await publicAppointment(appointment),
            company: companies.get(String(nestedEntityToRef(appointment.company))) ?? {name: "", slug: ""},
            manageToken: manageTokenFor(appointment),
        })));
        return {data};
    }),
);

/** The guest "manage your appointment" page. */
router.post(
    "/manage",
    authMW("public"),
    rateLimiter({windowMs: 60000, max: 30, failClosed: true}),
    validateFormZod(manageAppointmentFormSchema),
    asyncHandler(async (params: PublicParams<ManageAppointmentFormType>): Promise<PublicAppointmentResponse> => {
        const {origin, languageCode, token} = params;
        const company = await resolveCompanyByOrigin(origin, languageCode);
        return {data: await publicAppointment(await appointmentFromLink(token, company, languageCode))};
    }),
);

/** Guest cancellation before the deadline. The link stops working afterwards. */
router.post(
    "/manage/cancel",
    authMW("public"),
    rateLimiter({windowMs: 60000, max: 10, failClosed: true}),
    transactionHandler(),
    validateFormZod(manageAppointmentFormSchema),
    asyncHandler(async (params: TransactionRequiredParams & PublicParams<ManageAppointmentFormType>): Promise<PublicAppointmentResponse> => {
        const {origin, languageCode, token, session, logger} = params;
        const company = await resolveCompanyByOrigin(origin, languageCode);
        const appointment = await appointmentFromLink(token, company, languageCode, session);
        await cancelAppointment(appointment, {by: "patient", reason: "cancelled_by_patient"}, {session, logger, languageCode});
        return {data: await publicAppointment(appointment)};
    }),
);

/** Guest move to another free time with the same practitioner; answers with the new link. */
router.post(
    "/manage/reschedule",
    authMW("public"),
    rateLimiter({windowMs: 60000, max: 10, failClosed: true}),
    transactionHandler(),
    validateFormZod(rescheduleManagedAppointmentFormSchema),
    asyncHandler(async (params: TransactionRequiredParams & PublicParams<RescheduleManagedAppointmentFormType>): Promise<RescheduledAppointmentResponse> => {
        const {origin, languageCode, token, session, logger} = params;
        const {company} = await storefrontContext(origin, languageCode);
        const appointment = await appointmentFromLink(token, company, languageCode, session);
        await rescheduleAppointment(appointment, {by: "patient", date: params.date, time: params.time}, {session, logger, languageCode});
        return {data: {appointment: await publicAppointment(appointment), manageToken: manageTokenFor(appointment)}};
    }),
);
