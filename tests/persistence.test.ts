import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  acceptanceResultFixture,
  humanInterventionFixture,
  incidentFixture,
  knowledgeRecordFixture,
  taskUnitFixture,
} from "../src/contracts/fixtures.js";
import type { Assignment } from "../src/domain/plan.js";
import {
  FileDatabase,
  createEmptyDatabase,
} from "../src/persistence/file-database.js";
import {
  ensureSchema,
  migrateDown,
  migrateUp,
} from "../src/persistence/migrations.js";
import {
  AcceptanceRunRepository,
  AssignmentRepository,
  EventLogRepository,
  IncidentRepository,
  KnowledgeRecordRepository,
  PersistenceContext,
  TaskRunRepository,
  TaskRepository,
  WorkerHeartbeatRepository,
} from "../src/persistence/repositories.js";

test("数据库 schema 初始化与迁移可执行", () => {
  const db = createEmptyDatabase();
  const migrated = migrateUp({ ...db, schemaVersion: 0 });
  assert.equal(migrated.schemaVersion, 2);
  assert.deepEqual(migrated.taskRuns, []);
  assert.deepEqual(migrated.workerHeartbeats, []);
  const rolledBack = migrateDown(migrated);
  assert.equal(rolledBack.schemaVersion, 1);
  const ensured = ensureSchema({
    schemaVersion: 1,
    tasks: [],
    assignments: [],
    acceptanceRuns: [],
    knowledgeRecords: [],
    incidents: [],
    humanInterventions: [],
    eventLogs: [],
  } as never);
  assert.equal(ensured.schemaVersion, 2);
  assert.deepEqual(ensured.taskRuns, []);
  assert.deepEqual(ensured.workerHeartbeats, []);
});

test("Task 与 Assignment 可持久化", async () => {
  const root = await mkdtemp(join(tmpdir(), "agentforge-db-"));
  const context = new PersistenceContext(
    new FileDatabase(join(root, "db.json")),
  );
  const taskRepo = new TaskRepository(context);
  const assignmentRepo = new AssignmentRepository(context);

  await taskRepo.save(taskUnitFixture);
  const assignment: Assignment = {
    assignmentId: "as-1",
    taskId: taskUnitFixture.taskId,
    executor: "codex",
    status: "SUCCEEDED",
    startedAt: "2026-04-16T12:00:00.000Z",
    finishedAt: "2026-04-16T12:05:00.000Z",
  };
  await assignmentRepo.save(assignment);

  const tasks = await taskRepo.list();
  const assignments = await assignmentRepo.list();
  assert.equal(tasks.length, 1);
  assert.equal(assignments.length, 1);
  assert.equal(tasks[0]?.taskId, taskUnitFixture.taskId);
});

test("TaskRun 与 WorkerHeartbeat 可持久化并按 taskRunId 查询最新 heartbeat", async () => {
  const root = await mkdtemp(join(tmpdir(), "agentforge-db-"));
  const context = new PersistenceContext(
    new FileDatabase(join(root, "db.json")),
  );
  const taskRunRepo = new TaskRunRepository(context);
  const heartbeatRepo = new WorkerHeartbeatRepository(context);

  await taskRunRepo.save({
    taskRunId: "run-1",
    planId: "plan-1",
    taskId: taskUnitFixture.taskId,
    attempt: 1,
    workerId: "worker-1",
    executor: "codex",
    status: "RUNNING",
    worktreePath: "/tmp/agentforge/worktrees/run-1",
    artifactDir: "/tmp/agentforge/artifacts/run-1",
    createdAt: "2026-04-19T13:00:00.000Z",
    updatedAt: "2026-04-19T13:00:00.000Z",
    startedAt: "2026-04-19T13:00:00.000Z",
  });
  await taskRunRepo.save({
    taskRunId: "run-1",
    planId: "plan-1",
    taskId: taskUnitFixture.taskId,
    attempt: 1,
    workerId: "worker-1",
    executor: "codex",
    status: "SUCCEEDED",
    worktreePath: "/tmp/agentforge/worktrees/run-1",
    artifactDir: "/tmp/agentforge/artifacts/run-1",
    createdAt: "2026-04-19T13:00:00.000Z",
    updatedAt: "2026-04-19T13:05:00.000Z",
    startedAt: "2026-04-19T13:00:00.000Z",
    finishedAt: "2026-04-19T13:05:00.000Z",
  });

  await heartbeatRepo.save({
    heartbeatId: "hb-1",
    taskRunId: "run-1",
    workerId: "worker-1",
    status: "RUNNING",
    message: "worker 已启动",
    observedAt: "2026-04-19T13:01:00.000Z",
    leaseExpiresAt: "2026-04-19T13:01:30.000Z",
  });
  await heartbeatRepo.save({
    heartbeatId: "hb-2",
    taskRunId: "run-1",
    workerId: "worker-1",
    status: "SUCCEEDED",
    message: "worker 已完成",
    observedAt: "2026-04-19T13:05:00.000Z",
    leaseExpiresAt: "2026-04-19T13:05:30.000Z",
  });

  const [taskRun] = await taskRunRepo.listByTaskId(taskUnitFixture.taskId);
  const heartbeats = await heartbeatRepo.listByTaskRunId("run-1");
  const latestHeartbeat = await heartbeatRepo.getLatestByTaskRunId("run-1");

  assert.equal((await taskRunRepo.list()).length, 1);
  assert.equal(taskRun?.attempt, 1);
  assert.equal(taskRun?.workerId, "worker-1");
  assert.equal(taskRun?.worktreePath, "/tmp/agentforge/worktrees/run-1");
  assert.equal(taskRun?.artifactDir, "/tmp/agentforge/artifacts/run-1");
  assert.equal(taskRun?.status, "SUCCEEDED");
  assert.equal(heartbeats.length, 2);
  assert.equal(latestHeartbeat?.heartbeatId, "hb-2");
  assert.equal(latestHeartbeat?.status, "SUCCEEDED");
});

test("AcceptanceRun 与 KnowledgeRecord 可持久化", async () => {
  const root = await mkdtemp(join(tmpdir(), "agentforge-db-"));
  const context = new PersistenceContext(
    new FileDatabase(join(root, "db.json")),
  );
  const acceptanceRepo = new AcceptanceRunRepository(context);
  const knowledgeRepo = new KnowledgeRecordRepository(context);

  const run = await acceptanceRepo.save("task-1", acceptanceResultFixture);
  await knowledgeRepo.save(knowledgeRecordFixture);

  assert.equal(run.taskId, "task-1");
  assert.equal((await acceptanceRepo.list()).length, 1);
  assert.equal((await acceptanceRepo.listByTaskId("task-1")).length, 1);
  assert.equal((await knowledgeRepo.list()).length, 1);
});

test("Incident / HumanIntervention / EventLog 可持久化", async () => {
  const root = await mkdtemp(join(tmpdir(), "agentforge-db-"));
  const context = new PersistenceContext(
    new FileDatabase(join(root, "db.json")),
  );
  const incidentRepo = new IncidentRepository(context);
  const eventRepo = new EventLogRepository(context);

  await incidentRepo.saveIncident(incidentFixture);
  await incidentRepo.saveHumanIntervention(humanInterventionFixture);
  await eventRepo.append({
    eventId: "evt-1",
    entityType: "incident",
    entityId: incidentFixture.incidentId,
    eventType: "incident.created",
    payload: { severity: incidentFixture.severity },
    createdAt: "2026-04-16T12:00:00.000Z",
  });

  assert.equal((await incidentRepo.listIncidents()).length, 1);
  assert.equal((await incidentRepo.listHumanInterventions()).length, 1);
  assert.equal((await eventRepo.list()).length, 1);
});
