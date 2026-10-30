import * as crypto from "crypto";
import {ObjectId} from "mongodb";
import {apiValidationException} from "armonia/src/modules/core/helpers/exceptions";
import {PATIENT_LANGUAGES, type PatientLanguage, type PatientSource} from "armonia/src/modules/dentalClinic/constants";
import Patient, {type IPatient} from "@dentalClinicModule/database/schemas/patient/patient";
import {patientService} from "@dentalClinicModule/database/schemas/patient/patient.service";
import Company from "@coreModule/database/schemas/company/company";
import Role from "@coreModule/database/schemas/role/role";
import User from "@coreModule/database/schemas/user/user";
import {copyMedicalHistory, type IMedicalHistory} from "@dentalClinicModule/database/schemas/shared/medicalHistory";
import type {ClinicCtx} from "./appointmentBooking";

/** Case-insensitive match on names, so "rossi" and "Rossi" are the same person. */
const NAME_COLLATION = {locale: "en", strength: 2};

export function patientNumber(now: Date = new Date()): string {
    const datePart = now.toISOString().slice(0, 10).replace(/-/g, "");
    return `PT-${datePart}-${crypto.randomBytes(3).toString("hex")}`.toUpperCase();
}

/** The request's language when the platform ships it, else English. */
export function patientLanguageFor(languageCode: string | undefined): PatientLanguage {
    return PATIENT_LANGUAGES.find((language) => language === languageCode) ?? "en-US";
}

export type PatientContact = {firstName: string; lastName: string; email?: string; phone?: string; whatsapp?: string; country?: ObjectId};

/**
 * The clinic's folder for this person, created on first contact. A signed-in account
 * always maps to the same folder, and becomes a member of the clinic with the Patient role.
 * Without an account, the same email and full name do: a parent booking for a child under
 * their own email gets the child its own folder.
 */
export async function findOrCreatePatient(
    input: {companyId: ObjectId; accountId?: ObjectId; contact: PatientContact; source: PatientSource; preferredLanguage?: PatientLanguage; now?: Date},
    ctx: ClinicCtx,
): Promise<IPatient> {
    const {companyId, accountId, contact, source} = input;
    const live = {company: companyId, deletedAt: null};

    if (accountId) {
        const byAccount = await Patient.findOne({...live, account: accountId}).session(ctx.session);
        if (byAccount) {
            await ensurePatientMembership(companyId, accountId, ctx);
            return byAccount;
        }
    }
    // Without an email there is nothing safe to match a stranger on: a new folder is opened.
    const email = contact.email?.trim().toLowerCase();
    const byContact = email && await Patient.findOne({
        ...live,
        email,
        firstName: contact.firstName.trim(),
        lastName: contact.lastName.trim(),
        // A folder already tied to another account belongs to someone else.
        ...(accountId ? {account: {$in: [null, accountId]}} : {}),
    })
        .collation(NAME_COLLATION)
        .session(ctx.session);
    if (byContact) {
        if (accountId && !byContact.account) {
            await patientService.updateByIdOrThrow(byContact._id, {account: accountId}, ctx);
            byContact.set("account", accountId);
        }
        if (accountId) await ensurePatientMembership(companyId, accountId, ctx);
        return byContact;
    }

    const created = await patientService.create(
        {
            company: companyId,
            number: patientNumber(input.now),
            firstName: contact.firstName.trim(),
            lastName: contact.lastName.trim(),
            ...(email ? {email} : {}),
            ...(contact.phone?.trim() ? {phone: contact.phone.trim()} : {}),
            ...(contact.whatsapp?.trim() ? {whatsapp: contact.whatsapp.trim()} : {}),
            ...(contact.country ? {address: {country: contact.country}} : {}),
            preferredLanguage: input.preferredLanguage ?? patientLanguageFor(ctx.languageCode),
            source,
            tags: [],
            ...(accountId ? {account: accountId} : {}),
        },
        {session: ctx.session, logger: ctx.logger, languageCode: ctx.languageCode, auditUserId: ctx.auditUserId},
    );
    if (accountId) await ensurePatientMembership(companyId, accountId, ctx);
    return created;
}

/**
 * Makes the account a member of the clinic with its signup role (Web Client), once it is tied to
 * a patient folder there: a customer, so it stays off the staff lists and pickers. Someone
 * already in the company (any role) is left as they are.
 */
export async function ensurePatientMembership(companyId: ObjectId, accountId: ObjectId, ctx: ClinicCtx): Promise<void> {
    const company = await Company.findById(companyId).session(ctx.session);
    if (!company) return;
    let role = await Role.findOne({company: companyId, isSignupDefault: true}).select("_id").session(ctx.session);
    if (!role) {
        await company.createDefaultRoles(ctx.logger, ctx.session);
        role = await Role.findOne({company: companyId, isSignupDefault: true}).select("_id").session(ctx.session);
    }
    if (!role) return;
    await User.updateOne(
        {_id: accountId, "roles.company": {$ne: companyId}},
        {
            $addToSet: {companies: companyId},
            $push: {
                roles: {
                    _id: new ObjectId(),
                    active: "active",
                    unsuccessfulLogins: 0,
                    lockedOutUntil: null,
                    lastLogin: null,
                    rolesCount: 1,
                    roles: [role._id],
                    company: companyId,
                },
            },
        },
        {session: ctx.session},
    );
}

/** A folder picked by staff: it must be this clinic's and not deleted. */
export async function loadPatientOrThrow(companyId: ObjectId, patientId: string, ctx: ClinicCtx): Promise<IPatient> {
    if (!ObjectId.isValid(patientId)) throw apiValidationException("patient_not_found", "", null, ctx.languageCode);
    const patient = await Patient.findOne({_id: new ObjectId(patientId), company: companyId, deletedAt: null}).session(ctx.session);
    if (!patient) throw apiValidationException("patient_not_found", "", null, ctx.languageCode);
    return patient;
}

/** Keeps the patient's latest questionnaire in their folder; an older one never replaces a newer one. */
export async function keepMedicalHistory(patient: IPatient, history: IMedicalHistory | undefined, ctx: ClinicCtx): Promise<void> {
    if (!history) return;
    if (patient.medicalHistory && patient.medicalHistory.submittedAt >= history.submittedAt) return;
    patient.set("medicalHistory", copyMedicalHistory(history));
    await patient.save({session: ctx.session});
}
