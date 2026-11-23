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

/* D178: a patient reviews a completed appointment once from the emailed link; staff publish it; the clinic's site and
 * the portal's treatment cards show only published reviews. */

const companyId = new ObjectId();
const otherCompanyId = new ObjectId();
const asCompany = <T>(fn: () => PromiseLike<T>): Promise<T> => withTenant(companyId, fn);
const app = appFor([appointmentRoute, clinicReviewRoute, storefrontRoute].map((route) => ({...route, module: "dentalClinic"})));

let admin: TestCaller;
let serviceId: string;
let locationId: string;
let practitionerId: string;
let order = 0;

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

async function storedReview(company: ObjectId, rating: number, isPublished: boolean) {
    await ClinicReview.collection.insertOne({
        company, appointment: new ObjectId(), authorName: `Patient ${order}`, rating, isPublished, createdAt: new Date(Date.now() + order++), deletedAt: null,
    });
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
        // The first name and the last name's initial only; it waits for staff.
        expect(review).toMatchObject({rating: 4, comment: "Kind and on time", authorName: "Ada L.", isPublished: false});

        const again = await storefront("/manage/review", {token, rating: 1});
        expect(again.body.error_code).toBe("clinicReview_already_exists");
        expect((await storefront("/manage", {token})).body.canReview).toBe(false);
        expect(await ClinicReview.countDocuments({})).toBe(1);
    }));

    it("refuses a link that is not the appointment's current one", () => asCompany(async () => {
        const {id, token} = await booked();
        await completed(id);
        await Appointment.collection.updateOne({_id: new ObjectId(id)}, {$inc: {manageTokenVersion: 1}});
        expect((await storefront("/manage/review", {token, rating: 5})).body.error_code).toBe("token_verification_failed");
        expect(await ClinicReview.countDocuments({})).toBe(0);
    }));

    it("publishes only for a role with the action permission", () => asCompany(async () => {
        const {id, token} = await booked();
        await completed(id);
        await storefront("/manage/review", {token, rating: 5});
        const review = (await ClinicReview.findOne({}))!;

        const viewer: TestCaller = {...admin, isAdmin: false, permissions: admin.permissions!.filter((tag) => !tag.includes("[action:"))};
        const refused = await request(app).post("/api/dentalClinic/clinicReview/publish").set(callerHeader(viewer)).send({_id: review._id.toString()});
        expect(refused.body.error_code).toBe("user_permissions_not_sufficient");
        expect((await ClinicReview.findById(review._id))!.isPublished).toBe(false);

        const published = await request(app).post("/api/dentalClinic/clinicReview/publish").set(callerHeader(admin)).send({_id: review._id.toString()});
        expect(published.status).toBe(200);
        expect((await ClinicReview.findById(review._id))!.isPublished).toBe(true);
        await request(app).post("/api/dentalClinic/clinicReview/unpublish").set(callerHeader(admin)).send({_id: review._id.toString()});
        expect((await ClinicReview.findById(review._id))!.isPublished).toBe(false);
    }));

    it("lets staff record a review only for a completed visit, and keeps it with its appointment", () => asCompany(async () => {
        const {id} = await booked();
        const other = await booked("10:00");
        const create = () => request(app).put("/api/dentalClinic/clinicReview").set(callerHeader(admin)).send({appointment: id, rating: 5, authorName: "Ada L."});
        expect((await create()).body.error_code).toBe("clinic_review_not_open");

        await completed(id);
        const created = await create();
        expect(created.status).toBe(200);
        const review = (await ClinicReview.findOne({}))!;
        const edited = await request(app).patch("/api/dentalClinic/clinicReview").set(callerHeader(admin))
            .send({_id: review._id.toString(), appointment: other.id, rating: 3, authorName: "Ada L."});
        expect(edited.status).toBe(200);
        expect(await ClinicReview.findById(review._id)).toMatchObject({rating: 3, appointment: new ObjectId(id)});
    }));

    it("shows the site only the published reviews, and the portal card their average per clinic", async () => {
        await asCompany(async () => {
            await storedReview(companyId, 5, true);
            await storedReview(companyId, 4, true);
            await storedReview(companyId, 1, false);
        });
        await withTenant(otherCompanyId, () => storedReview(otherCompanyId, 1, true));

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

    it("names the author by first name and last initial", () => {
        expect(reviewAuthorName({firstName: " Gent ", lastName: "mema"})).toBe("Gent M.");
        expect(reviewAuthorName({firstName: "Ada", lastName: " "})).toBe("Ada");
    });
});
