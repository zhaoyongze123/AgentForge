import { loadEnv } from "../core/config/env.js";
import { TemporalControlPlaneClient } from "../orchestration/temporal/client.js";

async function main(): Promise<void> {
  const env = loadEnv();
  const client = new TemporalControlPlaneClient(env);

  const result = await client.runPlan("smoke-plan", {
    request: "做一个用户系统",
    phase: "phase-13",
  });

  console.log(
    JSON.stringify(
      {
        workflowId: result.workflowId,
        runId: result.runId,
        taskCount: result.result.tasks.length,
        assignmentCount: result.result.assignments,
        publishedKnowledgeCount: result.result.publishedKnowledge.length,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(
    JSON.stringify(
      {
        error: error instanceof Error ? error.message : String(error),
      },
      null,
      2,
    ),
  );
  process.exitCode = 1;
});
