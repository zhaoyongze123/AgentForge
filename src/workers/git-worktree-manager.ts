import { access, mkdir, realpath } from "node:fs/promises";
import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

import { AppError } from "../core/errors/app-error.js";

const execFileAsync = promisify(execFile);

export interface GitWorktreeManagerOptions {
  repositoryRoot: string;
  workspaceRoot: string;
  baseRef?: string;
  branchPrefix?: string;
}

export interface PrepareTaskWorktreeInput {
  planId: string;
  taskId: string;
}

export interface PreparedTaskWorktree {
  branchName: string;
  worktreePath: string;
  existed: boolean;
}

export interface CleanupTaskWorktreeInput {
  worktreePath: string;
  branchName: string;
  preserveWorktree?: boolean;
  preserveBranch?: boolean;
}

export class GitWorktreeManager {
  private readonly repositoryRoot: string;
  private readonly workspaceRoot: string;
  private readonly baseRef: string;
  private readonly branchPrefix: string;

  constructor(options: GitWorktreeManagerOptions) {
    this.repositoryRoot = path.resolve(options.repositoryRoot);
    this.workspaceRoot = path.resolve(options.workspaceRoot);
    this.baseRef = options.baseRef ?? "HEAD";
    this.branchPrefix = sanitizeSegment(options.branchPrefix ?? "task");
  }

  async prepareTaskWorktree(
    input: PrepareTaskWorktreeInput,
  ): Promise<PreparedTaskWorktree> {
    await this.assertGitRepository();
    await mkdir(this.workspaceRoot, { recursive: true });

    const branchName = this.buildBranchName(input.planId, input.taskId);
    const worktreePath = this.buildWorktreePath(input.planId, input.taskId);

    if (await pathExists(path.join(worktreePath, ".git"))) {
      return {
        branchName,
        worktreePath,
        existed: true,
      };
    }

    if (await pathExists(worktreePath)) {
      throw new AppError({
        code: "PERMISSION_DENIED",
        message: "目标 worktree 目录已存在且不受 AgentForge 管理。",
        details: { worktreePath },
      });
    }

    const branchExists = await this.branchExists(branchName);
    if (branchExists) {
      await this.runGit(["worktree", "add", worktreePath, branchName]);
    } else {
      await this.runGit([
        "worktree",
        "add",
        "-b",
        branchName,
        worktreePath,
        this.baseRef,
      ]);
    }

    return {
      branchName,
      worktreePath,
      existed: false,
    };
  }

  async cleanupTaskWorktree(input: CleanupTaskWorktreeInput): Promise<void> {
    await this.assertGitRepository();

    if (!input.preserveWorktree && (await pathExists(input.worktreePath))) {
      await this.runGit(["worktree", "remove", "--force", input.worktreePath]);
      await this.runGit(["worktree", "prune"]);
    }

    if (!input.preserveBranch && (await this.branchExists(input.branchName))) {
      await this.runGit(["branch", "-D", input.branchName]);
    }
  }

  buildBranchName(planId: string, taskId: string): string {
    return [
      this.branchPrefix,
      sanitizeSegment(planId),
      sanitizeSegment(taskId),
    ].join("/");
  }

  buildWorktreePath(planId: string, taskId: string): string {
    const worktreePath = path.resolve(
      this.workspaceRoot,
      sanitizeSegment(planId),
      sanitizeSegment(taskId),
    );
    assertWithinRoot(this.workspaceRoot, worktreePath);
    return worktreePath;
  }

  private async assertGitRepository(): Promise<void> {
    const { stdout } = await this.runGit(["rev-parse", "--show-toplevel"]);
    const actualRoot = stdout.trim();
    const expectedRoot = await realpath(this.repositoryRoot);
    const resolvedActualRoot = await realpath(actualRoot);
    if (resolvedActualRoot !== expectedRoot) {
      throw new AppError({
        code: "CONFIG_INVALID",
        message: "Git 仓库根目录与配置不一致。",
        details: {
          repositoryRoot: expectedRoot,
          actualRoot: resolvedActualRoot,
        },
      });
    }
  }

  private async branchExists(branchName: string): Promise<boolean> {
    try {
      await this.runGit(["show-ref", "--verify", `refs/heads/${branchName}`]);
      return true;
    } catch (error) {
      if (
        error instanceof AppError &&
        error.code === "EXTERNAL_UNAVAILABLE"
      ) {
        return false;
      }
      throw error;
    }
  }

  private async runGit(args: string[]): Promise<{ stdout: string; stderr: string }> {
    try {
      return await execFileAsync("git", args, {
        cwd: this.repositoryRoot,
      });
    } catch (error) {
      const stderr =
        typeof error === "object" &&
        error !== null &&
        "stderr" in error &&
        typeof error.stderr === "string"
          ? error.stderr.trim()
          : undefined;
      const stdout =
        typeof error === "object" &&
        error !== null &&
        "stdout" in error &&
        typeof error.stdout === "string"
          ? error.stdout.trim()
          : undefined;

      throw new AppError({
        code: "EXTERNAL_UNAVAILABLE",
        message: "git worktree 操作失败。",
        details: {
          repositoryRoot: this.repositoryRoot,
          args,
          stdout,
          stderr,
        },
      });
    }
  }
}

function sanitizeSegment(value: string): string {
  const sanitized = value
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/gu, "-")
    .replace(/\.\.+/gu, "-")
    .replace(/-{2,}/gu, "-")
    .replace(/^[./-]+|[./-]+$/gu, "")
    .slice(0, 80);

  return sanitized || "task";
}

function assertWithinRoot(root: string, target: string): void {
  if (
    target !== root &&
    !target.startsWith(`${root}${path.sep}`)
  ) {
    throw new AppError({
      code: "PERMISSION_DENIED",
      message: "worktree 路径越界。",
      details: {
        root,
        target,
      },
    });
  }
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await access(targetPath);
    return true;
  } catch {
    return false;
  }
}
