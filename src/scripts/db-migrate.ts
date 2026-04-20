import { loadEnv } from "../core/config/env.js";
import { FileDatabase } from "../persistence/file-database.js";
import { migrateDown, migrateUp } from "../persistence/migrations.js";

const env = loadEnv();
const database = new FileDatabase(env.databaseUrl);
const current = await database.load();
const action = process.argv[2] ?? "up";

if (action === "down") {
  await database.save(migrateDown(current));
} else {
  await database.save(migrateUp(current));
}
