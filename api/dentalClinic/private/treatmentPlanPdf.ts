import {Router, type Request, type Response} from "express";
import {ObjectId} from "mongodb";
import authMW, {type AuthenticatedMWType} from "@coreModule/utilities/middlewares/authMW";
import {asyncHandler} from "@coreModule/utilities/middlewares/asyncHandler";
import {rateLimiter} from "@coreModule/utilities/middlewares/rateLimiter";
import {getModelCollectedData} from "@coreModule/database/collections";
import SchemaGuard from "@coreModule/database/security/schemaGuard";
import {apiValidationException} from "armonia/src/modules/core/helpers/exceptions";
import TreatmentPlan from "@dentalClinicModule/database/schemas/treatmentPlan/treatmentPlan";
import {sendTreatmentPlanPdf} from "@dentalClinicModule/utilities/pdf/sendTreatmentPlanPdf";

import {treatmentPlanService} from "@dentalClinicModule/database/schemas/treatmentPlan/treatmentPlan.service";
export const basePath = "/api/dentalClinic/treatmentPlanPdf";
export const router = Router();

/** The quote as a PDF, for staff who may read the plan's lines. */
router.get(
    "/:planId",
    authMW("private"),
    rateLimiter({windowMs: 60000, max: 30}),
    asyncHandler(async (params: AuthenticatedMWType, queryParams: {planId: string}, _req: Request, res: Response) => {
        const {company, actionUserCtx, languageCode} = params;
        const readFields = SchemaGuard.sanitizeFields(TreatmentPlan, getModelCollectedData("treatmentplans").readFields!, "read", actionUserCtx, languageCode);
        if (!readFields.lines) throw apiValidationException("user_permissions_not_sufficient", "", null, languageCode);
        const plan = ObjectId.isValid(queryParams.planId)
            ? await treatmentPlanService.findOne({_id: new ObjectId(queryParams.planId), company: company._id, deletedAt: null}, {})
            : null;
        if (!plan) throw apiValidationException("treatment_plan_not_found", "", null, languageCode);
        await sendTreatmentPlanPdf(plan, res, languageCode);
    }),
);
