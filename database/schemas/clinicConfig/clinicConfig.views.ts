import type {ViewConfig} from "armonia/src/modules/core/api/auxiliary/private/viewConfig";
import {PATIENT_LANGUAGES} from "armonia/src/modules/dentalClinic/constants";
import {
    CLINIC_ACCREDITATION_TEXT_MAX,
    CLINIC_ADVANCE_DAYS,
    CLINIC_DEADLINE_HOURS,
    CLINIC_NO_SHOW_GRACE_MINUTES,
    CLINIC_NOTICE_HOURS,
    CLINIC_PRIVACY_TEXT_MAX,
    CLINIC_PRIVACY_VERSION_MAX,
    CLINIC_PROFILE_HEADLINE_MAX,
    CLINIC_PROFILE_LIST_ITEM_MAX,
    CLINIC_PROFILE_TEXT_MAX,
    CLINIC_QUOTE_VALIDITY_DAYS,
    CLINIC_REMINDER_HOURS,
    CLINIC_RESPONSE_TARGET_HOURS,
    CLINIC_RETENTION_MONTHS,
    CLINIC_SLOT_INTERVAL_MINUTES,
} from "armonia/src/modules/dentalClinic/api/dentalClinic/private/clinicConfig/clinicConfig.schema-def";

const API_URL = "/api/dentalClinic/clinicConfig";

const profileLocaleOptions = PATIENT_LANGUAGES.map((value) => ({
    value,
    label: `form.language.${value}`,
}));

/**
 * One settings record, edited in place. Each collapse is its own page under
 * Configurations → Dental clinic (`skipRenderWhenFormExtraNotTruthy`).
 * Booking alerts and estimate-request alerts share the staff-alerts page.
 */
export const clinicConfigEditFormView: ViewConfig = {
    model: "clinicconfigs",
    viewType: "form",
    viewMode: "edit",
    accessModel: "clinicconfigs",
    apiUrl: API_URL,
    method: "PATCH",
    nodes: [
        {
            render: "#TitleWithCollapse",
            props: {title: "form.bookingSectionTitle", skipRenderWhenFormExtraNotTruthy: "sectionBooking"},
            permissions: {
                readAny: [
                    "publicBookingEnabled",
                    "listedOnPortal",
                    "guestBookingAllowed",
                    "requireStaffConfirmation",
                    "slotIntervalMinutes",
                    "minNoticeHours",
                    "maxAdvanceDays",
                    "cancellationDeadlineHours",
                    "rescheduleDeadlineHours",
                    "noShowGraceMinutes",
                ],
                writeAny: [
                    "publicBookingEnabled",
                    "listedOnPortal",
                    "guestBookingAllowed",
                    "requireStaffConfirmation",
                    "slotIntervalMinutes",
                    "minNoticeHours",
                    "maxAdvanceDays",
                    "cancellationDeadlineHours",
                    "rescheduleDeadlineHours",
                    "noShowGraceMinutes",
                ],
            },
            children: [
                {
                    render: "#FormGrid",
                    props: {columns: 3},
                    children: [
                        {
                            render: "#Field",
                            permissions: {
                                read: "publicBookingEnabled",
                                write: "publicBookingEnabled",
                            },
                            field: {
                                name: "publicBookingEnabled",
                                widget: "#Switch",
                                label: "form.publicBookingEnabledLabel",
                            },
                        },
                        {
                            render: "#Field",
                            permissions: {
                                read: "guestBookingAllowed",
                                write: "guestBookingAllowed",
                            },
                            field: {
                                name: "guestBookingAllowed",
                                widget: "#Switch",
                                label: "form.guestBookingAllowedLabel",
                            },
                        },
                        {
                            render: "#Field",
                            permissions: {
                                read: "listedOnPortal",
                                write: "listedOnPortal",
                            },
                            field: {
                                name: "listedOnPortal",
                                widget: "#Switch",
                                label: "form.listedOnPortalLabel",
                            },
                        },
                        {
                            render: "#Field",
                            permissions: {
                                read: "requireStaffConfirmation",
                                write: "requireStaffConfirmation",
                            },
                            field: {
                                name: "requireStaffConfirmation",
                                widget: "#Switch",
                                label: "form.requireStaffConfirmationLabel",
                            },
                        },
                        {
                            render: "#Field",
                            permissions: {
                                read: "slotIntervalMinutes",
                                write: "slotIntervalMinutes",
                            },
                            field: {
                                name: "slotIntervalMinutes",
                                widget: "#Input",
                                label: "form.slotIntervalMinutesLabel",
                                placeholder:
                                    "form.slotIntervalMinutesPlaceholder",
                                required: true,
                                widgetProps: {
                                    type: "number",
                                    min: CLINIC_SLOT_INTERVAL_MINUTES.min,
                                    max: CLINIC_SLOT_INTERVAL_MINUTES.max,
                                },
                            },
                        },
                        {
                            render: "#Field",
                            permissions: {
                                read: "minNoticeHours",
                                write: "minNoticeHours",
                            },
                            field: {
                                name: "minNoticeHours",
                                widget: "#Input",
                                label: "form.minNoticeHoursLabel",
                                placeholder: "form.minNoticeHoursPlaceholder",
                                required: true,
                                widgetProps: {
                                    type: "number",
                                    min: CLINIC_NOTICE_HOURS.min,
                                    max: CLINIC_NOTICE_HOURS.max,
                                },
                            },
                        },
                        {
                            render: "#Field",
                            permissions: {
                                read: "maxAdvanceDays",
                                write: "maxAdvanceDays",
                            },
                            field: {
                                name: "maxAdvanceDays",
                                widget: "#Input",
                                label: "form.maxAdvanceDaysLabel",
                                placeholder: "form.maxAdvanceDaysPlaceholder",
                                required: true,
                                widgetProps: {
                                    type: "number",
                                    min: CLINIC_ADVANCE_DAYS.min,
                                    max: CLINIC_ADVANCE_DAYS.max,
                                },
                            },
                        },
                        {
                            render: "#Field",
                            permissions: {
                                read: "cancellationDeadlineHours",
                                write: "cancellationDeadlineHours",
                            },
                            field: {
                                name: "cancellationDeadlineHours",
                                widget: "#Input",
                                label: "form.cancellationDeadlineHoursLabel",
                                placeholder:
                                    "form.cancellationDeadlineHoursPlaceholder",
                                required: true,
                                widgetProps: {
                                    type: "number",
                                    min: CLINIC_DEADLINE_HOURS.min,
                                    max: CLINIC_DEADLINE_HOURS.max,
                                },
                            },
                        },
                        {
                            render: "#Field",
                            permissions: {
                                read: "rescheduleDeadlineHours",
                                write: "rescheduleDeadlineHours",
                            },
                            field: {
                                name: "rescheduleDeadlineHours",
                                widget: "#Input",
                                label: "form.rescheduleDeadlineHoursLabel",
                                placeholder:
                                    "form.rescheduleDeadlineHoursPlaceholder",
                                required: true,
                                widgetProps: {
                                    type: "number",
                                    min: CLINIC_DEADLINE_HOURS.min,
                                    max: CLINIC_DEADLINE_HOURS.max,
                                },
                            },
                        },
                        {
                            render: "#Field",
                            permissions: {
                                read: "noShowGraceMinutes",
                                write: "noShowGraceMinutes",
                            },
                            field: {
                                name: "noShowGraceMinutes",
                                widget: "#Input",
                                label: "form.noShowGraceMinutesLabel",
                                placeholder:
                                    "form.noShowGraceMinutesPlaceholder",
                                required: true,
                                widgetProps: {
                                    type: "number",
                                    min: CLINIC_NO_SHOW_GRACE_MINUTES.min,
                                    max: CLINIC_NO_SHOW_GRACE_MINUTES.max,
                                },
                            },
                        },
                    ],
                },
            ],
        },
        {
            // Its own page: the currency is not a booking detail, it prices every treatment, quote and payment.
            render: "#TitleWithCollapse",
            props: {title: "form.pricesSectionTitle", skipRenderWhenFormExtraNotTruthy: "sectionPrices"},
            permissions: {readAny: ["currency"], writeAny: ["currency"]},
            children: [
                {
                    render: "#FormGrid",
                    props: {columns: 2},
                    children: [
                        {
                            render: "#Field",
                            permissions: {read: "currency", write: "currency"},
                            field: {
                                name: "currency",
                                widget: "#ApiSelect",
                                label: "form.currencyLabel",
                                placeholder: "form.currencyPlaceholder",
                                description: "form.currencyDescription",
                                required: true,
                                widgetProps: {
                                    apiUrl: "/api/finance/currency/select",
                                    method: "POST",
                                    pageSize: 50,
                                },
                            },
                        },
                    ],
                },
            ],
        },
        {
            render: "#TitleWithCollapse",
            props: {title: "form.patientSectionTitle", skipRenderWhenFormExtraNotTruthy: "sectionPatients"},
            permissions: {
                readAny: [
                    "patientNoteEnabled",
                    "includeServiceInMessages",
                    "reminderSms",
                    "reminderHoursBefore",
                    "retentionMonths",
                ],
                writeAny: [
                    "patientNoteEnabled",
                    "includeServiceInMessages",
                    "reminderSms",
                    "reminderHoursBefore",
                    "retentionMonths",
                ],
            },
            children: [
                {
                    render: "#FormGrid",
                    props: {columns: 3},
                    children: [
                        {
                            render: "#Field",
                            permissions: {
                                read: "patientNoteEnabled",
                                write: "patientNoteEnabled",
                            },
                            field: {
                                name: "patientNoteEnabled",
                                widget: "#Switch",
                                label: "form.patientNoteEnabledLabel",
                            },
                        },
                        {
                            render: "#Field",
                            permissions: {
                                read: "includeServiceInMessages",
                                write: "includeServiceInMessages",
                            },
                            field: {
                                name: "includeServiceInMessages",
                                widget: "#Switch",
                                label: "form.includeServiceInMessagesLabel",
                            },
                        },
                        {
                            render: "#Field",
                            permissions: {
                                read: "reminderSms",
                                write: "reminderSms",
                            },
                            field: {
                                name: "reminderSms",
                                widget: "#Switch",
                                label: "form.reminderSmsLabel",
                            },
                        },
                        {
                            render: "#Field",
                            permissions: {
                                read: "reminderHoursBefore",
                                write: "reminderHoursBefore",
                            },
                            field: {
                                name: "reminderHoursBefore",
                                widget: "#Input",
                                label: "form.reminderHoursBeforeLabel",
                                placeholder:
                                    "form.reminderHoursBeforePlaceholder",
                                required: true,
                                widgetProps: {
                                    type: "number",
                                    min: CLINIC_REMINDER_HOURS.min,
                                    max: CLINIC_REMINDER_HOURS.max,
                                },
                            },
                        },
                        {
                            render: "#Field",
                            permissions: {
                                read: "retentionMonths",
                                write: "retentionMonths",
                            },
                            field: {
                                name: "retentionMonths",
                                widget: "#Input",
                                label: "form.retentionMonthsLabel",
                                placeholder: "form.retentionMonthsPlaceholder",
                                required: true,
                                widgetProps: {
                                    type: "number",
                                    min: CLINIC_RETENTION_MONTHS.min,
                                    max: CLINIC_RETENTION_MONTHS.max,
                                },
                            },
                        },
                    ],
                },
            ],
        },
        {
            render: "#TitleWithCollapse",
            props: {title: "form.privacySectionTitle", skipRenderWhenFormExtraNotTruthy: "sectionPrivacy"},
            permissions: {
                readAny: ["privacyNoticeVersion", "privacyNoticeText"],
                writeAny: ["privacyNoticeVersion", "privacyNoticeText"],
            },
            children: [
                {
                    render: "#FormGrid",
                    props: {columns: 1},
                    children: [
                        {
                            render: "#Field",
                            field: {
                                name: "privacyNoticeVersion",
                                widget: "#Input",
                                label: "form.privacyNoticeVersionLabel",
                                placeholder:
                                    "form.privacyNoticeVersionPlaceholder",
                                widgetProps: {
                                    maxLength: CLINIC_PRIVACY_VERSION_MAX,
                                },
                            },
                            permissions: {
                                read: "privacyNoticeVersion",
                                write: "privacyNoticeVersion",
                            },
                        },
                        {
                            render: "#Field",
                            field: {
                                name: "privacyNoticeText",
                                widget: "#Textarea",
                                label: "form.privacyNoticeTextLabel",
                                placeholder:
                                    "form.privacyNoticeTextPlaceholder",
                                widgetProps: {
                                    rows: 10,
                                    maxLength: CLINIC_PRIVACY_TEXT_MAX,
                                    className:
                                        "field-sizing-fixed max-h-96 min-h-40 overflow-y-auto",
                                },
                            },
                            permissions: {
                                read: "privacyNoticeText",
                                write: "privacyNoticeText",
                            },
                        },
                    ],
                },
            ],
        },
        {
            render: "#TitleWithCollapse",
            props: {title: "form.notificationsSectionTitle", skipRenderWhenFormExtraNotTruthy: "sectionAlerts"},
            permissions: {
                readAny: ["notifyUsers", "inquiryNotifyUsers"],
                writeAny: ["notifyUsers", "inquiryNotifyUsers"],
            },
            children: [
                {
                    render: "#Field",
                    field: {
                        name: "notifyUsers",
                        widget: "#ObjectIdChipsInput",
                        label: "form.notifyUsersLabel",
                        widgetProps: {
                            apiUrl: "/api/company/users/select",
                            postBody: {administration: true},
                            method: "POST",
                            placeholderKey: "form.selectUser",
                            removeTooltipKey: "form.removeUser",
                            selectPageSizeCreate: 50,
                            selectPageSizeEdit: 200,
                            labelRefFormExtraKey: "notifyUsers",
                        },
                    },
                    permissions: {read: "notifyUsers", write: "notifyUsers"},
                },
                {
                    render: "#Field",
                    permissions: {
                        read: "inquiryNotifyUsers",
                        write: "inquiryNotifyUsers",
                    },
                    field: {
                        name: "inquiryNotifyUsers",
                        widget: "#ObjectIdChipsInput",
                        label: "form.inquiryNotifyUsersLabel",
                        widgetProps: {
                            apiUrl: "/api/company/users/select",
                            postBody: {administration: true},
                            method: "POST",
                            placeholderKey: "form.selectUser",
                            removeTooltipKey: "form.removeUser",
                            selectPageSizeCreate: 50,
                            selectPageSizeEdit: 200,
                            labelRefFormExtraKey: "inquiryNotifyUsers",
                        },
                    },
                },
            ],
        },
        {
            render: "#TitleWithCollapse",
            props: {title: "form.inquiriesSectionTitle", skipRenderWhenFormExtraNotTruthy: "sectionInquiries"},
            permissions: {
                readAny: ["inquiriesEnabled", "responseTargetHours", "quoteValidityDays", "quoteTerms"],
                writeAny: ["inquiriesEnabled", "responseTargetHours", "quoteValidityDays", "quoteTerms"],
            },
            children: [
                {
                    render: "#FormGrid",
                    props: {columns: 2},
                    children: [
                        {
                            render: "#Field",
                            permissions: {
                                read: "inquiriesEnabled",
                                write: "inquiriesEnabled",
                            },
                            field: {
                                name: "inquiriesEnabled",
                                widget: "#Switch",
                                label: "form.inquiriesEnabledLabel",
                            },
                        },
                        {
                            render: "#Field",
                            permissions: {
                                read: "responseTargetHours",
                                write: "responseTargetHours",
                            },
                            field: {
                                name: "responseTargetHours",
                                widget: "#Input",
                                label: "form.responseTargetHoursLabel",
                                placeholder:
                                    "form.responseTargetHoursPlaceholder",
                                required: true,
                                widgetProps: {
                                    type: "number",
                                    min: CLINIC_RESPONSE_TARGET_HOURS.min,
                                    max: CLINIC_RESPONSE_TARGET_HOURS.max,
                                    step: "any",
                                },
                            },
                        },
                    ],
                },
                {
                    render: "#Field",
                    permissions: {
                        read: "quoteValidityDays",
                        write: "quoteValidityDays",
                    },
                    field: {
                        name: "quoteValidityDays",
                        widget: "#Input",
                        label: "form.quoteValidityDaysLabel",
                        placeholder: "form.quoteValidityDaysPlaceholder",
                        required: true,
                        widgetProps: {
                            type: "number",
                            min: CLINIC_QUOTE_VALIDITY_DAYS.min,
                            max: CLINIC_QUOTE_VALIDITY_DAYS.max,
                            step: 1,
                        },
                    },
                },
                {
                    render: "#Field",
                    permissions: {read: "quoteTerms", write: "quoteTerms"},
                    field: {
                        name: "quoteTerms",
                        widget: "#Textarea",
                        label: "form.quoteTermsLabel",
                        placeholder: "form.quoteTermsPlaceholder",
                        widgetProps: {
                            rows: 4,
                            maxLength: CLINIC_PROFILE_TEXT_MAX,
                        },
                    },
                },
                {render: "#FormAlert", props: {message: "form.inquiriesHint"}},
            ],
        },
        {
            render: "#TitleWithCollapse",
            props: {title: "form.tourismSectionTitle", skipRenderWhenFormExtraNotTruthy: "sectionProfile"},
            permissions: {
                readAny: [
                    "languagesSpoken",
                    "implantBrands",
                    "nearestAirport",
                    "gallery",
                    "profileTexts",
                    "accreditations",
                ],
                writeAny: [
                    "languagesSpoken",
                    "implantBrands",
                    "nearestAirport",
                    "gallery",
                    "profileTexts",
                    "accreditations",
                ],
            },
            children: [
                {
                    render: "#FormGrid",
                    props: {columns: 2},
                    children: [
                        {
                            render: "#Field",
                            permissions: {
                                read: "languagesSpoken",
                                write: "languagesSpoken",
                            },
                            field: {
                                name: "languagesSpoken",
                                widget: "#StringArrayInput",
                                label: "form.languagesSpokenLabel",
                                placeholder: "form.languagesSpokenPlaceholder",
                                widgetProps: {
                                    removeTooltipKey: "form.removeItem",
                                    maxLength: CLINIC_PROFILE_LIST_ITEM_MAX,
                                },
                            },
                        },
                        {
                            render: "#Field",
                            permissions: {
                                read: "implantBrands",
                                write: "implantBrands",
                            },
                            field: {
                                name: "implantBrands",
                                widget: "#StringArrayInput",
                                label: "form.implantBrandsLabel",
                                placeholder: "form.implantBrandsPlaceholder",
                                widgetProps: {
                                    removeTooltipKey: "form.removeItem",
                                    maxLength: CLINIC_PROFILE_LIST_ITEM_MAX,
                                },
                            },
                        },
                        {
                            render: "#Field",
                            permissions: {
                                read: "nearestAirport",
                                write: "nearestAirport",
                            },
                            field: {
                                name: "nearestAirport",
                                widget: "#Input",
                                label: "form.nearestAirportLabel",
                                placeholder: "form.nearestAirportPlaceholder",
                                widgetProps: {
                                    maxLength: CLINIC_PROFILE_LIST_ITEM_MAX,
                                },
                            },
                        },
                    ],
                },
                {
                    render: "#Field",
                    permissions: {read: "gallery", write: "gallery"},
                    field: {
                        name: "gallery",
                        widget: "#MediaField",
                        label: "form.galleryLabel",
                        widgetProps: {
                            mediaType: "image",
                            mode: "multiple",
                            maxCount: 12,
                        },
                    },
                },
                {
                    render: "#Field",
                    permissions: {read: "profileTexts", write: "profileTexts"},
                    field: {
                        name: "profileTexts",
                        widget: "#FormRepeater",
                        widgetProps: {
                            title: "form.profileTextsSectionTitle",
                            arrayField: "profileTexts",
                            defaultItem: {
                                locale: "it-IT",
                                headline: "",
                                description: "",
                                warrantyPolicy: "",
                                travelInfo: "",
                            },
                            addLabel: "form.profileTextsAddRow",
                            removeLabel: "form.profileTextsRemoveRow",
                            rowTitleFields: ["locale"],
                            rowTitlePlaceholder: "form.profileTextsRowTitle",
                            rowTemplate: [
                                {
                                    render: "#FormGrid",
                                    props: {columns: 2},
                                    children: [
                                        {
                                            render: "#Field",
                                            field: {
                                                name: "locale",
                                                widget: "#SimpleSelect",
                                                label: "form.profileLocaleLabel",
                                                required: true,
                                                widgetProps: {
                                                    options:
                                                        profileLocaleOptions,
                                                },
                                            },
                                        },
                                        {
                                            render: "#Field",
                                            field: {
                                                name: "headline",
                                                widget: "#Input",
                                                label: "form.profileHeadlineLabel",
                                                placeholder:
                                                    "form.profileHeadlinePlaceholder",
                                                widgetProps: {
                                                    maxLength:
                                                        CLINIC_PROFILE_HEADLINE_MAX,
                                                },
                                            },
                                        },
                                    ],
                                },
                                {
                                    render: "#Field",
                                    field: {
                                        name: "description",
                                        widget: "#Textarea",
                                        label: "form.profileDescriptionLabel",
                                        placeholder:
                                            "form.profileDescriptionPlaceholder",
                                        widgetProps: {
                                            rows: 4,
                                            maxLength: CLINIC_PROFILE_TEXT_MAX,
                                        },
                                    },
                                },
                                {
                                    render: "#Field",
                                    field: {
                                        name: "warrantyPolicy",
                                        widget: "#Textarea",
                                        label: "form.profileWarrantyLabel",
                                        placeholder:
                                            "form.profileWarrantyPlaceholder",
                                        widgetProps: {
                                            rows: 3,
                                            maxLength: CLINIC_PROFILE_TEXT_MAX,
                                        },
                                    },
                                },
                                {
                                    render: "#Field",
                                    field: {
                                        name: "travelInfo",
                                        widget: "#Textarea",
                                        label: "form.profileTravelLabel",
                                        placeholder:
                                            "form.profileTravelPlaceholder",
                                        widgetProps: {
                                            rows: 3,
                                            maxLength: CLINIC_PROFILE_TEXT_MAX,
                                        },
                                    },
                                },
                            ],
                        },
                    },
                },
                {
                    render: "#Field",
                    permissions: {
                        read: "accreditations",
                        write: "accreditations",
                    },
                    field: {
                        name: "accreditations",
                        widget: "#FormRepeater",
                        widgetProps: {
                            title: "form.accreditationsSectionTitle",
                            arrayField: "accreditations",
                            defaultItem: {title: "", issuer: ""},
                            addLabel: "form.accreditationsAddRow",
                            removeLabel: "form.accreditationsRemoveRow",
                            rowTitleFields: ["title"],
                            rowTitlePlaceholder: "form.accreditationsRowTitle",
                            rowTemplate: [
                                {
                                    render: "#FormGrid",
                                    props: {columns: 3},
                                    children: [
                                        {
                                            render: "#Field",
                                            field: {
                                                name: "title",
                                                widget: "#Input",
                                                label: "form.accreditationTitleLabel",
                                                placeholder:
                                                    "form.accreditationTitlePlaceholder",
                                                required: true,
                                                widgetProps: {
                                                    maxLength:
                                                        CLINIC_ACCREDITATION_TEXT_MAX,
                                                },
                                            },
                                        },
                                        {
                                            render: "#Field",
                                            field: {
                                                name: "issuer",
                                                widget: "#Input",
                                                label: "form.accreditationIssuerLabel",
                                                placeholder:
                                                    "form.accreditationIssuerPlaceholder",
                                                widgetProps: {
                                                    maxLength:
                                                        CLINIC_ACCREDITATION_TEXT_MAX,
                                                },
                                            },
                                        },
                                        {
                                            render: "#Field",
                                            field: {
                                                name: "year",
                                                widget: "#Input",
                                                label: "form.accreditationYearLabel",
                                                placeholder:
                                                    "form.accreditationYearPlaceholder",
                                                widgetProps: {
                                                    type: "number",
                                                    min: 1900,
                                                    max: 2100,
                                                    step: 1,
                                                },
                                            },
                                        },
                                    ],
                                },
                            ],
                        },
                    },
                },
            ],
        },
    ],
};

export const clinicConfigViews: ViewConfig[] = [clinicConfigEditFormView];
