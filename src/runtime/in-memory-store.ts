import type { AcceptanceResult } from "../domain/acceptance.js";
import type { KnowledgeCandidate, KnowledgeRecord } from "../domain/knowledge.js";
import type { TaskUnit } from "../domain/task-unit.js";

export class InMemoryStore {
  readonly tasks = new Map<string, TaskUnit>();
  readonly acceptanceResults = new Map<string, AcceptanceResult>();
  readonly knowledgeRecords = new Map<string, KnowledgeRecord[]>();
  readonly candidateQueue: KnowledgeCandidate[] = [];
  readonly publishedInCurrentWindow: KnowledgeCandidate[] = [];
}

