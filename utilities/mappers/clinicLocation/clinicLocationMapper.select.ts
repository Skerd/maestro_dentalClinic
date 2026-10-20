import type {ApiSelectDatum} from "armonia/src/modules/core/types/shared.types";
import type {IClinicLocation} from "@dentalClinicModule/database/schemas/clinicLocation/clinicLocation";

export function clinicLocationsToSelect(locations: IClinicLocation[]): ApiSelectDatum[] {
    return locations.map((location) => ({value: location._id.toString(), label: location.name}));
}
