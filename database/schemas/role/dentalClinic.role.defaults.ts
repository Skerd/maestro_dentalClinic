import type {DefaultRoleDefinition} from "@coreModule/database/schemas/role/role.defaults";

// RolePermission groups are the capitalised collection names.
const CATALOGUE = ["Cliniclocations", "Clinicservices", "Practitioners"];
const APPOINTMENTS = ["Appointments"];
const TIME_OFF = ["Scheduleexceptions"];
const SETTINGS = ["Clinicconfigs"];
const PATIENTS = ["Patients"];
const REQUESTS = ["Clinicinquiries", "Clinicmessages"];
const PLANS = ["Treatmentplans"];

function clinicRole(
    name: string,
    slug: string,
    description: string,
    permissionGroups: string[],
    readPermissionGroups: string[],
): DefaultRoleDefinition {
    return {
        name,
        slug,
        description,
        isAdmin: false,
        isSignupDefault: false,
        canEdit: true,
        canDelete: false,
        permissionGroups,
        readPermissionGroups,
    };
}

/**
 * A patient's account in the clinic: given when they become its patient (their folder is
 * opened from their account). No panel access at all; it marks whose patient they are.
 */
export const clinicPatientRole: DefaultRoleDefinition = clinicRole(
    "Patient",
    "clinic_patient",
    "A patient of the clinic, added when their patient folder is linked to their account. Has no access to the panel.",
    [],
    [],
);

export const dentalClinicDefaultRoles: DefaultRoleDefinition[] = [
    clinicRole(
        "Clinic Admin",
        "clinic_admin",
        "Runs the clinic: settings, locations, treatments, the team and their schedules, time off, every appointment, patient folder and estimate request.",
        [...SETTINGS, ...CATALOGUE, ...TIME_OFF, ...APPOINTMENTS, ...PATIENTS, ...REQUESTS, ...PLANS],
        [],
    ),
    clinicRole(
        "Receptionist",
        "clinic_receptionist",
        "Works the front desk: books, moves, confirms and cancels appointments, keeps patient folders up to date and enters time off. Cannot change treatments, the team or settings.",
        [...APPOINTMENTS, ...TIME_OFF, ...PATIENTS],
        [...CATALOGUE, ...REQUESTS, ...PLANS],
    ),
    // Linked to their practitioner profile, a dentist sees and acts on only their own appointments.
    clinicRole(
        "Dentist",
        "clinic_dentist",
        "Sees their own appointments and day, marks visits completed or missed, writes treatment plans and quotes, sees their own time off and reads patient folders.",
        [...APPOINTMENTS, ...PLANS],
        [...CATALOGUE, ...TIME_OFF, ...PATIENTS, ...REQUESTS],
    ),
    // Answers estimate requests from abroad: asks for X-rays, talks to the patient, opens their folder.
    clinicRole(
        "Patient Coordinator",
        "clinic_coordinator",
        "Works the estimate requests from the portal and the clinic's site: answers patients, asks for X-rays and photos, prepares and sends quotes, opens their patient folder. Reads the treatments, team and appointments.",
        [...REQUESTS, ...PATIENTS, ...PLANS],
        [...CATALOGUE, ...APPOINTMENTS],
    ),
    clinicPatientRole,
];
