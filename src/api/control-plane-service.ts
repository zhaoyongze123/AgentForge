import { AppError } from "../core/errors/app-error.js";
import {
  assertRealExecutionReadiness,
  type AppEnv,
} from "../core/config/env.js";
import type { FeishuCardAction } from "../integrations/feishu-callback.js";
import type { GithubWebhookEvent } from "../integrations/github-webhook.js";
import type { HumanIntervention } from "../domain/incident.js";
import type { KnowledgeRecord } from "../domain/knowledge.js";
import type { EventLogRecord } from "../domain/persistence.js";
import type { Assignment } from "../domain/plan.js";
import type { AuditQuery, AuditSnapshot, MetricsSnapshot } from "../domain/observability.js";
import type { PlanInput, TaskUnit } from "../domain/task-unit.js";
import { GithubAdapter } from "../integrations/github-adapter.js";
import { FileDatabase } from "../persistence/file-database.js";
import {
  AcceptanceRunRepository,
  AssignmentRepository,
  EventLogRepository,
  HumanInterventionRepository,
  KnowledgeRecordRepository,
  PersistenceContext,
  TaskRepository,
} from "../persistence/repositories.js";
import { executeWorkflowRun } from "../orchestration/runtime.js";
import { Evaluator } from "../services/evaluator.js";
import { ObservabilityService } from "../services/observability-service.js";
import { Planner } from "../services/planner.js";
import { BusinessTaskStateMachine } from "../workflow/state-machine.js";

interface CreatePlanInput {
  request: string;
  phase: string;
  projectId?: string;
  constraints?: string[];
  targetModules?: string[];
}

interface HumanGateInput {
  relatedId: string;
  type: HumanIntervention["type"];
  summary: string;
  actor: string;
}

interface HumanGateActionInput {
  action: string;
  actor: string;
  summary?: string;
  relatedId: string;
  taskId?: string;
  planId?: string;
}

export class ControlPlaneService {
  private readonly planner = new Planner();
  private readonly evaluator = new Evaluator();
  private readonly taskStateMachine = new BusinessTaskStateMachine();
  private readonly observabilityService = new ObservabilityService();
  private readonly context: PersistenceContext;
  private readonly taskRepository: TaskRepository;
  private readonly assignmentRepository: AssignmentRepository;
  private readonly acceptanceRunRepository: AcceptanceRunRepository;
  private readonly knowledgeRecordRepository: KnowledgeRecordRepository;
  private readonly humanInterventionRepository: HumanInterventionRepository;
  private readonly eventLogRepository: EventLogRepository;
  private planSequence = 0;

  constructor(private readonly env: AppEnv) {
    this.context = new PersistenceContext(new FileDatabase(env.databaseUrl));
    this.taskRepository = new TaskRepository(this.context);
    this.assignmentRepository = new AssignmentRepository(this.context);
    this.acceptanceRunRepository = new AcceptanceRunRepository(this.context);
    this.knowledgeRecordRepository = new KnowledgeRecordRepository(
      this.context,
    );
    this.humanInterventionRepository = new HumanInterventionRepository(
      this.context,
    );
    this.eventLogRepository = new EventLogRepository(this.context);
  }

  async createPlan(input: CreatePlanInput): Promise<{
    planId: string;
    tasks: TaskUnit[];
  }> {
    const planId = `plan-${Date.now()}-${++this.planSequence}`;
    const planInput: PlanInput = {
      request: input.request,
      phase: input.phase,
      projectId: input.projectId,
      constraints: input.constraints,
      targetModules: input.targetModules,
    };
    const tasks = this.planner.plan(planInput).map((task) => ({
      ...task,
      planId,
    }));

    for (const task of tasks) {
      await this.taskRepository.save(task);
    }

    await this.eventLogRepository.append({
      eventId: `evt-${planId}-created`,
      entityType: "plan",
      entityId: planId,
      eventType: "plan.created",
      payload: {
        input: planInput,
        taskIds: tasks.map((task) => task.taskId),
      },
      createdAt: new Date().toISOString(),
    });

    return { planId, tasks };
  }

  async getTaskGraph(planId: string): Promise<{
    planId: string;
    tasks: TaskUnit[];
  }> {
    const planEvent = await this.requirePlanEvent(planId);
    const taskIds = this.readTaskIds(planEvent);
    const taskSet = new Set(taskIds);
    const tasks = (await this.taskRepository.list()).filter(
      (task) =>
        taskSet.has(task.taskId) &&
        (task.planId === planId || task.planId === undefined),
    );

    return { planId, tasks };
  }

  async runPlan(planId: string): Promise<{
    planId: string;
    taskCount: number;
    assignmentCount: number;
    publishedKnowledgeCount: number;
  }> {
    const planEvent = await this.requirePlanEvent(planId);
    const input = this.readPlanInput(planEvent);
    assertRealExecutionReadiness(this.env);

    await this.eventLogRepository.append({
      eventId: `evt-${planId}-run-started-${Date.now()}`,
      entityType: "plan",
      entityId: planId,
      eventType: "plan.run_started",
      payload: { input },
      createdAt: new Date().toISOString(),
    });

    const result = await executeWorkflowRun(this.env, planId, input);

    for (const task of result.tasks) {
      await this.taskRepository.save({ ...task, planId });
    }
    for (const assignment of result.assignmentRecords) {
      await this.assignmentRepository.save(assignment);
    }
    for (const acceptance of result.acceptanceResults) {
      await this.acceptanceRunRepository.save(
        acceptance.taskId,
        acceptance.result,
      );
    }
    for (const record of result.publishedKnowledge) {
      await this.knowledgeRecordRepository.save(record);
    }

    await this.eventLogRepository.append({
      eventId: `evt-${planId}-run-completed-${Date.now()}`,
      entityType: "plan",
      entityId: planId,
      eventType: "plan.run_completed",
      payload: {
        taskCount: result.tasks.length,
        assignmentCount: result.assignments,
        publishedKnowledgeCount: result.publishedKnowledge.length,
      },
      createdAt: new Date().toISOString(),
    });

    return {
      planId,
      taskCount: result.tasks.length,
      assignmentCount: result.assignments,
      publishedKnowledgeCount: result.publishedKnowledge.length,
    };
  }

  async getPlanStatus(planId: string): Promise<{
    planId: string;
    runStatus: "planned" | "running" | "completed";
    taskCount: number;
    doneTaskCount: number;
  }> {
    const planEvent = await this.requirePlanEvent(planId);
    const events = await this.listPlanEvents(planId);
    const tasks = (await this.getTaskGraph(planId)).tasks;

    const hasCompleted = events.some(
      (event) => event.eventType === "plan.run_completed",
    );
    const hasStarted = events.some(
      (event) => event.eventType === "plan.run_started",
    );

    return {
      planId,
      runStatus: hasCompleted
        ? "completed"
        : hasStarted
          ? "running"
          : "planned",
      taskCount: this.readTaskIds(planEvent).length,
      doneTaskCount: tasks.filter((task) => task.status === "DONE").length,
    };
  }

  async getKnowledgeById(knowledgeId: string): Promise<KnowledgeRecord[]> {
    return (await this.knowledgeRecordRepository.list()).filter(
      (record) => record.knowledgeId === knowledgeId,
    );
  }

  async listKnowledge(options: {
    status?: string;
    scope?: string;
  } = {}): Promise<KnowledgeRecord[]> {
    return (await this.knowledgeRecordRepository.list()).filter((record) => {
      if (options.status && record.status !== options.status) {
        return false;
      }
      if (options.scope && record.scope !== options.scope) {
        return false;
      }
      return true;
    });
  }

  async listPlans(): Promise<
    Array<{
      planId: string;
      phase?: string;
      request?: string;
      runStatus: "planned" | "running" | "completed";
      tasks: TaskUnit[];
    }>
  > {
    const planEvents = (await this.eventLogRepository.list()).filter(
      (event) => event.entityType === "plan" && event.eventType === "plan.created",
    );

    const summaries = [];
    for (const event of planEvents) {
      const status = await this.getPlanStatus(event.entityId);
      const graph = await this.getTaskGraph(event.entityId);
      const input = this.readPlanInput(event);
      summaries.push({
        planId: event.entityId,
        phase: input.phase,
        request: input.request,
        runStatus: status.runStatus,
        tasks: graph.tasks,
      });
    }

    return summaries.sort((left, right) => right.planId.localeCompare(left.planId));
  }

  async getTaskDetail(taskId: string, planId?: string): Promise<{
    task: TaskUnit;
    assignments: Assignment[];
    acceptanceRuns: Awaited<ReturnType<AcceptanceRunRepository["listByTaskId"]>>;
    humanInterventions: HumanIntervention[];
    events: EventLogRecord[];
  }> {
    const task = (await this.taskRepository.list()).find(
      (item) =>
        item.taskId === taskId && (planId === undefined || item.planId === planId),
    );

    if (!task) {
      throw new AppError({
        code: "TASK_NOT_FOUND",
        message: `未找到任务 ${taskId}`,
        details: { taskId, planId },
      });
    }

    return {
      task,
      assignments: (await this.assignmentRepository.list()).filter(
        (item) => item.taskId === taskId,
      ),
      acceptanceRuns: await this.acceptanceRunRepository.listByTaskId(taskId),
      humanInterventions: (await this.humanInterventionRepository.list()).filter(
        (item) => item.relatedId === taskId,
      ),
      events: (await this.eventLogRepository.list()).filter(
        (item) => item.entityId === taskId || item.entityId === (planId ?? ""),
      ),
    };
  }

  async listHumanGates(relatedId?: string): Promise<HumanIntervention[]> {
    const items = await this.humanInterventionRepository.list();
    return relatedId
      ? items.filter((item) => item.relatedId === relatedId)
      : items.sort((left, right) =>
          right.createdAt.localeCompare(left.createdAt),
        );
  }

  async getMetricsSnapshot(): Promise<MetricsSnapshot> {
    return this.observabilityService.buildSnapshot({
      tasks: await this.taskRepository.list(),
      assignments: await this.assignmentRepository.list(),
      acceptanceRuns: await this.acceptanceRunRepository.list(),
      knowledgeRecords: await this.knowledgeRecordRepository.list(),
      eventLogs: await this.eventLogRepository.list(),
    });
  }

  async renderPrometheusMetrics(): Promise<string> {
    return this.observabilityService.renderPrometheus(
      await this.getMetricsSnapshot(),
    );
  }

  async getAuditSnapshot(query: AuditQuery = {}): Promise<AuditSnapshot> {
    return this.observabilityService.buildAuditSnapshot(
      {
        eventLogs: await this.eventLogRepository.list(),
        acceptanceRuns: await this.acceptanceRunRepository.list(),
      },
      query,
    );
  }

  async getAlerts() {
    return (await this.getMetricsSnapshot()).alerts;
  }

  async getPlanProjectId(planId: string): Promise<string | undefined> {
    const planEvent = await this.requirePlanEvent(planId);
    return this.readPlanInput(planEvent).projectId;
  }

  async createHumanGate(input: HumanGateInput): Promise<HumanIntervention> {
    const intervention: HumanIntervention = {
      interventionId: `hi-${Date.now()}`,
      relatedId: input.relatedId,
      type: input.type,
      summary: input.summary,
      actor: input.actor,
      createdAt: new Date().toISOString(),
    };

    await this.humanInterventionRepository.save(intervention);
    await this.eventLogRepository.append({
      eventId: `evt-${intervention.interventionId}`,
      entityType: "human_intervention",
      entityId: intervention.interventionId,
      eventType: "human_intervention.created",
      payload: {
        relatedId: intervention.relatedId,
        type: intervention.type,
      },
      createdAt: intervention.createdAt,
    });

    return intervention;
  }

  async processFeishuCardAction(action: FeishuCardAction): Promise<{
    intervention: HumanIntervention;
    taskUpdated: boolean;
    taskId?: string;
    fromStatus?: string;
    toStatus?: string;
  }> {
    const intervention = await this.createHumanGate({
      relatedId: action.taskId ?? action.relatedId,
      type: toInterventionType(action.action),
      summary: action.summary,
      actor: action.actor,
    });

    const task = await this.resolveTaskForCardAction(action);
    if (!task) {
      await this.eventLogRepository.append({
        eventId: `evt-${intervention.interventionId}-unmatched-${Date.now()}`,
        entityType: "human_intervention",
        entityId: intervention.interventionId,
        eventType: "feishu.card_action.unmatched",
        payload: toEventPayload(action),
        createdAt: new Date().toISOString(),
      });

      return { intervention, taskUpdated: false };
    }

    const fromStatus = task.status ?? "PLANNED";
    const toStatus = toTaskStatus(action.action);
    if (!toStatus) {
      await this.eventLogRepository.append({
        eventId: `evt-${intervention.interventionId}-recorded-${Date.now()}`,
        entityType: "task",
        entityId: task.taskId,
        eventType: "feishu.card_action.recorded",
        payload: toEventPayload(action),
        createdAt: new Date().toISOString(),
      });

      return {
        intervention,
        taskUpdated: false,
        taskId: task.taskId,
        fromStatus,
      };
    }

    task.status = this.taskStateMachine.transition(
      fromStatus,
      toStatus,
      `飞书人工动作：${action.action}`,
    );
    await this.taskRepository.save(task);
    await this.eventLogRepository.append({
      eventId: `evt-${intervention.interventionId}-task-transition-${Date.now()}`,
      entityType: "task",
      entityId: task.taskId,
      eventType: "task.human_gate_resolved",
      payload: {
        action: toEventPayload(action),
        fromStatus,
        toStatus: task.status,
        interventionId: intervention.interventionId,
      },
      createdAt: new Date().toISOString(),
    });

    return {
      intervention,
      taskUpdated: true,
      taskId: task.taskId,
      fromStatus,
      toStatus: task.status,
    };
  }

  async applyHumanGateAction(input: HumanGateActionInput) {
    return this.processFeishuCardAction({
      action: input.action,
      actor: input.actor,
      summary:
        input.summary?.trim() || `控制台人工动作 ${input.action}`,
      relatedId: input.relatedId,
      taskId: input.taskId,
      planId: input.planId,
    });
  }

  async updateTaskStatus(
    taskId: string,
    status: TaskUnit["status"],
    planId?: string,
  ): Promise<TaskUnit> {
    const task = (await this.taskRepository.list()).find(
      (item) =>
        item.taskId === taskId && (planId === undefined || item.planId === planId),
    );

    if (!task) {
      throw new AppError({
        code: "TASK_NOT_FOUND",
        message: `未找到任务 ${taskId}`,
        details: { taskId, planId },
      });
    }

    task.status = status;
    await this.taskRepository.save(task);
    await this.eventLogRepository.append({
      eventId: `evt-${taskId}-status-manual-${Date.now()}`,
      entityType: "task",
      entityId: task.taskId,
      eventType: "task.status_overridden",
      payload: { status, planId: task.planId },
      createdAt: new Date().toISOString(),
    });

    return task;
  }

  async processGithubWebhook(event: GithubWebhookEvent): Promise<{
    taskUpdated: boolean;
    taskId?: string;
    planId?: string;
    acceptanceStatus?: "passed" | "failed" | "blocked";
    checkStatus?: "passed" | "failed" | "blocked";
    pullNumber?: number;
  }> {
    const task = await this.resolveTaskForGithubWebhook(event);
    const logTarget = task
      ? {
          entityType: "task" as const,
          entityId: task.taskId,
        }
      : {
          entityType: "plan" as const,
          entityId: inferPlanIdFromBranch(event.branchName) ?? event.deliveryId,
        };

    const aggregate = event.pullNumber
      ? await this.collectGithubCheckAggregate(event)
      : {
          status: "blocked" as const,
          summary: "Webhook 未提供 pull request 编号，无法聚合 GitHub checks。",
          checks: [],
        };

    await this.eventLogRepository.append({
      eventId: `evt-github-checks-${event.deliveryId}`,
      entityType: logTarget.entityType,
      entityId: logTarget.entityId,
      eventType: task
        ? "github.checks.received"
        : "github.checks.unmatched",
      payload: {
        deliveryId: event.deliveryId,
        event: event.event,
        action: event.action,
        repository: event.repository,
        branchName: event.branchName,
        pullNumber: event.pullNumber,
        checkName: event.checkName,
        status: event.status,
        conclusion: event.conclusion,
        detailsUrl: event.detailsUrl,
        aggregate,
        raw: event.raw,
      },
      createdAt: new Date().toISOString(),
    });

    if (!task) {
      return {
        taskUpdated: false,
        planId: inferPlanIdFromBranch(event.branchName),
        pullNumber: event.pullNumber,
        checkStatus: aggregate.status,
      };
    }

    const acceptance = this.evaluator.evaluate(task, {
      apiChecks: [
        {
          kind: "api_check",
          name: "GitHub PR Checks",
          method: "GITHUB",
          endpoint: buildGithubPullEndpoint(event),
          status: aggregate.status,
          responseSummary: aggregate.summary,
        },
      ],
      notes: [
        `github_delivery_id=${event.deliveryId}`,
        `github_event=${event.event}`,
        `github_action=${event.action ?? ""}`,
        `github_branch=${event.branchName ?? ""}`,
      ],
    });
    await this.acceptanceRunRepository.save(task.taskId, acceptance);

    const nextStatus = mapAcceptanceStatusToTaskStatus(acceptance.status);
    const previousStatus = task.status ?? "PLANNED";
    const taskUpdated = previousStatus !== nextStatus;
    task.status = nextStatus;
    await this.taskRepository.save(task);

    await this.eventLogRepository.append({
      eventId: `evt-github-checks-applied-${event.deliveryId}`,
      entityType: "task",
      entityId: task.taskId,
      eventType: "task.github_checks_updated",
      payload: {
        planId: task.planId,
        taskId: task.taskId,
        pullNumber: event.pullNumber,
        fromStatus: previousStatus,
        toStatus: nextStatus,
        acceptanceStatus: acceptance.status,
        checkStatus: aggregate.status,
        summary: aggregate.summary,
      },
      createdAt: new Date().toISOString(),
    });

    return {
      taskUpdated,
      taskId: task.taskId,
      planId: task.planId,
      acceptanceStatus: acceptance.status,
      checkStatus: aggregate.status,
      pullNumber: event.pullNumber,
    };
  }

  private async resolveTaskForCardAction(
    action: FeishuCardAction,
  ): Promise<TaskUnit | undefined> {
    const tasks = await this.taskRepository.list();

    if (action.planId && action.taskId) {
      return tasks.find(
        (item) => item.planId === action.planId && item.taskId === action.taskId,
      );
    }

    const candidateTaskId = action.taskId ?? action.relatedId;
    const candidates = tasks.filter((item) => item.taskId === candidateTaskId);
    if (candidates.length === 1) {
      return candidates[0];
    }

    if (candidates.length > 1) {
      return this.pickLatestTaskCandidate(candidates);
    }

    return undefined;
  }

  private async resolveTaskForGithubWebhook(
    event: GithubWebhookEvent,
  ): Promise<TaskUnit | undefined> {
    const binding = parseTaskBindingFromBranch(event.branchName);
    if (!binding) {
      return undefined;
    }

    return (await this.taskRepository.list()).find(
      (item) =>
        item.planId === binding.planId && item.taskId === binding.taskId,
    );
  }

  private async collectGithubCheckAggregate(event: GithubWebhookEvent): Promise<{
    status: "passed" | "failed" | "blocked";
    summary: string;
    checks: string[];
  }> {
    if (!this.env.githubToken || !event.pullNumber) {
      return {
        status: "blocked",
        summary: "缺少 GitHub Token 或 pull request 编号，无法聚合 checks。",
        checks: [],
      };
    }

    const github = new GithubAdapter({
      token: this.env.githubToken,
      baseUrl: this.env.githubApiBaseUrl,
    });
    const checks = await github.getPullRequestChecks({
      owner: event.repository.owner,
      repo: event.repository.repo,
      pullNumber: event.pullNumber,
    });
    const renderedChecks = checks.map((check) =>
      `${check.name}:${check.status}:${check.conclusion ?? "null"}`,
    );

    if (checks.length === 0) {
      return {
        status: "blocked",
        summary: "GitHub 未返回任何 checks，保持等待。",
        checks: renderedChecks,
      };
    }

    if (
      checks.some(
        (check) =>
          check.status !== "completed" || check.conclusion === null,
      )
    ) {
      return {
        status: "blocked",
        summary: `GitHub checks 仍在执行：${renderedChecks.join(" | ")}`,
        checks: renderedChecks,
      };
    }

    if (
      checks.some((check) =>
        ["failure", "cancelled"].includes(check.conclusion ?? ""),
      )
    ) {
      return {
        status: "failed",
        summary: `GitHub checks 失败：${renderedChecks.join(" | ")}`,
        checks: renderedChecks,
      };
    }

    return {
      status: "passed",
      summary: `GitHub checks 全部通过：${renderedChecks.join(" | ")}`,
      checks: renderedChecks,
    };
  }

  private pickLatestTaskCandidate(tasks: TaskUnit[]): TaskUnit | undefined {
    return [...tasks].sort((left, right) =>
      String(right.planId ?? "").localeCompare(String(left.planId ?? "")),
    )[0];
  }

  private async requirePlanEvent(planId: string): Promise<EventLogRecord> {
    const event = (await this.listPlanEvents(planId)).find(
      (item) => item.eventType === "plan.created",
    );

    if (!event) {
      throw new AppError({
        code: "TASK_NOT_FOUND",
        message: `未找到计划 ${planId}`,
        details: { planId },
      });
    }

    return event;
  }

  private async listPlanEvents(planId: string): Promise<EventLogRecord[]> {
    return (await this.eventLogRepository.list()).filter(
      (event) => event.entityType === "plan" && event.entityId === planId,
    );
  }

  private readTaskIds(event: EventLogRecord): string[] {
    return Array.isArray(event.payload.taskIds)
      ? (event.payload.taskIds as string[])
      : [];
  }

  private readPlanInput(event: EventLogRecord): PlanInput {
    return event.payload.input as PlanInput;
  }
}

function toInterventionType(action: string): HumanIntervention["type"] {
  if (["approve", "approved", "retry", "resume", "done", "resolve"].includes(action)) {
    return "approval";
  }

  if (["reject", "rejected", "block"].includes(action)) {
    return "rejection";
  }

  return "decision";
}

function toTaskStatus(action: string): TaskUnit["status"] | undefined {
  if (["approve", "approved", "retry", "resume"].includes(action)) {
    return "READY";
  }

  if (["done", "resolve", "resolved"].includes(action)) {
    return "DONE";
  }

  if (["reject", "rejected", "block"].includes(action)) {
    return "FAILED_BLOCKED";
  }

  return undefined;
}

function toEventPayload(action: FeishuCardAction): Record<string, unknown> {
  return {
    action: action.action,
    planId: action.planId,
    taskId: action.taskId,
    relatedId: action.relatedId,
    actor: action.actor,
    summary: action.summary,
  };
}

function parseTaskBindingFromBranch(
  branchName?: string,
): { planId: string; taskId: string } | undefined {
  if (!branchName) {
    return undefined;
  }

  const match = branchName.match(/^task\/(?<planId>[^/]+)\/(?<taskId>[^/]+)$/u);
  if (!match?.groups?.planId || !match.groups.taskId) {
    return undefined;
  }

  return {
    planId: match.groups.planId,
    taskId: match.groups.taskId,
  };
}

function inferPlanIdFromBranch(branchName?: string): string | undefined {
  return parseTaskBindingFromBranch(branchName)?.planId;
}

function buildGithubPullEndpoint(event: GithubWebhookEvent): string {
  if (event.pullNumber) {
    return `/${event.repository.owner}/${event.repository.repo}/pulls/${event.pullNumber}`;
  }

  return `/${event.repository.owner}/${event.repository.repo}/checks`;
}

function mapAcceptanceStatusToTaskStatus(
  status: "passed" | "failed" | "blocked",
): TaskUnit["status"] {
  if (status === "passed") {
    return "DONE";
  }

  if (status === "failed") {
    return "FAILED_BLOCKED";
  }

  return "AWAITING_ACCEPTANCE";
}
