import type { ExecutionResult } from "./execution.js";
import type { KnowledgeRecord } from "./knowledge.js";
import type { Assignment } from "./plan.js";
import type { AcceptanceResult } from "./acceptance.js";
import type { PlanInput, TaskUnit } from "./task-unit.js";

export interface AcceptanceRunSnapshot {
  taskId: string;
  result: AcceptanceResult;
}

export interface OrchestrationGraphState {
  planId: string;
  input: PlanInput;
  tasks: TaskUnit[];
  assignmentRecords: Assignment[];
  acceptanceResults: AcceptanceRunSnapshot[];
  publishedKnowledge: KnowledgeRecord[];
  currentTaskId?: string;
  currentAssignment?: Assignment;
  lastExecutionResult?: ExecutionResult;
  runStatus: "idle" | "running" | "completed";
}

export interface TemporalRuntimeConfig {
  obsidianEnabled: boolean;
  obsidianRoot?: string;
  realExecutor?: "simulated" | "codex";
  allowSimulation?: boolean;
  executorTimeoutMs?: number;
  targetProjectRoot?: string;
  codexCliCommand?: string;
  installCommand?: string;
  typecheckCommand?: string;
  testCommand?: string;
  buildCommand?: string;
  e2eCommand?: string;
  requireHumanOnTestFail?: boolean;
}

export interface TemporalRunRequest {
  planId: string;
  input: PlanInput;
  runtime: TemporalRuntimeConfig;
}

export interface TemporalRunResult {
  workflowId: string;
  runId?: string;
  result: {
    tasks: TaskUnit[];
    publishedKnowledge: KnowledgeRecord[];
    assignments: number;
    assignmentRecords: Assignment[];
    acceptanceResults: AcceptanceRunSnapshot[];
  };
}
