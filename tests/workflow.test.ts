import test from "node:test";
import assert from "node:assert/strict";

import { WorkflowEngine } from "../src/workflow/engine.js";

test("工作流引擎在 simulated 执行下会 fail-closed 并停在验收门禁前", async () => {
  const engine = new WorkflowEngine({
    obsidianEnabled: false,
    obsidianRoot: undefined,
  });
  const result = await engine.run({
    request: "做一个用户系统",
    phase: "phase-2",
  });

  assert.equal(result.tasks.length, 7);
  assert.equal(result.assignments, 1);
  assert.equal(result.publishedKnowledge.length, 0);
  assert.equal(result.acceptanceResults.length, 1);
  assert.equal(result.acceptanceResults[0]?.taskId, "backend-user-register");
  assert.equal(result.acceptanceResults[0]?.result.status, "blocked");
  assert.equal(
    result.acceptanceResults[0]?.result.rootCause.includes("缺少真实验收证据"),
    true,
  );
  assert.equal(
    result.acceptanceResults[0]?.result.rootCause.includes("当前仅有 simulated 证据"),
    true,
  );
  assert.equal(
    result.tasks.filter((task) => task.status === "AWAITING_ACCEPTANCE").length,
    1,
  );
  assert.equal(
    result.tasks.filter((task) => task.status === "PLANNED").length,
    6,
  );
});

test("WorkflowEngine 在禁用 simulation 且未启用 real codex 时拒绝初始化", () => {
  assert.throws(
    () =>
      new WorkflowEngine({
        obsidianEnabled: false,
        obsidianRoot: undefined,
        allowSimulation: false,
      }),
    /ALLOW_SIMULATION=false/u,
  );
});
