import type {ViewConfig} from "armonia/src/modules/core/api/auxiliary/private/viewConfig";
import {
    CLINIC_ADVANCE_DAYS,
    CLINIC_DEADLINE_HOURS,
    CLINIC_NO_SHOW_GRACE_MINUTES,
    CLINIC_NOTICE_HOURS,
    CLINIC_PRIVACY_TEXT_MAX,
    CLINIC_PRIVACY_VERSION_MAX,
    CLINIC_REMINDER_HOURS,
    CLINIC_RETENTION_MONTHS,
    CLINIC_SLOT_INTERVAL_MINUTES,
} from "armonia/src/modules/dentalClinic/api/dentalClinic/private/clinicConfig/clinicConfig.schema-def";

const API_URL = "/api/dentalClinic/clinicConfig";

/** Settings are edited in place from the settings page; there is no create form or sheet. */
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
            props: {title: "form.bookingSectionTitle"},
            permissions: {
                readAny: [
                    "publicBookingEnabled",
                    "listedOnPortal",
                    "guestBookingAllowed",
                    "requireStaffConfirmation",
                    "currency",
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
                    "currency",
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
                            permissions: {read: "currency", write: "currency"},
                            field: {
                                name: "currency",
                                widget: "#ApiSelect",
                                label: "form.currencyLabel",
                                placeholder: "form.currencyPlaceholder",
                                required: true,
                                widgetProps: {
                                    apiUrl: "/api/finance/currency/select",
                                    method: "POST",
                                    pageSize: 50,
                                },
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
            render: "#TitleWithCollapse",
            props: {title: "form.patientSectionTitle"},
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
            props: {title: "form.privacySectionTitle"},
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
            props: {title: "form.notificationsSectionTitle"},
            permissions: {readAny: ["notifyUsers"], writeAny: ["notifyUsers"]},
            children: [
                {
                    render: "#Field",
                    field: {
                        name: "notifyUsers",
                        widget: "#ObjectIdChipsInput",
                        label: "form.notifyUsersLabel",
                        widgetProps: {
                            apiUrl: "/api/company/users/select",
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
            ],
        },
    ],
};

export const clinicConfigViews: ViewConfig[] = [clinicConfigEditFormView];
