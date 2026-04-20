import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import type { AppEnv } from "../src/core/config/env.js";
import { createHttpApp } from "../src/api/http-server.js";

function createEnv(databaseUrl: string): AppEnv {
  return {
    nodeEnv: "test",
    workflowExecutor: "in_memory",
    strictMode: false,
    allowSimulation: true,
    requireRealExternals: false,
    projectAllowlist: [],
    githubToken: undefined,
    feishuAppId: "cli_test",
    feishuAppSecret: "secret",
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

test("metrics、audit 和 alerts 接口可返回结构化观测结果", async () => {
  const root = await mkdtemp(join(tmpdir(), "agentforge-observability-"));
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
        phase: "phase-metrics",
      }),
    });
    const created = (await createResponse.json()) as {
      planId: string;
      tasks: Array<{ taskId: string }>;
    };

    await fetch(`${baseUrl}/api/plans/${created.planId}/runs`, {
      method: "POST",
    });

    const blockedTaskId = created.tasks[0]?.taskId;
    assert.equal(typeof blockedTaskId, "string");
    await fetch(`${baseUrl}/api/test/tasks/${encodeURIComponent(blockedTaskId ?? "")}/status`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        planId: created.planId,
        status: "FAILED_BLOCKED",
      }),
    });

    const metricsResponse = await fetch(`${baseUrl}/metrics`);
    const metricsText = await metricsResponse.text();
    assert.equal(metricsResponse.status, 200);
    assert.equal(metricsText.includes("agentforge_tasks_total"), true);
    assert.equal(metricsText.includes("agentforge_acceptance_pass_rate"), true);
    assert.equal(metricsText.includes("agentforge_executor_estimated_cost_usd_total"), true);

    const auditResponse = await fetch(
      `${baseUrl}/api/audit?entityType=plan&entityId=${encodeURIComponent(created.planId)}`,
    );
    const audit = (await auditResponse.json()) as {
      events: Array<{ entityId: string }>;
      acceptanceRuns: Array<{ taskId: string }>;
    };
    assert.equal(audit.events.length >= 2, true);
    assert.equal(audit.events.every((event) => event.entityId === created.planId), true);

    const alertResponse = await fetch(`${baseUrl}/api/alerts`);
    const alerts = (await alertResponse.json()) as {
      alerts: Array<{ code: string }>;
    };
    assert.equal(
      alerts.alerts.some((alert) => alert.code === "blocked_task_spike"),
      false,
    );
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

test("alerts 会在 blocked 与 unmatched 飞书事件出现时触发", async () => {
  const root = await mkdtemp(join(tmpdir(), "agentforge-observability-"));
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
        request: "通用文档任务",
        phase: "phase-alerts",
      }),
    });
    const created = (await createResponse.json()) as {
      planId: string;
      tasks: Array<{ taskId: string }>;
    };
    const taskId = created.tasks[0]?.taskId ?? "";

    await fetch(`${baseUrl}/api/test/tasks/${encodeURIComponent(taskId)}/status`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ planId: created.planId, status: "FAILED_BLOCKED" }),
    });

    const secondCreateResponse = await fetch(`${baseUrl}/api/plans`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        request: "通用文档任务",
        phase: "phase-alerts-2",
      }),
    });
    const secondCreated = (await secondCreateResponse.json()) as {
      planId: string;
      tasks: Array<{ taskId: string }>;
    };
    await fetch(`${baseUrl}/api/test/tasks/${encodeURIComponent(secondCreated.tasks[0]?.taskId ?? "")}/status`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ planId: secondCreated.planId, status: "FAILED_BLOCKED" }),
    });

    await fetch(`${baseUrl}/feishu/card-actions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        type: "card.action.trigger",
        token: "verify-token",
        operator: { open_id: "ou-test" },
        action: {
          value: {
            action: "approve",
            plan_id: "plan-missing",
            task_id: "task-missing",
            related_id: "task-missing",
          },
        },
      }),
    });

    const alertResponse = await fetch(`${baseUrl}/api/alerts`);
    const alerts = (await alertResponse.json()) as {
      alerts: Array<{ code: string }>;
    };
    assert.equal(
      alerts.alerts.some((alert) => alert.code === "blocked_task_spike"),
      true,
    );
    assert.equal(
      alerts.alerts.some((alert) => alert.code === "feishu_action_unmatched"),
      true,
    );
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});
