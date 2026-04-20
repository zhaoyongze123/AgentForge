import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";

import { AppError } from "../src/core/errors/app-error.js";
import type {
  AcceptanceResult,
} from "../src/domain/acceptance.js";
import type {
  BudgetDecision,
  KnowledgeCandidate,
  KnowledgeRecord,
} from "../src/domain/knowledge.js";
import type { TaskUnit } from "../src/domain/task-unit.js";
import { Mem0HttpAdapter } from "../src/integrations/mem0-http-adapter.js";
import { InMemoryStore } from "../src/runtime/in-memory-store.js";
import { KnowledgeWorkflow } from "../src/services/knowledge-workflow.js";
import { ObsidianKnowledgeService } from "../src/services/obsidian-knowledge.js";

function createTask(
  overrides: Partial<TaskUnit> = {},
): TaskUnit {
  return {
    taskId: overrides.taskId ?? "task-knowledge-auth-flow",
    title: overrides.title ?? "认证链路稳定经验",
    goal: overrides.goal ?? "固化认证主路径",
    type: overrides.type ?? "knowledge_capture",
    phase: overrides.phase ?? "knowledge",
    priority: overrides.priority ?? "high",
    dependencies: overrides.dependencies ?? [],
    readSet: overrides.readSet ?? ["src/**"],
    writeSet: overrides.writeSet ?? ["wiki/**"],
    inputs: overrides.inputs ?? ["acceptance:passed"],
    deliverables: overrides.deliverables ?? ["knowledge-candidate"],
    acceptanceCriteria: overrides.acceptanceCriteria ?? ["candidate persisted"],
    testCommands: overrides.testCommands ?? [],
    handoffTo: overrides.handoffTo ?? "knowledge-agent",
    blockedConditions: overrides.blockedConditions ?? [],
    autoFixPolicy: overrides.autoFixPolicy ?? [],
    humanGate: overrides.humanGate ?? { required: false },
    status: overrides.status ?? "DONE",
  };
}

function createAcceptance(
  overrides: Partial<AcceptanceResult> = {},
): AcceptanceResult {
  return {
    status: overrides.status ?? "passed",
    summary: overrides.summary ?? "验收通过",
    acceptanceChecks: overrides.acceptanceChecks ?? ["passed"],
    evidence: overrides.evidence ?? ["evidence"],
    rootCause: overrides.rootCause ?? "",
    autoFixable: overrides.autoFixable ?? false,
    requiresHuman: overrides.requiresHuman ?? false,
    nextAction: overrides.nextAction ?? "capture",
    knowledgeSignal: overrides.knowledgeSignal ?? {
      reusableScore: 0.92,
      noveltyScore: 0.71,
      confidence: 0.95,
      stabilityScore: 0.9,
      impactScore: 0.82,
      candidateType: "pattern",
      recommendedAction: "capture",
    },
    knowledgeDraft: overrides.knowledgeDraft,
  };
}

function createCandidate(
  overrides: Partial<KnowledgeCandidate> = {},
): KnowledgeCandidate {
  return {
    candidateId: overrides.candidateId ?? "kc-1",
    knowledgeId: overrides.knowledgeId ?? "knowledge.auth.flow",
    scope: overrides.scope ?? "knowledge/auth",
    summary: overrides.summary ?? "认证链路稳定经验",
    recommendation: overrides.recommendation ?? "优先使用 refresh token",
    sourceRefs: overrides.sourceRefs ?? ["task:knowledge-auth-flow"],
    candidateType: overrides.candidateType ?? "pattern",
    normalizedKey: overrides.normalizedKey,
    createdAt: overrides.createdAt ?? "2026-04-16T12:00:00.000Z",
    mem0Key: overrides.mem0Key,
    scores: overrides.scores ?? {
      reusableScore: 0.88,
      noveltyScore: 0.66,
      confidence: 0.94,
      stabilityScore: 0.89,
      impactScore: 0.8,
      publishScore: 0.83,
    },
  };
}

function createRecord(
  overrides: Partial<KnowledgeRecord> = {},
): KnowledgeRecord {
  return {
    knowledgeId: overrides.knowledgeId ?? "knowledge.auth.flow",
    version: overrides.version ?? 1,
    scope: overrides.scope ?? "knowledge/auth",
    status: overrides.status ?? "active",
    title: overrides.title ?? "认证链路稳定经验",
    summary: overrides.summary ?? "认证链路稳定经验",
    recommendation: overrides.recommendation ?? "优先使用 refresh token",
    constraints: overrides.constraints ?? [],
    confidence: overrides.confidence ?? 0.94,
    candidateType: overrides.candidateType ?? "pattern",
    sourceRefs: overrides.sourceRefs ?? ["task:knowledge-auth-flow"],
    derivedFrom: overrides.derivedFrom ?? [],
    supersedes: overrides.supersedes ?? [],
    updatedAt: overrides.updatedAt ?? "2026-04-16T12:00:00.000Z",
    supersededBy: overrides.supersededBy,
    notePath: overrides.notePath,
  };
}

test("KnowledgeWorkflow 会把 candidate 写入真实 mem0 HTTP 主路径", async () => {
  const server = await startMem0Server();

  try {
    const store = new InMemoryStore();
    const workflow = new KnowledgeWorkflow(store, null, {
      mem0: new Mem0HttpAdapter({
        baseUrl: server.baseUrl,
        apiKey: "mem0-token",
      }),
      mem0Config: {
        mem0UserId: "agentforge-test",
      },
    });

    const candidate = workflow.createCandidate(createTask(), createAcceptance());
    const requests = await server.readRequests();
    const metadata = (requests[0]?.metadata ?? {}) as {
      kind?: string;
      knowledgeId?: string;
    };

    assert.ok(candidate);
    assert.equal(store.candidateQueue.length, 1);
    assert.equal(store.mem0Entries.size, 0);
    assert.equal(requests.length, 1);
    assert.equal(requests[0]?.userId, "agentforge-test");
    assert.equal(metadata.kind, "candidate");
    assert.equal(metadata.knowledgeId, "knowledge.auth.flow");
  } finally {
    await server.close();
  }
});

test("KnowledgeWorkflow 会把 deferred 记录写入真实 mem0 HTTP 主路径", async () => {
  const server = await startMem0Server();

  try {
    const store = new InMemoryStore();
    const workflow = new KnowledgeWorkflow(store, null, {
      mem0: new Mem0HttpAdapter({
        baseUrl: server.baseUrl,
        apiKey: "mem0-token",
      }),
      mem0Config: {
        mem0UserId: "agentforge-test",
      },
    });

    const candidate = createCandidate();
    const decision: BudgetDecision = {
      allowed: false,
      reason: "deferred",
      queuePosition: 3,
      publishScore: candidate.scores.publishScore,
      activeWindow: {
        windowStart: "2026-04-16T10:00:00.000Z",
        windowEnd: "2026-04-16T11:00:00.000Z",
        publishedCount: 5,
        publishedByScope: {},
      },
    };

    workflow.handleBudgetRejection(candidate, decision);
    const requests = await server.readRequests();
    const metadata = (requests[0]?.metadata ?? {}) as {
      kind?: string;
      budgetDecision?: {
        reason?: string;
      };
    };

    assert.equal(store.deferredCandidates.length, 1);
    assert.equal(store.mem0Entries.size, 0);
    assert.equal(requests.length, 1);
    assert.equal(metadata.kind, "deferred");
    assert.equal(metadata.budgetDecision?.reason, "deferred");
  } finally {
    await server.close();
  }
});

test("mem0 配置缺失时 KnowledgeWorkflow fail-closed / blocked", () => {
  const store = new InMemoryStore();
  const workflow = new KnowledgeWorkflow(store, null, {
    envSource: {},
  });

  assert.throws(
    () => workflow.createCandidate(createTask(), createAcceptance()),
    (error: unknown) =>
      error instanceof AppError &&
      error.code === "CONFIG_MISSING" &&
      error.message.includes("blocked"),
  );
  assert.equal(store.candidateQueue.length, 0);
});

test("ObsidianKnowledgeService 能把长期知识写成 Markdown", async () => {
  const root = await mkdtemp(join(tmpdir(), "agentforge-obsidian-"));
  const service = new ObsidianKnowledgeService(root);
  const record = createRecord();

  const notePath = await service.writeRecord(record);
  const content = await readFile(notePath, "utf8");

  assert.equal(notePath.includes("knowledge/patterns/knowledge/auth"), true);
  assert.equal(content.includes("knowledge_id: knowledge.auth.flow"), true);
  assert.equal(content.includes("## 推荐规则"), true);
});

test("ObsidianKnowledgeService 会按 candidateType 映射到固定目录", () => {
  const service = new ObsidianKnowledgeService("/tmp/agentforge-vault");

  assert.equal(
    service.mapRecord(createRecord({ candidateType: "pattern" })).relativePath,
    "knowledge/patterns/knowledge/auth/knowledge.auth.flow.md",
  );
  assert.equal(
    service.mapRecord(createRecord({ candidateType: "incident" })).relativePath,
    "knowledge/incidents/knowledge/auth/knowledge.auth.flow.md",
  );
  assert.equal(
    service.mapRecord(createRecord({ candidateType: "sop" })).relativePath,
    "knowledge/sop/knowledge/auth/knowledge.auth.flow.md",
  );
  assert.equal(
    service.mapRecord(createRecord({ candidateType: "adr" })).relativePath,
    "knowledge/adr/knowledge/auth/knowledge.auth.flow.md",
  );
});

async function startMem0Server(): Promise<{
  baseUrl: string;
  readRequests: () => Promise<Array<Mem0HttpRequest>>;
  close: () => Promise<void>;
}> {
  const root = await mkdtemp(join(tmpdir(), "agentforge-mem0-server-"));
  const requestsPath = join(root, "requests.jsonl");
  const portFile = join(root, "port.txt");
  const serverScriptPath = join(root, "mem0-server.mjs");

  await writeFile(
    serverScriptPath,
    `
import { createServer } from "node:http";
import { appendFile, writeFile } from "node:fs/promises";

const [requestsPath, portFile] = process.argv.slice(2);

const server = createServer(async (req, res) => {
  let body = "";
  req.on("data", (chunk) => {
    body += String(chunk);
  });

  req.on("end", async () => {
    if (req.method === "POST" && req.url === "/memories") {
      await appendFile(requestsPath, body + "\\n", "utf8");
      res.statusCode = 200;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ id: "mem0-memory-1" }));
      return;
    }

    res.statusCode = 404;
    res.end("not found");
  });
});

server.listen(0, "127.0.0.1", async () => {
  const address = server.address();
  if (!address || typeof address === "string") {
    process.exit(1);
  }
  await writeFile(portFile, String(address.port), "utf8");
});
`,
    "utf8",
  );

  const child = spawn(process.execPath, [serverScriptPath, requestsPath, portFile], {
    stdio: ["ignore", "pipe", "pipe"],
  });

  const port = await waitForPortFile(portFile);

  return {
    baseUrl: `http://127.0.0.1:${port}`,
    readRequests: async () => {
      try {
        const content = await readFile(requestsPath, "utf8");
        return content
          .split("\n")
          .filter(Boolean)
          .map((line) => JSON.parse(line) as Mem0HttpRequest);
      } catch {
        return [];
      }
    },
    close: async () => {
      child.kill("SIGTERM");
      await new Promise<void>((resolve, reject) => {
        child.once("exit", () => resolve());
        child.once("error", reject);
      });
    },
  };
}

interface Mem0HttpRequest {
  userId?: string;
  metadata?: {
    kind?: string;
    knowledgeId?: string;
    budgetDecision?: {
      reason?: string;
    };
  };
}

async function waitForPortFile(path: string, timeoutMs = 5000): Promise<number> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const content = (await readFile(path, "utf8")).trim();
      const port = Number(content);
      if (Number.isInteger(port) && port > 0) {
        return port;
      }
    } catch {
    }

    await new Promise((resolve) => setTimeout(resolve, 20));
  }

  throw new Error(`等待文件超时: ${path}`);
}
