import type {ViewConfig} from "armonia/src/modules/core/api/auxiliary/private/viewConfig";
import {lifecycleSheetGroup} from "@coreModule/database/schemas/shared/lifecycleSheetGroup";
import {
    PRACTITIONER_BIO_MAX,
    PRACTITIONER_LANGUAGE_MAX,
    PRACTITIONER_NAME_MAX,
    PRACTITIONER_ROLES,
    PRACTITIONER_TITLE_MAX,
} from "armonia/src/modules/dentalClinic/api/dentalClinic/private/practitioner/practitioner.schema-def";

const API_URL = "/api/dentalClinic/practitioner";

const roleOptions = PRACTITIONER_ROLES.map((value) => ({value, label: `form.role.${value}`}));
const weekdayOptions = ["0", "1", "2", "3", "4", "5", "6"].map((value) => ({value, label: `weekday.${value}`}));

const nameList = (name: string) => ({
    render: "#SheetGroup",
    props: {title: name},
    dependent: name,
    permissions: {read: name},
    children: [
        {
            render: "#SheetEmbeddedItemsList",
            permissions: {read: name},
            field: {
                name,
                widget: "#SheetEmbeddedItemsList",
                widgetProps: {cardColumns: 3, fields: [{name: "name", type: "text", className: "text-sm font-medium"}], compactSummaryFields: ["name"]},
            },
        },
    ],
});

export const practitionerSheetView: ViewConfig = {
    model: "practitioners",
    viewType: "sheet",
    accessModel: "practitioners",
    apiUrl: API_URL,
    header: {titleField: "displayName", subtitleKey: "practitionerSubtitle", showCloseButton: true},
    nodes: [
        {
            render: "#SheetGroup",
            props: {title: "overview"},
            children: [
                {
                    render: "#SheetGrid",
                    props: {columns: 3},
                    children: [
                        {render: "#DisplayCard", permissions: {read: "title"}, field: {name: "title", widget: "#DisplayCard", label: "title", widgetProps: {icon: "#IconCertificate"}}},
                        {render: "#DisplayCard", permissions: {read: "role"}, field: {name: "role", widget: "#DisplayCard", label: "role", widgetProps: {icon: "#IconStethoscope", type: "enum", languageKeyCategory: "roleValues"}}},
                        {render: "#DisplayCard", permissions: {read: "staffUser"}, field: {name: "staffUser.name", widget: "#DisplayCard", label: "staffUser", widgetProps: {icon: "#IconUser"}}},
                        {render: "#DisplayCard", permissions: {read: "languages"}, field: {name: "languages", widget: "#DisplayCard", label: "languages", widgetProps: {icon: "#IconLanguage"}}},
                        {render: "#DisplayCard", permissions: {read: "isBookable"}, field: {name: "isBookable", widget: "#DisplayCard", label: "isBookable", widgetProps: {icon: "#IconCalendarCheck", type: "boolean"}}},
                        {render: "#DisplayCard", permissions: {read: "isActive"}, field: {name: "isActive", widget: "#DisplayCard", label: "isActive", widgetProps: {icon: "#IconToggleRight", type: "boolean"}}},
                    ],
                },
                {render: "#DisplayCard", permissions: {read: "bio"}, field: {name: "bio", widget: "#DisplayCard", label: "bio", widgetProps: {icon: "#IconAlignLeft"}}},
            ],
        },
        nameList("services"),
        nameList("locations"),
        {
            render: "#SheetGroup",
            props: {title: "schedule"},
            dependent: "schedule",
            permissions: {read: "schedule"},
            children: [
                {
                    render: "#SheetEmbeddedItemsList",
                    permissions: {read: "schedule"},
                    field: {
                        name: "schedule",
                        widget: "#SheetEmbeddedItemsList",
                        widgetProps: {
                            cardColumns: 3,
                            fields: [
                                {name: "location.name", type: "text", labelKey: "location", className: "text-sm font-medium"},
                                {name: "dayOfWeek", type: "text", languageKeyCategory: "weekday", labelKey: "dayOfWeek", className: "text-sm"},
                                {name: "startTime", type: "text", labelKey: "startTime", className: "text-sm"},
                                {name: "endTime", type: "text", labelKey: "endTime", className: "text-sm"},
                            ],
                            compactSummaryFields: ["dayOfWeek", "startTime", "endTime"],
                            compactSummaryJoinSeparator: " - ",
                        },
                    },
                },
            ],
        },
        lifecycleSheetGroup,
    ],
};

function practitionerFormNodes(edit: boolean): ViewConfig["nodes"] {
    const perm = (name: string) => (edit ? {permissions: {read: name, write: name}} : {});
    const chips = (name: string, apiUrl: string) => ({
        render: "#Field",
        ...perm(name),
        field: {
            name,
            widget: "#ObjectIdChipsInput",
            label: `form.${name}Label`,
            widgetProps: {
                apiUrl,
                method: "POST",
                placeholderKey: `form.${name}Placeholder`,
                removeTooltipKey: "form.removeItem",
                selectPageSizeCreate: 50,
                selectPageSizeEdit: 200,
                labelRefFormExtraKey: name,
            },
        },
    });
    const toggle = (name: string) => ({render: "#Field", ...perm(name), field: {name, widget: "#Switch", label: `form.${name}Label`}});
    return [
        {
            render: "#FormGrid",
            props: {columns: 2},
            children: [
                {render: "#Field", ...perm("displayName"), field: {name: "displayName", widget: "#Input", label: "form.displayNameLabel", placeholder: "form.displayNamePlaceholder", required: true, widgetProps: {maxLength: PRACTITIONER_NAME_MAX}}},
                {render: "#Field", ...perm("title"), field: {name: "title", widget: "#Input", label: "form.titleLabel", placeholder: "form.titlePlaceholder", widgetProps: {maxLength: PRACTITIONER_TITLE_MAX}}},
                {render: "#Field", ...perm("role"), field: {name: "role", widget: "#Select", label: "form.roleLabel", placeholder: "form.rolePlaceholder", required: true, widgetProps: {options: roleOptions, className: "grow w-full"}}},
                {
                    render: "#Field",
                    ...perm("staffUser"),
                    field: {name: "staffUser", widget: "#ApiSelect", label: "form.staffUserLabel", placeholder: "form.staffUserPlaceholder", widgetProps: {apiUrl: "/api/company/users/select", method: "POST", pageSize: 50}},
                },
            ],
        },
        {
            render: "#Field",
            ...perm("photo"),
            field: {name: "photo", widget: "#MediaField", label: "form.photoLabel", widgetProps: {mediaType: "image", mode: "single"}},
        },
        {
            render: "#Field",
            ...perm("bio"),
            field: {name: "bio", widget: "#Textarea", label: "form.bioLabel", placeholder: "form.bioPlaceholder", widgetProps: {rows: 5, maxLength: PRACTITIONER_BIO_MAX, className: "field-sizing-fixed max-h-56 min-h-24 overflow-y-auto"}},
        },
        {
            render: "#Field",
            ...perm("languages"),
            field: {name: "languages", widget: "#StringArrayInput", label: "form.languagesLabel", placeholder: "form.languagesPlaceholder", widgetProps: {removeTooltipKey: "form.removeItem", maxLength: PRACTITIONER_LANGUAGE_MAX}},
        },
        {
            render: "#TitleWithCollapse",
            props: {title: "form.eligibilitySectionTitle"},
            children: [
                chips("services", "/api/dentalClinic/clinicService/select"),
                chips("locations", "/api/dentalClinic/clinicLocation/select"),
            ],
        },
        {
            render: "#Field",
            ...(edit ? {permissions: {write: "schedule"}} : {}),
            field: {
                name: "schedule",
                widget: "#FormRepeater",
                widgetProps: {
                    title: "form.scheduleSectionTitle",
                    arrayField: "schedule",
                    defaultItem: {location: "", dayOfWeek: "1", startTime: "08:00", endTime: "17:00"},
                    addLabel: "form.scheduleAddRow",
                    removeLabel: "form.scheduleRemoveRow",
                    rowTitleFields: ["dayOfWeek", "startTime", "endTime"],
                    rowTitleSeparators: [" ", " - "],
                    rowTitlePlaceholder: "form.scheduleRowTitle",
                    rowTemplate: [
                        {
                            render: "#FormGrid",
                            props: {columns: 4},
                            children: [
                                {render: "#Field", field: {name: "location", widget: "#ApiSelect", label: "form.scheduleLocationLabel", placeholder: "form.scheduleLocationPlaceholder", required: true, widgetProps: {apiUrl: "/api/dentalClinic/clinicLocation/select", method: "POST", pageSize: 50}}},
                                {render: "#Field", field: {name: "dayOfWeek", widget: "#SimpleSelect", label: "form.dayOfWeekLabel", required: true, widgetProps: {options: weekdayOptions}}},
                                {render: "#Field", field: {name: "startTime", widget: "#DateInput", label: "form.startTimeLabel", required: true, widgetProps: {valueFormat: "HH:mm", timeOnly: true}}},
                                {render: "#Field", field: {name: "endTime", widget: "#DateInput", label: "form.endTimeLabel", required: true, widgetProps: {valueFormat: "HH:mm", timeOnly: true}}},
                            ],
                        },
                    ],
                },
            },
        },
        {
            render: "#FormGrid",
            props: {columns: 3},
            children: [
                toggle("isBookable"),
                toggle("isActive"),
                {render: "#Field", ...perm("sortOrder"), field: {name: "sortOrder", widget: "#Input", label: "form.sortOrderLabel", placeholder: "form.sortOrderPlaceholder", widgetProps: {type: "number", min: 0}}},
            ],
        },
    ];
}

export const practitionerCreateFormView: ViewConfig = {
    model: "practitioners",
    viewType: "form",
    viewMode: "create",
    accessModel: "practitioners",
    apiUrl: API_URL,
    method: "PUT",
    nodes: practitionerFormNodes(false),
};

export const practitionerEditFormView: ViewConfig = {
    model: "practitioners",
    viewType: "form",
    viewMode: "edit",
    accessModel: "practitioners",
    apiUrl: API_URL,
    method: "PATCH",
    nodes: practitionerFormNodes(true),
};

export const practitionerViews: ViewConfig[] = [practitionerSheetView, practitionerCreateFormView, practitionerEditFormView];
