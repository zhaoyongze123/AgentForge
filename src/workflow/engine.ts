import type { AppEnv } from "../core/config/env.js";
import { AppError } from "../core/errors/app-error.js";
import type { AcceptanceResult } from "../domain/acceptance.js";
import type { KnowledgeRecord } from "../domain/knowledge.js";
import type { Assignment } from "../domain/plan.js";
import type { PlanInput, TaskUnit } from "../domain/task-unit.js";
import { ExecutorRuntime } from "../executors/runtime.js";
import { InMemoryStore } from "../runtime/in-memory-store.js";
import { Dispatcher } from "../services/dispatcher.js";
import { Evaluator } from "../services/evaluator.js";
import { buildAcceptanceInputFromExecution } from "../services/execution-acceptance-input.js";
import { KnowledgeWorkflow } from "../services/knowledge-workflow.js";
import { ObsidianKnowledgeService } from "../services/obsidian-knowledge.js";
import { Planner } from "../services/planner.js";
import { BusinessTaskStateMachine } from "./state-machine.js";

export interface WorkflowRunResult {
  tasks: TaskUnit[];
  publishedKnowledge: KnowledgeRecord[];
  assignments: number;
  assignmentRecords: Assignment[];
  acceptanceResults: Array<{
    taskId: string;
    result: AcceptanceResult;
  }>;
}

export interface WorkflowEngineOptions
  extends Pick<
    AppEnv,
    | "obsidianEnabled"
    | "obsidianRoot"
    | "realExecutor"
    | "executorTimeoutMs"
    | "targetProjectRoot"
    | "githubToken"
    | "codexCliCommand"
    | "installCommand"
    | "typecheckCommand"
    | "testCommand"
    | "buildCommand"
    | "e2eCommand"
    | "requireHumanOnTestFail"
  > {
  allowSimulation?: boolean;
  planner?: Planner;
  dispatcher?: Dispatcher;
  evaluator?: Evaluator;
  executorRuntime?: ExecutorRuntime;
}

export class WorkflowEngine {
  private readonly store = new InMemoryStore();
  private readonly planner: Planner;
  private readonly dispatcher: Dispatcher;
  private readonly evaluator: Evaluator;
  private readonly executorRuntime: ExecutorRuntime;
  private readonly taskStateMachine = new BusinessTaskStateMachine();
  private readonly knowledgeWorkflow: KnowledgeWorkflow;

  constructor(
    env: WorkflowEngineOptions = {
      obsidianEnabled: false,
      obsidianRoot: undefined,
      realExecutor: "simulated",
      executorTimeoutMs: 120_000,
      targetProjectRoot: undefined,
      codexCliCommand:
        "codex exec --dangerously-bypass-approvals-and-sandbox",
      installCommand: undefined,
      typecheckCommand: undefined,
      testCommand: undefined,
      buildCommand: undefined,
      e2eCommand: undefined,
      requireHumanOnTestFail: false,
      allowSimulation: true,
    },
  ) {
    if (
      env.allowSimulation === false &&
      env.realExecutor !== "codex" &&
      !env.executorRuntime
    ) {
      throw new AppError({
        code: "CONFIG_INVALID",
        message:
          "当 ALLOW_SIMULATION=false 时，WorkflowEngine 必须使用 REAL_EXECUTOR=codex 或自定义执行器。",
        details: { key: "ALLOW_SIMULATION" },
      });
    }

    this.planner = env.planner ?? new Planner();
    this.dispatcher =
      env.dispatcher ??
      new Dispatcher({
        forcedExecutor:
          env.realExecutor === "codex" ? "codex" : undefined,
      });
    this.evaluator = env.evaluator ?? new Evaluator();
    this.executorRuntime =
      env.executorRuntime ??
      new ExecutorRuntime({
        timeoutMs: env.executorTimeoutMs,
        allowSimulation: env.allowSimulation,
        realCodex:
          env.realExecutor === "codex" && env.targetProjectRoot
            ? {
                projectRoot: env.targetProjectRoot,
                installCommand: env.installCommand,
                typecheckCommand: env.typecheckCommand,
                testCommand: env.testCommand,
                buildCommand: env.buildCommand,
                e2eCommand: env.e2eCommand,
                command:
                  env.codexCliCommand ??
                  "codex exec --dangerously-bypass-approvals-and-sandbox",
                requireHumanOnTestFail: env.requireHumanOnTestFail ?? false,
                githubDelivery: env.githubToken
                  ? {
                      token: env.githubToken,
                    }
                  : undefined,
              }
            : undefined,
      });
    const obsidian =
      env.obsidianEnabled && env.obsidianRoot
        ? new ObsidianKnowledgeService(env.obsidianRoot)
        : null;
    this.knowledgeWorkflow = new KnowledgeWorkflow(this.store, obsidian);
  }

  async run(input: PlanInput): Promise<WorkflowRunResult> {
    const tasks = this.planner.plan(input);
    for (const task of tasks) {
      this.store.tasks.set(task.taskId, task);
    }

    const publishedKnowledge: KnowledgeRecord[] = [];

    while (true) {
      this.promoteReadyTasks();
      const dispatchDecisions = this.dispatcher.dispatch(
        [...this.store.tasks.values()],
        this.store,
      );
      if (dispatchDecisions.length === 0) {
        break;
      }

      for (const decision of dispatchDecisions) {
        const task = this.store.tasks.get(decision.task.taskId);
        if (!task) {
          continue;
        }

        const runningAssignment = this.dispatcher.markAssignmentRunning(
          decision.assignment,
        );
        this.store.assignments.set(
          runningAssignment.assignmentId,
          runningAssignment,
        );
        task.status = this.taskStateMachine.transition(
          task.status ?? "READY",
          "RUNNING",
          "任务已分配执行器并开始执行",
        );
        const executionResult = await this.executorRuntime.execute(
          task,
          runningAssignment.executor,
        );

        if (executionResult.status !== "succeeded") {
          task.status = this.executorRuntime.classifyFailure(executionResult);
          this.store.assignments.set(
            runningAssignment.assignmentId,
            this.dispatcher.markAssignmentFinished(runningAssignment, "FAILED"),
          );
          this.dispatcher.releaseLease(task.taskId, this.store);
          continue;
        }

        task.status = this.taskStateMachine.transition(
          task.status,
          "DONE",
          "执行器返回成功结果",
        );
        const acceptance = this.evaluator.evaluate(
          task,
          buildAcceptanceInputFromExecution(task, executionResult),
        );
        this.store.acceptanceResults.set(task.taskId, acceptance);
        this.store.assignments.set(
          runningAssignment.assignmentId,
          this.dispatcher.markAssignmentFinished(
            runningAssignment,
            "SUCCEEDED",
          ),
        );
        this.dispatcher.releaseLease(task.taskId, this.store);

        const candidate = this.knowledgeWorkflow.createCandidate(
          task,
          acceptance,
        );
        if (!candidate) {
          continue;
        }
      }
    }

    publishedKnowledge.push(
      ...(await this.knowledgeWorkflow.publishBudgetedCandidates()),
    );
    await this.knowledgeWorkflow.syncArchivedKnowledge();

    return {
      tasks: [...this.store.tasks.values()],
      publishedKnowledge,
      assignments: this.store.assignments.size,
      assignmentRecords: [...this.store.assignments.values()],
      acceptanceResults: [...this.store.acceptanceResults.entries()].map(
        ([taskId, result]) => ({
          taskId,
          result,
        }),
      ),
    };
  }

  private promoteReadyTasks(): void {
    const tasks = [...this.store.tasks.values()];
    const completed = new Set(
      tasks.filter((task) => task.status === "DONE").map((task) => task.taskId),
    );

    for (const task of tasks) {
      if (task.status !== "PLANNED") {
        continue;
      }

      if (task.dependencies.every((dependency) => completed.has(dependency))) {
        task.status = "READY";
      }
    }
  }
}
