import assert from "node:assert/strict";
import test from "node:test";

import type { AcceptanceResult } from "../src/domain/acceptance.js";
import type { PlanInput, TaskUnit } from "../src/domain/task-unit.js";
import { ExecutorRuntime } from "../src/executors/runtime.js";
import { WorkflowEngine } from "../src/workflow/engine.js";
import { Evaluator } from "../src/services/evaluator.js";
import { Planner } from "../src/services/planner.js";

class StaticPlanner extends Planner {
  constructor(private readonly tasks: TaskUnit[]) {
    super();
  }

  override plan(_input: PlanInput): TaskUnit[] {
    return this.tasks;
  }
}

class StableEvaluator extends Evaluator {
  override evaluate(task: TaskUnit): AcceptanceResult {
    return {
      status: "passed",
      summary: `${task.taskId} passed`,
      acceptanceChecks: ["ok"],
      evidence: ["ok"],
      rootCause: "",
      autoFixable: false,
      requiresHuman: false,
      nextAction: "continue",
      knowledgeSignal: {
        reusableScore: 0.8,
        noveltyScore: 0.4,
        confidence: 0.9,
        stabilityScore: 0.85,
        impactScore: 0.6,
        candidateType: "pattern",
        recommendedAction: "capture",
      },
    };
  }
}

function createTask(
  taskId: string,
  simulate: string,
): TaskUnit {
  return {
    planId: "chaos-plan",
    taskId,
    title: taskId,
    goal: `${taskId} goal`,
    type: "backend",
    phase: "chaos",
    priority: "high",
    dependencies: [],
    readSet: ["src/**"],
    writeSet: ["src/**"],
    inputs: [`simulate:${simulate}`],
    deliverables: ["artifact"],
    acceptanceCriteria: ["criteria"],
    testCommands: ["npm test"],
    handoffTo: "acceptance-agent",
    blockedConditions: ["external unavailable"],
    autoFixPolicy: [],
    humanGate: { required: false },
    knowledgePolicy: {
      enabled: true,
      candidateType: "pattern",
      reusableScoreThreshold: 0.7,
      stabilityScoreThreshold: 0.75,
      confidenceThreshold: 0.8,
    },
    status: "READY",
  };
}

test("故障注入：外部异常会收敛到 blocked 或 waiting_human，而不是假成功", async () => {
  const engine = new WorkflowEngine({
    obsidianEnabled: false,
    obsidianRoot: undefined,
    planner: new StaticPlanner([
      createTask("task-blocked", "blocked"),
      createTask("task-human", "human_required"),
      createTask("task-timeout", "slow"),
    ]),
    evaluator: new StableEvaluator(),
    executorRuntime: new ExecutorRuntime({ timeoutMs: 20 }),
  });

  const result = await engine.run({
    request: "chaos",
    phase: "chaos",
  });

  assert.equal(
    result.tasks.find((task) => task.taskId === "task-blocked")?.status,
    "FAILED_BLOCKED",
  );
  assert.equal(
    result.tasks.find((task) => task.taskId === "task-human")?.status,
    "WAITING_HUMAN",
  );
  assert.equal(
    result.tasks.find((task) => task.taskId === "task-timeout")?.status,
    "FAILED_RETRYABLE",
  );
  assert.equal(result.acceptanceResults.length, 0);
  assert.equal(result.publishedKnowledge.length, 0);
});
