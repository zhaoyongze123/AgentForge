import { AppError } from "../core/errors/app-error.js";
import type { Assignment } from "../domain/plan.js";
import type { TaskUnit } from "../domain/task-unit.js";

export interface DispatchDecision {
  assignment: Assignment;
  task: TaskUnit;
}

export interface LeaseState {
  assignments: Map<string, Assignment>;
  taskLeases: Map<string, string>;
}

export interface DispatcherOptions {
  forcedExecutor?: Assignment["executor"];
}

const PRIORITY_WEIGHT: Record<TaskUnit["priority"], number> = {
  high: 3,
  medium: 2,
  low: 1,
};

export class Dispatcher {
  constructor(private readonly options: DispatcherOptions = {}) {}

  findPendingTasks(tasks: TaskUnit[]): TaskUnit[] {
    return tasks.filter((task) => task.status === "READY");
  }

  hasSatisfiedDependencies(task: TaskUnit, tasks: TaskUnit[]): boolean {
    const completed = new Set(
      tasks.filter((item) => item.status === "DONE").map((item) => item.taskId),
    );

    return task.dependencies.every((dependency) => completed.has(dependency));
  }

  hasWriteConflict(candidate: TaskUnit, scheduled: TaskUnit[]): boolean {
    return scheduled.some((existing) =>
      candidate.writeSet.some((path) => existing.writeSet.includes(path)),
    );
  }

  selectExecutor(task: TaskUnit): Assignment["executor"] {
    if (this.options.forcedExecutor) {
      return this.options.forcedExecutor;
    }

    switch (task.type) {
      case "acceptance":
      case "knowledge_capture":
      case "knowledge_merge":
      case "knowledge_review":
      case "knowledge_cleanup":
        return "claude";
      case "frontend":
        return "openhands";
      default:
        return "codex";
    }
  }

  sortTasks(tasks: TaskUnit[]): TaskUnit[] {
    return [...tasks].sort((left, right) => {
      const priorityDiff =
        PRIORITY_WEIGHT[right.priority] - PRIORITY_WEIGHT[left.priority];
      if (priorityDiff !== 0) {
        return priorityDiff;
      }

      return left.taskId.localeCompare(right.taskId);
    });
  }

  dispatch(tasks: TaskUnit[], leaseState?: LeaseState): DispatchDecision[] {
    const ordered = this.sortTasks(this.findPendingTasks(tasks));
    const scheduled: TaskUnit[] = [];
    const decisions: DispatchDecision[] = [];
    const state = leaseState ?? {
      assignments: new Map<string, Assignment>(),
      taskLeases: new Map<string, string>(),
    };

    for (const task of ordered) {
      if (!this.hasSatisfiedDependencies(task, tasks)) {
        continue;
      }

      if (this.hasWriteConflict(task, scheduled)) {
        continue;
      }

      if (state.taskLeases.has(task.taskId)) {
        continue;
      }

      const assignment = this.createAssignment(task, this.selectExecutor(task));
      state.assignments.set(assignment.assignmentId, assignment);
      state.taskLeases.set(task.taskId, assignment.assignmentId);
      scheduled.push(task);
      decisions.push({ assignment, task });
    }

    return decisions;
  }

  markAssignmentRunning(assignment: Assignment): Assignment {
    return {
      ...assignment,
      status: "RUNNING",
      startedAt: assignment.startedAt ?? new Date().toISOString(),
    };
  }

  markAssignmentFinished(
    assignment: Assignment,
    status: "SUCCEEDED" | "FAILED",
  ): Assignment {
    return {
      ...assignment,
      status,
      startedAt: assignment.startedAt ?? new Date().toISOString(),
      finishedAt: new Date().toISOString(),
    };
  }

  releaseLease(taskId: string, leaseState: LeaseState): void {
    const assignmentId = leaseState.taskLeases.get(taskId);
    if (!assignmentId) {
      throw new AppError({
        code: "TASK_NOT_FOUND",
        message: "无法释放不存在的任务租约。",
        details: { taskId },
      });
    }

    leaseState.taskLeases.delete(taskId);
  }

  private createAssignment(
    task: TaskUnit,
    executor: Assignment["executor"],
  ): Assignment {
    return {
      assignmentId: `assignment-${task.taskId}`,
      taskId: task.taskId,
      executor,
      status: "ASSIGNED",
    };
  }
}
