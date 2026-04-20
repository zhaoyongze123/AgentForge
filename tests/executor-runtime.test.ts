import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { createServer } from "node:http";

import type { TaskUnit } from "../src/domain/task-unit.js";
import { ExecutorRuntime } from "../src/executors/runtime.js";
import { GitWorktreeManager } from "../src/workers/git-worktree-manager.js";

function createTask(
  taskId: string,
  inputs: string[] = [],
  type: TaskUnit["type"] = "backend",
): TaskUnit {
  return {
    taskId,
    title: taskId,
    goal: "goal",
    type,
    phase: "phase-2",
    priority: "medium",
    dependencies: [],
    readSet: ["docs/**"],
    writeSet: ["src/**"],
    inputs,
    deliverables: ["deliverable"],
    acceptanceCriteria: ["criteria"],
    testCommands: ["npm test"],
    handoffTo: "acceptance-agent",
    blockedConditions: [],
    autoFixPolicy: [],
    humanGate: { required: false },
    status: "READY",
  };
}

test("ExecutorRuntime 可以成功执行并标准化结果", async () => {
  const runtime = new ExecutorRuntime({ timeoutMs: 50 });
  const result = await runtime.execute(createTask("task-success"), "codex");

  assert.equal(result.status, "succeeded");
  assert.equal(result.executor, "codex");
  assert.equal(result.exitCode, 0);
  assert.ok(result.evidence.length > 0);
});

test("ExecutorRuntime 会把 timeout 标准化为 timed_out", async () => {
  const runtime = new ExecutorRuntime({ timeoutMs: 20 });
  const result = await runtime.execute(
    createTask("task-slow", ["simulate:slow"]),
    "codex",
  );

  assert.equal(result.status, "timed_out");
  assert.equal(runtime.classifyFailure(result), "FAILED_RETRYABLE");
});

test("ExecutorRuntime 会把失败分类映射为 blocked", async () => {
  const runtime = new ExecutorRuntime({ timeoutMs: 50 });
  const result = await runtime.execute(
    createTask("task-blocked", ["simulate:blocked"]),
    "claude",
  );

  assert.equal(result.status, "failed");
  assert.equal(result.failureClassification, "blocked");
  assert.equal(runtime.classifyFailure(result), "FAILED_BLOCKED");
});

test("ExecutorRuntime 会把 human_required 分类映射到 WAITING_HUMAN", async () => {
  const runtime = new ExecutorRuntime({ timeoutMs: 50 });
  const result = await runtime.execute(
    createTask("task-human", ["simulate:human_required"]),
    "openhands",
  );

  assert.equal(result.failureClassification, "human_required");
  assert.equal(runtime.classifyFailure(result), "WAITING_HUMAN");
});

test("ExecutorRuntime 在禁用 simulation 且未提供 realCodex 时拒绝初始化", () => {
  assert.throws(
    () =>
      new ExecutorRuntime({
        allowSimulation: false,
      }),
    /ALLOW_SIMULATION=false/u,
  );
});

test("GitWorktreeManager 会为同计划不同任务创建独立 worktree 并支持清理", async () => {
  const tempRoot = await fs.mkdtemp(
    path.join(os.tmpdir(), "agentforge-worktree-"),
  );
  const repositoryRoot = await createGitRepository(tempRoot);
  const workspaceRoot = path.join(tempRoot, "worktrees");
  const manager = new GitWorktreeManager({
    repositoryRoot,
    workspaceRoot,
  });

  const first = await manager.prepareTaskWorktree({
    planId: "plan-1",
    taskId: "task-a",
  });
  const second = await manager.prepareTaskWorktree({
    planId: "plan-1",
    taskId: "task-b",
  });

  assert.notEqual(first.worktreePath, second.worktreePath);
  assert.equal(first.branchName, "task/plan-1/task-a");
  assert.equal(second.branchName, "task/plan-1/task-b");
  assert.equal(await currentBranch(first.worktreePath), first.branchName);
  assert.equal(await currentBranch(second.worktreePath), second.branchName);

  await manager.cleanupTaskWorktree(first);
  await manager.cleanupTaskWorktree(second);

  await assert.rejects(fs.access(first.worktreePath));
  await assert.rejects(fs.access(second.worktreePath));
  assert.equal(
    execFileSync("git", ["branch", "--list", first.branchName], {
      cwd: repositoryRoot,
      encoding: "utf8",
    }).trim(),
    "",
  );
});

test("ExecutorRuntime 在真实 codex 模式下执行 CLI 与验证命令并收集证据", async () => {
  const tempRoot = await fs.mkdtemp(
    path.join(os.tmpdir(), "agentforge-real-executor-"),
  );
  const fakeCodexPath = path.join(tempRoot, "fake-codex.sh");
  const logPath = path.join(tempRoot, "commands.log");
  const promptPath = path.join(tempRoot, "prompt.txt");
  const projectRoot = await createGitRepository(tempRoot);
  const workspaceRoot = path.join(tempRoot, "worktrees");
  const artifactRoot = path.join(tempRoot, "artifacts");

  await fs.writeFile(
    path.join(projectRoot, "package.json"),
    JSON.stringify({ name: "fake-project", version: "1.0.0" }, null, 2),
  );
  await fs.writeFile(
    fakeCodexPath,
    [
      "#!/bin/sh",
      `echo \"$0|$PWD|$*\" >> "${logPath}"`,
      `cat > "${promptPath}"`,
      "mkdir -p src",
      "touch src/worker-created.txt",
      "echo codex-ran",
    ].join("\n"),
    { mode: 0o755 },
  );

  const runtime = new ExecutorRuntime({
    timeoutMs: 5000,
    realCodex: {
      command: fakeCodexPath,
      projectRoot,
      workspaceRoot,
      artifactRoot,
      installCommand: "echo install-ok",
      typecheckCommand: "echo typecheck-ok",
      testCommand: "echo test-ok",
      buildCommand: "echo build-ok",
      e2eCommand: "echo e2e-ok",
      requireHumanOnTestFail: true,
    },
  });

  const result = await runtime.execute(createTask("task-real"), "codex");
  const commandLog = await fs.readFile(logPath, "utf8");
  const prompt = await fs.readFile(promptPath, "utf8");
  const worktreePath = path.join(workspaceRoot, "no-plan", "task-real");
  const resolvedWorktreePath = await fs.realpath(worktreePath);

  assert.equal(result.status, "succeeded");
  assert.equal(
    commandLog.includes(`|${worktreePath}|`) ||
      commandLog.includes(`|${resolvedWorktreePath}|`),
    true,
  );
  assert.ok(result.stdout.some((line) => line.includes("codex-ran")));
  assert.ok(result.stdout.some((line) => line.includes("install-ok")));
  assert.ok(result.stdout.some((line) => line.includes("typecheck-ok")));
  assert.ok(result.stdout.some((line) => line.includes("test-ok")));
  assert.ok(result.stdout.some((line) => line.includes("build-ok")));
  assert.ok(result.stdout.some((line) => line.includes("e2e-ok")));
  assert.match(prompt, /任务 ID: task-real/u);
  assert.match(prompt, /写集合: src\/\*\*/u);
  assert.match(prompt, /验收标准: criteria/u);
  await fs.access(path.join(worktreePath, "src/worker-created.txt"));
  await assert.rejects(fs.access(path.join(projectRoot, "src/worker-created.txt")));
  assert.ok(
    result.logs.some((entry) => entry.message.includes("worker heartbeat SUCCEEDED")),
  );
  assert.ok(
    result.logs.some((entry) => entry.message.includes("git-status 执行完成")),
  );
});

test("ExecutorRuntime 在真实 codex 模式下 writeSet 越界会 blocked 并记录证据", async () => {
  const tempRoot = await fs.mkdtemp(
    path.join(os.tmpdir(), "agentforge-real-executor-guard-"),
  );
  const fakeCodexPath = path.join(tempRoot, "fake-codex.sh");
  const projectRoot = await createGitRepository(tempRoot);

  await fs.writeFile(
    fakeCodexPath,
    [
      "#!/bin/sh",
      "cat >/dev/null",
      "touch README-outside.md",
      "echo outside-write",
    ].join("\n"),
    { mode: 0o755 },
  );

  const runtime = new ExecutorRuntime({
    timeoutMs: 5000,
    realCodex: {
      command: fakeCodexPath,
      projectRoot,
      workspaceRoot: path.join(tempRoot, "worktrees"),
      artifactRoot: path.join(tempRoot, "artifacts"),
      requireHumanOnTestFail: true,
    },
  });

  const result = await runtime.execute(createTask("task-real-guard"), "codex");

  assert.equal(result.status, "failed");
  assert.equal(result.failureClassification, "blocked");
  assert.equal(runtime.classifyFailure(result), "FAILED_BLOCKED");
  assert.equal(
    result.evidence.some((line) => line.includes("write_set_violation:README-outside.md")),
    true,
  );
  assert.equal(
    result.logs.some((entry) => entry.message.includes("write_set 越界: README-outside.md")),
    true,
  );
});

test("ExecutorRuntime 在真实 codex 模式下子进程异常退出会返回 failed", async () => {
  const tempRoot = await fs.mkdtemp(
    path.join(os.tmpdir(), "agentforge-real-executor-crash-"),
  );
  const fakeCodexPath = path.join(tempRoot, "fake-codex.sh");
  const projectRoot = await createGitRepository(tempRoot);

  await fs.writeFile(
    fakeCodexPath,
    ["#!/bin/sh", "cat >/dev/null", "echo codex-crash >&2", "exit 7"].join("\n"),
    { mode: 0o755 },
  );

  const runtime = new ExecutorRuntime({
    timeoutMs: 5000,
    realCodex: {
      command: fakeCodexPath,
      projectRoot,
      workspaceRoot: path.join(tempRoot, "worktrees"),
      artifactRoot: path.join(tempRoot, "artifacts"),
      requireHumanOnTestFail: true,
    },
  });

  const result = await runtime.execute(createTask("task-real-crash"), "codex");

  assert.equal(result.status, "failed");
  assert.equal(result.exitCode, 7);
  assert.equal(result.failureClassification, "retryable");
  assert.ok(result.stderr.some((line) => line.includes("codex-crash")));
  assert.ok(
    result.logs.some((entry) => entry.message.includes("worker heartbeat FAILED")),
  );
});

test("ExecutorRuntime 在真实 codex 模式下测试失败可要求人工介入", async () => {
  const tempRoot = await fs.mkdtemp(
    path.join(os.tmpdir(), "agentforge-real-executor-fail-"),
  );
  const fakeCodexPath = path.join(tempRoot, "fake-codex.sh");
  const projectRoot = await createGitRepository(tempRoot);
  await fs.writeFile(
    fakeCodexPath,
    ["#!/bin/sh", "cat >/dev/null", "echo codex-ran"].join("\n"),
    { mode: 0o755 },
  );

  const runtime = new ExecutorRuntime({
    timeoutMs: 5000,
    realCodex: {
      command: fakeCodexPath,
      projectRoot,
      workspaceRoot: path.join(tempRoot, "worktrees"),
      artifactRoot: path.join(tempRoot, "artifacts"),
      testCommand: "sh -c 'echo failing-test >&2; exit 1'",
      requireHumanOnTestFail: true,
    },
  });

  const result = await runtime.execute(createTask("task-real-fail"), "codex");

  assert.equal(result.status, "failed");
  assert.equal(result.failureClassification, "human_required");
  assert.equal(runtime.classifyFailure(result), "WAITING_HUMAN");
});

test("ExecutorRuntime 在 GitHub PR 创建失败时会归一为 blocked", async () => {
  const tempRoot = await fs.mkdtemp(
    path.join(os.tmpdir(), "agentforge-real-executor-github-fail-"),
  );
  const fakeCodexPath = path.join(tempRoot, "fake-codex.sh");
  const projectRoot = await createGitRepository(tempRoot);
  const remoteRoot = path.join(tempRoot, "origin.git");
  execFileSync("git", ["init", "--bare", remoteRoot]);
  execFileSync("git", ["remote", "add", "origin", remoteRoot], {
    cwd: projectRoot,
  });

  await fs.writeFile(
    fakeCodexPath,
    [
      "#!/bin/sh",
      "cat >/dev/null",
      "mkdir -p src",
      "echo real-change > src/worker-created.txt",
      "echo codex-ran",
    ].join("\n"),
    { mode: 0o755 },
  );

  const server = createServer((req, res) => {
    if (req.url === "/repos/tester/agentforge") {
      res.statusCode = 200;
      res.setHeader("content-type", "application/json");
      res.end(
        JSON.stringify({
          owner: { login: "tester" },
          name: "agentforge",
          default_branch: "main",
          private: false,
          html_url: "https://github.com/tester/agentforge",
        }),
      );
      return;
    }

    if (req.url === "/repos/tester/agentforge/pulls" && req.method === "POST") {
      res.statusCode = 500;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ message: "pr create failed" }));
      return;
    }

    res.statusCode = 404;
    res.end();
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("无法获取测试端口");
  }

  const runtime = new ExecutorRuntime({
    timeoutMs: 5000,
    realCodex: {
      command: fakeCodexPath,
      projectRoot,
      workspaceRoot: path.join(tempRoot, "worktrees"),
      artifactRoot: path.join(tempRoot, "artifacts"),
      requireHumanOnTestFail: true,
      githubDelivery: {
        token: "github-token",
        baseUrl: `http://127.0.0.1:${address.port}`,
        repositoryRef: {
          owner: "tester",
          repo: "agentforge",
        },
      },
    },
  });

  try {
    const result = await runtime.execute(
      createTask("task-real-github-fail"),
      "codex",
    );

    assert.equal(result.status, "failed");
    assert.equal(result.failureClassification, "blocked");
    assert.equal(runtime.classifyFailure(result), "FAILED_BLOCKED");
    assert.equal(
      result.stderr.some((line) => line.includes("create_pull_request")),
      true,
    );
    assert.equal(
      result.logs.some((entry) => entry.message.includes("真实执行 blocked")),
      true,
    );
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

async function createGitRepository(root: string): Promise<string> {
  const repositoryRoot = path.join(root, "repo");
  await fs.mkdir(repositoryRoot, { recursive: true });
  await fs.writeFile(path.join(repositoryRoot, "README.md"), "# temp\n");
  execFileSync("git", ["init"], { cwd: repositoryRoot });
  execFileSync("git", ["config", "user.email", "agentforge@example.com"], {
    cwd: repositoryRoot,
  });
  execFileSync("git", ["config", "user.name", "AgentForge"], {
    cwd: repositoryRoot,
  });
  execFileSync("git", ["add", "README.md"], { cwd: repositoryRoot });
  execFileSync("git", ["commit", "-m", "init"], { cwd: repositoryRoot });
  return repositoryRoot;
}

async function currentBranch(worktreePath: string): Promise<string> {
  return execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
    cwd: worktreePath,
    encoding: "utf8",
  }).trim();
}
