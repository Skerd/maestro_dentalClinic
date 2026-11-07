import {ObjectId} from "mongodb";
import {noEditClinicInquiryFormSchema} from "armonia/src/modules/dentalClinic/api/dentalClinic/private/clinicInquiry/noEditClinicInquiry.form.validator";
import {createCrudRouter, type CrudCreateParams} from "@coreModule/api/crudRouterFactory";
import type {CreateClinicInquiryFormType} from "armonia/src/modules/dentalClinic/api/dentalClinic/private/clinicInquiry/clinicInquiry.schema-def";
import {createClinicInquiryFormSchema} from "armonia/src/modules/dentalClinic/api/dentalClinic/private/clinicInquiry/clinicInquiry.form.validators";
import ClinicInquiry from "@dentalClinicModule/database/schemas/clinicInquiry/clinicInquiry";
import {clinicInquiryService} from "@dentalClinicModule/database/schemas/clinicInquiry/clinicInquiry.service";
import {ClinicInquiryActions} from "@dentalClinicModule/database/schemas/clinicInquiry/clinicInquiry.actions";
import {clinicInquiriesToDTO, clinicInquiryToDTO} from "@dentalClinicModule/utilities/mappers/clinicInquiry/clinicInquiryMapper.dto";
import {assertTreatments, staffInquiryRecord} from "@dentalClinicModule/utilities/services/inquiryIntake";
import {assertClinicMember} from "@dentalClinicModule/utilities/services/inquiryLifecycle";

export const basePath = "/api/dentalClinic/clinicInquiry";

const optionalId = (value: string | undefined) => (value ? new ObjectId(value) : undefined);

// Inquiries change only through ClinicInquiryActions (and the patient portal); PATCH is a no-op.
export const {router} = createCrudRouter({
    collectionName: "clinicinquiries",
    model: ClinicInquiry,
    service: clinicInquiryService,
    entityName: "ClinicInquiry",
    createSchema: createClinicInquiryFormSchema,
    editSchema: noEditClinicInquiryFormSchema,
    toDTO: clinicInquiryToDTO,
    toDTOArray: clinicInquiriesToDTO,
    toSelect: (inquiries) => inquiries.map((inquiry) => ({value: inquiry._id.toString(), label: `${inquiry.number} · ${inquiry.contact.firstName}`})),
    selectSearchField: "number",
    selectProjection: "_id number contact.firstName",
    defaultSort: {createdAt: -1},
    actions: ClinicInquiryActions,
    /** A lead the clinic enters itself: the contact is the clinic's own, so it is not masked. */
    buildCreateData: async (params: CrudCreateParams<CreateClinicInquiryFormType>) => {
        const {contact, languageCode} = params;
        const assignedTo = optionalId(params.assignedTo);
        if (assignedTo) await assertClinicMember(params.company._id, assignedTo, {session: params.session, languageCode});
        return staffInquiryRecord(
            {
                companyId: params.company._id,
                source: params.source,
                contact: {...contact, country: optionalId(contact.country)},
                request: {
                    treatmentsWanted: assertTreatments(params.treatmentsWanted, languageCode),
                    description: params.description,
                    travelFrom: params.travelFrom,
                    travelTo: params.travelTo,
                    budget: params.budget,
                    budgetCurrency: optionalId(params.budgetCurrency),
                },
                assignedTo,
                createdBy: new ObjectId(params.actionUserCtx.userId),
            },
            languageCode,
        );
    },
    buildUpdateData: () => ({}),
});
