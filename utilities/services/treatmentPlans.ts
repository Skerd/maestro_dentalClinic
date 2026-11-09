import * as crypto from "crypto";
import {Readable} from "stream";
import {ObjectId} from "mongodb";
import {apiValidationException} from "armonia/src/modules/core/helpers/exceptions";
import {DEFAULT_DECIMAL_PLACES, multiplyMoney, percentOfMoney, roundToCurrency, subtractMoney, sumMoney} from "armonia/src/modules/core/helpers/money";
import {nestedEntityToRef} from "@coreModule/utilities/mappers/common.mapper";
import {runAfterCommit} from "@coreModule/utilities/middlewares/transactionUtils";
import {getGridFSStorage} from "@coreModule/utilities/gridfs/gridfsStorage";
import {readMediaStream} from "@coreModule/utilities/media/serveMedia";
import {sealMediaFileStream} from "@coreModule/utilities/security/healthDataCrypto";
import {localDateOf} from "@coreModule/utilities/time/timeWindows";
import {FDI_TEETH, type DepositType} from "armonia/src/modules/dentalClinic/constants";
import type {TreatmentPlanTimelineEvent} from "armonia/src/modules/dentalClinic/api/dentalClinic/private/treatmentPlan/treatmentPlan.dto";
import {type IClinicInquiry} from "@dentalClinicModule/database/schemas/clinicInquiry/clinicInquiry";
import {type ITreatmentPlan, type ITreatmentPlanLine} from "@dentalClinicModule/database/schemas/treatmentPlan/treatmentPlan";
import {treatmentPlanService} from "@dentalClinicModule/database/schemas/treatmentPlan/treatmentPlan.service";
import {clinicConfigService} from "@dentalClinicModule/database/schemas/clinicConfig/clinicConfig.service";
import {NotificationEventCodes} from "@dentalClinicModule/domain/notifications/notificationEventCodes";
import type {ClinicCtx} from "./appointmentBooking";
import {idsOf, inquiryCompanyId, unshareFiles} from "./inquiryIntake";
import {isOpenInquiry, markResponded} from "./inquiryLifecycle";
import {notifyInquiryPatient, notifyInquiryStaff} from "./inquiryNotify";
import {findOrCreatePatient, keepMedicalHistory} from "./patientRecords";

import {clinicInquiryService} from "@dentalClinicModule/database/schemas/clinicInquiry/clinicInquiry.service";
import {mediaService} from "@coreModule/database/schemas/media/media.service";
const DAY = 24 * 3600 * 1000;
const UTC = "UTC";

type Actor = {userId?: string | ObjectId; now?: Date};

const byOf = (userId?: string | ObjectId) => (userId && ObjectId.isValid(String(userId)) ? new ObjectId(String(userId)) : undefined);

export function planNumber(now: Date = new Date()): string {
    const datePart = now.toISOString().slice(0, 10).replace(/-/g, "");
    return `TP-${datePart}-${crypto.randomBytes(3).toString("hex")}`.toUpperCase();
}

function record(plan: ITreatmentPlan, event: TreatmentPlanTimelineEvent, actor: Actor, note?: string): Date {
    const at = actor.now ?? new Date();
    plan.timeline.push({event, at, by: byOf(actor.userId), ...(note ? {note} : {})});
    return at;
}

/** A plain copy of the stored totals (spreading the subdocument would copy Mongoose's internal state). */
function totalsOf(plan: ITreatmentPlan): ITreatmentPlan["totals"] {
    const {subtotal, discount, total, deposit} = plan.totals;
    return {subtotal, discount, total, deposit};
}

/** `decimals` is the plan currency's `decimalPlaces` (GLB-08). */
export function lineTotal(line: Pick<ITreatmentPlanLine, "quantity" | "unitPrice" | "discount">, decimals = DEFAULT_DECIMAL_PLACES): number {
    return Math.max(0, subtractMoney(multiplyMoney(line.unitPrice, line.quantity, decimals), line.discount ?? 0, decimals));
}

/**
 * Subtotal before line discounts, the discounts, the total, and the deposit it asks for, at the plan
 * currency's `decimals`: a percent deposit in a currency without decimals is a whole amount (TD-B38).
 */
export function planTotals(lines: ITreatmentPlanLine[], depositType: DepositType, depositValue = 0, decimals = DEFAULT_DECIMAL_PLACES): ITreatmentPlan["totals"] {
    const subtotal = sumMoney(lines.map((line) => multiplyMoney(line.unitPrice, line.quantity, decimals)), decimals);
    const total = sumMoney(lines.map((line) => lineTotal(line, decimals)), decimals);
    const deposit = depositType === "fixed"
        ? Math.min(roundToCurrency(depositValue, decimals), total)
        : depositType === "percent" ? percentOfMoney(total, Math.min(depositValue, 100), decimals) : 0;
    return {subtotal, discount: subtractMoney(subtotal, total, decimals), total, deposit};
}

/** What the Zod contract cannot check: tooth numbers, phases the lines point at, a sane deposit. */
export function assertPlanContent(
    data: {phases?: unknown[]; lines?: {phase: number; teeth?: string[]}[]; depositType?: DepositType; depositValue?: number},
    languageCode: string,
): void {
    const phases = data.phases?.length ?? 0;
    for (const line of data.lines ?? []) {
        if (line.phase > phases) throw apiValidationException("treatment_plan_line_phase_invalid", "", null, languageCode, [String(line.phase)]);
        const unknown = (line.teeth ?? []).find((tooth) => !FDI_TEETH.includes(tooth));
        if (unknown) throw apiValidationException("treatment_plan_tooth_invalid", "", null, languageCode, [unknown]);
    }
    if (data.depositType === "percent" && (data.depositValue ?? 0) > 100) {
        throw apiValidationException("treatment_plan_deposit_invalid", "", null, languageCode);
    }
    if (data.depositType !== undefined && data.depositType !== "none" && !data.depositValue) {
        throw apiValidationException("treatment_plan_deposit_invalid", "", null, languageCode);
    }
}

/**
 * Fingerprint of what the patient accepts: every priced line, the phases, the totals and
 * the terms. Stored with the signature, so a later dispute can show the quote was not changed.
 */
export function planContentHash(plan: ITreatmentPlan): string {
    const content = {
        number: plan.number,
        version: plan.version,
        currency: String(nestedEntityToRef(plan.currency)),
        phases: plan.phases.map(({title, visits, estimatedDays, minGapDaysAfterPrevious}) => ({title, visits, estimatedDays, minGapDaysAfterPrevious})),
        lines: plan.lines.map(({phase, kind, name, teeth, material, brand, quantity, unitPrice, discount, warrantyYears}) => ({
            phase, kind, name, teeth: [...teeth], material, brand, quantity, unitPrice, discount, warrantyYears,
        })),
        totals: totalsOf(plan),
        deposit: {type: plan.depositType, value: plan.depositValue, refundableUntilDays: plan.refundableUntilDays},
        validUntil: plan.validUntil,
        notes: plan.notes,
        terms: plan.terms,
    };
    return crypto.createHash("sha256").update(JSON.stringify(content)).digest("hex");
}

/** The request a plan answers, if it is this clinic's. */
export async function loadPlanInquiry(companyId: ObjectId, inquiryId: string, ctx: ClinicCtx): Promise<IClinicInquiry> {
    const inquiry = ObjectId.isValid(inquiryId)
        ? await clinicInquiryService.findOne({_id: new ObjectId(inquiryId), company: companyId, deletedAt: null}, {session: ctx.session})
        : null;
    if (!inquiry) throw apiValidationException("inquiry_not_found", "", null, ctx.languageCode);
    return inquiry;
}

/**
 * Sends a draft to the patient. It answers their request (the request moves to "quoted"),
 * and a revision replaces the quote it was made from.
 */
export async function sendPlan(plan: ITreatmentPlan, actor: Actor, ctx: ClinicCtx): Promise<void> {
    if (plan.status !== "draft") throw apiValidationException("treatment_plan_invalid_status", "", null, ctx.languageCode);
    const now = actor.now ?? new Date();
    const companyId = nestedEntityToRef(plan.company);
    let inquiry: IClinicInquiry | null = null;
    const inquiryId = nestedEntityToRef(plan.inquiry);
    if (inquiryId) {
        inquiry = await clinicInquiryService.findOne({_id: inquiryId, company: companyId, deletedAt: null}, {session: ctx.session});
        if (!inquiry || (!isOpenInquiry(inquiry) && inquiry.status !== "converted")) {
            throw apiValidationException("inquiry_invalid_status", "", null, ctx.languageCode);
        }
    }

    if (!plan.validUntil) {
        const config = await clinicConfigService.findForCompany(companyId, {languageCode: ctx.languageCode, session: ctx.session});
        plan.validUntil = localDateOf(new Date(now.getTime() + (config?.quoteValidityDays ?? 30) * DAY), UTC);
    }
    plan.status = "sent";
    plan.sentAt = now;
    record(plan, "sent", {...actor, now});
    await plan.save({session: ctx.session});

    const replaced = nestedEntityToRef(plan.supersedes);
    if (replaced) {
        await treatmentPlanService.updateOne({_id: replaced, company: companyId, status: "sent"}, {$set: {status: "superseded"}, $push: {timeline: {event: "superseded", at: now, by: byOf(actor.userId)}}}, {session: ctx.session});
    }

    if (inquiry) {
        if (isOpenInquiry(inquiry)) inquiry.status = "quoted";
        markResponded(inquiry, now);
        inquiry.unreadForPatient += 1;
        inquiry.timeline.push({event: "quoted", at: now, by: byOf(actor.userId), note: plan.number});
        await inquiry.save({session: ctx.session});
        await notifyInquiryPatient("quoteReceived", inquiry, {}, ctx);
    }
}

/** A new draft copied from a sent quote; sending it replaces the original. */
export async function revisePlan(plan: ITreatmentPlan, actor: Actor, ctx: ClinicCtx): Promise<ITreatmentPlan> {
    if (plan.status !== "sent") throw apiValidationException("treatment_plan_invalid_status", "", null, ctx.languageCode);
    const now = actor.now ?? new Date();
    return treatmentPlanService.create(
        {
            company: nestedEntityToRef(plan.company),
            number: planNumber(now),
            status: "draft",
            ...(plan.inquiry ? {inquiry: nestedEntityToRef(plan.inquiry)} : {}),
            ...(plan.patient ? {patient: nestedEntityToRef(plan.patient)} : {}),
            ...(plan.optionLabel ? {optionLabel: plan.optionLabel} : {}),
            version: plan.version + 1,
            supersedes: plan._id,
            currency: nestedEntityToRef(plan.currency),
            phases: plan.phases.map(({title, visits, estimatedDays, minGapDaysAfterPrevious}) => ({title, visits, estimatedDays, minGapDaysAfterPrevious})),
            lines: plan.lines.map(({phase, kind, service, name, teeth, material, brand, quantity, unitPrice, discount, warrantyYears}) => ({
                phase, kind, service: nestedEntityToRef(service), name, teeth: [...teeth], material, brand, quantity, unitPrice, discount, warrantyYears,
            })),
            depositType: plan.depositType,
            depositValue: plan.depositValue,
            refundableUntilDays: plan.refundableUntilDays,
            totals: totalsOf(plan),
            notes: plan.notes,
            terms: plan.terms,
            timeline: [{event: "revised", at: now, by: byOf(actor.userId), note: plan.number}],
        },
        {session: ctx.session, logger: ctx.logger, languageCode: ctx.languageCode, auditUserId: ctx.auditUserId},
    );
}

/**
 * Copies the patient's files into the clinic's own records once they become its patient, so
 * the clinic keeps them whatever the patient later does with their portal account.
 */
async function copyFilesToClinic(inquiryId: ObjectId, companyId: ObjectId, languageCode: string): Promise<void> {
    const inquiry = await clinicInquiryService.findById(inquiryId, {});
    if (!inquiry) return;
    const gridfs = getGridFSStorage(languageCode, "media");
    const copies: ObjectId[] = [];
    for (const fileId of idsOf(inquiry.files)) {
        const media = await mediaService.findById(fileId, {});
        // Nothing stored to copy, or already the clinic's: keep the reference as it is.
        if (!media?.fileId || String(nestedEntityToRef(media.company)) === String(companyId)) {
            copies.push(fileId);
            continue;
        }
        // A health file is sealed again for the copy, under the clinic's own key (D102), a chunk at a time as GridFS
        // pulls it, so a large scan is never held whole (TD-B111).
        const copyId = new ObjectId();
        const source = await readMediaStream(media, languageCode);
        const stored = media.encrypted ? await sealMediaFileStream(source, companyId, copyId) : Readable.from(source.chunks, {objectMode: false});
        const gridfsId = await gridfs.uploadFile(stored, media.originalName, {mimeType: media.mimeType, copiedFrom: String(media._id)});
        const copy = await mediaService.create({
            _id: copyId,
            ...(media.encrypted ? {encrypted: true} : {}),
            type: media.type,
            originalName: media.originalName,
            fileName: media.fileName,
            fileId: gridfsId,
            metadata: media.metadata,
            mimeType: media.mimeType,
            extension: media.extension,
            fileSize: media.fileSize,
            sizeInBytes: media.sizeInBytes,
            ...(media.resolution ? {resolution: media.resolution} : {}),
            company: companyId,
            createdBy: media.createdBy,
        });
        copies.push(copy._id);
    }
    await clinicInquiryService.updateOne({_id: inquiryId}, {$set: {files: copies}});
    const copied = idsOf(inquiry.files).filter((id) => !copies.some((copy) => copy.equals(id)));
    await unshareFiles(copied, companyId, {});
}

/**
 * The patient accepts one clinic's quote. Under a lock on every inquiry of their request:
 * this quote is accepted and the clinic's other options rejected; the patient's other clinics
 * are closed (their quotes rejected, their access to the files removed); this clinic gets the
 * patient's contact and a patient folder. The files are copied to the clinic after commit.
 */
export async function acceptPlan(
    plan: ITreatmentPlan,
    input: {accountId: ObjectId; signedName: string; ip?: string; userAgent?: string; now?: Date},
    ctx: ClinicCtx,
): Promise<IClinicInquiry> {
    const now = input.now ?? new Date();
    const inquiryId = nestedEntityToRef(plan.inquiry);
    const inquiry = inquiryId ? await clinicInquiryService.findOne({_id: inquiryId, account: input.accountId, deletedAt: null}, {session: ctx.session}) : null;
    if (!inquiry) throw apiValidationException("treatment_plan_not_found", "", null, ctx.languageCode);
    if (plan.status !== "sent" || !isOpenInquiry(inquiry)) throw apiValidationException("treatment_plan_invalid_status", "", null, ctx.languageCode);
    if (plan.validUntil && plan.validUntil < localDateOf(now, UTC)) throw apiValidationException("treatment_plan_expired", "", null, ctx.languageCode);

    // Two acceptances of the same request (at two clinics) write the same documents: one commits.
    const group = inquiry.requestGroup ? {account: input.accountId, requestGroup: inquiry.requestGroup} : {_id: inquiry._id};
    await clinicInquiryService.updateMany(group, {$inc: {acceptLock: 1}}, {session: ctx.session});

    plan.status = "accepted";
    plan.acceptance = {name: input.signedName.trim(), at: now, ip: input.ip, userAgent: input.userAgent, contentHash: planContentHash(plan)};
    record(plan, "accepted", {userId: input.accountId, now});

    const companyId = inquiryCompanyId(inquiry);
    const others = await clinicInquiryService.find({...group, _id: {$ne: inquiry._id}, deletedAt: null}, {session: ctx.session});
    const otherIds = others.map((other) => other._id);
    await treatmentPlanService.updateMany({inquiry: {$in: [inquiry._id, ...otherIds]}, _id: {$ne: plan._id}, status: {$in: ["sent", "draft"]}}, {$set: {status: "rejected"}, $push: {timeline: {event: "rejected", at: now, note: plan.number}}}, {session: ctx.session});

    for (const other of others) {
        if (!isOpenInquiry(other)) continue;
        other.status = "lost";
        other.closedAt = now;
        other.closeReason = "patient_chose_another_clinic";
        other.timeline.push({event: "lost", at: now, note: "patient_chose_another_clinic"});
        await other.save({session: ctx.session});
        await unshareFiles(idsOf(other.files), inquiryCompanyId(other), ctx);
        await notifyInquiryStaff(NotificationEventCodes.INQUIRY_CHOSE_ANOTHER_CLINIC, other, ctx);
    }

    const {contact} = inquiry;
    const patient = await findOrCreatePatient(
        {
            companyId,
            accountId: input.accountId,
            contact: {
                firstName: contact.firstName,
                lastName: contact.lastName,
                email: contact.email,
                phone: contact.phone,
                whatsapp: contact.whatsapp,
                country: nestedEntityToRef(contact.country),
            },
            source: inquiry.source,
            preferredLanguage: contact.preferredLanguage,
            now,
        },
        ctx,
    );
    await keepMedicalHistory(patient, inquiry.medicalHistory, ctx);
    plan.set("patient", patient._id);
    await plan.save({session: ctx.session});

    inquiry.contactShared = true;
    inquiry.set("patient", patient._id);
    inquiry.status = "converted";
    inquiry.closedAt = now;
    inquiry.timeline.push({event: "converted", at: now, by: input.accountId, note: plan.number});
    await inquiry.save({session: ctx.session});

    await notifyInquiryStaff(NotificationEventCodes.PLAN_ACCEPTED, inquiry, ctx);
    await notifyInquiryPatient("planAccepted", inquiry, {}, ctx);
    await runAfterCommit(ctx.session, async () => {
        try {
            await copyFilesToClinic(inquiry._id, companyId, ctx.languageCode);
        } catch (error) {
            ctx.logger.err(`Could not copy the files of request ${inquiry.number} to the clinic`, error);
        }
    });
    return inquiry;
}

/** Sent quotes past their last day can no longer be accepted. */
export async function expirePlans(companyId: ObjectId, now: Date = new Date()): Promise<number> {
    const today = localDateOf(now, UTC);
    const result = await treatmentPlanService.updateMany({company: companyId, status: "sent", validUntil: {$lt: today}, deletedAt: null}, {$set: {status: "expired"}, $push: {timeline: {event: "expired", at: now}}});
    return result.modifiedCount;
}
