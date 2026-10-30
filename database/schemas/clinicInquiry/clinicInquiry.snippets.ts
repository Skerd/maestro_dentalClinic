import type {ClinicInquirySimple} from "armonia/src/modules/dentalClinic/dto/clinicInquiry.dto";
import type {IClinicInquiry} from "./clinicInquiry";
import {defineSnippet} from "@coreModule/database/utilities/snippet";

export const ClinicInquirySimpleSnippet = defineSnippet<IClinicInquiry, ClinicInquirySimple>()({
    keys: {
        _id: {},
        number: {},
    },
});
