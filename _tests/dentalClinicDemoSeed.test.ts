import {afterAll, beforeAll, describe, expect, it, vi} from "vitest";
import {connectTestDatabase, disconnectTestDatabase} from "@coreModule/_tests/testDatabase";
import {ObjectId} from "mongodb";
import mongoose from "mongoose";

vi.mock("@dentalClinicModule/utilities/emails/sendPatientMail", () => ({
    sendPatientMail: vi.fn(async () => undefined),
    patientSmsText: () => "",
}));

import Currency from "@coreModule/database/schemas/currency/currency";
import type {ICompany} from "@coreModule/database/schemas/company/company";
import {withTenant} from "@coreModule/utilities/endpoints/tenantScope";
import Appointment from "@dentalClinicModule/database/schemas/appointment/appointment";
import ClinicReview from "@dentalClinicModule/database/schemas/clinicReview/clinicReview";
import {clinicReviewService} from "@dentalClinicModule/database/schemas/clinicReview/clinicReview.service";
import {seedDentalClinicDemoData} from "@dentalClinicModule/database/demo/dentalClinicCompanyDemo";

/* DB-08: a fresh reset shows the patients' reviews (D178) working: completed visits, one published review, one waiting. */

const company = {_id: new ObjectId(), name: "Demo Dental", createdBy: new ObjectId()} as unknown as ICompany;
const asCompany = <T>(fn: () => PromiseLike<T>): Promise<T> => withTenant(company._id, fn);

beforeAll(async () => {
    await connectTestDatabase();
    await Promise.all(Object.values(mongoose.models).map((model) => model.init()));
    // Offline: photos become placeholders and the clips are skipped.
    vi.stubGlobal("fetch", vi.fn(async () => {
        throw new Error("offline");
    }));
    await asCompany(() => Currency.create({name: "Euro", symbol: "€", abbreviation: "EUR", decimalPlaces: 2, company: company._id}));
}, 120000);

afterAll(async () => {
    vi.unstubAllGlobals();
    await disconnectTestDatabase();
});

describe("dental clinic demo seed", () => {
    it("seeds completed visits with two reviews, both shown at once (D191), and changes nothing on a second run", () => asCompany(async () => {
        await seedDentalClinicDemoData(undefined, company);

        expect(await Appointment.countDocuments({status: "completed"})).toBe(3);
        const reviews = await ClinicReview.find({}).sort({rating: -1}).lean();
        expect(reviews.map(({authorName, rating}) => ({authorName, rating}))).toEqual([
            {authorName: "Besa L.", rating: 5},
            {authorName: "Sara C.", rating: 4},
        ]);
        expect(await clinicReviewService.publishedForCompany(company._id, 10)).toMatchObject({average: 4.5, count: 2});
        // Gent's completed cleaning is left without one, for the manage link.
        const gent = await Appointment.findOne({idempotencyKey: "demo-appt-past-gent"});
        expect(gent!.status).toBe("completed");
        expect(await ClinicReview.countDocuments({appointment: gent!._id})).toBe(0);

        await seedDentalClinicDemoData(undefined, company);
        expect(await ClinicReview.countDocuments({})).toBe(2);
        expect(await Appointment.countDocuments({status: "completed"})).toBe(3);
    }), 300000);
});
