import { AppError } from "../core/errors/app-error.js";
import type {
  ExecutionContext,
  ExecutorName,
  RawExecutionOutput,
} from "../domain/execution.js";
import type { TaskUnit } from "../domain/task-unit.js";

export interface ExecutorAdapter {
  readonly name: ExecutorName;
  execute(
    task: TaskUnit,
    context: ExecutionContext,
  ): Promise<RawExecutionOutput>;
}

interface SimulationProfile {
  durationMs: number;
  failureMode: "none" | "retryable" | "blocked" | "human_required";
}

abstract class BaseSimulatedAdapter implements ExecutorAdapter {
  abstract readonly name: ExecutorName;

  async execute(
    task: TaskUnit,
    context: ExecutionContext,
  ): Promise<RawExecutionOutput> {
    const profile = this.getSimulationProfile(task);
    const startedAt = Date.now();

    await wait(profile.durationMs, context.signal);

    const logs = [
      {
        level: "info" as const,
        message: `${this.name} 开始执行 ${task.taskId}`,
        timestamp: new Date(startedAt).toISOString(),
      },
      {
        level:
          profile.failureMode === "none"
            ? ("info" as const)
            : ("warn" as const),
        message:
          profile.failureMode === "none"
            ? `${this.name} 成功完成 ${task.taskId}`
            : `${this.name} 执行 ${task.taskId} 时命中 ${profile.failureMode} 模式`,
        timestamp: new Date().toISOString(),
      },
    ];

    if (profile.failureMode === "none") {
      return {
        status: "succeeded",
        stdout: [`${task.taskId} executed by ${this.name}`],
        stderr: [],
        logs,
        exitCode: 0,
        durationMs: Date.now() - startedAt,
      };
    }

    return {
      status: "failed",
      stdout: [],
      stderr: [`${task.taskId} failed in ${profile.failureMode} mode`],
      logs,
      exitCode: 1,
      durationMs: Date.now() - startedAt,
    };
  }

  private getSimulationProfile(task: TaskUnit): SimulationProfile {
    const failureInput = task.inputs.find((input) =>
      input.startsWith("simulate:"),
    );
    if (!failureInput) {
      return {
        durationMs: 10,
        failureMode: "none",
      };
    }

    const mode = failureInput.replace("simulate:", "");
    if (
      mode === "retryable" ||
      mode === "blocked" ||
      mode === "human_required"
    ) {
      return {
        durationMs: 10,
        failureMode: mode,
      };
    }

    if (mode === "slow") {
      return {
        durationMs: 80,
        failureMode: "none",
      };
    }

    throw new AppError({
      code: "CONFIG_INVALID",
      message: "未知的执行模拟模式。",
      details: { mode, taskId: task.taskId },
    });
  }
}

export class CodexAdapter extends BaseSimulatedAdapter {
  readonly name = "codex";
}

export class ClaudeAdapter extends BaseSimulatedAdapter {
  readonly name = "claude";
}

export class OpenHandsAdapter extends BaseSimulatedAdapter {
  readonly name = "openhands";
}

async function wait(durationMs: number, signal: AbortSignal): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      resolve();
    }, durationMs);

    const abortHandler = () => {
      cleanup();
      reject(
        new AppError({
          code: "EXECUTION_CANCELLED",
          message: "执行被取消。",
        }),
      );
    };

    const cleanup = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", abortHandler);
    };

    signal.addEventListener("abort", abortHandler);
  });
}
