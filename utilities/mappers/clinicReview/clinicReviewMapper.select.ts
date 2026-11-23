import type {ApiSelectDatum} from "armonia/src/modules/core/types/shared.types";
import type {IClinicReview} from "@dentalClinicModule/database/schemas/clinicReview/clinicReview";

export function clinicReviewsToSelect(records: IClinicReview[]): ApiSelectDatum[] {
    return records.map((record) => ({value: record._id.toString(), label: record.authorName}));
}
