import type {Response} from "express";
import {nestedEntityToRef} from "@coreModule/utilities/mappers/common.mapper";
import type {ITreatmentPlan} from "@dentalClinicModule/database/schemas/treatmentPlan/treatmentPlan";
import {treatmentPlanToDTO} from "@dentalClinicModule/utilities/mappers/treatmentPlan/treatmentPlanMapper.dto";
import {generateTreatmentPlanPdf} from "./treatmentPlanPdf";

import {companyService} from "@coreModule/database/schemas/company/company.service";
import {patientService} from "@dentalClinicModule/database/schemas/patient/patient.service";
/** Writes the plan's PDF to the response, in the patient's language when the plan has one. */
export async function sendTreatmentPlanPdf(plan: ITreatmentPlan, res: Response, fallbackLanguage: string): Promise<void> {
    await plan.populate([{path: "currency", select: "name symbol abbreviation"}]);
    const patientId = nestedEntityToRef(plan.patient);
    const [company, patient] = await Promise.all([
        companyService.findById(nestedEntityToRef(plan.company), {}, undefined, "name"),
        patientId ? patientService.findById(patientId, {}, undefined, "firstName lastName preferredLanguage") : null,
    ]);
    const buffer = await generateTreatmentPlanPdf({
        plan: treatmentPlanToDTO(plan),
        clinicName: company?.name ?? "",
        patientName: patient ? `${patient.firstName} ${patient.lastName}` : undefined,
        languageCode: patient?.preferredLanguage ?? fallbackLanguage,
    });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(`${plan.number}.pdf`)}"`);
    res.setHeader("Content-Length", buffer.length);
    res.send(buffer);
}
