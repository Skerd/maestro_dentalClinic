import {Document, model, Schema, SchemaTypes, Types} from "mongoose";
import {ICurrency} from "@coreModule/database/schemas/currency/currency";
import {IUser} from "@coreModule/database/schemas/user/user";
import {normalizeSchemaPermissions} from "@coreModule/database/utilities";
import ownershipPlugin from "@coreModule/database/plugins/ownershipPlugin";
import auditPlugin from "@coreModule/database/plugins/auditPlugin";
import softDeletePlugin from "@coreModule/database/plugins/softDeletePlugin";
import lifeCyclePlugin from "@coreModule/database/plugins/lifeCyclePlugin";
import {ILifeCyclePluginFields, IOwnershipPluginFields, ISoftDeletePluginFields} from "@coreModule/database/types/plugin-fields";
import {addModelData} from "@coreModule/database/collections";
import {COLUMN_TYPE} from "armonia/src/modules/core/database/filter/typeOperators";
import {CurrencySimpleSnippet} from "@coreModule/database/schemas/currency/currency.snippets";
import {SimpleBlankUserSnippet} from "@coreModule/database/schemas/user/user.snippets";
import {
    APPOINTMENT_CANCELLED_BY,
    APPOINTMENT_SOURCES,
    APPOINTMENT_STATUSES,
    APPOINTMENT_TIMELINE_EVENTS,
    type AppointmentStatus,
    type AppointmentTimelineEvent,
} from "armonia/src/modules/dentalClinic/api/dentalClinic/private/appointment/appointment.constants";
import {CLINIC_SERVICE_PRICE_TYPES, type ClinicServicePriceType} from "armonia/src/modules/dentalClinic/api/dentalClinic/private/clinicService/clinicService.schema-def";
import type {IClinicService} from "../clinicService/clinicService";
import type {IClinicLocation} from "../clinicLocation/clinicLocation";
import type {IPractitioner} from "../practitioner/practitioner";
import {ClinicServiceSimpleSnippet} from "../clinicService/clinicService.snippets";
import {ClinicLocationSimpleSnippet} from "../clinicLocation/clinicLocation.snippets";
import {PractitionerSimpleSnippet} from "../practitioner/practitioner.snippets";
import {applyAppointmentIndexes} from "./appointment.indexes";
import {appointmentViews} from "./appointment.views";

/** Server-managed: written only by the booking service and the appointment actions. */
const NoWritePermission = {self: {write: "no-permission"}, others: {write: "no-permission"}};

export type IAppointmentSnapshot = {
    serviceName: string;
    durationMinutes: number;
    priceType: ClinicServicePriceType;
    price?: number;
    practitionerName: string;
    locationName: string;
    locationAddress?: string;
    timezone: string;
};

export interface IAppointment extends Document, IOwnershipPluginFields, ISoftDeletePluginFields, ILifeCyclePluginFields {
    number: string;
    status: AppointmentStatus;
    source: (typeof APPOINTMENT_SOURCES)[number];
    /** Where an online booking was made: the clinic's own site or the central portal. Emails link back there. */
    bookedVia: "site" | "portal";
    service: IClinicService;
    location: IClinicLocation;
    practitioner: IPractitioner;
    customer?: IUser;
    /** The treatment itself, as the patient sees it. */
    startAt: Date;
    endAt: Date;
    /** The treatment plus the service's buffers: the time the dentist is busy. */
    blockedStart: Date;
    blockedEnd: Date;
    patient: {firstName: string; lastName: string; email: string; phone: string};
    note?: string;
    snapshot: IAppointmentSnapshot;
    currency?: ICurrency | Types.ObjectId;
    policy: {cancellationDeadlineHours: number; rescheduleDeadlineHours: number};
    consent?: {version?: string; at: Date};
    idempotencyKey: string;
    timeline: {event: AppointmentTimelineEvent; at: Date; by?: Types.ObjectId; note?: string}[];
    rescheduleCount: number;
    cancelledAt?: Date;
    cancelledBy?: (typeof APPOINTMENT_CANCELLED_BY)[number];
    cancellationReason?: string;
    /** Bumped to invalidate every guest "manage appointment" link issued before. */
    manageTokenVersion: number;
    reminderSentAt?: Date;
    /** Set when the retention purge removed the patient's details. */
    anonymizedAt?: Date;
}

const refField = (ref: string, refAllowlist: unknown, refDisplayKey: string[]) => ({
    type: SchemaTypes.ObjectId,
    ref,
    required: true,
    refAllowlist,
    permissions: NoWritePermission,
    dynamicTableConfiguration: {refDisplayKey},
});

/** Nested copies of a booking stay on the sheet. The list shows the booking itself. */
const hiddenNestedColumn = {hideColumn: true, filterable: false, sortable: false};

const AppointmentSchema = new Schema<IAppointment>(
    {
        number: {type: SchemaTypes.String, required: true, immutable: true, permissions: NoWritePermission},
        status: {
            type: SchemaTypes.String,
            enum: APPOINTMENT_STATUSES,
            required: true,
            // Writable by permission only so roles can be granted the lifecycle actions
            // (they gate on write:status); the CRUD edit route itself changes nothing.
            dynamicTableConfiguration: {
                enumTones: {pending: "warning", confirmed: "info", completed: "success", cancelled: "neutral", no_show: "danger"},
            },
        },
        source: {type: SchemaTypes.String, enum: APPOINTMENT_SOURCES, required: true, immutable: true, permissions: NoWritePermission},
        bookedVia: {type: SchemaTypes.String, enum: ["site", "portal"], default: "site", immutable: true, permissions: NoWritePermission},
        service: {...refField("ClinicService", ClinicServiceSimpleSnippet, ["name"]), immutable: true},
        location: {...refField("ClinicLocation", ClinicLocationSimpleSnippet, ["name"]), immutable: true},
        practitioner: refField("Practitioner", PractitionerSimpleSnippet, ["displayName"]),
        customer: {
            type: SchemaTypes.ObjectId,
            ref: "User",
            refAllowlist: SimpleBlankUserSnippet,
            permissions: NoWritePermission,
            dynamicTableConfiguration: {refDisplayKey: ["name", "surname"]},
        },
        startAt: {type: SchemaTypes.Date, required: true, permissions: NoWritePermission, dynamicTableConfiguration: {cellType: COLUMN_TYPE.DATETIME}},
        endAt: {type: SchemaTypes.Date, required: true, permissions: NoWritePermission, dynamicTableConfiguration: {cellType: COLUMN_TYPE.DATETIME}},
        blockedStart: {type: SchemaTypes.Date, required: true, permissions: NoWritePermission, dynamicTableConfiguration: {hideColumn: true}},
        blockedEnd: {type: SchemaTypes.Date, required: true, permissions: NoWritePermission, dynamicTableConfiguration: {hideColumn: true}},
        patient: {
            type: {
                firstName: {type: SchemaTypes.String, required: true, trim: true, dynamicTableConfiguration: hiddenNestedColumn},
                lastName: {type: SchemaTypes.String, required: true, trim: true, dynamicTableConfiguration: hiddenNestedColumn},
                email: {type: SchemaTypes.String, required: true, trim: true, lowercase: true, dynamicTableConfiguration: hiddenNestedColumn},
                phone: {type: SchemaTypes.String, required: true, trim: true, dynamicTableConfiguration: hiddenNestedColumn},
            },
            required: true,
            permissions: NoWritePermission,
            dynamicTableConfiguration: {filterable: false, sortable: false, hideColumn: true},
        },
        note: {type: SchemaTypes.String, permissions: NoWritePermission, dynamicTableConfiguration: {hideColumn: true, filterable: false}},
        snapshot: {
            type: {
                serviceName: {type: SchemaTypes.String, required: true, dynamicTableConfiguration: hiddenNestedColumn},
                durationMinutes: {type: SchemaTypes.Number, required: true, dynamicTableConfiguration: hiddenNestedColumn},
                priceType: {type: SchemaTypes.String, enum: CLINIC_SERVICE_PRICE_TYPES, required: true, dynamicTableConfiguration: hiddenNestedColumn},
                price: {type: SchemaTypes.Number, dynamicTableConfiguration: hiddenNestedColumn},
                practitionerName: {type: SchemaTypes.String, required: true, dynamicTableConfiguration: hiddenNestedColumn},
                locationName: {type: SchemaTypes.String, required: true, dynamicTableConfiguration: hiddenNestedColumn},
                locationAddress: {type: SchemaTypes.String, dynamicTableConfiguration: hiddenNestedColumn},
                timezone: {type: SchemaTypes.String, required: true, dynamicTableConfiguration: hiddenNestedColumn},
            },
            required: true,
            permissions: NoWritePermission,
            dynamicTableConfiguration: {filterable: false, sortable: false, hideColumn: true},
        },
        currency: {
            type: SchemaTypes.ObjectId,
            ref: "Currency",
            refAllowlist: CurrencySimpleSnippet,
            permissions: NoWritePermission,
            dynamicTableConfiguration: {hideColumn: true, refDisplayKey: ["abbreviation"]},
        },
        policy: {
            type: {
                cancellationDeadlineHours: {type: SchemaTypes.Number, required: true, dynamicTableConfiguration: hiddenNestedColumn},
                rescheduleDeadlineHours: {type: SchemaTypes.Number, required: true, dynamicTableConfiguration: hiddenNestedColumn},
            },
            required: true,
            permissions: NoWritePermission,
            dynamicTableConfiguration: {filterable: false, sortable: false, hideColumn: true},
        },
        consent: {
            type: {
                version: {type: SchemaTypes.String, dynamicTableConfiguration: hiddenNestedColumn},
                at: {type: SchemaTypes.Date, required: true, dynamicTableConfiguration: hiddenNestedColumn},
            },
            required: false,
            permissions: NoWritePermission,
            dynamicTableConfiguration: {filterable: false, sortable: false, hideColumn: true},
        },
        idempotencyKey: {type: SchemaTypes.String, required: true, immutable: true, permissions: NoWritePermission, dynamicTableConfiguration: {hideColumn: true, filterable: false}},
        timeline: {
            type: [{
                _id: false,
                event: {type: SchemaTypes.String, enum: APPOINTMENT_TIMELINE_EVENTS, required: true, dynamicTableConfiguration: hiddenNestedColumn},
                at: {type: SchemaTypes.Date, required: true, dynamicTableConfiguration: hiddenNestedColumn},
                by: {type: SchemaTypes.ObjectId, ref: "User", dynamicTableConfiguration: hiddenNestedColumn},
                note: {type: SchemaTypes.String, dynamicTableConfiguration: hiddenNestedColumn},
            }],
            default: [],
            permissions: NoWritePermission,
            dynamicTableConfiguration: {filterable: false, sortable: false, hideColumn: true},
        },
        rescheduleCount: {type: SchemaTypes.Number, default: 0, permissions: NoWritePermission, dynamicTableConfiguration: {hideColumn: true}},
        cancelledAt: {type: SchemaTypes.Date, permissions: NoWritePermission, dynamicTableConfiguration: {hideColumn: true, cellType: COLUMN_TYPE.DATETIME}},
        cancelledBy: {type: SchemaTypes.String, enum: APPOINTMENT_CANCELLED_BY, permissions: NoWritePermission, dynamicTableConfiguration: {hideColumn: true}},
        cancellationReason: {type: SchemaTypes.String, permissions: NoWritePermission, dynamicTableConfiguration: {hideColumn: true}},
        manageTokenVersion: {type: SchemaTypes.Number, default: 1, permissions: NoWritePermission, dynamicTableConfiguration: {hideColumn: true, filterable: false}},
        reminderSentAt: {type: SchemaTypes.Date, permissions: NoWritePermission, dynamicTableConfiguration: {hideColumn: true}},
        anonymizedAt: {type: SchemaTypes.Date, permissions: NoWritePermission, dynamicTableConfiguration: {hideColumn: true}},
    },
    {accessMode: "loose"},
);

ownershipPlugin(AppointmentSchema);
auditPlugin(AppointmentSchema);
softDeletePlugin(AppointmentSchema);
lifeCyclePlugin(AppointmentSchema);
applyAppointmentIndexes(AppointmentSchema);
const Appointment = model<IAppointment>("Appointment", AppointmentSchema);
normalizeSchemaPermissions(Appointment);
export default Appointment;

addModelData(Appointment, appointmentViews);
