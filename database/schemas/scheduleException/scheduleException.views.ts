import type {ViewConfig} from "armonia/src/modules/core/api/auxiliary/private/viewConfig";
import {lifecycleSheetGroup} from "@coreModule/database/schemas/shared/lifecycleSheetGroup";
import {SCHEDULE_EXCEPTION_NOTE_MAX, SCHEDULE_EXCEPTION_REASONS} from "armonia/src/modules/dentalClinic/api/dentalClinic/private/scheduleException/scheduleException.schema-def";

const reasonOptions = SCHEDULE_EXCEPTION_REASONS.map((value) => ({
    value,
    label: `form.reason.${value}`,
}));

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
                            dependent: "practitioner.displayName",
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
                            dependent: "location.name",
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
                        {
                            render: "#DisplayCard",
                            permissions: {read: "reason"},
                            dependent: "reason",
                            field: {
                                name: "reason",
                                widget: "#DisplayCard",
                                label: "reason",
                                widgetProps: {
                                    icon: "#IconTag",
                                    type: "enum",
                                    languageKeyCategory: "reasonValues",
                                },
                            },
                        },
                    ],
                },
                {
                    render: "#DisplayCard",
                    permissions: {read: "internalNote"},
                    dependent: "internalNote",
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
            render: "#TitleWithCollapse",
            props: {title: "form.whoSectionTitle"},
            children: [
                {
                    render: "#FormGrid",
                    props: {columns: 2},
                    children: [
                        {
                            // A dentist's time off, or a whole location closing: one or the other (UX-05).
                            render: "#FormWhenFieldValueIn",
                            props: {watchField: "location", whenValues: [""]},
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
                            ],
                        },
                        {
                            render: "#FormWhenFieldValueIn",
                            props: {watchField: "practitioner", whenValues: [""]},
                            children: [
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
                            ],
                        },
                    ],
                },
                {render: "#FormAlert", props: {message: "form.targetHint"}},
            ],
        },
        {
            render: "#TitleWithCollapse",
            props: {title: "form.whenSectionTitle"},
            children: [
                {
                    render: "#FormGrid",
                    props: {columns: 3},
                    children: [
                        {
                            render: "#Field",
                            field: {
                                name: "startAt",
                                widget: "#DateInput",
                                label: "form.startAtLabel",
                                placeholder: "form.startAtPlaceholder",
                                required: true,
                                widgetProps: {valueFormat: "YYYY-MM-DD HH:mm"},
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
                                widgetProps: {valueFormat: "YYYY-MM-DD HH:mm"},
                            },
                        },
                        {
                            render: "#Field",
                            field: {
                                name: "reason",
                                widget: "#Select",
                                label: "form.reasonLabel",
                                placeholder: "form.reasonPlaceholder",
                                widgetProps: {options: reasonOptions, className: "grow w-full"},
                            },
                        },
                    ],
                },
            ],
        },
        {
            render: "#TitleWithCollapse",
            props: {title: "form.noteSectionTitle"},
            children: [
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
        },
    ],
};

/** Who it is for stays fixed; the window can be moved (checked against appointments again), with its reason and note. */
export const scheduleExceptionEditFormView: ViewConfig = {
    model: "scheduleexceptions",
    viewType: "form",
    viewMode: "edit",
    accessModel: "scheduleexceptions",
    apiUrl: API_URL,
    method: "PATCH",
    nodes: [
        {
            render: "#TitleWithCollapse",
            props: {title: "form.whenSectionTitle"},
            permissions: {readAny: ["startAt", "endAt", "reason"], writeAny: ["startAt", "endAt", "reason"]},
            children: [
                {
                    render: "#FormGrid",
                    props: {columns: 3},
                    children: [
                        {
                            render: "#Field",
                            permissions: {read: "startAt", write: "startAt"},
                            field: {
                                name: "startAt",
                                widget: "#DateInput",
                                label: "form.startAtLabel",
                                placeholder: "form.startAtPlaceholder",
                                required: true,
                                widgetProps: {valueFormat: "YYYY-MM-DD HH:mm"},
                            },
                        },
                        {
                            render: "#Field",
                            permissions: {read: "endAt", write: "endAt"},
                            field: {
                                name: "endAt",
                                widget: "#DateInput",
                                label: "form.endAtLabel",
                                placeholder: "form.endAtPlaceholder",
                                required: true,
                                widgetProps: {valueFormat: "YYYY-MM-DD HH:mm"},
                            },
                        },
                        {
                            render: "#Field",
                            permissions: {read: "reason", write: "reason"},
                            field: {
                                name: "reason",
                                widget: "#Select",
                                label: "form.reasonLabel",
                                placeholder: "form.reasonPlaceholder",
                                widgetProps: {options: reasonOptions, className: "grow w-full"},
                            },
                        },
                    ],
                },
                {render: "#FormAlert", props: {message: "form.moveHint"}},
            ],
        },
        {
            render: "#TitleWithCollapse",
            props: {title: "form.noteSectionTitle"},
            permissions: {readAny: ["internalNote"], writeAny: ["internalNote"]},
            children: [
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
        },
    ],
};

export const scheduleExceptionViews: ViewConfig[] = [
    scheduleExceptionSheetView,
    scheduleExceptionCreateFormView,
    scheduleExceptionEditFormView,
];
