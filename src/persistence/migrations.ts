import type { DatabaseSchema } from "../domain/persistence.js";
import {
  createEmptyDatabase,
  CURRENT_SCHEMA_VERSION,
} from "./file-database.js";

export interface Migration {
  version: number;
  name: string;
  up: (database: DatabaseSchema) => DatabaseSchema;
  down: (database: DatabaseSchema) => DatabaseSchema;
}

export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: "init_schema_v1",
    up: () => createEmptyDatabase(),
    down: () => ({ ...createEmptyDatabase(), schemaVersion: 0 }),
  },
  {
    version: 2,
    name: "add_task_runs_and_worker_heartbeats_v2",
    up: (database) => ({
      ...database,
      taskRuns: database.taskRuns ?? [],
      workerHeartbeats: database.workerHeartbeats ?? [],
    }),
    down: (database) => ({
      ...database,
      taskRuns: [],
      workerHeartbeats: [],
    }),
  },
];

export function migrateUp(database: DatabaseSchema): DatabaseSchema {
  let next = { ...database };
  for (const migration of MIGRATIONS) {
    if (next.schemaVersion >= migration.version) {
      continue;
    }
    next = migration.up(next);
    next.schemaVersion = migration.version;
  }
  return next;
}

export function migrateDown(database: DatabaseSchema): DatabaseSchema {
  let next = { ...database };
  const applied = [...MIGRATIONS]
    .filter((migration) => migration.version <= database.schemaVersion)
    .sort((left, right) => right.version - left.version)[0];

  if (!applied) {
    return next;
  }

  next = applied.down(next);
  next.schemaVersion = Math.max(0, applied.version - 1);
  return next;
}

export function ensureSchema(database: DatabaseSchema): DatabaseSchema {
  const hasTaskRuns = Array.isArray(
    (database as Partial<DatabaseSchema>).taskRuns,
  );
  const hasWorkerHeartbeats = Array.isArray(
    (database as Partial<DatabaseSchema>).workerHeartbeats,
  );

  if (
    database.schemaVersion === CURRENT_SCHEMA_VERSION &&
    hasTaskRuns &&
    hasWorkerHeartbeats
  ) {
    return database;
  }
  return migrateUp(database);
}
