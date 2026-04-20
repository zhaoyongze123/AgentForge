import { AppError } from "../core/errors/app-error.js";
import type { KnowledgeStatus } from "../domain/knowledge.js";
import type { TaskStatus } from "../domain/task-unit.js";

export type FailureClassification = "retryable" | "blocked" | "human_required";

export interface StateTransitionRecord {
  entityId: string;
  entityType: "task" | "knowledge";
  from: string;
  to: string;
  reason: string;
  timestamp: string;
}

const taskTransitionMap: Record<TaskStatus, TaskStatus[]> = {
  PLANNED: ["READY"],
  READY: ["RUNNING", "FAILED_BLOCKED", "WAITING_HUMAN"],
  RUNNING: [
    "TESTING",
    "FAILED_RETRYABLE",
    "FAILED_BLOCKED",
    "WAITING_HUMAN",
    "DONE",
  ],
  TESTING: [
    "AWAITING_FRONTEND",
    "AWAITING_ACCEPTANCE",
    "DONE",
    "FAILED_RETRYABLE",
    "FAILED_BLOCKED",
  ],
  AWAITING_FRONTEND: ["RUNNING", "FAILED_BLOCKED", "WAITING_HUMAN"],
  AWAITING_ACCEPTANCE: [
    "DONE",
    "FAILED_RETRYABLE",
    "FAILED_BLOCKED",
    "WAITING_HUMAN",
  ],
  FAILED_RETRYABLE: ["READY", "WAITING_HUMAN", "FAILED_BLOCKED"],
  FAILED_BLOCKED: ["WAITING_HUMAN"],
  WAITING_HUMAN: ["READY", "DONE", "FAILED_BLOCKED"],
  DONE: [],
};

const knowledgeTransitionMap: Record<KnowledgeStatus, KnowledgeStatus[]> = {
  candidate: ["active", "archived", "conflicted"],
  active: ["deprecated", "archived", "conflicted"],
  deprecated: ["archived", "conflicted"],
  archived: [],
  conflicted: ["active", "deprecated", "archived"],
};

export class BusinessTaskStateMachine {
  transition(
    current: TaskStatus,
    next: TaskStatus,
    reason: string,
  ): TaskStatus {
    ensureTransitionAllowed("task", current, next, taskTransitionMap[current]);
    ensureReason(reason);
    return next;
  }
}

export class KnowledgeLifecycleStateMachine {
  transition(
    current: KnowledgeStatus,
    next: KnowledgeStatus,
    reason: string,
  ): KnowledgeStatus {
    ensureTransitionAllowed(
      "knowledge",
      current,
      next,
      knowledgeTransitionMap[current],
    );
    ensureReason(reason);
    return next;
  }
}

export class RetryPolicy {
  constructor(private readonly maxRetries: number) {}

  nextStatus(retryCount: number): TaskStatus {
    return retryCount < this.maxRetries ? "FAILED_RETRYABLE" : "FAILED_BLOCKED";
  }
}

export class BlockedHandler {
  route(classification: FailureClassification): TaskStatus {
    if (classification === "retryable") {
      return "FAILED_RETRYABLE";
    }

    if (classification === "human_required") {
      return "WAITING_HUMAN";
    }

    return "FAILED_BLOCKED";
  }
}

export class HumanGatePolicy {
  shouldWaitHuman(options: {
    architectureConflict: boolean;
    permissionConflict: boolean;
    highValueKnowledgeConflict: boolean;
  }): boolean {
    return (
      options.architectureConflict ||
      options.permissionConflict ||
      options.highValueKnowledgeConflict
    );
  }
}

export class TransitionAuditLog {
  private readonly records: StateTransitionRecord[] = [];

  record(entry: StateTransitionRecord): void {
    this.records.push(entry);
  }

  listByEntity(entityId: string): StateTransitionRecord[] {
    return this.records.filter((record) => record.entityId === entityId);
  }
}

function ensureTransitionAllowed(
  entityType: "task" | "knowledge",
  current: string,
  next: string,
  allowed: string[],
): void {
  if (!allowed.includes(next)) {
    throw new AppError({
      code: "STATE_TRANSITION_INVALID",
      message: `${entityType} 状态不允许从 ${current} 迁移到 ${next}。`,
      details: { current, next, allowed },
    });
  }
}

function ensureReason(reason: string): void {
  if (!reason.trim()) {
    throw new AppError({
      code: "STATE_TRANSITION_INVALID",
      message: "状态迁移必须提供原因。",
    });
  }
}
