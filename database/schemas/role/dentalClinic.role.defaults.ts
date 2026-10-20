import type {DefaultRoleDefinition} from "@coreModule/database/schemas/role/role.defaults";

// RolePermission groups are the capitalised collection names.
const CATALOGUE = ["Cliniclocations", "Clinicservices", "Practitioners"];
const APPOINTMENTS = ["Appointments"];
const TIME_OFF = ["Scheduleexceptions"];
const SETTINGS = ["Clinicconfigs"];

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

export const dentalClinicDefaultRoles: DefaultRoleDefinition[] = [
    clinicRole(
        "Clinic Admin",
        "clinic_admin",
        "Runs the clinic: settings, locations, treatments, the team and their schedules, time off and every appointment.",
        [...SETTINGS, ...CATALOGUE, ...TIME_OFF, ...APPOINTMENTS],
        [],
    ),
    clinicRole(
        "Receptionist",
        "clinic_receptionist",
        "Works the front desk: books, moves, confirms and cancels appointments and enters time off. Cannot change treatments, the team or settings.",
        [...APPOINTMENTS, ...TIME_OFF],
        [...CATALOGUE],
    ),
    // Linked to their practitioner profile, a dentist sees and acts on only their own appointments.
    clinicRole(
        "Dentist",
        "clinic_dentist",
        "Sees their own appointments and day, marks visits completed or missed, and sees their own time off.",
        [...APPOINTMENTS],
        [...CATALOGUE, ...TIME_OFF],
    ),
];
