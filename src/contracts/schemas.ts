import { z } from "zod";

const taskTypeSchema = z.enum([
  "backend",
  "frontend",
  "integration",
  "acceptance",
  "docs",
  "knowledge_capture",
  "knowledge_merge",
  "knowledge_review",
  "knowledge_cleanup",
]);

const taskStatusSchema = z.enum([
  "PLANNED",
  "READY",
  "RUNNING",
  "TESTING",
  "AWAITING_FRONTEND",
  "AWAITING_ACCEPTANCE",
  "FAILED_RETRYABLE",
  "FAILED_BLOCKED",
  "WAITING_HUMAN",
  "DONE",
]);

export const knowledgePolicySchema = z.object({
  enabled: z.boolean(),
  candidateType: z.enum(["pattern", "incident", "sop", "adr"]),
  reusableScoreThreshold: z.number().min(0).max(1),
  stabilityScoreThreshold: z.number().min(0).max(1),
  confidenceThreshold: z.number().min(0).max(1),
});

export const taskUnitSchema = z.object({
  planId: z.string().min(1).optional(),
  taskId: z.string().min(1),
  title: z.string().min(1),
  goal: z.string().min(1),
  type: taskTypeSchema,
  phase: z.string().min(1),
  priority: z.enum(["low", "medium", "high"]),
  dependencies: z.array(z.string()),
  readSet: z.array(z.string()),
  writeSet: z.array(z.string()),
  inputs: z.array(z.string()),
  deliverables: z.array(z.string()),
  acceptanceCriteria: z.array(z.string()).min(1),
  testCommands: z.array(z.string()),
  handoffTo: z.string().min(1),
  blockedConditions: z.array(z.string()),
  autoFixPolicy: z.array(z.string()),
  humanGate: z.object({
    required: z.boolean(),
    triggerConditions: z.array(z.string()).optional(),
  }),
  knowledgePolicy: knowledgePolicySchema.optional(),
  status: taskStatusSchema.optional(),
});

export const plannerInputSchema = z.object({
  request: z.string().min(1),
  phase: z.string().min(1),
  projectId: z.string().min(1).optional(),
  requester: z.string().min(1).optional(),
  constraints: z.array(z.string()).optional(),
  targetModules: z.array(z.string()).optional(),
});

export const knowledgeSignalSchema = z.object({
  reusableScore: z.number().min(0).max(1),
  noveltyScore: z.number().min(0).max(1),
  confidence: z.number().min(0).max(1),
  stabilityScore: z.number().min(0).max(1),
  impactScore: z.number().min(0).max(1),
  candidateType: z.enum(["pattern", "incident", "sop", "adr"]),
  recommendedAction: z.enum(["ignore", "capture", "review", "archive"]),
});

export const knowledgeDraftSchema = z.object({
  title: z.string().min(1),
  summary: z.string().min(1),
  recommendation: z.string().min(1),
  constraints: z.array(z.string()),
  sourceRefs: z.array(z.string()).min(1),
  derivedFrom: z.array(z.string()),
});

export const acceptanceResultSchema = z.object({
  status: z.enum(["passed", "failed", "blocked"]),
  summary: z.string(),
  acceptanceChecks: z.array(z.string()),
  evidence: z.array(z.string()),
  rootCause: z.string(),
  autoFixable: z.boolean(),
  requiresHuman: z.boolean(),
  nextAction: z.string(),
  knowledgeSignal: knowledgeSignalSchema,
  knowledgeDraft: knowledgeDraftSchema.optional(),
});

export const knowledgeRecordSchema = z.object({
  knowledgeId: z.string().min(1),
  version: z.number().int().positive(),
  scope: z.string().min(1),
  status: z.enum([
    "candidate",
    "active",
    "deprecated",
    "archived",
    "conflicted",
  ]),
  title: z.string().min(1),
  summary: z.string().min(1),
  recommendation: z.string().min(1),
  constraints: z.array(z.string()),
  confidence: z.number().min(0).max(1),
  candidateType: z.enum(["pattern", "incident", "sop", "adr"]),
  sourceRefs: z.array(z.string()).min(1),
  derivedFrom: z.array(z.string()),
  supersedes: z.array(z.string()),
  updatedAt: z.string().datetime(),
  mem0Key: z.string().min(1).optional(),
  notePath: z.string().min(1).optional(),
});

export const knowledgeCandidateSchema = z.object({
  candidateId: z.string().min(1),
  knowledgeId: z.string().min(1),
  scope: z.string().min(1),
  summary: z.string().min(1),
  recommendation: z.string().min(1),
  sourceRefs: z.array(z.string()).min(1),
  candidateType: z.enum(["pattern", "incident", "sop", "adr"]),
  scores: z.object({
    reusableScore: z.number().min(0).max(1),
    noveltyScore: z.number().min(0).max(1),
    confidence: z.number().min(0).max(1),
    stabilityScore: z.number().min(0).max(1),
    impactScore: z.number().min(0).max(1),
    publishScore: z.number().min(0).max(1),
  }),
});

export const planSchema = z.object({
  planId: z.string().min(1),
  title: z.string().min(1),
  goal: z.string().min(1),
  status: z.enum(["PLANNED", "RUNNING", "DONE", "FAILED_BLOCKED"]),
  phases: z.array(
    z.object({
      phaseId: z.string().min(1),
      title: z.string().min(1),
      order: z.number().int().nonnegative(),
      status: z.enum(["PLANNED", "RUNNING", "DONE", "FAILED_BLOCKED"]),
    }),
  ),
  taskIds: z.array(z.string()),
});

export const assignmentSchema = z.object({
  assignmentId: z.string().min(1),
  taskId: z.string().min(1),
  executor: z.enum(["codex", "claude", "openhands"]),
  status: z.enum(["ASSIGNED", "RUNNING", "SUCCEEDED", "FAILED"]),
  startedAt: z.string().datetime().optional(),
  finishedAt: z.string().datetime().optional(),
});

export const incidentSchema = z.object({
  incidentId: z.string().min(1),
  taskId: z.string().min(1),
  severity: z.enum(["low", "medium", "high", "critical"]),
  type: z.enum([
    "retryable_failure",
    "blocked",
    "environment_error",
    "knowledge_conflict",
  ]),
  summary: z.string().min(1),
  evidence: z.array(z.string()),
  requiresHuman: z.boolean(),
});

export const humanInterventionSchema = z.object({
  interventionId: z.string().min(1),
  relatedId: z.string().min(1),
  type: z.enum(["approval", "rejection", "decision", "handoff"]),
  summary: z.string().min(1),
  actor: z.string().min(1),
  createdAt: z.string().datetime(),
});

export const taskEventSchema = z.object({
  eventId: z.string().min(1),
  taskId: z.string().min(1),
  type: z.enum([
    "plan_created",
    "task_ready",
    "task_started",
    "task_testing",
    "task_failed_retryable",
    "task_failed_blocked",
    "task_waiting_human",
    "task_done",
  ]),
  timestamp: z.string().datetime(),
});

export const knowledgeEventSchema = z.object({
  eventId: z.string().min(1),
  knowledgeId: z.string().min(1),
  type: z.enum([
    "knowledge_candidate_created",
    "knowledge_conflict_detected",
    "knowledge_budget_deferred",
    "knowledge_published",
    "knowledge_deprecated",
    "knowledge_archived",
  ]),
  timestamp: z.string().datetime(),
});

export type TaskUnitInput = z.infer<typeof taskUnitSchema>;
export type PlannerInputSchema = z.infer<typeof plannerInputSchema>;
export type AcceptanceResultInput = z.infer<typeof acceptanceResultSchema>;
export type KnowledgeRecordInput = z.infer<typeof knowledgeRecordSchema>;
export type KnowledgeCandidateInput = z.infer<typeof knowledgeCandidateSchema>;
export type PlanInputSchema = z.infer<typeof planSchema>;
export type AssignmentInput = z.infer<typeof assignmentSchema>;
export type IncidentInput = z.infer<typeof incidentSchema>;
export type HumanInterventionInput = z.infer<typeof humanInterventionSchema>;
export type TaskEventInput = z.infer<typeof taskEventSchema>;
export type KnowledgeEventInput = z.infer<typeof knowledgeEventSchema>;
