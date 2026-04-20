import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { AppError, isAppError } from "../core/errors/app-error.js";
import type {
  GithubPullRequestSummary,
  GithubRepositoryRef,
} from "../domain/external.js";
import type { TaskUnit } from "../domain/task-unit.js";
import { GithubAdapter } from "../integrations/github-adapter.js";

const execFileAsync = promisify(execFile);

export interface GithubPrPipelineConfig {
  token: string;
  baseUrl?: string;
  remoteName?: string;
  repositoryRef?: GithubRepositoryRef;
  baseBranch?: string;
  draft?: boolean;
}

export interface GithubPrPipelineInput {
  worktreePath: string;
  branchName: string;
  task: TaskUnit;
  taskRunId: string;
}

export interface GithubPrPipelineResult {
  repository: GithubRepositoryRef;
  remoteName: string;
  baseBranch: string;
  branchName: string;
  commitMessage: string;
  commitSha: string;
  stagedFiles: string[];
  pullRequest: GithubPullRequestSummary;
}

export class GithubPrPipeline {
  private readonly remoteName: string;
  private readonly github: GithubAdapter;

  constructor(private readonly config: GithubPrPipelineConfig) {
    this.remoteName = config.remoteName ?? "origin";
    this.github = new GithubAdapter({
      token: config.token,
      baseUrl: config.baseUrl,
    });
  }

  async deliver(input: GithubPrPipelineInput): Promise<GithubPrPipelineResult> {
    const repository =
      this.config.repositoryRef ??
      (await this.resolveRepositoryRef(input.worktreePath));
    const baseBranch = await this.resolveBaseBranch(repository);

    await this.runGit(
      input.worktreePath,
      ["add", "-A"],
      "stage_changes",
      input.branchName,
    );

    const stagedFiles = await this.listStagedFiles(
      input.worktreePath,
      input.branchName,
    );
    if (stagedFiles.length === 0) {
      throw new AppError({
        code: "EXTERNAL_UNAVAILABLE",
        message: "任务没有可提交改动，无法创建 PR。",
        details: {
          stage: "stage_changes",
          worktreePath: input.worktreePath,
          branchName: input.branchName,
        },
      });
    }

    const commitMessage = buildCommitMessage(input.task);
    await this.runGit(
      input.worktreePath,
      ["commit", "-m", commitMessage],
      "commit",
      input.branchName,
    );
    const commitSha = (
      await this.runGit(
        input.worktreePath,
        ["rev-parse", "HEAD"],
        "resolve_head",
        input.branchName,
      )
    ).stdout.trim();

    await this.runGit(
      input.worktreePath,
      ["push", "-u", this.remoteName, input.branchName],
      "push_branch",
      input.branchName,
    );

    const pullRequest = await this.createPullRequest(
      repository,
      baseBranch,
      input,
      commitSha,
    );

    return {
      repository,
      remoteName: this.remoteName,
      baseBranch,
      branchName: input.branchName,
      commitMessage,
      commitSha,
      stagedFiles,
      pullRequest,
    };
  }

  private async listStagedFiles(
    worktreePath: string,
    branchName: string,
  ): Promise<string[]> {
    const result = await this.runGit(
      worktreePath,
      ["diff", "--cached", "--name-only"],
      "list_staged_files",
      branchName,
    );
    return splitLines(result.stdout);
  }

  private async resolveRepositoryRef(
    worktreePath: string,
  ): Promise<GithubRepositoryRef> {
    const remoteUrl = (
      await this.runGit(
        worktreePath,
        ["remote", "get-url", this.remoteName],
        "resolve_remote",
      )
    ).stdout.trim();

    const sshMatch = remoteUrl.match(
      /^(?:ssh:\/\/)?[^@]+@[^/:]+[:/](?<owner>[^/]+)\/(?<repo>[^/]+?)(?:\.git)?$/u,
    );
    if (sshMatch?.groups) {
      return {
        owner: sshMatch.groups.owner,
        repo: sshMatch.groups.repo,
      };
    }

    if (remoteUrl.includes("://")) {
      const url = new URL(remoteUrl);
      const segments = url.pathname
        .replace(/^\/+/u, "")
        .replace(/\.git$/u, "")
        .split("/")
        .filter(Boolean);
      if (segments.length >= 2) {
        return {
          owner: segments[segments.length - 2] ?? "",
          repo: segments[segments.length - 1] ?? "",
        };
      }
    }

    throw new AppError({
      code: "CONFIG_INVALID",
      message: "无法从 remote URL 推导 GitHub 仓库，请显式提供 repositoryRef。",
      details: {
        remoteName: this.remoteName,
        remoteUrl,
      },
    });
  }

  private async resolveBaseBranch(
    repository: GithubRepositoryRef,
  ): Promise<string> {
    if (this.config.baseBranch?.trim()) {
      return this.config.baseBranch.trim();
    }

    try {
      const summary = await this.github.getRepository(repository);
      return summary.defaultBranch;
    } catch (error) {
      throw this.wrapGithubError(
        "resolve_repository",
        error,
        repository,
      );
    }
  }

  private async createPullRequest(
    repository: GithubRepositoryRef,
    baseBranch: string,
    input: GithubPrPipelineInput,
    commitSha: string,
  ): Promise<GithubPullRequestSummary> {
    try {
      return await this.github.createPullRequest({
        ...repository,
        title: buildPullRequestTitle(input.task),
        body: buildPullRequestBody(
          input.task,
          input.taskRunId,
          input.branchName,
          baseBranch,
          commitSha,
        ),
        head: input.branchName,
        base: baseBranch,
        draft: this.config.draft ?? false,
      });
    } catch (error) {
      throw this.wrapGithubError(
        "create_pull_request",
        error,
        repository,
        {
          branchName: input.branchName,
          taskRunId: input.taskRunId,
          baseBranch,
        },
      );
    }
  }

  private async runGit(
    cwd: string,
    args: string[],
    stage: string,
    branchName?: string,
  ): Promise<{ stdout: string; stderr: string }> {
    try {
      return await execFileAsync("git", args, { cwd });
    } catch (error) {
      const stdout = readExecOutput(error, "stdout");
      const stderr = readExecOutput(error, "stderr");
      throw new AppError({
        code: "EXTERNAL_UNAVAILABLE",
        message: `GitHub PR pipeline 在 ${stage} 阶段失败。`,
        details: {
          stage,
          cwd,
          branchName,
          remoteName: this.remoteName,
          args,
          stdout,
          stderr,
        },
        cause: error,
      });
    }
  }

  private wrapGithubError(
    stage: string,
    error: unknown,
    repository: GithubRepositoryRef,
    details: Record<string, unknown> = {},
  ): AppError {
    if (isAppError(error)) {
      return new AppError({
        code: error.code,
        message: `GitHub PR pipeline 在 ${stage} 阶段失败。`,
        details: {
          stage,
          repository,
          remoteName: this.remoteName,
          ...details,
          causeMessage: error.message,
          causeDetails: error.details,
        },
        cause: error,
      });
    }

    return new AppError({
      code: "EXTERNAL_UNAVAILABLE",
      message: `GitHub PR pipeline 在 ${stage} 阶段失败。`,
      details: {
        stage,
        repository,
        remoteName: this.remoteName,
        ...details,
      },
      cause: error,
    });
  }
}

function inferCommitType(task: TaskUnit): string {
  switch (task.type) {
    case "docs":
      return "docs";
    case "acceptance":
      return "test";
    case "knowledge_capture":
    case "knowledge_merge":
    case "knowledge_review":
    case "knowledge_cleanup":
      return "chore";
    default:
      return "feat";
  }
}

function buildCommitMessage(task: TaskUnit): string {
  return `${inferCommitType(task)}: 交付 ${task.taskId} ${task.title}`;
}

function buildPullRequestTitle(task: TaskUnit): string {
  return `${inferCommitType(task)}: ${task.title}`;
}

function buildPullRequestBody(
  task: TaskUnit,
  taskRunId: string,
  branchName: string,
  baseBranch: string,
  commitSha: string,
): string {
  return [
    "## 任务元信息",
    `- planId: ${task.planId ?? "no-plan"}`,
    `- taskId: ${task.taskId}`,
    `- taskRunId: ${taskRunId}`,
    `- branch: ${branchName}`,
    `- base: ${baseBranch}`,
    `- commit: ${commitSha}`,
    "",
    "## 任务说明",
    `- 标题: ${task.title}`,
    `- 目标: ${task.goal}`,
    "",
    "## 验收标准",
    ...(task.acceptanceCriteria.length > 0
      ? task.acceptanceCriteria.map((criterion) => `- ${criterion}`)
      : ["- (none)"]),
  ].join("\n");
}

function splitLines(value: string): string[] {
  return value
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean);
}

function readExecOutput(
  error: unknown,
  key: "stdout" | "stderr",
): string | undefined {
  if (typeof error === "object" && error !== null) {
    const value = (error as Record<string, unknown>)[key];
    if (typeof value === "string") {
      return value.trim();
    }
  }

  return undefined;
}
