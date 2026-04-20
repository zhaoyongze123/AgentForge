import { Client, Connection } from "@temporalio/client";

import type { AppEnv } from "../../core/config/env.js";
import type { TemporalRunRequest, TemporalRunResult } from "../../domain/orchestration.js";
import { controlPlaneWorkflow } from "./workflows.js";

interface TemporalControlPlaneClientEnv
  extends Pick<
    AppEnv,
    | "temporalAddress"
    | "temporalNamespace"
    | "temporalTaskQueue"
    | "obsidianEnabled"
    | "obsidianRoot"
    | "realExecutor"
    | "executorTimeoutMs"
    | "targetProjectRoot"
    | "codexCliCommand"
    | "installCommand"
    | "typecheckCommand"
    | "testCommand"
    | "buildCommand"
    | "e2eCommand"
    | "requireHumanOnTestFail"
  > {
  allowSimulation?: boolean;
}

export class TemporalControlPlaneClient {
  constructor(private readonly env: TemporalControlPlaneClientEnv) {}

  async runPlan(
    planId: string,
    request: TemporalRunRequest["input"],
  ): Promise<TemporalRunResult> {
    const connection = await Connection.connect({
      address: this.env.temporalAddress,
    });

    try {
      const client = new Client({
        connection,
        namespace: this.env.temporalNamespace,
      });
      const handle = await client.workflow.start(controlPlaneWorkflow, {
        taskQueue: this.env.temporalTaskQueue,
        workflowId: `agentforge-${planId}-${Date.now()}`,
        args: [
          {
            planId,
            input: request,
            runtime: {
              obsidianEnabled: this.env.obsidianEnabled,
              obsidianRoot: this.env.obsidianRoot,
              realExecutor: this.env.realExecutor,
              allowSimulation: this.env.allowSimulation,
              executorTimeoutMs: this.env.executorTimeoutMs,
              targetProjectRoot: this.env.targetProjectRoot,
              codexCliCommand: this.env.codexCliCommand,
              installCommand: this.env.installCommand,
              typecheckCommand: this.env.typecheckCommand,
              testCommand: this.env.testCommand,
              buildCommand: this.env.buildCommand,
              e2eCommand: this.env.e2eCommand,
              requireHumanOnTestFail: this.env.requireHumanOnTestFail,
            },
          },
        ],
      });
      const result = await handle.result();

      return {
        ...result,
        workflowId: handle.workflowId,
        runId: result.runId ?? handle.firstExecutionRunId,
      };
    } finally {
      await connection.close();
    }
  }
}
