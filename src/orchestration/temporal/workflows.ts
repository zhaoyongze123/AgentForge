import { proxyActivities, sleep, workflowInfo } from "@temporalio/workflow";

import type { TemporalActivities } from "./activities.js";
import type { TemporalRunRequest, TemporalRunResult } from "../../domain/orchestration.js";

const activities = proxyActivities<TemporalActivities>({
  startToCloseTimeout: "5 minutes",
  retry: {
    initialInterval: "1 second",
    backoffCoefficient: 2,
    maximumAttempts: 3,
  },
});

export async function controlPlaneWorkflow(
  request: TemporalRunRequest,
): Promise<TemporalRunResult> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const result = await activities.runLangGraphOrchestration(request);
      return {
        ...result,
        workflowId: workflowInfo().workflowId,
        runId: workflowInfo().runId,
      };
    } catch (error) {
      lastError = error;
      if (attempt >= 3) {
        break;
      }
      await sleep(`${attempt} second`);
    }
  }

  throw lastError;
}
