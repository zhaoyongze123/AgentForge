import type { FailureClassification } from "../workflow/state-machine.js";

export type ExecutorName = "codex" | "claude" | "openhands";

export type TaskRunStatus =
  | "PENDING"
  | "RUNNING"
  | "SUCCEEDED"
  | "FAILED"
  | "CANCELLED"
  | "TIMED_OUT";

export type WorkerHeartbeatStatus =
  | "STARTING"
  | "RUNNING"
  | "IDLE"
  | "SUCCEEDED"
  | "FAILED"
  | "STOPPED";

export interface ExecutionLogEntry {
  level: "info" | "warn" | "error";
  message: string;
  timestamp: string;
}

export interface RawExecutionOutput {
  status: "succeeded" | "failed";
  stdout: string[];
  stderr: string[];
  logs: ExecutionLogEntry[];
  exitCode: number;
  durationMs: number;
  changedFiles?: string[];
  failureClassification?: FailureClassification;
}

export interface ExecutionResult {
  executor: ExecutorName;
  status: "succeeded" | "failed" | "cancelled" | "timed_out";
  stdout: string[];
  stderr: string[];
  logs: ExecutionLogEntry[];
  exitCode: number | null;
  durationMs: number;
  evidence: string[];
  failureClassification?: FailureClassification;
  reason?: string;
}

export interface ExecutionContext {
  timeoutMs: number;
  signal: AbortSignal;
}
