import {beforeEach, describe, expect, it, vi} from "vitest";
import {ObjectId} from "mongodb";

// D178: an appointment booked signed in links to the patient's account on the portal; a guest's booking is in no account.
const {sent, companyId} = vi.hoisted(() => {
    process.env.SINFONIA_CLIENT_URLS = "core=http://panel.example.test:5211,portal=http://portal.example.test:5212";
    return {sent: [] as {accountUrl?: string; manageUrl: string}[], companyId: {value: ""}};
});
vi.mock("@dentalClinicModule/utilities/emails/sendPatientMail", () => ({
    sendPatientMail: vi.fn(async (mail: {accountUrl?: string; manageUrl: string}) => {
        sent.push(mail);
    }),
    patientSmsText: () => "",
}));
vi.mock("@coreModule/database/schemas/company/company.service", async () => {
    const {ObjectId: Id} = await import("mongodb");
    return {companyService: {findById: vi.fn(async () => ({_id: new Id(companyId.value), name: "Smile Clinic", siteSlug: "smile"}))}};
});
vi.mock("@dentalClinicModule/database/schemas/clinicConfig/clinicConfig.service", () => ({
    clinicConfigService: {findForCompany: vi.fn(async () => null)},
}));
vi.mock("@coreModule/utilities/security/recordAccessToken", () => ({generateRecordAccessToken: () => "token"}));

import Appointment from "@dentalClinicModule/database/schemas/appointment/appointment";
import {notifyPatient} from "@dentalClinicModule/utilities/services/appointmentNotify";

const company = new ObjectId();
companyId.value = company.toString();

function appointment(customer?: ObjectId) {
    return new Appointment({
        company,
        number: "AP-20261201-ABCD1234",
        startAt: new Date("2026-12-01T09:00:00Z"),
        endAt: new Date("2026-12-01T10:00:00Z"),
        patient: {firstName: "Ada", lastName: "Lovelace", email: "ada@example.com", phone: "+355690000000"},
        snapshot: {practitionerName: "Dr. Ana", locationName: "Tirana Centre", serviceName: "Check-up", timezone: "Europe/Tirane"},
        ...(customer ? {customer} : {}),
    });
}

beforeEach(() => {
    sent.length = 0;
});

describe("notifyPatient", () => {
    it("links a signed-in patient's appointment to their account on the portal apex", async () => {
        await notifyPatient("confirmed", appointment(new ObjectId()), {languageCode: "en-US"});
        expect(sent).toHaveLength(1);
        expect(sent[0].accountUrl).toBe("http://portal.example.test:5212/account");
        expect(sent[0].manageUrl).toBe("http://smile.portal.example.test:5212/dentists/manage");
    });

    it("leaves the account link out of a guest's appointment", async () => {
        await notifyPatient("confirmed", appointment(), {languageCode: "en-US"});
        expect(sent).toHaveLength(1);
        expect(sent[0].accountUrl).toBeUndefined();
    });
});
