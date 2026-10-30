import * as path from "path";
import {PDFDocument, PDFFont, PDFPage, StandardFonts, rgb} from "pdf-lib";
import {loadEmailStrings} from "@coreModule/utilities/emails/emailLocale";
import type {TreatmentPlan} from "armonia/src/modules/dentalClinic/api/dentalClinic/private/treatmentPlan/treatmentPlan.dto";

const LOCALES_ROOT = path.join(__dirname, "static", "locales");

const COLOR_PRIMARY = rgb(0.12, 0.28, 0.53);
const COLOR_TEXT = rgb(0.1, 0.1, 0.1);
const COLOR_MUTED = rgb(0.45, 0.45, 0.45);
const COLOR_BORDER = rgb(0.8, 0.82, 0.85);
const COLOR_ALT_ROW = rgb(0.95, 0.96, 0.98);

const PAGE = {width: 595, height: 842, margin: 40};
/** Table columns: treatment, teeth, material and brand, quantity, unit price, total, warranty. */
const COLUMNS = [
    {key: "name", x: 40, width: 150},
    {key: "teeth", x: 192, width: 70},
    {key: "detail", x: 264, width: 110},
    {key: "quantity", x: 376, width: 30},
    {key: "unitPrice", x: 408, width: 60},
    {key: "total", x: 470, width: 60},
    {key: "warranty", x: 532, width: 30},
] as const;

/** The standard fonts only encode WinAnsi; anything else would throw, so it is replaced. */
function safe(text: string | number | undefined): string {
    return String(text ?? "").replace(/[^\x20-\x7E\xA0-\xFF€—–‘’“”•]/g, "?");
}

function money(amount: number, currency?: string): string {
    const formatted = amount.toLocaleString("en-US", {minimumFractionDigits: 2, maximumFractionDigits: 2});
    return currency ? `${currency} ${formatted}` : formatted;
}

/** Splits text into lines that fit `width`. */
function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
    const lines: string[] = [];
    for (const paragraph of safe(text).split(/\r?\n/)) {
        let current = "";
        for (const word of paragraph.split(" ")) {
            const next = current ? `${current} ${word}` : word;
            if (font.widthOfTextAtSize(next, size) > width && current) {
                lines.push(current);
                current = word;
            } else {
                current = next;
            }
        }
        lines.push(current);
    }
    return lines;
}

class Writer {
    page: PDFPage;
    y: number;

    constructor(private doc: PDFDocument, private fonts: {regular: PDFFont; bold: PDFFont}) {
        this.page = doc.addPage([PAGE.width, PAGE.height]);
        this.y = PAGE.height - PAGE.margin;
    }

    ensure(height: number): void {
        if (this.y - height >= PAGE.margin) return;
        this.page = this.doc.addPage([PAGE.width, PAGE.height]);
        this.y = PAGE.height - PAGE.margin;
    }

    text(text: string, options: {x?: number; size?: number; bold?: boolean; color?: ReturnType<typeof rgb>} = {}): void {
        const size = options.size ?? 10;
        this.page.drawText(safe(text), {
            x: options.x ?? PAGE.margin,
            y: this.y,
            size,
            font: options.bold ? this.fonts.bold : this.fonts.regular,
            color: options.color ?? COLOR_TEXT,
        });
    }

    paragraph(text: string, size = 9, color = COLOR_MUTED): void {
        for (const line of wrap(text, this.fonts.regular, size, PAGE.width - PAGE.margin * 2)) {
            this.ensure(size + 4);
            this.text(line, {size, color});
            this.y -= size + 4;
        }
    }

    gap(height: number): void {
        this.y -= height;
    }
}

export type TreatmentPlanPdfInput = {
    plan: TreatmentPlan;
    clinicName: string;
    patientName?: string;
    languageCode: string;
};

/** The quote as a document the patient can keep, print or show their dentist at home. */
export async function generateTreatmentPlanPdf({plan, clinicName, patientName, languageCode}: TreatmentPlanPdfInput): Promise<Buffer> {
    const loc = loadEmailStrings(["treatmentPlan"], languageCode, LOCALES_ROOT) as Record<string, string>;
    const doc = await PDFDocument.create();
    const fonts = {regular: await doc.embedFont(StandardFonts.Helvetica), bold: await doc.embedFont(StandardFonts.HelveticaBold)};
    const w = new Writer(doc, fonts);
    const currency = plan.currency?.abbreviation;

    w.text(clinicName, {size: 18, bold: true, color: COLOR_PRIMARY});
    w.gap(20);
    w.text(`${loc.title ?? "Treatment plan and estimate"} ${plan.number}${plan.optionLabel ? ` — ${plan.optionLabel}` : ""}`, {size: 12, bold: true});
    w.gap(16);
    if (patientName) {
        w.text(`${loc.patient ?? "Patient"}: ${patientName}`);
        w.gap(14);
    }
    if (plan.validUntil) {
        w.text(`${loc.validUntil ?? "Valid until"}: ${plan.validUntil}`);
        w.gap(14);
    }
    w.gap(6);

    plan.phases.forEach((phase, index) => {
        const lines = plan.lines.filter((line) => line.phase === index + 1);
        w.ensure(60);
        w.text(`${index + 1}. ${phase.title}`, {size: 11, bold: true, color: COLOR_PRIMARY});
        w.gap(14);
        const gap = index > 0 && phase.minGapDaysAfterPrevious ? ` · ${loc.after ?? "after"} ${phase.minGapDaysAfterPrevious} ${loc.days ?? "days"}` : "";
        w.text(`${phase.visits} ${loc.visits ?? "visits"} · ${phase.estimatedDays} ${loc.daysStay ?? "days' stay"}${gap}`, {size: 9, color: COLOR_MUTED});
        w.gap(16);

        w.ensure(18);
        for (const column of COLUMNS) w.text(loc[`column.${column.key}`] ?? column.key, {x: column.x, size: 8, bold: true, color: COLOR_MUTED});
        w.gap(6);
        w.page.drawLine({start: {x: PAGE.margin, y: w.y}, end: {x: PAGE.width - PAGE.margin, y: w.y}, thickness: 0.5, color: COLOR_BORDER});
        w.gap(12);

        lines.forEach((line, row) => {
            const nameLines = wrap(line.name, fonts.regular, 8.5, COLUMNS[0].width);
            const detail = [line.material, line.brand].filter(Boolean).join(", ");
            const detailLines = wrap(detail, fonts.regular, 8.5, COLUMNS[2].width);
            const height = Math.max(nameLines.length, detailLines.length) * 11;
            w.ensure(height + 4);
            if (row % 2 === 1) w.page.drawRectangle({x: PAGE.margin, y: w.y - height + 8, width: PAGE.width - PAGE.margin * 2, height: height + 2, color: COLOR_ALT_ROW});
            const top = w.y;
            nameLines.forEach((text, i) => w.page.drawText(text, {x: COLUMNS[0].x, y: top - i * 11, size: 8.5, font: fonts.regular, color: COLOR_TEXT}));
            detailLines.forEach((text, i) => w.page.drawText(text, {x: COLUMNS[2].x, y: top - i * 11, size: 8.5, font: fonts.regular, color: COLOR_TEXT}));
            w.text(line.teeth.join(" "), {x: COLUMNS[1].x, size: 8.5});
            w.text(String(line.quantity), {x: COLUMNS[3].x, size: 8.5});
            w.text(money(line.unitPrice), {x: COLUMNS[4].x, size: 8.5});
            w.text(money(line.total), {x: COLUMNS[5].x, size: 8.5});
            w.text(line.warrantyYears ? `${line.warrantyYears} ${loc.yearsShort ?? "y"}` : "—", {x: COLUMNS[6].x, size: 8.5});
            w.gap(height);
        });
        w.gap(10);
    });

    w.ensure(70);
    w.page.drawLine({start: {x: PAGE.margin, y: w.y + 4}, end: {x: PAGE.width - PAGE.margin, y: w.y + 4}, thickness: 0.8, color: COLOR_BORDER});
    w.gap(10);
    if (plan.totals.discount) {
        w.text(`${loc.subtotal ?? "Subtotal"}: ${money(plan.totals.subtotal, currency)}`);
        w.gap(13);
        w.text(`${loc.discount ?? "Discount"}: −${money(plan.totals.discount, currency)}`);
        w.gap(13);
    }
    w.text(`${loc.total ?? "Total"}: ${money(plan.totals.total, currency)}`, {size: 12, bold: true});
    w.gap(16);
    if (plan.totals.deposit) {
        const refund = plan.refundableUntilDays != null ? ` · ${(loc.refundable ?? "refundable up to {days} days before the first visit").replace("{days}", String(plan.refundableUntilDays))}` : "";
        w.text(`${loc.deposit ?? "Deposit"}: ${money(plan.totals.deposit, currency)}${refund}`);
        w.gap(16);
    }

    if (plan.notes) {
        w.gap(6);
        w.ensure(20);
        w.text(loc.notes ?? "Notes", {bold: true});
        w.gap(13);
        w.paragraph(plan.notes);
    }
    if (plan.terms) {
        w.gap(6);
        w.ensure(20);
        w.text(loc.terms ?? "Terms", {bold: true});
        w.gap(13);
        w.paragraph(plan.terms);
    }
    w.gap(10);
    w.paragraph(loc.disclaimer ?? "", 8);

    return Buffer.from(await doc.save());
}
