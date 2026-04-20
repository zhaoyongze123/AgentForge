import type { PlaywrightRunSummary } from "./external.js";

export type AcceptanceCheckStatus = "passed" | "failed" | "blocked";
export type AcceptanceEvidenceKind =
  | "test_command"
  | "build_log"
  | "runtime_log"
  | "api_check"
  | "screenshot"
  | "trace"
  | "playwright"
  | "note";

export interface KnowledgeSignal {
  reusableScore: number;
  noveltyScore: number;
  confidence: number;
  stabilityScore: number;
  impactScore: number;
  candidateType: "pattern" | "incident" | "sop" | "adr";
  recommendedAction: "ignore" | "capture" | "review" | "archive";
}

export interface KnowledgeDraft {
  title: string;
  summary: string;
  recommendation: string;
  constraints: string[];
  sourceRefs: string[];
  derivedFrom: string[];
}

export interface TestCommandEvidence {
  kind: "test_command";
  command: string;
  status: AcceptanceCheckStatus;
  durationMs: number;
  exitCode: number | null;
  stdout: string[];
  stderr: string[];
  timedOut?: boolean;
  cwd?: string;
}

export interface ApiCheckEvidence {
  kind: "api_check";
  name: string;
  method: string;
  endpoint: string;
  status: AcceptanceCheckStatus;
  statusCode?: number;
  responseSummary?: string;
}

export interface ArtifactEvidence {
  kind: "screenshot" | "trace";
  name: string;
  status: AcceptanceCheckStatus;
  path: string;
}

export interface LogEvidence {
  kind: "build_log" | "runtime_log" | "note";
  status: AcceptanceCheckStatus;
  message: string;
}

export interface PlaywrightEvidence {
  kind: "playwright";
  status: AcceptanceCheckStatus;
  summary: PlaywrightRunSummary;
}

export type AcceptanceEvidence =
  | TestCommandEvidence
  | ApiCheckEvidence
  | ArtifactEvidence
  | LogEvidence
  | PlaywrightEvidence;

export interface AcceptanceCheck {
  checkId: string;
  label: string;
  status: AcceptanceCheckStatus;
  summary: string;
  evidenceKeys: string[];
}

export interface AcceptanceEvaluationInput {
  testCommands?: TestCommandEvidence[];
  apiChecks?: ApiCheckEvidence[];
  buildLogs?: string[];
  runtimeLogs?: string[];
  screenshots?: Array<Omit<ArtifactEvidence, "kind">>;
  traces?: Array<Omit<ArtifactEvidence, "kind">>;
  playwright?: PlaywrightRunSummary;
  notes?: string[];
}

export interface AcceptanceEvaluationReport {
  checks: AcceptanceCheck[];
  evidence: AcceptanceEvidence[];
  anomalies: string[];
}

export interface AcceptanceResult {
  status: "passed" | "failed" | "blocked";
  summary: string;
  acceptanceChecks: string[];
  evidence: string[];
  rootCause: string;
  autoFixable: boolean;
  requiresHuman: boolean;
  nextAction: string;
  knowledgeSignal: KnowledgeSignal;
  knowledgeDraft?: KnowledgeDraft;
}
