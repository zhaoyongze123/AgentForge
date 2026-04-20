import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { mkdtemp } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { AppEnv } from "../src/core/config/env.js";
import { createHttpApp } from "../src/api/http-server.js";

test("HTTP 控制平面在 simulated 执行下会保留阻塞证据并拒绝发布知识", async () => {
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
    assert.equal(run.assignmentCount, 1);
    assert.equal(run.publishedKnowledgeCount, 0);

    const statusResponse = await fetch(
      `${baseUrl}/api/plans/${created.planId}/status`,
    );
    assert.equal(statusResponse.status, 200);
    const status = (await statusResponse.json()) as {
      runStatus: string;
      doneTaskCount: number;
    };
    assert.equal(status.runStatus, "completed");
    assert.equal(status.doneTaskCount, 0);

    const knowledgeResponse = await fetch(
      `${baseUrl}/api/knowledge/${encodeURIComponent("knowledge.auth.flow")}`,
    );
    assert.equal(knowledgeResponse.status, 200);
    const knowledge = (await knowledgeResponse.json()) as {
      records: unknown[];
    };
    assert.equal(knowledge.records.length, 0);

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

test("GitHub webhook 会聚合 PR checks、回写 acceptance 并推进任务状态", async () => {
  const githubServer = createServer((req, res) => {
    if (req.url === "/repos/tester/agentforge/pulls/12") {
      res.statusCode = 200;
      res.setHeader("content-type", "application/json");
      res.end(
        JSON.stringify({
          number: 12,
          title: "feat: webhook checks",
          state: "open",
          html_url: "https://github.com/tester/agentforge/pull/12",
          head: { ref: "task/plan-1/backend-user-register", sha: "sha-head" },
          base: { ref: "main" },
        }),
      );
      return;
    }

    if (req.url === "/repos/tester/agentforge/commits/sha-head/status") {
      res.statusCode = 200;
      res.setHeader("content-type", "application/json");
      res.end(
        JSON.stringify({
          statuses: [
            {
              context: "build",
              state: "success",
              target_url: "https://ci.example/build/1",
            },
          ],
        }),
      );
      return;
    }

    if (req.url === "/repos/tester/agentforge/commits/sha-head/check-runs") {
      res.statusCode = 200;
      res.setHeader("content-type", "application/json");
      res.end(
        JSON.stringify({
          check_runs: [
            {
              name: "unit",
              status: "completed",
              conclusion: "success",
              details_url: "https://ci.example/unit/1",
            },
          ],
        }),
      );
      return;
    }

    res.statusCode = 404;
    res.end();
  });
  await new Promise<void>((resolve) =>
    githubServer.listen(0, "127.0.0.1", resolve),
  );
  const githubAddress = githubServer.address();
  if (!githubAddress || typeof githubAddress === "string") {
    throw new Error("无法获取 GitHub 测试端口");
  }

  const root = await mkdtemp(join(tmpdir(), "agentforge-api-github-webhook-"));
  const env: AppEnv = {
    nodeEnv: "test",
    workflowExecutor: "in_memory",
    strictMode: false,
    allowSimulation: true,
    requireRealExternals: false,
    projectAllowlist: [],
    githubToken: "github-token",
    githubApiBaseUrl: `http://127.0.0.1:${githubAddress.port}`,
    githubWebhookSecret: "github-webhook-secret",
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
        phase: "phase-real-delivery",
      }),
    });
    assert.equal(createResponse.status, 201);
    const created = (await createResponse.json()) as { planId: string };

    const updateResponse = await fetch(
      `${baseUrl}/api/test/tasks/backend-user-register/status`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          planId: created.planId,
          status: "AWAITING_ACCEPTANCE",
        }),
      },
    );
    assert.equal(updateResponse.status, 200);

    const payload = JSON.stringify({
      action: "completed",
      repository: {
        owner: { login: "tester" },
        name: "agentforge",
      },
      check_run: {
        name: "ci",
        status: "completed",
        conclusion: "success",
        head_branch: `task/${created.planId}/backend-user-register`,
        details_url: "https://ci.example/run/1",
        pull_requests: [{ number: 12 }],
      },
    });
    const signature = `sha256=${createHmac(
      "sha256",
      env.githubWebhookSecret ?? "",
    )
      .update(payload)
      .digest("hex")}`;

    const webhookResponse = await fetch(`${baseUrl}/api/github/webhooks`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-github-event": "check_run",
        "x-github-delivery": "delivery-1",
        "x-hub-signature-256": signature,
      },
      body: payload,
    });
    assert.equal(webhookResponse.status, 200);
    const webhookResult = (await webhookResponse.json()) as {
      taskUpdated: boolean;
      taskId: string;
      acceptanceStatus: string;
      checkStatus: string;
    };
    assert.equal(webhookResult.taskUpdated, true);
    assert.equal(webhookResult.taskId, "backend-user-register");
    assert.equal(webhookResult.acceptanceStatus, "passed");
    assert.equal(webhookResult.checkStatus, "passed");

    const detailResponse = await fetch(
      `${baseUrl}/api/tasks/backend-user-register?planId=${created.planId}`,
    );
    assert.equal(detailResponse.status, 200);
    const detail = (await detailResponse.json()) as {
      task: { status: string };
      acceptanceRuns: Array<{ result: { status: string; evidence: string[] } }>;
      events: Array<{ eventType: string; payload: { aggregate?: { summary?: string } } }>;
    };
    assert.equal(detail.task.status, "DONE");
    assert.equal(detail.acceptanceRuns.at(-1)?.result.status, "passed");
    assert.equal(
      detail.acceptanceRuns.at(-1)?.result.evidence.some((item) =>
        item.includes("API GITHUB /tester/agentforge/pulls/12 => passed"),
      ),
      true,
    );
    assert.equal(
      detail.events.some((event) => event.eventType === "github.checks.received"),
      true,
    );
    assert.equal(
      detail.events.some((event) =>
        event.payload.aggregate?.summary?.includes("GitHub checks 全部通过"),
      ),
      true,
    );
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
    await new Promise<void>((resolve, reject) =>
      githubServer.close((error) => (error ? reject(error) : resolve())),
    );
  }
});
