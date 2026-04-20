import test from "node:test";
import assert from "node:assert/strict";

import { isAppError } from "../src/core/errors/app-error.js";
import { Planner, PlannerResultValidator } from "../src/services/planner.js";

test("Planner 输入协议支持高层目标和约束", () => {
  const planner = new Planner();
  const tasks = planner.plan({
    request: "做一个用户系统",
    phase: "phase-2",
    projectId: "agentforge",
    requester: "owner",
    constraints: ["必须包含 JWT"],
    targetModules: ["backend", "frontend"],
  });

  assert.ok(tasks.length > 0);
  assert.ok(tasks.every((task) => task.phase === "phase-2"));
  assert.ok(tasks[0]?.inputs.includes("必须包含 JWT"));
});

test("Planner 会把用户系统拆成后端、前端、联调、验收和知识任务", () => {
  const planner = new Planner();
  const tasks = planner.plan({
    request: "做一个用户系统",
    phase: "phase-2",
  });

  assert.deepEqual(
    tasks.map((task) => task.taskId),
    [
      "backend-user-register",
      "backend-user-login",
      "backend-user-jwt",
      "frontend-auth-pages",
      "integration-auth-flow",
      "acceptance-auth-flow",
      "knowledge-auth-flow",
    ],
  );
});

test("Planner 会生成稳定依赖图", () => {
  const planner = new Planner();
  const tasks = planner.plan({
    request: "做一个用户系统",
    phase: "phase-2",
  });
  const byId = new Map(tasks.map((task) => [task.taskId, task]));

  assert.deepEqual(byId.get("backend-user-login")?.dependencies, [
    "backend-user-register",
  ]);
  assert.deepEqual(byId.get("integration-auth-flow")?.dependencies, [
    "backend-user-jwt",
    "frontend-auth-pages",
  ]);
  assert.deepEqual(byId.get("knowledge-auth-flow")?.dependencies, [
    "acceptance-auth-flow",
  ]);
});

test("Planner 会为不同任务类型推导 read_set/write_set 与 handoff_to", () => {
  const planner = new Planner();
  const tasks = planner.plan({
    request: "做一个用户系统",
    phase: "phase-2",
  });
  const frontend = tasks.find((task) => task.taskId === "frontend-auth-pages");
  const acceptance = tasks.find(
    (task) => task.taskId === "acceptance-auth-flow",
  );
  const knowledge = tasks.find((task) => task.taskId === "knowledge-auth-flow");

  assert.deepEqual(frontend?.writeSet, ["frontend/**", "tests/frontend/**"]);
  assert.equal(frontend?.handoffTo, "integration-agent");
  assert.equal(acceptance?.handoffTo, "knowledge-agent");
  assert.deepEqual(knowledge?.writeSet, [
    "obsidian/knowledge/**",
    "runtime/knowledge/**",
  ]);
});

test("PlannerResultValidator 会拒绝不存在的依赖", () => {
  const planner = new Planner();
  const validator = new PlannerResultValidator();
  const tasks = planner.plan({
    request: "做一个用户系统",
    phase: "phase-2",
  });

  assert.throws(
    () =>
      validator.validate([
        {
          ...tasks[0]!,
          dependencies: ["missing-task"],
        },
      ]),
    (error: unknown) =>
      isAppError(error) && error.code === "TASK_DEPENDENCY_UNMET",
  );
});
