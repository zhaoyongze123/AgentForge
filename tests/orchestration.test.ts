import test from "node:test";
import assert from "node:assert/strict";

import { runLangGraphPlan } from "../src/orchestration/langgraph/graph.js";
import { TemporalControlPlaneClient } from "../src/orchestration/temporal/client.js";

test("LangGraph 编排图在 simulated 执行下会停在验收门禁前", async () => {
  const result = await runLangGraphPlan(
    {
      request: "做一个用户系统",
      phase: "phase-13",
    },
    {
      obsidianEnabled: false,
      obsidianRoot: undefined,
    },
    "langgraph-test-plan",
  );

  assert.equal(result.tasks.length, 7);
  assert.equal(result.assignmentRecords.length, 1);
  assert.equal(result.acceptanceResults.length, 1);
  assert.equal(result.acceptanceResults[0]?.result.status, "blocked");
  assert.equal(result.publishedKnowledge.length, 0);
  assert.equal(
    result.tasks.filter((task) => task.status === "AWAITING_ACCEPTANCE").length,
    1,
  );
});

test(
  "Temporal 真实集成测试仅在显式启用时运行",
  { skip: process.env.TEMPORAL_INTEGRATION !== "true" },
  async () => {
    const client = new TemporalControlPlaneClient({
      temporalAddress: process.env.TEMPORAL_ADDRESS ?? "127.0.0.1:7233",
      temporalNamespace: process.env.TEMPORAL_NAMESPACE ?? "default",
      temporalTaskQueue:
        process.env.TEMPORAL_TASK_QUEUE ?? "agentforge-control-plane",
      obsidianEnabled: false,
      obsidianRoot: undefined,
    });

    const result = await client.runPlan("temporal-test-plan", {
      request: "做一个用户系统",
      phase: "phase-13",
    });

    assert.equal(result.result.tasks.length, 7);
    assert.equal(result.result.assignmentRecords.length, 7);
  },
);
