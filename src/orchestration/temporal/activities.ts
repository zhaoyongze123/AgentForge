import { Context } from "@temporalio/activity";

import type { TemporalRunRequest, TemporalRunResult } from "../../domain/orchestration.js";
import { runLangGraphPlan } from "../langgraph/graph.js";

export interface TemporalActivities {
  runLangGraphOrchestration(
    request: TemporalRunRequest,
  ): Promise<TemporalRunResult>;
}

export function createTemporalActivities(): TemporalActivities {
  return {
    async runLangGraphOrchestration(
      request: TemporalRunRequest,
    ): Promise<TemporalRunResult> {
      const activityContext = Context.current();
      const result = await runLangGraphPlan(
        request.input,
        request.runtime,
        request.planId,
      );

      return {
        workflowId: request.planId,
        runId: activityContext.info.workflowExecution.runId,
        result,
      };
    },
  };
}
