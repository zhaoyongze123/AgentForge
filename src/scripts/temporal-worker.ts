import { fileURLToPath } from "node:url";

import { NativeConnection, Worker } from "@temporalio/worker";

import { loadEnv } from "../core/config/env.js";
import { Logger } from "../core/logging/logger.js";
import { createTemporalActivities } from "../orchestration/temporal/activities.js";

const env = loadEnv();
const logger = new Logger();

async function main(): Promise<void> {
  const connection = await NativeConnection.connect({
    address: env.temporalAddress,
  });

  const worker = await Worker.create({
    connection,
    namespace: env.temporalNamespace,
    taskQueue: env.temporalTaskQueue,
    workflowsPath: fileURLToPath(
      new URL("../orchestration/temporal/workflows.js", import.meta.url),
    ),
    activities: createTemporalActivities(),
  });

  logger.info("Temporal worker 已启动", {
    address: env.temporalAddress,
    namespace: env.temporalNamespace,
    taskQueue: env.temporalTaskQueue,
  });

  await worker.run();
}

main().catch((error) => {
  logger.error("Temporal worker 启动失败", {
    error: error instanceof Error ? error.message : String(error),
  });
  process.exitCode = 1;
});
