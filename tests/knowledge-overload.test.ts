import assert from "node:assert/strict";
import test from "node:test";

import { InMemoryStore } from "../src/runtime/in-memory-store.js";
import { KnowledgeWorkflow } from "../src/services/knowledge-workflow.js";
import type { AcceptanceResult } from "../src/domain/acceptance.js";
import type { TaskUnit } from "../src/domain/task-unit.js";

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

test("知识失控回归：高吞吐候选不会突破 Top-K 和预算门控", async () => {
  const store = new InMemoryStore();
  const workflow = new KnowledgeWorkflow(store, null);

  for (let index = 0; index < 100; index += 1) {
    workflow.createCandidate(createTask(index), createAcceptance(index));
  }

  const published = await workflow.publishBudgetedCandidates();

  assert.equal(store.candidateQueue.length, 100);
  assert.equal(published.length <= 5, true);
  assert.equal(store.deferredCandidates.length + store.archivedCandidates.length >= 95, true);
});
