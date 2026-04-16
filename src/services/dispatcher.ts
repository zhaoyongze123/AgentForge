import type { TaskUnit } from "../domain/task-unit.js";

export interface DispatchDecision {
  taskId: string;
  executor: "codex" | "claude" | "openhands";
}

export class Dispatcher {
  dispatch(tasks: TaskUnit[]): DispatchDecision[] {
    const completed = new Set(
      tasks.filter((task) => task.status === "DONE").map((task) => task.taskId),
    );

    return tasks
      .filter((task) => task.status === "READY")
      .filter((task) => task.dependencies.every((dependency) => completed.has(dependency) || !tasks.some((task) => task.taskId === dependency)))
      .map((task) => ({
        taskId: task.taskId,
        executor: task.type.startsWith("knowledge_") ? "codex" : "codex",
      }));
  }
}

