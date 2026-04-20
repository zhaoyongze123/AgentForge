import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { AppEnv } from "../src/core/config/env.js";
import { ControlPlaneService } from "../src/api/control-plane-service.js";
import { FileDatabase } from "../src/persistence/file-database.js";
import {
  AcceptanceRunRepository,
  AssignmentRepository,
  EventLogRepository,
  KnowledgeRecordRepository,
  PersistenceContext,
  TaskRepository,
} from "../src/persistence/repositories.js";

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
    feishuVerificationToken: undefined,
    feishuEncryptKey: undefined,
    obsidianEnabled: false,
    obsidianRoot: undefined,
    databaseUrl,
    temporalAddress: "127.0.0.1:7233",
    temporalNamespace: "default",
    temporalTaskQueue: "agentforge-control-plane",
  };
}

test("数据一致性：任务、指派、验收、知识和事件之间不存在悬挂引用", async () => {
  const root = await mkdtemp(join(tmpdir(), "agentforge-consistency-"));
  const databaseUrl = join(root, "db.json");
  const service = new ControlPlaneService(createEnv(databaseUrl));
  const created = await service.createPlan({
    request: "做一个用户系统",
    phase: "phase-consistency",
  });
  await service.runPlan(created.planId);

  const context = new PersistenceContext(new FileDatabase(databaseUrl));
  const taskRepo = new TaskRepository(context);
  const assignmentRepo = new AssignmentRepository(context);
  const acceptanceRepo = new AcceptanceRunRepository(context);
  const knowledgeRepo = new KnowledgeRecordRepository(context);
  const eventRepo = new EventLogRepository(context);

  const tasks = await taskRepo.list();
  const assignments = await assignmentRepo.list();
  const acceptanceRuns = await acceptanceRepo.list();
  const knowledgeRecords = await knowledgeRepo.list();
  const events = await eventRepo.list();

  const taskIds = new Set(tasks.map((task) => task.taskId));
  const planIds = new Set([created.planId]);

  assert.equal(assignments.every((assignment) => taskIds.has(assignment.taskId)), true);
  assert.equal(acceptanceRuns.every((run) => taskIds.has(run.taskId)), true);
  assert.equal(
    knowledgeRecords.every((record) =>
      record.sourceRefs.every((source) =>
        source.startsWith("task:") ? taskIds.has(source.slice("task:".length)) : true,
      ),
    ),
    true,
  );
  assert.equal(
    events.every((event) => {
      if (event.entityType === "plan") {
        return planIds.has(event.entityId);
      }
      if (event.entityType === "task" || event.entityType === "assignment") {
        return taskIds.has(event.entityId) || event.entityType === "assignment";
      }
      return true;
    }),
    true,
  );
});
