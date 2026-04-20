import type { ZodType } from "zod";

import { AppError } from "../core/errors/app-error.js";
import {
  acceptanceResultSchema,
  assignmentSchema,
  humanInterventionSchema,
  incidentSchema,
  knowledgeCandidateSchema,
  knowledgeEventSchema,
  knowledgeRecordSchema,
  planSchema,
  plannerInputSchema,
  taskEventSchema,
  taskUnitSchema,
} from "./schemas.js";

function parseWithSchema<T>(
  schema: ZodType<T>,
  input: unknown,
  label: string,
): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new AppError({
      code: "CONFIG_INVALID",
      message: `${label} 校验失败。`,
      details: {
        issues: result.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      },
    });
  }

  return result.data;
}

export const validateTaskUnit = (input: unknown) =>
  parseWithSchema(taskUnitSchema, input, "TaskUnit");
export const validatePlannerInput = (input: unknown) =>
  parseWithSchema(plannerInputSchema, input, "PlannerInput");
export const validateAcceptanceResult = (input: unknown) =>
  parseWithSchema(acceptanceResultSchema, input, "AcceptanceResult");
export const validateKnowledgeRecord = (input: unknown) =>
  parseWithSchema(knowledgeRecordSchema, input, "KnowledgeRecord");
export const validateKnowledgeCandidate = (input: unknown) =>
  parseWithSchema(knowledgeCandidateSchema, input, "KnowledgeCandidate");
export const validatePlan = (input: unknown) =>
  parseWithSchema(planSchema, input, "Plan");
export const validateAssignment = (input: unknown) =>
  parseWithSchema(assignmentSchema, input, "Assignment");
export const validateIncident = (input: unknown) =>
  parseWithSchema(incidentSchema, input, "Incident");
export const validateHumanIntervention = (input: unknown) =>
  parseWithSchema(humanInterventionSchema, input, "HumanIntervention");
export const validateTaskEvent = (input: unknown) =>
  parseWithSchema(taskEventSchema, input, "TaskEvent");
export const validateKnowledgeEvent = (input: unknown) =>
  parseWithSchema(knowledgeEventSchema, input, "KnowledgeEvent");
