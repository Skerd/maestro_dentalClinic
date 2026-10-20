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

const priceTypeOptions = CLINIC_SERVICE_PRICE_TYPES.map((value) => ({value, label: `form.priceType.${value}`}));

export const clinicServiceSheetView: ViewConfig = {
    model: "clinicservices",
    viewType: "sheet",
    accessModel: "clinicservices",
    apiUrl: API_URL,
    header: {titleField: "name", subtitleKey: "clinicServiceSubtitle", showCloseButton: true},
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
                        widgetProps: {icon: "#IconPhoto", imageGalleryField: "images", showThumbnails: false, allowFullScreen: false, coverAfterFirst: false},
                    },
                },
                {
                    render: "#SheetGrid",
                    props: {columns: 3},
                    children: [
                        {render: "#DisplayCard", permissions: {read: "slug"}, field: {name: "slug", widget: "#DisplayCard", label: "slug", widgetProps: {icon: "#Hash"}}},
                        {render: "#DisplayCard", permissions: {read: "durationMinutes"}, field: {name: "durationMinutes", widget: "#DisplayCard", label: "durationMinutes", widgetProps: {icon: "#IconClock", type: "number"}}},
                        {render: "#DisplayCard", permissions: {read: "bufferBeforeMinutes"}, field: {name: "bufferBeforeMinutes", widget: "#DisplayCard", label: "bufferBeforeMinutes", widgetProps: {icon: "#IconHourglass", type: "number"}}},
                        {render: "#DisplayCard", permissions: {read: "bufferAfterMinutes"}, field: {name: "bufferAfterMinutes", widget: "#DisplayCard", label: "bufferAfterMinutes", widgetProps: {icon: "#IconHourglass", type: "number"}}},
                        {render: "#DisplayCard", permissions: {read: "priceType"}, field: {name: "priceType", widget: "#DisplayCard", label: "priceType", widgetProps: {icon: "#IconTag", type: "enum", languageKeyCategory: "priceTypeValues"}}},
                        {render: "#DisplayCard", permissions: {read: "price"}, field: {name: "price", widget: "#DisplayCard", label: "price", widgetProps: {icon: "#IconCash", type: "number"}}},
                        {render: "#DisplayCard", permissions: {read: "onlineBookable"}, field: {name: "onlineBookable", widget: "#DisplayCard", label: "onlineBookable", widgetProps: {icon: "#IconCalendarCheck", type: "boolean"}}},
                        {render: "#DisplayCard", permissions: {read: "isPublic"}, field: {name: "isPublic", widget: "#DisplayCard", label: "isPublic", widgetProps: {icon: "#IconWorld", type: "boolean"}}},
                        {render: "#DisplayCard", permissions: {read: "isActive"}, field: {name: "isActive", widget: "#DisplayCard", label: "isActive", widgetProps: {icon: "#IconToggleRight", type: "boolean"}}},
                    ],
                },
                {render: "#DisplayCard", permissions: {read: "description"}, field: {name: "description", widget: "#DisplayCard", label: "description", widgetProps: {icon: "#IconAlignLeft"}}},
            ],
        },
        lifecycleSheetGroup,
    ],
};

function clinicServiceFormNodes(edit: boolean): ViewConfig["nodes"] {
    const perm = (name: string) => (edit ? {permissions: {read: name, write: name}} : {});
    const number = (name: string, {min, max}: {min: number; max?: number}, required = false) => ({
        render: "#Field",
        ...perm(name),
        field: {name, widget: "#Input", label: `form.${name}Label`, placeholder: `form.${name}Placeholder`, ...(required ? {required: true} : {}), widgetProps: {type: "number", min, max, step: "any"}},
    });
    const toggle = (name: string) => ({render: "#Field", ...perm(name), field: {name, widget: "#Switch", label: `form.${name}Label`}});
    return [
        {
            render: "#FormGrid",
            props: {columns: 2},
            children: [
                {render: "#Field", ...perm("name"), field: {name: "name", widget: "#Input", label: "form.nameLabel", placeholder: "form.namePlaceholder", required: true, widgetProps: {maxLength: CLINIC_SERVICE_NAME_MAX}}},
                {render: "#Field", ...perm("slug"), field: {name: "slug", widget: "#Input", label: "form.slugLabel", placeholder: "form.slugPlaceholder", required: true, widgetProps: {maxLength: CLINIC_SERVICE_SLUG_MAX}}},
            ],
        },
        {
            render: "#Field",
            ...perm("description"),
            field: {name: "description", widget: "#Textarea", label: "form.descriptionLabel", placeholder: "form.descriptionPlaceholder", widgetProps: {rows: 5, maxLength: CLINIC_SERVICE_DESCRIPTION_MAX, className: "field-sizing-fixed max-h-56 min-h-24 overflow-y-auto"}},
        },
        {
            render: "#Field",
            ...perm("images"),
            field: {name: "images", widget: "#MediaField", label: "form.imagesLabel", widgetProps: {mediaType: "image", mode: "multiple", maxCount: 8}},
        },
        {
            render: "#TitleWithCollapse",
            props: {title: "form.timingSectionTitle"},
            children: [
                {
                    render: "#FormGrid",
                    props: {columns: 3},
                    children: [
                        number("durationMinutes", CLINIC_SERVICE_DURATION_MINUTES, true),
                        number("bufferBeforeMinutes", CLINIC_SERVICE_BUFFER_MINUTES),
                        number("bufferAfterMinutes", CLINIC_SERVICE_BUFFER_MINUTES),
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
                        {render: "#Field", ...perm("priceType"), field: {name: "priceType", widget: "#Select", label: "form.priceTypeLabel", placeholder: "form.priceTypePlaceholder", required: true, widgetProps: {options: priceTypeOptions, className: "grow w-full"}}},
                        {
                            render: "#FormWhenFieldValueIn",
                            props: {watchField: "priceType", whenValues: ["fixed", "from"]},
                            children: [number("price", {min: 0})],
                        },
                    ],
                },
            ],
        },
        {
            render: "#FormGrid",
            props: {columns: 3},
            children: [toggle("onlineBookable"), toggle("isPublic"), toggle("isActive"), number("sortOrder", {min: 0})],
        },
    ];
}

export const clinicServiceCreateFormView: ViewConfig = {
    model: "clinicservices",
    viewType: "form",
    viewMode: "create",
    accessModel: "clinicservices",
    apiUrl: API_URL,
    method: "PUT",
    nodes: clinicServiceFormNodes(false),
};

export const clinicServiceEditFormView: ViewConfig = {
    model: "clinicservices",
    viewType: "form",
    viewMode: "edit",
    accessModel: "clinicservices",
    apiUrl: API_URL,
    method: "PATCH",
    nodes: clinicServiceFormNodes(true),
};

export const clinicServiceViews: ViewConfig[] = [clinicServiceSheetView, clinicServiceCreateFormView, clinicServiceEditFormView];
