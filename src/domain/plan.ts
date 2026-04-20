export interface Plan {
  planId: string;
  title: string;
  goal: string;
  status: "PLANNED" | "RUNNING" | "DONE" | "FAILED_BLOCKED";
  phases: Phase[];
  taskIds: string[];
}

export interface Phase {
  phaseId: string;
  title: string;
  order: number;
  status: "PLANNED" | "RUNNING" | "DONE" | "FAILED_BLOCKED";
}

export interface Assignment {
  assignmentId: string;
  taskId: string;
  executor: "codex" | "claude" | "openhands";
  status: "ASSIGNED" | "RUNNING" | "SUCCEEDED" | "FAILED";
  startedAt?: string;
  finishedAt?: string;
}
