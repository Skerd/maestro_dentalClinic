import * as fs from "fs";
import * as path from "path";
import {CLIENT_SIDE, CONSTANTS, EMAIL} from "@coreModule/environment";
import {applyPlaceholders, loadEmailStrings} from "@coreModule/utilities/emails/emailLocale";
import {
    ctaButtonHtml,
    currentYear,
    escapeHtml,
    layoutStrings,
    localized,
    pushRow,
    summaryCardHtml,
    type SummaryRow,
} from "@coreModule/utilities/emails/emailLayout";
import {sendMail} from "@coreModule/utilities/emails/mailDeliveryService";

const LOCALES_ROOT = path.join(__dirname, "static", "locales");
const TEMPLATE_DIR = path.join(__dirname, "templates", "patient");

export type PatientMessageKind = "requested" | "confirmed" | "rescheduled" | "cancelled" | "reminder";

/** Copy suffix per kind: `subject{X}`, `heading{X}`, `preheader{X}`, `intro{X}`, `closing{X}`. */
const KIND_SUFFIX: Record<PatientMessageKind, string> = {
    requested: "Requested",
    confirmed: "Confirmed",
    rescheduled: "Rescheduled",
    cancelled: "Cancelled",
    reminder: "Reminder",
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
    /** The manage page on the clinic's own site; the token is appended. */
    manageUrl: string;
};

function stringsFor(languageCode: string) {
    return loadEmailStrings(["patient"], languageCode || CONSTANTS.DEFAULT_LANGUAGE || "en-US", LOCALES_ROOT);
}

function readTemplate(filename: string): string {
    return fs.readFileSync(path.join(TEMPLATE_DIR, filename), "utf8");
}

function manageUrl(data: Pick<PatientMessage, "manageUrl" | "manageToken">): string {
    return `${data.manageUrl}?token=${encodeURIComponent(data.manageToken)}`;
}

/**
 * Sends an appointment email to the patient over the company's SMTP, in the same
 * shell as the property-management client emails. Does nothing when email is off.
 */
export async function sendPatientMail(data: PatientMessage): Promise<void> {
    if (!EMAIL.ENABLED) return;
    const pageName = CLIENT_SIDE.NAME ?? "";
    const strings = stringsFor(data.languageCode);
    const loc = strings as Record<string, string>;
    const suffix = KIND_SUFFIX[data.kind];
    // Rescheduled mail ends like a confirmation: the appointment stands at the new time.
    const closingKey = data.kind === "rescheduled" ? "closingConfirmed" : `closing${suffix}`;

    const rows: SummaryRow[] = [];
    pushRow(rows, loc.labelNumber, data.number);
    pushRow(rows, loc.labelWhen, data.when);
    pushRow(rows, loc.labelWith, data.practitionerName);
    pushRow(rows, loc.labelWhere, data.location);
    pushRow(rows, loc.labelWhat, data.serviceName);

    const bodyInner = applyPlaceholders(readTemplate("body.html"), {
        intro: loc[`intro${suffix}`] ?? "",
        detailsSummary: summaryCardHtml(loc.summaryTitle ?? "", rows),
        cta: ctaButtonHtml(loc.manageLinkText ?? "", manageUrl(data), loc.fallbackLabel ?? ""),
        closing: loc[closingKey] ?? "",
    });

    let html = applyPlaceholders(readTemplate("patient.html"), layoutStrings(strings, `heading${suffix}`, `preheader${suffix}`));
    html = applyPlaceholders(html, {
        greeting: localized(strings, "greeting", {fullName: escapeHtml(data.fullName)}),
        bodyInner,
        companyName: escapeHtml(data.companyName),
        pageName,
        year: currentYear(),
    });
    const subject = applyPlaceholders(loc[`subject${suffix}`] ?? "", {number: data.number, companyName: data.companyName});

    await sendMail(data.companyId, {to: data.email, subject, html});
}

/** The reminder as a short text message: when, where, with whom, and the link. */
export function patientSmsText(data: PatientMessage): string {
    return localized(stringsFor(data.languageCode), "smsReminder", {
        companyName: data.companyName,
        when: data.when,
        practitionerName: data.practitionerName,
        manageUrl: manageUrl(data),
    });
}

export type InquiryMessageKind = "requestSent" | "infoRequested" | "clinicMessage" | "declined" | "quoteReceived" | "planAccepted";

/** Copy suffix per kind: `subject{X}`, `heading{X}`, `preheader{X}`, `intro{X}`, `closing{X}`. */
const INQUIRY_KIND_SUFFIX: Record<InquiryMessageKind, string> = {
    requestSent: "RequestSent",
    infoRequested: "InfoRequested",
    clinicMessage: "ClinicMessage",
    declined: "Declined",
    quoteReceived: "QuoteReceived",
    planAccepted: "PlanAccepted",
};

export type InquiryMessage = {
    kind: InquiryMessageKind;
    /** Whose SMTP sends it: the clinic, or the platform for a request to several clinics. */
    senderCompanyId: string;
    /** The clinic named in the subject, or the platform for a request to several. */
    companyName: string;
    languageCode: string;
    email: string;
    fullName: string;
    /** The clinic's reference; absent on the confirmation of a request to several clinics. */
    number?: string;
    clinics?: string[];
    /** Info request kinds, as `infoKind.<kind>` keys resolve them. */
    requested?: string[];
    note?: string;
    /** The patient's case on the portal. */
    caseUrl: string;
};

/**
 * Sends an estimate-request email to a portal patient. Health details stay out of it: the
 * patient reads the clinic's message and files on the portal, behind their login.
 */
export async function sendInquiryMail(data: InquiryMessage): Promise<void> {
    if (!EMAIL.ENABLED) return;
    const pageName = CLIENT_SIDE.NAME ?? "";
    const strings = stringsFor(data.languageCode);
    const loc = strings as Record<string, string>;
    const suffix = INQUIRY_KIND_SUFFIX[data.kind];

    const rows: SummaryRow[] = [];
    pushRow(rows, loc.labelReference, data.number);
    pushRow(rows, loc.labelClinics, data.clinics?.join(", "));
    pushRow(rows, loc.labelRequested, data.requested?.map((kind) => loc[`infoKind.${kind}`] ?? kind).join(", "));
    pushRow(rows, loc.labelNote, data.note);

    const bodyInner = applyPlaceholders(readTemplate("body.html"), {
        intro: localized(strings, `intro${suffix}`, {companyName: escapeHtml(data.companyName)}),
        detailsSummary: rows.length ? summaryCardHtml(loc.summaryTitleInquiry ?? "", rows) : "",
        cta: ctaButtonHtml(loc.caseLinkText ?? "", data.caseUrl, loc.fallbackLabel ?? ""),
        closing: loc[`closing${suffix}`] ?? "",
    });

    let html = applyPlaceholders(
        readTemplate("patient.html"),
        layoutStrings({...strings, footerNote: loc.footerNoteInquiry ?? ""}, `heading${suffix}`, `preheader${suffix}`),
    );
    html = applyPlaceholders(html, {
        greeting: localized(strings, "greeting", {fullName: escapeHtml(data.fullName)}),
        bodyInner,
        companyName: escapeHtml(data.companyName),
        pageName,
        year: currentYear(),
    });
    const subject = applyPlaceholders(loc[`subject${suffix}`] ?? "", {number: data.number ?? "", companyName: data.companyName});

    await sendMail(data.senderCompanyId, {to: data.email, subject, html});
}
