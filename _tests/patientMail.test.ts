import {beforeEach, describe, expect, it, vi} from "vitest";
import * as fs from "fs";

const {sent} = vi.hoisted(() => ({sent: [] as {to: string; subject: string; html: string}[]}));
vi.mock("@coreModule/utilities/emails/mailDeliveryService", () => ({
    sendMail: vi.fn(async (_companyId: string, mail: {to: string; subject: string; html: string}) => {
        sent.push(mail);
    }),
}));
vi.mock("@coreModule/environment", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@coreModule/environment")>();
    return {...actual, EMAIL: {...actual.EMAIL, ENABLED: true}, CLIENT_SIDE: {...actual.CLIENT_SIDE, NAME: "Arpeggio"}};
});

import {
    patientSmsText,
    sendInquiryMail,
    sendPatientMail,
    type InquiryMessageKind,
    type PatientMessage,
    type PatientMessageKind,
} from "@dentalClinicModule/utilities/emails/sendPatientMail";

const message = (kind: PatientMessageKind, languageCode = "en-US", serviceName?: string, accountUrl?: string): PatientMessage => ({
    kind,
    companyId: "6ad653ec4b21ee6f13d1083a",
    companyName: "Smile Clinic",
    languageCode,
    email: "ada@example.com",
    fullName: "Ada Lovelace",
    number: "AP-20261020-ABCD1234",
    when: "Wednesday, 28 October 2026 at 09:00",
    practitionerName: "Dr. Ana",
    location: "Zurich Centre, Bahnhofstrasse 1",
    serviceName,
    manageToken: "token",
    manageUrl: "https://smile.arpeggio.al/dentists/manage",
    accountUrl,
});

beforeEach(() => {
    sent.length = 0;
});

describe("patient email", () => {
    it("uses the client email shell, without the treatment unless the clinic opts in", async () => {
        await sendPatientMail(message("confirmed"));
        const {subject, html} = sent[0];
        expect(subject).toBe("Appointment AP-20261020-ABCD1234 confirmed — Smile Clinic");
        expect(html).toContain("Your appointment is booked");
        expect(html).toContain("Dr. Ana");
        expect(html).toContain("https://smile.arpeggio.al/dentists/manage?token=token");
        expect(html).not.toContain("Treatment");
        expect(html).not.toMatch(/\{[a-zA-Z]+\}/);
        if (process.env.EMAIL_PREVIEW_DIR) fs.writeFileSync(`${process.env.EMAIL_PREVIEW_DIR}/patient-confirmed.html`, html);

        await sendPatientMail(message("confirmed", "en-US", "Check-up"));
        expect(sent[1].html).toContain("Check-up");
    });

    it("links a signed-in patient's appointment to their account on the portal (D178), and a guest's not", async () => {
        await sendPatientMail(message("confirmed", "en-US", undefined, "https://arpeggio.al/account"));
        expect(sent[0].html).toContain("All your bookings in one place:");
        expect(sent[0].html).toContain('href="https://arpeggio.al/account"');

        await sendPatientMail(message("confirmed"));
        expect(sent[1].html).not.toContain("All your bookings in one place");
    });

    it("renders every kind in every language without leftovers", async () => {
        for (const languageCode of ["en-US", "de-CH", "fr-FR", "it-IT", "sq-AL"]) {
            for (const kind of ["requested", "confirmed", "rescheduled", "cancelled", "reminder"] as const) {
                await sendPatientMail(message(kind, languageCode, undefined, "https://arpeggio.al/account"));
            }
            expect(patientSmsText(message("reminder", languageCode))).toContain("/manage?token=token");
        }
        expect(sent).toHaveLength(25);
        for (const {html} of sent) {
            expect(html).not.toMatch(/\{[a-zA-Z]+\}/);
            expect(html).toContain('href="https://arpeggio.al/account"');
        }
    });
});

describe("estimate request email", () => {
    it("names what the clinic asked for and links to the patient's case", async () => {
        await sendInquiryMail({
            kind: "infoRequested",
            senderCompanyId: "6ad653ec4b21ee6f13d1083a",
            companyName: "Smile Clinic",
            languageCode: "it-IT",
            email: "giulia@example.com",
            fullName: "Giulia Bianchi",
            number: "INQ-20261029-ABC123",
            requested: ["opg", "photos"],
            caseUrl: "https://arpeggio.al/account?case=abc",
        });
        const {subject, html} = sent[0];
        expect(subject).toBe("Smile Clinic ha bisogno di altre informazioni (INQ-20261029-ABC123)");
        expect(html).toContain("Panoramica (OPG), Foto dei denti");
        expect(html).toContain("https://arpeggio.al/account?case=abc");
    });

    it("renders every kind in every language without leftovers", async () => {
        const kinds: InquiryMessageKind[] = ["requestSent", "infoRequested", "clinicMessage", "declined", "quoteReceived", "planAccepted"];
        for (const languageCode of ["en-US", "de-CH", "fr-FR", "it-IT", "sq-AL"]) {
            for (const kind of kinds) {
                await sendInquiryMail({
                    kind,
                    senderCompanyId: "6ad653ec4b21ee6f13d1083a",
                    companyName: "Smile Clinic",
                    languageCode,
                    email: "giulia@example.com",
                    fullName: "Giulia Bianchi",
                    number: kind === "requestSent" ? undefined : "INQ-20261029-ABC123",
                    clinics: kind === "requestSent" ? ["Smile Clinic", "Tirana Dental"] : undefined,
                    requested: kind === "infoRequested" ? ["cbct"] : undefined,
                    caseUrl: "https://arpeggio.al/account?case=abc",
                });
            }
        }
        expect(sent).toHaveLength(30);
        for (const {subject, html} of sent) {
            expect(subject).not.toMatch(/\{[a-zA-Z]+\}/);
            expect(html).not.toMatch(/\{[a-zA-Z]+\}/);
            expect(html).not.toContain("infoKind.");
        }
    });
});
