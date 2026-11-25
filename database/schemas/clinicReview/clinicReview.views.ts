import type {ViewConfig} from "armonia/src/modules/core/api/auxiliary/private/viewConfig";
import {lifecycleSheetGroup} from "@coreModule/database/schemas/shared/lifecycleSheetGroup";

const API_URL = "/api/dentalClinic/clinicReview";

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

/** No create or edit form: the patient writes the review from their appointment email's link, staff only publish it. */
export const clinicReviewViews: ViewConfig[] = [clinicReviewSheetView];
