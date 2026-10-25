import type {ViewConfig} from "armonia/src/modules/core/api/auxiliary/private/viewConfig";
import {lifecycleSheetGroup} from "@coreModule/database/schemas/shared/lifecycleSheetGroup";
import {
    CLINIC_SERVICE_BUFFER_MINUTES,
    CLINIC_SERVICE_DESCRIPTION_MAX,
    CLINIC_SERVICE_DURATION_MINUTES,
    CLINIC_SERVICE_NAME_MAX,
    CLINIC_SERVICE_PRICE_TYPES,
    CLINIC_SERVICE_SLUG_MAX,
} from "armonia/src/modules/dentalClinic/api/dentalClinic/private/clinicService/clinicService.schema-def";

const API_URL = "/api/dentalClinic/clinicService";

const priceTypeOptions = CLINIC_SERVICE_PRICE_TYPES.map((value) => ({
    value,
    label: `form.priceType.${value}`,
}));

export const clinicServiceSheetView: ViewConfig = {
    model: "clinicservices",
    viewType: "sheet",
    accessModel: "clinicservices",
    apiUrl: API_URL,
    header: {
        titleField: "name",
        subtitleKey: "clinicServiceSubtitle",
        showCloseButton: true,
    },
    nodes: [
        {
            render: "#SheetGroup",
            props: {title: "overview"},
            children: [
                {
                    render: "#DisplayCard",
                    permissions: {read: "images"},
                    field: {
                        name: "images",
                        widget: "#GalleryCarousel",
                        label: "images",
                        widgetProps: {
                            icon: "#IconPhoto",
                            imageGalleryField: "images",
                            showThumbnails: false,
                            allowFullScreen: false,
                            coverAfterFirst: false,
                        },
                    },
                },
                {
                    render: "#SheetGrid",
                    props: {columns: 3},
                    children: [
                        {
                            render: "#DisplayCard",
                            permissions: {read: "slug"},
                            field: {
                                name: "slug",
                                widget: "#DisplayCard",
                                label: "slug",
                                widgetProps: {icon: "#Hash"},
                            },
                        },
                        {
                            render: "#DisplayCard",
                            permissions: {read: "durationMinutes"},
                            field: {
                                name: "durationMinutes",
                                widget: "#DisplayCard",
                                label: "durationMinutes",
                                widgetProps: {
                                    icon: "#IconClock",
                                    type: "number",
                                },
                            },
                        },
                        {
                            render: "#DisplayCard",
                            permissions: {read: "bufferBeforeMinutes"},
                            field: {
                                name: "bufferBeforeMinutes",
                                widget: "#DisplayCard",
                                label: "bufferBeforeMinutes",
                                widgetProps: {
                                    icon: "#IconHourglass",
                                    type: "number",
                                },
                            },
                        },
                        {
                            render: "#DisplayCard",
                            permissions: {read: "bufferAfterMinutes"},
                            field: {
                                name: "bufferAfterMinutes",
                                widget: "#DisplayCard",
                                label: "bufferAfterMinutes",
                                widgetProps: {
                                    icon: "#IconHourglass",
                                    type: "number",
                                },
                            },
                        },
                        {
                            render: "#DisplayCard",
                            permissions: {read: "priceType"},
                            field: {
                                name: "priceType",
                                widget: "#DisplayCard",
                                label: "priceType",
                                widgetProps: {
                                    icon: "#IconTag",
                                    type: "enum",
                                    languageKeyCategory: "priceTypeValues",
                                },
                            },
                        },
                        {
                            render: "#DisplayCard",
                            permissions: {read: "price"},
                            field: {
                                name: "price",
                                widget: "#DisplayCard",
                                label: "price",
                                widgetProps: {
                                    icon: "#IconCash",
                                    type: "number",
                                },
                            },
                        },
                        {
                            render: "#DisplayCard",
                            permissions: {read: "onlineBookable"},
                            field: {
                                name: "onlineBookable",
                                widget: "#DisplayCard",
                                label: "onlineBookable",
                                widgetProps: {
                                    icon: "#IconCalendarCheck",
                                    type: "boolean",
                                },
                            },
                        },
                        {
                            render: "#DisplayCard",
                            permissions: {read: "isPublic"},
                            field: {
                                name: "isPublic",
                                widget: "#DisplayCard",
                                label: "isPublic",
                                widgetProps: {
                                    icon: "#IconWorld",
                                    type: "boolean",
                                },
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
                {
                    render: "#DisplayCard",
                    permissions: {read: "description"},
                    field: {
                        name: "description",
                        widget: "#DisplayCard",
                        label: "description",
                        widgetProps: {icon: "#IconAlignLeft"},
                    },
                },
            ],
        },
        lifecycleSheetGroup,
    ],
};

const clinicServiceCreateFormNodes: ViewConfig["nodes"] = [
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
                    widgetProps: {maxLength: CLINIC_SERVICE_NAME_MAX},
                },
            },
            {
                render: "#Field",
                field: {
                    name: "slug",
                    widget: "#Input",
                    label: "form.slugLabel",
                    placeholder: "form.slugPlaceholder",
                    required: true,
                    widgetProps: {maxLength: CLINIC_SERVICE_SLUG_MAX},
                },
            },
        ],
    },
    {
        render: "#Field",
        field: {
            name: "description",
            widget: "#Textarea",
            label: "form.descriptionLabel",
            placeholder: "form.descriptionPlaceholder",
            widgetProps: {
                rows: 5,
                maxLength: CLINIC_SERVICE_DESCRIPTION_MAX,
                className:
                    "field-sizing-fixed max-h-56 min-h-24 overflow-y-auto",
            },
        },
    },
    {
        render: "#Field",
        field: {
            name: "images",
            widget: "#MediaField",
            label: "form.imagesLabel",
            widgetProps: {mediaType: "image", mode: "multiple", maxCount: 8},
        },
    },
    {
        render: "#TitleWithCollapse",
        props: {title: "form.timingSectionTitle"},
        children: [
            {
                render: "#FormGrid",
                props: {columns: 3},
                children: [
                    {
                        render: "#Field",
                        field: {
                            name: "durationMinutes",
                            widget: "#Input",
                            label: "form.durationMinutesLabel",
                            placeholder: "form.durationMinutesPlaceholder",
                            required: true,
                            widgetProps: {
                                type: "number",
                                min: CLINIC_SERVICE_DURATION_MINUTES.min,
                                max: CLINIC_SERVICE_DURATION_MINUTES.max,
                                step: "any",
                            },
                        },
                    },
                    {
                        render: "#Field",
                        field: {
                            name: "bufferBeforeMinutes",
                            widget: "#Input",
                            label: "form.bufferBeforeMinutesLabel",
                            placeholder: "form.bufferBeforeMinutesPlaceholder",
                            widgetProps: {
                                type: "number",
                                min: CLINIC_SERVICE_BUFFER_MINUTES.min,
                                max: CLINIC_SERVICE_BUFFER_MINUTES.max,
                                step: "any",
                            },
                        },
                    },
                    {
                        render: "#Field",
                        field: {
                            name: "bufferAfterMinutes",
                            widget: "#Input",
                            label: "form.bufferAfterMinutesLabel",
                            placeholder: "form.bufferAfterMinutesPlaceholder",
                            widgetProps: {
                                type: "number",
                                min: CLINIC_SERVICE_BUFFER_MINUTES.min,
                                max: CLINIC_SERVICE_BUFFER_MINUTES.max,
                                step: "any",
                            },
                        },
                    },
                ],
            },
        ],
    },
    {
        render: "#TitleWithCollapse",
        props: {title: "form.pricingSectionTitle"},
        children: [
            {
                render: "#FormGrid",
                props: {columns: 2},
                children: [
                    {
                        render: "#Field",
                        field: {
                            name: "priceType",
                            widget: "#Select",
                            label: "form.priceTypeLabel",
                            placeholder: "form.priceTypePlaceholder",
                            required: true,
                            widgetProps: {
                                options: priceTypeOptions,
                                className: "grow w-full",
                            },
                        },
                    },
                    {
                        render: "#FormWhenFieldValueIn",
                        props: {
                            watchField: "priceType",
                            whenValues: ["fixed", "from"],
                        },
                        children: [
                            {
                                render: "#Field",
                                field: {
                                    name: "price",
                                    widget: "#Input",
                                    label: "form.priceLabel",
                                    placeholder: "form.pricePlaceholder",
                                    widgetProps: {
                                        type: "number",
                                        min: 0,
                                        step: "any",
                                    },
                                },
                            },
                        ],
                    },
                ],
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
                    name: "onlineBookable",
                    widget: "#Switch",
                    label: "form.onlineBookableLabel",
                },
            },
            {
                render: "#Field",
                field: {
                    name: "isPublic",
                    widget: "#Switch",
                    label: "form.isPublicLabel",
                },
            },
            {
                render: "#Field",
                field: {
                    name: "isActive",
                    widget: "#Switch",
                    label: "form.isActiveLabel",
                },
            },
            {
                render: "#Field",
                field: {
                    name: "sortOrder",
                    widget: "#Input",
                    label: "form.sortOrderLabel",
                    placeholder: "form.sortOrderPlaceholder",
                    widgetProps: {type: "number", min: 0, step: "any"},
                },
            },
        ],
    },
];

const clinicServiceEditFormNodes: ViewConfig["nodes"] = [
    {
        render: "#FormGrid",
        props: {columns: 2},
        permissions: {readAny: ["name", "slug"], writeAny: ["name", "slug"]},
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
                    widgetProps: {maxLength: CLINIC_SERVICE_NAME_MAX},
                },
            },
            {
                render: "#Field",
                permissions: {read: "slug", write: "slug"},
                field: {
                    name: "slug",
                    widget: "#Input",
                    label: "form.slugLabel",
                    placeholder: "form.slugPlaceholder",
                    required: true,
                    widgetProps: {maxLength: CLINIC_SERVICE_SLUG_MAX},
                },
            },
        ],
    },
    {
        render: "#Field",
        permissions: {read: "description", write: "description"},
        field: {
            name: "description",
            widget: "#Textarea",
            label: "form.descriptionLabel",
            placeholder: "form.descriptionPlaceholder",
            widgetProps: {
                rows: 5,
                maxLength: CLINIC_SERVICE_DESCRIPTION_MAX,
                className:
                    "field-sizing-fixed max-h-56 min-h-24 overflow-y-auto",
            },
        },
    },
    {
        render: "#Field",
        permissions: {read: "images", write: "images"},
        field: {
            name: "images",
            widget: "#MediaField",
            label: "form.imagesLabel",
            widgetProps: {mediaType: "image", mode: "multiple", maxCount: 8},
        },
    },
    {
        render: "#TitleWithCollapse",
        props: {title: "form.timingSectionTitle"},
        permissions: {
            readAny: [
                "durationMinutes",
                "bufferBeforeMinutes",
                "bufferAfterMinutes",
            ],
            writeAny: [
                "durationMinutes",
                "bufferBeforeMinutes",
                "bufferAfterMinutes",
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
                            read: "durationMinutes",
                            write: "durationMinutes",
                        },
                        field: {
                            name: "durationMinutes",
                            widget: "#Input",
                            label: "form.durationMinutesLabel",
                            placeholder: "form.durationMinutesPlaceholder",
                            required: true,
                            widgetProps: {
                                type: "number",
                                min: CLINIC_SERVICE_DURATION_MINUTES.min,
                                max: CLINIC_SERVICE_DURATION_MINUTES.max,
                                step: "any",
                            },
                        },
                    },
                    {
                        render: "#Field",
                        permissions: {
                            read: "bufferBeforeMinutes",
                            write: "bufferBeforeMinutes",
                        },
                        field: {
                            name: "bufferBeforeMinutes",
                            widget: "#Input",
                            label: "form.bufferBeforeMinutesLabel",
                            placeholder: "form.bufferBeforeMinutesPlaceholder",
                            widgetProps: {
                                type: "number",
                                min: CLINIC_SERVICE_BUFFER_MINUTES.min,
                                max: CLINIC_SERVICE_BUFFER_MINUTES.max,
                                step: "any",
                            },
                        },
                    },
                    {
                        render: "#Field",
                        permissions: {
                            read: "bufferAfterMinutes",
                            write: "bufferAfterMinutes",
                        },
                        field: {
                            name: "bufferAfterMinutes",
                            widget: "#Input",
                            label: "form.bufferAfterMinutesLabel",
                            placeholder: "form.bufferAfterMinutesPlaceholder",
                            widgetProps: {
                                type: "number",
                                min: CLINIC_SERVICE_BUFFER_MINUTES.min,
                                max: CLINIC_SERVICE_BUFFER_MINUTES.max,
                                step: "any",
                            },
                        },
                    },
                ],
            },
        ],
    },
    {
        render: "#TitleWithCollapse",
        props: {title: "form.pricingSectionTitle"},
        permissions: {
            readAny: ["priceType", "price"],
            writeAny: ["priceType", "price"],
        },
        children: [
            {
                render: "#FormGrid",
                props: {columns: 2},
                children: [
                    {
                        render: "#Field",
                        permissions: {read: "priceType", write: "priceType"},
                        field: {
                            name: "priceType",
                            widget: "#Select",
                            label: "form.priceTypeLabel",
                            placeholder: "form.priceTypePlaceholder",
                            required: true,
                            widgetProps: {
                                options: priceTypeOptions,
                                className: "grow w-full",
                            },
                        },
                    },
                    {
                        render: "#FormWhenFieldValueIn",
                        props: {
                            watchField: "priceType",
                            whenValues: ["fixed", "from"],
                        },
                        children: [
                            {
                                render: "#Field",
                                permissions: {read: "price", write: "price"},
                                field: {
                                    name: "price",
                                    widget: "#Input",
                                    label: "form.priceLabel",
                                    placeholder: "form.pricePlaceholder",
                                    widgetProps: {
                                        type: "number",
                                        min: 0,
                                        step: "any",
                                    },
                                },
                            },
                        ],
                    },
                ],
            },
        ],
    },
    {
        render: "#FormGrid",
        props: {columns: 3},
        permissions: {
            readAny: ["onlineBookable", "isPublic", "isActive", "sortOrder"],
            writeAny: ["onlineBookable", "isPublic", "isActive", "sortOrder"],
        },
        children: [
            {
                render: "#Field",
                permissions: {read: "onlineBookable", write: "onlineBookable"},
                field: {
                    name: "onlineBookable",
                    widget: "#Switch",
                    label: "form.onlineBookableLabel",
                },
            },
            {
                render: "#Field",
                permissions: {read: "isPublic", write: "isPublic"},
                field: {
                    name: "isPublic",
                    widget: "#Switch",
                    label: "form.isPublicLabel",
                },
            },
            {
                render: "#Field",
                permissions: {read: "isActive", write: "isActive"},
                field: {
                    name: "isActive",
                    widget: "#Switch",
                    label: "form.isActiveLabel",
                },
            },
            {
                render: "#Field",
                permissions: {read: "sortOrder", write: "sortOrder"},
                field: {
                    name: "sortOrder",
                    widget: "#Input",
                    label: "form.sortOrderLabel",
                    placeholder: "form.sortOrderPlaceholder",
                    widgetProps: {type: "number", min: 0, step: "any"},
                },
            },
        ],
    },
];

export const clinicServiceCreateFormView: ViewConfig = {
    model: "clinicservices",
    viewType: "form",
    viewMode: "create",
    accessModel: "clinicservices",
    apiUrl: API_URL,
    method: "PUT",
    nodes: clinicServiceCreateFormNodes,
};

export const clinicServiceEditFormView: ViewConfig = {
    model: "clinicservices",
    viewType: "form",
    viewMode: "edit",
    accessModel: "clinicservices",
    apiUrl: API_URL,
    method: "PATCH",
    nodes: clinicServiceEditFormNodes,
};

export const clinicServiceViews: ViewConfig[] = [
    clinicServiceSheetView,
    clinicServiceCreateFormView,
    clinicServiceEditFormView,
];
