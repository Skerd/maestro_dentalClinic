import type {IClinicReview} from "@dentalClinicModule/database/schemas/clinicReview/clinicReview";
import type {ClinicReview} from "armonia/src/modules/dentalClinic/api/dentalClinic/private/clinicReview/clinicReview.dto";
import type {AppointmentSimple} from "armonia/src/modules/dentalClinic/dto/appointment.dto";
import {AppointmentSimpleSnippet} from "@dentalClinicModule/database/schemas/appointment/appointment.snippets";
import {mapSnippet} from "@coreModule/utilities/mappers/common.mapper";
import {mapLifeCycleToDTO, mapOwnershipToDTO, mapSoftDeleteToDTO} from "@coreModule/utilities/mappers/plugin/pluginMappers.dto";

export function clinicReviewToDTO(review: IClinicReview): ClinicReview {
    return {
        _id: review._id.toString(),
        appointment: mapSnippet<AppointmentSimple>()(review.appointment, AppointmentSimpleSnippet),
        rating: review.rating,
        comment: review.comment,
        authorName: review.authorName,
        isPublished: review.isPublished,
        ...mapSoftDeleteToDTO(review),
        ...mapOwnershipToDTO(review),
        ...mapLifeCycleToDTO(review),
    };
}

export function clinicReviewsToDTO(records: IClinicReview[]): ClinicReview[] {
    return records.map(clinicReviewToDTO);
}
