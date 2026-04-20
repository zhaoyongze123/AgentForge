import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { AppEnv } from "../src/core/config/env.js";
import { createHttpApp } from "../src/api/http-server.js";

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

test("黄金路径：从高层任务到知识发布的控制平面全链路通过", async () => {
  const root = await mkdtemp(join(tmpdir(), "agentforge-golden-"));
  const server = createHttpApp(createEnv(join(root, "db.json")));
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("无法获取测试服务端口");
  }

  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    const createdResponse = await fetch(`${baseUrl}/api/plans`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        request: "做一个用户系统",
        phase: "phase-golden",
      }),
    });
    const created = (await createdResponse.json()) as {
      planId: string;
      tasks: Array<{ taskId: string }>;
    };
    assert.equal(created.tasks.length, 7);

    const runResponse = await fetch(`${baseUrl}/api/plans/${created.planId}/runs`, {
      method: "POST",
    });
    const run = (await runResponse.json()) as {
      assignmentCount: number;
      publishedKnowledgeCount: number;
    };
    assert.equal(run.assignmentCount, 7);
    assert.equal(run.publishedKnowledgeCount >= 5, true);

    const statusResponse = await fetch(`${baseUrl}/api/plans/${created.planId}/status`);
    const status = (await statusResponse.json()) as {
      runStatus: string;
      doneTaskCount: number;
      taskCount: number;
    };
    assert.equal(status.runStatus, "completed");
    assert.equal(status.doneTaskCount, status.taskCount);

    const knowledgeResponse = await fetch(`${baseUrl}/api/knowledge`);
    const knowledge = (await knowledgeResponse.json()) as {
      records: Array<{ knowledgeId: string; status: string }>;
    };
    assert.equal(knowledge.records.length >= 5, true);
    assert.equal(
      knowledge.records.some((record) => record.knowledgeId === "knowledge.auth.flow"),
      true,
    );

    const metricsResponse = await fetch(`${baseUrl}/api/metrics/snapshot`);
    const metrics = (await metricsResponse.json()) as {
      businessMetrics: { completedTasks: number; acceptancePassRate: number };
    };
    assert.equal(metrics.businessMetrics.completedTasks, 7);
    assert.equal(metrics.businessMetrics.acceptancePassRate > 0.99, true);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});
