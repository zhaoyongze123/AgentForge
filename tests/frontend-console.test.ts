import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createHttpApp } from "../src/api/http-server.js";
import type { AppEnv } from "../src/core/config/env.js";

function createEnv(databaseUrl: string): AppEnv {
  return {
    nodeEnv: "test",
    workflowExecutor: "in_memory",
    strictMode: false,
    allowSimulation: true,
    requireRealExternals: false,
    controlPlaneApiKey: undefined,
    humanGateApiKey: undefined,
    projectAllowlist: [],
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

test("控制台页面与脚本可访问并包含关键区域", async () => {
  const root = await mkdtemp(join(tmpdir(), "agentforge-console-"));
  const server = createHttpApp(createEnv(join(root, "db.json")));
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("无法获取测试服务端口");
  }
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    const html = await (await fetch(`${baseUrl}/console`)).text();
    const js = await (await fetch(`${baseUrl}/console/app.js`)).text();

    assert.equal(html.includes("AgentForge Control Console"), true);
    assert.equal(html.includes("创建计划"), true);
    assert.equal(html.includes("计划与任务图"), true);
    assert.equal(html.includes("人工 Gate 操作面板"), true);
    assert.equal(js.includes("/api/plans"), true);
    assert.equal(js.includes("/api/plans/' + encodeURIComponent(planId) + '/runs"), true);
    assert.equal(js.includes("submitCreatePlan"), true);
    assert.equal(js.includes("/api/human-gates/actions"), true);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

test("控制台数据接口支持任务详情、知识列表与人工 gate 动作", async () => {
  const root = await mkdtemp(join(tmpdir(), "agentforge-console-"));
  const server = createHttpApp(createEnv(join(root, "db.json")));
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
        phase: "phase-console",
      }),
    });
    const created = (await createResponse.json()) as {
      planId: string;
      tasks: Array<{ taskId: string }>;
    };

    await fetch(`${baseUrl}/api/plans/${created.planId}/runs`, {
      method: "POST",
    });

    const taskId = created.tasks[0]?.taskId ?? "";
    await fetch(`${baseUrl}/api/test/tasks/${encodeURIComponent(taskId)}/status`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ planId: created.planId, status: "WAITING_HUMAN" }),
    });

    const plansResponse = await fetch(`${baseUrl}/api/plans`);
    const plans = (await plansResponse.json()) as {
      plans: Array<{ planId: string; tasks: Array<{ taskId: string }> }>;
    };
    assert.equal(plans.plans.length >= 1, true);

    const taskDetailResponse = await fetch(
      `${baseUrl}/api/tasks/${encodeURIComponent(taskId)}?planId=${encodeURIComponent(created.planId)}`,
    );
    const detail = (await taskDetailResponse.json()) as {
      task: { taskId: string; status: string };
      acceptanceRuns: unknown[];
    };
    assert.equal(detail.task.taskId, taskId);
    assert.equal(detail.acceptanceRuns.length >= 1, true);

    const knowledgeResponse = await fetch(`${baseUrl}/api/knowledge`);
    const knowledge = (await knowledgeResponse.json()) as {
      records: Array<{ knowledgeId: string }>;
    };
    assert.equal(knowledge.records.length >= 1, true);

    const gateActionResponse = await fetch(`${baseUrl}/api/human-gates/actions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "approve",
        actor: "console-operator",
        relatedId: taskId,
        taskId,
        planId: created.planId,
      }),
    });
    const gateAction = (await gateActionResponse.json()) as {
      taskUpdated: boolean;
      toStatus: string;
    };
    assert.equal(gateAction.taskUpdated, true);
    assert.equal(gateAction.toStatus, "READY");

    const humanGatesResponse = await fetch(
      `${baseUrl}/api/human-gates?relatedId=${encodeURIComponent(taskId)}`,
    );
    const humanGates = (await humanGatesResponse.json()) as {
      items: Array<{ relatedId: string }>;
    };
    assert.equal(
      humanGates.items.some((item) => item.relatedId === taskId),
      true,
    );
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

test("控制台依赖的创建计划与运行计划接口可连通", async () => {
  const root = await mkdtemp(join(tmpdir(), "agentforge-console-"));
  const server = createHttpApp(createEnv(join(root, "db.json")));
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
        phase: "phase-console-create",
        constraints: ["必须可回归"],
        targetModules: ["src/api", "src/workflow"],
      }),
    });
    const created = (await createResponse.json()) as {
      planId: string;
      taskCount: number;
    };
    assert.equal(Boolean(created.planId), true);
    assert.equal(created.taskCount >= 1, true);

    const runResponse = await fetch(`${baseUrl}/api/plans/${created.planId}/runs`, {
      method: "POST",
    });
    const run = (await runResponse.json()) as {
      planId: string;
      assignmentCount: number;
    };
    assert.equal(run.planId, created.planId);
    assert.equal(run.assignmentCount >= 1, true);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});
