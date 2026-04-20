import type { HumanIntervention, Incident } from "./incident.js";
import type { KnowledgeRecord, Mem0Entry } from "./knowledge.js";

export interface GithubRepositoryRef {
  owner: string;
  repo: string;
}

export interface GithubRepositorySummary extends GithubRepositoryRef {
  defaultBranch: string;
  private: boolean;
  url: string;
}

export interface GithubBranchSummary {
  name: string;
  sha: string;
  protected: boolean;
}

export interface GithubPullRequestSummary {
  number: number;
  title: string;
  state: "open" | "closed";
  url: string;
  headRef: string;
  baseRef: string;
  headSha: string;
}

export interface GithubCheckSummary {
  name: string;
  status: "queued" | "in_progress" | "completed";
  conclusion:
    | "success"
    | "failure"
    | "cancelled"
    | "neutral"
    | "skipped"
    | null;
  detailsUrl?: string;
}

export interface GithubCreateBranchInput extends GithubRepositoryRef {
  branch: string;
  sha: string;
}

export interface GithubCreatePullRequestInput extends GithubRepositoryRef {
  title: string;
  body: string;
  head: string;
  base: string;
  draft?: boolean;
}

export interface PlaywrightArtifact {
  name: string;
  contentType: string;
  path: string;
}

export interface PlaywrightRunSummary {
  status: "passed" | "failed";
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  durationMs: number;
  evidence: string[];
  screenshots: PlaywrightArtifact[];
  traces: PlaywrightArtifact[];
}

export interface FeishuMessageReceipt {
  ok: boolean;
  requestId?: string;
  message?: string;
}

export interface FeishuHumanGateCard {
  incident: Incident;
  intervention: HumanIntervention;
  planId?: string;
  taskId?: string;
  actions: Array<{
    text: string;
    value: string;
  }>;
}

export interface Mem0AddMemoryInput {
  messages: Array<{
    role: "user" | "assistant" | "system";
    content: string;
  }>;
  userId: string;
  metadata?: Record<string, unknown>;
}

export interface Mem0SearchResult {
  id: string;
  memory: string;
  score?: number;
  metadata?: Record<string, unknown>;
}

export interface ObsidianSyncResult {
  written: string[];
  archived: string[];
  stale: string[];
}

export interface SyncedKnowledgeRecord extends KnowledgeRecord {
  notePath: string;
}

export interface Mem0Snapshot {
  items: Mem0Entry[];
}
