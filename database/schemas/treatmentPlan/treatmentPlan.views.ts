import type {ViewConfig} from "armonia/src/modules/core/api/auxiliary/private/viewConfig";
import {lifecycleSheetGroup} from "@coreModule/database/schemas/shared/lifecycleSheetGroup";
import {
    DEPOSIT_TYPES,
    TREATMENT_PLAN_LINE_KINDS,
    TREATMENT_PLAN_TEXT_MAX,
} from "armonia/src/modules/dentalClinic/constants";
import {
    TREATMENT_PLAN_DAYS,
    TREATMENT_PLAN_GAP_DAYS,
    TREATMENT_PLAN_LABEL_MAX,
    TREATMENT_PLAN_LINE_DETAIL_MAX,
    TREATMENT_PLAN_LINE_NAME_MAX,
    TREATMENT_PLAN_PHASE_TITLE_MAX,
    TREATMENT_PLAN_QUANTITY,
    TREATMENT_PLAN_REFUNDABLE_DAYS,
    TREATMENT_PLAN_VISITS,
    TREATMENT_PLAN_WARRANTY_YEARS,
} from "armonia/src/modules/dentalClinic/api/dentalClinic/private/treatmentPlan/treatmentPlan.schema-def";

const API_URL = "/api/dentalClinic/treatmentPlan";

const depositTypeOptions = DEPOSIT_TYPES.map((value) => ({
    value,
    label: `form.depositType.${value}`,
}));

const lineKindOptions = TREATMENT_PLAN_LINE_KINDS.map((value) => ({
    value,
    label: `form.lineKind.${value}`,
}));

export const treatmentPlanSheetView: ViewConfig = {
    model: "treatmentplans",
    viewType: "sheet",
    accessModel: "treatmentplans",
    apiUrl: API_URL,
    header: {
        titleField: "number",
        subtitleKey: "planSubtitle",
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
                            permissions: {read: "optionLabel"},
                            field: {
                                name: "optionLabel",
                                widget: "#DisplayCard",
                                label: "optionLabel",
                                widgetProps: {icon: "#IconTag"},
                            },
                        },
                        {
                            render: "#DisplayCard",
                            permissions: {read: "version"},
                            // Only a revision says which version it is; a first quote is just the quote.
                            dependent: "supersedes",
                            field: {
                                name: "version",
                                widget: "#DisplayCard",
                                label: "version",
                                widgetProps: {
                                    icon: "#IconVersions",
                                    type: "number",
                                },
                            },
                        },
                        {
                            render: "#DisplayCard",
                            permissions: {read: "inquiry"},
                            dependent: "inquiry.number",
                            field: {
                                name: "inquiry.number",
                                widget: "#DisplayCard",
                                label: "inquiry",
                                widgetProps: {icon: "#IconInbox"},
                            },
                        },
                        {
                            render: "#DisplayCard",
                            permissions: {read: "patient"},
                            dependent: "patient.number",
                            field: {
                                name: "patient.number",
                                widget: "#DisplayCard",
                                label: "patient",
                                widgetProps: {icon: "#IconFolder"},
                            },
                        },
                        {
                            render: "#DisplayCard",
                            permissions: {read: "validUntil"},
                            dependent: "validUntil",
                            field: {
                                name: "validUntil",
                                widget: "#DisplayCard",
                                label: "validUntil",
                                widgetProps: {icon: "#IconCalendarDue"},
                            },
                        },
                        {
                            render: "#DisplayCard",
                            permissions: {read: "sentAt"},
                            dependent: "sentAt",
                            field: {
                                name: "sentAt",
                                widget: "#DisplayCard",
                                label: "sentAt",
                                widgetProps: {
                                    icon: "#IconSend",
                                    type: "dateTime",
                                },
                            },
                        },
                        {
                            render: "#DisplayCard",
                            permissions: {read: "depositType"},
                            field: {
                                name: "depositType",
                                widget: "#DisplayCard",
                                label: "depositType",
                                widgetProps: {
                                    icon: "#IconCash",
                                    type: "enum",
                                    languageKeyCategory: "depositTypeValues",
                                },
                            },
                        },
                        {
                            render: "#DisplayCard",
                            permissions: {read: "totals"},
                            field: {
                                // What the deposit comes to, whichever way it was set (amount or percentage).
                                name: "totals.deposit",
                                widget: "#DisplayCard",
                                label: "depositAmount",
                                widgetProps: {
                                    icon: "#IconCoins",
                                    format: "locale",
                                    valuePath: ["currency.symbol", "totals.deposit"],
                                    // The amount opens its currency (UX-07).
                                    linkedRefPath: "currency",
                                    linkedSheetModel: "currencies",
                                    linkedSheetWidget: "#CurrencySheetView",
                                    linkedSheetEntityProp: "currency",
                                    joinSeparator: " ",
                                    type: "currency",
                                },
                            },
                        },
                        {
                            render: "#DisplayCard",
                            permissions: {read: "paymentStatus"},
                            field: {
                                name: "paymentStatus",
                                widget: "#DisplayCard",
                                label: "paymentStatus",
                                widgetProps: {
                                    icon: "#IconCreditCard",
                                    type: "enum",
                                    languageKeyCategory: "paymentStatusValues",
                                },
                            },
                        },
                        {
                            render: "#DisplayCard",
                            permissions: {read: "amountPaid"},
                            field: {
                                name: "amountPaid",
                                widget: "#DisplayCard",
                                label: "amountPaid",
                                widgetProps: {
                                    icon: "#IconReceipt",
                                    format: "locale",
                                    valuePath: ["currency.symbol", "amountPaid"],
                                    // The amount opens its currency (UX-07).
                                    linkedRefPath: "currency",
                                    linkedSheetModel: "currencies",
                                    linkedSheetWidget: "#CurrencySheetView",
                                    linkedSheetEntityProp: "currency",
                                    joinSeparator: " ",
                                    type: "currency",
                                },
                            },
                        },
                    ],
                },
            ],
        },
        {
            render: "#SheetGroup",
            props: {title: "breakdownGroup"},
            permissions: {read: "lines"},
            children: [
                {
                    render: "#PlanBreakdown",
                    permissions: {read: "lines"},
                    field: {name: "lines", widget: "#PlanBreakdown"},
                },
            ],
        },
        {
            render: "#SheetGroup",
            props: {title: "textsGroup"},
            dependentAny: ["notes", "terms"],
            children: [
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
                {
                    render: "#DisplayCard",
                    permissions: {read: "terms"},
                    dependent: "terms",
                    field: {
                        name: "terms",
                        widget: "#DisplayCard",
                        label: "terms",
                        widgetProps: {icon: "#IconFileText", type: "longText"},
                    },
                },
            ],
        },
        lifecycleSheetGroup,
    ],
};

const treatmentPlanCreateFormNodes: ViewConfig["nodes"] = [
    {
        render: "#TitleWithCollapse",
        props: {title: "form.targetSectionTitle"},
        children: [
            {
                render: "#FormGrid",
                props: {columns: 2},
                children: [
                    {
                        render: "#Field",
                        field: {
                            name: "inquiry",
                            widget: "#ApiSelect",
                            label: "form.inquiryLabel",
                            placeholder: "form.inquiryPlaceholder",
                            widgetProps: {
                                apiUrl: "/api/dentalClinic/clinicInquiry/select",
                                pageSize: 50,
                                normalizeEmptyToUndefined: true,
                            },
                        },
                    },
                    {
                        render: "#Field",
                        field: {
                            name: "patient",
                            widget: "#ApiSelect",
                            label: "form.patientLabel",
                            placeholder: "form.patientPlaceholder",
                            widgetProps: {
                                apiUrl: "/api/dentalClinic/patient/select",
                                pageSize: 50,
                                normalizeEmptyToUndefined: true,
                            },
                        },
                    },
                ],
            },
            {
                render: "#FormAlert",
                props: {message: "form.targetHint"},
            },
            {
                render: "#Field",
                field: {
                    name: "optionLabel",
                    widget: "#Input",
                    label: "form.optionLabelLabel",
                    placeholder: "form.optionLabelPlaceholder",
                    widgetProps: {maxLength: TREATMENT_PLAN_LABEL_MAX},
                },
            },
        ],
    },
    {
        render: "#Field",
        field: {
            name: "phases",
            widget: "#FormRepeater",
            widgetProps: {
                title: "form.phasesSectionTitle",
                arrayField: "phases",
                defaultItem: {
                    title: "",
                    visits: 1,
                    estimatedDays: 5,
                    minGapDaysAfterPrevious: 0,
                },
                addLabel: "form.phasesAddRow",
                removeLabel: "form.phasesRemoveRow",
                rowTitleFields: ["title"],
                rowTitlePlaceholder: "form.phasesRowTitle",
                rowTemplate: [
                    {
                        render: "#FormGrid",
                        props: {columns: 4},
                        children: [
                            {
                                render: "#Field",
                                field: {
                                    name: "title",
                                    widget: "#Input",
                                    label: "form.phaseTitleLabel",
                                    placeholder: "form.phaseTitlePlaceholder",
                                    required: true,
                                    widgetProps: {
                                        maxLength:
                                            TREATMENT_PLAN_PHASE_TITLE_MAX,
                                    },
                                },
                            },
                            {
                                render: "#Field",
                                field: {
                                    name: "visits",
                                    widget: "#Input",
                                    label: "form.phaseVisitsLabel",
                                    placeholder: "form.phaseVisitsPlaceholder",
                                    required: true,
                                    widgetProps: {
                                        type: "number",
                                        min: TREATMENT_PLAN_VISITS.min,
                                        max: TREATMENT_PLAN_VISITS.max,
                                        step: 1,
                                    },
                                },
                            },
                            {
                                render: "#Field",
                                field: {
                                    name: "estimatedDays",
                                    widget: "#Input",
                                    label: "form.phaseDaysLabel",
                                    placeholder: "form.phaseDaysPlaceholder",
                                    required: true,
                                    widgetProps: {
                                        type: "number",
                                        min: TREATMENT_PLAN_DAYS.min,
                                        max: TREATMENT_PLAN_DAYS.max,
                                        step: 1,
                                    },
                                },
                            },
                            {
                                render: "#Field",
                                field: {
                                    name: "minGapDaysAfterPrevious",
                                    widget: "#Input",
                                    label: "form.phaseGapLabel",
                                    placeholder: "form.phaseGapPlaceholder",
                                    widgetProps: {
                                        type: "number",
                                        min: TREATMENT_PLAN_GAP_DAYS.min,
                                        max: TREATMENT_PLAN_GAP_DAYS.max,
                                        step: 1,
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
            name: "lines",
            widget: "#FormRepeater",
            widgetProps: {
                title: "form.linesSectionTitle",
                arrayField: "lines",
                defaultItem: {
                    phase: 1,
                    kind: "treatment",
                    teeth: [],
                    quantity: 1,
                },
                addLabel: "form.linesAddRow",
                removeLabel: "form.linesRemoveRow",
                rowTitleFields: ["name"],
                rowTitlePlaceholder: "form.linesRowTitle",
                rowTemplate: [
                    {
                        render: "#FormGrid",
                        props: {columns: 3},
                        children: [
                            {
                                render: "#Field",
                                field: {
                                    name: "service",
                                    widget: "#ApiSelect",
                                    label: "form.lineServiceLabel",
                                    placeholder: "form.lineServicePlaceholder",
                                    description: "form.lineServiceDescription",
                                    widgetProps: {
                                        apiUrl: "/api/dentalClinic/clinicService/select",
                                        pageSize: 50,
                                        normalizeEmptyToUndefined: true,
                                    },
                                },
                            },
                            {
                                render: "#Field",
                                field: {
                                    name: "phase",
                                    widget: "#Select",
                                    label: "form.linePhaseLabel",
                                    placeholder: "form.linePhasePlaceholder",
                                    required: true,
                                    // Pick one of this quote's phases by number and title (TD-F58).
                                    widgetProps: {optionsFromFormArray: {arrayField: "phases", labelField: "title"}},
                                },
                            },
                            {
                                render: "#Field",
                                field: {
                                    name: "kind",
                                    widget: "#SimpleSelect",
                                    label: "form.lineKindLabel",
                                    required: true,
                                    widgetProps: {options: lineKindOptions},
                                },
                            },
                        ],
                    },
                    {
                        render: "#Field",
                        field: {
                            name: "name",
                            widget: "#Input",
                            label: "form.lineNameLabel",
                            placeholder: "form.lineNamePlaceholder",
                            widgetProps: {
                                maxLength: TREATMENT_PLAN_LINE_NAME_MAX,
                            },
                        },
                    },
                    {
                        render: "#Field",
                        field: {
                            name: "teeth",
                            widget: "#ToothPicker",
                            label: "form.lineTeethLabel",
                        },
                    },
                    {
                        render: "#FormGrid",
                        props: {columns: 3},
                        children: [
                            {
                                render: "#Field",
                                field: {
                                    name: "material",
                                    widget: "#Input",
                                    label: "form.lineMaterialLabel",
                                    placeholder: "form.lineMaterialPlaceholder",
                                    widgetProps: {
                                        maxLength:
                                            TREATMENT_PLAN_LINE_DETAIL_MAX,
                                    },
                                },
                            },
                            {
                                render: "#Field",
                                field: {
                                    name: "brand",
                                    widget: "#Input",
                                    label: "form.lineBrandLabel",
                                    placeholder: "form.lineBrandPlaceholder",
                                    widgetProps: {
                                        maxLength:
                                            TREATMENT_PLAN_LINE_DETAIL_MAX,
                                    },
                                },
                            },
                            {
                                render: "#Field",
                                field: {
                                    name: "warrantyYears",
                                    widget: "#Input",
                                    label: "form.lineWarrantyLabel",
                                    placeholder: "form.lineWarrantyPlaceholder",
                                    widgetProps: {
                                        type: "number",
                                        min: TREATMENT_PLAN_WARRANTY_YEARS.min,
                                        max: TREATMENT_PLAN_WARRANTY_YEARS.max,
                                        step: 1,
                                    },
                                },
                            },
                            {
                                render: "#Field",
                                field: {
                                    name: "quantity",
                                    widget: "#Input",
                                    label: "form.lineQuantityLabel",
                                    placeholder: "form.lineQuantityPlaceholder",
                                    required: true,
                                    widgetProps: {
                                        type: "number",
                                        min: TREATMENT_PLAN_QUANTITY.min,
                                        max: TREATMENT_PLAN_QUANTITY.max,
                                        step: 1,
                                    },
                                },
                            },
                            {
                                render: "#Field",
                                field: {
                                    name: "unitPrice",
                                    widget: "#Input",
                                    label: "form.lineUnitPriceLabel",
                                    placeholder:
                                        "form.lineUnitPricePlaceholder",
                                    description: "form.lineUnitPriceDescription",
                                    widgetProps: {
                                        type: "number",
                                        min: 0,
                                        step: "any",
                                    },
                                },
                            },
                            {
                                render: "#Field",
                                field: {
                                    name: "discount",
                                    widget: "#Input",
                                    label: "form.lineDiscountLabel",
                                    placeholder: "form.lineDiscountPlaceholder",
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
        },
    },
    {
        render: "#TitleWithCollapse",
        props: {title: "form.depositSectionTitle"},
        children: [
            {
                render: "#FormGrid",
                props: {columns: 2},
                children: [
                    {
                        render: "#Field",
                        field: {
                            name: "depositType",
                            widget: "#Select",
                            label: "form.depositTypeLabel",
                            placeholder: "form.depositTypePlaceholder",
                            required: true,
                            widgetProps: {
                                options: depositTypeOptions,
                                className: "grow w-full",
                            },
                        },
                    },
                    {
                        render: "#FormWhenFieldValueIn",
                        props: {
                            watchField: "depositType",
                            whenValues: ["fixed", "percent"],
                        },
                        children: [
                            {
                                render: "#Field",
                                field: {
                                    name: "depositValue",
                                    widget: "#Input",
                                    label: "form.depositValueLabel",
                                    placeholder: "form.depositValuePlaceholder",
                                    widgetProps: {
                                        type: "number",
                                        min: 0,
                                        step: "any",
                                    },
                                },
                            },
                        ],
                    },
                    {
                        render: "#Field",
                        field: {
                            name: "refundableUntilDays",
                            widget: "#Input",
                            label: "form.refundableUntilDaysLabel",
                            placeholder: "form.refundableUntilDaysPlaceholder",
                            widgetProps: {
                                type: "number",
                                min: TREATMENT_PLAN_REFUNDABLE_DAYS.min,
                                max: TREATMENT_PLAN_REFUNDABLE_DAYS.max,
                                step: 1,
                            },
                        },
                    },
                    {
                        render: "#Field",
                        field: {
                            name: "validUntil",
                            widget: "#DateInput",
                            label: "form.validUntilLabel",
                            placeholder: "form.validUntilPlaceholder",
                            widgetProps: {valueFormat: "YYYY-MM-DD"},
                        },
                    },
                ],
            },
        ],
    },
    {
        render: "#TitleWithCollapse",
        props: {title: "form.textsSectionTitle"},
        children: [
            {
                render: "#Field",
                field: {
                    name: "notes",
                    widget: "#Textarea",
                    label: "form.notesLabel",
                    placeholder: "form.notesPlaceholder",
                    widgetProps: {rows: 4, maxLength: TREATMENT_PLAN_TEXT_MAX},
                },
            },
            {
                render: "#Field",
                field: {
                    name: "terms",
                    widget: "#Textarea",
                    label: "form.termsLabel",
                    placeholder: "form.termsPlaceholder",
                    widgetProps: {rows: 4, maxLength: TREATMENT_PLAN_TEXT_MAX},
                },
            },
        ],
    },
    {
        render: "#FormAlert",
        props: {message: "form.disclaimerHint"},
    },
];

const treatmentPlanEditFormNodes: ViewConfig["nodes"] = [
    {
        render: "#TitleWithCollapse",
        props: {title: "form.targetSectionTitle"},
        permissions: {readAny: ["optionLabel"], writeAny: ["optionLabel"]},
        children: [
            {
                render: "#Field",
                permissions: {read: "optionLabel", write: "optionLabel"},
                field: {
                    name: "optionLabel",
                    widget: "#Input",
                    label: "form.optionLabelLabel",
                    placeholder: "form.optionLabelPlaceholder",
                    widgetProps: {maxLength: TREATMENT_PLAN_LABEL_MAX},
                },
            },
        ],
    },
    {
        render: "#Field",
        permissions: {read: "phases", write: "phases"},
        field: {
            name: "phases",
            widget: "#FormRepeater",
            widgetProps: {
                title: "form.phasesSectionTitle",
                arrayField: "phases",
                defaultItem: {
                    title: "",
                    visits: 1,
                    estimatedDays: 5,
                    minGapDaysAfterPrevious: 0,
                },
                addLabel: "form.phasesAddRow",
                removeLabel: "form.phasesRemoveRow",
                rowTitleFields: ["title"],
                rowTitlePlaceholder: "form.phasesRowTitle",
                rowTemplate: [
                    {
                        render: "#FormGrid",
                        props: {columns: 4},
                        children: [
                            {
                                render: "#Field",
                                field: {
                                    name: "title",
                                    widget: "#Input",
                                    label: "form.phaseTitleLabel",
                                    placeholder: "form.phaseTitlePlaceholder",
                                    required: true,
                                    widgetProps: {
                                        maxLength:
                                            TREATMENT_PLAN_PHASE_TITLE_MAX,
                                    },
                                },
                            },
                            {
                                render: "#Field",
                                field: {
                                    name: "visits",
                                    widget: "#Input",
                                    label: "form.phaseVisitsLabel",
                                    placeholder: "form.phaseVisitsPlaceholder",
                                    required: true,
                                    widgetProps: {
                                        type: "number",
                                        min: TREATMENT_PLAN_VISITS.min,
                                        max: TREATMENT_PLAN_VISITS.max,
                                        step: 1,
                                    },
                                },
                            },
                            {
                                render: "#Field",
                                field: {
                                    name: "estimatedDays",
                                    widget: "#Input",
                                    label: "form.phaseDaysLabel",
                                    placeholder: "form.phaseDaysPlaceholder",
                                    required: true,
                                    widgetProps: {
                                        type: "number",
                                        min: TREATMENT_PLAN_DAYS.min,
                                        max: TREATMENT_PLAN_DAYS.max,
                                        step: 1,
                                    },
                                },
                            },
                            {
                                render: "#Field",
                                field: {
                                    name: "minGapDaysAfterPrevious",
                                    widget: "#Input",
                                    label: "form.phaseGapLabel",
                                    placeholder: "form.phaseGapPlaceholder",
                                    widgetProps: {
                                        type: "number",
                                        min: TREATMENT_PLAN_GAP_DAYS.min,
                                        max: TREATMENT_PLAN_GAP_DAYS.max,
                                        step: 1,
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
        permissions: {read: "lines", write: "lines"},
        field: {
            name: "lines",
            widget: "#FormRepeater",
            widgetProps: {
                title: "form.linesSectionTitle",
                arrayField: "lines",
                defaultItem: {
                    phase: 1,
                    kind: "treatment",
                    teeth: [],
                    quantity: 1,
                },
                addLabel: "form.linesAddRow",
                removeLabel: "form.linesRemoveRow",
                rowTitleFields: ["name"],
                rowTitlePlaceholder: "form.linesRowTitle",
                rowTemplate: [
                    {
                        render: "#FormGrid",
                        props: {columns: 3},
                        children: [
                            {
                                render: "#Field",
                                field: {
                                    name: "service",
                                    widget: "#ApiSelect",
                                    label: "form.lineServiceLabel",
                                    placeholder: "form.lineServicePlaceholder",
                                    description: "form.lineServiceDescription",
                                    widgetProps: {
                                        apiUrl: "/api/dentalClinic/clinicService/select",
                                        pageSize: 50,
                                        normalizeEmptyToUndefined: true,
                                    },
                                },
                            },
                            {
                                render: "#Field",
                                field: {
                                    name: "phase",
                                    widget: "#Select",
                                    label: "form.linePhaseLabel",
                                    placeholder: "form.linePhasePlaceholder",
                                    required: true,
                                    // Pick one of this quote's phases by number and title (TD-F58).
                                    widgetProps: {optionsFromFormArray: {arrayField: "phases", labelField: "title"}},
                                },
                            },
                            {
                                render: "#Field",
                                field: {
                                    name: "kind",
                                    widget: "#SimpleSelect",
                                    label: "form.lineKindLabel",
                                    required: true,
                                    widgetProps: {options: lineKindOptions},
                                },
                            },
                        ],
                    },
                    {
                        render: "#Field",
                        field: {
                            name: "name",
                            widget: "#Input",
                            label: "form.lineNameLabel",
                            placeholder: "form.lineNamePlaceholder",
                            widgetProps: {
                                maxLength: TREATMENT_PLAN_LINE_NAME_MAX,
                            },
                        },
                    },
                    {
                        render: "#Field",
                        field: {
                            name: "teeth",
                            widget: "#ToothPicker",
                            label: "form.lineTeethLabel",
                        },
                    },
                    {
                        render: "#FormGrid",
                        props: {columns: 3},
                        children: [
                            {
                                render: "#Field",
                                field: {
                                    name: "material",
                                    widget: "#Input",
                                    label: "form.lineMaterialLabel",
                                    placeholder: "form.lineMaterialPlaceholder",
                                    widgetProps: {
                                        maxLength:
                                            TREATMENT_PLAN_LINE_DETAIL_MAX,
                                    },
                                },
                            },
                            {
                                render: "#Field",
                                field: {
                                    name: "brand",
                                    widget: "#Input",
                                    label: "form.lineBrandLabel",
                                    placeholder: "form.lineBrandPlaceholder",
                                    widgetProps: {
                                        maxLength:
                                            TREATMENT_PLAN_LINE_DETAIL_MAX,
                                    },
                                },
                            },
                            {
                                render: "#Field",
                                field: {
                                    name: "warrantyYears",
                                    widget: "#Input",
                                    label: "form.lineWarrantyLabel",
                                    placeholder: "form.lineWarrantyPlaceholder",
                                    widgetProps: {
                                        type: "number",
                                        min: TREATMENT_PLAN_WARRANTY_YEARS.min,
                                        max: TREATMENT_PLAN_WARRANTY_YEARS.max,
                                        step: 1,
                                    },
                                },
                            },
                            {
                                render: "#Field",
                                field: {
                                    name: "quantity",
                                    widget: "#Input",
                                    label: "form.lineQuantityLabel",
                                    placeholder: "form.lineQuantityPlaceholder",
                                    required: true,
                                    widgetProps: {
                                        type: "number",
                                        min: TREATMENT_PLAN_QUANTITY.min,
                                        max: TREATMENT_PLAN_QUANTITY.max,
                                        step: 1,
                                    },
                                },
                            },
                            {
                                render: "#Field",
                                field: {
                                    name: "unitPrice",
                                    widget: "#Input",
                                    label: "form.lineUnitPriceLabel",
                                    placeholder:
                                        "form.lineUnitPricePlaceholder",
                                    description: "form.lineUnitPriceDescription",
                                    widgetProps: {
                                        type: "number",
                                        min: 0,
                                        step: "any",
                                    },
                                },
                            },
                            {
                                render: "#Field",
                                field: {
                                    name: "discount",
                                    widget: "#Input",
                                    label: "form.lineDiscountLabel",
                                    placeholder: "form.lineDiscountPlaceholder",
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
        },
    },
    {
        render: "#TitleWithCollapse",
        props: {title: "form.depositSectionTitle"},
        permissions: {
            readAny: [
                "depositType",
                "depositValue",
                "refundableUntilDays",
                "validUntil",
            ],
            writeAny: [
                "depositType",
                "depositValue",
                "refundableUntilDays",
                "validUntil",
            ],
        },
        children: [
            {
                render: "#FormGrid",
                props: {columns: 2},
                children: [
                    {
                        render: "#Field",
                        permissions: {
                            read: "depositType",
                            write: "depositType",
                        },
                        field: {
                            name: "depositType",
                            widget: "#Select",
                            label: "form.depositTypeLabel",
                            placeholder: "form.depositTypePlaceholder",
                            required: true,
                            widgetProps: {
                                options: depositTypeOptions,
                                className: "grow w-full",
                            },
                        },
                    },
                    {
                        render: "#FormWhenFieldValueIn",
                        props: {
                            watchField: "depositType",
                            whenValues: ["fixed", "percent"],
                        },
                        children: [
                            {
                                render: "#Field",
                                permissions: {
                                    read: "depositValue",
                                    write: "depositValue",
                                },
                                field: {
                                    name: "depositValue",
                                    widget: "#Input",
                                    label: "form.depositValueLabel",
                                    placeholder: "form.depositValuePlaceholder",
                                    widgetProps: {
                                        type: "number",
                                        min: 0,
                                        step: "any",
                                    },
                                },
                            },
                        ],
                    },
                    {
                        render: "#Field",
                        permissions: {
                            read: "refundableUntilDays",
                            write: "refundableUntilDays",
                        },
                        field: {
                            name: "refundableUntilDays",
                            widget: "#Input",
                            label: "form.refundableUntilDaysLabel",
                            placeholder: "form.refundableUntilDaysPlaceholder",
                            widgetProps: {
                                type: "number",
                                min: TREATMENT_PLAN_REFUNDABLE_DAYS.min,
                                max: TREATMENT_PLAN_REFUNDABLE_DAYS.max,
                                step: 1,
                            },
                        },
                    },
                    {
                        render: "#Field",
                        permissions: {read: "validUntil", write: "validUntil"},
                        field: {
                            name: "validUntil",
                            widget: "#DateInput",
                            label: "form.validUntilLabel",
                            placeholder: "form.validUntilPlaceholder",
                            widgetProps: {valueFormat: "YYYY-MM-DD"},
                        },
                    },
                ],
            },
        ],
    },
    {
        render: "#TitleWithCollapse",
        props: {title: "form.textsSectionTitle"},
        permissions: {
            readAny: ["notes", "terms"],
            writeAny: ["notes", "terms"],
        },
        children: [
            {
                render: "#Field",
                permissions: {read: "notes", write: "notes"},
                field: {
                    name: "notes",
                    widget: "#Textarea",
                    label: "form.notesLabel",
                    placeholder: "form.notesPlaceholder",
                    widgetProps: {rows: 4, maxLength: TREATMENT_PLAN_TEXT_MAX},
                },
            },
            {
                render: "#Field",
                permissions: {read: "terms", write: "terms"},
                field: {
                    name: "terms",
                    widget: "#Textarea",
                    label: "form.termsLabel",
                    placeholder: "form.termsPlaceholder",
                    widgetProps: {rows: 4, maxLength: TREATMENT_PLAN_TEXT_MAX},
                },
            },
        ],
    },
    {
        render: "#FormAlert",
        props: {message: "form.disclaimerHint"},
    },
];

export const treatmentPlanCreateFormView: ViewConfig = {
    model: "treatmentplans",
    viewType: "form",
    viewMode: "create",
    accessModel: "treatmentplans",
    apiUrl: API_URL,
    method: "PUT",
    nodes: treatmentPlanCreateFormNodes,
};

/** Only drafts are edited; a sent quote is revised into a new draft. */
export const treatmentPlanEditFormView: ViewConfig = {
    model: "treatmentplans",
    viewType: "form",
    viewMode: "edit",
    accessModel: "treatmentplans",
    apiUrl: API_URL,
    method: "PATCH",
    nodes: treatmentPlanEditFormNodes,
};

export const treatmentPlanViews: ViewConfig[] = [
    treatmentPlanSheetView,
    treatmentPlanCreateFormView,
    treatmentPlanEditFormView,
];
