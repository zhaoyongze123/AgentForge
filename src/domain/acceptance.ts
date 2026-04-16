export interface KnowledgeSignal {
  reusableScore: number;
  noveltyScore: number;
  confidence: number;
  stabilityScore: number;
  impactScore: number;
  candidateType: "pattern" | "incident" | "sop" | "adr";
  recommendedAction: "ignore" | "capture" | "review" | "archive";
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
}

