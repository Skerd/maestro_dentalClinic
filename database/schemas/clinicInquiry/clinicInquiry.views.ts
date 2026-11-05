import type {ViewConfig} from "armonia/src/modules/core/api/auxiliary/private/viewConfig";
import {lifecycleSheetGroup} from "@coreModule/database/schemas/shared/lifecycleSheetGroup";
import {
    INQUIRY_DESCRIPTION_MAX,
    PATIENT_LANGUAGES,
    PATIENT_SOURCES,
    TREATMENT_CATEGORIES,
} from "armonia/src/modules/dentalClinic/constants";
import {
    PATIENT_NAME_MAX,
    PATIENT_PHONE_MAX,
} from "armonia/src/modules/dentalClinic/api/dentalClinic/private/patient/patient.schema-def";

const API_URL = "/api/dentalClinic/clinicInquiry";

const languageOptions = PATIENT_LANGUAGES.map((value) => ({
    value,
    label: `form.language.${value}`,
}));

const sourceOptions = PATIENT_SOURCES.map((value) => ({
    value,
    label: `form.source.${value}`,
}));

const treatmentOptions = TREATMENT_CATEGORIES.map((value) => ({
    value,
    label: `form.treatment.${value}`,
}));

export const clinicInquirySheetView: ViewConfig = {
    model: "clinicinquiries",
    viewType: "sheet",
    accessModel: "clinicinquiries",
    apiUrl: API_URL,
    header: {
        titleField: "number",
        subtitleKey: "inquirySubtitle",
        showCloseButton: true,
    },
    nodes: [
        {
            render: "#SheetGroup",
            props: {title: "overview"},
            children: [
                {
                    render: "#SheetGrid",
                    props: {columns: 3},
                    children: [
                        {
                            render: "#DisplayCard",
                            permissions: {read: "status"},
                            field: {
                                name: "status",
                                widget: "#DisplayCard",
                                label: "status",
                                widgetProps: {
                                    icon: "#IconStatusChange",
                                    type: "enum",
                                    languageKeyCategory: "statusValues",
                                },
                            },
                        },
                        {
                            render: "#DisplayCard",
                            permissions: {read: "source"},
                            field: {
                                name: "source",
                                widget: "#DisplayCard",
                                label: "source",
                                widgetProps: {
                                    icon: "#IconRoute",
                                    type: "enum",
                                    languageKeyCategory: "sourceValues",
                                },
                            },
                        },
                        {
                            render: "#DisplayCard",
                            permissions: {read: "assignedTo"},
                            field: {
                                name: "assignedTo",
                                widget: "#DisplayCard",
                                label: "assignedTo",
                                widgetProps: {
                                    icon: "#IconUserCheck",
                                    type: "user",
                                },
                            },
                        },
                        {
                            render: "#DisplayCard",
                            permissions: {read: "travelFrom"},
                            field: {
                                name: "travelFrom",
                                widget: "#DisplayCard",
                                label: "travelFrom",
                                widgetProps: {icon: "#IconPlaneArrival"},
                            },
                        },
                        {
                            render: "#DisplayCard",
                            permissions: {read: "travelTo"},
                            field: {
                                name: "travelTo",
                                widget: "#DisplayCard",
                                label: "travelTo",
                                widgetProps: {icon: "#IconPlaneDeparture"},
                            },
                        },
                        {
                            render: "#DisplayCard",
                            permissions: {read: "budget"},
                            field: {
                                name: "budget",
                                widget: "#DisplayCard",
                                label: "budget",
                                widgetProps: {
                                    icon: "#IconCash",
                                    type: "number",
                                },
                            },
                        },
                        {
                            render: "#DisplayCard",
                            permissions: {read: "budgetCurrency"},
                            field: {
                                name: "budgetCurrency.abbreviation",
                                widget: "#DisplayCard",
                                label: "budgetCurrency",
                                widgetProps: {icon: "#IconCurrencyEuro"},
                            },
                        },
                        {
                            render: "#DisplayCard",
                            permissions: {read: "firstResponseAt"},
                            field: {
                                name: "firstResponseAt",
                                widget: "#DisplayCard",
                                label: "firstResponseAt",
                                widgetProps: {
                                    icon: "#IconClockCheck",
                                    type: "dateTime",
                                },
                            },
                        },
                        {
                            render: "#DisplayCard",
                            permissions: {read: "lastMessageAt"},
                            field: {
                                name: "lastMessageAt",
                                widget: "#DisplayCard",
                                label: "lastMessageAt",
                                widgetProps: {
                                    icon: "#IconMessage",
                                    type: "dateTime",
                                },
                            },
                        },
                        {
                            render: "#DisplayCard",
                            permissions: {read: "patient"},
                            field: {
                                name: "patient.number",
                                widget: "#DisplayCard",
                                label: "patient",
                                widgetProps: {icon: "#IconFolder"},
                            },
                        },
                    ],
                },
            ],
        },
        {
            render: "#SheetGroup",
            props: {title: "contactGroup"},
            children: [
                {
                    render: "#SheetGrid",
                    props: {columns: 3},
                    children: [
                        {
                            render: "#DisplayCard",
                            permissions: {read: "contact"},
                            field: {
                                name: "contact.firstName",
                                widget: "#DisplayCard",
                                label: "firstName",
                                widgetProps: {icon: "#IconUser"},
                            },
                        },
                        {
                            render: "#DisplayCard",
                            permissions: {read: "contact"},
                            field: {
                                name: "contact.lastName",
                                widget: "#DisplayCard",
                                label: "lastName",
                                widgetProps: {icon: "#IconUser"},
                            },
                        },
                        {
                            render: "#DisplayCard",
                            permissions: {read: "contact"},
                            field: {
                                name: "contact.country.name",
                                widget: "#DisplayCard",
                                label: "country",
                                widgetProps: {icon: "#IconWorld"},
                            },
                        },
                        {
                            render: "#DisplayCard",
                            permissions: {read: "contact"},
                            field: {
                                name: "contact.preferredLanguage",
                                widget: "#DisplayCard",
                                label: "preferredLanguage",
                                widgetProps: {
                                    icon: "#IconLanguage",
                                    type: "enum",
                                    languageKeyCategory: "languageValues",
                                },
                            },
                        },
                        {
                            render: "#DisplayCard",
                            permissions: {read: "contact"},
                            field: {
                                name: "contact.email",
                                widget: "#DisplayCard",
                                label: "email",
                                widgetProps: {icon: "#IconMail", type: "email"},
                            },
                        },
                        {
                            render: "#DisplayCard",
                            permissions: {read: "contact"},
                            field: {
                                name: "contact.phone",
                                widget: "#DisplayCard",
                                label: "phone",
                                widgetProps: {icon: "#IconPhone"},
                            },
                        },
                        {
                            render: "#DisplayCard",
                            permissions: {read: "contact"},
                            field: {
                                name: "contact.whatsapp",
                                widget: "#DisplayCard",
                                label: "whatsapp",
                                widgetProps: {icon: "#IconBrandWhatsapp"},
                            },
                        },
                        {
                            render: "#DisplayCard",
                            permissions: {read: "contactShared"},
                            field: {
                                name: "contactShared",
                                widget: "#DisplayCard",
                                label: "contactShared",
                                widgetProps: {
                                    icon: "#IconLockOpen",
                                    type: "boolean",
                                },
                            },
                        },
                    ],
                },
            ],
        },
        {
            render: "#SheetGroup",
            props: {title: "requestGroup"},
            children: [
                {
                    render: "#DisplayCard",
                    permissions: {read: "description"},
                    field: {
                        name: "description",
                        widget: "#DisplayCard",
                        label: "description",
                        widgetProps: {icon: "#IconAlignLeft", type: "longText"},
                    },
                },
                {
                    render: "#SheetMediaFilesStrip",
                    permissions: {read: "files"},
                    field: {
                        name: "files",
                        widget: "#SheetMediaFilesStrip",
                        widgetProps: {canDownload: true, canRemove: false},
                    },
                },
            ],
        },
        lifecycleSheetGroup,
    ],
};

const clinicInquiryCreateFormNodes: ViewConfig["nodes"] = [
    {
        render: "#TitleWithCollapse",
        props: {title: "form.contactSectionTitle"},
        children: [
            {
                render: "#FormGrid",
                props: {columns: 2},
                children: [
                    {
                        render: "#Field",
                        field: {
                            name: "contact.firstName",
                            widget: "#Input",
                            label: "form.firstNameLabel",
                            placeholder: "form.firstNamePlaceholder",
                            required: true,
                            widgetProps: {maxLength: PATIENT_NAME_MAX},
                        },
                    },
                    {
                        render: "#Field",
                        field: {
                            name: "contact.lastName",
                            widget: "#Input",
                            label: "form.lastNameLabel",
                            placeholder: "form.lastNamePlaceholder",
                            required: true,
                            widgetProps: {maxLength: PATIENT_NAME_MAX},
                        },
                    },
                    {
                        render: "#Field",
                        field: {
                            name: "contact.email",
                            widget: "#Input",
                            label: "form.emailLabel",
                            placeholder: "form.emailPlaceholder",
                            widgetProps: {type: "email"},
                        },
                    },
                    {
                        render: "#Field",
                        field: {
                            name: "contact.phone",
                            widget: "#Input",
                            label: "form.phoneLabel",
                            placeholder: "form.phonePlaceholder",
                            widgetProps: {maxLength: PATIENT_PHONE_MAX},
                        },
                    },
                    {
                        render: "#Field",
                        field: {
                            name: "contact.whatsapp",
                            widget: "#Input",
                            label: "form.whatsappLabel",
                            placeholder: "form.whatsappPlaceholder",
                            widgetProps: {maxLength: PATIENT_PHONE_MAX},
                        },
                    },
                    {
                        render: "#Field",
                        field: {
                            name: "contact.country",
                            widget: "#ApiSelect",
                            label: "form.countryLabel",
                            placeholder: "form.countryPlaceholder",
                            widgetProps: {
                                apiUrl: "/api/auxiliary/country/select",
                                method: "POST",
                                pageSize: 50,
                                normalizeEmptyToUndefined: true,
                            },
                        },
                    },
                    {
                        render: "#Field",
                        field: {
                            name: "contact.preferredLanguage",
                            widget: "#Select",
                            label: "form.preferredLanguageLabel",
                            placeholder: "form.preferredLanguagePlaceholder",
                            required: true,
                            widgetProps: {
                                options: languageOptions,
                                className: "grow w-full",
                            },
                        },
                    },
                    {
                        render: "#Field",
                        field: {
                            name: "source",
                            widget: "#Select",
                            label: "form.sourceLabel",
                            placeholder: "form.sourcePlaceholder",
                            required: true,
                            widgetProps: {
                                options: sourceOptions,
                                className: "grow w-full",
                            },
                        },
                    },
                ],
            },
        ],
    },
    {
        render: "#TitleWithCollapse",
        props: {title: "form.requestSectionTitle"},
        children: [
            {
                render: "#Field",
                field: {
                    name: "treatmentsWanted",
                    widget: "#EnumChecklist",
                    label: "form.treatmentsWantedLabel",
                    required: true,
                    widgetProps: {options: treatmentOptions},
                },
            },
            {
                render: "#Field",
                field: {
                    name: "description",
                    widget: "#Textarea",
                    label: "form.descriptionLabel",
                    placeholder: "form.descriptionPlaceholder",
                    widgetProps: {
                        rows: 4,
                        maxLength: INQUIRY_DESCRIPTION_MAX,
                        className:
                            "field-sizing-fixed max-h-56 min-h-24 overflow-y-auto",
                    },
                },
            },
            {
                render: "#FormGrid",
                props: {columns: 2},
                children: [
                    {
                        render: "#Field",
                        field: {
                            name: "travelFrom",
                            widget: "#DateInput",
                            label: "form.travelFromLabel",
                            placeholder: "form.travelFromPlaceholder",
                            widgetProps: {valueFormat: "YYYY-MM-DD"},
                        },
                    },
                    {
                        render: "#Field",
                        field: {
                            name: "travelTo",
                            widget: "#DateInput",
                            label: "form.travelToLabel",
                            placeholder: "form.travelToPlaceholder",
                            widgetProps: {valueFormat: "YYYY-MM-DD"},
                        },
                    },
                    {
                        render: "#Field",
                        field: {
                            name: "budget",
                            widget: "#Input",
                            label: "form.budgetLabel",
                            placeholder: "form.budgetPlaceholder",
                            widgetProps: {type: "number", min: 0, step: "any"},
                        },
                    },
                    {
                        render: "#Field",
                        field: {
                            name: "budgetCurrency",
                            widget: "#ApiSelect",
                            label: "form.budgetCurrencyLabel",
                            placeholder: "form.budgetCurrencyPlaceholder",
                            widgetProps: {
                                apiUrl: "/api/finance/currency/select",
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
    {
        render: "#Field",
        field: {
            name: "assignedTo",
            widget: "#ApiSelect",
            label: "form.assignedToLabel",
            placeholder: "form.assignedToPlaceholder",
            widgetProps: {
                apiUrl: "/api/company/users/select",
                postBody: {administration: true},
                method: "POST",
                pageSize: 50,
                normalizeEmptyToUndefined: true,
            },
        },
    },
];

/** Inquiries are never edited as a form: they change through their actions. */
export const clinicInquiryCreateFormView: ViewConfig = {
    model: "clinicinquiries",
    viewType: "form",
    viewMode: "create",
    accessModel: "clinicinquiries",
    apiUrl: API_URL,
    method: "PUT",
    nodes: clinicInquiryCreateFormNodes,
};

export const clinicInquiryViews: ViewConfig[] = [
    clinicInquirySheetView,
    clinicInquiryCreateFormView,
];
