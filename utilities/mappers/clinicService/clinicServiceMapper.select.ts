import type {ApiSelectDatum} from "armonia/src/modules/core/types/shared.types";
import type {IClinicService} from "@dentalClinicModule/database/schemas/clinicService/clinicService";

export function clinicServicesToSelect(services: IClinicService[]): ApiSelectDatum[] {
    return services.map((service) => ({value: service._id.toString(), label: service.name}));
}
