import type { AcceptanceResult } from "../domain/acceptance.js";
import type {
  BudgetDecision,
  KnowledgeCandidate,
  KnowledgeBudgetWindow,
  Mem0Entry,
  KnowledgeRecord,
} from "../domain/knowledge.js";
import type { Assignment } from "../domain/plan.js";
import type { TaskUnit } from "../domain/task-unit.js";

export class InMemoryStore {
  readonly tasks = new Map<string, TaskUnit>();
  readonly acceptanceResults = new Map<string, AcceptanceResult>();
  readonly knowledgeRecords = new Map<string, KnowledgeRecord[]>();
  readonly candidateQueue: KnowledgeCandidate[] = [];
  readonly publishedInCurrentWindow: KnowledgeCandidate[] = [];
  readonly deferredCandidates: Array<{
    candidate: KnowledgeCandidate;
    decision: BudgetDecision;
  }> = [];
  readonly archivedCandidates: Array<{
    candidate: KnowledgeCandidate;
    decision: BudgetDecision;
  }> = [];
  readonly mem0Entries = new Map<string, Mem0Entry>();
  readonly assignments = new Map<string, Assignment>();
  readonly taskLeases = new Map<string, string>();
  knowledgeBudgetWindow: KnowledgeBudgetWindow | null = null;
}
