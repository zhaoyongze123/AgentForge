import type {
  ExecutorName,
  TaskRunStatus,
  WorkerHeartbeatStatus,
} from "./execution.js";
import type { AcceptanceResult } from "./acceptance.js";
import type { Incident, HumanIntervention } from "./incident.js";
import type { KnowledgeRecord } from "./knowledge.js";
import type { Assignment } from "./plan.js";
import type { TaskUnit } from "./task-unit.js";

export interface AcceptanceRun {
  runId: string;
  taskId: string;
  status: AcceptanceResult["status"];
  summary: string;
  result: AcceptanceResult;
  createdAt: string;
}

export interface EventLogRecord {
  eventId: string;
  entityType:
    | "plan"
    | "task"
    | "assignment"
    | "task_run"
    | "worker_heartbeat"
    | "acceptance_run"
    | "knowledge_record"
    | "incident"
    | "human_intervention";
  entityId: string;
  eventType: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface TaskRun {
  taskRunId: string;
  planId: string;
  taskId: string;
  assignmentId?: string;
  attempt: number;
  workerId: string;
  executor: ExecutorName;
  status: TaskRunStatus;
  worktreePath?: string;
  artifactDir?: string;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  finishedAt?: string;
}

export interface WorkerHeartbeat {
  heartbeatId: string;
  taskRunId: string;
  workerId: string;
  status: WorkerHeartbeatStatus;
  message?: string;
  observedAt: string;
  leaseExpiresAt?: string;
}

export interface DatabaseSchema {
  schemaVersion: number;
  tasks: TaskUnit[];
  assignments: Assignment[];
  taskRuns: TaskRun[];
  workerHeartbeats: WorkerHeartbeat[];
  acceptanceRuns: AcceptanceRun[];
  knowledgeRecords: KnowledgeRecord[];
  incidents: Incident[];
  humanInterventions: HumanIntervention[];
  eventLogs: EventLogRecord[];
}
