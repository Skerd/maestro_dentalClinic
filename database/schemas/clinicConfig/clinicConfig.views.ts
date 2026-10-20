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

const numberField = (name: string, {min, max}: {min: number; max: number}) => ({
    render: "#Field",
    field: {
        name,
        widget: "#Input",
        label: `form.${name}Label`,
        placeholder: `form.${name}Placeholder`,
        required: true,
        widgetProps: {type: "number", min, max},
    },
    permissions: {read: name, write: name},
});

const switchField = (name: string) => ({
    render: "#Field",
    field: {name, widget: "#Switch", label: `form.${name}Label`},
    permissions: {read: name, write: name},
});

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
            children: [
                {
                    render: "#FormGrid",
                    props: {columns: 3},
                    children: [
                        switchField("publicBookingEnabled"),
                        switchField("guestBookingAllowed"),
                        switchField("requireStaffConfirmation"),
                        {
                            render: "#Field",
                            field: {
                                name: "currency",
                                widget: "#ApiSelect",
                                label: "form.currencyLabel",
                                placeholder: "form.currencyPlaceholder",
                                required: true,
                                widgetProps: {apiUrl: "/api/finance/currency/select", method: "POST", pageSize: 50},
                            },
                            permissions: {read: "currency", write: "currency"},
                        },
                        numberField("slotIntervalMinutes", CLINIC_SLOT_INTERVAL_MINUTES),
                        numberField("minNoticeHours", CLINIC_NOTICE_HOURS),
                        numberField("maxAdvanceDays", CLINIC_ADVANCE_DAYS),
                        numberField("cancellationDeadlineHours", CLINIC_DEADLINE_HOURS),
                        numberField("rescheduleDeadlineHours", CLINIC_DEADLINE_HOURS),
                        numberField("noShowGraceMinutes", CLINIC_NO_SHOW_GRACE_MINUTES),
                    ],
                },
            ],
        },
        {
            render: "#TitleWithCollapse",
            props: {title: "form.patientSectionTitle"},
            children: [
                {
                    render: "#FormGrid",
                    props: {columns: 3},
                    children: [
                        switchField("patientNoteEnabled"),
                        switchField("includeServiceInMessages"),
                        switchField("reminderSms"),
                        numberField("reminderHoursBefore", CLINIC_REMINDER_HOURS),
                        numberField("retentionMonths", CLINIC_RETENTION_MONTHS),
                    ],
                },
            ],
        },
        {
            render: "#TitleWithCollapse",
            props: {title: "form.privacySectionTitle"},
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
                                placeholder: "form.privacyNoticeVersionPlaceholder",
                                widgetProps: {maxLength: CLINIC_PRIVACY_VERSION_MAX},
                            },
                            permissions: {read: "privacyNoticeVersion", write: "privacyNoticeVersion"},
                        },
                        {
                            render: "#Field",
                            field: {
                                name: "privacyNoticeText",
                                widget: "#Textarea",
                                label: "form.privacyNoticeTextLabel",
                                placeholder: "form.privacyNoticeTextPlaceholder",
                                widgetProps: {rows: 10, maxLength: CLINIC_PRIVACY_TEXT_MAX, className: "field-sizing-fixed max-h-96 min-h-40 overflow-y-auto"},
                            },
                            permissions: {read: "privacyNoticeText", write: "privacyNoticeText"},
                        },
                    ],
                },
            ],
        },
        {
            render: "#TitleWithCollapse",
            props: {title: "form.notificationsSectionTitle"},
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
