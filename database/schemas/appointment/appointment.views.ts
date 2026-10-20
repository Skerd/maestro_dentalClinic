import type {ViewConfig} from "armonia/src/modules/core/api/auxiliary/private/viewConfig";
import {lifecycleSheetGroup} from "@coreModule/database/schemas/shared/lifecycleSheetGroup";
import {
    APPOINTMENT_NOTE_MAX,
    APPOINTMENT_PATIENT_NAME_MAX,
    APPOINTMENT_PATIENT_PHONE_MAX,
} from "armonia/src/modules/dentalClinic/api/dentalClinic/private/appointment/appointment.constants";

const API_URL = "/api/dentalClinic/appointment";

export const appointmentSheetView: ViewConfig = {
    model: "appointments",
    viewType: "sheet",
    accessModel: "appointments",
    apiUrl: API_URL,
    header: {titleField: "number", subtitleKey: "appointmentSubtitle", showCloseButton: true},
    nodes: [
        {
            render: "#SheetGroup",
            props: {title: "overview"},
            children: [
                {
                    render: "#SheetGrid",
                    props: {columns: 3},
                    children: [
                        {render: "#DisplayCard", permissions: {read: "status"}, field: {name: "status", widget: "#DisplayCard", label: "status", widgetProps: {icon: "#IconStatusChange", type: "enum", languageKeyCategory: "statusValues"}}},
                        {render: "#DisplayCard", permissions: {read: "startAt"}, field: {name: "startAt", widget: "#DisplayCard", label: "startAt", widgetProps: {icon: "#IconCalendarEvent", type: "dateTime"}}},
                        {render: "#DisplayCard", permissions: {read: "endAt"}, field: {name: "endAt", widget: "#DisplayCard", label: "endAt", widgetProps: {icon: "#IconCalendarEvent", type: "dateTime"}}},
                        {render: "#DisplayCard", permissions: {read: "service"}, field: {name: "service.name", widget: "#DisplayCard", label: "service", widgetProps: {icon: "#IconDental"}}},
                        {render: "#DisplayCard", permissions: {read: "practitioner"}, field: {name: "practitioner.displayName", widget: "#DisplayCard", label: "practitioner", widgetProps: {icon: "#IconStethoscope"}}},
                        {render: "#DisplayCard", permissions: {read: "location"}, field: {name: "location.name", widget: "#DisplayCard", label: "location", widgetProps: {icon: "#IconMapPin"}}},
                        {render: "#DisplayCard", permissions: {read: "source"}, field: {name: "source", widget: "#DisplayCard", label: "source", widgetProps: {icon: "#IconWorld", type: "enum", languageKeyCategory: "sourceValues"}}},
                        {render: "#DisplayCard", permissions: {read: "customer"}, field: {name: "customer.name", widget: "#DisplayCard", label: "customer", widgetProps: {icon: "#IconUser"}}},
                        {render: "#DisplayCard", permissions: {read: "rescheduleCount"}, field: {name: "rescheduleCount", widget: "#DisplayCard", label: "rescheduleCount", widgetProps: {icon: "#IconCalendarRepeat", type: "number"}}},
                    ],
                },
            ],
        },
        {
            render: "#SheetGroup",
            props: {title: "patient"},
            permissions: {read: "patient"},
            children: [
                {
                    render: "#SheetGrid",
                    props: {columns: 2},
                    children: [
                        {render: "#DisplayCard", permissions: {read: "patient"}, field: {name: "patient.firstName", widget: "#DisplayCard", label: "firstName", widgetProps: {icon: "#IconUser"}}},
                        {render: "#DisplayCard", permissions: {read: "patient"}, field: {name: "patient.lastName", widget: "#DisplayCard", label: "lastName", widgetProps: {icon: "#IconUser"}}},
                        {render: "#DisplayCard", permissions: {read: "patient"}, field: {name: "patient.email", widget: "#DisplayCard", label: "email", widgetProps: {icon: "#IconMail"}}},
                        {render: "#DisplayCard", permissions: {read: "patient"}, field: {name: "patient.phone", widget: "#DisplayCard", label: "phone", widgetProps: {icon: "#Phone"}}},
                    ],
                },
                {render: "#DisplayCard", permissions: {read: "note"}, field: {name: "note", widget: "#DisplayCard", label: "note", widgetProps: {icon: "#IconNotes"}}},
            ],
        },
        {
            render: "#SheetGroup",
            props: {title: "booked"},
            permissions: {read: "snapshot"},
            children: [
                {
                    render: "#SheetGrid",
                    props: {columns: 3},
                    children: [
                        {render: "#DisplayCard", permissions: {read: "snapshot"}, field: {name: "snapshot.serviceName", widget: "#DisplayCard", label: "serviceName", widgetProps: {icon: "#IconDental"}}},
                        {render: "#DisplayCard", permissions: {read: "snapshot"}, field: {name: "snapshot.durationMinutes", widget: "#DisplayCard", label: "durationMinutes", widgetProps: {icon: "#IconClock", type: "number"}}},
                        {render: "#DisplayCard", permissions: {read: "snapshot"}, field: {name: "snapshot.priceType", widget: "#DisplayCard", label: "priceType", widgetProps: {icon: "#IconTag", type: "enum", languageKeyCategory: "priceTypeValues"}}},
                        {render: "#DisplayCard", permissions: {read: "snapshot"}, field: {name: "snapshot.price", widget: "#DisplayCard", label: "price", widgetProps: {icon: "#IconCash", type: "number"}}},
                        {render: "#DisplayCard", permissions: {read: "snapshot"}, field: {name: "snapshot.timezone", widget: "#DisplayCard", label: "timezone", widgetProps: {icon: "#IconClock"}}},
                        {render: "#DisplayCard", permissions: {read: "consent"}, field: {name: "consent.version", widget: "#DisplayCard", label: "consentVersion", widgetProps: {icon: "#IconShieldCheck"}}},
                    ],
                },
            ],
        },
        {
            render: "#SheetGroup",
            props: {title: "timeline", defaultOpen: false},
            permissions: {read: "timeline"},
            children: [
                {
                    render: "#SheetEmbeddedItemsList",
                    permissions: {read: "timeline"},
                    field: {
                        name: "timeline",
                        widget: "#SheetEmbeddedItemsList",
                        widgetProps: {
                            cardColumns: 1,
                            sortField: "at",
                            fields: [
                                {name: "event", type: "text", languageKeyCategory: "timelineEvent", labelKey: "event", className: "text-sm font-medium"},
                                {name: "at", type: "text", format: "dateTime", labelKey: "at", className: "text-sm"},
                                {name: "note", type: "text", labelKey: "note", className: "text-sm"},
                            ],
                            compactSummaryFields: ["event", "at"],
                            compactSummaryJoinSeparator: " · ",
                        },
                    },
                },
            ],
        },
        lifecycleSheetGroup,
    ],
};

/** Staff booking (phone, front desk). Immutable after create — every change is an action. */
export const appointmentCreateFormView: ViewConfig = {
    model: "appointments",
    viewType: "form",
    viewMode: "create",
    accessModel: "appointments",
    apiUrl: API_URL,
    method: "PUT",
    nodes: [
        {
            render: "#TitleWithCollapse",
            props: {title: "form.visitSectionTitle"},
            children: [
                {
                    render: "#FormGrid",
                    props: {columns: 2},
                    children: [
                        {render: "#Field", field: {name: "service", widget: "#ApiSelect", label: "form.serviceLabel", placeholder: "form.servicePlaceholder", required: true, widgetProps: {apiUrl: "/api/dentalClinic/clinicService/select", method: "POST", pageSize: 50, normalizeEmptyToUndefined: true, cascadeClearFormFields: ["practitioner"]}}},
                        {render: "#Field", field: {name: "location", widget: "#ApiSelect", label: "form.locationLabel", placeholder: "form.locationPlaceholder", required: true, widgetProps: {apiUrl: "/api/dentalClinic/clinicLocation/select", method: "POST", pageSize: 50, normalizeEmptyToUndefined: true, cascadeClearFormFields: ["practitioner"]}}},
                        {
                            render: "#Field",
                            field: {
                                name: "practitioner",
                                widget: "#ApiSelect",
                                label: "form.practitionerLabel",
                                placeholder: "form.practitionerPlaceholder",
                                required: true,
                                widgetProps: {
                                    apiUrl: "/api/dentalClinic/practitioner/select",
                                    method: "POST",
                                    pageSize: 50,
                                    normalizeEmptyToUndefined: true,
                                    postBodyFromFormFields: [{field: "service", paramName: "service"}, {field: "location", paramName: "location"}],
                                    enableWhenFormFieldsNonEmpty: ["service", "location"],
                                },
                            },
                        },
                        {render: "#Field", field: {name: "date", widget: "#DateInput", label: "form.dateLabel", required: true, widgetProps: {valueFormat: "yyyy-MM-dd"}}},
                        {render: "#Field", field: {name: "time", widget: "#DateInput", label: "form.timeLabel", required: true, widgetProps: {valueFormat: "HH:mm", timeOnly: true}}},
                    ],
                },
                {render: "#FormAlert", props: {message: "form.localTimeHint"}},
            ],
        },
        {
            render: "#TitleWithCollapse",
            props: {title: "form.patientSectionTitle"},
            children: [
                {
                    render: "#FormGrid",
                    props: {columns: 2},
                    children: [
                        {render: "#Field", field: {name: "patient.firstName", widget: "#Input", label: "form.firstNameLabel", placeholder: "form.firstNamePlaceholder", required: true, widgetProps: {maxLength: APPOINTMENT_PATIENT_NAME_MAX}}},
                        {render: "#Field", field: {name: "patient.lastName", widget: "#Input", label: "form.lastNameLabel", placeholder: "form.lastNamePlaceholder", required: true, widgetProps: {maxLength: APPOINTMENT_PATIENT_NAME_MAX}}},
                        {render: "#Field", field: {name: "patient.email", widget: "#Input", label: "form.emailLabel", placeholder: "form.emailPlaceholder", required: true, widgetProps: {type: "email"}}},
                        {render: "#Field", field: {name: "patient.phone", widget: "#Input", label: "form.phoneLabel", placeholder: "form.phonePlaceholder", required: true, widgetProps: {maxLength: APPOINTMENT_PATIENT_PHONE_MAX}}},
                        {render: "#Field", field: {name: "customer", widget: "#ApiSelect", label: "form.customerLabel", placeholder: "form.customerPlaceholder", widgetProps: {apiUrl: "/api/company/users/select", method: "POST", pageSize: 50, normalizeEmptyToUndefined: true}}},
                    ],
                },
                {render: "#Field", field: {name: "note", widget: "#Textarea", label: "form.noteLabel", placeholder: "form.notePlaceholder", widgetProps: {rows: 3, maxLength: APPOINTMENT_NOTE_MAX}}},
                {render: "#FormAlert", props: {message: "form.noteHint"}},
            ],
        },
    ],
};

export const appointmentViews: ViewConfig[] = [appointmentSheetView, appointmentCreateFormView];
