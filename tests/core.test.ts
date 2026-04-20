import test from "node:test";
import assert from "node:assert/strict";

import {
  assertRealExecutionReadiness,
  loadEnv,
} from "../src/core/config/env.js";
import { AppError, isAppError } from "../src/core/errors/app-error.js";

test("loadEnv 在缺少受条件约束的必需变量时抛出结构化错误", () => {
  assert.throws(
    () =>
      loadEnv({
        OBSIDIAN_ENABLED: "true",
      }),
    (error: unknown) =>
      isAppError(error) &&
      error.code === "CONFIG_MISSING" &&
      error.details?.key === "OBSIDIAN_ROOT",
  );
});

test("loadEnv 在合法输入下返回默认配置", () => {
  const env = loadEnv({
    NODE_ENV: "test",
    WORKFLOW_EXECUTOR: "in_memory",
    OBSIDIAN_ENABLED: "false",
  });

  assert.deepEqual(env, {
    nodeEnv: "test",
    workflowExecutor: "in_memory",
    realExecutor: "simulated",
    strictMode: false,
    allowSimulation: true,
    requireRealExternals: false,
    controlPlaneApiKey: undefined,
    humanGateApiKey: undefined,
    projectAllowlist: [],
    githubToken: undefined,
    feishuAppId: undefined,
    feishuAppSecret: undefined,
    feishuVerificationToken: undefined,
    feishuEncryptKey: undefined,
    feishuWebhookUrl: undefined,
    mem0BaseUrl: undefined,
    mem0ApiKey: undefined,
    mem0UserId: undefined,
    obsidianEnabled: false,
    obsidianRoot: undefined,
    databaseUrl: ".agentforge/db.json",
    temporalAddress: "127.0.0.1:7233",
    temporalNamespace: "default",
    temporalTaskQueue: "agentforge-control-plane",
    executorTimeoutMs: 120000,
    targetProjectRoot: undefined,
    codexCliCommand: "codex exec --dangerously-bypass-approvals-and-sandbox",
    installCommand: undefined,
    typecheckCommand: undefined,
    testCommand: undefined,
    buildCommand: undefined,
    e2eCommand: undefined,
    requireHumanOnTestFail: false,
  });
});

test("loadEnv 在启用 Obsidian 时返回真实根目录", () => {
  const env = loadEnv({
    NODE_ENV: "test",
    WORKFLOW_EXECUTOR: "in_memory",
    OBSIDIAN_ENABLED: "true",
    OBSIDIAN_ROOT: "/tmp/agentforge-vault",
  });

  assert.deepEqual(env, {
    nodeEnv: "test",
    workflowExecutor: "in_memory",
    realExecutor: "simulated",
    strictMode: false,
    allowSimulation: true,
    requireRealExternals: false,
    controlPlaneApiKey: undefined,
    humanGateApiKey: undefined,
    projectAllowlist: [],
    githubToken: undefined,
    feishuAppId: undefined,
    feishuAppSecret: undefined,
    feishuVerificationToken: undefined,
    feishuEncryptKey: undefined,
    feishuWebhookUrl: undefined,
    mem0BaseUrl: undefined,
    mem0ApiKey: undefined,
    mem0UserId: undefined,
    obsidianEnabled: true,
    obsidianRoot: "/tmp/agentforge-vault",
    databaseUrl: ".agentforge/db.json",
    temporalAddress: "127.0.0.1:7233",
    temporalNamespace: "default",
    temporalTaskQueue: "agentforge-control-plane",
    executorTimeoutMs: 120000,
    targetProjectRoot: undefined,
    codexCliCommand: "codex exec --dangerously-bypass-approvals-and-sandbox",
    installCommand: undefined,
    typecheckCommand: undefined,
    testCommand: undefined,
    buildCommand: undefined,
    e2eCommand: undefined,
    requireHumanOnTestFail: false,
  });
});

test("loadEnv 支持自定义 DATABASE_URL", () => {
  const env = loadEnv({
    DATABASE_URL: "/tmp/agentforge-db.json",
    TEMPORAL_ADDRESS: "temporal.internal:7233",
    TEMPORAL_NAMESPACE: "agentforge",
    TEMPORAL_TASK_QUEUE: "control-plane",
    EXECUTOR_TIMEOUT_MS: "90000",
  });

  assert.equal(env.databaseUrl, "/tmp/agentforge-db.json");
  assert.equal(env.temporalAddress, "temporal.internal:7233");
  assert.equal(env.temporalNamespace, "agentforge");
  assert.equal(env.temporalTaskQueue, "control-plane");
  assert.equal(env.executorTimeoutMs, 90000);
});

test("loadEnv 在 REAL_EXECUTOR=codex 缺少 TARGET_PROJECT_ROOT 时抛错", () => {
  assert.throws(
    () =>
      loadEnv({
        REAL_EXECUTOR: "codex",
      }),
    (error: unknown) =>
      isAppError(error) &&
      error.code === "CONFIG_MISSING" &&
      error.details?.key === "TARGET_PROJECT_ROOT",
  );
});

test("loadEnv 在 STRICT_MODE=true 时要求 REAL_EXECUTOR=codex", () => {
  assert.throws(
    () =>
      loadEnv({
        STRICT_MODE: "true",
        WORKFLOW_EXECUTOR: "temporal",
        TARGET_PROJECT_ROOT: "/tmp/project",
      }),
    (error: unknown) =>
      isAppError(error) &&
      error.code === "CONFIG_INVALID" &&
      error.details?.key === "REAL_EXECUTOR",
  );
});

test("loadEnv 在 STRICT_MODE=true 时禁止 in_memory 工作流", () => {
  assert.throws(
    () =>
      loadEnv({
        STRICT_MODE: "true",
        REAL_EXECUTOR: "codex",
        TARGET_PROJECT_ROOT: "/tmp/project",
        WORKFLOW_EXECUTOR: "in_memory",
      }),
    (error: unknown) =>
      isAppError(error) &&
      error.code === "CONFIG_INVALID" &&
      error.details?.key === "WORKFLOW_EXECUTOR",
  );
});

test("loadEnv 在 STRICT_MODE=true 时禁止 ALLOW_SIMULATION=true", () => {
  assert.throws(
    () =>
      loadEnv({
        STRICT_MODE: "true",
        REAL_EXECUTOR: "codex",
        TARGET_PROJECT_ROOT: "/tmp/project",
        WORKFLOW_EXECUTOR: "temporal",
        ALLOW_SIMULATION: "true",
      }),
    (error: unknown) =>
      isAppError(error) &&
      error.code === "CONFIG_INVALID" &&
      error.details?.key === "ALLOW_SIMULATION",
  );
});

test("loadEnv 在严格模式合法输入下返回严格配置", () => {
  const env = loadEnv({
    STRICT_MODE: "true",
    REAL_EXECUTOR: "codex",
    TARGET_PROJECT_ROOT: "/tmp/project",
    WORKFLOW_EXECUTOR: "temporal",
  });

  assert.equal(env.strictMode, true);
  assert.equal(env.allowSimulation, false);
  assert.equal(env.requireRealExternals, true);
  assert.equal(env.realExecutor, "codex");
  assert.equal(env.workflowExecutor, "temporal");
});

test("loadEnv 支持 Feishu webhook 与 mem0 配置", () => {
  const env = loadEnv({
    FEISHU_WEBHOOK_URL: "https://open.feishu.cn/webhook/1",
    MEM0_BASE_URL: "https://mem0.internal",
    MEM0_API_KEY: "mem0-token",
    MEM0_USER_ID: "agentforge",
  });

  assert.equal(env.feishuWebhookUrl, "https://open.feishu.cn/webhook/1");
  assert.equal(env.mem0BaseUrl, "https://mem0.internal");
  assert.equal(env.mem0ApiKey, "mem0-token");
  assert.equal(env.mem0UserId, "agentforge");
});

test("assertRealExecutionReadiness 在缺少真实外部依赖时抛出缺失列表", () => {
  const env = loadEnv({
    WORKFLOW_EXECUTOR: "temporal",
    REAL_EXECUTOR: "codex",
    TARGET_PROJECT_ROOT: "/tmp/project",
    REQUIRE_REAL_EXTERNALS: "true",
  });

  assert.throws(
    () => assertRealExecutionReadiness(env),
    (error: unknown) =>
      isAppError(error) &&
      error.code === "CONFIG_MISSING" &&
      Array.isArray(error.details?.missingKeys) &&
      error.details?.missingKeys.includes("GITHUB_TOKEN") &&
      error.details?.missingKeys.includes("MEM0_BASE_URL") &&
      error.details?.missingKeys.includes("FEISHU_WEBHOOK_URL") &&
      error.details?.missingKeys.includes("OBSIDIAN_ENABLED"),
  );
});

test("AppError 保留错误码与 details", () => {
  const error = new AppError({
    code: "TASK_CONFLICT",
    message: "任务写集合冲突",
    details: { taskId: "task-1" },
  });

  assert.equal(error.code, "TASK_CONFLICT");
  assert.deepEqual(error.details, { taskId: "task-1" });
});
