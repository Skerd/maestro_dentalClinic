import type {ViewConfig} from "armonia/src/modules/core/api/auxiliary/private/viewConfig";
import {lifecycleSheetGroup} from "@coreModule/database/schemas/shared/lifecycleSheetGroup";
import {
    CLINIC_REVIEW_AUTHOR_NAME_MAX,
    CLINIC_REVIEW_COMMENT_MAX,
} from "armonia/src/modules/dentalClinic/api/dentalClinic/private/clinicReview/clinicReview.schema-def";

const API_URL = "/api/dentalClinic/clinicReview";
const APPOINTMENT_SELECT = {
    apiUrl: "/api/dentalClinic/appointment/select",
    pageSize: 50,
    normalizeEmptyToUndefined: true,
};

export const clinicReviewSheetView: ViewConfig = {
    model: "clinicreviews",
    viewType: "sheet",
    sheetWidget: "#ClinicReviewSheetView",
    accessModel: "clinicreviews",
    apiUrl: API_URL,
    header: {
        titleField: "authorName",
        subtitleKey: "clinicReviewSubtitle",
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
                            permissions: {read: "isPublished"},
                            field: {
                                name: "isPublished",
                                widget: "#DisplayCard",
                                label: "isPublished",
                                widgetProps: {
                                    icon: "#IconWorld",
                                    type: "boolean",
                                },
                            },
                        },
                        {
                            render: "#DisplayCard",
                            permissions: {read: "rating"},
                            field: {
                                name: "rating",
                                widget: "#DisplayCard",
                                label: "rating",
                                widgetProps: {
                                    icon: "#IconStar",
                                    type: "number",
                                },
                            },
                        },
                        {
                            render: "#DisplayCard",
                            permissions: {read: "appointment"},
                            field: {
                                name: "appointment.number",
                                widget: "#DisplayCard",
                                label: "appointment",
                                widgetProps: {
                                    icon: "#IconCalendarEvent",
                                    linkedRefPath: "appointment",
                                    linkedSheetModel: "appointments",
                                    linkedSheetWidget: "#AppointmentSheetView",
                                    linkedSheetEntityProp: "appointment",
                                },
                            },
                        },
                    ],
                },
                {
                    render: "#SheetGrid",
                    props: {columns: 1},
                    children: [
                        {
                            render: "#DisplayCard",
                            dependent: "comment",
                            permissions: {read: "comment"},
                            field: {
                                name: "comment",
                                widget: "#DisplayCard",
                                label: "comment",
                                widgetProps: {
                                    icon: "#IconAlignLeft",
                                    expandable: true,
                                    maxLength: 250,
                                },
                            },
                        },
                    ],
                },
            ],
        },
        lifecycleSheetGroup,
    ],
};

const clinicReviewCreateFormNodes: ViewConfig["nodes"] = [
    {
        render: "#TitleWithCollapse",
        props: {title: "form.reviewSectionTitle"},
        children: [
            {
                render: "#FormGrid",
                props: {columns: 2},
                children: [
                    {
                        render: "#Field",
                        field: {
                            name: "appointment",
                            widget: "#ApiSelect",
                            label: "form.appointmentLabel",
                            placeholder: "form.appointmentPlaceholder",
                            required: true,
                            widgetProps: APPOINTMENT_SELECT,
                        },
                    },
                    {
                        render: "#Field",
                        field: {
                            name: "rating",
                            widget: "#Input",
                            label: "form.ratingLabel",
                            placeholder: "form.ratingPlaceholder",
                            required: true,
                            widgetProps: {type: "number", min: 1, max: 5, step: 1},
                        },
                    },
                    {
                        render: "#Field",
                        field: {
                            name: "authorName",
                            widget: "#Input",
                            label: "form.authorNameLabel",
                            placeholder: "form.authorNamePlaceholder",
                            required: true,
                            widgetProps: {maxLength: CLINIC_REVIEW_AUTHOR_NAME_MAX},
                        },
                    },
                ],
            },
            {
                render: "#Field",
                field: {
                    name: "comment",
                    widget: "#Textarea",
                    label: "form.commentLabel",
                    placeholder: "form.commentPlaceholder",
                    widgetProps: {rows: 3, maxLength: CLINIC_REVIEW_COMMENT_MAX},
                },
            },
        ],
    },
];

const clinicReviewEditFormNodes: ViewConfig["nodes"] = [
    {
        render: "#TitleWithCollapse",
        props: {title: "form.reviewSectionTitle"},
        permissions: {readAny: ["appointment", "rating", "authorName", "comment"], writeAny: ["rating", "authorName", "comment"]},
        children: [
            {
                render: "#FormGrid",
                props: {columns: 2},
                children: [
                    {
                        render: "#Field",
                        // Read-only: a review stays with the appointment it was written for.
                        permissions: {read: "appointment"},
                        field: {
                            name: "appointment",
                            widget: "#ApiSelect",
                            label: "form.appointmentLabel",
                            placeholder: "form.appointmentPlaceholder",
                            skipWriteAccessGate: true,
                            widgetProps: {...APPOINTMENT_SELECT, disabled: true},
                        },
                    },
                    {
                        render: "#Field",
                        permissions: {read: "rating", write: "rating"},
                        field: {
                            name: "rating",
                            widget: "#Input",
                            label: "form.ratingLabel",
                            placeholder: "form.ratingPlaceholder",
                            required: true,
                            widgetProps: {type: "number", min: 1, max: 5, step: 1},
                        },
                    },
                    {
                        render: "#Field",
                        permissions: {read: "authorName", write: "authorName"},
                        field: {
                            name: "authorName",
                            widget: "#Input",
                            label: "form.authorNameLabel",
                            placeholder: "form.authorNamePlaceholder",
                            required: true,
                            widgetProps: {maxLength: CLINIC_REVIEW_AUTHOR_NAME_MAX},
                        },
                    },
                ],
            },
            {
                render: "#Field",
                permissions: {read: "comment", write: "comment"},
                field: {
                    name: "comment",
                    widget: "#Textarea",
                    label: "form.commentLabel",
                    placeholder: "form.commentPlaceholder",
                    widgetProps: {rows: 3, maxLength: CLINIC_REVIEW_COMMENT_MAX},
                },
            },
        ],
    },
];

export const clinicReviewCreateFormView: ViewConfig = {
    model: "clinicreviews",
    viewType: "form",
    viewMode: "create",
    accessModel: "clinicreviews",
    apiUrl: API_URL,
    method: "PUT",
    nodes: clinicReviewCreateFormNodes,
};

export const clinicReviewEditFormView: ViewConfig = {
    model: "clinicreviews",
    viewType: "form",
    viewMode: "edit",
    accessModel: "clinicreviews",
    apiUrl: API_URL,
    method: "PATCH",
    nodes: clinicReviewEditFormNodes,
};

export const clinicReviewViews: ViewConfig[] = [
    clinicReviewSheetView,
    clinicReviewCreateFormView,
    clinicReviewEditFormView,
];
