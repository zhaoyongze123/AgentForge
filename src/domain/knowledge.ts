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
}

export interface KnowledgeCandidate {
  candidateId: string;
  knowledgeId: string;
  scope: string;
  summary: string;
  recommendation: string;
  sourceRefs: string[];
  candidateType: KnowledgeRecord["candidateType"];
  scores: {
    reusableScore: number;
    noveltyScore: number;
    confidence: number;
    stabilityScore: number;
    impactScore: number;
    publishScore: number;
  };
}

export interface BudgetDecision {
  allowed: boolean;
  reason: "publish" | "deferred" | "archived";
}

