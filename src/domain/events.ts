export type TaskEventType =
  | "plan_created"
  | "task_ready"
  | "task_started"
  | "task_testing"
  | "task_failed_retryable"
  | "task_failed_blocked"
  | "task_waiting_human"
  | "task_done";

export type KnowledgeEventType =
  | "knowledge_candidate_created"
  | "knowledge_conflict_detected"
  | "knowledge_budget_deferred"
  | "knowledge_published"
  | "knowledge_deprecated"
  | "knowledge_archived";

export interface TaskEvent {
  eventId: string;
  taskId: string;
  type: TaskEventType;
  timestamp: string;
}

export interface KnowledgeEvent {
  eventId: string;
  knowledgeId: string;
  type: KnowledgeEventType;
  timestamp: string;
}
