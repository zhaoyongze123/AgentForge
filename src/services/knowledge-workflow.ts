import {
  DEFAULT_KNOWLEDGE_BUDGET,
  DEFAULT_KNOWLEDGE_THRESHOLDS,
} from "../config/defaults.js";
import type {
  Mem0PrimaryPathConfig,
} from "../core/config/env.js";
import { resolveMem0PrimaryPathConfig } from "../core/config/env.js";
import { AppError } from "../core/errors/app-error.js";
import type { AcceptanceResult } from "../domain/acceptance.js";
import type {
  BudgetDecision,
  KnowledgeCandidate,
  KnowledgeBudgetPolicy,
  KnowledgeBudgetWindow,
  KnowledgeRecord,
} from "../domain/knowledge.js";
import type { TaskUnit } from "../domain/task-unit.js";
import { Mem0HttpAdapter } from "../integrations/mem0-http-adapter.js";
import { InMemoryStore } from "../runtime/in-memory-store.js";
import { KnowledgeRegistry } from "./knowledge-registry.js";
import { ObsidianKnowledgeService } from "./obsidian-knowledge.js";

export interface KnowledgeWorkflowOptions {
  mem0?: Mem0HttpAdapter;
  mem0Config?: Partial<Mem0PrimaryPathConfig>;
  envSource?: NodeJS.ProcessEnv;
}

export class KnowledgeWorkflow {
  private readonly registry = new KnowledgeRegistry();
  private readonly mem0?: Mem0HttpAdapter;
  private readonly mem0UserId?: string;
  private readonly mem0InitError?: AppError;
  private readonly budgetPolicy: KnowledgeBudgetPolicy =
    DEFAULT_KNOWLEDGE_BUDGET;

  constructor(
    private readonly store: InMemoryStore,
    private readonly obsidian: ObsidianKnowledgeService | null = null,
    options: KnowledgeWorkflowOptions = {},
  ) {
    try {
      if (options.mem0) {
        this.mem0 = options.mem0;
        this.mem0UserId = resolveMem0UserId(
          options.envSource,
          options.mem0Config,
        );
      } else {
        const config = resolveMem0PrimaryPathConfig(
          options.envSource,
          options.mem0Config,
        );
        this.mem0 = new Mem0HttpAdapter({
          baseUrl: config.mem0BaseUrl,
          apiKey: config.mem0ApiKey,
        });
        this.mem0UserId = config.mem0UserId;
      }
    } catch (error) {
      this.mem0InitError = toAppError(error, "mem0 主路径初始化失败。");
    }
  }

  createCandidate(
    task: TaskUnit,
    acceptance: AcceptanceResult,
  ): KnowledgeCandidate | null {
    if (acceptance.status !== "passed") {
      return null;
    }

    if (acceptance.knowledgeSignal.recommendedAction !== "capture") {
      return null;
    }

    if (
      acceptance.knowledgeSignal.reusableScore <
        DEFAULT_KNOWLEDGE_THRESHOLDS.reusableScore ||
      acceptance.knowledgeSignal.stabilityScore <
        DEFAULT_KNOWLEDGE_THRESHOLDS.stabilityScore ||
      acceptance.knowledgeSignal.confidence <
        DEFAULT_KNOWLEDGE_THRESHOLDS.confidence
    ) {
      return null;
    }

    const publishScore =
      0.45 * acceptance.knowledgeSignal.reusableScore +
      0.25 * acceptance.knowledgeSignal.noveltyScore +
      0.2 * acceptance.knowledgeSignal.confidence +
      0.1 * acceptance.knowledgeSignal.impactScore;
    const draft = acceptance.knowledgeDraft;

    const candidate = this.registry.normalizeCandidate({
      candidateId: `kc-${task.taskId}`,
      knowledgeId: this.buildKnowledgeId(task),
      scope: this.buildScope(task),
      summary: draft?.summary ?? `${task.title} 的稳定经验`,
      recommendation: draft?.recommendation ?? task.goal,
      sourceRefs: draft?.sourceRefs ?? [`task:${task.taskId}`],
      candidateType: acceptance.knowledgeSignal.candidateType,
      createdAt: new Date().toISOString(),
      scores: {
        reusableScore: acceptance.knowledgeSignal.reusableScore,
        noveltyScore: acceptance.knowledgeSignal.noveltyScore,
        confidence: acceptance.knowledgeSignal.confidence,
        stabilityScore: acceptance.knowledgeSignal.stabilityScore,
        impactScore: acceptance.knowledgeSignal.impactScore,
        publishScore,
      },
    });

    this.persistCandidateToMem0(candidate);
    this.registry.recordCandidateCreated(candidate);
    this.store.candidateQueue.push(candidate);
    return candidate;
  }

  evaluateBudget(candidate: KnowledgeCandidate): BudgetDecision {
    const activeWindow = this.ensureActiveWindow(candidate.createdAt);
    const rankedQueue = this.rankCandidates();
    const queuePosition =
      rankedQueue.findIndex(
        (item) => item.candidateId === candidate.candidateId,
      ) + 1;
    const scopePolicy = this.resolveScopePolicy(candidate.scope);
    const scopePublished = activeWindow.publishedByScope[candidate.scope] ?? 0;
    const belowArchiveThreshold =
      candidate.scores.publishScore <
      this.budgetPolicy.archiveBelowPublishScore;

    if (
      this.store.candidateQueue.length >
      this.budgetPolicy.maxKnowledgeTasksInQueue
    ) {
      if (belowArchiveThreshold) {
        return this.archiveDecision(candidate, queuePosition, activeWindow);
      }
      return this.deferDecision(candidate, queuePosition, activeWindow);
    }

    if (activeWindow.publishedCount >= this.budgetPolicy.maxWikiWritesPerHour) {
      if (belowArchiveThreshold) {
        return this.archiveDecision(candidate, queuePosition, activeWindow);
      }
      return this.deferDecision(candidate, queuePosition, activeWindow);
    }

    if (scopePublished >= scopePolicy.maxWikiWritesPerHour) {
      if (belowArchiveThreshold) {
        return this.archiveDecision(candidate, queuePosition, activeWindow);
      }
      return this.deferDecision(candidate, queuePosition, activeWindow);
    }

    const scopedTopK = rankedQueue
      .filter((item) => item.scope === candidate.scope)
      .slice(0, scopePolicy.topKPerWindow)
      .map((item) => item.candidateId);

    if (!scopedTopK.includes(candidate.candidateId)) {
      if (belowArchiveThreshold) {
        return this.archiveDecision(candidate, queuePosition, activeWindow);
      }
      return this.deferDecision(candidate, queuePosition, activeWindow);
    }

    const globalTopK = rankedQueue
      .slice(0, this.budgetPolicy.topKPerWindow)
      .map((item) => item.candidateId);

    if (!globalTopK.includes(candidate.candidateId)) {
      if (belowArchiveThreshold) {
        return this.archiveDecision(candidate, queuePosition, activeWindow);
      }
      return this.deferDecision(candidate, queuePosition, activeWindow);
    }

    return {
      allowed: true,
      reason: "publish",
      queuePosition,
      publishScore: candidate.scores.publishScore,
      activeWindow,
    };
  }

  async publish(candidate: KnowledgeCandidate): Promise<KnowledgeRecord | null> {
    const acceptance = this.store.acceptanceResults.get(
      candidate.candidateId.replace(/^kc-/, ""),
    );
    const records = [...this.store.knowledgeRecords.values()].flat();
    const analysis = this.registry.analyzeCandidate(candidate, records);
    const decision = this.registry.decideReview(analysis);

    if (decision.status === "archive" && analysis.duplicateOf) {
      return null;
    }

    if (decision.status === "review") {
      const conflictSource =
        analysis.idConflictWith ?? analysis.scopeConflictWith;
      if (conflictSource) {
        const conflicted = this.registry.transitionStatus(
          conflictSource,
          "conflicted",
          decision.reason,
        );
        const siblings =
          this.store.knowledgeRecords.get(conflictSource.knowledgeId) ?? [];
        this.store.knowledgeRecords.set(
          conflictSource.knowledgeId,
          siblings.map((record) =>
            record.version === conflicted.version ? conflicted : record,
          ),
        );
        return null;
      }
    }

    const existing =
      this.store.knowledgeRecords.get(
        analysis.normalizedCandidate.knowledgeId,
      ) ?? [];
    const nextVersion = this.registry.nextVersion(
      analysis.normalizedCandidate.knowledgeId,
      existing,
    );

    const record: KnowledgeRecord = {
      knowledgeId: analysis.normalizedCandidate.knowledgeId,
      version: nextVersion,
      scope: analysis.normalizedCandidate.scope,
      status: "active",
      title:
        acceptance?.knowledgeDraft?.title ??
        analysis.normalizedCandidate.summary,
      summary: analysis.normalizedCandidate.summary,
      recommendation: analysis.normalizedCandidate.recommendation,
      constraints: acceptance?.knowledgeDraft?.constraints ?? [],
      confidence: analysis.normalizedCandidate.scores.confidence,
      candidateType: analysis.normalizedCandidate.candidateType,
      sourceRefs: analysis.normalizedCandidate.sourceRefs,
      derivedFrom: acceptance?.knowledgeDraft?.derivedFrom ?? [],
      supersedes:
        existing.length > 0
          ? [
              `${analysis.normalizedCandidate.knowledgeId}@${
                existing.at(-1)?.version ?? 0
              }`,
            ]
          : [],
      updatedAt: new Date().toISOString(),
      mem0Key: analysis.normalizedCandidate.mem0Key,
    };

    const notePath = await this.writePublishedRecord(candidate, record);
    record.notePath = notePath;

    const updatedExisting = this.registry.applySupersedes(existing, record);
    this.store.knowledgeRecords.set(analysis.normalizedCandidate.knowledgeId, [
      ...updatedExisting,
      record,
    ]);
    this.store.publishedInCurrentWindow.push(analysis.normalizedCandidate);
    this.incrementBudgetWindow(analysis.normalizedCandidate.scope);
    this.registry.recordPublished(record);
    return record;
  }

  handleBudgetRejection(
    candidate: KnowledgeCandidate,
    decision: BudgetDecision,
  ): void {
    this.persistDeferredCandidateToMem0(candidate, decision);

    if (decision.reason === "archived") {
      this.store.archivedCandidates.push({ candidate, decision });
      return;
    }

    this.store.deferredCandidates.push({ candidate, decision });
  }

  async publishBudgetedCandidates(): Promise<KnowledgeRecord[]> {
    const publishedRecords: KnowledgeRecord[] = [];

    for (const candidate of this.rankCandidates()) {
      const decision = this.evaluateBudget(candidate);
      if (!decision.allowed) {
        this.handleBudgetRejection(candidate, decision);
        continue;
      }

      const publishedRecord = await this.publish(candidate);
      if (publishedRecord) {
        publishedRecords.push(publishedRecord);
      }
    }

    return publishedRecords;
  }

  async syncArchivedKnowledge(): Promise<KnowledgeRecord[]> {
    const archivedRecords: KnowledgeRecord[] = [];
    const pendingArchive = [...this.store.knowledgeRecords.values()]
      .flat()
      .filter((record) => record.status === "archived" && Boolean(record.notePath));

    if (pendingArchive.length === 0) {
      return [];
    }

    const obsidian = this.requireObsidian();

    for (const record of pendingArchive) {
      try {
        record.notePath = await obsidian.archiveRecord(record);
        archivedRecords.push(record);
      } catch (error) {
        throw toAppError(error, "知识归档写入 Obsidian 失败，知识流程已 blocked。", {
          knowledgeId: record.knowledgeId,
          version: record.version,
          notePath: record.notePath,
        });
      }
    }

    return archivedRecords;
  }

  private buildKnowledgeId(task: TaskUnit): string {
    return task.taskId.replace(/^task-/, "").replace(/-/g, ".");
  }

  private persistCandidateToMem0(candidate: KnowledgeCandidate): void {
    const mem0 = this.requireMem0();

    try {
      const result = mem0.adapter.saveCandidateSync(candidate, mem0.userId);
      candidate.mem0Key = result.id;
    } catch (error) {
      throw toAppError(error, "知识候选写入 mem0 失败，知识流程已 blocked。", {
        candidateId: candidate.candidateId,
        knowledgeId: candidate.knowledgeId,
        mem0RecordKind: "candidate",
      });
    }
  }

  private persistDeferredCandidateToMem0(
    candidate: KnowledgeCandidate,
    decision: BudgetDecision,
  ): void {
    const mem0 = this.requireMem0();

    try {
      const result = mem0.adapter.saveDeferredCandidateSync(
        candidate,
        mem0.userId,
        decision,
      );
      candidate.mem0Key = result.id;
    } catch (error) {
      throw toAppError(error, "知识 deferred 记录写入 mem0 失败，知识流程已 blocked。", {
        candidateId: candidate.candidateId,
        knowledgeId: candidate.knowledgeId,
        mem0RecordKind: "deferred",
        decisionReason: decision.reason,
      });
    }
  }

  private requireMem0(): { adapter: Mem0HttpAdapter; userId: string } {
    if (this.mem0InitError) {
      throw toAppError(
        this.mem0InitError,
        "知识流程 blocked：mem0 HTTP 主路径配置缺失或不可用。",
      );
    }

    if (!this.mem0 || !this.mem0UserId) {
      throw new AppError({
        code: "CONFIG_MISSING",
        message: "知识流程 blocked：mem0 HTTP 主路径未就绪。",
      });
    }

    return {
      adapter: this.mem0,
      userId: this.mem0UserId,
    };
  }

  private requireObsidian(): ObsidianKnowledgeService {
    if (!this.obsidian) {
      throw new AppError({
        code: "CONFIG_MISSING",
        message: "知识流程 blocked：Obsidian 主库未就绪。",
      });
    }

    return this.obsidian;
  }

  private async writePublishedRecord(
    candidate: KnowledgeCandidate,
    record: KnowledgeRecord,
  ): Promise<string> {
    if (!record.mem0Key) {
      throw new AppError({
        code: "CONFIG_INVALID",
        message: "知识发布 blocked：缺少 mem0 发布关联 id。",
        details: {
          candidateId: candidate.candidateId,
          knowledgeId: candidate.knowledgeId,
        },
      });
    }

    const obsidian = this.requireObsidian();

    try {
      return await obsidian.writeRecord(record);
    } catch (error) {
      throw toAppError(error, "知识发布写入 Obsidian 失败，知识流程已 blocked。", {
        candidateId: candidate.candidateId,
        knowledgeId: candidate.knowledgeId,
        mem0Key: record.mem0Key,
      });
    }
  }

  private rankCandidates(): KnowledgeCandidate[] {
    const queue = [...this.store.candidateQueue];

    if (!this.budgetPolicy.priorityQueue) {
      return queue;
    }

    return queue.sort((left, right) => {
      if (right.scores.publishScore !== left.scores.publishScore) {
        return right.scores.publishScore - left.scores.publishScore;
      }

      return (left.createdAt ?? "").localeCompare(right.createdAt ?? "");
    });
  }

  private ensureActiveWindow(referenceTime?: string): KnowledgeBudgetWindow {
    const now = referenceTime ? new Date(referenceTime) : new Date();
    const currentHour = new Date(now);
    currentHour.setMinutes(0, 0, 0);
    const windowStart = currentHour.toISOString();
    const nextHour = new Date(currentHour);
    nextHour.setHours(nextHour.getHours() + 1);
    const windowEnd = nextHour.toISOString();

    if (
      !this.store.knowledgeBudgetWindow ||
      this.store.knowledgeBudgetWindow.windowStart !== windowStart
    ) {
      this.store.knowledgeBudgetWindow = {
        windowStart,
        windowEnd,
        publishedCount: 0,
        publishedByScope: {},
      };
      this.store.publishedInCurrentWindow.length = 0;
    }

    return this.store.knowledgeBudgetWindow;
  }

  private incrementBudgetWindow(scope: string): void {
    const window = this.ensureActiveWindow();
    window.publishedCount += 1;
    window.publishedByScope[scope] = (window.publishedByScope[scope] ?? 0) + 1;
  }

  private resolveScopePolicy(scope: string): {
    maxWikiWritesPerHour: number;
    topKPerWindow: number;
  } {
    return (
      this.budgetPolicy.scopeLimits[scope] ?? {
        maxWikiWritesPerHour: this.budgetPolicy.maxWikiWritesPerHour,
        topKPerWindow: this.budgetPolicy.topKPerWindow,
      }
    );
  }

  private deferDecision(
    candidate: KnowledgeCandidate,
    queuePosition: number,
    activeWindow: KnowledgeBudgetWindow,
  ): BudgetDecision {
    return {
      allowed: false,
      reason: "deferred",
      queuePosition,
      publishScore: candidate.scores.publishScore,
      activeWindow,
    };
  }

  private archiveDecision(
    candidate: KnowledgeCandidate,
    queuePosition: number,
    activeWindow: KnowledgeBudgetWindow,
  ): BudgetDecision {
    return {
      allowed: false,
      reason: "archived",
      queuePosition,
      publishScore: candidate.scores.publishScore,
      activeWindow,
    };
  }

  private buildScope(task: TaskUnit): string {
    const segments = task.taskId.split("-").slice(0, 3).join("/");

    if (task.type === "frontend") {
      return `frontend/${segments}`;
    }
    if (task.type === "integration") {
      return `integration/${segments}`;
    }
    if (task.type === "acceptance") {
      return `acceptance/${segments}`;
    }
    if (task.type.startsWith("knowledge_")) {
      return `knowledge/${segments}`;
    }
    return `backend/${segments}`;
  }
}

function toAppError(
  error: unknown,
  message: string,
  details?: Record<string, unknown>,
): AppError {
  if (error instanceof AppError) {
    return new AppError({
      code: error.code,
      message,
      details: {
        ...(error.details ?? {}),
        ...(details ?? {}),
      },
      cause: error,
    });
  }

  return new AppError({
    code: "EXTERNAL_UNAVAILABLE",
    message,
    details,
    cause: error,
  });
}

function resolveMem0UserId(
  source: NodeJS.ProcessEnv | undefined,
  overrides: Partial<Mem0PrimaryPathConfig> | undefined,
): string {
  const mem0UserId = overrides?.mem0UserId ?? source?.MEM0_USER_ID;

  if (!mem0UserId) {
    throw new AppError({
      code: "CONFIG_MISSING",
      message: "知识流程主路径需要 mem0 userId 配置。",
      details: {
        missingKeys: ["MEM0_USER_ID"],
      },
    });
  }

  return mem0UserId;
}
