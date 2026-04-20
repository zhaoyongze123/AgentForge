import test from "node:test";
import assert from "node:assert/strict";

import { WorkflowEngine } from "../src/workflow/engine.js";

test("工作流引擎会把通过验收的高分候选发布为长期知识", async () => {
  const engine = new WorkflowEngine({
    obsidianEnabled: false,
    obsidianRoot: undefined,
  });
  const result = await engine.run({
    request: "做一个用户系统",
    phase: "phase-2",
  });

  assert.equal(result.tasks.length, 7);
  assert.equal(
    result.tasks.filter((task) => task.status === "DONE").length,
    result.tasks.length,
  );
  assert.equal(result.assignments, result.tasks.length);
  assert.equal(result.publishedKnowledge.length, 5);
  assert.equal(
    result.publishedKnowledge.every((record) => record.notePath === undefined),
    true,
  );
  assert.deepEqual(
    result.publishedKnowledge
      .map((record) => record.knowledgeId)
      .sort((left, right) => left.localeCompare(right)),
    [
      "backend.user.register",
      "backend.user.login",
      "backend.user.jwt",
      "frontend.auth.pages",
      "knowledge.auth.flow",
    ].sort((left, right) => left.localeCompare(right)),
  );
  assert.equal(
    result.publishedKnowledge.every((record) => record.summary.includes("已验证")),
    true,
  );
  assert.equal(
    result.publishedKnowledge.every((record) =>
      record.sourceRefs.some((ref) => ref.startsWith("task:")),
    ),
    true,
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
