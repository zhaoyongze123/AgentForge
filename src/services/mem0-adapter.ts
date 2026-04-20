import type { KnowledgeCandidate, Mem0Entry } from "../domain/knowledge.js";
import { InMemoryStore } from "../runtime/in-memory-store.js";

export class Mem0Adapter {
  constructor(private readonly store: InMemoryStore) {}

  buildCandidateKey(candidate: KnowledgeCandidate): string {
    return `candidate:${candidate.scope}:${candidate.knowledgeId}`;
  }

  buildDeferredKey(candidate: KnowledgeCandidate): string {
    return `deferred:${candidate.scope}:${candidate.knowledgeId}`;
  }

  saveCandidate(candidate: KnowledgeCandidate): Mem0Entry {
    const key = candidate.mem0Key ?? this.buildCandidateKey(candidate);
    const now = new Date().toISOString();
    const existing = this.store.mem0Entries.get(key);
    const entry: Mem0Entry = {
      key,
      scope: candidate.scope,
      kind: "candidate",
      value: {
        candidateId: candidate.candidateId,
        knowledgeId: candidate.knowledgeId,
        summary: candidate.summary,
        recommendation: candidate.recommendation,
        sourceRefs: candidate.sourceRefs,
        scores: candidate.scores,
      },
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    this.store.mem0Entries.set(key, entry);
    return entry;
  }

  saveDeferredCandidate(candidate: KnowledgeCandidate): Mem0Entry {
    const key = this.buildDeferredKey(candidate);
    const now = new Date().toISOString();
    const existing = this.store.mem0Entries.get(key);
    const entry: Mem0Entry = {
      key,
      scope: candidate.scope,
      kind: "deferred",
      value: {
        candidateId: candidate.candidateId,
        knowledgeId: candidate.knowledgeId,
        summary: candidate.summary,
        recommendation: candidate.recommendation,
        sourceRefs: candidate.sourceRefs,
        scores: candidate.scores,
      },
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    this.store.mem0Entries.set(key, entry);
    return entry;
  }

  saveContext(
    scope: string,
    key: string,
    value: Record<string, unknown>,
  ): Mem0Entry {
    const now = new Date().toISOString();
    const existing = this.store.mem0Entries.get(key);
    const entry: Mem0Entry = {
      key,
      scope,
      kind: "context",
      value,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    this.store.mem0Entries.set(key, entry);
    return entry;
  }

  get(key: string): Mem0Entry | undefined {
    return this.store.mem0Entries.get(key);
  }

  listByScope(scope: string): Mem0Entry[] {
    return [...this.store.mem0Entries.values()].filter(
      (entry) => entry.scope === scope,
    );
  }
}
