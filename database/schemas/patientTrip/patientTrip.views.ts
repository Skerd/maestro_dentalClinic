import type {ViewConfig} from "armonia/src/modules/core/api/auxiliary/private/viewConfig";
import {lifecycleSheetGroup} from "@coreModule/database/schemas/shared/lifecycleSheetGroup";
import {PATIENT_TRIP_STATUSES} from "armonia/src/modules/dentalClinic/constants";
import {
    PATIENT_TRIP_ACCOMMODATION_MAX,
    PATIENT_TRIP_COMPANIONS,
    PATIENT_TRIP_FLIGHT_MAX,
    PATIENT_TRIP_NOTES_MAX,
    PATIENT_TRIP_PHASE,
} from "armonia/src/modules/dentalClinic/api/dentalClinic/private/patientTrip/patientTrip.schema-def";

const API_URL = "/api/dentalClinic/patientTrip";

const statusOptions = PATIENT_TRIP_STATUSES.map((value) => ({
    value,
    label: `form.status.${value}`,
}));

export const patientTripSheetView: ViewConfig = {
    model: "patienttrips",
    viewType: "sheet",
    accessModel: "patienttrips",
    apiUrl: API_URL,
    header: {
        titleField: "patient.number",
        subtitleKey: "tripSubtitle",
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
                            permissions: {read: "patient"},
                            field: {
                                name: "patient.number",
                                widget: "#DisplayCard",
                                label: "patient",
                                widgetProps: {icon: "#IconFolder"},
                            },
                        },
                        {
                            render: "#DisplayCard",
                            permissions: {read: "plan"},
                            dependent: "plan.number",
                            field: {
                                name: "plan.number",
                                widget: "#DisplayCard",
                                label: "plan",
                                widgetProps: {icon: "#IconFileInvoice"},
                            },
                        },
                        {
                            render: "#DisplayCard",
                            permissions: {read: "phase"},
                            dependent: "phase",
                            field: {
                                name: "phase",
                                widget: "#DisplayCard",
                                label: "phase",
                                widgetProps: {icon: "#IconStairs", type: "number"},
                            },
                        },
                        {
                            render: "#DisplayCard",
                            permissions: {read: "status"},
                            field: {
                                name: "status",
                                widget: "#DisplayCard",
                                label: "status",
                                widgetProps: {icon: "#IconStatusChange", type: "enum", languageKeyCategory: "statusValues"},
                            },
                        },
                        {
                            render: "#DisplayCard",
                            permissions: {read: "arrivalAt"},
                            field: {
                                name: "arrivalAt",
                                widget: "#DisplayCard",
                                label: "arrivalAt",
                                widgetProps: {icon: "#IconPlaneArrival", type: "dateTime"},
                            },
                        },
                        {
                            render: "#DisplayCard",
                            permissions: {read: "departureAt"},
                            dependent: "departureAt",
                            field: {
                                name: "departureAt",
                                widget: "#DisplayCard",
                                label: "departureAt",
                                widgetProps: {icon: "#IconPlaneDeparture", type: "dateTime"},
                            },
                        },
                        {
                            render: "#DisplayCard",
                            permissions: {read: "arrivalFlight"},
                            dependent: "arrivalFlight",
                            field: {
                                name: "arrivalFlight",
                                widget: "#DisplayCard",
                                label: "arrivalFlight",
                                widgetProps: {icon: "#IconPlane"},
                            },
                        },
                        {
                            render: "#DisplayCard",
                            permissions: {read: "departureFlight"},
                            dependent: "departureFlight",
                            field: {
                                name: "departureFlight",
                                widget: "#DisplayCard",
                                label: "departureFlight",
                                widgetProps: {icon: "#IconPlane"},
                            },
                        },
                        {
                            render: "#DisplayCard",
                            permissions: {read: "transfer"},
                            field: {
                                name: "transfer",
                                widget: "#DisplayCard",
                                label: "transfer",
                                widgetProps: {icon: "#IconCar", type: "boolean"},
                            },
                        },
                        {
                            render: "#DisplayCard",
                            permissions: {read: "companions"},
                            dependent: "companions",
                            field: {
                                name: "companions",
                                widget: "#DisplayCard",
                                label: "companions",
                                widgetProps: {icon: "#IconUsers", type: "number"},
                            },
                        },
                    ],
                },
            ],
        },
        {
            render: "#SheetGroup",
            props: {title: "stayGroup"},
            children: [
                {
                    render: "#DisplayCard",
                    permissions: {read: "accommodation"},
                    dependent: "accommodation",
                    field: {
                        name: "accommodation",
                        widget: "#DisplayCard",
                        label: "accommodation",
                        widgetProps: {icon: "#IconBed"},
                    },
                },
                {
                    render: "#DisplayCard",
                    permissions: {read: "notes"},
                    dependent: "notes",
                    field: {
                        name: "notes",
                        widget: "#DisplayCard",
                        label: "notes",
                        widgetProps: {icon: "#IconNotes", type: "longText"},
                    },
                },
            ],
        },
        lifecycleSheetGroup,
    ],
};

const patientTripCreateFormNodes: ViewConfig["nodes"] = [
    {
        render: "#TitleWithCollapse",
        props: {title: "form.whoSectionTitle"},
        children: [
            {
                render: "#FormGrid",
                props: {columns: 2},
                children: [
                    {
                        render: "#Field",
                        field: {
                            name: "patient",
                            widget: "#ApiSelect",
                            label: "form.patientLabel",
                            placeholder: "form.patientPlaceholder",
                            required: true,
                            widgetProps: {apiUrl: "/api/dentalClinic/patient/select", method: "POST", pageSize: 50, normalizeEmptyToUndefined: true},
                        },
                    },
                    {
                        render: "#Field",
                        field: {
                            name: "plan",
                            widget: "#ApiSelect",
                            label: "form.planLabel",
                            placeholder: "form.planPlaceholder",
                            widgetProps: {apiUrl: "/api/dentalClinic/treatmentPlan/select", method: "POST", pageSize: 50, normalizeEmptyToUndefined: true},
                        },
                    },
                    {
                        render: "#Field",
                        field: {
                            name: "phase",
                            widget: "#Input",
                            label: "form.phaseLabel",
                            placeholder: "form.phasePlaceholder",
                            widgetProps: {type: "number", min: PATIENT_TRIP_PHASE.min, max: PATIENT_TRIP_PHASE.max, step: 1},
                        },
                    },
                    {
                        render: "#Field",
                        field: {
                            name: "status",
                            widget: "#Select",
                            label: "form.statusLabel",
                            required: true,
                            widgetProps: {options: statusOptions, className: "grow w-full"},
                        },
                    },
                ],
            },
            {render: "#FormAlert", props: {message: "form.planHint"}},
        ],
    },
    {
        render: "#TitleWithCollapse",
        props: {title: "form.travelSectionTitle"},
        children: [
            {
                render: "#FormGrid",
                props: {columns: 2},
                children: [
                    {
                        render: "#Field",
                        field: {
                            name: "arrivalAt",
                            widget: "#DateInput",
                            label: "form.arrivalAtLabel",
                            placeholder: "form.arrivalAtPlaceholder",
                            required: true,
                            widgetProps: {valueFormat: "YYYY-MM-DD HH:mm"},
                        },
                    },
                    {
                        render: "#Field",
                        field: {
                            name: "departureAt",
                            widget: "#DateInput",
                            label: "form.departureAtLabel",
                            placeholder: "form.departureAtPlaceholder",
                            required: true,
                            widgetProps: {valueFormat: "YYYY-MM-DD HH:mm"},
                        },
                    },
                    {
                        render: "#Field",
                        field: {
                            name: "arrivalFlight",
                            widget: "#Input",
                            label: "form.arrivalFlightLabel",
                            placeholder: "form.arrivalFlightPlaceholder",
                            widgetProps: {maxLength: PATIENT_TRIP_FLIGHT_MAX},
                        },
                    },
                    {
                        render: "#Field",
                        field: {
                            name: "departureFlight",
                            widget: "#Input",
                            label: "form.departureFlightLabel",
                            placeholder: "form.departureFlightPlaceholder",
                            widgetProps: {maxLength: PATIENT_TRIP_FLIGHT_MAX},
                        },
                    },
                    {
                        render: "#Field",
                        field: {
                            name: "companions",
                            widget: "#Input",
                            label: "form.companionsLabel",
                            placeholder: "form.companionsPlaceholder",
                            widgetProps: {type: "number", min: PATIENT_TRIP_COMPANIONS.min, max: PATIENT_TRIP_COMPANIONS.max, step: 1},
                        },
                    },
                    {
                        render: "#Field",
                        field: {
                            name: "transfer",
                            widget: "#Switch",
                            label: "form.transferLabel",
                        },
                    },
                ],
            },
        ],
    },
    {
        render: "#TitleWithCollapse",
        props: {title: "form.stayNotesSectionTitle"},
        children: [
            {
                render: "#Field",
                field: {
                    name: "accommodation",
                    widget: "#Textarea",
                    label: "form.accommodationLabel",
                    placeholder: "form.accommodationPlaceholder",
                    widgetProps: {rows: 2, maxLength: PATIENT_TRIP_ACCOMMODATION_MAX},
                },
            },
            {
                render: "#Field",
                field: {
                    name: "notes",
                    widget: "#Textarea",
                    label: "form.notesLabel",
                    placeholder: "form.notesPlaceholder",
                    widgetProps: {rows: 3, maxLength: PATIENT_TRIP_NOTES_MAX},
                },
            },
        ],
    },
];

/** The same fields as create, each gated by the caller's permissions. */
const patientTripEditFormNodes: ViewConfig["nodes"] = [
    {
        render: "#TitleWithCollapse",
        props: {title: "form.whoSectionTitle"},
        permissions: {readAny: ["patient", "plan", "phase", "status"], writeAny: ["patient", "plan", "phase", "status"]},
        children: [
            {
                render: "#FormGrid",
                props: {columns: 2},
                children: [
                    {
                        render: "#Field",
                        permissions: {read: "patient", write: "patient"},
                        field: {
                            name: "patient",
                            widget: "#ApiSelect",
                            label: "form.patientLabel",
                            placeholder: "form.patientPlaceholder",
                            required: true,
                            widgetProps: {apiUrl: "/api/dentalClinic/patient/select", method: "POST", pageSize: 50, normalizeEmptyToUndefined: true},
                        },
                    },
                    {
                        render: "#Field",
                        permissions: {read: "plan", write: "plan"},
                        field: {
                            name: "plan",
                            widget: "#ApiSelect",
                            label: "form.planLabel",
                            placeholder: "form.planPlaceholder",
                            widgetProps: {apiUrl: "/api/dentalClinic/treatmentPlan/select", method: "POST", pageSize: 50, normalizeEmptyToUndefined: true},
                        },
                    },
                    {
                        render: "#Field",
                        permissions: {read: "phase", write: "phase"},
                        field: {
                            name: "phase",
                            widget: "#Input",
                            label: "form.phaseLabel",
                            placeholder: "form.phasePlaceholder",
                            widgetProps: {type: "number", min: PATIENT_TRIP_PHASE.min, max: PATIENT_TRIP_PHASE.max, step: 1},
                        },
                    },
                    {
                        render: "#Field",
                        permissions: {read: "status", write: "status"},
                        field: {
                            name: "status",
                            widget: "#Select",
                            label: "form.statusLabel",
                            required: true,
                            widgetProps: {options: statusOptions, className: "grow w-full"},
                        },
                    },
                ],
            },
            {render: "#FormAlert", props: {message: "form.planHint"}},
        ],
    },
    {
        render: "#TitleWithCollapse",
        props: {title: "form.travelSectionTitle"},
        permissions: {readAny: ["arrivalAt", "departureAt", "arrivalFlight", "departureFlight", "companions", "transfer"], writeAny: ["arrivalAt", "departureAt", "arrivalFlight", "departureFlight", "companions", "transfer"]},
        children: [
            {
                render: "#FormGrid",
                props: {columns: 2},
                children: [
                    {
                        render: "#Field",
                        permissions: {read: "arrivalAt", write: "arrivalAt"},
                        field: {
                            name: "arrivalAt",
                            widget: "#DateInput",
                            label: "form.arrivalAtLabel",
                            placeholder: "form.arrivalAtPlaceholder",
                            required: true,
                            widgetProps: {valueFormat: "YYYY-MM-DD HH:mm"},
                        },
                    },
                    {
                        render: "#Field",
                        permissions: {read: "departureAt", write: "departureAt"},
                        field: {
                            name: "departureAt",
                            widget: "#DateInput",
                            label: "form.departureAtLabel",
                            placeholder: "form.departureAtPlaceholder",
                            required: true,
                            widgetProps: {valueFormat: "YYYY-MM-DD HH:mm"},
                        },
                    },
                    {
                        render: "#Field",
                        permissions: {read: "arrivalFlight", write: "arrivalFlight"},
                        field: {
                            name: "arrivalFlight",
                            widget: "#Input",
                            label: "form.arrivalFlightLabel",
                            placeholder: "form.arrivalFlightPlaceholder",
                            widgetProps: {maxLength: PATIENT_TRIP_FLIGHT_MAX},
                        },
                    },
                    {
                        render: "#Field",
                        permissions: {read: "departureFlight", write: "departureFlight"},
                        field: {
                            name: "departureFlight",
                            widget: "#Input",
                            label: "form.departureFlightLabel",
                            placeholder: "form.departureFlightPlaceholder",
                            widgetProps: {maxLength: PATIENT_TRIP_FLIGHT_MAX},
                        },
                    },
                    {
                        render: "#Field",
                        permissions: {read: "companions", write: "companions"},
                        field: {
                            name: "companions",
                            widget: "#Input",
                            label: "form.companionsLabel",
                            placeholder: "form.companionsPlaceholder",
                            widgetProps: {type: "number", min: PATIENT_TRIP_COMPANIONS.min, max: PATIENT_TRIP_COMPANIONS.max, step: 1},
                        },
                    },
                    {
                        render: "#Field",
                        permissions: {read: "transfer", write: "transfer"},
                        field: {
                            name: "transfer",
                            widget: "#Switch",
                            label: "form.transferLabel",
                        },
                    },
                ],
            },
        ],
    },
    {
        render: "#TitleWithCollapse",
        props: {title: "form.stayNotesSectionTitle"},
        permissions: {readAny: ["accommodation", "notes"], writeAny: ["accommodation", "notes"]},
        children: [
            {
                render: "#Field",
                permissions: {read: "accommodation", write: "accommodation"},
                field: {
                    name: "accommodation",
                    widget: "#Textarea",
                    label: "form.accommodationLabel",
                    placeholder: "form.accommodationPlaceholder",
                    widgetProps: {rows: 2, maxLength: PATIENT_TRIP_ACCOMMODATION_MAX},
                },
            },
            {
                render: "#Field",
                permissions: {read: "notes", write: "notes"},
                field: {
                    name: "notes",
                    widget: "#Textarea",
                    label: "form.notesLabel",
                    placeholder: "form.notesPlaceholder",
                    widgetProps: {rows: 3, maxLength: PATIENT_TRIP_NOTES_MAX},
                },
            },
        ],
    },
];

export const patientTripCreateFormView: ViewConfig = {
    model: "patienttrips",
    viewType: "form",
    viewMode: "create",
    accessModel: "patienttrips",
    apiUrl: API_URL,
    method: "PUT",
    nodes: patientTripCreateFormNodes,
};

export const patientTripEditFormView: ViewConfig = {
    model: "patienttrips",
    viewType: "form",
    viewMode: "edit",
    accessModel: "patienttrips",
    apiUrl: API_URL,
    method: "PATCH",
    nodes: patientTripEditFormNodes,
};

export const patientTripViews: ViewConfig[] = [
    patientTripSheetView,
    patientTripCreateFormView,
    patientTripEditFormView,
];
