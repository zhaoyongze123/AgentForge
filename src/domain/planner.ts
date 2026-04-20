import type { TaskType } from "./task-unit.js";

export interface TaskSketch {
  taskId: string;
  title: string;
  goal: string;
  type: TaskType;
  capability: string;
  dependencies: string[];
}

export interface PlannerResult {
  request: string;
  phase: string;
  sketches: TaskSketch[];
}
