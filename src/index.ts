import { createHttpApp } from "./api/http-server.js";
import { loadEnv } from "./core/config/env.js";
import { Logger } from "./core/logging/logger.js";
import { redactSensitiveData } from "./core/security/redaction.js";

const env = loadEnv();
const logger = new Logger();
const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? "127.0.0.1";
const server = createHttpApp(env);

server.listen(port, host, () => {
  logger.info("HTTP 控制平面已启动", {
    workflowExecutor: env.workflowExecutor,
    realExecutor: env.realExecutor,
    strictMode: env.strictMode,
    allowSimulation: env.allowSimulation,
    requireRealExternals: env.requireRealExternals,
    port,
    host,
    databaseUrl: env.databaseUrl,
    obsidianEnabled: env.obsidianEnabled,
    security: redactSensitiveData({
      controlPlaneApiKey: env.controlPlaneApiKey,
      humanGateApiKey: env.humanGateApiKey,
      projectAllowlist: env.projectAllowlist,
    }),
  });
});
