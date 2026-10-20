import {action} from "@coreModule/api/actionDecorator";
import {getModelCollectedData} from "@coreModule/database/collections";
import SchemaGuard from "@coreModule/database/security/schemaGuard";
import type {ClinicConfig as ClinicConfigDto} from "armonia/src/modules/dentalClinic/api/dentalClinic/private/clinicConfig/clinicConfig.dto";
import ClinicConfig from "./clinicConfig";
import {clinicConfigService} from "./clinicConfig.service";
import {clinicConfigToDTO} from "@dentalClinicModule/utilities/mappers/clinicConfig/clinicConfigMapper.dto";

export class ClinicConfigActions {
    /** Get-or-create the company's clinic settings; used by the settings page. */
    @action({auth: "private", rateLimit: {windowMs: 60000, max: 60}, transaction: true})
    async ensure(params: Record<string, any>): Promise<ClinicConfigDto> {
        const {logger, languageCode, session, actionUserCtx, company} = params;

        const existing = await clinicConfigService.findForCompany(company._id, {session, logger, languageCode});
        if (!existing) {
            SchemaGuard.checkModelPermission(ClinicConfig, "create", actionUserCtx, languageCode);
        }
        const doc = existing ?? await clinicConfigService.getOrCreateForCompany(company._id, {
            session,
            logger,
            languageCode,
            auditUserId: actionUserCtx.userId,
        });

        const readFields = SchemaGuard.sanitizeFields(
            ClinicConfig,
            getModelCollectedData("clinicconfigs").readFields!,
            "read",
            actionUserCtx,
            languageCode,
        );
        const populate = SchemaGuard.generatePopulate(readFields, ClinicConfig.schema);
        const populated = await clinicConfigService.findById(doc._id, {session, logger, languageCode}, populate.populate);
        return clinicConfigToDTO(populated ?? doc);
    }
}
