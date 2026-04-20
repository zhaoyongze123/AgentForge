import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import type { DatabaseSchema } from "../domain/persistence.js";

export const CURRENT_SCHEMA_VERSION = 2;

export function createEmptyDatabase(): DatabaseSchema {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    tasks: [],
    assignments: [],
    taskRuns: [],
    workerHeartbeats: [],
    acceptanceRuns: [],
    knowledgeRecords: [],
    incidents: [],
    humanInterventions: [],
    eventLogs: [],
  };
}

export class FileDatabase {
  constructor(private readonly databaseUrl: string) {}

  async load(): Promise<DatabaseSchema> {
    try {
      const content = await readFile(this.databaseUrl, "utf8");
      return JSON.parse(content) as DatabaseSchema;
    } catch {
      return createEmptyDatabase();
    }
  }

  async save(database: DatabaseSchema): Promise<void> {
    await mkdir(dirname(this.databaseUrl), { recursive: true });
    await writeFile(
      this.databaseUrl,
      JSON.stringify(database, null, 2),
      "utf8",
    );
  }
}
