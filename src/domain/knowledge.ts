export type KnowledgeStatus =
  | "candidate"
  | "active"
  | "deprecated"
  | "archived"
  | "conflicted";

export interface KnowledgeRecord {
  knowledgeId: string;
  version: number;
  scope: string;
  status: KnowledgeStatus;
  title: string;
  summary: string;
  recommendation: string;
  constraints: string[];
  confidence: number;
  candidateType: "pattern" | "incident" | "sop" | "adr";
  sourceRefs: string[];
  derivedFrom: string[];
  supersedes: string[];
  updatedAt: string;
  supersededBy?: string;
  notePath?: string;
}

export interface KnowledgeCandidate {
  candidateId: string;
  knowledgeId: string;
  scope: string;
  summary: string;
  recommendation: string;
  sourceRefs: string[];
  candidateType: KnowledgeRecord["candidateType"];
  normalizedKey?: string;
  createdAt?: string;
  mem0Key?: string;
  scores: {
    reusableScore: number;
    noveltyScore: number;
    confidence: number;
    stabilityScore: number;
    impactScore: number;
    publishScore: number;
  };
}

export interface KnowledgeBudgetPolicy {
  maxWikiWritesPerHour: number;
  maxKnowledgeTasksInQueue: number;
  topKPerWindow: number;
  priorityQueue: boolean;
  archiveBelowPublishScore: number;
  scopeLimits: Record<
    string,
    {
      maxWikiWritesPerHour: number;
      topKPerWindow: number;
    }
  >;
}

export interface KnowledgeBudgetWindow {
  windowStart: string;
  windowEnd: string;
  publishedCount: number;
  publishedByScope: Record<string, number>;
}

export interface BudgetDecision {
  allowed: boolean;
  reason: "publish" | "deferred" | "archived";
  queuePosition: number;
  publishScore: number;
  activeWindow: KnowledgeBudgetWindow;
}

export interface KnowledgeAuditEntry {
  auditId: string;
  knowledgeId: string;
  action:
    | "candidate_created"
    | "duplicate_detected"
    | "conflict_detected"
    | "published"
    | "deprecated"
    | "archived"
    | "review_requested";
  summary: string;
  timestamp: string;
}

export interface KnowledgeReviewDecision {
  status: "publish" | "review" | "archive";
  reason: string;
}

export interface Mem0Entry {
  key: string;
  scope: string;
  kind: "candidate" | "deferred" | "context" | "cache";
  value: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface ObsidianNoteMapping {
  noteType: "pattern" | "incident" | "sop" | "adr";
  relativePath: string;
  title: string;
}
