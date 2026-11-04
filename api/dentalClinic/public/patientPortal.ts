import {Router, type Request, type Response} from "express";
import {ObjectId} from "mongodb";
import authMW, {type NotAuthenticatedMWType} from "@coreModule/utilities/middlewares/authMW";
import {asyncHandler} from "@coreModule/utilities/middlewares/asyncHandler";
import {rateLimiter} from "@coreModule/utilities/middlewares/rateLimiter";
import {validateFormZod} from "@coreModule/utilities/middlewares/validateFormZod";
import {transactionHandler, type TransactionRequiredParams} from "@coreModule/utilities/middlewares/transactionUtils";
import {mediaUploadMW} from "@coreModule/utilities/middlewares/mediaUploadMW";
import publicChatCustomerMW, {type PublicChatCustomerMWType} from "@coreModule/utilities/middlewares/publicChatCustomerMW";
import {requirePortalAccount} from "@coreModule/domain/publicChat/publicChatCustomer";
import {addressCitiesByCompany, findPlatformCompany, findPortalSiteCompany, portalCompanyCards, type PortalScope} from "@coreModule/utilities/marketing/portalCompanies";
import {portalSiteSlug} from "@coreModule/utilities/marketing/portalOrigin";
import {getLogger} from "@coreModule/loggers/serverLog";
import {serveMedia} from "@coreModule/utilities/media/serveMedia";
import {dateToISOString, nestedEntityToRef} from "@coreModule/utilities/mappers/common.mapper";
import Media, {type IMedia} from "@coreModule/database/schemas/media/media";
import type {IUser} from "@coreModule/database/schemas/user/user";
import {apiValidationException} from "armonia/src/modules/core/helpers/exceptions";
import {INQUIRY_FILES_MAX, PATIENT_FILE_MAX_BYTES, PATIENT_FILE_MIME_TYPES, TREATMENT_CATEGORIES, type TreatmentCategory} from "armonia/src/modules/dentalClinic/constants";
import {
    acceptTreatmentPlanFormSchema,
    createPatientRequestFormSchema,
    patientAttachFilesFormSchema,
    patientCaseFormSchema,
    patientInquiryFormSchema,
    patientMessageFormSchema,
    patientMedicalHistoryFormSchema,
    patientTripDetailsFormSchema,
    payPlanDepositFormSchema,
} from "armonia/src/modules/dentalClinic/api/dentalClinic/public/patientPortal/patientPortal.form.validators";
import type {
    AcceptTreatmentPlanFormType,
    CreatePatientRequestFormType,
    PatientAttachFilesFormType,
    PatientCaseFormType,
    PatientInquiryFormType,
    PatientMessageFormType,
    PatientMedicalHistoryFormType,
    PatientTripDetailsFormType,
    PayPlanDepositFormType,
} from "armonia/src/modules/dentalClinic/api/dentalClinic/public/patientPortal/patientPortal.forms";
import type {
    PatientCase,
    PatientCaseResponse,
    PatientCasesResponse,
    PatientDepositPaymentResponse,
    PatientFile,
    PatientInquiry,
    PatientInquiryResponse,
    PatientPlanAcceptedResponse,
    PatientPlansResponse,
    PatientRequestCreatedResponse,
    PatientThreadResponse,
    PatientTripResponse,
    PatientTripsResponse,
    PatientTripView,
    PatientUploadResponse,
    RequestableClinicsResponse,
} from "armonia/src/modules/dentalClinic/api/dentalClinic/public/patientPortal/patientPortal.response.types";
import ClinicConfig from "@dentalClinicModule/database/schemas/clinicConfig/clinicConfig";
import ClinicLocation from "@dentalClinicModule/database/schemas/clinicLocation/clinicLocation";
import ClinicService from "@dentalClinicModule/database/schemas/clinicService/clinicService";
import ClinicInquiry, {type IClinicInquiry} from "@dentalClinicModule/database/schemas/clinicInquiry/clinicInquiry";
import ClinicMessage from "@dentalClinicModule/database/schemas/clinicMessage/clinicMessage";
import {NotificationEventCodes} from "@dentalClinicModule/domain/notifications/notificationEventCodes";
import {assertTreatments, claimPatientUploads, idsOf, openPatientRequest, requestableClinicIds} from "@dentalClinicModule/utilities/services/inquiryIntake";
import {attachInquiryFiles, openInfoRequests, shareInquiryContact, submitMedicalHistory, withdrawInquiry} from "@dentalClinicModule/utilities/services/inquiryLifecycle";
import {medicalHistoryToDTO} from "@dentalClinicModule/utilities/mappers/medicalHistory/medicalHistoryMapper.dto";
import PatientTrip, {type IPatientTrip} from "@dentalClinicModule/database/schemas/patientTrip/patientTrip";
import {tripsOfInquiries, updateTripDetails} from "@dentalClinicModule/utilities/services/patientTrips";
import {postInquiryMessage, readThread} from "@dentalClinicModule/utilities/services/inquiryThread";
import {notifyInquiryStaff, notifyRequestSent} from "@dentalClinicModule/utilities/services/inquiryNotify";
import TreatmentPlan, {type ITreatmentPlan} from "@dentalClinicModule/database/schemas/treatmentPlan/treatmentPlan";
import {treatmentPlanToPatient} from "@dentalClinicModule/utilities/mappers/treatmentPlan/treatmentPlanMapper.dto";
import {acceptPlan} from "@dentalClinicModule/utilities/services/treatmentPlans";
import {sendTreatmentPlanPdf} from "@dentalClinicModule/utilities/pdf/sendTreatmentPlanPdf";
import {PAYMENTS} from "@financeModule/environment";
import {registerPaymentSourceHandler} from "@financeModule/utilities/services/payment/paymentSourceHandlers";
import {runInTransaction} from "@coreModule/utilities/middlewares/runInTransaction";
import {asCrossTenant, setRequestTenant, withTenant} from "@coreModule/utilities/endpoints/tenantScope";
import {failDepositPayment, onlinePaymentAvailable, settleDepositPayment, startDepositPayment} from "@dentalClinicModule/utilities/services/treatmentPlanPayments";

export const basePath = "/api/dentalClinic/patientPortal";
export const router = Router();

/**
 * Settles the online deposit when the payment webhook arrives. Each settlement runs in its own
 * transaction (the webhook has none) and re-reads the plan inside it.
 */
registerPaymentSourceHandler(["treatmentPlan"], {
    async succeeded(intent, {logger, languageCode}) {
        await runInTransaction(logger, async (session) => {
            const plan = await planOfPaymentIntent(intent.id, session);
            if (plan) await withTenant(nestedEntityToRef(plan.company)!, () => settleDepositPayment(plan, intent, {session, logger, languageCode}), "dentalClinic");
        });
    },
    async failed(intent, {logger, languageCode}) {
        await runInTransaction(logger, async (session) => {
            const plan = await planOfPaymentIntent(intent.id, session);
            if (plan) await withTenant(nestedEntityToRef(plan.company)!, () => failDepositPayment(plan, intent, {session, logger, languageCode}), "dentalClinic");
        });
    },
});

/** The webhook names only the payment intent, so the plan is looked up across clinics (D16). */
function planOfPaymentIntent(intentId: string, session: TransactionRequiredParams["session"]): Promise<ITreatmentPlan | null> {
    return asCrossTenant("a payment webhook names only the payment intent", () =>
        TreatmentPlan.findOne({stripePaymentIntentId: intentId}).session(session));
}

/**
 * A portal patient works on their own requests at every clinic they wrote to (D16). These handlers
 * reach records only through the patient's own account (`loadOwnInquiry`, `loadOwnPlan`, `account`
 * filters), which is what keeps one patient out of another's data.
 */
const asPatient = <A extends unknown[], R>(handler: (...args: A) => Promise<R>) =>
    (...args: A): Promise<R> => asCrossTenant("a portal patient's own requests at every clinic", () => handler(...args));

const MY_CASES_MAX = 30;
const HOUR = 3600 * 1000;
/** Response time is reported from this many recent answered requests at least. */
const RESPONSE_SAMPLE_MIN = 3;
const RESPONSE_WINDOW_DAYS = 90;
const FILE_SELECT = "originalName fileName mimeType sizeInBytes";

type PortalParams<F> = NotAuthenticatedMWType & PublicChatCustomerMWType & F;

/** The clinics a request may go to on this host: the clinic itself on its own site, the listed ones on the apex. */
async function requestScope(origin: string, languageCode: string): Promise<PortalScope> {
    const slug = portalSiteSlug(origin);
    if (!slug) return {};
    const company = await findPortalSiteCompany(slug, "dentalClinic", languageCode);
    return {companyId: company._id};
}

/** Populated media as the patient lists them; an unpopulated id has no name and is skipped. */
const patientFiles = (list: IMedia[]): PatientFile[] =>
    list
        .filter((file) => !!file?.originalName)
        .map((file) => ({_id: String(file._id), name: file.originalName || file.fileName, mimeType: file.mimeType, size: file.sizeInBytes}));

/** The signed-in portal account, and the platform company its uploads belong to. */
async function portalAccount(params: PortalParams<object>): Promise<{user: IUser; platformCompanyId: ObjectId}> {
    const {customer, origin, languageCode} = params;
    const user = await requirePortalAccount(customer, origin, languageCode);
    if (!customer) throw apiValidationException("no_token", "token", null, languageCode);
    return {user, platformCompanyId: customer.companyId};
}

/** One of the signed-in patient's inquiries, with its files ready to list. */
async function loadOwnInquiry(accountId: ObjectId, inquiryId: string, languageCode: string, session?: TransactionRequiredParams["session"]): Promise<IClinicInquiry> {
    const inquiry = ObjectId.isValid(inquiryId)
        ? await ClinicInquiry.findOne({_id: new ObjectId(inquiryId), account: accountId, deletedAt: null}).session(session ?? null)
        : null;
    if (!inquiry) throw apiValidationException("inquiry_not_found", "", null, languageCode);
    return inquiry;
}

async function toPatientInquiries(inquiries: IClinicInquiry[]): Promise<PatientInquiry[]> {
    const clinics = await portalCompanyCards(inquiries.map((inquiry) => nestedEntityToRef(inquiry.company)).filter((id): id is ObjectId => id !== undefined), new Map());
    const byId = new Map(clinics.map((clinic) => [clinic._id, clinic]));
    await ClinicInquiry.populate(inquiries, {path: "files", select: FILE_SELECT});
    return inquiries.map((inquiry) => {
        const clinic = byId.get(String(nestedEntityToRef(inquiry.company)));
        return {
            _id: inquiry._id.toString(),
            number: inquiry.number,
            status: inquiry.status,
            clinic: {_id: clinic?._id ?? "", name: clinic?.name ?? "", slug: clinic?.slug ?? "", logo: clinic?.logo},
            contactShared: inquiry.contactShared,
            infoRequests: inquiry.infoRequests.map(({kind, note, requestedAt, fulfilledAt}) => ({
                kind,
                note,
                requestedAt: dateToISOString(requestedAt),
                fulfilledAt: fulfilledAt ? dateToISOString(fulfilledAt) : undefined,
            })),
            openInfoRequests: openInfoRequests(inquiry),
            files: patientFiles(inquiry.files),
            unreadForPatient: inquiry.unreadForPatient ?? 0,
            lastMessageAt: inquiry.lastMessageAt ? dateToISOString(inquiry.lastMessageAt) : undefined,
            createdAt: dateToISOString(inquiry.createdAt),
        };
    });
}

/** One request as sent; every inquiry of a group carries the same request. */
async function toPatientCase(inquiries: IClinicInquiry[]): Promise<PatientCase> {
    const [first] = inquiries;
    // The latest questionnaire sent with the request (every clinic of it got the same one).
    const history = inquiries
        .map((inquiry) => inquiry.medicalHistory)
        .filter((entry) => !!entry?.submittedAt)
        .sort((a, b) => b!.submittedAt.getTime() - a!.submittedAt.getTime())[0];
    return {
        requestGroup: first.requestGroup ?? "",
        treatmentsWanted: [...first.treatmentsWanted],
        description: first.description,
        travelFrom: first.travelFrom,
        travelTo: first.travelTo,
        createdAt: dateToISOString(first.createdAt),
        inquiries: await toPatientInquiries(inquiries),
        medicalHistory: medicalHistoryToDTO(history),
    };
}

/** Hours from request to first answer, median over the clinic's recent requests. */
async function medianResponseHours(companyIds: ObjectId[]): Promise<Map<string, number>> {
    const since = new Date(Date.now() - RESPONSE_WINDOW_DAYS * 24 * HOUR);
    const answered = await ClinicInquiry.find({company: {$in: companyIds}, firstResponseAt: {$ne: null}, createdAt: {$gte: since}, deletedAt: null})
        .select("company createdAt firstResponseAt")
        .lean<{company: ObjectId; createdAt: Date; firstResponseAt: Date}[]>();
    const hours = new Map<string, number[]>();
    for (const inquiry of answered) {
        const key = String(inquiry.company);
        hours.set(key, [...(hours.get(key) ?? []), (inquiry.firstResponseAt.getTime() - inquiry.createdAt.getTime()) / HOUR]);
    }
    const medians = new Map<string, number>();
    for (const [key, values] of hours) {
        if (values.length < RESPONSE_SAMPLE_MIN) continue;
        const sorted = [...values].sort((a, b) => a - b);
        const middle = Math.floor(sorted.length / 2);
        const median = sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
        medians.set(key, Math.max(1, Math.round(median)));
    }
    return medians;
}

/**
 * Uploads ahead of a request or message are owned by the platform company and created by the
 * portal account; `mediaUploadMW` reads both from the body, so they are set here.
 */
const asPortalUploader = () => async (req: Request, _res: Response, next: (error?: unknown) => void) => {
    try {
        const {customer, origin, languageCode} = req.body;
        const user = await requirePortalAccount(customer, origin, languageCode);
        req.body.userInfo = {_id: user._id};
        req.body.user = {company: {_id: customer.companyId}};
        setRequestTenant(customer.companyId, languageCode);
        next();
    } catch (error) {
        next(error);
    }
};

const patientUpload = mediaUploadMW({
    fields: {files: INQUIRY_FILES_MAX},
    fieldMimeTypes: {files: [...PATIENT_FILE_MIME_TYPES]},
    maxFileSize: PATIENT_FILE_MAX_BYTES,
    // Claimed by the request or message that names them; unclaimed ones are swept.
    markPendingReference: true,
});

/** Clinics taking estimate requests here, with what a patient compares them on. */
router.post(
    "/clinics",
    authMW("public"),
    rateLimiter({windowMs: 60000, max: 60}),
    asyncHandler(async ({origin, languageCode}: NotAuthenticatedMWType): Promise<RequestableClinicsResponse> => asCrossTenant("the public clinic directory lists every clinic", async () => {
        const companyIds = await requestableClinicIds(await requestScope(origin, languageCode));
        const [cities, configs, services, responseHours] = await Promise.all([
            addressCitiesByCompany(ClinicLocation, companyIds),
            ClinicConfig.find({company: {$in: companyIds}, deletedAt: null}).select("company languagesSpoken implantBrands profileTexts"),
            ClinicService.find({company: {$in: companyIds}, isActive: true, isPublic: true, deletedAt: null}).select("company category").lean<{company: ObjectId; category: TreatmentCategory}[]>(),
            medianResponseHours(companyIds),
        ]);
        const cards = await portalCompanyCards(companyIds, cities);
        const configByCompany = new Map(configs.map((config) => [String(config.company), config]));
        return {
            data: cards.map((card) => {
                const config = configByCompany.get(card._id);
                const texts = config?.profileTexts ?? [];
                const text = texts.find((row) => row.locale === languageCode) ?? texts[0];
                const categories = new Set(services.filter((service) => String(service.company) === card._id).map((service) => service.category));
                return {
                    _id: card._id,
                    name: card.name,
                    slug: card.slug,
                    logo: card.logo,
                    cities: card.cities,
                    languagesSpoken: config?.languagesSpoken ?? [],
                    implantBrands: config?.implantBrands ?? [],
                    headline: text?.headline,
                    medianFirstResponseHours: responseHours.get(card._id),
                    treatmentCategories: TREATMENT_CATEGORIES.filter((category) => categories.has(category)),
                };
            }),
        };
    })),
);

/** Files for a request or a message, uploaded first; the request or message then names them. */
router.post(
    "/upload",
    authMW("public"),
    rateLimiter({windowMs: 60000, max: 20, failClosed: true}),
    publicChatCustomerMW(),
    asPortalUploader(),
    patientUpload,
    asyncHandler(async (params: PortalParams<{files?: string[]}>): Promise<PatientUploadResponse> => {
        const files = await Media.find({_id: {$in: idsOf(params.files ?? [])}}).select(FILE_SELECT);
        return {data: patientFiles(files)};
    }),
);

/** Sends one estimate request to the chosen clinics (one inquiry each). */
router.post(
    "/requests",
    authMW("public"),
    rateLimiter({windowMs: 60000, max: 5, failClosed: true}),
    transactionHandler(),
    validateFormZod(createPatientRequestFormSchema),
    publicChatCustomerMW(),
    asyncHandler(asPatient(async (params: TransactionRequiredParams & PortalParams<CreatePatientRequestFormType>): Promise<PatientRequestCreatedResponse> => {
        const {origin, languageCode, session, logger} = params;
        const {user, platformCompanyId} = await portalAccount(params);
        if (!params.acceptConsent) throw apiValidationException("inquiry_consent_required", "", null, languageCode);

        const ctx = {session, logger, languageCode, auditUserId: user._id};
        const {contact} = params;
        const {requestGroup, inquiries, created} = await openPatientRequest(
            {
                accountId: user._id,
                platformCompanyId,
                scope: await requestScope(origin, languageCode),
                clinicIds: params.clinics,
                contact: {...contact, country: contact.country ? new ObjectId(contact.country) : undefined},
                request: {
                    treatmentsWanted: assertTreatments(params.treatmentsWanted, languageCode),
                    description: params.description,
                    travelFrom: params.travelFrom,
                    travelTo: params.travelTo,
                    budget: params.budget,
                    budgetCurrency: params.budgetCurrency ? new ObjectId(params.budgetCurrency) : undefined,
                },
                fileIds: params.files ?? [],
                consentVersion: params.consentVersion,
                idempotencyKey: params.idempotencyKey,
                source: portalSiteSlug(origin) ? "clinic_site" : "portal",
            },
            ctx,
        );
        if (created) {
            const platform = await findPlatformCompany(languageCode);
            await notifyRequestSent(inquiries, {companyId: String(platform._id), name: platform.name}, ctx);
            for (const inquiry of inquiries) await notifyInquiryStaff(NotificationEventCodes.INQUIRY_NEW, inquiry, ctx);
        }
        return {data: {requestGroup, inquiries: inquiries.length}};
    })),
);

/** The signed-in patient's requests, newest first, each with every clinic's answer so far. */
router.post(
    "/cases",
    authMW("public"),
    rateLimiter({windowMs: 60000, max: 60}),
    publicChatCustomerMW(),
    asyncHandler(asPatient(async (params: PortalParams<object>): Promise<PatientCasesResponse> => {
        const user = await requirePortalAccount(params.customer, params.origin, params.languageCode);
        const inquiries = await ClinicInquiry.find({account: user._id, requestGroup: {$ne: null}, deletedAt: null}).sort({createdAt: -1});
        const groups = new Map<string, IClinicInquiry[]>();
        for (const inquiry of inquiries) {
            const key = inquiry.requestGroup ?? "";
            if (!groups.has(key) && groups.size >= MY_CASES_MAX) continue;
            groups.set(key, [...(groups.get(key) ?? []), inquiry]);
        }
        return {data: await Promise.all([...groups.values()].map(toPatientCase))};
    })),
);

router.post(
    "/case",
    authMW("public"),
    rateLimiter({windowMs: 60000, max: 60}),
    validateFormZod(patientCaseFormSchema),
    publicChatCustomerMW(),
    asyncHandler(asPatient(async (params: PortalParams<PatientCaseFormType>): Promise<PatientCaseResponse> => {
        const user = await requirePortalAccount(params.customer, params.origin, params.languageCode);
        const inquiries = await ClinicInquiry.find({account: user._id, requestGroup: params.requestGroup, deletedAt: null}).sort({createdAt: 1});
        if (!inquiries.length) throw apiValidationException("inquiry_not_found", "", null, params.languageCode);
        return {data: await toPatientCase(inquiries)};
    })),
);

/** The thread with one clinic; opening it marks the clinic's messages read. */
router.post(
    "/thread",
    authMW("public"),
    rateLimiter({windowMs: 60000, max: 120}),
    transactionHandler(),
    validateFormZod(patientInquiryFormSchema),
    publicChatCustomerMW(),
    asyncHandler(asPatient(async (params: TransactionRequiredParams & PortalParams<PatientInquiryFormType>): Promise<PatientThreadResponse> => {
        const {origin, languageCode, session, logger} = params;
        const user = await requirePortalAccount(params.customer, origin, languageCode);
        const inquiry = await loadOwnInquiry(user._id, params.inquiry, languageCode, session);
        const messages = await readThread(inquiry, "patient", {session, logger, languageCode});
        return {
            data: messages.map((message) => ({
                _id: message._id.toString(),
                from: message.from,
                // Patients see the clinic, not which staff member wrote.
                body: message.body,
                attachments: patientFiles(message.attachments),
                readAt: message.readAt ? dateToISOString(message.readAt) : undefined,
                createdAt: dateToISOString(message.createdAt),
            })),
        };
    })),
);

router.post(
    "/message",
    authMW("public"),
    rateLimiter({windowMs: 60000, max: 20, failClosed: true}),
    transactionHandler(),
    validateFormZod(patientMessageFormSchema),
    publicChatCustomerMW(),
    asyncHandler(asPatient(async (params: TransactionRequiredParams & PortalParams<PatientMessageFormType>): Promise<{data: {sent: true}}> => {
        const {languageCode, session, logger} = params;
        const {user, platformCompanyId} = await portalAccount(params);
        const inquiry = await loadOwnInquiry(user._id, params.inquiry, languageCode, session);
        const ctx = {session, logger, languageCode, auditUserId: user._id};
        const attachments = await claimPatientUploads(params.attachments ?? [], {accountId: user._id, platformCompanyId}, ctx);
        await postInquiryMessage(inquiry, {from: "patient", authorId: user._id, body: params.body, attachments}, ctx);
        return {data: {sent: true}};
    })),
);

/** More files for one clinic, optionally answering what it asked for. */
router.post(
    "/attach",
    authMW("public"),
    rateLimiter({windowMs: 60000, max: 20, failClosed: true}),
    transactionHandler(),
    validateFormZod(patientAttachFilesFormSchema),
    publicChatCustomerMW(),
    asyncHandler(asPatient(async (params: TransactionRequiredParams & PortalParams<PatientAttachFilesFormType>): Promise<PatientInquiryResponse> => {
        const {languageCode, session, logger} = params;
        const {user, platformCompanyId} = await portalAccount(params);
        const inquiry = await loadOwnInquiry(user._id, params.inquiry, languageCode, session);
        await attachInquiryFiles(
            inquiry,
            {userId: user._id, fileIds: params.files, fulfils: params.fulfils, owner: {accountId: user._id, platformCompanyId}},
            {session, logger, languageCode, auditUserId: user._id},
        );
        const [mapped] = await toPatientInquiries([inquiry]);
        return {data: mapped};
    })),
);

/** Lets this clinic see the patient's full name, email and phone numbers. */
router.post(
    "/shareContact",
    authMW("public"),
    rateLimiter({windowMs: 60000, max: 20}),
    transactionHandler(),
    validateFormZod(patientInquiryFormSchema),
    publicChatCustomerMW(),
    asyncHandler(asPatient(async (params: TransactionRequiredParams & PortalParams<PatientInquiryFormType>): Promise<PatientInquiryResponse> => {
        const {origin, languageCode, session, logger} = params;
        const user = await requirePortalAccount(params.customer, origin, languageCode);
        const inquiry = await loadOwnInquiry(user._id, params.inquiry, languageCode, session);
        await shareInquiryContact(inquiry, {userId: user._id}, {session, logger, languageCode, auditUserId: user._id});
        const [mapped] = await toPatientInquiries([inquiry]);
        return {data: mapped};
    })),
);

/** The patient no longer wants this clinic's answer; the clinic loses access to the files. */
router.post(
    "/withdraw",
    authMW("public"),
    rateLimiter({windowMs: 60000, max: 20}),
    transactionHandler(),
    validateFormZod(patientInquiryFormSchema),
    publicChatCustomerMW(),
    asyncHandler(asPatient(async (params: TransactionRequiredParams & PortalParams<PatientInquiryFormType>): Promise<PatientInquiryResponse> => {
        const {origin, languageCode, session, logger} = params;
        const user = await requirePortalAccount(params.customer, origin, languageCode);
        const inquiry = await loadOwnInquiry(user._id, params.inquiry, languageCode, session);
        await withdrawInquiry(inquiry, {userId: user._id}, {session, logger, languageCode, auditUserId: user._id});
        const [mapped] = await toPatientInquiries([inquiry]);
        return {data: mapped};
    })),
);

/** A trip as the patient sees it; its plan must be populated with `phases`. */
function toPatientTrip(trip: IPatientTrip, clinicNames: Map<string, string>): PatientTripView {
    const clinicId = String(nestedEntityToRef(trip.company));
    const phases = (trip.plan as unknown as ITreatmentPlan | undefined)?.phases ?? [];
    return {
        _id: trip._id.toString(),
        clinic: {_id: clinicId, name: clinicNames.get(clinicId) ?? ""},
        phase: trip.phase,
        phaseTitle: trip.phase ? phases[trip.phase - 1]?.title : undefined,
        status: trip.status,
        arrivalAt: dateToISOString(trip.arrivalAt),
        departureAt: dateToISOString(trip.departureAt),
        arrivalFlight: trip.arrivalFlight,
        departureFlight: trip.departureFlight,
        accommodation: trip.accommodation,
        transfer: !!trip.transfer,
    };
}

async function clinicNamesOf(trips: IPatientTrip[]): Promise<Map<string, string>> {
    const cards = await portalCompanyCards(idsOf(trips.map((trip) => trip.company)), new Map());
    return new Map(cards.map((card) => [card._id, card.name]));
}

/** The stays the chosen clinic planned for one request: dates, flights, hotel and pickup. */
router.post(
    "/trips",
    authMW("public"),
    rateLimiter({windowMs: 60000, max: 60}),
    validateFormZod(patientCaseFormSchema),
    publicChatCustomerMW(),
    asyncHandler(asPatient(async (params: PortalParams<PatientCaseFormType>): Promise<PatientTripsResponse> => {
        const user = await requirePortalAccount(params.customer, params.origin, params.languageCode);
        const inquiries = await ClinicInquiry.find({account: user._id, requestGroup: params.requestGroup, deletedAt: null}).select("_id");
        const trips = await tripsOfInquiries(inquiries.map((inquiry) => inquiry._id), {});
        const names = await clinicNamesOf(trips);
        return {data: trips.map((trip) => toPatientTrip(trip, names))};
    })),
);

/** The patient adds their flights and where they stay to a coming trip. */
router.post(
    "/tripDetails",
    authMW("public"),
    rateLimiter({windowMs: 60000, max: 20, failClosed: true}),
    transactionHandler(),
    validateFormZod(patientTripDetailsFormSchema),
    publicChatCustomerMW(),
    asyncHandler(asPatient(async (params: TransactionRequiredParams & PortalParams<PatientTripDetailsFormType>): Promise<PatientTripResponse> => {
        const {origin, languageCode, session, logger} = params;
        const user = await requirePortalAccount(params.customer, origin, languageCode);
        const trip = ObjectId.isValid(params.trip) ? await PatientTrip.findOne({_id: new ObjectId(params.trip), deletedAt: null}).session(session) : null;
        const plan = trip?.plan ? await TreatmentPlan.findById(nestedEntityToRef(trip.plan)).select("inquiry").session(session) : null;
        const own = plan && await ClinicInquiry.exists({_id: nestedEntityToRef(plan.inquiry), account: user._id, deletedAt: null}).session(session);
        if (!trip || !own) throw apiValidationException("patient_trip_not_found", "", null, languageCode);
        await updateTripDetails(
            trip,
            {arrivalFlight: params.arrivalFlight, departureFlight: params.departureFlight, accommodation: params.accommodation},
            {session, logger, languageCode, auditUserId: user._id},
        );
        await trip.populate({path: "plan", select: "phases inquiry"});
        return {data: toPatientTrip(trip, await clinicNamesOf([trip]))};
    })),
);

/** The patient's signed medical history for one request, for every clinic of it. */
router.post(
    "/medicalHistory",
    authMW("public"),
    rateLimiter({windowMs: 60000, max: 10, failClosed: true}),
    transactionHandler(),
    validateFormZod(patientMedicalHistoryFormSchema),
    publicChatCustomerMW(),
    asyncHandler(asPatient(async (params: TransactionRequiredParams & PortalParams<PatientMedicalHistoryFormType>): Promise<PatientCaseResponse> => {
        const {origin, languageCode, session, logger} = params;
        const user = await requirePortalAccount(params.customer, origin, languageCode);
        const inquiries = await ClinicInquiry.find({account: user._id, requestGroup: params.requestGroup, deletedAt: null}).sort({createdAt: 1}).session(session);
        if (!inquiries.length) throw apiValidationException("inquiry_not_found", "", null, languageCode);
        await submitMedicalHistory(
            inquiries,
            {userId: user._id, answers: params.answers, medications: params.medications, signedName: params.signedName},
            {session, logger, languageCode, auditUserId: user._id},
        );
        return {data: await toPatientCase(inquiries)};
    })),
);

/**
 * A file of one of the patient's own requests: one they uploaded, or one a clinic attached
 * to a message to them. Sent with the portal login token.
 */
router.get(
    "/media/:mediaId",
    authMW("public"),
    rateLimiter({windowMs: 60000, max: 120}),
    publicChatCustomerMW(),
    asyncHandler(asPatient(async (params: PortalParams<object>, queryParams: {mediaId: string}, req: Request, res: Response) => {
        const {origin, languageCode} = params;
        const user = await requirePortalAccount(params.customer, origin, languageCode);
        if (!ObjectId.isValid(queryParams.mediaId)) throw apiValidationException("media_not_found", "", null, languageCode);
        const mediaId = new ObjectId(queryParams.mediaId);
        return serveMedia({
            mediaId: queryParams.mediaId,
            req,
            res,
            logger: getLogger("patient_portal_media"),
            languageCode,
            cacheControl: "private",
            deniedAsNotFound: true,
            accessCheck: async () => {
                const inquiries = await ClinicInquiry.find({account: user._id, deletedAt: null}).select("_id files");
                if (inquiries.some((inquiry) => idsOf(inquiry.files).some((id) => id.equals(mediaId)))) return true;
                return !!(await ClinicMessage.exists({inquiry: {$in: inquiries.map((inquiry) => inquiry._id)}, attachments: mediaId, deletedAt: null}));
            },
        });
    })),
);

/** One of the patient's quotes; drafts stay with the clinic. */
async function loadOwnPlan(accountId: ObjectId, planId: string, languageCode: string, session?: TransactionRequiredParams["session"]): Promise<ITreatmentPlan> {
    const plan = ObjectId.isValid(planId)
        ? await TreatmentPlan.findOne({_id: new ObjectId(planId), status: {$ne: "draft"}, deletedAt: null}).session(session ?? null)
        : null;
    const own = plan && await ClinicInquiry.exists({_id: nestedEntityToRef(plan.inquiry), account: accountId, deletedAt: null}).session(session ?? null);
    if (!plan || !own) throw apiValidationException("treatment_plan_not_found", "", null, languageCode);
    return plan;
}

/** Every quote the clinics sent for one request, to compare side by side. */
router.post(
    "/plans",
    authMW("public"),
    rateLimiter({windowMs: 60000, max: 60}),
    validateFormZod(patientCaseFormSchema),
    publicChatCustomerMW(),
    asyncHandler(asPatient(async (params: PortalParams<PatientCaseFormType>): Promise<PatientPlansResponse> => {
        const user = await requirePortalAccount(params.customer, params.origin, params.languageCode);
        const inquiries = await ClinicInquiry.find({account: user._id, requestGroup: params.requestGroup, deletedAt: null}).select("_id company");
        const plans = await TreatmentPlan.find({inquiry: {$in: inquiries.map((inquiry) => inquiry._id)}, status: {$ne: "draft"}, deletedAt: null})
            .populate({path: "currency", select: "name symbol abbreviation"})
            .sort({sentAt: 1});
        const clinics = await portalCompanyCards(idsOf(inquiries.map((inquiry) => inquiry.company)), new Map());
        const names = new Map(clinics.map((clinic) => [clinic._id, clinic.name]));
        return {
            data: plans.map((plan) => {
                const clinicId = String(nestedEntityToRef(plan.company));
                return treatmentPlanToPatient(plan, {_id: clinicId, name: names.get(clinicId) ?? ""});
            }),
            onlinePayment: onlinePaymentAvailable(),
        };
    })),
);

/** Starts the card payment of an accepted plan's deposit; the webhook records it once paid. */
router.post(
    "/payDeposit",
    authMW("public"),
    rateLimiter({windowMs: 60000, max: 10, failClosed: true}),
    transactionHandler(),
    validateFormZod(payPlanDepositFormSchema),
    publicChatCustomerMW(),
    asyncHandler(asPatient(async (params: TransactionRequiredParams & PortalParams<PayPlanDepositFormType>): Promise<PatientDepositPaymentResponse> => {
        const {origin, languageCode, session, logger} = params;
        const user = await requirePortalAccount(params.customer, origin, languageCode);
        const plan = await loadOwnPlan(user._id, params.plan, languageCode, session);
        const {clientSecret, amount} = await startDepositPayment(plan, {session, logger, languageCode, auditUserId: user._id});
        return {data: {clientSecret, publishableKey: PAYMENTS.STRIPE_PUBLISHABLE_KEY, amount}};
    })),
);

/**
 * Accepts one clinic's quote with the patient's typed name as signature. Their other clinics
 * are closed and this clinic opens their patient folder.
 */
router.post(
    "/acceptPlan",
    authMW("public"),
    rateLimiter({windowMs: 60000, max: 10, failClosed: true}),
    transactionHandler(),
    validateFormZod(acceptTreatmentPlanFormSchema),
    publicChatCustomerMW(),
    asyncHandler(asPatient(async (params: TransactionRequiredParams & PortalParams<AcceptTreatmentPlanFormType>, _query: unknown, req: Request): Promise<PatientPlanAcceptedResponse> => {
        const {origin, languageCode, session, logger} = params;
        const user = await requirePortalAccount(params.customer, origin, languageCode);
        if (!params.acceptTerms) throw apiValidationException("treatment_plan_terms_required", "", null, languageCode);
        const plan = await loadOwnPlan(user._id, params.plan, languageCode, session);
        await acceptPlan(
            plan,
            {accountId: user._id, signedName: params.signedName, ip: req.ip, userAgent: req.header("User-Agent")},
            {session, logger, languageCode, auditUserId: user._id},
        );
        await plan.populate({path: "currency", select: "name symbol abbreviation"});
        const [clinic] = await portalCompanyCards(idsOf([plan.company]), new Map());
        return {data: {plan: treatmentPlanToPatient(plan, {_id: clinic?._id ?? "", name: clinic?.name ?? ""})}};
    })),
);

/** One of the patient's quotes as a PDF. */
router.get(
    "/plan/:planId/pdf",
    authMW("public"),
    rateLimiter({windowMs: 60000, max: 30}),
    publicChatCustomerMW(),
    asyncHandler(asPatient(async (params: PortalParams<object>, queryParams: {planId: string}, _req: Request, res: Response) => {
        const user = await requirePortalAccount(params.customer, params.origin, params.languageCode);
        const plan = await loadOwnPlan(user._id, queryParams.planId, params.languageCode);
        await sendTreatmentPlanPdf(plan, res, params.languageCode);
    })),
);
