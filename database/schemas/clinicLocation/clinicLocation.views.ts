import type {ViewConfig} from "armonia/src/modules/core/api/auxiliary/private/viewConfig";
import {lifecycleSheetGroup} from "@coreModule/database/schemas/shared/lifecycleSheetGroup";
import {
    CLINIC_LOCATION_CLOSURE_REASON_MAX,
    CLINIC_LOCATION_NAME_MAX,
    CLINIC_LOCATION_PHONE_MAX,
    CLINIC_LOCATION_POSTAL_CODE_MAX,
    CLINIC_LOCATION_STREET_MAX,
    CLINIC_LOCATION_TIMEZONE_MAX,
} from "armonia/src/modules/dentalClinic/api/dentalClinic/private/clinicLocation/clinicLocation.schema-def";

const API_URL = "/api/dentalClinic/clinicLocation";

const weekdayOptions = [
    {value: "0", label: "weekday.0"},
    {value: "1", label: "weekday.1"},
    {value: "2", label: "weekday.2"},
    {value: "3", label: "weekday.3"},
    {value: "4", label: "weekday.4"},
    {value: "5", label: "weekday.5"},
    {value: "6", label: "weekday.6"},
];

export const clinicLocationSheetView: ViewConfig = {
    model: "cliniclocations",
    viewType: "sheet",
    accessModel: "cliniclocations",
    apiUrl: API_URL,
    header: {
        titleField: "name",
        subtitleKey: "clinicLocationSubtitle",
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
                            permissions: {read: "name"},
                            field: {
                                name: "name",
                                widget: "#DisplayCard",
                                label: "name",
                                widgetProps: {icon: "#IconMapPin"},
                            },
                        },
                        {
                            render: "#DisplayCard",
                            permissions: {read: "timezone"},
                            field: {
                                name: "timezone",
                                widget: "#DisplayCard",
                                label: "timezone",
                                widgetProps: {icon: "#IconClock"},
                            },
                        },
                        {
                            render: "#DisplayCard",
                            permissions: {read: "phone"},
                            field: {
                                name: "phone",
                                widget: "#DisplayCard",
                                label: "phone",
                                widgetProps: {icon: "#Phone"},
                            },
                        },
                        {
                            render: "#DisplayCard",
                            permissions: {read: "email"},
                            field: {
                                name: "email",
                                widget: "#DisplayCard",
                                label: "email",
                                widgetProps: {icon: "#IconMail"},
                            },
                        },
                        {
                            render: "#DisplayCard",
                            permissions: {read: "isActive"},
                            field: {
                                name: "isActive",
                                widget: "#DisplayCard",
                                label: "isActive",
                                widgetProps: {
                                    icon: "#IconToggleRight",
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
            props: {title: "address"},
            dependent: "address",
            permissions: {read: "address"},
            children: [
                {
                    render: "#SheetGrid",
                    props: {columns: 2},
                    children: [
                        {
                            render: "#DisplayCard",
                            permissions: {read: "address"},
                            field: {
                                name: "address.street",
                                widget: "#DisplayCard",
                                label: "street",
                                widgetProps: {icon: "#MapPin"},
                            },
                        },
                        {
                            render: "#DisplayCard",
                            permissions: {read: "address"},
                            field: {
                                name: "address.postalCode",
                                widget: "#DisplayCard",
                                label: "postalCode",
                                widgetProps: {icon: "#Hash"},
                            },
                        },
                        {
                            render: "#DisplayCard",
                            permissions: {read: "address"},
                            field: {
                                name: "address.city.name",
                                widget: "#DisplayCard",
                                label: "city",
                                widgetProps: {icon: "#IconBuildingCommunity"},
                            },
                        },
                        {
                            render: "#DisplayCard",
                            permissions: {read: "address"},
                            field: {
                                name: "address.country.name",
                                widget: "#DisplayCard",
                                label: "country",
                                widgetProps: {icon: "#IconWorld"},
                            },
                        },
                    ],
                },
            ],
        },
        {
            render: "#SheetGroup",
            props: {title: "openingHours"},
            dependent: "openingHours",
            permissions: {read: "openingHours"},
            children: [
                {
                    render: "#SheetEmbeddedItemsList",
                    permissions: {read: "openingHours"},
                    field: {
                        name: "openingHours",
                        widget: "#SheetEmbeddedItemsList",
                        widgetProps: {
                            cardColumns: 3,
                            fields: [
                                {
                                    name: "dayOfWeek",
                                    type: "text",
                                    languageKeyCategory: "weekday",
                                    labelKey: "dayOfWeek",
                                    className: "text-sm font-medium",
                                },
                                {
                                    name: "startTime",
                                    type: "text",
                                    labelKey: "startTime",
                                    className: "text-sm",
                                },
                                {
                                    name: "endTime",
                                    type: "text",
                                    labelKey: "endTime",
                                    className: "text-sm",
                                },
                            ],
                            compactSummaryFields: [
                                "dayOfWeek",
                                "startTime",
                                "endTime",
                            ],
                            compactSummaryJoinSeparator: " - ",
                        },
                    },
                },
            ],
        },
        {
            render: "#SheetGroup",
            props: {title: "closures"},
            dependent: "closures",
            permissions: {read: "closures"},
            children: [
                {
                    render: "#SheetEmbeddedItemsList",
                    permissions: {read: "closures"},
                    field: {
                        name: "closures",
                        widget: "#SheetEmbeddedItemsList",
                        widgetProps: {
                            cardColumns: 3,
                            fields: [
                                {
                                    name: "date",
                                    type: "text",
                                    labelKey: "closureDate",
                                    className: "text-sm font-medium",
                                },
                                {
                                    name: "reason",
                                    type: "text",
                                    labelKey: "closureReason",
                                    className: "text-sm",
                                },
                            ],
                            compactSummaryFields: ["date", "reason"],
                            compactSummaryJoinSeparator: " · ",
                        },
                    },
                },
            ],
        },
        lifecycleSheetGroup,
    ],
};

const clinicLocationCreateFormNodes: ViewConfig["nodes"] = [
    {
        render: "#FormGrid",
        props: {columns: 2},
        children: [
            {
                render: "#Field",
                field: {
                    name: "name",
                    widget: "#Input",
                    label: "form.nameLabel",
                    placeholder: "form.namePlaceholder",
                    required: true,
                    widgetProps: {maxLength: CLINIC_LOCATION_NAME_MAX},
                },
            },
            {
                render: "#Field",
                field: {
                    name: "timezone",
                    widget: "#Input",
                    label: "form.timezoneLabel",
                    placeholder: "form.timezonePlaceholder",
                    required: true,
                    widgetProps: {maxLength: CLINIC_LOCATION_TIMEZONE_MAX},
                },
            },
            {
                render: "#Field",
                field: {
                    name: "phone",
                    widget: "#Input",
                    label: "form.phoneLabel",
                    placeholder: "form.phonePlaceholder",
                    widgetProps: {maxLength: CLINIC_LOCATION_PHONE_MAX},
                },
            },
            {
                render: "#Field",
                field: {
                    name: "email",
                    widget: "#Input",
                    label: "form.emailLabel",
                    placeholder: "form.emailPlaceholder",
                    widgetProps: {type: "email"},
                },
            },
        ],
    },
    {
        render: "#FormGrid",
        props: {columns: 3},
        children: [
            {
                render: "#Field",
                field: {
                    name: "isActive",
                    widget: "#Switch",
                    label: "form.isActiveLabel",
                },
            },
        ],
    },
    {
        render: "#TitleWithCollapse",
        props: {title: "form.addressSectionTitle"},
        children: [
            {
                render: "#FormGrid",
                props: {columns: 2, className: "gap-6"},
                children: [
                    {
                        render: "#Field",
                        field: {
                            name: "address.country",
                            widget: "#ApiSelect",
                            label: "form.countryLabel",
                            placeholder: "form.countryPlaceholder",
                            widgetProps: {
                                apiUrl: "/api/auxiliary/country/select",
                                method: "POST",
                                pageSize: 50,
                                cascadeClearFormFields: ["address.city"],
                            },
                        },
                    },
                    {
                        render: "#Field",
                        field: {
                            name: "address.city",
                            widget: "#ApiSelect",
                            label: "form.cityLabel",
                            placeholder: "form.cityPlaceholder",
                            widgetProps: {
                                apiUrl: "/api/auxiliary/city/select",
                                method: "POST",
                                pageSize: 50,
                                postBodyFromFormFields: [
                                    {
                                        field: "address.country",
                                        paramName: "country",
                                    },
                                ],
                                enableWhenFormFieldsNonEmpty: [
                                    "address.country",
                                ],
                            },
                        },
                    },
                    {
                        render: "#Field",
                        field: {
                            name: "address.street",
                            widget: "#Input",
                            label: "form.streetLabel",
                            placeholder: "form.streetPlaceholder",
                            widgetProps: {
                                maxLength: CLINIC_LOCATION_STREET_MAX,
                            },
                        },
                    },
                    {
                        render: "#Field",
                        field: {
                            name: "address.postalCode",
                            widget: "#Input",
                            label: "form.postalCodeLabel",
                            placeholder: "form.postalCodePlaceholder",
                            widgetProps: {
                                maxLength: CLINIC_LOCATION_POSTAL_CODE_MAX,
                            },
                        },
                    },
                    {
                        render: "#Field",
                        field: {
                            name: "address.latitude",
                            widget: "#Input",
                            label: "form.latitudeLabel",
                            placeholder: "form.latitudePlaceholder",
                            widgetProps: {
                                type: "number",
                                min: -90,
                                max: 90,
                                step: "any",
                            },
                        },
                    },
                    {
                        render: "#Field",
                        field: {
                            name: "address.longitude",
                            widget: "#Input",
                            label: "form.longitudeLabel",
                            placeholder: "form.longitudePlaceholder",
                            widgetProps: {
                                type: "number",
                                min: -180,
                                max: 180,
                                step: "any",
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
            name: "openingHours",
            widget: "#FormRepeater",
            widgetProps: {
                title: "form.openingHoursSectionTitle",
                arrayField: "openingHours",
                defaultItem: {
                    dayOfWeek: "1",
                    startTime: "08:00",
                    endTime: "18:00",
                },
                addLabel: "form.hoursAddRow",
                removeLabel: "form.hoursRemoveRow",
                rowTitleFields: ["dayOfWeek", "startTime", "endTime"],
                rowTitleSeparators: [" ", " - "],
                rowTitlePlaceholder: "form.hoursRowTitle",
                rowTemplate: [
                    {
                        render: "#FormGrid",
                        props: {columns: 3},
                        children: [
                            {
                                render: "#Field",
                                field: {
                                    name: "dayOfWeek",
                                    widget: "#SimpleSelect",
                                    label: "form.dayOfWeekLabel",
                                    required: true,
                                    widgetProps: {options: weekdayOptions},
                                },
                            },
                            {
                                render: "#Field",
                                field: {
                                    name: "startTime",
                                    widget: "#DateInput",
                                    label: "form.startTimeLabel",
                                    required: true,
                                    widgetProps: {
                                        valueFormat: "HH:mm",
                                        timeOnly: true,
                                    },
                                },
                            },
                            {
                                render: "#Field",
                                field: {
                                    name: "endTime",
                                    widget: "#DateInput",
                                    label: "form.endTimeLabel",
                                    required: true,
                                    widgetProps: {
                                        valueFormat: "HH:mm",
                                        timeOnly: true,
                                    },
                                },
                            },
                        ],
                    },
                ],
            },
        },
    },
    {
        render: "#Field",
        field: {
            name: "closures",
            widget: "#FormRepeater",
            widgetProps: {
                title: "form.closuresSectionTitle",
                arrayField: "closures",
                defaultItem: {date: "", reason: ""},
                addLabel: "form.closureAddRow",
                removeLabel: "form.closureRemoveRow",
                rowTitleFields: ["date", "reason"],
                rowTitleSeparators: [" · "],
                rowTitlePlaceholder: "form.closureRowTitle",
                rowTemplate: [
                    {
                        render: "#FormGrid",
                        props: {columns: 2},
                        children: [
                            {
                                render: "#Field",
                                field: {
                                    name: "date",
                                    widget: "#DateInput",
                                    label: "form.closureDateLabel",
                                    required: true,
                                    widgetProps: {valueFormat: "yyyy-MM-dd"},
                                },
                            },
                            {
                                render: "#Field",
                                field: {
                                    name: "reason",
                                    widget: "#Input",
                                    label: "form.closureReasonLabel",
                                    placeholder:
                                        "form.closureReasonPlaceholder",
                                    widgetProps: {
                                        maxLength:
                                            CLINIC_LOCATION_CLOSURE_REASON_MAX,
                                    },
                                },
                            },
                        ],
                    },
                ],
            },
        },
    },
];

const clinicLocationEditFormNodes: ViewConfig["nodes"] = [
    {
        render: "#FormGrid",
        props: {columns: 2},
        permissions: {
            readAny: ["name", "timezone", "phone", "email"],
            writeAny: ["name", "timezone", "phone", "email"],
        },
        children: [
            {
                render: "#Field",
                permissions: {read: "name", write: "name"},
                field: {
                    name: "name",
                    widget: "#Input",
                    label: "form.nameLabel",
                    placeholder: "form.namePlaceholder",
                    required: true,
                    widgetProps: {maxLength: CLINIC_LOCATION_NAME_MAX},
                },
            },
            {
                render: "#Field",
                permissions: {read: "timezone", write: "timezone"},
                field: {
                    name: "timezone",
                    widget: "#Input",
                    label: "form.timezoneLabel",
                    placeholder: "form.timezonePlaceholder",
                    required: true,
                    widgetProps: {maxLength: CLINIC_LOCATION_TIMEZONE_MAX},
                },
            },
            {
                render: "#Field",
                permissions: {read: "phone", write: "phone"},
                field: {
                    name: "phone",
                    widget: "#Input",
                    label: "form.phoneLabel",
                    placeholder: "form.phonePlaceholder",
                    widgetProps: {maxLength: CLINIC_LOCATION_PHONE_MAX},
                },
            },
            {
                render: "#Field",
                permissions: {read: "email", write: "email"},
                field: {
                    name: "email",
                    widget: "#Input",
                    label: "form.emailLabel",
                    placeholder: "form.emailPlaceholder",
                    widgetProps: {type: "email"},
                },
            },
        ],
    },
    {
        render: "#FormGrid",
        props: {columns: 3},
        permissions: {readAny: ["isActive"], writeAny: ["isActive"]},
        children: [
            {
                render: "#Field",
                permissions: {read: "isActive", write: "isActive"},
                field: {
                    name: "isActive",
                    widget: "#Switch",
                    label: "form.isActiveLabel",
                },
            },
        ],
    },
    {
        render: "#TitleWithCollapse",
        props: {title: "form.addressSectionTitle"},
        permissions: {
            readAny: [
                "address.country",
                "address.city",
                "address.street",
                "address.postalCode",
                "address.latitude",
                "address.longitude",
            ],
            writeAny: [
                "address.country",
                "address.city",
                "address.street",
                "address.postalCode",
                "address.latitude",
                "address.longitude",
            ],
        },
        children: [
            {
                render: "#FormGrid",
                props: {columns: 2, className: "gap-6"},
                children: [
                    {
                        render: "#Field",
                        permissions: {
                            read: "address.country",
                            write: "address.country",
                        },
                        field: {
                            name: "address.country",
                            widget: "#ApiSelect",
                            label: "form.countryLabel",
                            placeholder: "form.countryPlaceholder",
                            widgetProps: {
                                apiUrl: "/api/auxiliary/country/select",
                                method: "POST",
                                pageSize: 50,
                                cascadeClearFormFields: ["address.city"],
                            },
                        },
                    },
                    {
                        render: "#Field",
                        permissions: {
                            read: "address.city",
                            write: "address.city",
                        },
                        field: {
                            name: "address.city",
                            widget: "#ApiSelect",
                            label: "form.cityLabel",
                            placeholder: "form.cityPlaceholder",
                            widgetProps: {
                                apiUrl: "/api/auxiliary/city/select",
                                method: "POST",
                                pageSize: 50,
                                postBodyFromFormFields: [
                                    {
                                        field: "address.country",
                                        paramName: "country",
                                    },
                                ],
                                enableWhenFormFieldsNonEmpty: [
                                    "address.country",
                                ],
                            },
                        },
                    },
                    {
                        render: "#Field",
                        permissions: {
                            read: "address.street",
                            write: "address.street",
                        },
                        field: {
                            name: "address.street",
                            widget: "#Input",
                            label: "form.streetLabel",
                            placeholder: "form.streetPlaceholder",
                            widgetProps: {
                                maxLength: CLINIC_LOCATION_STREET_MAX,
                            },
                        },
                    },
                    {
                        render: "#Field",
                        permissions: {
                            read: "address.postalCode",
                            write: "address.postalCode",
                        },
                        field: {
                            name: "address.postalCode",
                            widget: "#Input",
                            label: "form.postalCodeLabel",
                            placeholder: "form.postalCodePlaceholder",
                            widgetProps: {
                                maxLength: CLINIC_LOCATION_POSTAL_CODE_MAX,
                            },
                        },
                    },
                    {
                        render: "#Field",
                        permissions: {
                            read: "address.latitude",
                            write: "address.latitude",
                        },
                        field: {
                            name: "address.latitude",
                            widget: "#Input",
                            label: "form.latitudeLabel",
                            placeholder: "form.latitudePlaceholder",
                            widgetProps: {
                                type: "number",
                                min: -90,
                                max: 90,
                                step: "any",
                            },
                        },
                    },
                    {
                        render: "#Field",
                        permissions: {
                            read: "address.longitude",
                            write: "address.longitude",
                        },
                        field: {
                            name: "address.longitude",
                            widget: "#Input",
                            label: "form.longitudeLabel",
                            placeholder: "form.longitudePlaceholder",
                            widgetProps: {
                                type: "number",
                                min: -180,
                                max: 180,
                                step: "any",
                            },
                        },
                    },
                ],
            },
        ],
    },
    {
        render: "#Field",
        permissions: {read: "openingHours", write: "openingHours"},
        field: {
            name: "openingHours",
            widget: "#FormRepeater",
            widgetProps: {
                title: "form.openingHoursSectionTitle",
                arrayField: "openingHours",
                defaultItem: {
                    dayOfWeek: "1",
                    startTime: "08:00",
                    endTime: "18:00",
                },
                addLabel: "form.hoursAddRow",
                removeLabel: "form.hoursRemoveRow",
                rowTitleFields: ["dayOfWeek", "startTime", "endTime"],
                rowTitleSeparators: [" ", " - "],
                rowTitlePlaceholder: "form.hoursRowTitle",
                rowTemplate: [
                    {
                        render: "#FormGrid",
                        props: {columns: 3},
                        children: [
                            {
                                render: "#Field",
                                field: {
                                    name: "dayOfWeek",
                                    widget: "#SimpleSelect",
                                    label: "form.dayOfWeekLabel",
                                    required: true,
                                    widgetProps: {options: weekdayOptions},
                                },
                            },
                            {
                                render: "#Field",
                                field: {
                                    name: "startTime",
                                    widget: "#DateInput",
                                    label: "form.startTimeLabel",
                                    required: true,
                                    widgetProps: {
                                        valueFormat: "HH:mm",
                                        timeOnly: true,
                                    },
                                },
                            },
                            {
                                render: "#Field",
                                field: {
                                    name: "endTime",
                                    widget: "#DateInput",
                                    label: "form.endTimeLabel",
                                    required: true,
                                    widgetProps: {
                                        valueFormat: "HH:mm",
                                        timeOnly: true,
                                    },
                                },
                            },
                        ],
                    },
                ],
            },
        },
    },
    {
        render: "#Field",
        permissions: {read: "closures", write: "closures"},
        field: {
            name: "closures",
            widget: "#FormRepeater",
            widgetProps: {
                title: "form.closuresSectionTitle",
                arrayField: "closures",
                defaultItem: {date: "", reason: ""},
                addLabel: "form.closureAddRow",
                removeLabel: "form.closureRemoveRow",
                rowTitleFields: ["date", "reason"],
                rowTitleSeparators: [" · "],
                rowTitlePlaceholder: "form.closureRowTitle",
                rowTemplate: [
                    {
                        render: "#FormGrid",
                        props: {columns: 2},
                        children: [
                            {
                                render: "#Field",
                                field: {
                                    name: "date",
                                    widget: "#DateInput",
                                    label: "form.closureDateLabel",
                                    required: true,
                                    widgetProps: {valueFormat: "yyyy-MM-dd"},
                                },
                            },
                            {
                                render: "#Field",
                                field: {
                                    name: "reason",
                                    widget: "#Input",
                                    label: "form.closureReasonLabel",
                                    placeholder:
                                        "form.closureReasonPlaceholder",
                                    widgetProps: {
                                        maxLength:
                                            CLINIC_LOCATION_CLOSURE_REASON_MAX,
                                    },
                                },
                            },
                        ],
                    },
                ],
            },
        },
    },
];

export const clinicLocationCreateFormView: ViewConfig = {
    model: "cliniclocations",
    viewType: "form",
    viewMode: "create",
    accessModel: "cliniclocations",
    apiUrl: API_URL,
    method: "PUT",
    nodes: clinicLocationCreateFormNodes,
};

export const clinicLocationEditFormView: ViewConfig = {
    model: "cliniclocations",
    viewType: "form",
    viewMode: "edit",
    accessModel: "cliniclocations",
    apiUrl: API_URL,
    method: "PATCH",
    nodes: clinicLocationEditFormNodes,
};

export const clinicLocationViews: ViewConfig[] = [
    clinicLocationSheetView,
    clinicLocationCreateFormView,
    clinicLocationEditFormView,
];
