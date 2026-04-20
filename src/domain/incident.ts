export interface Incident {
  incidentId: string;
  taskId: string;
  severity: "low" | "medium" | "high" | "critical";
  type:
    | "retryable_failure"
    | "blocked"
    | "environment_error"
    | "knowledge_conflict";
  summary: string;
  evidence: string[];
  requiresHuman: boolean;
}

export interface HumanIntervention {
  interventionId: string;
  relatedId: string;
  type: "approval" | "rejection" | "decision" | "handoff";
  summary: string;
  actor: string;
  createdAt: string;
}
