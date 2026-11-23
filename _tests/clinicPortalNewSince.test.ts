import {afterAll, beforeAll, beforeEach, describe, expect, it, vi} from "vitest";

vi.hoisted(() => {
    process.env.ENABLED_MODULES = "core,finance,dentalClinic";
});

import {connectTestDatabase, disconnectTestDatabase} from "@coreModule/_tests/testDatabase";
import mongoose from "mongoose";
import {ObjectId} from "mongodb";
import {withTenant} from "@coreModule/utilities/endpoints/tenantScope";
import {clearPortalProviders, getPortalProvider} from "@coreModule/domain/portal/portalProviderRegistry";
import type {PortalNewSinceContext} from "@coreModule/domain/portal/portalProvider.types";
import {registerClinicPortalProvider} from "@dentalClinicModule/domain/portal/clinicPortalProvider";

/* D178, P23.7: the dentists' section answers "which treatments were offered after a date". */

const clinic = new ObjectId();
const since = new Date("2026-11-01T00:00:00Z");
const treatments = {whitening: new ObjectId(), implant: new ObjectId(), cleaning: new ObjectId(), internal: new ObjectId()};

function newSince(fields: Partial<PortalNewSinceContext> = {}) {
    const provider = getPortalProvider("dentalClinic");
    if (!provider?.newSince) throw new Error("the dentists' section must answer newSince");
    const ask = provider.newSince;
    return withTenant(clinic, () => ask({kind: "treatment", scope: {companyId: clinic}, companyIds: [clinic], filters: {}, since, limit: 10, languageCode: "en-US", ...fields}));
}

beforeAll(async () => {
    await connectTestDatabase();
    registerClinicPortalProvider();
}, 120000);

afterAll(async () => {
    clearPortalProviders();
    await disconnectTestDatabase();
});

beforeEach(async () => {
    const db = mongoose.connection.db!;
    for (const collection of await db.collections()) await collection.deleteMany({});
    await db.collection("companies").insertOne({_id: clinic, name: "Smile Tirana", siteSlug: "smile", isActive: true, modules: ["core", "finance", "dentalClinic"], deletedAt: null});
    const treatment = (_id: ObjectId, name: string, createdAt: Date, extra: Record<string, unknown> = {}) => ({
        _id, company: clinic, name, slug: name.toLowerCase(), price: 100, priceType: "fixed", isActive: true, isPublic: true, deletedAt: null, createdAt, ...extra,
    });
    await db.collection("clinicservices").insertMany([
        treatment(treatments.whitening, "Whitening", new Date("2026-11-03T00:00:00Z"), {price: 150}),
        treatment(treatments.implant, "Implant", new Date("2026-11-02T00:00:00Z"), {price: 900}),
        treatment(treatments.cleaning, "Cleaning", new Date("2026-10-01T00:00:00Z")),
        treatment(treatments.internal, "Internal check", new Date("2026-11-04T00:00:00Z"), {isPublic: false}),
    ]);
});

describe("treatments new since a date (P23.7)", () => {
    it("lists the public treatments offered after the date, newest first, within the saved price range", async () => {
        const all = await newSince();
        expect(all.total).toBe(2);
        expect(all.items.map((item) => item.title)).toEqual(["Whitening", "Implant"]);
        expect(all.items[0]).toEqual(expect.objectContaining({kind: "treatment", id: treatments.whitening.toString(), section: "dentalClinic", path: "/treatments/whitening"}));

        expect((await newSince({priceMax: 500})).items.map((item) => item.title)).toEqual(["Whitening"]);
        expect((await newSince({query: "impl"})).items.map((item) => item.title)).toEqual(["Implant"]);
    });

    it("shows the treatments a person keeps as listed now, old ones included, but not internal ones", async () => {
        const kept = await newSince({since: new Date(0), ids: [treatments.cleaning.toString(), treatments.internal.toString()]});
        expect(kept.items.map((item) => item.title)).toEqual(["Cleaning"]);
    });
});
