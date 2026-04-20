import assert from "node:assert/strict";
import test from "node:test";

import { InMemoryStore } from "../src/runtime/in-memory-store.js";
import { KnowledgeWorkflow } from "../src/services/knowledge-workflow.js";
import type { AcceptanceResult } from "../src/domain/acceptance.js";
import type { KnowledgeRecord } from "../src/domain/knowledge.js";
import type { TaskUnit } from "../src/domain/task-unit.js";
import type { Mem0HttpAdapter } from "../src/integrations/mem0-http-adapter.js";
import type { ObsidianKnowledgeService } from "../src/services/obsidian-knowledge.js";

function createTask(index: number): TaskUnit {
  return {
    planId: "knowledge-overload",
    taskId: `backend-bulk-${index}`,
    title: `bulk-${index}`,
    goal: `bulk goal ${index}`,
    type: "backend",
    phase: "bulk",
    priority: "high",
    dependencies: [],
    readSet: ["src/**"],
    writeSet: ["src/**"],
    inputs: ["bulk"],
    deliverables: ["artifact"],
    acceptanceCriteria: ["criteria"],
    testCommands: ["npm test"],
    handoffTo: "acceptance-agent",
    blockedConditions: [],
    autoFixPolicy: [],
    humanGate: { required: false },
    knowledgePolicy: {
      enabled: true,
      candidateType: "pattern",
      reusableScoreThreshold: 0.7,
      stabilityScoreThreshold: 0.75,
      confidenceThreshold: 0.8,
    },
    status: "DONE",
  };
}

function createAcceptance(index: number): AcceptanceResult {
  return {
    status: "passed",
    summary: `accepted ${index}`,
    acceptanceChecks: ["ok"],
    evidence: ["ok"],
    rootCause: "",
    autoFixable: false,
    requiresHuman: false,
    nextAction: "capture",
    knowledgeSignal: {
      reusableScore: 0.95,
      noveltyScore: Math.max(0.1, 0.9 - index * 0.01),
      confidence: 0.92,
      stabilityScore: 0.9,
      impactScore: 0.8,
      candidateType: "pattern",
      recommendedAction: "capture",
    },
  };
}

function createWorkflow(store: InMemoryStore): KnowledgeWorkflow {
  const mem0 = {
    saveCandidateSync(task: { candidateId: string; scope: string; knowledgeId: string }) {
      return {
        id: `mem0-candidate-${task.candidateId}`,
        key: `candidate:${task.scope}:${task.knowledgeId}`,
      };
    },
    saveDeferredCandidateSync(task: { candidateId: string; scope: string; knowledgeId: string }) {
      return {
        id: `mem0-deferred-${task.candidateId}`,
        key: `deferred:${task.scope}:${task.knowledgeId}`,
      };
    },
  } as unknown as Mem0HttpAdapter;
  const obsidian = {
    async writeRecord(record: KnowledgeRecord) {
      return `/tmp/agentforge-vault/${record.knowledgeId}.md`;
    },
  } as unknown as ObsidianKnowledgeService;

  return new KnowledgeWorkflow(store, obsidian, {
    mem0,
    mem0Config: {
      mem0BaseUrl: "http://mem0.test",
      mem0ApiKey: "mem0-token",
      mem0UserId: "knowledge-overload-test",
    },
  });
}

test("知识失控回归：高吞吐候选不会突破 Top-K 和预算门控", async () => {
  const store = new InMemoryStore();
  const workflow = createWorkflow(store);

  for (let index = 0; index < 100; index += 1) {
    workflow.createCandidate(createTask(index), createAcceptance(index));
  }

  const published = await workflow.publishBudgetedCandidates();

  assert.equal(store.candidateQueue.length, 100);
  assert.equal(published.length <= 5, true);
  assert.equal(store.deferredCandidates.length + store.archivedCandidates.length >= 95, true);
});
