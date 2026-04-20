import type { AcceptanceResult } from "./acceptance.js";
import type { Assignment } from "./plan.js";
import type { EventLogRecord, AcceptanceRun } from "./persistence.js";
import type { KnowledgeStatus } from "./knowledge.js";
import type { TaskStatus } from "./task-unit.js";

export interface CounterMetric {
  name: string;
  labels?: Record<string, string>;
  value: number;
}

export interface ExecutorMetric {
  executor: Assignment["executor"];
  runs: number;
  durationMs: number;
  estimatedCostUsd: number;
}

export interface AlertRecord {
  code: string;
  severity: "warning" | "critical";
  summary: string;
  evidence: string[];
}

export interface MetricsSnapshot {
  taskStatusCounts: Record<TaskStatus, number>;
  acceptanceStatusCounts: Record<AcceptanceResult["status"], number>;
  knowledgeStatusCounts: Record<KnowledgeStatus, number>;
  knowledgeEventCounts: Record<string, number>;
  businessMetrics: {
    totalPlans: number;
    totalTasks: number;
    completedTasks: number;
    blockedTasks: number;
    waitingHumanTasks: number;
    acceptancePassRate: number;
  };
  executorMetrics: ExecutorMetric[];
  alerts: AlertRecord[];
}

export interface AuditQuery {
  entityType?: EventLogRecord["entityType"];
  entityId?: string;
  eventType?: string;
  limit?: number;
}

export interface AuditSnapshot {
  events: EventLogRecord[];
  acceptanceRuns: AcceptanceRun[];
}
