import type {ApiSelectDatum} from "armonia/src/modules/core/types/shared.types";
import type {IPractitioner} from "@dentalClinicModule/database/schemas/practitioner/practitioner";

export function practitionersToSelect(practitioners: IPractitioner[]): ApiSelectDatum[] {
    return practitioners.map((practitioner) => ({value: practitioner._id.toString(), label: practitioner.displayName}));
}
