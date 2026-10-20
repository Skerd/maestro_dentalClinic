import type {IClinicService} from "@dentalClinicModule/database/schemas/clinicService/clinicService";
import type {ClinicService} from "armonia/src/modules/dentalClinic/api/dentalClinic/private/clinicService/clinicService.dto";
import {mapMedia} from "@coreModule/utilities/mappers/common.mapper";
import {mapLifeCycleToDTO, mapOwnershipToDTO, mapSoftDeleteToDTO} from "@coreModule/utilities/mappers/plugin/pluginMappers.dto";

export function clinicServiceToDTO(service: IClinicService): ClinicService {
    return {
        _id: service._id.toString(),
        name: service.name,
        slug: service.slug,
        description: service.description,
        images: service.images?.length ? service.images.map(mapMedia).filter((media) => media !== undefined) : undefined,
        durationMinutes: service.durationMinutes,
        bufferBeforeMinutes: service.bufferBeforeMinutes ?? 0,
        bufferAfterMinutes: service.bufferAfterMinutes ?? 0,
        priceType: service.priceType,
        price: service.price,
        onlineBookable: service.onlineBookable,
        isPublic: service.isPublic,
        isActive: service.isActive,
        sortOrder: service.sortOrder ?? 0,
        ...mapSoftDeleteToDTO(service),
        ...mapOwnershipToDTO(service),
        ...mapLifeCycleToDTO(service),
    };
}

export function clinicServicesToDTO(services: IClinicService[]): ClinicService[] {
    return services.map(clinicServiceToDTO);
}
