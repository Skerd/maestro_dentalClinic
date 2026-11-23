import type {DefaultRoleDefinition} from "@coreModule/database/schemas/role/role.defaults";

// RolePermission groups are the capitalised collection names.
const CATALOGUE = ["Cliniclocations", "Clinicservices", "Practitioners"];
const APPOINTMENTS = ["Appointments"];
const TIME_OFF = ["Scheduleexceptions"];
const SETTINGS = ["Clinicconfigs"];
const PATIENTS = ["Patients"];
const REQUESTS = ["Clinicinquiries", "Clinicmessages"];
const PLANS = ["Treatmentplans"];
const TRIPS = ["Patienttrips"];
/** Patients' reviews: whoever works the front desk publishes them, as a rental counter does (D178). */
const REVIEWS = ["Clinicreviews"];
/** Medical history and the X-rays/photos of a request (SEC-06): only for the roles that treat or quote. */
const HEALTH = [...PATIENTS, ...REQUESTS];

function clinicRole(
    name: string,
    slug: string,
    description: string,
    permissionGroups: string[],
    readPermissionGroups: string[],
    sensitivePermissionGroups: string[] = [],
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
        sensitivePermissionGroups,
    };
}

export const dentalClinicDefaultRoles: DefaultRoleDefinition[] = [
    clinicRole(
        "Clinic Admin",
        "clinic_admin",
        "Runs the clinic: settings, locations, treatments, the team and their schedules, time off, every appointment, patient folder, estimate request, patient trip and patient review.",
        [...SETTINGS, ...CATALOGUE, ...TIME_OFF, ...APPOINTMENTS, ...PATIENTS, ...REQUESTS, ...PLANS, ...TRIPS, ...REVIEWS],
        [],
        HEALTH,
    ),
    clinicRole(
        "Receptionist",
        "clinic_receptionist",
        "Works the front desk: books, moves, confirms and cancels appointments, keeps patient folders and trips (arrivals, airport pickups) up to date, enters time off and publishes patients' reviews. Cannot change treatments, the team or settings, and does not see medical histories, X-rays or photos.",
        [...APPOINTMENTS, ...TIME_OFF, ...PATIENTS, ...TRIPS, ...REVIEWS],
        [...CATALOGUE, ...REQUESTS, ...PLANS],
    ),
    // Linked to their practitioner profile, a dentist sees and acts on only their own appointments.
    clinicRole(
        "Dentist",
        "clinic_dentist",
        "Sees their own appointments and day, marks visits completed or missed, writes treatment plans and quotes, sees their own time off and reads patient folders.",
        [...APPOINTMENTS, ...PLANS],
        [...CATALOGUE, ...TIME_OFF, ...PATIENTS, ...REQUESTS, ...TRIPS, ...REVIEWS],
        HEALTH,
    ),
    // Answers estimate requests from abroad: asks for X-rays, talks to the patient, opens their folder.
    clinicRole(
        "Patient Coordinator",
        "clinic_coordinator",
        "Works the estimate requests from the portal and the clinic's site: answers patients, asks for X-rays and photos, prepares and sends quotes, opens their patient folder and plans their trips. Reads the treatments, team and appointments.",
        [...REQUESTS, ...PATIENTS, ...PLANS, ...TRIPS],
        [...CATALOGUE, ...APPOINTMENTS, ...REVIEWS],
        HEALTH,
    ),
];
