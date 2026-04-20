import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";

import { AppError } from "../core/errors/app-error.js";
import type {
  ExecutionLogEntry,
  TaskRunStatus,
  WorkerHeartbeatStatus,
} from "../domain/execution.js";
import type { TaskUnit } from "../domain/task-unit.js";
import { GitWorktreeManager } from "./git-worktree-manager.js";

export interface CodexWorkerLauncherConfig {
  command: string;
  repositoryRoot: string;
  workspaceRoot?: string;
  artifactRoot?: string;
  cleanupStrategy?: "never" | "always" | "on_success";
}

export interface WorkerHeartbeatEvent {
  status: WorkerHeartbeatStatus;
  message: string;
  observedAt: string;
}

export interface CodexWorkerLaunchResult {
  taskRunId: string;
  workerId: string;
  branchName: string;
  worktreePath: string;
  artifactDir: string;
  status: TaskRunStatus;
  stdout: string[];
  stderr: string[];
  exitCode: number | null;
  durationMs: number;
  heartbeats: WorkerHeartbeatEvent[];
  logs: ExecutionLogEntry[];
}

export class CodexWorkerLauncher {
  private readonly repositoryRoot: string;
  private readonly artifactRoot: string;
  private readonly cleanupStrategy: "never" | "always" | "on_success";
  private readonly worktreeManager: GitWorktreeManager;

  constructor(private readonly config: CodexWorkerLauncherConfig) {
    this.repositoryRoot = path.resolve(config.repositoryRoot);
    this.artifactRoot = path.resolve(
      config.artifactRoot ??
        path.join(
          path.dirname(this.repositoryRoot),
          ".agentforge-artifacts",
          path.basename(this.repositoryRoot),
        ),
    );
    this.cleanupStrategy = config.cleanupStrategy ?? "never";
    this.worktreeManager = new GitWorktreeManager({
      repositoryRoot: this.repositoryRoot,
      workspaceRoot:
        config.workspaceRoot ??
        path.join(
          path.dirname(this.repositoryRoot),
          ".agentforge-worktrees",
          path.basename(this.repositoryRoot),
        ),
    });
  }

  async launch(
    task: TaskUnit,
    signal: AbortSignal,
    stdinText: string,
  ): Promise<CodexWorkerLaunchResult> {
    const planId = task.planId ?? "no-plan";
    const taskRunId = buildTaskRunId(planId, task.taskId);
    const workerId = `worker-${randomUUID()}`;
    const prepared = await this.worktreeManager.prepareTaskWorktree({
      planId,
      taskId: task.taskId,
    });
    const artifactDir = path.join(
      this.artifactRoot,
      ...prepared.branchName.split("/"),
      taskRunId,
    );
    await mkdir(artifactDir, { recursive: true });

    const logs: ExecutionLogEntry[] = [
      logEntry("info", `TaskRun 已创建 ${taskRunId}`),
      logEntry("info", `TaskRun worktree: ${prepared.worktreePath}`),
      logEntry("info", `TaskRun artifactDir: ${artifactDir}`),
    ];
    const heartbeats: WorkerHeartbeatEvent[] = [];
    const emitHeartbeat = (
      status: WorkerHeartbeatStatus,
      message: string,
    ): void => {
      heartbeats.push({
        status,
        message,
        observedAt: new Date().toISOString(),
      });
      logs.push(logEntry("info", `worker heartbeat ${status}: ${message}`));
    };

    const startedAt = Date.now();
    emitHeartbeat("STARTING", `准备执行 ${task.taskId}`);
    emitHeartbeat("RUNNING", `子进程进入 worktree ${prepared.worktreePath}`);

    try {
      const processResult = await runChildProcess(
        this.config.command,
        prepared.worktreePath,
        signal,
        stdinText,
      );
      const status: TaskRunStatus =
        processResult.exitCode === 0 ? "SUCCEEDED" : "FAILED";
      emitHeartbeat(
        processResult.exitCode === 0 ? "SUCCEEDED" : "FAILED",
        `子进程退出，exitCode=${processResult.exitCode ?? "null"}`,
      );

      if (shouldCleanup(this.cleanupStrategy, status)) {
        await this.worktreeManager.cleanupTaskWorktree(prepared);
        logs.push(logEntry("info", `TaskRun 已清理 worktree ${prepared.worktreePath}`));
      }

      return {
        taskRunId,
        workerId,
        branchName: prepared.branchName,
        worktreePath: prepared.worktreePath,
        artifactDir,
        status,
        stdout: processResult.stdout,
        stderr: processResult.stderr,
        exitCode: processResult.exitCode,
        durationMs: Date.now() - startedAt,
        heartbeats,
        logs,
      };
    } catch (error) {
      if (error instanceof AppError && error.code === "EXECUTION_CANCELLED") {
        emitHeartbeat("STOPPED", "子进程被取消");
      }
      throw error;
    }
  }
}

interface ChildProcessResult {
  stdout: string[];
  stderr: string[];
  exitCode: number | null;
}

async function runChildProcess(
  command: string,
  cwd: string,
  signal: AbortSignal,
  stdinText: string,
): Promise<ChildProcessResult> {
  return await new Promise<ChildProcessResult>((resolve, reject) => {
    const child = spawn(command, {
      cwd,
      shell: true,
      signal,
      stdio: "pipe",
    });

    const stdoutChunks: string[] = [];
    const stderrChunks: string[] = [];

    child.stdout.on("data", (chunk) => {
      stdoutChunks.push(String(chunk));
    });
    child.stderr.on("data", (chunk) => {
      stderrChunks.push(String(chunk));
    });

    child.on("error", (error) => {
      if (error.name === "AbortError") {
        reject(
          new AppError({
            code: "EXECUTION_CANCELLED",
            message: "执行被取消。",
          }),
        );
        return;
      }
      reject(error);
    });

    child.on("close", (exitCode) => {
      resolve({
        stdout: splitOutput(stdoutChunks.join("")),
        stderr: splitOutput(stderrChunks.join("")),
        exitCode: exitCode ?? null,
      });
    });

    child.stdin.write(stdinText);
    child.stdin.end();
  });
}

function buildTaskRunId(planId: string, taskId: string): string {
  return [
    "taskrun",
    sanitizeId(planId),
    sanitizeId(taskId),
    Date.now().toString(),
  ].join("-");
}

function sanitizeId(value: string): string {
  const sanitized = value.replace(/[^a-zA-Z0-9_-]+/gu, "-").slice(0, 60);
  return sanitized || "task";
}

function shouldCleanup(
  cleanupStrategy: "never" | "always" | "on_success",
  status: TaskRunStatus,
): boolean {
  if (cleanupStrategy === "always") {
    return true;
  }
  if (cleanupStrategy === "on_success") {
    return status === "SUCCEEDED";
  }
  return false;
}

function splitOutput(value: string): string[] {
  return value
    .split(/\r?\n/u)
    .map((line) => line.trimEnd())
    .filter(Boolean);
}

function logEntry(
  level: ExecutionLogEntry["level"],
  message: string,
): ExecutionLogEntry {
  return {
    level,
    message,
    timestamp: new Date().toISOString(),
  };
}
