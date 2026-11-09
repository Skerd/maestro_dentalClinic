import * as crypto from "crypto";
import {ObjectId} from "mongodb";
import type {ClientSession} from "mongoose";
import {apiValidationException} from "armonia/src/modules/core/helpers/exceptions";
import {nestedEntityToRef} from "@coreModule/utilities/mappers/common.mapper";
import {portalListedCompanyIds, type PortalScope} from "@coreModule/utilities/marketing/portalCompanies";
import type {CreateInput} from "@coreModule/database/services/baseCrudService";
import {INQUIRY_MAX_CLINICS, TREATMENT_CATEGORIES, type PatientSource, type TreatmentCategory} from "armonia/src/modules/dentalClinic/constants";
import ClinicConfig from "@dentalClinicModule/database/schemas/clinicConfig/clinicConfig";
import {type IClinicInquiry, type IInquiryContact} from "@dentalClinicModule/database/schemas/clinicInquiry/clinicInquiry";
import {clinicInquiryService} from "@dentalClinicModule/database/schemas/clinicInquiry/clinicInquiry.service";
import type {ClinicCtx} from "./appointmentBooking";

import {mediaService} from "@coreModule/database/schemas/media/media.service";
/** Ids of refs that may or may not be populated. */
export function idsOf(values: unknown[]): ObjectId[] {
    return values.map((value) => nestedEntityToRef(value)).filter((id): id is ObjectId => id !== undefined);
}

/** The clinic an inquiry belongs to; the ownership plugin always sets it. */
export function inquiryCompanyId(inquiry: Pick<IClinicInquiry, "company">): ObjectId {
    const companyId = nestedEntityToRef(inquiry.company);
    if (!companyId) throw new Error("Inquiry without a company");
    return companyId;
}

export function inquiryNumber(now: Date = new Date()): string {
    const datePart = now.toISOString().slice(0, 10).replace(/-/g, "");
    return `INQ-${datePart}-${crypto.randomBytes(3).toString("hex")}`.toUpperCase();
}

/** Clinics that take estimate requests: on a clinic's own host that clinic, on the apex those listed on the portal. */
export function requestableClinicIds(scope: PortalScope): Promise<ObjectId[]> {
    return portalListedCompanyIds("dentalClinic", {
        configModel: ClinicConfig,
        configFilter: {inquiriesEnabled: true},
        listedOn: {listedOnPortal: true},
    }, scope);
}

const isTreatment = (value: string): value is TreatmentCategory => TREATMENT_CATEGORIES.some((category) => category === value);

/** The Zod contract checks the list shape only; every entry must be a known treatment. */
export function assertTreatments(values: string[], languageCode: string): TreatmentCategory[] {
    const treatments = [...new Set(values)].filter(isTreatment);
    if (!treatments.length || treatments.length !== new Set(values).size) {
        throw apiValidationException("inquiry_invalid_treatments", "", null, languageCode);
    }
    return treatments;
}

/**
 * Files a portal patient uploaded for a request: theirs (uploaded under the platform company
 * by this account) and not yet used. They stop being "pending" once claimed.
 */
export async function claimPatientUploads(
    fileIds: string[],
    owner: {accountId: ObjectId; platformCompanyId: ObjectId},
    ctx: ClinicCtx,
): Promise<ObjectId[]> {
    if (!fileIds.length) return [];
    const ids = [...new Set(fileIds)].map((id) => new ObjectId(id));
    const files = await mediaService.find({
        _id: {$in: ids},
        createdBy: owner.accountId,
        company: owner.platformCompanyId,
        deletedAt: null,
    }, {session: ctx.session}, undefined, "_id");
    if (files.length !== ids.length) {
        throw apiValidationException("inquiry_file_not_found", "", null, ctx.languageCode);
    }
    await mediaService.updateMany({_id: {$in: ids}}, {$unset: {pendingReference: ""}}, {session: ctx.session});
    return ids;
}

/** Lets these clinics' staff open the files through the private media route. */
export async function shareFiles(fileIds: ObjectId[], companyIds: ObjectId[], ctx: {session?: ClientSession}): Promise<void> {
    if (!fileIds.length || !companyIds.length) return;
    await mediaService.updateMany({_id: {$in: fileIds}}, {$addToSet: {sharedWithCompanies: {$each: companyIds}}}, {session: ctx.session});
}

/** Takes the clinic's access away again (declined, lost, withdrawn). */
export async function unshareFiles(fileIds: ObjectId[], companyId: ObjectId, ctx: {session?: ClientSession}): Promise<void> {
    if (!fileIds.length) return;
    await mediaService.updateMany({_id: {$in: fileIds}}, {$pull: {sharedWithCompanies: companyId}}, {session: ctx.session});
}

export type InquiryRequestInput = {
    treatmentsWanted: TreatmentCategory[];
    description?: string;
    travelFrom?: string;
    travelTo?: string;
    budget?: number;
    budgetCurrency?: ObjectId;
};

function assertTravelWindow(request: InquiryRequestInput, languageCode: string): void {
    if (request.travelFrom && request.travelTo && request.travelTo < request.travelFrom) {
        throw apiValidationException("inquiry_travel_window_invalid", "", null, languageCode);
    }
}

function inquiryRecord(input: {
    companyId: ObjectId;
    source: PatientSource;
    contact: IInquiryContact;
    contactShared: boolean;
    request: InquiryRequestInput;
    files: ObjectId[];
    idempotencyKey: string;
    now: Date;
    requestGroup?: string;
    accountId?: ObjectId;
    assignedTo?: ObjectId;
    consentVersion?: string;
    createdBy?: ObjectId;
}): CreateInput<IClinicInquiry> {
    const {request, now} = input;
    return {
        company: input.companyId,
        number: inquiryNumber(now),
        ...(input.requestGroup ? {requestGroup: input.requestGroup} : {}),
        ...(input.accountId ? {account: input.accountId} : {}),
        source: input.source,
        status: "new",
        contact: input.contact,
        contactShared: input.contactShared,
        treatmentsWanted: request.treatmentsWanted,
        ...(request.description?.trim() ? {description: request.description.trim()} : {}),
        ...(request.travelFrom ? {travelFrom: request.travelFrom} : {}),
        ...(request.travelTo ? {travelTo: request.travelTo} : {}),
        ...(request.budget !== undefined ? {budget: request.budget} : {}),
        ...(request.budgetCurrency ? {budgetCurrency: request.budgetCurrency} : {}),
        files: input.files,
        infoRequests: [],
        ...(input.assignedTo ? {assignedTo: input.assignedTo} : {}),
        ...(input.consentVersion ? {consent: {version: input.consentVersion, at: now}} : {}),
        unreadForClinic: 0,
        unreadForPatient: 0,
        idempotencyKey: input.idempotencyKey,
        timeline: [{event: "created", at: now, ...(input.createdBy ? {by: input.createdBy} : {})}],
    };
}

/**
 * A portal patient's request, opened as one inquiry at each chosen clinic inside the caller's
 * transaction. The clinics must take requests in this scope; the files are shared with them.
 * Retried with the same key, it answers with the inquiries it already opened.
 */
export async function openPatientRequest(
    input: {
        accountId: ObjectId;
        platformCompanyId: ObjectId;
        scope: PortalScope;
        clinicIds: string[];
        contact: IInquiryContact;
        request: InquiryRequestInput;
        fileIds: string[];
        consentVersion: string;
        idempotencyKey: string;
        source: PatientSource;
        now?: Date;
    },
    ctx: ClinicCtx,
): Promise<{requestGroup: string; inquiries: IClinicInquiry[]; created: boolean}> {
    const now = input.now ?? new Date();
    const clinicIds = [...new Set(input.clinicIds)];
    if (!clinicIds.length || clinicIds.length > INQUIRY_MAX_CLINICS) {
        throw apiValidationException("inquiry_clinic_count_invalid", "", null, ctx.languageCode, [String(INQUIRY_MAX_CLINICS)]);
    }
    assertTravelWindow(input.request, ctx.languageCode);

    const keys = clinicIds.map((clinicId) => `${input.idempotencyKey}:${clinicId}`);
    const existing = await clinicInquiryService.find({account: input.accountId, idempotencyKey: {$in: keys}}, {session: ctx.session});
    if (existing.length) {
        return {requestGroup: existing[0].requestGroup ?? "", inquiries: existing, created: false};
    }

    const allowed = new Set((await requestableClinicIds(input.scope)).map(String));
    if (clinicIds.some((clinicId) => !allowed.has(clinicId))) {
        throw apiValidationException("inquiry_clinic_not_available", "", null, ctx.languageCode);
    }

    const files = await claimPatientUploads(input.fileIds, {accountId: input.accountId, platformCompanyId: input.platformCompanyId}, ctx);
    // Shared first: an inquiry may only reference files its clinic can open (D104).
    await shareFiles(files, clinicIds.map((clinicId) => new ObjectId(clinicId)), ctx);
    const requestGroup = crypto.randomUUID();
    const inquiries: IClinicInquiry[] = [];
    for (const clinicId of clinicIds) {
        inquiries.push(await clinicInquiryService.create(
            inquiryRecord({
                companyId: new ObjectId(clinicId),
                source: input.source,
                contact: input.contact,
                contactShared: false,
                request: input.request,
                files,
                idempotencyKey: `${input.idempotencyKey}:${clinicId}`,
                now,
                requestGroup,
                accountId: input.accountId,
                consentVersion: input.consentVersion,
                createdBy: input.accountId,
            }),
            {session: ctx.session, logger: ctx.logger, languageCode: ctx.languageCode, auditUserId: input.accountId},
        ));
    }
    return {requestGroup, inquiries, created: true};
}

/**
 * A lead the clinic enters itself (a call, a WhatsApp chat, an agency). The clinic already
 * holds the contact, so nothing is masked.
 */
export function staffInquiryRecord(
    input: {
        companyId: ObjectId;
        source: PatientSource;
        contact: IInquiryContact;
        request: InquiryRequestInput;
        assignedTo?: ObjectId;
        createdBy: ObjectId;
        now?: Date;
    },
    languageCode: string,
): CreateInput<IClinicInquiry> {
    const now = input.now ?? new Date();
    assertTravelWindow(input.request, languageCode);
    return inquiryRecord({
        ...input,
        contactShared: true,
        files: [],
        idempotencyKey: crypto.randomUUID(),
        now,
    });
}
