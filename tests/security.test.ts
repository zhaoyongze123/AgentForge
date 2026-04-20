import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createHttpApp } from "../src/api/http-server.js";
import type { AppEnv } from "../src/core/config/env.js";
import { Logger } from "../src/core/logging/logger.js";
import { loadEnv } from "../src/core/config/env.js";
import { redactJsonString } from "../src/core/security/redaction.js";
import { ExecutorRuntime } from "../src/executors/runtime.js";
import { taskUnitFixture } from "../src/contracts/fixtures.js";
import { GitWorktreeManager } from "../src/workers/git-worktree-manager.js";

function createEnv(databaseUrl: string): AppEnv {
  return {
    nodeEnv: "test",
    workflowExecutor: "in_memory",
    strictMode: false,
    allowSimulation: true,
    requireRealExternals: false,
    controlPlaneApiKey: "cp-secret",
    humanGateApiKey: "hg-secret",
    projectAllowlist: ["project-a"],
    githubToken: undefined,
    feishuAppId: undefined,
    feishuAppSecret: undefined,
    feishuVerificationToken: "verify-token",
    feishuEncryptKey: "encrypt-key",
    obsidianEnabled: false,
    obsidianRoot: undefined,
    databaseUrl,
    temporalAddress: "127.0.0.1:7233",
    temporalNamespace: "default",
    temporalTaskQueue: "agentforge-control-plane",
  };
}

test("loadEnv 支持安全相关配置", () => {
  const env = loadEnv({
    CONTROL_PLANE_API_KEY: "cp-secret",
    HUMAN_GATE_API_KEY: "hg-secret",
    PROJECT_ALLOWLIST: "project-a,project-b",
  });

  assert.equal(env.controlPlaneApiKey, "cp-secret");
  assert.equal(env.humanGateApiKey, "hg-secret");
  assert.deepEqual(env.projectAllowlist, ["project-a", "project-b"]);
});

test("控制平面、项目权限与人工 gate 会拒绝未授权请求", async () => {
  const root = await mkdtemp(join(tmpdir(), "agentforge-security-"));
  const server = createHttpApp(createEnv(join(root, "db.json")));
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("无法获取测试服务端口");
  }
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    const unauthorized = await fetch(`${baseUrl}/api/plans`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ request: "做一个用户系统", phase: "phase-sec" }),
    });
    assert.equal(unauthorized.status, 401);

    const forbiddenProject = await fetch(`${baseUrl}/api/plans`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer cp-secret",
        "x-project-id": "project-x",
      },
      body: JSON.stringify({ request: "做一个用户系统", phase: "phase-sec" }),
    });
    assert.equal(forbiddenProject.status, 403);

    const createdResponse = await fetch(`${baseUrl}/api/plans`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer cp-secret",
        "x-project-id": "project-a",
      },
      body: JSON.stringify({ request: "做一个用户系统", phase: "phase-sec" }),
    });
    assert.equal(createdResponse.status, 201);
    const created = (await createdResponse.json()) as { planId: string };

    const wrongProjectRead = await fetch(`${baseUrl}/api/plans/${created.planId}/status`, {
      headers: {
        authorization: "Bearer cp-secret",
        "x-project-id": "project-b",
      },
    });
    assert.equal(wrongProjectRead.status, 403);

    const missingHumanGateAuth = await fetch(`${baseUrl}/api/human-gates`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer cp-secret",
      },
      body: JSON.stringify({
        relatedId: "task-1",
        type: "decision",
        summary: "确认",
        actor: "tester",
      }),
    });
    assert.equal(missingHumanGateAuth.status, 401);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

test("日志与回调体会脱敏敏感字段", () => {
  const raw = JSON.stringify({
    token: "secret-token",
    encrypt: "cipher",
    nested: { app_secret: "app-secret" },
  });
  const redacted = redactJsonString(raw);
  assert.equal(redacted.includes("secret-token"), false);
  assert.equal(redacted.includes("app-secret"), false);

  const logger = new Logger();
  const lines: string[] = [];
  const original = console.log;
  console.log = (line?: unknown) => {
    lines.push(String(line));
  };

  try {
    logger.info("security-test", {
      token: "secret-token",
      nested: { password: "p@ss" },
    });
  } finally {
    console.log = original;
  }

  assert.equal(lines[0]?.includes("secret-token"), false);
  assert.equal(lines[0]?.includes("p@ss"), false);
  assert.equal(lines[0]?.includes("[REDACTED]"), true);
});

test("执行器会拒绝越界 write_set", async () => {
  const runtime = new ExecutorRuntime();
  await assert.rejects(
    () =>
      runtime.execute(
        {
          ...taskUnitFixture,
          type: "backend",
          writeSet: ["frontend/**"],
        },
        "codex",
      ),
    (error: unknown) =>
      error instanceof Error && "code" in error && error.code === "PERMISSION_DENIED",
  );
});

test("GitWorktreeManager 会把危险 planId/taskId 约束在 workspaceRoot 内", async () => {
  const root = await mkdtemp(join(tmpdir(), "agentforge-security-worktree-"));
  const repositoryRoot = join(root, "repo");
  const workspaceRoot = join(root, "worktrees");
  await mkdirpGitRepo(repositoryRoot);

  const manager = new GitWorktreeManager({
    repositoryRoot,
    workspaceRoot,
  });
  const prepared = await manager.prepareTaskWorktree({
    planId: "../plan:../../one",
    taskId: "..//task:?two",
  });

  assert.equal(prepared.branchName, "task/plan-one/task-two");
  assert.equal(prepared.worktreePath.startsWith(workspaceRoot), true);

  await manager.cleanupTaskWorktree(prepared);
});

async function mkdirpGitRepo(repositoryRoot: string): Promise<void> {
  await import("node:fs/promises").then(async (fs) => {
    await fs.mkdir(repositoryRoot, { recursive: true });
    await fs.writeFile(join(repositoryRoot, "README.md"), "# security\n");
  });
  await import("node:child_process").then(({ execFileSync }) => {
    execFileSync("git", ["init"], { cwd: repositoryRoot });
    execFileSync("git", ["config", "user.email", "agentforge@example.com"], {
      cwd: repositoryRoot,
    });
    execFileSync("git", ["config", "user.name", "AgentForge"], {
      cwd: repositoryRoot,
    });
    execFileSync("git", ["add", "README.md"], { cwd: repositoryRoot });
    execFileSync("git", ["commit", "-m", "init"], { cwd: repositoryRoot });
  });
}
