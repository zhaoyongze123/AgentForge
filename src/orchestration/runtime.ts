import type { AppEnv } from "../core/config/env.js";
import type { PlanInput } from "../domain/task-unit.js";
import { runLangGraphPlan } from "./langgraph/graph.js";
import { TemporalControlPlaneClient } from "./temporal/client.js";
import type { WorkflowRunResult } from "../workflow/engine.js";
import { WorkflowEngine } from "../workflow/engine.js";

export async function executeWorkflowRun(
  env: AppEnv,
  planId: string,
  input: PlanInput,
): Promise<WorkflowRunResult> {
  if (env.workflowExecutor === "temporal") {
    const client = new TemporalControlPlaneClient(env);
    const temporalResult = await client.runPlan(planId, input);
    return temporalResult.result;
  }

  if (env.workflowExecutor === "langgraph") {
    return runLangGraphPlan(input, env, planId);
  }

  return new WorkflowEngine(env).run(input);
}
