import type {ViewConfig} from "armonia/src/modules/core/api/auxiliary/private/viewConfig";
import {lifecycleSheetGroup} from "@coreModule/database/schemas/shared/lifecycleSheetGroup";
import {SCHEDULE_EXCEPTION_NOTE_MAX} from "armonia/src/modules/dentalClinic/api/dentalClinic/private/scheduleException/scheduleException.schema-def";

const API_URL = "/api/dentalClinic/scheduleException";

export const scheduleExceptionSheetView: ViewConfig = {
    model: "scheduleexceptions",
    viewType: "sheet",
    accessModel: "scheduleexceptions",
    apiUrl: API_URL,
    header: {
        titleField: "practitioner.displayName",
        subtitleKey: "scheduleExceptionSubtitle",
        showCloseButton: true,
    },
    nodes: [
        {
            render: "#SheetGroup",
            props: {title: "overview"},
            children: [
                {
                    render: "#SheetGrid",
                    props: {columns: 2},
                    children: [
                        {
                            render: "#DisplayCard",
                            permissions: {read: "practitioner"},
                            field: {
                                name: "practitioner.displayName",
                                widget: "#DisplayCard",
                                label: "practitioner",
                                widgetProps: {icon: "#IconStethoscope"},
                            },
                        },
                        {
                            render: "#DisplayCard",
                            permissions: {read: "location"},
                            field: {
                                name: "location.name",
                                widget: "#DisplayCard",
                                label: "location",
                                widgetProps: {icon: "#IconMapPin"},
                            },
                        },
                        {
                            render: "#DisplayCard",
                            permissions: {read: "startAt"},
                            field: {
                                name: "startAt",
                                widget: "#DisplayCard",
                                label: "startAt",
                                widgetProps: {
                                    icon: "#IconCalendarEvent",
                                    type: "dateTime",
                                },
                            },
                        },
                        {
                            render: "#DisplayCard",
                            permissions: {read: "endAt"},
                            field: {
                                name: "endAt",
                                widget: "#DisplayCard",
                                label: "endAt",
                                widgetProps: {
                                    icon: "#IconCalendarEvent",
                                    type: "dateTime",
                                },
                            },
                        },
                    ],
                },
                {
                    render: "#DisplayCard",
                    permissions: {read: "internalNote"},
                    field: {
                        name: "internalNote",
                        widget: "#DisplayCard",
                        label: "internalNote",
                        widgetProps: {icon: "#IconNotes"},
                    },
                },
            ],
        },
        lifecycleSheetGroup,
    ],
};

export const scheduleExceptionCreateFormView: ViewConfig = {
    model: "scheduleexceptions",
    viewType: "form",
    viewMode: "create",
    accessModel: "scheduleexceptions",
    apiUrl: API_URL,
    method: "PUT",
    nodes: [
        {
            render: "#FormGrid",
            props: {columns: 2},
            children: [
                {
                    render: "#Field",
                    field: {
                        name: "practitioner",
                        widget: "#ApiSelect",
                        label: "form.practitionerLabel",
                        placeholder: "form.practitionerPlaceholder",
                        widgetProps: {
                            apiUrl: "/api/dentalClinic/practitioner/select",
                            method: "POST",
                            pageSize: 50,
                            normalizeEmptyToUndefined: true,
                        },
                    },
                },
                {
                    render: "#Field",
                    field: {
                        name: "location",
                        widget: "#ApiSelect",
                        label: "form.locationLabel",
                        placeholder: "form.locationPlaceholder",
                        widgetProps: {
                            apiUrl: "/api/dentalClinic/clinicLocation/select",
                            method: "POST",
                            pageSize: 50,
                            normalizeEmptyToUndefined: true,
                        },
                    },
                },
                {
                    render: "#Field",
                    field: {
                        name: "startAt",
                        widget: "#DateInput",
                        label: "form.startAtLabel",
                        placeholder: "form.startAtPlaceholder",
                        required: true,
                        widgetProps: {valueFormat: "yyyy-MM-dd HH:mm"},
                    },
                },
                {
                    render: "#Field",
                    field: {
                        name: "endAt",
                        widget: "#DateInput",
                        label: "form.endAtLabel",
                        placeholder: "form.endAtPlaceholder",
                        required: true,
                        widgetProps: {valueFormat: "yyyy-MM-dd HH:mm"},
                    },
                },
            ],
        },
        {render: "#FormAlert", props: {message: "form.targetHint"}},
        {
            render: "#Field",
            field: {
                name: "internalNote",
                widget: "#Textarea",
                label: "form.internalNoteLabel",
                placeholder: "form.internalNotePlaceholder",
                widgetProps: {rows: 3, maxLength: SCHEDULE_EXCEPTION_NOTE_MAX},
            },
        },
    ],
};

/** The window is fixed once created (it was checked against appointments); only the note changes. */
export const scheduleExceptionEditFormView: ViewConfig = {
    model: "scheduleexceptions",
    viewType: "form",
    viewMode: "edit",
    accessModel: "scheduleexceptions",
    apiUrl: API_URL,
    method: "PATCH",
    nodes: [
        {
            render: "#Field",
            permissions: {read: "internalNote", write: "internalNote"},
            field: {
                name: "internalNote",
                widget: "#Textarea",
                label: "form.internalNoteLabel",
                placeholder: "form.internalNotePlaceholder",
                widgetProps: {rows: 3, maxLength: SCHEDULE_EXCEPTION_NOTE_MAX},
            },
        },
    ],
};

export const scheduleExceptionViews: ViewConfig[] = [
    scheduleExceptionSheetView,
    scheduleExceptionCreateFormView,
    scheduleExceptionEditFormView,
];
