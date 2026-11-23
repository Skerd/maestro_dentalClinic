import {afterAll, beforeAll, beforeEach, describe, expect, it, vi} from "vitest";
import {connectTestDatabase, disconnectTestDatabase} from "@coreModule/_tests/testDatabase";
import mongoose from "mongoose";
import {ObjectId} from "mongodb";
import request from "supertest";

// Only the dental clinic claims here; core finds its `onAccountVerified` through the real bootstrap loader.
vi.mock("@coreModule/utilities/modules/enabledModules", async (importOriginal) => ({
    ...await importOriginal<typeof import("@coreModule/utilities/modules/enabledModules")>(),
    getEnabledModuleNames: () => ["core", "dentalClinic"],
}));
vi.mock("@coreModule/utilities/middlewares/authMW", async () =>
    (await import("@coreModule/_tests/httpHarness")).authMWStub);
vi.mock("@coreModule/utilities/middlewares/rateLimiter", () => ({
    rateLimiter: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));
// A portal account is the `x-auth-token` "account:<id>".
vi.mock("@coreModule/domain/publicChat/publicChatCustomer", async (importOriginal) => ({
    ...await importOriginal<typeof import("@coreModule/domain/publicChat/publicChatCustomer")>(),
    tryResolvePublicChatCustomer: async ({token}: {token: string}) => {
        const [kind, id] = token.split(":");
        const {ObjectId: Id} = await import("mongodb");
        return kind === "account" ? {user: {_id: new Id(id)}, companyId: new Id()} : null;
    },
    requirePortalAccount: async (customer: {user: unknown}) => customer.user,
}));

import {getLogger} from "@coreModule/loggers/serverLog";
import {runInTransaction} from "@coreModule/utilities/middlewares/runInTransaction";
import {asCrossTenant} from "@coreModule/utilities/endpoints/tenantScope";
import {claimGuestRecords} from "@coreModule/database/schemas/user/user.helper";
import Company from "@coreModule/database/schemas/company/company";
import Role from "@coreModule/database/schemas/role/role";
import User from "@coreModule/database/schemas/user/user";
import Appointment from "@dentalClinicModule/database/schemas/appointment/appointment";
import Patient from "@dentalClinicModule/database/schemas/patient/patient";
import * as clinicStorefront from "@dentalClinicModule/api/dentalClinic/public/clinicStorefront";
import {appFor, callerHeader} from "@coreModule/_tests/httpHarness";

/*
 * P23.9: the appointments a guest booked with an email become the account's once it holds that email, verified, and at
 * each clinic the folder those bookings opened is tied to the account when it carries the account's name.
 */

const logger = getLogger("dental_guest_claim_test");
const clinics = {tirana: new ObjectId(), vlora: new ObjectId(), durres: new ObjectId()};
const patientRoles = {tirana: new ObjectId(), vlora: new ObjectId()};
const account = new ObjectId();
const someoneElse = new ObjectId();
const EMAIL = "giulia@example.com";
const folders = {
    tirana: new ObjectId(), // her own guest folder
    child: new ObjectId(), // her son, booked under her email
    vlora: new ObjectId(), // her guest folder, the name typed in other case
    durresGuest: new ObjectId(), // a guest folder where she already has one of her own
    durresOwn: new ObjectId(),
};
const visits = {
    tirana: new ObjectId(), child: new ObjectId(), vlora: new ObjectId(), durres: new ObjectId(),
    otherEmail: new ObjectId(), taken: new ObjectId(), anonymised: new ObjectId(),
};
const raw = <T>(fn: () => Promise<T>) => asCrossTenant("test reads raw collections", fn);

const folder = (_id: ObjectId, company: ObjectId, firstName: string, lastName: string, extra: Record<string, unknown> = {}) => ({
    _id, company, number: `PT-${_id.toString().slice(-6)}`, firstName, lastName, email: EMAIL,
    preferredLanguage: "en-US", source: "booking", tags: [], deletedAt: null, ...extra,
});
let nextStart = Date.parse("2027-02-01T09:00:00Z");
/** As the public booking flow stores a guest's appointment: the patient's contact lower-cased, no account; a day apart. */
const visit = (_id: ObjectId, company: ObjectId, patientRecord: ObjectId, firstName: string, email = EMAIL, extra: Record<string, unknown> = {}) => {
    nextStart += 24 * 3600 * 1000;
    return {
        _id, company, number: `AP-${_id.toString().slice(-6)}`, status: "confirmed", source: "online", patientRecord,
        service: new ObjectId(), location: new ObjectId(), practitioner: new ObjectId(),
        startAt: new Date(nextStart), endAt: new Date(nextStart + 30 * 60 * 1000),
        snapshot: {serviceName: "Check-up", durationMinutes: 30, priceType: "fixed", practitionerName: "Dr. Shehu", locationName: "Studio", timezone: "Europe/Tirane"},
        policy: {cancellationDeadlineHours: 24, rescheduleDeadlineHours: 24},
        patient: {firstName, lastName: "Bianchi", email, phone: "+355 69 000 0000"},
        idempotencyKey: _id.toString(), deletedAt: null, ...extra,
    };
};

const verifiedAccount = {_id: account, username: "Giulia@Example.com", isEmailVerified: true};
const claim = (user: typeof verifiedAccount) =>
    runInTransaction(logger, (session) => claimGuestRecords(user, {session, logger, languageCode: "en-US"}));
const byId = (rows: Record<string, unknown>[], key: string) =>
    Object.fromEntries(rows.map((row) => [String(row._id), row[key] ? String(row[key]) : null]));
const appointmentCustomers = async () => byId(await raw(() => Appointment.collection.find({}).toArray()), "customer");
const folderAccounts = async () => byId(await raw(() => Patient.collection.find({}).toArray()), "account");
const memberships = async () => {
    const user = await raw(() => User.collection.findOne({_id: account}));
    return (user?.roles as {company: ObjectId; roles: ObjectId[]}[]).map((role) => [String(role.company), role.roles.map(String)]);
};
const everything = () => raw(async () => ({
    appointments: await Appointment.collection.find({}).sort({_id: 1}).toArray(),
    patients: await Patient.collection.find({}).sort({_id: 1}).toArray(),
    user: await User.collection.findOne({_id: account}),
}));

beforeAll(async () => {
    await connectTestDatabase();
    await Promise.all(Object.values(mongoose.models).map((model) => model.init()));
}, 120000);

afterAll(async () => {
    await disconnectTestDatabase();
});

beforeEach(async () => {
    await raw(async () => {
        for (const model of [Company, Role, User, Appointment, Patient]) await model.collection.deleteMany({});
        // Raw inserts: saving a new Company seeds its roles, bot and jobs, which these tests do not need.
        await Company.collection.insertMany(Object.entries(clinics).map(([name, _id]) =>
            ({_id, company: _id, name, isActive: true, modules: ["core", "dentalClinic"], deletedAt: null})));
        await Role.collection.insertMany([
            {_id: patientRoles.tirana, name: "Web Client", slug: "web_client_tirana", company: clinics.tirana, isSignupDefault: true, isAdmin: false, permissions: []},
            {_id: patientRoles.vlora, name: "Web Client", slug: "web_client_vlora", company: clinics.vlora, isSignupDefault: true, isAdmin: false, permissions: []},
        ]);
        await User.collection.insertOne({_id: account, username: "Giulia@Example.com", name: "Giulia", surname: "Bianchi", isEmailVerified: true, companies: [], roles: []});
        await Patient.collection.insertMany([
            folder(folders.tirana, clinics.tirana, "Giulia", "Bianchi"),
            folder(folders.child, clinics.tirana, "Luca", "Bianchi"),
            folder(folders.vlora, clinics.vlora, "GIULIA", "bianchi"),
            folder(folders.durresGuest, clinics.durres, "Giulia", "Bianchi"),
            folder(folders.durresOwn, clinics.durres, "Giulia", "Bianchi", {account}),
        ]);
        await Appointment.collection.insertMany([
            visit(visits.tirana, clinics.tirana, folders.tirana, "Giulia"),
            visit(visits.child, clinics.tirana, folders.child, "Luca"),
            visit(visits.vlora, clinics.vlora, folders.vlora, "GIULIA"),
            visit(visits.durres, clinics.durres, folders.durresGuest, "Giulia"),
            visit(visits.otherEmail, clinics.tirana, folders.tirana, "Giulia", "giulia@example.org"),
            visit(visits.taken, clinics.vlora, folders.vlora, "Giulia", EMAIL, {customer: someoneElse}),
            visit(visits.anonymised, clinics.tirana, folders.tirana, "Giulia", EMAIL, {anonymizedAt: new Date()}),
        ]);
    });
});

describe("claiming guest appointments (P23.9)", {timeout: 30000}, () => {
    it("gives the account its guest appointments at every clinic, and nothing booked under another email or account", async () => {
        await claim(verifiedAccount);

        expect(await appointmentCustomers()).toEqual({
            [String(visits.tirana)]: String(account),
            [String(visits.child)]: String(account),
            [String(visits.vlora)]: String(account),
            [String(visits.durres)]: String(account),
            [String(visits.otherEmail)]: null,
            [String(visits.taken)]: String(someoneElse),
            [String(visits.anonymised)]: null,
        });
    });

    it("ties the folder with the account's name to it, one per clinic, and makes the account a patient there", async () => {
        await claim(verifiedAccount);

        expect(await folderAccounts()).toEqual({
            [String(folders.tirana)]: String(account),
            // Her son's folder stays his own; the name the folder carries decides, in any case.
            [String(folders.child)]: null,
            [String(folders.vlora)]: String(account),
            // She already has a folder at this clinic, so the guest one is not tied to her too.
            [String(folders.durresGuest)]: null,
            [String(folders.durresOwn)]: String(account),
        });
        expect(await memberships()).toEqual([
            [String(clinics.tirana), [String(patientRoles.tirana)]],
            [String(clinics.vlora), [String(patientRoles.vlora)]],
        ]);
    });

    it("claims nothing for an account whose email is not verified", async () => {
        const before = await everything();

        await claim({...verifiedAccount, isEmailVerified: false});

        expect(await everything()).toEqual(before);
    });

    it("lists the claimed appointments in the portal account, at every clinic", async () => {
        await claim(verifiedAccount);
        const app = appFor([{...clinicStorefront, module: "dentalClinic"}]);

        const mine = await request(app).post("/api/dentalClinic/clinicStorefront/mine")
            .set(callerHeader({userId: account.toString(), companyId: new ObjectId().toString(), isAdmin: false, modules: ["core"]}))
            .set("x-auth-token", `account:${account.toString()}`)
            .send({});

        expect([mine.status, mine.body.error_code]).toEqual([200, undefined]);
        const listed = (mine.body.data as {appointment: {_id: string}}[]).map((row) => row.appointment._id);
        // Latest first, as the account page shows them.
        expect(listed).toEqual([visits.durres, visits.vlora, visits.child, visits.tirana].map(String));
    });

    it("changes nothing when it runs again", async () => {
        await claim(verifiedAccount);
        const once = await everything();

        await claim(verifiedAccount);

        expect(await everything()).toEqual(once);
    });
});
