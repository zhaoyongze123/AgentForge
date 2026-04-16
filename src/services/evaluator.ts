import { DEFAULT_KNOWLEDGE_THRESHOLDS } from "../config/defaults.js";
import type { AcceptanceResult } from "../domain/acceptance.js";
import type { TaskUnit } from "../domain/task-unit.js";

export class Evaluator {
  evaluate(task: TaskUnit): AcceptanceResult {
    const reusableScore = task.type.startsWith("knowledge_") ? 0.82 : 0.74;
    const noveltyScore = task.type.startsWith("knowledge_") ? 0.61 : 0.45;
    const confidence = 0.91;
    const stabilityScore = 0.88;
    const impactScore = task.priority === "high" ? 0.8 : 0.5;

    const recommendedAction =
      reusableScore >= DEFAULT_KNOWLEDGE_THRESHOLDS.reusableScore &&
      stabilityScore >= DEFAULT_KNOWLEDGE_THRESHOLDS.stabilityScore &&
      confidence >= DEFAULT_KNOWLEDGE_THRESHOLDS.confidence
        ? "capture"
        : "ignore";

    return {
      status: "passed",
      summary: `${task.title} 已满足最小规格验收`,
      acceptanceChecks: task.acceptanceCriteria,
      evidence: ["内存版工作流示例通过"],
      rootCause: "",
      autoFixable: false,
      requiresHuman: false,
      nextAction: "进入知识门控或下游任务",
      knowledgeSignal: {
        reusableScore,
        noveltyScore,
        confidence,
        stabilityScore,
        impactScore,
        candidateType: task.knowledgePolicy?.candidateType ?? "pattern",
        recommendedAction,
      },
    };
  }
}

