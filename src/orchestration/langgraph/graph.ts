import { Annotation, END, START, StateGraph } from "@langchain/langgraph";

import type { AppEnv } from "../../core/config/env.js";
import { AppError } from "../../core/errors/app-error.js";
import type {
  AcceptanceRunSnapshot,
  OrchestrationGraphState,
} from "../../domain/orchestration.js";
import type { Assignment } from "../../domain/plan.js";
import type { PlanInput, TaskUnit } from "../../domain/task-unit.js";
import { ExecutorRuntime } from "../../executors/runtime.js";
import { InMemoryStore } from "../../runtime/in-memory-store.js";
import { Dispatcher } from "../../services/dispatcher.js";
import { Evaluator } from "../../services/evaluator.js";
import { buildAcceptanceInputFromExecution } from "../../services/execution-acceptance-input.js";
import { KnowledgeWorkflow } from "../../services/knowledge-workflow.js";
import { ObsidianKnowledgeService } from "../../services/obsidian-knowledge.js";
import { Planner } from "../../services/planner.js";
import { BusinessTaskStateMachine } from "../../workflow/state-machine.js";
import type { WorkflowRunResult } from "../../workflow/engine.js";

const GraphStateAnnotation = Annotation.Root({
  planId: Annotation<string>(),
  input: Annotation<PlanInput>(),
  tasks: Annotation<TaskUnit[]>(),
  assignmentRecords: Annotation<Assignment[]>(),
  acceptanceResults: Annotation<AcceptanceRunSnapshot[]>(),
  publishedKnowledge: Annotation<WorkflowRunResult["publishedKnowledge"]>(),
  currentTaskId: Annotation<string | undefined>(),
  currentAssignment: Annotation<Assignment | undefined>(),
  lastExecutionResult: Annotation<
    OrchestrationGraphState["lastExecutionResult"]
  >(),
  runStatus: Annotation<OrchestrationGraphState["runStatus"]>(),
});

export const LANGGRAPH_NODE_NAMES = {
  plan: "plan",
  dispatch: "dispatch",
  execute: "execute",
  evaluate: "evaluate",
  knowledge: "knowledge",
} as const;

export interface LangGraphNodeContext {
  planner: Planner;
  dispatcher: Dispatcher;
  evaluator: Evaluator;
  executorRuntime: ExecutorRuntime;
  taskStateMachine: BusinessTaskStateMachine;
  obsidian: ObsidianKnowledgeService | null;
}

export interface LangGraphRuntimeEnv
  extends Pick<
    AppEnv,
    | "obsidianEnabled"
    | "obsidianRoot"
    | "realExecutor"
    | "executorTimeoutMs"
    | "targetProjectRoot"
    | "githubToken"
    | "githubApiBaseUrl"
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

export function createLangGraphNodeContext(
  env: LangGraphRuntimeEnv,
): LangGraphNodeContext {
  if (env.allowSimulation === false && env.realExecutor !== "codex") {
    throw new AppError({
      code: "CONFIG_INVALID",
      message:
        "当 ALLOW_SIMULATION=false 时，LangGraph 编排必须使用 REAL_EXECUTOR=codex。",
      details: { key: "ALLOW_SIMULATION" },
    });
  }

  const obsidian =
    env.obsidianEnabled && env.obsidianRoot
      ? new ObsidianKnowledgeService(env.obsidianRoot)
      : null;

  return {
    planner: new Planner(),
    dispatcher: new Dispatcher({
      forcedExecutor: env.realExecutor === "codex" ? "codex" : undefined,
    }),
    evaluator: new Evaluator(),
    executorRuntime: new ExecutorRuntime({
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
                    baseUrl: env.githubApiBaseUrl,
                  }
                : undefined,
            }
          : undefined,
    }),
    taskStateMachine: new BusinessTaskStateMachine(),
    obsidian,
  };
}

export function createLangGraph(context: LangGraphNodeContext) {
  return new StateGraph(GraphStateAnnotation)
    .addNode(LANGGRAPH_NODE_NAMES.plan, async (state) => {
      const tasks = context.planner.plan(state.input);
      return {
        tasks,
        runStatus: "running" as const,
      };
    })
    .addNode(LANGGRAPH_NODE_NAMES.dispatch, async (state) => {
      const promotedTasks = promoteReadyTasks(state.tasks);
      const [decision] = context.dispatcher.dispatch(promotedTasks);

      if (!decision) {
        return {
          tasks: promotedTasks,
          currentTaskId: undefined,
          currentAssignment: undefined,
          runStatus: "completed" as const,
        };
      }

      return {
        tasks: promotedTasks,
        currentTaskId: decision.task.taskId,
        currentAssignment: decision.assignment,
        assignmentRecords: upsertAssignment(
          state.assignmentRecords,
          decision.assignment,
        ),
      };
    })
    .addNode(LANGGRAPH_NODE_NAMES.execute, async (state) => {
      if (!state.currentTaskId || !state.currentAssignment) {
        return {};
      }

      const tasks = cloneTasks(state.tasks);
      const task = tasks.find((item) => item.taskId === state.currentTaskId);
      if (!task) {
        return {};
      }

      const runningAssignment = context.dispatcher.markAssignmentRunning(
        state.currentAssignment,
      );
      const assignmentRecords = upsertAssignment(
        state.assignmentRecords,
        runningAssignment,
      );

      task.status = context.taskStateMachine.transition(
        task.status ?? "READY",
        "RUNNING",
        "LangGraph 已派发执行器",
      );

      const executionResult = await context.executorRuntime.execute(
        task,
        runningAssignment.executor,
      );

      if (executionResult.status !== "succeeded") {
        task.status = context.executorRuntime.classifyFailure(executionResult);
        return {
          tasks,
          assignmentRecords: upsertAssignment(
            assignmentRecords,
            context.dispatcher.markAssignmentFinished(
              runningAssignment,
              "FAILED",
            ),
          ),
          lastExecutionResult: executionResult,
        };
      }

      task.status = context.taskStateMachine.transition(
        task.status,
        "DONE",
        "执行器返回成功结果",
      );

      return {
        tasks,
        assignmentRecords: upsertAssignment(
          assignmentRecords,
          context.dispatcher.markAssignmentFinished(
            runningAssignment,
            "SUCCEEDED",
          ),
        ),
        lastExecutionResult: executionResult,
      };
    })
    .addNode(LANGGRAPH_NODE_NAMES.evaluate, async (state) => {
      if (!state.currentTaskId || !state.lastExecutionResult) {
        return {};
      }

      const task = state.tasks.find((item) => item.taskId === state.currentTaskId);
      if (!task) {
        return {};
      }

      const result = context.evaluator.evaluate(
        task,
        buildAcceptanceInputFromExecution(task, state.lastExecutionResult),
      );
      result.evidence = [
        ...result.evidence,
        "LangGraph 节点 evaluate 已完成验收记录",
      ];
      task.status = mapAcceptanceStatusToTaskStatus(result.status);

      return {
        tasks: cloneTasks(state.tasks).map((item) =>
          item.taskId === task.taskId ? { ...task } : item,
        ),
        acceptanceResults: upsertAcceptanceResult(state.acceptanceResults, {
          taskId: task.taskId,
          result,
        }),
      };
    })
    .addNode(LANGGRAPH_NODE_NAMES.knowledge, async (state) => {
      const store = new InMemoryStore();
      for (const task of state.tasks) {
        store.tasks.set(task.taskId, task);
      }
      for (const assignment of state.assignmentRecords) {
        store.assignments.set(assignment.assignmentId, assignment);
      }
      for (const acceptance of state.acceptanceResults) {
        store.acceptanceResults.set(acceptance.taskId, acceptance.result);
      }

      const knowledgeWorkflow = new KnowledgeWorkflow(store, context.obsidian);

      for (const acceptance of state.acceptanceResults) {
        const task = state.tasks.find((item) => item.taskId === acceptance.taskId);
        if (!task) {
          continue;
        }
        knowledgeWorkflow.createCandidate(task, acceptance.result);
      }

      const publishedKnowledge = await knowledgeWorkflow.publishBudgetedCandidates();
      await knowledgeWorkflow.syncArchivedKnowledge();

      return {
        publishedKnowledge,
      };
    })
    .addEdge(START, LANGGRAPH_NODE_NAMES.plan)
    .addEdge(LANGGRAPH_NODE_NAMES.plan, LANGGRAPH_NODE_NAMES.dispatch)
    .addConditionalEdges(LANGGRAPH_NODE_NAMES.dispatch, (state) =>
      state.currentTaskId && state.currentAssignment
        ? LANGGRAPH_NODE_NAMES.execute
        : LANGGRAPH_NODE_NAMES.knowledge,
    )
    .addConditionalEdges(LANGGRAPH_NODE_NAMES.execute, (state) =>
      state.lastExecutionResult?.status === "succeeded"
        ? LANGGRAPH_NODE_NAMES.evaluate
        : LANGGRAPH_NODE_NAMES.dispatch,
    )
    .addEdge(LANGGRAPH_NODE_NAMES.evaluate, LANGGRAPH_NODE_NAMES.dispatch)
    .addEdge(LANGGRAPH_NODE_NAMES.knowledge, END)
    .compile();
}

function mapAcceptanceStatusToTaskStatus(
  status: AcceptanceRunSnapshot["result"]["status"],
): TaskUnit["status"] {
  if (status === "passed") {
    return "DONE";
  }

  if (status === "failed") {
    return "FAILED_BLOCKED";
  }

  return "AWAITING_ACCEPTANCE";
}

export async function runLangGraphPlan(
  input: PlanInput,
  env: LangGraphRuntimeEnv,
  planId = `plan-${Date.now()}`,
): Promise<WorkflowRunResult> {
  const context = createLangGraphNodeContext(env);
  const graph = createLangGraph(context);
  const state = await graph.invoke({
    planId,
    input,
    tasks: [],
    assignmentRecords: [],
    acceptanceResults: [],
    publishedKnowledge: [],
    currentTaskId: undefined,
    currentAssignment: undefined,
    lastExecutionResult: undefined,
    runStatus: "idle",
  });

  return {
    tasks: state.tasks,
    publishedKnowledge: state.publishedKnowledge,
    assignments: state.assignmentRecords.length,
    assignmentRecords: state.assignmentRecords,
    acceptanceResults: state.acceptanceResults,
  };
}

function promoteReadyTasks(tasks: TaskUnit[]): TaskUnit[] {
  const clonedTasks = cloneTasks(tasks);
  const completed = new Set(
    clonedTasks
      .filter((task) => task.status === "DONE")
      .map((task) => task.taskId),
  );

  for (const task of clonedTasks) {
    if (task.status !== "PLANNED") {
      continue;
    }

    if (task.dependencies.every((dependency) => completed.has(dependency))) {
      task.status = "READY";
    }
  }

  return clonedTasks;
}

function cloneTasks(tasks: TaskUnit[]): TaskUnit[] {
  return tasks.map((task) => ({ ...task }));
}

function upsertAssignment(
  assignments: Assignment[],
  assignment: Assignment,
): Assignment[] {
  const next = assignments.filter(
    (item) => item.assignmentId !== assignment.assignmentId,
  );
  next.push(assignment);
  return next;
}

function upsertAcceptanceResult(
  results: AcceptanceRunSnapshot[],
  result: AcceptanceRunSnapshot,
): AcceptanceRunSnapshot[] {
  const next = results.filter((item) => item.taskId !== result.taskId);
  next.push(result);
  return next;
}
