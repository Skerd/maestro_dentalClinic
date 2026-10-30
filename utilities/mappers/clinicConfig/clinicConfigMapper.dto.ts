import type {IClinicConfig} from "@dentalClinicModule/database/schemas/clinicConfig/clinicConfig";
import type {ClinicConfig} from "armonia/src/modules/dentalClinic/api/dentalClinic/private/clinicConfig/clinicConfig.dto";
import type {CurrencySimple} from "armonia/src/modules/core/dto/currency.dto";
import type {SimpleBlankUser} from "armonia/src/modules/core/dto/user.dto";
import {mapMedia, mapSnippet} from "@coreModule/utilities/mappers/common.mapper";
import {CurrencySimpleSnippet} from "@coreModule/database/schemas/currency/currency.snippets";
import {SimpleBlankUserSnippet} from "@coreModule/database/schemas/user/user.snippets";
import {mapLifeCycleToDTO, mapOwnershipToDTO, mapSoftDeleteToDTO} from "@coreModule/utilities/mappers/plugin/pluginMappers.dto";

export function clinicConfigToDTO(config: IClinicConfig): ClinicConfig {
    return {
        _id: config._id.toString(),
        publicBookingEnabled: config.publicBookingEnabled,
        listedOnPortal: config.listedOnPortal,
        currency: mapSnippet<CurrencySimple>()(config.currency, CurrencySimpleSnippet),
        slotIntervalMinutes: config.slotIntervalMinutes,
        minNoticeHours: config.minNoticeHours,
        maxAdvanceDays: config.maxAdvanceDays,
        cancellationDeadlineHours: config.cancellationDeadlineHours,
        rescheduleDeadlineHours: config.rescheduleDeadlineHours,
        noShowGraceMinutes: config.noShowGraceMinutes,
        guestBookingAllowed: config.guestBookingAllowed,
        requireStaffConfirmation: config.requireStaffConfirmation,
        patientNoteEnabled: config.patientNoteEnabled,
        reminderHoursBefore: config.reminderHoursBefore,
        reminderSms: config.reminderSms,
        includeServiceInMessages: config.includeServiceInMessages,
        retentionMonths: config.retentionMonths,
        privacyNoticeVersion: config.privacyNoticeVersion,
        privacyNoticeText: config.privacyNoticeText,
        notifyUsers: config.notifyUsers
            ?.map((user) => mapSnippet<SimpleBlankUser>()(user, SimpleBlankUserSnippet))
            .filter((user): user is SimpleBlankUser => user !== undefined),
        inquiriesEnabled: config.inquiriesEnabled ?? false,
        inquiryNotifyUsers: config.inquiryNotifyUsers
            ?.map((user) => mapSnippet<SimpleBlankUser>()(user, SimpleBlankUserSnippet))
            .filter((user): user is SimpleBlankUser => user !== undefined),
        responseTargetHours: config.responseTargetHours ?? 24,
        languagesSpoken: config.languagesSpoken ?? [],
        implantBrands: config.implantBrands ?? [],
        nearestAirport: config.nearestAirport,
        // Subdocuments are copied field by field: spreading one would copy Mongoose's internal state.
        profileTexts: (config.profileTexts ?? []).map(({locale, headline, description, warrantyPolicy, travelInfo}) => ({locale, headline, description, warrantyPolicy, travelInfo})),
        accreditations: (config.accreditations ?? []).map(({title, issuer, year}) => ({title, issuer, year})),
        quoteValidityDays: config.quoteValidityDays ?? 30,
        quoteTerms: config.quoteTerms,
        gallery: config.gallery?.length ? config.gallery.map(mapMedia).filter((media) => media !== undefined) : undefined,
        ...mapSoftDeleteToDTO(config),
        ...mapOwnershipToDTO(config),
        ...mapLifeCycleToDTO(config),
    };
}

export function clinicConfigsToDTO(configs: IClinicConfig[]): ClinicConfig[] {
    return configs.map(clinicConfigToDTO);
}
