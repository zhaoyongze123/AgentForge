import test from "node:test";
import assert from "node:assert/strict";

import type { KnowledgeCandidate } from "../src/domain/knowledge.js";
import type { Mem0HttpAdapter } from "../src/integrations/mem0-http-adapter.js";
import { InMemoryStore } from "../src/runtime/in-memory-store.js";
import { KnowledgeWorkflow } from "../src/services/knowledge-workflow.js";

function createCandidate(
  overrides: Partial<KnowledgeCandidate> = {},
): KnowledgeCandidate {
  return {
    candidateId: overrides.candidateId ?? "kc-1",
    knowledgeId: overrides.knowledgeId ?? "knowledge.auth.flow",
    scope: overrides.scope ?? "knowledge/auth",
    summary: overrides.summary ?? "认证链路稳定经验",
    recommendation:
      overrides.recommendation ?? "优先使用短 access token + refresh token",
    sourceRefs: overrides.sourceRefs ?? ["task:knowledge-auth-flow"],
    candidateType: overrides.candidateType ?? "pattern",
    normalizedKey: overrides.normalizedKey,
    createdAt: overrides.createdAt ?? "2026-04-16T10:05:00.000Z",
    scores: overrides.scores ?? {
      reusableScore: 0.9,
      noveltyScore: 0.7,
      confidence: 0.95,
      stabilityScore: 0.9,
      impactScore: 0.8,
      publishScore: 0.86,
    },
  };
}

function createWorkflow(store: InMemoryStore): KnowledgeWorkflow {
  const mem0 = {
    saveCandidateSync(candidate: KnowledgeCandidate) {
      return {
        id: `mem0-candidate-${candidate.candidateId}`,
        key: `candidate:${candidate.scope}:${candidate.knowledgeId}`,
      };
    },
    saveDeferredCandidateSync(candidate: KnowledgeCandidate) {
      return {
        id: `mem0-deferred-${candidate.candidateId}`,
        key: `deferred:${candidate.scope}:${candidate.knowledgeId}`,
      };
    },
  } as unknown as Mem0HttpAdapter;

  return new KnowledgeWorkflow(store, null, {
    mem0,
    mem0Config: {
      mem0BaseUrl: "http://mem0.test",
      mem0ApiKey: "mem0-token",
      mem0UserId: "knowledge-budget-test",
    },
  });
}

test("预算策略会维护小时窗口统计", () => {
  const store = new InMemoryStore();
  const workflow = createWorkflow(store);
  const candidate = createCandidate();

  store.candidateQueue.push(candidate);
  const decision = workflow.evaluateBudget(candidate);

  assert.equal(decision.activeWindow.windowStart, "2026-04-16T10:00:00.000Z");
  assert.equal(decision.activeWindow.windowEnd, "2026-04-16T11:00:00.000Z");
});

test("预算策略会按 publish_score 排序并只放行 Top-K", () => {
  const store = new InMemoryStore();
  const workflow = createWorkflow(store);
  const high = createCandidate({
    candidateId: "kc-high",
    scores: {
      reusableScore: 0.9,
      noveltyScore: 0.8,
      confidence: 0.95,
      stabilityScore: 0.9,
      impactScore: 0.8,
      publishScore: 0.91,
    },
  });
  const mid = createCandidate({
    candidateId: "kc-mid",
    knowledgeId: "knowledge.auth.jwt",
    scores: {
      reusableScore: 0.9,
      noveltyScore: 0.7,
      confidence: 0.9,
      stabilityScore: 0.9,
      impactScore: 0.8,
      publishScore: 0.76,
    },
  });
  const low = createCandidate({
    candidateId: "kc-low",
    knowledgeId: "knowledge.auth.cookie",
    scores: {
      reusableScore: 0.8,
      noveltyScore: 0.4,
      confidence: 0.82,
      stabilityScore: 0.8,
      impactScore: 0.5,
      publishScore: 0.54,
    },
  });

  store.candidateQueue.push(high, mid, low);

  const highDecision = workflow.evaluateBudget(high);
  const midDecision = workflow.evaluateBudget(mid);
  const lowDecision = workflow.evaluateBudget(low);

  assert.equal(highDecision.reason, "publish");
  assert.equal(midDecision.reason, "publish");
  assert.equal(lowDecision.reason, "archived");
});

test("超过 scope 每小时预算时会 deferred", () => {
  const store = new InMemoryStore();
  const workflow = createWorkflow(store);

  store.knowledgeBudgetWindow = {
    windowStart: "2026-04-16T10:00:00.000Z",
    windowEnd: "2026-04-16T11:00:00.000Z",
    publishedCount: 4,
    publishedByScope: {
      "knowledge/auth": 4,
    },
  };

  const candidate = createCandidate();
  store.candidateQueue.push(candidate);
  const decision = workflow.evaluateBudget(candidate);

  assert.equal(decision.reason, "deferred");
});

test("预算拒绝会写入 deferred 或 archived 队列", () => {
  const store = new InMemoryStore();
  const workflow = createWorkflow(store);
  const archived = createCandidate({
    candidateId: "kc-archived",
    scores: {
      reusableScore: 0.8,
      noveltyScore: 0.4,
      confidence: 0.82,
      stabilityScore: 0.8,
      impactScore: 0.5,
      publishScore: 0.5,
    },
  });
  const deferred = createCandidate({
    candidateId: "kc-deferred",
    knowledgeId: "knowledge.auth.deferred",
    scores: {
      reusableScore: 0.9,
      noveltyScore: 0.7,
      confidence: 0.92,
      stabilityScore: 0.9,
      impactScore: 0.7,
      publishScore: 0.74,
    },
  });

  store.candidateQueue.push(archived, deferred);
  store.knowledgeBudgetWindow = {
    windowStart: "2026-04-16T10:00:00.000Z",
    windowEnd: "2026-04-16T11:00:00.000Z",
    publishedCount: 10,
    publishedByScope: {},
  };

  workflow.handleBudgetRejection(archived, workflow.evaluateBudget(archived));
  workflow.handleBudgetRejection(deferred, workflow.evaluateBudget(deferred));

  assert.equal(store.archivedCandidates.length, 1);
  assert.equal(store.deferredCandidates.length, 1);
});
