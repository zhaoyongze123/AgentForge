import { AppError, isAppError } from "../core/errors/app-error.js";
import type {
  ExecutionResult,
  ExecutorName,
  RawExecutionOutput,
} from "../domain/execution.js";
import type { TaskUnit } from "../domain/task-unit.js";
import { BlockedHandler, RetryPolicy } from "../workflow/state-machine.js";
import { ExecutionPermissionGuard } from "./permission-guard.js";
import {
  ClaudeAdapter,
  CodexAdapter,
  OpenHandsAdapter,
  type ExecutorAdapter,
} from "./adapter.js";
import {
  RealCodexCliAdapter,
  type RealCodexCliAdapterConfig,
} from "./real-codex-cli-adapter.js";

export interface ExecutorRuntimeOptions {
  timeoutMs?: number;
  maxRetries?: number;
  adapters?: ExecutorAdapter[];
  realCodex?: RealCodexCliAdapterConfig;
  allowSimulation?: boolean;
}

export class ExecutorRuntime {
  private readonly adapters = new Map<ExecutorName, ExecutorAdapter>();
  private readonly timeoutMs: number;
  private readonly retryPolicy: RetryPolicy;
  private readonly blockedHandler = new BlockedHandler();
  private readonly permissionGuard = new ExecutionPermissionGuard();

  constructor(options: ExecutorRuntimeOptions = {}) {
    const allowSimulation = options.allowSimulation ?? true;

    if (!allowSimulation && !options.realCodex && !options.adapters) {
      throw new AppError({
        code: "CONFIG_INVALID",
        message:
          "当 ALLOW_SIMULATION=false 时，必须提供 realCodex 或自定义 adapters。",
        details: { key: "ALLOW_SIMULATION" },
      });
    }

    const adapters =
      options.adapters ??
      (options.realCodex
        ? [
            new RealCodexCliAdapter(options.realCodex),
            ...(allowSimulation
              ? [new ClaudeAdapter(), new OpenHandsAdapter()]
              : []),
          ]
        : [new CodexAdapter(), new ClaudeAdapter(), new OpenHandsAdapter()]);
    for (const adapter of adapters) {
      this.adapters.set(adapter.name, adapter);
    }

    this.timeoutMs = options.timeoutMs ?? 50;
    this.retryPolicy = new RetryPolicy(options.maxRetries ?? 2);
  }

  async execute(
    task: TaskUnit,
    executor: ExecutorName,
  ): Promise<ExecutionResult> {
    this.permissionGuard.assertTask(task);
    const adapter = this.adapters.get(executor);
    if (!adapter) {
      throw new AppError({
        code: "EXTERNAL_UNAVAILABLE",
        message: "未找到可用的执行器适配器。",
        details: { executor },
      });
    }

    const controller = new AbortController();
    const startedAt = Date.now();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const raw = await adapter.execute(task, {
        timeoutMs: this.timeoutMs,
        signal: controller.signal,
      });
      clearTimeout(timeout);
      return this.normalize(task, executor, raw);
    } catch (error) {
      clearTimeout(timeout);
      if (isAppError(error) && error.code === "EXECUTION_CANCELLED") {
        if (Date.now() - startedAt >= this.timeoutMs) {
          return {
            executor,
            status: "timed_out",
            stdout: [],
            stderr: ["execution timed out"],
            logs: [],
            exitCode: null,
            durationMs: Date.now() - startedAt,
            evidence: [`timeout after ${this.timeoutMs}ms`],
            failureClassification: "retryable",
            reason: "timeout",
          };
        }

        return {
          executor,
          status: "cancelled",
          stdout: [],
          stderr: ["execution cancelled"],
          logs: [],
          exitCode: null,
          durationMs: Date.now() - startedAt,
          evidence: ["execution cancelled by signal"],
          failureClassification: "human_required",
          reason: "cancelled",
        };
      }

      throw error;
    }
  }

  classifyFailure(result: ExecutionResult) {
    if (result.status === "timed_out") {
      return this.blockedHandler.route("retryable");
    }

    if (result.failureClassification === "human_required") {
      return this.blockedHandler.route("human_required");
    }

    if (result.failureClassification === "blocked") {
      return this.blockedHandler.route("blocked");
    }

    return this.retryPolicy.nextStatus(0);
  }

  private normalize(
    task: TaskUnit,
    executor: ExecutorName,
    raw: RawExecutionOutput,
  ): ExecutionResult {
    const writeSetViolation = this.findWriteSetViolation(
      task,
      raw.changedFiles ?? [],
    );

    if (writeSetViolation.length > 0) {
      return {
        executor,
        status: "failed",
        stdout: raw.stdout,
        stderr: raw.stderr,
        logs: [
          ...raw.logs,
          {
            level: "error",
            message: `write_set 越界: ${writeSetViolation.join(", ")}`,
            timestamp: new Date().toISOString(),
          },
        ],
        exitCode: raw.exitCode,
        durationMs: raw.durationMs,
        evidence: [
          ...raw.stderr,
          ...raw.logs.map((log) => log.message),
          ...writeSetViolation.map((file) => `write_set_violation:${file}`),
        ],
        failureClassification: "blocked",
        reason: "write_set_violation",
      };
    }

    if (raw.status === "succeeded") {
      return {
        executor,
        status: "succeeded",
        stdout: raw.stdout,
        stderr: raw.stderr,
        logs: raw.logs,
        exitCode: raw.exitCode,
        durationMs: raw.durationMs,
        evidence: [...raw.stdout, ...raw.logs.map((log) => log.message)],
      };
    }

    const failureClassification =
      raw.failureClassification ?? this.inferFailureClassification(task);
    return {
      executor,
      status: "failed",
      stdout: raw.stdout,
      stderr: raw.stderr,
      logs: raw.logs,
      exitCode: raw.exitCode,
      durationMs: raw.durationMs,
      evidence: [...raw.stderr, ...raw.logs.map((log) => log.message)],
      failureClassification,
      reason: failureClassification,
    };
  }

  private inferFailureClassification(task: TaskUnit) {
    const failureInput = task.inputs.find((input) =>
      input.startsWith("simulate:"),
    );
    if (!failureInput) {
      return "retryable" as const;
    }

    const mode = failureInput.replace("simulate:", "");
    if (mode === "blocked") {
      return "blocked" as const;
    }
    if (mode === "human_required") {
      return "human_required" as const;
    }

    return "retryable" as const;
  }

  private findWriteSetViolation(
    task: TaskUnit,
    changedFiles: string[],
  ): string[] {
    return changedFiles.filter(
      (file) => !task.writeSet.some((pattern) => matchesWriteSet(pattern, file)),
    );
  }
}

function matchesWriteSet(pattern: string, filePath: string): boolean {
  const normalizedPattern = normalizePath(pattern);
  const normalizedFilePath = normalizePath(filePath);
  const regex = globToRegExp(normalizedPattern);
  return regex.test(normalizedFilePath);
}

function normalizePath(value: string): string {
  return value.replace(/\\/gu, "/").replace(/^\.\/+/u, "");
}

function globToRegExp(pattern: string): RegExp {
  let source = "^";
  for (let index = 0; index < pattern.length; index += 1) {
    const current = pattern[index];
    const next = pattern[index + 1];

    if (current === "*" && next === "*") {
      source += ".*";
      index += 1;
      continue;
    }

    if (current === "*") {
      source += "[^/]*";
      continue;
    }

    if (current === "?") {
      source += "[^/]";
      continue;
    }

    if (/[|\\{}()[\]^$+?.]/u.test(current)) {
      source += `\\${current}`;
      continue;
    }

    source += current;
  }

  source += "$";
  return new RegExp(source);
}
