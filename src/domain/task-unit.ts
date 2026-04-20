export type TaskType =
  | "backend"
  | "frontend"
  | "integration"
  | "acceptance"
  | "docs"
  | "knowledge_capture"
  | "knowledge_merge"
  | "knowledge_review"
  | "knowledge_cleanup";

export type TaskStatus =
  | "PLANNED"
  | "READY"
  | "RUNNING"
  | "TESTING"
  | "AWAITING_FRONTEND"
  | "AWAITING_ACCEPTANCE"
  | "FAILED_RETRYABLE"
  | "FAILED_BLOCKED"
  | "WAITING_HUMAN"
  | "DONE";

export interface KnowledgePolicy {
  enabled: boolean;
  candidateType: "pattern" | "incident" | "sop" | "adr";
  reusableScoreThreshold: number;
  stabilityScoreThreshold: number;
  confidenceThreshold: number;
}

export interface TaskUnit {
  planId?: string;
  taskId: string;
  title: string;
  goal: string;
  type: TaskType;
  phase: string;
  priority: "low" | "medium" | "high";
  dependencies: string[];
  readSet: string[];
  writeSet: string[];
  inputs: string[];
  deliverables: string[];
  acceptanceCriteria: string[];
  testCommands: string[];
  handoffTo: string;
  blockedConditions: string[];
  autoFixPolicy: string[];
  humanGate: {
    required: boolean;
    triggerConditions?: string[];
  };
  knowledgePolicy?: KnowledgePolicy;
  status?: TaskStatus;
}

export interface PlanInput {
  request: string;
  phase: string;
  projectId?: string;
  requester?: string;
  constraints?: string[];
  targetModules?: string[];
}
