import test from "node:test";
import assert from "node:assert/strict";

import type { TaskUnit } from "../src/domain/task-unit.js";
import { Dispatcher } from "../src/services/dispatcher.js";

function createTask(
  overrides: Partial<TaskUnit> & { taskId: string },
): TaskUnit {
  return {
    taskId: overrides.taskId,
    title: overrides.title ?? overrides.taskId,
    goal: overrides.goal ?? "goal",
    type: overrides.type ?? "backend",
    phase: overrides.phase ?? "phase-2",
    priority: overrides.priority ?? "medium",
    dependencies: overrides.dependencies ?? [],
    readSet: overrides.readSet ?? ["docs/**"],
    writeSet: overrides.writeSet ?? ["src/**"],
    inputs: overrides.inputs ?? ["request"],
    deliverables: overrides.deliverables ?? ["deliverable"],
    acceptanceCriteria: overrides.acceptanceCriteria ?? ["criteria"],
    testCommands: overrides.testCommands ?? ["npm test"],
    handoffTo: overrides.handoffTo ?? "acceptance-agent",
    blockedConditions: overrides.blockedConditions ?? [],
    autoFixPolicy: overrides.autoFixPolicy ?? [],
    humanGate: overrides.humanGate ?? { required: false },
    knowledgePolicy: overrides.knowledgePolicy,
    status: overrides.status ?? "READY",
  };
}

test("Dispatcher 只查询 READY 的 pending 任务", () => {
  const dispatcher = new Dispatcher();
  const tasks = [
    createTask({ taskId: "task-ready", status: "READY" }),
    createTask({ taskId: "task-planned", status: "PLANNED" }),
    createTask({ taskId: "task-done", status: "DONE" }),
  ];

  assert.deepEqual(
    dispatcher.findPendingTasks(tasks).map((task) => task.taskId),
    ["task-ready"],
  );
});

test("Dispatcher 会检查依赖是否满足", () => {
  const dispatcher = new Dispatcher();
  const tasks = [
    createTask({ taskId: "task-a", status: "DONE" }),
    createTask({
      taskId: "task-b",
      dependencies: ["task-a"],
      status: "READY",
    }),
    createTask({
      taskId: "task-c",
      dependencies: ["task-missing"],
      status: "READY",
    }),
  ];

  assert.equal(dispatcher.hasSatisfiedDependencies(tasks[1]!, tasks), true);
  assert.equal(dispatcher.hasSatisfiedDependencies(tasks[2]!, tasks), false);
});

test("Dispatcher 会阻止 write_set 冲突任务并行", () => {
  const dispatcher = new Dispatcher();
  const leaseState = {
    assignments: new Map(),
    taskLeases: new Map(),
  };
  const tasks = [
    createTask({
      taskId: "task-a",
      priority: "high",
      writeSet: ["src/auth/**"],
    }),
    createTask({
      taskId: "task-b",
      priority: "medium",
      writeSet: ["src/auth/**"],
    }),
    createTask({
      taskId: "task-c",
      priority: "medium",
      writeSet: ["src/profile/**"],
    }),
  ];

  const decisions = dispatcher.dispatch(tasks, leaseState);
  assert.deepEqual(
    decisions.map((decision) => decision.task.taskId),
    ["task-a", "task-c"],
  );
});

test("Dispatcher 会按优先级排序并选择执行器", () => {
  const dispatcher = new Dispatcher();
  const leaseState = {
    assignments: new Map(),
    taskLeases: new Map(),
  };
  const tasks = [
    createTask({
      taskId: "frontend-auth",
      type: "frontend",
      priority: "medium",
      writeSet: ["frontend/**"],
    }),
    createTask({
      taskId: "acceptance-auth",
      type: "acceptance",
      priority: "high",
      writeSet: ["runtime/acceptance/**"],
    }),
  ];

  const decisions = dispatcher.dispatch(tasks, leaseState);
  assert.equal(decisions[0]?.assignment.executor, "claude");
  assert.equal(decisions[1]?.assignment.executor, "openhands");
});

test("Dispatcher 在真实执行模式下可强制全部派发给 codex", () => {
  const dispatcher = new Dispatcher({ forcedExecutor: "codex" });
  const leaseState = {
    assignments: new Map(),
    taskLeases: new Map(),
  };
  const tasks = [
    createTask({
      taskId: "frontend-auth",
      type: "frontend",
      writeSet: ["frontend/**"],
    }),
    createTask({
      taskId: "acceptance-auth",
      type: "acceptance",
      writeSet: ["runtime/acceptance/**"],
    }),
  ];

  const decisions = dispatcher.dispatch(tasks, leaseState);
  assert.deepEqual(
    decisions.map((decision) => decision.assignment.executor),
    ["codex", "codex"],
  );
});

test("Dispatcher 会创建租约并支持释放", () => {
  const dispatcher = new Dispatcher();
  const leaseState = {
    assignments: new Map(),
    taskLeases: new Map(),
  };
  const tasks = [createTask({ taskId: "task-a" })];

  const [decision] = dispatcher.dispatch(tasks, leaseState);
  assert.equal(
    leaseState.taskLeases.get("task-a"),
    decision?.assignment.assignmentId,
  );

  dispatcher.releaseLease("task-a", leaseState);
  assert.equal(leaseState.taskLeases.has("task-a"), false);
});

test("Workflow Engine 在 simulated 执行下只会为首个任务生成 Assignment", async () => {
  const { WorkflowEngine } = await import("../src/workflow/engine.js");
  const engine = new WorkflowEngine();
  const result = await engine.run({
    request: "做一个用户系统",
    phase: "phase-2",
  });

  assert.equal(result.assignments, 1);
  assert.equal(result.acceptanceResults.length, 1);
  assert.equal(result.acceptanceResults[0]?.result.status, "blocked");
});
