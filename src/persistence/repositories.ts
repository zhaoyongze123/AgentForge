import type { AcceptanceResult } from "../domain/acceptance.js";
import type { Incident, HumanIntervention } from "../domain/incident.js";
import type { KnowledgeRecord } from "../domain/knowledge.js";
import type { Assignment } from "../domain/plan.js";
import type {
  AcceptanceRun,
  DatabaseSchema,
  EventLogRecord,
  TaskRun,
  WorkerHeartbeat,
} from "../domain/persistence.js";
import type { TaskUnit } from "../domain/task-unit.js";
import { FileDatabase } from "./file-database.js";
import { ensureSchema } from "./migrations.js";

export class PersistenceContext {
  constructor(private readonly database: FileDatabase) {}

  async read(): Promise<DatabaseSchema> {
    return ensureSchema(await this.database.load());
  }

  async write(next: DatabaseSchema): Promise<void> {
    await this.database.save(next);
  }
}

export class TaskRepository {
  constructor(private readonly context: PersistenceContext) {}

  async save(task: TaskUnit): Promise<void> {
    const db = await this.context.read();
    db.tasks = upsertBy(
      db.tasks,
      task,
      (item) => `${item.planId ?? "no-plan"}:${item.taskId}`,
    );
    await this.context.write(db);
  }

  async list(): Promise<TaskUnit[]> {
    return (await this.context.read()).tasks;
  }
}

export class AssignmentRepository {
  constructor(private readonly context: PersistenceContext) {}

  async save(assignment: Assignment): Promise<void> {
    const db = await this.context.read();
    db.assignments = upsertBy(db.assignments, assignment, "assignmentId");
    await this.context.write(db);
  }

  async list(): Promise<Assignment[]> {
    return (await this.context.read()).assignments;
  }
}

export class TaskRunRepository {
  constructor(private readonly context: PersistenceContext) {}

  async save(taskRun: TaskRun): Promise<void> {
    const db = await this.context.read();
    db.taskRuns = upsertBy(db.taskRuns, taskRun, "taskRunId");
    await this.context.write(db);
  }

  async list(): Promise<TaskRun[]> {
    return (await this.context.read()).taskRuns;
  }

  async listByTaskId(taskId: string): Promise<TaskRun[]> {
    return (await this.context.read()).taskRuns.filter(
      (taskRun) => taskRun.taskId === taskId,
    );
  }
}

export class WorkerHeartbeatRepository {
  constructor(private readonly context: PersistenceContext) {}

  async save(heartbeat: WorkerHeartbeat): Promise<void> {
    const db = await this.context.read();
    db.workerHeartbeats = upsertBy(
      db.workerHeartbeats,
      heartbeat,
      "heartbeatId",
    );
    await this.context.write(db);
  }

  async list(): Promise<WorkerHeartbeat[]> {
    return (await this.context.read()).workerHeartbeats;
  }

  async listByTaskRunId(taskRunId: string): Promise<WorkerHeartbeat[]> {
    return (await this.context.read()).workerHeartbeats.filter(
      (heartbeat) => heartbeat.taskRunId === taskRunId,
    );
  }

  async getLatestByTaskRunId(
    taskRunId: string,
  ): Promise<WorkerHeartbeat | undefined> {
    const heartbeats = await this.listByTaskRunId(taskRunId);
    return [...heartbeats].sort((left, right) =>
      right.observedAt.localeCompare(left.observedAt),
    )[0];
  }
}

export class AcceptanceRunRepository {
  constructor(private readonly context: PersistenceContext) {}

  async save(taskId: string, result: AcceptanceResult): Promise<AcceptanceRun> {
    const db = await this.context.read();
    const run: AcceptanceRun = {
      runId: `acc-${taskId}-${db.acceptanceRuns.length + 1}`,
      taskId,
      status: result.status,
      summary: result.summary,
      result,
      createdAt: new Date().toISOString(),
    };
    db.acceptanceRuns.push(run);
    await this.context.write(db);
    return run;
  }

  async list(): Promise<AcceptanceRun[]> {
    return (await this.context.read()).acceptanceRuns;
  }

  async listByTaskId(taskId: string): Promise<AcceptanceRun[]> {
    return (await this.context.read()).acceptanceRuns.filter(
      (run) => run.taskId === taskId,
    );
  }
}

export class KnowledgeRecordRepository {
  constructor(private readonly context: PersistenceContext) {}

  async save(record: KnowledgeRecord): Promise<void> {
    const db = await this.context.read();
    db.knowledgeRecords = upsertBy(
      db.knowledgeRecords,
      record,
      (item) => `${item.knowledgeId}@${item.version}`,
    );
    await this.context.write(db);
  }

  async list(): Promise<KnowledgeRecord[]> {
    return (await this.context.read()).knowledgeRecords;
  }
}

export class IncidentRepository {
  constructor(private readonly context: PersistenceContext) {}

  async saveIncident(incident: Incident): Promise<void> {
    const db = await this.context.read();
    db.incidents = upsertBy(db.incidents, incident, "incidentId");
    await this.context.write(db);
  }

  async saveHumanIntervention(intervention: HumanIntervention): Promise<void> {
    const db = await this.context.read();
    db.humanInterventions = upsertBy(
      db.humanInterventions,
      intervention,
      "interventionId",
    );
    await this.context.write(db);
  }

  async listIncidents(): Promise<Incident[]> {
    return (await this.context.read()).incidents;
  }

  async listHumanInterventions(): Promise<HumanIntervention[]> {
    return (await this.context.read()).humanInterventions;
  }
}

export class HumanInterventionRepository {
  constructor(private readonly context: PersistenceContext) {}

  async save(intervention: HumanIntervention): Promise<void> {
    const db = await this.context.read();
    db.humanInterventions = upsertBy(
      db.humanInterventions,
      intervention,
      "interventionId",
    );
    await this.context.write(db);
  }

  async list(): Promise<HumanIntervention[]> {
    return (await this.context.read()).humanInterventions;
  }
}

export class EventLogRepository {
  constructor(private readonly context: PersistenceContext) {}

  async append(event: EventLogRecord): Promise<void> {
    const db = await this.context.read();
    db.eventLogs.push(event);
    await this.context.write(db);
  }

  async list(): Promise<EventLogRecord[]> {
    return (await this.context.read()).eventLogs;
  }
}

function upsertBy<T>(
  items: T[],
  next: T,
  key: keyof T | ((item: T) => string),
): T[] {
  const readKey =
    typeof key === "function" ? key : (item: T) => String(item[key]);

  const target = readKey(next);
  const index = items.findIndex((item) => readKey(item) === target);
  if (index === -1) {
    return [...items, next];
  }

  return items.map((item, itemIndex) => (itemIndex === index ? next : item));
}
