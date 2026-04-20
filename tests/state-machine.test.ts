import test from "node:test";
import assert from "node:assert/strict";

import { isAppError } from "../src/core/errors/app-error.js";
import {
  BlockedHandler,
  BusinessTaskStateMachine,
  HumanGatePolicy,
  KnowledgeLifecycleStateMachine,
  RetryPolicy,
  TransitionAuditLog,
} from "../src/workflow/state-machine.js";

test("业务任务状态机拒绝非法状态迁移", () => {
  const machine = new BusinessTaskStateMachine();

  assert.throws(
    () => machine.transition("PLANNED", "DONE", "跳过执行"),
    (error: unknown) =>
      isAppError(error) && error.code === "STATE_TRANSITION_INVALID",
  );
});

test("业务任务状态机允许合法状态迁移", () => {
  const machine = new BusinessTaskStateMachine();
  assert.equal(machine.transition("PLANNED", "READY", "任务拆分完成"), "READY");
  assert.equal(machine.transition("READY", "RUNNING", "开始执行"), "RUNNING");
});

test("知识生命周期状态机允许 candidate 到 active", () => {
  const machine = new KnowledgeLifecycleStateMachine();
  assert.equal(
    machine.transition("candidate", "active", "通过预算与冲突检查"),
    "active",
  );
});

test("RetryPolicy 会在超过上限后转 blocked", () => {
  const policy = new RetryPolicy(2);
  assert.equal(policy.nextStatus(0), "FAILED_RETRYABLE");
  assert.equal(policy.nextStatus(1), "FAILED_RETRYABLE");
  assert.equal(policy.nextStatus(2), "FAILED_BLOCKED");
});

test("BlockedHandler 会按分类路由状态", () => {
  const handler = new BlockedHandler();
  assert.equal(handler.route("retryable"), "FAILED_RETRYABLE");
  assert.equal(handler.route("blocked"), "FAILED_BLOCKED");
  assert.equal(handler.route("human_required"), "WAITING_HUMAN");
});

test("HumanGatePolicy 会在高风险冲突时进入人工等待", () => {
  const policy = new HumanGatePolicy();
  assert.equal(
    policy.shouldWaitHuman({
      architectureConflict: false,
      permissionConflict: false,
      highValueKnowledgeConflict: false,
    }),
    false,
  );
  assert.equal(
    policy.shouldWaitHuman({
      architectureConflict: true,
      permissionConflict: false,
      highValueKnowledgeConflict: false,
    }),
    true,
  );
});

test("TransitionAuditLog 可按实体查询完整迁移链", () => {
  const auditLog = new TransitionAuditLog();
  auditLog.record({
    entityId: "task-1",
    entityType: "task",
    from: "PLANNED",
    to: "READY",
    reason: "任务拆分完成",
    timestamp: "2026-04-16T00:00:00.000Z",
  });
  auditLog.record({
    entityId: "task-1",
    entityType: "task",
    from: "READY",
    to: "RUNNING",
    reason: "开始执行",
    timestamp: "2026-04-16T00:00:01.000Z",
  });

  const records = auditLog.listByEntity("task-1");
  assert.equal(records.length, 2);
  assert.equal(records[1]?.to, "RUNNING");
});
