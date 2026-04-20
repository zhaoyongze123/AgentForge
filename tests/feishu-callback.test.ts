import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createHttpApp } from "../src/api/http-server.js";
import type { AppEnv } from "../src/core/config/env.js";

function createEnv(databaseUrl = ".agentforge/test-db.json"): AppEnv {
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

test("飞书 url_verification 返回 challenge", async () => {
  const server = createHttpApp(createEnv());
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("无法获取测试服务端口");
  }

  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/feishu/events`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        type: "url_verification",
        token: "verify-token",
        challenge: "challenge-value",
      }),
    });

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { challenge: "challenge-value" });
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

test("飞书卡片动作会记录人工介入并推进 WAITING_HUMAN 任务到 READY", async () => {
  const root = await mkdtemp(join(tmpdir(), "agentforge-feishu-"));
  const env = createEnv(join(root, "db.json"));
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
        phase: "phase-feishu",
      }),
    });
    const created = (await createResponse.json()) as {
      planId: string;
      tasks: Array<{ taskId: string }>;
    };
    const taskId = created.tasks[0]?.taskId;
    assert.equal(typeof taskId, "string");

    const waitingResponse = await fetch(`${baseUrl}/api/test/tasks/${taskId}/status`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: "WAITING_HUMAN" }),
    });
    assert.equal(waitingResponse.status, 200);

    const actionResponse = await fetch(`${baseUrl}/feishu/card-actions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        type: "card.action.trigger",
        token: "verify-token",
        operator: { open_id: "ou-test" },
        action: {
          value: {
            action: "approve",
            plan_id: created.planId,
            task_id: taskId,
            related_id: taskId,
          },
        },
      }),
    });

    assert.equal(actionResponse.status, 200);
    const actionBody = (await actionResponse.json()) as {
      toast: { content: string };
      data: { taskUpdated: boolean; fromStatus: string; toStatus: string };
    };
    assert.equal(actionBody.toast.content, "AgentForge 已收到卡片动作");
    assert.equal(actionBody.data.taskUpdated, true);
    assert.equal(actionBody.data.fromStatus, "WAITING_HUMAN");
    assert.equal(actionBody.data.toStatus, "READY");

    const graphResponse = await fetch(`${baseUrl}/api/plans/${created.planId}/tasks`);
    const graph = (await graphResponse.json()) as {
      tasks: Array<{ taskId: string; status: string }>;
    };
    assert.equal(
      graph.tasks.find((task) => task.taskId === taskId)?.status,
      "READY",
    );
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

test("同名 taskId 跨 plan 时，飞书卡片可用 plan_id + task_id 精确命中", async () => {
  const root = await mkdtemp(join(tmpdir(), "agentforge-feishu-"));
  const env = createEnv(join(root, "db.json"));
  const server = createHttpApp(env);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("无法获取测试服务端口");
  }
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    const createPlan = async () => {
      const response = await fetch(`${baseUrl}/api/plans`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          request: "通用文档任务",
          phase: "phase-feishu",
        }),
      });
      return (await response.json()) as {
        planId: string;
        tasks: Array<{ taskId: string }>;
      };
    };

    const first = await createPlan();
    const second = await createPlan();
    const taskId = "docs-generic-task-breakdown";

    await fetch(`${baseUrl}/api/test/tasks/${taskId}/status`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        planId: first.planId,
        status: "WAITING_HUMAN",
      }),
    });

    await fetch(`${baseUrl}/api/test/tasks/${taskId}/status`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        planId: second.planId,
        status: "WAITING_HUMAN",
      }),
    });

    const actionResponse = await fetch(`${baseUrl}/feishu/card-actions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        type: "card.action.trigger",
        token: "verify-token",
        operator: { open_id: "ou-test" },
        action: {
          value: {
            action: "approve",
            plan_id: second.planId,
            task_id: taskId,
            related_id: taskId,
          },
        },
      }),
    });

    assert.equal(actionResponse.status, 200);
    const actionBody = (await actionResponse.json()) as {
      data: { taskUpdated: boolean; taskId: string; toStatus: string };
    };
    assert.equal(actionBody.data.taskUpdated, true);
    assert.equal(actionBody.data.taskId, taskId);
    assert.equal(actionBody.data.toStatus, "READY");

    const secondGraphResponse = await fetch(
      `${baseUrl}/api/plans/${second.planId}/tasks`,
    );
    const secondGraph = (await secondGraphResponse.json()) as {
      tasks: Array<{ taskId: string; status: string }>;
    };
    assert.equal(
      secondGraph.tasks.find((task) => task.taskId === taskId)?.status,
      "READY",
    );

    const firstGraphResponse = await fetch(
      `${baseUrl}/api/plans/${first.planId}/tasks`,
    );
    const firstGraph = (await firstGraphResponse.json()) as {
      tasks: Array<{ taskId: string; status: string }>;
    };
    assert.equal(
      firstGraph.tasks.find((task) => task.taskId === taskId)?.status,
      "WAITING_HUMAN",
    );
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

test("飞书 token 错误返回结构化错误", async () => {
  const server = createHttpApp(createEnv());
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("无法获取测试服务端口");
  }

  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/feishu/events`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        type: "url_verification",
        token: "wrong-token",
        challenge: "challenge-value",
      }),
    });

    assert.equal(response.status, 404);
    const body = (await response.json()) as { error: string };
    assert.equal(body.error, "AUTH_INVALID");
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});
