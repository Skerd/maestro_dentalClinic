import type {ViewConfig} from "armonia/src/modules/core/api/auxiliary/private/viewConfig";
import {lifecycleSheetGroup} from "@coreModule/database/schemas/shared/lifecycleSheetGroup";
import {
    PATIENT_LANGUAGES,
    PATIENT_SOURCES,
} from "armonia/src/modules/dentalClinic/constants";
import {
    PATIENT_CITY_MAX,
    PATIENT_NAME_MAX,
    PATIENT_NOTES_MAX,
    PATIENT_PHONE_MAX,
    PATIENT_POSTAL_CODE_MAX,
    PATIENT_PRACTICE_MAX,
    PATIENT_RELATION_MAX,
    PATIENT_SEXES,
    PATIENT_STREET_MAX,
    PATIENT_TAG_MAX,
} from "armonia/src/modules/dentalClinic/api/dentalClinic/private/patient/patient.schema-def";

const API_URL = "/api/dentalClinic/patient";

const sexOptions = PATIENT_SEXES.map((value) => ({
    value,
    label: `form.sex.${value}`,
}));

const languageOptions = PATIENT_LANGUAGES.map((value) => ({
    value,
    label: `form.language.${value}`,
}));

const sourceOptions = PATIENT_SOURCES.map((value) => ({
    value,
    label: `form.source.${value}`,
}));

export const patientSheetView: ViewConfig = {
    model: "patients",
    viewType: "sheet",
    accessModel: "patients",
    apiUrl: API_URL,
    header: {
        titleField: "number",
        subtitleKey: "patientSubtitle",
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
                            permissions: {read: "firstName"},
                            field: {
                                name: "firstName",
                                widget: "#DisplayCard",
                                label: "firstName",
                                widgetProps: {icon: "#IconUser"},
                            },
                        },
                        {
                            render: "#DisplayCard",
                            permissions: {read: "lastName"},
                            field: {
                                name: "lastName",
                                widget: "#DisplayCard",
                                label: "lastName",
                                widgetProps: {icon: "#IconUser"},
                            },
                        },
                        {
                            render: "#DisplayCard",
                            permissions: {read: "dateOfBirth"},
                            field: {
                                name: "dateOfBirth",
                                widget: "#DisplayCard",
                                label: "dateOfBirth",
                                widgetProps: {
                                    icon: "#IconCake",
                                    format: "date",
                                    type: "date",
                                },
                            },
                        },
                        {
                            render: "#DisplayCard",
                            permissions: {read: "sex"},
                            field: {
                                name: "sex",
                                widget: "#DisplayCard",
                                label: "sex",
                                widgetProps: {
                                    icon: "#IconGenderBigender",
                                    type: "enum",
                                    languageKeyCategory: "sexValues",
                                },
                            },
                        },
                        {
                            render: "#DisplayCard",
                            permissions: {read: "preferredLanguage"},
                            field: {
                                name: "preferredLanguage",
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
                            permissions: {read: "account"},
                            field: {
                                name: "account.name",
                                widget: "#DisplayCard",
                                label: "account",
                                widgetProps: {icon: "#IconUserCircle"},
                            },
                        },
                        {
                            render: "#DisplayCard",
                            permissions: {read: "tags"},
                            field: {
                                name: "tags",
                                widget: "#DisplayCard",
                                label: "tags",
                                widgetProps: {icon: "#IconTags"},
                            },
                        },
                    ],
                },
            ],
        },
        {
            render: "#SheetGroup",
            props: {title: "contact"},
            children: [
                {
                    render: "#SheetGrid",
                    props: {columns: 3},
                    children: [
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
                            permissions: {read: "phone"},
                            field: {
                                name: "phone",
                                widget: "#DisplayCard",
                                label: "phone",
                                widgetProps: {icon: "#IconPhone"},
                            },
                        },
                        {
                            render: "#DisplayCard",
                            permissions: {read: "whatsapp"},
                            field: {
                                name: "whatsapp",
                                widget: "#DisplayCard",
                                label: "whatsapp",
                                widgetProps: {icon: "#IconBrandWhatsapp"},
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
                        {
                            render: "#DisplayCard",
                            permissions: {read: "address"},
                            field: {
                                name: "address.city",
                                widget: "#DisplayCard",
                                label: "city",
                                widgetProps: {icon: "#IconBuilding"},
                            },
                        },
                        {
                            render: "#DisplayCard",
                            permissions: {read: "address"},
                            field: {
                                name: "address.street",
                                widget: "#DisplayCard",
                                label: "street",
                                widgetProps: {icon: "#IconMapPin"},
                            },
                        },
                        {
                            render: "#DisplayCard",
                            permissions: {read: "address"},
                            field: {
                                name: "address.postalCode",
                                widget: "#DisplayCard",
                                label: "postalCode",
                                widgetProps: {icon: "#IconMailbox"},
                            },
                        },
                    ],
                },
            ],
        },
        {
            render: "#SheetGroup",
            props: {title: "emergencyContact"},
            children: [
                {
                    render: "#SheetGrid",
                    props: {columns: 3},
                    children: [
                        {
                            render: "#DisplayCard",
                            permissions: {read: "emergencyContact"},
                            field: {
                                name: "emergencyContact.name",
                                widget: "#DisplayCard",
                                label: "emergencyContactName",
                                widgetProps: {icon: "#IconUser"},
                            },
                        },
                        {
                            render: "#DisplayCard",
                            permissions: {read: "emergencyContact"},
                            field: {
                                name: "emergencyContact.phone",
                                widget: "#DisplayCard",
                                label: "emergencyContactPhone",
                                widgetProps: {icon: "#IconPhone"},
                            },
                        },
                        {
                            render: "#DisplayCard",
                            permissions: {read: "emergencyContact"},
                            field: {
                                name: "emergencyContact.relation",
                                widget: "#DisplayCard",
                                label: "emergencyContactRelation",
                                widgetProps: {icon: "#IconUsers"},
                            },
                        },
                    ],
                },
            ],
        },
        {
            render: "#SheetGroup",
            props: {title: "homeDentist"},
            children: [
                {
                    render: "#SheetGrid",
                    props: {columns: 2},
                    children: [
                        {
                            render: "#DisplayCard",
                            permissions: {read: "homeDentist"},
                            field: {
                                name: "homeDentist.name",
                                widget: "#DisplayCard",
                                label: "homeDentistName",
                                widgetProps: {icon: "#IconStethoscope"},
                            },
                        },
                        {
                            render: "#DisplayCard",
                            permissions: {read: "homeDentist"},
                            field: {
                                name: "homeDentist.practice",
                                widget: "#DisplayCard",
                                label: "homeDentistPractice",
                                widgetProps: {icon: "#IconBuildingHospital"},
                            },
                        },
                        {
                            render: "#DisplayCard",
                            permissions: {read: "homeDentist"},
                            field: {
                                name: "homeDentist.email",
                                widget: "#DisplayCard",
                                label: "homeDentistEmail",
                                widgetProps: {icon: "#IconMail"},
                            },
                        },
                        {
                            render: "#DisplayCard",
                            permissions: {read: "homeDentist"},
                            field: {
                                name: "homeDentist.phone",
                                widget: "#DisplayCard",
                                label: "homeDentistPhone",
                                widgetProps: {icon: "#IconPhone"},
                            },
                        },
                    ],
                },
            ],
        },
        {
            render: "#SheetGroup",
            props: {title: "notesGroup"},
            children: [
                {
                    render: "#DisplayCard",
                    permissions: {read: "notes"},
                    field: {
                        name: "notes",
                        widget: "#DisplayCard",
                        label: "notes",
                        widgetProps: {icon: "#IconNotes"},
                    },
                },
            ],
        },
        lifecycleSheetGroup,
    ],
};

const patientCreateFormNodes: ViewConfig["nodes"] = [
    {
        render: "#TitleWithCollapse",
        props: {title: "form.basicsSectionTitle"},
        children: [
            {
                render: "#FormGrid",
                props: {columns: 2},
                children: [
                    {
                        render: "#Field",
                        field: {
                            name: "firstName",
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
                            name: "lastName",
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
                            name: "dateOfBirth",
                            widget: "#DateInput",
                            label: "form.dateOfBirthLabel",
                            placeholder: "form.dateOfBirthPlaceholder",
                            widgetProps: {valueFormat: "YYYY-MM-DD"},
                        },
                    },
                    {
                        render: "#Field",
                        field: {
                            name: "sex",
                            widget: "#Select",
                            label: "form.sexLabel",
                            placeholder: "form.sexPlaceholder",
                            widgetProps: {
                                options: sexOptions,
                                className: "grow w-full",
                            },
                        },
                    },
                    {
                        render: "#Field",
                        field: {
                            name: "preferredLanguage",
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
        props: {title: "form.contactSectionTitle"},
        children: [
            {
                render: "#FormGrid",
                props: {columns: 2},
                children: [
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
                    {
                        render: "#Field",
                        field: {
                            name: "phone",
                            widget: "#Input",
                            label: "form.phoneLabel",
                            placeholder: "form.phonePlaceholder",
                            widgetProps: {maxLength: PATIENT_PHONE_MAX},
                        },
                    },
                    {
                        render: "#Field",
                        field: {
                            name: "whatsapp",
                            widget: "#Input",
                            label: "form.whatsappLabel",
                            placeholder: "form.whatsappPlaceholder",
                            widgetProps: {maxLength: PATIENT_PHONE_MAX},
                        },
                    },
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
                                normalizeEmptyToUndefined: true,
                            },
                        },
                    },
                    {
                        render: "#Field",
                        field: {
                            name: "address.city",
                            widget: "#Input",
                            label: "form.cityLabel",
                            placeholder: "form.cityPlaceholder",
                            widgetProps: {maxLength: PATIENT_CITY_MAX},
                        },
                    },
                    {
                        render: "#Field",
                        field: {
                            name: "address.street",
                            widget: "#Input",
                            label: "form.streetLabel",
                            placeholder: "form.streetPlaceholder",
                            widgetProps: {maxLength: PATIENT_STREET_MAX},
                        },
                    },
                    {
                        render: "#Field",
                        field: {
                            name: "address.postalCode",
                            widget: "#Input",
                            label: "form.postalCodeLabel",
                            placeholder: "form.postalCodePlaceholder",
                            widgetProps: {maxLength: PATIENT_POSTAL_CODE_MAX},
                        },
                    },
                ],
            },
        ],
    },
    {
        render: "#TitleWithCollapse",
        props: {title: "form.emergencyContactSectionTitle"},
        children: [
            {
                render: "#FormGrid",
                props: {columns: 3},
                children: [
                    {
                        render: "#Field",
                        field: {
                            name: "emergencyContact.name",
                            widget: "#Input",
                            label: "form.emergencyContactNameLabel",
                            placeholder: "form.emergencyContactNamePlaceholder",
                            widgetProps: {maxLength: PATIENT_NAME_MAX},
                        },
                    },
                    {
                        render: "#Field",
                        field: {
                            name: "emergencyContact.phone",
                            widget: "#Input",
                            label: "form.emergencyContactPhoneLabel",
                            placeholder:
                                "form.emergencyContactPhonePlaceholder",
                            widgetProps: {maxLength: PATIENT_PHONE_MAX},
                        },
                    },
                    {
                        render: "#Field",
                        field: {
                            name: "emergencyContact.relation",
                            widget: "#Input",
                            label: "form.emergencyContactRelationLabel",
                            placeholder:
                                "form.emergencyContactRelationPlaceholder",
                            widgetProps: {maxLength: PATIENT_RELATION_MAX},
                        },
                    },
                ],
            },
        ],
    },
    {
        render: "#TitleWithCollapse",
        props: {title: "form.homeDentistSectionTitle"},
        children: [
            {
                render: "#FormGrid",
                props: {columns: 2},
                children: [
                    {
                        render: "#Field",
                        field: {
                            name: "homeDentist.name",
                            widget: "#Input",
                            label: "form.homeDentistNameLabel",
                            placeholder: "form.homeDentistNamePlaceholder",
                            widgetProps: {maxLength: PATIENT_NAME_MAX},
                        },
                    },
                    {
                        render: "#Field",
                        field: {
                            name: "homeDentist.practice",
                            widget: "#Input",
                            label: "form.homeDentistPracticeLabel",
                            placeholder: "form.homeDentistPracticePlaceholder",
                            widgetProps: {maxLength: PATIENT_PRACTICE_MAX},
                        },
                    },
                    {
                        render: "#Field",
                        field: {
                            name: "homeDentist.email",
                            widget: "#Input",
                            label: "form.homeDentistEmailLabel",
                            placeholder: "form.homeDentistEmailPlaceholder",
                            widgetProps: {type: "email"},
                        },
                    },
                    {
                        render: "#Field",
                        field: {
                            name: "homeDentist.phone",
                            widget: "#Input",
                            label: "form.homeDentistPhoneLabel",
                            placeholder: "form.homeDentistPhonePlaceholder",
                            widgetProps: {maxLength: PATIENT_PHONE_MAX},
                        },
                    },
                ],
            },
        ],
    },
    {
        render: "#TitleWithCollapse",
        props: {title: "form.notesSectionTitle"},
        children: [
            {
                render: "#Field",
                field: {
                    name: "tags",
                    widget: "#StringArrayInput",
                    label: "form.tagsLabel",
                    placeholder: "form.tagsPlaceholder",
                    widgetProps: {
                        removeTooltipKey: "form.removeItem",
                        maxLength: PATIENT_TAG_MAX,
                    },
                },
            },
            {
                render: "#Field",
                field: {
                    name: "notes",
                    widget: "#Textarea",
                    label: "form.notesLabel",
                    placeholder: "form.notesPlaceholder",
                    widgetProps: {
                        rows: 4,
                        maxLength: PATIENT_NOTES_MAX,
                        className:
                            "field-sizing-fixed max-h-56 min-h-24 overflow-y-auto",
                    },
                },
            },
        ],
    },
    {
        render: "#FormAlert",
        props: {message: "form.notesHint"},
    },
];

const patientEditFormNodes: ViewConfig["nodes"] = [
    {
        render: "#TitleWithCollapse",
        props: {title: "form.basicsSectionTitle"},
        permissions: {readAny: ["firstName", "lastName", "dateOfBirth", "sex", "preferredLanguage", "source"], writeAny: ["firstName", "lastName", "dateOfBirth", "sex", "preferredLanguage", "source"]},
        children: [
            {
                render: "#FormGrid",
                props: {columns: 2},
                permissions: {
                    readAny: [
                        "firstName",
                        "lastName",
                        "dateOfBirth",
                        "sex",
                        "preferredLanguage",
                        "source",
                    ],
                    writeAny: [
                        "firstName",
                        "lastName",
                        "dateOfBirth",
                        "sex",
                        "preferredLanguage",
                        "source",
                    ],
                },
                children: [
                    {
                        render: "#Field",
                        permissions: {read: "firstName", write: "firstName"},
                        field: {
                            name: "firstName",
                            widget: "#Input",
                            label: "form.firstNameLabel",
                            placeholder: "form.firstNamePlaceholder",
                            required: true,
                            widgetProps: {maxLength: PATIENT_NAME_MAX},
                        },
                    },
                    {
                        render: "#Field",
                        permissions: {read: "lastName", write: "lastName"},
                        field: {
                            name: "lastName",
                            widget: "#Input",
                            label: "form.lastNameLabel",
                            placeholder: "form.lastNamePlaceholder",
                            required: true,
                            widgetProps: {maxLength: PATIENT_NAME_MAX},
                        },
                    },
                    {
                        render: "#Field",
                        permissions: {read: "dateOfBirth", write: "dateOfBirth"},
                        field: {
                            name: "dateOfBirth",
                            widget: "#DateInput",
                            label: "form.dateOfBirthLabel",
                            placeholder: "form.dateOfBirthPlaceholder",
                            widgetProps: {valueFormat: "YYYY-MM-DD"},
                        },
                    },
                    {
                        render: "#Field",
                        permissions: {read: "sex", write: "sex"},
                        field: {
                            name: "sex",
                            widget: "#Select",
                            label: "form.sexLabel",
                            placeholder: "form.sexPlaceholder",
                            widgetProps: {
                                options: sexOptions,
                                className: "grow w-full",
                            },
                        },
                    },
                    {
                        render: "#Field",
                        permissions: {
                            read: "preferredLanguage",
                            write: "preferredLanguage",
                        },
                        field: {
                            name: "preferredLanguage",
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
                        permissions: {read: "source", write: "source"},
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
        props: {title: "form.contactSectionTitle"},
        permissions: {
            readAny: [
                "email",
                "phone",
                "whatsapp",
                "address.country",
                "address.city",
                "address.street",
                "address.postalCode",
            ],
            writeAny: [
                "email",
                "phone",
                "whatsapp",
                "address.country",
                "address.city",
                "address.street",
                "address.postalCode",
            ],
        },
        children: [
            {
                render: "#FormGrid",
                props: {columns: 2},
                children: [
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
                    {
                        render: "#Field",
                        permissions: {read: "phone", write: "phone"},
                        field: {
                            name: "phone",
                            widget: "#Input",
                            label: "form.phoneLabel",
                            placeholder: "form.phonePlaceholder",
                            widgetProps: {maxLength: PATIENT_PHONE_MAX},
                        },
                    },
                    {
                        render: "#Field",
                        permissions: {read: "whatsapp", write: "whatsapp"},
                        field: {
                            name: "whatsapp",
                            widget: "#Input",
                            label: "form.whatsappLabel",
                            placeholder: "form.whatsappPlaceholder",
                            widgetProps: {maxLength: PATIENT_PHONE_MAX},
                        },
                    },
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
                                normalizeEmptyToUndefined: true,
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
                            widget: "#Input",
                            label: "form.cityLabel",
                            placeholder: "form.cityPlaceholder",
                            widgetProps: {maxLength: PATIENT_CITY_MAX},
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
                            widgetProps: {maxLength: PATIENT_STREET_MAX},
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
                            widgetProps: {maxLength: PATIENT_POSTAL_CODE_MAX},
                        },
                    },
                ],
            },
        ],
    },
    {
        render: "#TitleWithCollapse",
        props: {title: "form.emergencyContactSectionTitle"},
        permissions: {
            readAny: [
                "emergencyContact.name",
                "emergencyContact.phone",
                "emergencyContact.relation",
            ],
            writeAny: [
                "emergencyContact.name",
                "emergencyContact.phone",
                "emergencyContact.relation",
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
                            read: "emergencyContact.name",
                            write: "emergencyContact.name",
                        },
                        field: {
                            name: "emergencyContact.name",
                            widget: "#Input",
                            label: "form.emergencyContactNameLabel",
                            placeholder: "form.emergencyContactNamePlaceholder",
                            widgetProps: {maxLength: PATIENT_NAME_MAX},
                        },
                    },
                    {
                        render: "#Field",
                        permissions: {
                            read: "emergencyContact.phone",
                            write: "emergencyContact.phone",
                        },
                        field: {
                            name: "emergencyContact.phone",
                            widget: "#Input",
                            label: "form.emergencyContactPhoneLabel",
                            placeholder:
                                "form.emergencyContactPhonePlaceholder",
                            widgetProps: {maxLength: PATIENT_PHONE_MAX},
                        },
                    },
                    {
                        render: "#Field",
                        permissions: {
                            read: "emergencyContact.relation",
                            write: "emergencyContact.relation",
                        },
                        field: {
                            name: "emergencyContact.relation",
                            widget: "#Input",
                            label: "form.emergencyContactRelationLabel",
                            placeholder:
                                "form.emergencyContactRelationPlaceholder",
                            widgetProps: {maxLength: PATIENT_RELATION_MAX},
                        },
                    },
                ],
            },
        ],
    },
    {
        render: "#TitleWithCollapse",
        props: {title: "form.homeDentistSectionTitle"},
        permissions: {
            readAny: [
                "homeDentist.name",
                "homeDentist.practice",
                "homeDentist.email",
                "homeDentist.phone",
            ],
            writeAny: [
                "homeDentist.name",
                "homeDentist.practice",
                "homeDentist.email",
                "homeDentist.phone",
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
                            read: "homeDentist.name",
                            write: "homeDentist.name",
                        },
                        field: {
                            name: "homeDentist.name",
                            widget: "#Input",
                            label: "form.homeDentistNameLabel",
                            placeholder: "form.homeDentistNamePlaceholder",
                            widgetProps: {maxLength: PATIENT_NAME_MAX},
                        },
                    },
                    {
                        render: "#Field",
                        permissions: {
                            read: "homeDentist.practice",
                            write: "homeDentist.practice",
                        },
                        field: {
                            name: "homeDentist.practice",
                            widget: "#Input",
                            label: "form.homeDentistPracticeLabel",
                            placeholder: "form.homeDentistPracticePlaceholder",
                            widgetProps: {maxLength: PATIENT_PRACTICE_MAX},
                        },
                    },
                    {
                        render: "#Field",
                        permissions: {
                            read: "homeDentist.email",
                            write: "homeDentist.email",
                        },
                        field: {
                            name: "homeDentist.email",
                            widget: "#Input",
                            label: "form.homeDentistEmailLabel",
                            placeholder: "form.homeDentistEmailPlaceholder",
                            widgetProps: {type: "email"},
                        },
                    },
                    {
                        render: "#Field",
                        permissions: {
                            read: "homeDentist.phone",
                            write: "homeDentist.phone",
                        },
                        field: {
                            name: "homeDentist.phone",
                            widget: "#Input",
                            label: "form.homeDentistPhoneLabel",
                            placeholder: "form.homeDentistPhonePlaceholder",
                            widgetProps: {maxLength: PATIENT_PHONE_MAX},
                        },
                    },
                ],
            },
        ],
    },
    {
        render: "#TitleWithCollapse",
        props: {title: "form.notesSectionTitle"},
        permissions: {
            readAny: ["tags", "notes"],
            writeAny: ["tags", "notes"],
        },
        children: [
            {
                render: "#Field",
                permissions: {read: "tags", write: "tags"},
                field: {
                    name: "tags",
                    widget: "#StringArrayInput",
                    label: "form.tagsLabel",
                    placeholder: "form.tagsPlaceholder",
                    widgetProps: {
                        removeTooltipKey: "form.removeItem",
                        maxLength: PATIENT_TAG_MAX,
                    },
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
                    widgetProps: {
                        rows: 4,
                        maxLength: PATIENT_NOTES_MAX,
                        className:
                            "field-sizing-fixed max-h-56 min-h-24 overflow-y-auto",
                    },
                },
            },
        ],
    },
    {
        render: "#FormAlert",
        props: {message: "form.notesHint"},
    },
];

export const patientCreateFormView: ViewConfig = {
    model: "patients",
    viewType: "form",
    viewMode: "create",
    accessModel: "patients",
    apiUrl: API_URL,
    method: "PUT",
    nodes: patientCreateFormNodes,
};

export const patientEditFormView: ViewConfig = {
    model: "patients",
    viewType: "form",
    viewMode: "edit",
    accessModel: "patients",
    apiUrl: API_URL,
    method: "PATCH",
    nodes: patientEditFormNodes,
};

export const patientViews: ViewConfig[] = [
    patientSheetView,
    patientCreateFormView,
    patientEditFormView,
];
