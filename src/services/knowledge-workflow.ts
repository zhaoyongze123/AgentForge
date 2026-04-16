import { DEFAULT_KNOWLEDGE_BUDGET, DEFAULT_KNOWLEDGE_THRESHOLDS } from "../config/defaults.js";
import type { AcceptanceResult } from "../domain/acceptance.js";
import type { BudgetDecision, KnowledgeCandidate, KnowledgeRecord } from "../domain/knowledge.js";
import type { TaskUnit } from "../domain/task-unit.js";
import { InMemoryStore } from "../runtime/in-memory-store.js";

export class KnowledgeWorkflow {
  constructor(private readonly store: InMemoryStore) {}

  createCandidate(task: TaskUnit, acceptance: AcceptanceResult): KnowledgeCandidate | null {
    if (acceptance.status !== "passed") {
      return null;
    }

    if (acceptance.knowledgeSignal.recommendedAction !== "capture") {
      return null;
    }

    if (
      acceptance.knowledgeSignal.reusableScore < DEFAULT_KNOWLEDGE_THRESHOLDS.reusableScore ||
      acceptance.knowledgeSignal.stabilityScore < DEFAULT_KNOWLEDGE_THRESHOLDS.stabilityScore ||
      acceptance.knowledgeSignal.confidence < DEFAULT_KNOWLEDGE_THRESHOLDS.confidence
    ) {
      return null;
    }

    const publishScore =
      0.45 * acceptance.knowledgeSignal.reusableScore +
      0.25 * acceptance.knowledgeSignal.noveltyScore +
      0.2 * acceptance.knowledgeSignal.confidence +
      0.1 * acceptance.knowledgeSignal.impactScore;

    const candidate: KnowledgeCandidate = {
      candidateId: `kc-${task.taskId}`,
      knowledgeId: this.buildKnowledgeId(task),
      scope: this.buildScope(task),
      summary: `${task.title} 的稳定经验`,
      recommendation: task.goal,
      sourceRefs: [`task:${task.taskId}`],
      candidateType: acceptance.knowledgeSignal.candidateType,
      scores: {
        reusableScore: acceptance.knowledgeSignal.reusableScore,
        noveltyScore: acceptance.knowledgeSignal.noveltyScore,
        confidence: acceptance.knowledgeSignal.confidence,
        stabilityScore: acceptance.knowledgeSignal.stabilityScore,
        impactScore: acceptance.knowledgeSignal.impactScore,
        publishScore,
      },
    };

    this.store.candidateQueue.push(candidate);
    return candidate;
  }

  evaluateBudget(candidate: KnowledgeCandidate): BudgetDecision {
    if (
      this.store.publishedInCurrentWindow.length >= DEFAULT_KNOWLEDGE_BUDGET.maxWikiWritesPerHour ||
      this.store.candidateQueue.length > DEFAULT_KNOWLEDGE_BUDGET.maxKnowledgeTasksInQueue
    ) {
      return { allowed: false, reason: "deferred" };
    }

    const ranked = [...this.store.candidateQueue].sort(
      (left, right) => right.scores.publishScore - left.scores.publishScore,
    );
    const topCandidates = ranked
      .slice(0, DEFAULT_KNOWLEDGE_BUDGET.topKPerWindow)
      .map((item) => item.candidateId);

    if (!topCandidates.includes(candidate.candidateId)) {
      return { allowed: false, reason: "deferred" };
    }

    return { allowed: true, reason: "publish" };
  }

  publish(candidate: KnowledgeCandidate): KnowledgeRecord {
    const existing = this.store.knowledgeRecords.get(candidate.knowledgeId) ?? [];
    const latestVersion = existing.at(-1)?.version ?? 0;

    const record: KnowledgeRecord = {
      knowledgeId: candidate.knowledgeId,
      version: latestVersion + 1,
      scope: candidate.scope,
      status: "active",
      title: candidate.summary,
      summary: candidate.summary,
      recommendation: candidate.recommendation,
      constraints: [],
      confidence: candidate.scores.confidence,
      candidateType: candidate.candidateType,
      sourceRefs: candidate.sourceRefs,
      derivedFrom: [],
      supersedes: latestVersion > 0 ? [`${candidate.knowledgeId}@${latestVersion}`] : [],
      updatedAt: new Date().toISOString(),
    };

    this.store.knowledgeRecords.set(candidate.knowledgeId, [...existing, record]);
    this.store.publishedInCurrentWindow.push(candidate);
    return record;
  }

  private buildKnowledgeId(task: TaskUnit): string {
    return task.taskId.replace(/^task-/, "").replace(/-/g, ".");
  }

  private buildScope(task: TaskUnit): string {
    if (task.type === "frontend") {
      return "frontend/general";
    }
    if (task.type.startsWith("knowledge_")) {
      return "knowledge/general";
    }
    return "backend/general";
  }
}

