import * as fs from "fs";
import * as path from "path";
import {CLIENT_SIDE, CONSTANTS, EMAIL, clientHostFor} from "@coreModule/environment";
import {applyPlaceholders, loadEmailStrings} from "@coreModule/utilities/emails/emailLocale";
import {sendMail} from "@coreModule/utilities/emails/mailDeliveryService";

const imagePath = path.join(__dirname, "./static/images/image-1.png");
const imageCID = "imageCID@example.com";
const LOCALES_ROOT = path.join(__dirname, "static", "locales");
const TEMPLATE_DIR = path.join(__dirname, "templates", "patient");

export type PatientMessageKind = "requested" | "confirmed" | "rescheduled" | "cancelled" | "reminder";

const KIND_KEYS: Record<PatientMessageKind, {subject: string; heading: string; intro: string; closing: string}> = {
    requested: {subject: "subjectRequested", heading: "headingRequested", intro: "introRequested", closing: "closingRequested"},
    confirmed: {subject: "subjectConfirmed", heading: "headingConfirmed", intro: "introConfirmed", closing: "closingConfirmed"},
    rescheduled: {subject: "subjectRescheduled", heading: "headingRescheduled", intro: "introRescheduled", closing: "closingConfirmed"},
    cancelled: {subject: "subjectCancelled", heading: "headingCancelled", intro: "introCancelled", closing: "closingCancelled"},
    reminder: {subject: "subjectReminder", heading: "headingReminder", intro: "introReminder", closing: "closingReminder"},
};

export type PatientMessage = {
    kind: PatientMessageKind;
    companyId: string;
    companyName: string;
    languageCode: string;
    email: string;
    fullName: string;
    number: string;
    /** Already formatted in the location's timezone. */
    when: string;
    practitionerName: string;
    location: string;
    /** Only when the clinic lets messages name the treatment. */
    serviceName?: string;
    manageToken: string;
};

/** Escapes a patient- or staff-entered value before it goes into the HTML. */
function escapeHtml(value: string): string {
    return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function stringsFor(languageCode: string): Record<string, string> {
    return loadEmailStrings(["patient"], languageCode || CONSTANTS.DEFAULT_LANGUAGE || "en-US", LOCALES_ROOT) as Record<string, string>;
}

function manageUrl(token: string): string {
    return `${clientHostFor("clinic")}/manage?token=${encodeURIComponent(token)}`;
}

/** Sends an appointment email to the patient over the company's SMTP. Does nothing when email is off. */
export async function sendPatientMail(data: PatientMessage): Promise<void> {
    if (!EMAIL.ENABLED) return;
    const pageName = CLIENT_SIDE.NAME ?? "";
    const strings = stringsFor(data.languageCode);
    const keys = KIND_KEYS[data.kind];
    const safe = (value: string) => escapeHtml(value);
    const serviceRow = data.serviceName
        ? `<tr><td style="padding: 4px 16px 4px 0; color: #777777;">${strings.labelWhat}</td><td style="padding: 4px 0;">${safe(data.serviceName)}</td></tr>`
        : "";

    const bodyInner = applyPlaceholders(fs.readFileSync(path.join(TEMPLATE_DIR, "body.html"), "utf8"), {
        greeting: applyPlaceholders(strings.greeting, {fullName: safe(data.fullName)}),
        intro: strings[keys.intro],
        closing: strings[keys.closing],
        labelNumber: strings.labelNumber,
        labelWhen: strings.labelWhen,
        labelWith: strings.labelWith,
        labelWhere: strings.labelWhere,
        number: safe(data.number),
        when: safe(data.when),
        practitionerName: safe(data.practitionerName),
        location: safe(data.location),
        serviceRow,
        manageUrl: manageUrl(data.manageToken),
        manageLinkText: strings.manageLinkText,
    });
    const html = applyPlaceholders(fs.readFileSync(path.join(TEMPLATE_DIR, "patient.html"), "utf8"), {
        heading: strings[keys.heading],
        imageAlt: strings.imageAlt,
        copyright: applyPlaceholders(strings.copyright, {pageName}),
        username: safe(data.fullName),
        bodyInner,
        pageName,
    });
    const subject = applyPlaceholders(strings[keys.subject], {number: data.number, companyName: data.companyName});

    await sendMail(data.companyId, {
        to: data.email,
        subject,
        html,
        attachments: [{filename: "companyTick.png", path: imagePath, cid: imageCID}],
    });
}

/** The reminder as a short text message: when, where, with whom, and the link. */
export function patientSmsText(data: PatientMessage): string {
    const strings = stringsFor(data.languageCode);
    return applyPlaceholders(strings.smsReminder, {
        companyName: data.companyName,
        when: data.when,
        practitionerName: data.practitionerName,
        manageUrl: manageUrl(data.manageToken),
    });
}
