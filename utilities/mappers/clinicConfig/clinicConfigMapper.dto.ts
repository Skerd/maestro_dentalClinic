import type {IClinicConfig} from "@dentalClinicModule/database/schemas/clinicConfig/clinicConfig";
import type {ClinicConfig} from "armonia/src/modules/dentalClinic/api/dentalClinic/private/clinicConfig/clinicConfig.dto";
import type {CurrencySimple} from "armonia/src/modules/core/dto/currency.dto";
import type {SimpleBlankUser} from "armonia/src/modules/core/dto/user.dto";
import {mapSnippet} from "@coreModule/utilities/mappers/common.mapper";
import {CurrencySimpleSnippet} from "@coreModule/database/schemas/currency/currency.snippets";
import {SimpleBlankUserSnippet} from "@coreModule/database/schemas/user/user.snippets";
import {mapLifeCycleToDTO, mapOwnershipToDTO, mapSoftDeleteToDTO} from "@coreModule/utilities/mappers/plugin/pluginMappers.dto";

export function clinicConfigToDTO(config: IClinicConfig): ClinicConfig {
    return {
        _id: config._id.toString(),
        publicBookingEnabled: config.publicBookingEnabled,
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
        ...mapSoftDeleteToDTO(config),
        ...mapOwnershipToDTO(config),
        ...mapLifeCycleToDTO(config),
    };
}

export function clinicConfigsToDTO(configs: IClinicConfig[]): ClinicConfig[] {
    return configs.map(clinicConfigToDTO);
}
