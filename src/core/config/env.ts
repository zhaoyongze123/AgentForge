import { AppError } from "../errors/app-error.js";

export interface AppEnv {
  nodeEnv: "development" | "test" | "production";
  workflowExecutor: "in_memory" | "langgraph" | "temporal";
  realExecutor?: "simulated" | "codex";
  strictMode: boolean;
  allowSimulation: boolean;
  requireRealExternals: boolean;
  controlPlaneApiKey?: string;
  humanGateApiKey?: string;
  projectAllowlist: string[];
  githubToken?: string;
  githubApiBaseUrl?: string;
  githubWebhookSecret?: string;
  feishuAppId?: string;
  feishuAppSecret?: string;
  feishuVerificationToken?: string;
  feishuEncryptKey?: string;
  feishuWebhookUrl?: string;
  mem0BaseUrl?: string;
  mem0ApiKey?: string;
  mem0UserId?: string;
  obsidianEnabled: boolean;
  obsidianRoot?: string;
  databaseUrl: string;
  temporalAddress: string;
  temporalNamespace: string;
  temporalTaskQueue: string;
  executorTimeoutMs?: number;
  targetProjectRoot?: string;
  codexCliCommand?: string;
  installCommand?: string;
  typecheckCommand?: string;
  testCommand?: string;
  buildCommand?: string;
  e2eCommand?: string;
  requireHumanOnTestFail?: boolean;
}

export function loadEnv(source: NodeJS.ProcessEnv = process.env): AppEnv {
  const nodeEnv = parseNodeEnv(source.NODE_ENV);
  const workflowExecutor = parseWorkflowExecutor(source.WORKFLOW_EXECUTOR);
  const realExecutor = parseRealExecutor(source.REAL_EXECUTOR);
  const strictMode = parseBooleanEnv(source.STRICT_MODE, false);
  const allowSimulation = parseBooleanEnv(
    source.ALLOW_SIMULATION,
    !strictMode,
  );
  const requireRealExternals = parseBooleanEnv(
    source.REQUIRE_REAL_EXTERNALS,
    strictMode,
  );
  const obsidianEnabled = source.OBSIDIAN_ENABLED === "true";
  const obsidianRoot = source.OBSIDIAN_ROOT;
  const databaseUrl = source.DATABASE_URL ?? ".agentforge/db.json";
  const temporalAddress = source.TEMPORAL_ADDRESS ?? "127.0.0.1:7233";
  const temporalNamespace = source.TEMPORAL_NAMESPACE ?? "default";
  const temporalTaskQueue =
    source.TEMPORAL_TASK_QUEUE ?? "agentforge-control-plane";
  const executorTimeoutMs = parseExecutorTimeoutMs(source.EXECUTOR_TIMEOUT_MS);
  const targetProjectRoot = source.TARGET_PROJECT_ROOT;
  const codexCliCommand =
    source.CODEX_CLI_COMMAND ?? "codex exec --dangerously-bypass-approvals-and-sandbox";
  const requireHumanOnTestFail = source.REQUIRE_HUMAN_ON_TEST_FAIL === "true";

  if (strictMode && allowSimulation) {
    throw new AppError({
      code: "CONFIG_INVALID",
      message: "当 STRICT_MODE=true 时，ALLOW_SIMULATION 不能为 true。",
      details: { key: "ALLOW_SIMULATION", value: source.ALLOW_SIMULATION },
    });
  }

  if (strictMode && !requireRealExternals) {
    throw new AppError({
      code: "CONFIG_INVALID",
      message: "当 STRICT_MODE=true 时，REQUIRE_REAL_EXTERNALS 不能为 false。",
      details: {
        key: "REQUIRE_REAL_EXTERNALS",
        value: source.REQUIRE_REAL_EXTERNALS,
      },
    });
  }

  if (strictMode && realExecutor !== "codex") {
    throw new AppError({
      code: "CONFIG_INVALID",
      message: "当 STRICT_MODE=true 时，REAL_EXECUTOR 必须为 codex。",
      details: { key: "REAL_EXECUTOR", value: source.REAL_EXECUTOR },
    });
  }

  if (strictMode && workflowExecutor === "in_memory") {
    throw new AppError({
      code: "CONFIG_INVALID",
      message: "当 STRICT_MODE=true 时，WORKFLOW_EXECUTOR 不能为 in_memory。",
      details: { key: "WORKFLOW_EXECUTOR", value: source.WORKFLOW_EXECUTOR },
    });
  }

  if (obsidianEnabled && !obsidianRoot) {
    throw new AppError({
      code: "CONFIG_MISSING",
      message: "当 OBSIDIAN_ENABLED=true 时，必须提供 OBSIDIAN_ROOT。",
      details: { key: "OBSIDIAN_ROOT" },
    });
  }

  if (realExecutor === "codex" && !targetProjectRoot) {
    throw new AppError({
      code: "CONFIG_MISSING",
      message: "当 REAL_EXECUTOR=codex 时，必须提供 TARGET_PROJECT_ROOT。",
      details: { key: "TARGET_PROJECT_ROOT" },
    });
  }

  return {
    nodeEnv,
    workflowExecutor,
    realExecutor,
    strictMode,
    allowSimulation,
    requireRealExternals,
    controlPlaneApiKey: source.CONTROL_PLANE_API_KEY,
    humanGateApiKey: source.HUMAN_GATE_API_KEY,
    projectAllowlist: parseProjectAllowlist(source.PROJECT_ALLOWLIST),
    githubToken: source.GITHUB_TOKEN,
    githubApiBaseUrl: source.GITHUB_API_BASE_URL,
    githubWebhookSecret: source.GITHUB_WEBHOOK_SECRET,
    feishuAppId: source.FEISHU_APP_ID,
    feishuAppSecret: source.FEISHU_APP_SECRET,
    feishuVerificationToken: source.FEISHU_VERIFICATION_TOKEN,
    feishuEncryptKey: source.FEISHU_ENCRYPT_KEY,
    feishuWebhookUrl: source.FEISHU_WEBHOOK_URL,
    mem0BaseUrl: source.MEM0_BASE_URL,
    mem0ApiKey: source.MEM0_API_KEY,
    mem0UserId: source.MEM0_USER_ID,
    obsidianEnabled,
    obsidianRoot,
    databaseUrl,
    temporalAddress,
    temporalNamespace,
    temporalTaskQueue,
    executorTimeoutMs,
    targetProjectRoot,
    codexCliCommand,
    installCommand: source.INSTALL_CMD,
    typecheckCommand: source.TYPECHECK_CMD,
    testCommand: source.TEST_CMD,
    buildCommand: source.BUILD_CMD,
    e2eCommand: source.E2E_CMD,
    requireHumanOnTestFail,
  };
}

export function assertRealExecutionReadiness(env: AppEnv): void {
  if (!env.requireRealExternals) {
    return;
  }

  const missingKeys = collectMissingRealExternalConfig(env);
  if (missingKeys.length === 0) {
    return;
  }

  throw new AppError({
    code: "CONFIG_MISSING",
    message: "真实外部依赖 preflight 未通过，缺少必需配置。",
    details: { missingKeys },
  });
}

export function collectMissingRealExternalConfig(env: AppEnv): string[] {
  const missing = new Set<string>();

  if (env.realExecutor !== "codex") {
    missing.add("REAL_EXECUTOR");
  }
  if (!env.targetProjectRoot) {
    missing.add("TARGET_PROJECT_ROOT");
  }
  if (env.workflowExecutor !== "temporal") {
    missing.add("WORKFLOW_EXECUTOR");
  }
  if (!env.githubToken) {
    missing.add("GITHUB_TOKEN");
  }
  if (!env.feishuAppId) {
    missing.add("FEISHU_APP_ID");
  }
  if (!env.feishuAppSecret) {
    missing.add("FEISHU_APP_SECRET");
  }
  if (!env.feishuVerificationToken) {
    missing.add("FEISHU_VERIFICATION_TOKEN");
  }
  if (!env.feishuEncryptKey) {
    missing.add("FEISHU_ENCRYPT_KEY");
  }
  if (!env.feishuWebhookUrl) {
    missing.add("FEISHU_WEBHOOK_URL");
  }
  if (!env.mem0BaseUrl) {
    missing.add("MEM0_BASE_URL");
  }
  if (!env.mem0ApiKey) {
    missing.add("MEM0_API_KEY");
  }
  if (!env.mem0UserId) {
    missing.add("MEM0_USER_ID");
  }
  if (!env.obsidianEnabled) {
    missing.add("OBSIDIAN_ENABLED");
  }
  if (!env.obsidianRoot) {
    missing.add("OBSIDIAN_ROOT");
  }
  if (!env.temporalAddress) {
    missing.add("TEMPORAL_ADDRESS");
  }
  if (!env.temporalNamespace) {
    missing.add("TEMPORAL_NAMESPACE");
  }
  if (!env.temporalTaskQueue) {
    missing.add("TEMPORAL_TASK_QUEUE");
  }

  return [...missing];
}

function parseProjectAllowlist(value?: string): string[] {
  if (!value) {
    return [];
  }

  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseNodeEnv(value?: string): AppEnv["nodeEnv"] {
  if (!value) {
    return "development";
  }

  if (value === "development" || value === "test" || value === "production") {
    return value;
  }

  throw new AppError({
    code: "CONFIG_INVALID",
    message: "NODE_ENV 只能是 development、test 或 production。",
    details: { key: "NODE_ENV", value },
  });
}

function parseWorkflowExecutor(value?: string): AppEnv["workflowExecutor"] {
  if (!value) {
    return "in_memory";
  }

  if (value === "in_memory" || value === "langgraph" || value === "temporal") {
    return value;
  }

  throw new AppError({
    code: "CONFIG_INVALID",
    message: "WORKFLOW_EXECUTOR 只能是 in_memory、langgraph 或 temporal。",
    details: { key: "WORKFLOW_EXECUTOR", value },
  });
}

function parseRealExecutor(value?: string): AppEnv["realExecutor"] {
  if (!value) {
    return "simulated";
  }

  if (value === "simulated" || value === "codex") {
    return value;
  }

  throw new AppError({
    code: "CONFIG_INVALID",
    message: "REAL_EXECUTOR 只能是 simulated 或 codex。",
    details: { key: "REAL_EXECUTOR", value },
  });
}

function parseExecutorTimeoutMs(value?: string): number {
  if (!value) {
    return 120_000;
  }

  const parsed = Number(value);
  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed;
  }

  throw new AppError({
    code: "CONFIG_INVALID",
    message: "EXECUTOR_TIMEOUT_MS 必须是大于 0 的数字。",
    details: { key: "EXECUTOR_TIMEOUT_MS", value },
  });
}

function parseBooleanEnv(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined) {
    return defaultValue;
  }

  if (value === "true") {
    return true;
  }

  if (value === "false") {
    return false;
  }

  throw new AppError({
    code: "CONFIG_INVALID",
    message: "布尔环境变量只能是 true 或 false。",
    details: { value },
  });
}
