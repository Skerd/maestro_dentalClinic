/**
 * P23.12: a dental clinic that signs itself up on the portal is listed there once the platform approves it, so its sign-up
 * turns on both the listing and online booking: the portal and the company's own site show only a business that takes
 * bookings, and nothing turned booking on before, so a self-serve business never appeared anywhere.
 */
import {afterAll, beforeAll, beforeEach, describe, expect, it} from "vitest";
import mongoose from "mongoose";
import {ObjectId} from "mongodb";
import {connectTestDatabase, disconnectTestDatabase} from "@coreModule/_tests/testDatabase";
import {getLogger} from "@coreModule/loggers/serverLog";
import {runInTransaction} from "@coreModule/utilities/middlewares/runInTransaction";
import {asCrossTenant, withTenant} from "@coreModule/utilities/endpoints/tenantScope";
import Company from "@coreModule/database/schemas/company/company";
import ClinicConfig from "@dentalClinicModule/database/schemas/clinicConfig/clinicConfig";
import {moduleBootstrap} from "@dentalClinicModule/database/moduleBootstrap";

const logger = getLogger("clinicSelfServe_test");
const companyId = new ObjectId();

beforeAll(async () => {
    await connectTestDatabase();
}, 120000);

afterAll(async () => {
    await disconnectTestDatabase();
});

beforeEach(() => asCrossTenant("test fixtures span companies", async () => {
    for (const collection of await mongoose.connection.db!.collections()) await collection.deleteMany({});
    // The platform's currency list (D160): the config takes its first row.
    await mongoose.connection.db!.collection("currencies").insertOne({company: new ObjectId(), code: "EUR", name: "Euro", symbol: "€", decimalPlaces: 2, createdAt: new Date(), deletedAt: null});
    await Company.collection.insertOne({_id: companyId, company: companyId, name: "Self Serve", isActive: true, modules: ["core", "dentalClinic"], deletedAt: null});
}));

describe("a self-serve dental clinic (P23.12)", {timeout: 60000}, () => {
    it("is listed on the portal and takes bookings online from its sign-up", async () => {
        const onCreated = moduleBootstrap.selfServeBusinessTypes.find((type) => type.key === "dentalClinic")?.onCreated;
        if (!onCreated) throw new Error("dentalClinic declares no onCreated");
        const company = await asCrossTenant("the test reads the seeded company", () => Company.findById(companyId).exec());
        if (!company) throw new Error("test company was not seeded");

        await runInTransaction(logger, (session) => withTenant(companyId, () => onCreated({company, session, logger, languageCode: "en-US"})));

        const config = await asCrossTenant("the test reads the company's config", () => ClinicConfig.findOne({company: companyId}).lean().exec());
        expect([config?.listedOnPortal, config?.publicBookingEnabled]).toEqual([true, true]);
    });
});
