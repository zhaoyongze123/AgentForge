import test from "node:test";
import assert from "node:assert/strict";

import { WorkflowEngine } from "../src/workflow/engine.js";

test("工作流引擎会把通过验收的高分候选发布为长期知识", () => {
  const engine = new WorkflowEngine();
  const result = engine.run({
    request: "做一个用户系统",
    phase: "phase-2",
  });

  assert.equal(result.tasks.length, 3);
  assert.ok(result.publishedKnowledge.length >= 1);
  assert.equal(result.publishedKnowledge[0]?.status, "active");
});

