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

import {patientSmsText, sendPatientMail, type PatientMessage, type PatientMessageKind} from "@dentalClinicModule/utilities/emails/sendPatientMail";

const message = (kind: PatientMessageKind, languageCode = "en-US", serviceName?: string): PatientMessage => ({
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
        expect(html).toContain("/manage?token=token");
        expect(html).not.toContain("Treatment");
        expect(html).not.toMatch(/\{[a-zA-Z]+\}/);
        if (process.env.EMAIL_PREVIEW_DIR) fs.writeFileSync(`${process.env.EMAIL_PREVIEW_DIR}/patient-confirmed.html`, html);

        await sendPatientMail(message("confirmed", "en-US", "Check-up"));
        expect(sent[1].html).toContain("Check-up");
    });

    it("renders every kind in every language without leftovers", async () => {
        for (const languageCode of ["en-US", "de-CH", "fr-FR", "it-IT", "sq-AL"]) {
            for (const kind of ["requested", "confirmed", "rescheduled", "cancelled", "reminder"] as const) {
                await sendPatientMail(message(kind, languageCode));
            }
            expect(patientSmsText(message("reminder", languageCode))).toContain("/manage?token=token");
        }
        expect(sent).toHaveLength(25);
        for (const {html} of sent) expect(html).not.toMatch(/\{[a-zA-Z]+\}/);
    });
});
