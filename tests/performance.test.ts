import assert from "node:assert/strict";
import test from "node:test";

import { WorkflowEngine } from "../src/workflow/engine.js";

test("性能基线：用户系统工作流在测试环境内完成时间低于阈值", async () => {
  const engine = new WorkflowEngine({
    obsidianEnabled: false,
    obsidianRoot: undefined,
  });

  const startedAt = Date.now();
  const result = await engine.run({
    request: "做一个用户系统",
    phase: "phase-performance",
  });
  const durationMs = Date.now() - startedAt;

  assert.equal(result.tasks.length, 7);
  assert.equal(durationMs < 2500, true);
});
