import {afterAll, beforeAll, beforeEach, describe, expect, it, vi} from "vitest";
import {connectTestDatabase, disconnectTestDatabase} from "@coreModule/_tests/testDatabase";

import {ObjectId} from "mongodb";
import request from "supertest";

vi.mock("@coreModule/utilities/middlewares/authMW", async () =>
    (await import("@coreModule/_tests/httpHarness")).authMWStub);
// No Redis in tests; the public routes' limiter fails closed without it.
vi.mock("@coreModule/utilities/middlewares/rateLimiter", () => ({
    rateLimiter: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));
const {originCompany} = vi.hoisted(() => ({originCompany: {current: null as {_id: {toString(): string}; name?: string} | null}}));
vi.mock("@coreModule/utilities/marketing/resolveCompanyByOrigin", async () => {
    // Records the tenant like the real resolver (D16).
    const {setRequestTenant} = await import("@coreModule/utilities/endpoints/tenantScope");
    return {
        resolveCompanyByOrigin: async () => {
            if (originCompany.current) setRequestTenant(originCompany.current._id.toString());
            return originCompany.current;
        },
    };
});
vi.mock("@dentalClinicModule/utilities/emails/sendPatientMail", () => ({
    sendPatientMail: vi.fn(async () => undefined),
    patientSmsText: () => "",
}));

import {allPermissionTags, appFor, callerHeader, type TestCaller} from "@coreModule/_tests/httpHarness";
import {getLogger} from "@coreModule/loggers/serverLog";
import type {ReportableDefinition} from "@coreModule/domain/reports/reportables";
import {asCrossTenant, withTenant} from "@coreModule/utilities/endpoints/tenantScope";
import Company from "@coreModule/database/schemas/company/company";
import Currency from "@coreModule/database/schemas/currency/currency";
import * as appointmentRoute from "@dentalClinicModule/api/dentalClinic/private/appointment";
import * as clinicReviewRoute from "@dentalClinicModule/api/dentalClinic/private/clinicReview";
import * as storefrontRoute from "@dentalClinicModule/api/dentalClinic/public/clinicStorefront";
import ClinicConfig from "@dentalClinicModule/database/schemas/clinicConfig/clinicConfig";
import ClinicLocation from "@dentalClinicModule/database/schemas/clinicLocation/clinicLocation";
import ClinicService from "@dentalClinicModule/database/schemas/clinicService/clinicService";
import Practitioner from "@dentalClinicModule/database/schemas/practitioner/practitioner";
import Appointment from "@dentalClinicModule/database/schemas/appointment/appointment";
import Patient from "@dentalClinicModule/database/schemas/patient/patient";
import ClinicReview from "@dentalClinicModule/database/schemas/clinicReview/clinicReview";
import {clinicReviewService, reviewAuthorName} from "@dentalClinicModule/database/schemas/clinicReview/clinicReview.service";
import {dentalClinicReportables} from "@dentalClinicModule/domain/reports/dentalClinicReportables";
import {loadBookingTargets} from "@dentalClinicModule/utilities/services/appointmentBooking";
import {setReportableHidden} from "@coreModule/domain/reports/reportDesk";

/* D178: a patient reviews a completed appointment once from the emailed link and it shows at once (D191); staff never
 * change, publish or delete it; only the platform hides one, after a report, which takes it off the clinic's site and out
 * of the portal's averages. */

const companyId = new ObjectId();
const otherCompanyId = new ObjectId();
const asCompany = <T>(fn: () => PromiseLike<T>): Promise<T> => withTenant(companyId, fn);
const app = appFor([appointmentRoute, clinicReviewRoute, storefrontRoute].map((route) => ({...route, module: "dentalClinic"})));

let admin: TestCaller;
let serviceId: string;
let locationId: string;
let practitionerId: string;
let order = 0;
const logger = getLogger("clinic_reviews_test");

function reportable(kind: string): ReportableDefinition {
    const found = dentalClinicReportables.find((definition) => definition.kind === kind);
    if (!found) throw new Error(`No reportable ${kind}`);
    return found;
}

/** What the platform's report desk does (D191): reads the record across companies, then core hides it in its company. */
async function platformHides(kind: string, recordId: ObjectId) {
    const snapshot = await asCrossTenant("the report desk reads a reported record", () =>
        reportable(kind).snapshot({recordId, logger, languageCode: "en-US"}));
    await setReportableHidden({...reportable(kind), module: "dentalClinic"}, companyId, {recordId, logger, languageCode: "en-US", hidden: true, decidedBy: new ObjectId()});
    return snapshot;
}

const WEEKDAYS = [1, 2, 3, 4, 5];
/** Wednesday 9 June 2027, Zurich summer time. */
const DATE = "2027-06-09";
const patient = {firstName: "Ada", lastName: "lovelace", email: "ada@example.com", phone: "+41 79 000 00 00"};

const storefront = (path: string, body: Record<string, unknown>) =>
    request(app).post(`/api/dentalClinic/clinicStorefront${path}`).set(callerHeader(admin)).send(body);

/** A booking through the site, as the patient makes it: its id and the emailed link's token. */
async function booked(time = "09:00"): Promise<{id: string; token: string}> {
    const response = await storefront("/book", {
        service: serviceId, location: locationId, practitioner: practitionerId, date: DATE, time, patient, acceptPrivacy: true,
        idempotencyKey: `key-${new ObjectId().toString()}`,
    });
    expect(response.status).toBe(200);
    return {id: response.body.data.appointment._id, token: response.body.data.manageToken};
}

const completed = (id: string) => Appointment.collection.updateOne({_id: new ObjectId(id)}, {$set: {status: "completed"}});

async function storedReview(company: ObjectId, rating: number, hiddenByPlatform = false) {
    const {insertedId} = await ClinicReview.collection.insertOne({
        company, appointment: new ObjectId(), authorName: `Patient ${order}`, rating, hiddenByPlatform, createdAt: new Date(Date.now() + order++), deletedAt: null,
    });
    return insertedId;
}

beforeAll(async () => {
    await connectTestDatabase();
    await Promise.all([Appointment.init(), Practitioner.init(), ClinicConfig.init(), Patient.init(), ClinicReview.init()]);
    admin = {userId: new ObjectId().toString(), companyId: companyId.toString(), isAdmin: true, permissions: allPermissionTags([Appointment, ClinicReview])};
    originCompany.current = {_id: companyId, name: "Smile Clinic"};
    await Company.collection.insertOne({_id: companyId, name: "Smile Clinic", vat: "VAT-1"});
}, 120000);

afterAll(async () => {
    await disconnectTestDatabase();
});

beforeEach(() => asCompany(async () => {
    await Promise.all([ClinicConfig, ClinicLocation, ClinicService, Practitioner, Appointment, Patient, ClinicReview, Currency]
        .map((model) => model.collection.deleteMany({})));
    const currency = await Currency.create({name: "Swiss franc", symbol: "CHF", abbreviation: "CHF", decimalPlaces: 2, company: companyId});
    await ClinicConfig.create({company: companyId, currency: currency._id, publicBookingEnabled: true, slotIntervalMinutes: 30, cancellationDeadlineHours: 24, maxAdvanceDays: 365});
    const location = await ClinicLocation.create({
        company: companyId, name: "Zurich Centre", timezone: "Europe/Zurich",
        openingHours: WEEKDAYS.map((dayOfWeek) => ({dayOfWeek, startTime: "08:00", endTime: "18:00"})),
    });
    const service = await ClinicService.create({company: companyId, name: "Check-up", slug: "check-up", durationMinutes: 30, priceType: "fixed", price: 120});
    const practitioner = await Practitioner.create({
        company: companyId, displayName: "Dr. Ana", role: "dentist", services: [service._id], locations: [location._id],
        schedule: WEEKDAYS.map((dayOfWeek) => ({location: location._id, dayOfWeek, startTime: "08:00", endTime: "12:00"})),
    });
    serviceId = service._id.toString();
    locationId = location._id.toString();
    practitionerId = practitioner._id.toString();
}));

describe("clinic reviews (D178)", {timeout: 60000}, () => {
    it("lets the patient review from the emailed link only once the visit is completed, and only once", () => asCompany(async () => {
        const {id, token} = await booked();

        expect((await storefront("/manage", {token})).body.canReview).toBe(false);
        const early = await storefront("/manage/review", {token, rating: 5, comment: "Great"});
        expect(early.body.error_code).toBe("clinic_review_not_open");

        await completed(id);
        expect((await storefront("/manage", {token})).body.canReview).toBe(true);
        const written = await storefront("/manage/review", {token, rating: 4, comment: "Kind and on time"});
        expect(written.status).toBe(200);

        const review = await ClinicReview.findOne({appointment: new ObjectId(id)});
        // The first name and the last name's initial only, shown at once.
        expect(review).toMatchObject({rating: 4, comment: "Kind and on time", authorName: "Ada L.", hiddenByPlatform: false});
        const site = await storefront("/reviews", {});
        expect(site.body.data.reviews).toEqual([expect.objectContaining({_id: review!._id.toString(), rating: 4, comment: "Kind and on time"})]);

        const again = await storefront("/manage/review", {token, rating: 1});
        expect(again.body.error_code).toBe("clinicReview_already_exists");
        expect((await storefront("/manage", {token})).body.canReview).toBe(false);
        expect(await ClinicReview.countDocuments({})).toBe(1);
    }));

    it("refuses a link that is not the appointment's current one", () => asCompany(async () => {
        const {id, token} = await booked();
        await completed(id);
        await Appointment.collection.updateOne({_id: new ObjectId(id)}, {$inc: {manageTokenVersion: 1}});
        expect((await storefront("/manage/review", {token, rating: 5})).body.error_code).toBe("link_no_longer_valid");
        expect(await ClinicReview.countDocuments({})).toBe(0);
    }));

    it("offers staff no grant to write, publish, hide or delete a review", () => {
        const tags = allPermissionTags([ClinicReview]);
        expect(tags.filter((tag) => /\[(create|write):(appointment|rating|comment|authorName|hiddenByPlatform|clinicreviews)\]/.test(tag))).toEqual([]);
        expect(tags.filter((tag) => /\[(delete|restore)\b|publish/.test(tag))).toEqual([]);
    });

    it("refuses a review staff try to write, and lets them change or delete nothing the patient wrote", () => asCompany(async () => {
        const {id, token} = await booked();
        const other = await booked("10:00");
        await completed(id);

        const byStaff = await request(app).put("/api/dentalClinic/clinicReview").set(callerHeader(admin))
            .send({appointment: id, rating: 5, comment: "Best clinic ever", authorName: "Happy patient"});
        expect([byStaff.status, byStaff.body.error_code]).toEqual([403, "clinic_review_written_by_patient_only"]);
        expect(await ClinicReview.countDocuments({})).toBe(0);

        await storefront("/manage/review", {token, rating: 2, comment: "Long wait."});
        const review = (await ClinicReview.findOne({}))!;
        const edited = await request(app).patch("/api/dentalClinic/clinicReview").set(callerHeader(admin))
            .send({_id: review._id.toString(), appointment: other.id, rating: 5, comment: "Perfect.", authorName: "Someone else", hiddenByPlatform: true});
        // Nothing of a review is staff's to write, so the edit is refused as a whole.
        expect([edited.status, edited.body.error_code]).toEqual([403, "user_permissions_not_sufficient"]);
        expect(await ClinicReview.findById(review._id)).toMatchObject({appointment: new ObjectId(id), rating: 2, comment: "Long wait.", authorName: "Ada L.", hiddenByPlatform: false});

        const deleted = await request(app).delete("/api/dentalClinic/clinicReview").set(callerHeader(admin)).send({_id: review._id.toString()});
        expect([deleted.status, deleted.body.error_code]).toEqual([403, "user_permissions_not_sufficient"]);
        expect((await ClinicReview.findById(review._id))!.deletedAt).toBeFalsy();
        expect((await request(app).post("/api/dentalClinic/clinicReview/publish").set(callerHeader(admin)).send({_id: review._id.toString()})).status).toBe(404);
    }));

    it("shows the site every review the platform has not hidden, and the portal card their average per clinic", async () => {
        const reported = await asCompany(async () => {
            await storedReview(companyId, 5);
            await storedReview(companyId, 4);
            return storedReview(companyId, 1);
        });
        await withTenant(otherCompanyId, () => storedReview(otherCompanyId, 1));
        const snapshot = await platformHides("dentalClinic.review", reported);
        expect(snapshot).toMatchObject({title: "★ Patient 2", companyId, hidden: false});

        const site = await asCompany(() => storefront("/reviews", {limit: 1}));
        expect(site.status).toBe(200);
        expect([site.body.data.average, site.body.data.count, site.body.data.reviews.length]).toEqual([4.5, 2, 1]);
        // Newest first.
        expect(site.body.data.reviews[0]).toMatchObject({rating: 4, authorName: "Patient 1"});

        const ratings = await asCrossTenant("test reads several clinics", () => clinicReviewService.publishedRatingsByCompany([companyId, otherCompanyId]));
        expect(ratings.get(companyId.toString())).toEqual({average: 4.5, count: 2});
        expect(ratings.get(otherCompanyId.toString())).toEqual({average: 1, count: 1});
        expect((await clinicReviewService.publishedRatingsByCompany([])).size).toBe(0);
    });

    it("takes a treatment the platform hid off the clinic's site and out of online booking", () => asCompany(async () => {
        const listed = async () => (await storefront("/config", {})).body.data?.services?.map((service: {name: string}) => service.name);
        expect(await listed()).toEqual(["Check-up"]);

        const snapshot = await platformHides("dentalClinic.treatment", new ObjectId(serviceId));
        expect(snapshot).toMatchObject({title: "Check-up", companyId, hidden: false});

        expect(await listed()).toEqual([]);
        await expect(loadBookingTargets(companyId, {service: serviceId, location: locationId}, {languageCode: "en-US", online: true}))
            .rejects.toMatchObject({error_code: "clinic_service_not_found"});
        // The clinic still books it from the panel.
        expect((await loadBookingTargets(companyId, {service: serviceId, location: locationId}, {languageCode: "en-US", online: false})).service.hiddenByPlatform).toBe(true);
    }));

    it("names the author by first name and last initial", () => {
        expect(reviewAuthorName({firstName: " Gent ", lastName: "mema"})).toBe("Gent M.");
        expect(reviewAuthorName({firstName: "Ada", lastName: " "})).toBe("Ada");
    });
});
