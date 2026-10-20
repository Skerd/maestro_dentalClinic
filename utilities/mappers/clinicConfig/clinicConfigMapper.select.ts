import type {ApiSelectDatum} from "armonia/src/modules/core/types/shared.types";
import type {IClinicConfig} from "@dentalClinicModule/database/schemas/clinicConfig/clinicConfig";

export function clinicConfigsToSelect(configs: IClinicConfig[]): ApiSelectDatum[] {
    return configs.map((config) => ({value: config._id.toString(), label: config._id.toString()}));
}
