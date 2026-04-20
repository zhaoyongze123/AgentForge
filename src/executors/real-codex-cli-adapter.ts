import { spawn } from "node:child_process";

import { AppError, isAppError } from "../core/errors/app-error.js";
import type {
  ExecutionContext,
  ExecutionLogEntry,
  ExecutorName,
  RawExecutionOutput,
} from "../domain/execution.js";
import type { GithubRepositoryRef } from "../domain/external.js";
import type { TaskUnit } from "../domain/task-unit.js";
import { CodexWorkerLauncher } from "../workers/codex-worker-launcher.js";
import {
  GithubPrPipeline,
  type GithubPrPipelineConfig,
} from "../workers/github-pr-pipeline.js";
import type { FailureClassification } from "../workflow/state-machine.js";
import type { ExecutorAdapter } from "./adapter.js";

export interface RealCodexCliAdapterConfig {
  command: string;
  projectRoot: string;
  workspaceRoot?: string;
  artifactRoot?: string;
  cleanupStrategy?: "never" | "always" | "on_success";
  installCommand?: string;
  typecheckCommand?: string;
  testCommand?: string;
  buildCommand?: string;
  e2eCommand?: string;
  requireHumanOnTestFail: boolean;
  githubDelivery?: GithubPrDeliveryConfig;
}

export interface GithubPrDeliveryConfig
  extends Pick<
    GithubPrPipelineConfig,
    "token" | "baseUrl" | "remoteName" | "repositoryRef" | "baseBranch" | "draft"
  > {
  repositoryRef?: GithubRepositoryRef;
}

interface CommandResult {
  command: string;
  exitCode: number;
  stdout: string[];
  stderr: string[];
}

export class RealCodexCliAdapter implements ExecutorAdapter {
  readonly name = "codex" as const;

  constructor(private readonly config: RealCodexCliAdapterConfig) {}

  async execute(
    task: TaskUnit,
    context: ExecutionContext,
  ): Promise<RawExecutionOutput> {
    const startedAt = Date.now();
    const logs: ExecutionLogEntry[] = [
      logEntry("info", `codex-cli 开始真实执行 ${task.taskId}`),
    ];
    const stdout: string[] = [];
    const stderr: string[] = [];

    try {
      const codexPrompt = buildCodexPrompt(task);
      const launcher = new CodexWorkerLauncher({
        command: this.config.command,
        repositoryRoot: this.config.projectRoot,
        workspaceRoot: this.config.workspaceRoot,
        artifactRoot: this.config.artifactRoot,
        cleanupStrategy: this.config.cleanupStrategy,
      });
      const codexResult = await launcher.launch(task, context.signal, codexPrompt);
      const commandCwd = codexResult.worktreePath;

      if ((codexResult.exitCode ?? 1) !== 0) {
        throw new CommandFailedError(
          "codex",
          this.config.command,
          codexResult.exitCode ?? 1,
          codexResult.stdout,
          codexResult.stderr,
          codexResult.logs,
        );
      }

      logs.push(...codexResult.logs);
      stdout.push(...prefixLines("[codex:stdout] ", codexResult.stdout));
      stderr.push(...prefixLines("[codex:stderr] ", codexResult.stderr));

      const verificationCommands = [
        ["install", this.config.installCommand],
        ["typecheck", this.config.typecheckCommand],
        ["test", this.config.testCommand],
        ["build", this.config.buildCommand],
        ["e2e", this.config.e2eCommand],
      ] as const;

      for (const [label, command] of verificationCommands) {
        if (!command?.trim()) {
          continue;
        }
        const result = await runCommand(
          command,
          commandCwd,
          context.signal,
          undefined,
          label,
        );
        appendCommandResult(label, result, stdout, stderr, logs);
      }

      const gitStatus = await runCommand(
        "git status --short",
        commandCwd,
        context.signal,
      );
      appendCommandResult("git-status", gitStatus, stdout, stderr, logs);

      const gitDiffStat = await runCommand(
        "git diff --stat",
        commandCwd,
        context.signal,
      );
      appendCommandResult("git-diff-stat", gitDiffStat, stdout, stderr, logs);

      const gitDiffNames = await runCommand(
        "git diff --name-only",
        commandCwd,
        context.signal,
      );
      appendCommandResult(
        "git-diff-name-only",
        gitDiffNames,
        stdout,
        stderr,
        logs,
      );

      const gitDiffCached = await runCommand(
        "git diff --cached --name-only",
        commandCwd,
        context.signal,
      );
      appendCommandResult(
        "git-diff-cached-name-only",
        gitDiffCached,
        stdout,
        stderr,
        logs,
      );

      const gitUntracked = await runCommand(
        "git ls-files --others --exclude-standard",
        commandCwd,
        context.signal,
      );
      appendCommandResult(
        "git-untracked",
        gitUntracked,
        stdout,
        stderr,
        logs,
      );

      if (this.config.githubDelivery) {
        const pipeline = new GithubPrPipeline(this.config.githubDelivery);
        const prResult = await pipeline.deliver({
          worktreePath: commandCwd,
          branchName: codexResult.branchName,
          task,
          taskRunId: codexResult.taskRunId,
        });
        logs.push(
          logEntry(
            "info",
            `github-pr pipeline 完成：${prResult.repository.owner}/${prResult.repository.repo}#${prResult.pullRequest.number}`,
          ),
        );
        stdout.push(
          ...prefixLines("[github-pr:stdout] ", [
            `commit=${prResult.commitSha}`,
            `pull_request=${prResult.pullRequest.url}`,
            `head=${prResult.branchName}`,
            `base=${prResult.baseBranch}`,
          ]),
        );
      }

      return {
        status: "succeeded",
        stdout,
        stderr,
        logs,
        exitCode: 0,
        durationMs: Date.now() - startedAt,
        changedFiles: [
          ...new Set([
            ...gitDiffNames.stdout,
            ...gitDiffCached.stdout,
            ...gitUntracked.stdout,
          ]),
        ],
      };
    } catch (error) {
      if (error instanceof CommandFailedError) {
        logs.push(...error.logs);
        logs.push(logEntry("error", `${error.label} 执行失败，退出码 ${error.exitCode}`));
        stdout.push(...prefixLines(`[${error.label}:stdout] `, error.stdout));
        stderr.push(...prefixLines(`[${error.label}:stderr] `, error.stderr));

        return {
          status: "failed",
          stdout,
          stderr,
          logs,
          exitCode: error.exitCode,
          durationMs: Date.now() - startedAt,
          failureClassification: classifyFailure(error, this.config),
        };
      }

      if (isAppError(error)) {
        if (error.code === "EXECUTION_CANCELLED") {
          throw error;
        }

        logs.push(
          logEntry(
            "error",
            `真实执行 blocked: ${error.message}`,
          ),
        );
        stderr.push(error.message);
        stderr.push(...renderAppErrorDetails(error));

        return {
          status: "failed",
          stdout,
          stderr,
          logs,
          exitCode: 1,
          durationMs: Date.now() - startedAt,
          failureClassification: classifyAppError(error),
        };
      }

      throw error;
    }
  }
}

class CommandFailedError extends Error {
  constructor(
    readonly label: string,
    readonly command: string,
    readonly exitCode: number,
    readonly stdout: string[],
    readonly stderr: string[],
    readonly logs: ExecutionLogEntry[] = [],
  ) {
    super(`${label} failed with exit code ${exitCode}`);
  }
}

function buildCodexPrompt(task: TaskUnit): string {
  return [
    "你是 AgentForge 派发的真实执行器。",
    `任务 ID: ${task.taskId}`,
    `标题: ${task.title}`,
    `目标: ${task.goal}`,
    `任务类型: ${task.type}`,
    `读集合: ${task.readSet.join(", ") || "(none)"}`,
    `写集合: ${task.writeSet.join(", ") || "(none)"}`,
    `输入: ${task.inputs.join(" | ") || "(none)"}`,
    `交付物: ${task.deliverables.join(" | ") || "(none)"}`,
    `验收标准: ${task.acceptanceCriteria.join(" | ") || "(none)"}`,
    `任务测试命令: ${task.testCommands.join(" | ") || "(none)"}`,
    "要求:",
    "1. 仅在写集合范围内修改。",
    "2. 完成后保留工作区改动，不要回滚。",
    "3. 如果无法安全完成，直接输出失败原因。",
  ].join("\n");
}

async function runCommand(
  command: string,
  cwd: string,
  signal: AbortSignal,
  stdinText?: string,
  label?: string,
): Promise<CommandResult> {
  return await new Promise<CommandResult>((resolve, reject) => {
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
      const stdout = splitOutput(stdoutChunks.join(""));
      const stderr = splitOutput(stderrChunks.join(""));
      if ((exitCode ?? 1) !== 0) {
        reject(
          new CommandFailedError(
            label ?? inferLabel(command),
            command,
            exitCode ?? 1,
            stdout,
            stderr,
          ),
        );
        return;
      }

      resolve({
        command,
        exitCode: exitCode ?? 0,
        stdout,
        stderr,
      });
    });

    if (stdinText) {
      child.stdin.write(stdinText);
    }
    child.stdin.end();
  });
}

function appendCommandResult(
  label: string,
  result: CommandResult,
  stdout: string[],
  stderr: string[],
  logs: ExecutionLogEntry[],
): void {
  logs.push(logEntry("info", `${label} 执行完成：${result.command}`));
  stdout.push(...prefixLines(`[${label}:stdout] `, result.stdout));
  stderr.push(...prefixLines(`[${label}:stderr] `, result.stderr));
}

function prefixLines(prefix: string, lines: string[]): string[] {
  return lines.map((line) => `${prefix}${line}`);
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

function inferLabel(command: string): string {
  const firstToken = command.trim().split(/\s+/u)[0];
  return firstToken ? firstToken.replace(/[^a-zA-Z0-9_-]/gu, "") : "command";
}

function renderAppErrorDetails(error: AppError): string[] {
  return error.details
    ? [`details=${JSON.stringify(error.details)}`]
    : [];
}

function classifyAppError(error: AppError): FailureClassification {
  switch (error.code) {
    case "EXTERNAL_UNAVAILABLE":
    case "CONFIG_INVALID":
    case "CONFIG_MISSING":
    case "PERMISSION_DENIED":
      return "blocked";
    default:
      return "retryable";
  }
}

function classifyFailure(
  error: CommandFailedError,
  config: RealCodexCliAdapterConfig,
): FailureClassification {
  if (
    config.requireHumanOnTestFail &&
    (error.label === "test" || error.label === "e2e")
  ) {
    return "human_required";
  }

  const command = error.command.toLowerCase();
  if (
    config.requireHumanOnTestFail &&
    (command.includes(" test") ||
      command.startsWith("npm test") ||
      command.includes("playwright"))
  ) {
    return "human_required";
  }

  if (command.includes("git ")) {
    return "blocked";
  }

  return "retryable";
}
