import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { AppEnv } from "../src/core/config/env.js";
import { createHttpApp } from "../src/api/http-server.js";

test("HTTP 控制平面支持计划创建、任务图查询、运行状态、知识查询与人工 gate", async () => {
  const root = await mkdtemp(join(tmpdir(), "agentforge-api-"));
  const env: AppEnv = {
    nodeEnv: "test",
    workflowExecutor: "in_memory",
    strictMode: false,
    allowSimulation: true,
    requireRealExternals: false,
    projectAllowlist: [],
    githubToken: undefined,
    obsidianEnabled: false,
    obsidianRoot: undefined,
    databaseUrl: join(root, "db.json"),
    temporalAddress: "127.0.0.1:7233",
    temporalNamespace: "default",
    temporalTaskQueue: "agentforge-control-plane",
  };

  const server = createHttpApp(env);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("无法获取测试服务端口");
  }

  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    const createResponse = await fetch(`${baseUrl}/api/plans`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        request: "做一个用户系统",
        phase: "phase-2",
      }),
    });
    assert.equal(createResponse.status, 201);
    const created = (await createResponse.json()) as {
      planId: string;
      taskCount: number;
    };
    assert.equal(created.taskCount, 7);

    const graphResponse = await fetch(
      `${baseUrl}/api/plans/${created.planId}/tasks`,
    );
    assert.equal(graphResponse.status, 200);
    const graph = (await graphResponse.json()) as { tasks: unknown[] };
    assert.equal(graph.tasks.length, 7);

    const runResponse = await fetch(
      `${baseUrl}/api/plans/${created.planId}/runs`,
      {
        method: "POST",
      },
    );
    assert.equal(runResponse.status, 200);
    const run = (await runResponse.json()) as {
      assignmentCount: number;
      publishedKnowledgeCount: number;
    };
    assert.equal(run.assignmentCount, 7);
    assert.equal(run.publishedKnowledgeCount, 5);

    const statusResponse = await fetch(
      `${baseUrl}/api/plans/${created.planId}/status`,
    );
    assert.equal(statusResponse.status, 200);
    const status = (await statusResponse.json()) as {
      runStatus: string;
      doneTaskCount: number;
    };
    assert.equal(status.runStatus, "completed");
    assert.equal(status.doneTaskCount, 7);

    const knowledgeResponse = await fetch(
      `${baseUrl}/api/knowledge/${encodeURIComponent("knowledge.auth.flow")}`,
    );
    assert.equal(knowledgeResponse.status, 200);
    const knowledge = (await knowledgeResponse.json()) as {
      records: unknown[];
    };
    assert.equal(knowledge.records.length, 1);

    const gateResponse = await fetch(`${baseUrl}/api/human-gates`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        relatedId: created.planId,
        type: "decision",
        summary: "需要人工确认发布策略",
        actor: "tester",
      }),
    });
    assert.equal(gateResponse.status, 201);
    const gate = (await gateResponse.json()) as { interventionId: string };
    assert.equal(typeof gate.interventionId, "string");
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

test("HTTP 控制平面会在 requireRealExternals=true 且缺少配置时拒绝运行计划", async () => {
  const root = await mkdtemp(join(tmpdir(), "agentforge-api-preflight-"));
  const env: AppEnv = {
    nodeEnv: "test",
    workflowExecutor: "temporal",
    realExecutor: "codex",
    strictMode: false,
    allowSimulation: false,
    requireRealExternals: true,
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
    databaseUrl: join(root, "db.json"),
    temporalAddress: "127.0.0.1:7233",
    temporalNamespace: "default",
    temporalTaskQueue: "agentforge-control-plane",
    executorTimeoutMs: 120000,
    targetProjectRoot: root,
    codexCliCommand: undefined,
    installCommand: undefined,
    typecheckCommand: undefined,
    testCommand: undefined,
    buildCommand: undefined,
    e2eCommand: undefined,
    requireHumanOnTestFail: false,
  };

  const server = createHttpApp(env);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("无法获取测试服务端口");
  }

  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    const createResponse = await fetch(`${baseUrl}/api/plans`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        request: "做一个用户系统",
        phase: "phase-preflight",
      }),
    });
    assert.equal(createResponse.status, 201);
    const created = (await createResponse.json()) as { planId: string };

    const runResponse = await fetch(`${baseUrl}/api/plans/${created.planId}/runs`, {
      method: "POST",
    });
    assert.equal(runResponse.status, 400);
    const body = (await runResponse.json()) as {
      error: string;
      details?: { missingKeys?: string[] };
    };
    assert.equal(body.error, "CONFIG_MISSING");
    assert.equal(body.details?.missingKeys?.includes("GITHUB_TOKEN"), true);
    assert.equal(body.details?.missingKeys?.includes("FEISHU_WEBHOOK_URL"), true);
    assert.equal(body.details?.missingKeys?.includes("MEM0_BASE_URL"), true);
    assert.equal(body.details?.missingKeys?.includes("OBSIDIAN_ENABLED"), true);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});
