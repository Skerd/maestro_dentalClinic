import type {Model} from "mongoose";
import ClinicConfig from "@dentalClinicModule/database/schemas/clinicConfig/clinicConfig";
import ClinicLocation from "@dentalClinicModule/database/schemas/clinicLocation/clinicLocation";
import ClinicService from "@dentalClinicModule/database/schemas/clinicService/clinicService";
import Practitioner from "@dentalClinicModule/database/schemas/practitioner/practitioner";
import ScheduleException from "@dentalClinicModule/database/schemas/scheduleException/scheduleException";
import Appointment from "@dentalClinicModule/database/schemas/appointment/appointment";
import Patient from "@dentalClinicModule/database/schemas/patient/patient";
import ClinicInquiry from "@dentalClinicModule/database/schemas/clinicInquiry/clinicInquiry";
import ClinicMessage from "@dentalClinicModule/database/schemas/clinicMessage/clinicMessage";
import TreatmentPlan from "@dentalClinicModule/database/schemas/treatmentPlan/treatmentPlan";
import ClinicReview from "@dentalClinicModule/database/schemas/clinicReview/clinicReview";
import {registerDefaultRoles} from "@coreModule/database/schemas/role/role.defaults";
import {registerPublicMediaBackfillSource} from "@coreModule/utilities/media/publicMediaBackfillRegistry";
import {dentalClinicDefaultRoles} from "@dentalClinicModule/database/schemas/role/dentalClinic.role.defaults";
import {ClinicServiceSchemaDef} from "armonia/src/modules/dentalClinic/api/dentalClinic/private/clinicService/clinicService.schema-def";
import {PractitionerSchemaDef} from "armonia/src/modules/dentalClinic/api/dentalClinic/private/practitioner/practitioner.schema-def";
import {ClinicConfigSchemaDef} from "armonia/src/modules/dentalClinic/api/dentalClinic/private/clinicConfig/clinicConfig.schema-def";
import {clinicConfigService} from "@dentalClinicModule/database/schemas/clinicConfig/clinicConfig.service";
import type {SelfServeBusinessType} from "@coreModule/domain/company/selfServeBusinessTypes";
import type {AccountVerifiedHook} from "@coreModule/utilities/modules/moduleCompanyDefaults";
import {claimGuestAppointments} from "@dentalClinicModule/workflows/guestAppointmentClaim";

export const dentalClinicModels: Model<any>[] = [
    ClinicConfig,
    ClinicLocation,
    ClinicService,
    Practitioner,
    ScheduleException,
    Patient,
    Appointment,
    ClinicInquiry,
    ClinicMessage,
    TreatmentPlan,
    ClinicReview,
];

export async function dropDentalClinicCollections(): Promise<void> {
    for (const model of dentalClinicModels) {
        try {
            await model.collection.drop();
        } catch {
            // collection may not exist
        }
    }
}

registerDefaultRoles(dentalClinicDefaultRoles);
registerPublicMediaBackfillSource({
    name: "ClinicService",
    schemaDef: ClinicServiceSchemaDef,
    loadModel: () => import("@dentalClinicModule/database/schemas/clinicService/clinicService").then((m) => m.default),
});
registerPublicMediaBackfillSource({
    name: "Practitioner",
    schemaDef: PractitionerSchemaDef,
    loadModel: () => import("@dentalClinicModule/database/schemas/practitioner/practitioner").then((m) => m.default),
});
registerPublicMediaBackfillSource({
    name: "ClinicConfig",
    schemaDef: ClinicConfigSchemaDef,
    loadModel: () => import("@dentalClinicModule/database/schemas/clinicConfig/clinicConfig").then((m) => m.default),
});

/** A dental clinic may sign itself up on the portal; it is listed there once the platform approves it (D178). */
const selfServeBusinessTypes: SelfServeBusinessType[] = [{
    key: "dentalClinic",
    modules: ["dentalClinic"],
    onCreated: async ({company, session, logger, languageCode}) => {
        const config = await clinicConfigService.getOrCreateForCompany(company._id, {session, logger, languageCode});
        // Booking online on, too: the portal and the company's own site show only a business that takes bookings, so
        // without it a self-serve business never appeared anywhere (P23.12). With nothing set up yet there is nothing
        // to book; the owner can turn it off in the settings.
        await clinicConfigService.updateOne({_id: config._id}, {$set: {listedOnPortal: true, publicBookingEnabled: true}}, {session, logger});
    },
}];

/** A guest's appointments, and the clinic's folder they opened, become theirs once their email is verified (P23.9). */
const onAccountVerified: AccountVerifiedHook = claimGuestAppointments;

export const moduleBootstrap = {
    models: dentalClinicModels,
    dropModuleCollections: dropDentalClinicCollections,
    defaultRoles: dentalClinicDefaultRoles,
    selfServeBusinessTypes,
    onAccountVerified,
};
