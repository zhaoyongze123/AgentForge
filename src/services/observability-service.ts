import type { Assignment } from "../domain/plan.js";
import type { TaskUnit } from "../domain/task-unit.js";
import type { AcceptanceRun, EventLogRecord } from "../domain/persistence.js";
import type { KnowledgeRecord } from "../domain/knowledge.js";
import type {
  AlertRecord,
  AuditQuery,
  AuditSnapshot,
  CounterMetric,
  ExecutorMetric,
  MetricsSnapshot,
} from "../domain/observability.js";

const EXECUTOR_COST_PER_SECOND: Record<Assignment["executor"], number> = {
  codex: 0.003,
  claude: 0.0025,
  openhands: 0.0015,
};

export class ObservabilityService {
  buildSnapshot(input: {
    tasks: TaskUnit[];
    assignments: Assignment[];
    acceptanceRuns: AcceptanceRun[];
    knowledgeRecords: KnowledgeRecord[];
    eventLogs: EventLogRecord[];
  }): MetricsSnapshot {
    const taskStatusCounts = countBy(
      input.tasks,
      (task) => task.status ?? "PLANNED",
    );
    const acceptanceStatusCounts = countBy(
      input.acceptanceRuns,
      (run) => run.status,
    );
    const knowledgeStatusCounts = countBy(
      input.knowledgeRecords,
      (record) => record.status,
    );
    const knowledgeEventCounts = countBy(
      input.eventLogs.filter((event) => event.eventType.startsWith("knowledge.")),
      (event) => event.eventType,
    );

    const totalAcceptance = input.acceptanceRuns.length;
    const passedAcceptance = input.acceptanceRuns.filter(
      (run) => run.status === "passed",
    ).length;

    return {
      taskStatusCounts,
      acceptanceStatusCounts,
      knowledgeStatusCounts,
      knowledgeEventCounts,
      businessMetrics: {
        totalPlans: countUnique(
          input.eventLogs.filter((event) => event.entityType === "plan"),
          (event) => event.entityId,
        ),
        totalTasks: input.tasks.length,
        completedTasks: taskStatusCounts.DONE ?? 0,
        blockedTasks:
          (taskStatusCounts.FAILED_BLOCKED ?? 0) +
          (taskStatusCounts.FAILED_RETRYABLE ?? 0),
        waitingHumanTasks: taskStatusCounts.WAITING_HUMAN ?? 0,
        acceptancePassRate:
          totalAcceptance === 0
            ? 0
            : Number((passedAcceptance / totalAcceptance).toFixed(4)),
      },
      executorMetrics: this.computeExecutorMetrics(input.assignments),
      alerts: this.evaluateAlerts(input),
    };
  }

  renderPrometheus(snapshot: MetricsSnapshot): string {
    const metrics: CounterMetric[] = [];

    for (const [status, value] of Object.entries(snapshot.taskStatusCounts)) {
      metrics.push({
        name: "agentforge_tasks_total",
        labels: { status },
        value,
      });
    }

    for (const [status, value] of Object.entries(snapshot.acceptanceStatusCounts)) {
      metrics.push({
        name: "agentforge_acceptance_runs_total",
        labels: { status },
        value,
      });
    }

    for (const [status, value] of Object.entries(snapshot.knowledgeStatusCounts)) {
      metrics.push({
        name: "agentforge_knowledge_records_total",
        labels: { status },
        value,
      });
    }

    for (const [eventType, value] of Object.entries(snapshot.knowledgeEventCounts)) {
      metrics.push({
        name: "agentforge_knowledge_events_total",
        labels: { event_type: eventType },
        value,
      });
    }

    metrics.push({
      name: "agentforge_plans_total",
      value: snapshot.businessMetrics.totalPlans,
    });
    metrics.push({
      name: "agentforge_tasks_completed_total",
      value: snapshot.businessMetrics.completedTasks,
    });
    metrics.push({
      name: "agentforge_tasks_blocked_total",
      value: snapshot.businessMetrics.blockedTasks,
    });
    metrics.push({
      name: "agentforge_tasks_waiting_human_total",
      value: snapshot.businessMetrics.waitingHumanTasks,
    });
    metrics.push({
      name: "agentforge_acceptance_pass_rate",
      value: snapshot.businessMetrics.acceptancePassRate,
    });

    for (const executorMetric of snapshot.executorMetrics) {
      metrics.push({
        name: "agentforge_executor_runs_total",
        labels: { executor: executorMetric.executor },
        value: executorMetric.runs,
      });
      metrics.push({
        name: "agentforge_executor_duration_ms_total",
        labels: { executor: executorMetric.executor },
        value: executorMetric.durationMs,
      });
      metrics.push({
        name: "agentforge_executor_estimated_cost_usd_total",
        labels: { executor: executorMetric.executor },
        value: Number(executorMetric.estimatedCostUsd.toFixed(6)),
      });
    }

    for (const alert of snapshot.alerts) {
      metrics.push({
        name: "agentforge_alerts_total",
        labels: { code: alert.code, severity: alert.severity },
        value: 1,
      });
    }

    return metrics
      .map((metric) => {
        const labels = metric.labels
          ? `{${Object.entries(metric.labels)
              .map(([key, value]) => `${key}="${escapeLabel(value)}"`)
              .join(",")}}`
          : "";
        return `${metric.name}${labels} ${metric.value}`;
      })
      .join("\n");
  }

  buildAuditSnapshot(input: {
    eventLogs: EventLogRecord[];
    acceptanceRuns: AcceptanceRun[];
  }, query: AuditQuery = {}): AuditSnapshot {
    const events = input.eventLogs
      .filter((event) =>
        query.entityType ? event.entityType === query.entityType : true,
      )
      .filter((event) => (query.entityId ? event.entityId === query.entityId : true))
      .filter((event) => (query.eventType ? event.eventType === query.eventType : true))
      .slice(-(query.limit ?? 100))
      .reverse();

    const acceptanceRuns = input.acceptanceRuns
      .filter((run) => (query.entityId ? run.taskId === query.entityId : true))
      .slice(-(query.limit ?? 100))
      .reverse();

    return { events, acceptanceRuns };
  }

  evaluateAlerts(input: {
    tasks: TaskUnit[];
    eventLogs: EventLogRecord[];
  }): AlertRecord[] {
    const alerts: AlertRecord[] = [];

    const blockedTasks = input.tasks.filter(
      (task) => task.status === "FAILED_BLOCKED",
    );
    if (blockedTasks.length >= 2) {
      alerts.push({
        code: "blocked_task_spike",
        severity: "warning",
        summary: "blocked 任务数量上升",
        evidence: blockedTasks.map((task) => task.taskId),
      });
    }

    const deferredEvents = input.eventLogs.filter(
      (event) => event.eventType === "knowledge_budget_deferred",
    );
    if (deferredEvents.length >= 3) {
      alerts.push({
        code: "knowledge_budget_pressure",
        severity: "warning",
        summary: "知识预算命中次数过高",
        evidence: deferredEvents.map((event) => event.eventId),
      });
    }

    const unmatchedFeishu = input.eventLogs.filter(
      (event) => event.eventType === "feishu.card_action.unmatched",
    );
    if (unmatchedFeishu.length > 0) {
      alerts.push({
        code: "feishu_action_unmatched",
        severity: "critical",
        summary: "飞书卡片动作存在未命中任务的情况",
        evidence: unmatchedFeishu.map((event) => event.eventId),
      });
    }

    return alerts;
  }

  private computeExecutorMetrics(assignments: Assignment[]): ExecutorMetric[] {
    const grouped = new Map<Assignment["executor"], ExecutorMetric>();
    for (const assignment of assignments) {
      const current = grouped.get(assignment.executor) ?? {
        executor: assignment.executor,
        runs: 0,
        durationMs: 0,
        estimatedCostUsd: 0,
      };
      current.runs += 1;
      const durationMs = this.assignmentDurationMs(assignment);
      current.durationMs += durationMs;
      current.estimatedCostUsd +=
        (durationMs / 1000) * EXECUTOR_COST_PER_SECOND[assignment.executor];
      grouped.set(assignment.executor, current);
    }
    return [...grouped.values()];
  }

  private assignmentDurationMs(assignment: Assignment): number {
    if (!assignment.startedAt || !assignment.finishedAt) {
      return 0;
    }
    const started = Date.parse(assignment.startedAt);
    const finished = Date.parse(assignment.finishedAt);
    if (Number.isNaN(started) || Number.isNaN(finished) || finished < started) {
      return 0;
    }
    return finished - started;
  }
}

function countBy<T>(
  items: T[],
  keySelector: (item: T) => string,
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of items) {
    const key = keySelector(item);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

function countUnique<T>(items: T[], keySelector: (item: T) => string): number {
  return new Set(items.map(keySelector)).size;
}

function escapeLabel(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll("\"", "\\\"");
}
