import test from "node:test";
import assert from "node:assert/strict";

import type {
  KnowledgeCandidate,
  KnowledgeRecord,
} from "../src/domain/knowledge.js";
import { KnowledgeRegistry } from "../src/services/knowledge-registry.js";

function createCandidate(
  overrides: Partial<KnowledgeCandidate> = {},
): KnowledgeCandidate {
  return {
    candidateId: overrides.candidateId ?? "kc-1",
    knowledgeId: overrides.knowledgeId ?? "backend.auth.pattern.jwt",
    scope: overrides.scope ?? "backend/auth",
    summary: overrides.summary ?? "JWT 策略",
    recommendation:
      overrides.recommendation ?? "access token 15min + refresh token 7d",
    sourceRefs: overrides.sourceRefs ?? ["task:backend-user-jwt"],
    candidateType: overrides.candidateType ?? "pattern",
    normalizedKey: overrides.normalizedKey,
    scores: overrides.scores ?? {
      reusableScore: 0.82,
      noveltyScore: 0.61,
      confidence: 0.92,
      stabilityScore: 0.88,
      impactScore: 0.75,
      publishScore: 0.77,
    },
  };
}

function createRecord(
  overrides: Partial<KnowledgeRecord> = {},
): KnowledgeRecord {
  return {
    knowledgeId: overrides.knowledgeId ?? "backend.auth.pattern.jwt",
    version: overrides.version ?? 1,
    scope: overrides.scope ?? "backend/auth",
    status: overrides.status ?? "active",
    title: overrides.title ?? "JWT 策略",
    summary: overrides.summary ?? "JWT 策略",
    recommendation:
      overrides.recommendation ?? "access token 15min + refresh token 7d",
    constraints: overrides.constraints ?? [],
    confidence: overrides.confidence ?? 0.92,
    candidateType: overrides.candidateType ?? "pattern",
    sourceRefs: overrides.sourceRefs ?? ["task:backend-user-jwt"],
    derivedFrom: overrides.derivedFrom ?? [],
    supersedes: overrides.supersedes ?? [],
    updatedAt: overrides.updatedAt ?? "2026-04-16T00:00:00.000Z",
    supersededBy: overrides.supersededBy,
  };
}

test("KnowledgeRegistry 会规范化 knowledge_id", () => {
  const registry = new KnowledgeRegistry();
  const knowledgeId = registry.normalizeKnowledgeId({
    scope: "backend/auth",
    title: "JWT Expiry Strategy",
    candidateType: "pattern",
  });

  assert.equal(knowledgeId, "backend.auth.pattern.jwt.expiry.strategy");
});

test("KnowledgeRegistry 能检测重复候选", () => {
  const registry = new KnowledgeRegistry();
  const analysis = registry.analyzeCandidate(createCandidate(), [
    createRecord(),
  ]);

  assert.equal(analysis.duplicateOf?.knowledgeId, "backend.auth.pattern.jwt");
});

test("KnowledgeRegistry 能检测同 ID 冲突", () => {
  const registry = new KnowledgeRegistry();
  const analysis = registry.analyzeCandidate(
    createCandidate({ recommendation: "access token 1h only" }),
    [createRecord()],
  );

  assert.equal(
    analysis.idConflictWith?.knowledgeId,
    "backend.auth.pattern.jwt",
  );
});

test("KnowledgeRegistry 能检测同 scope 语义冲突", () => {
  const registry = new KnowledgeRegistry();
  const analysis = registry.analyzeCandidate(
    createCandidate({
      knowledgeId: "backend.auth.pattern.refresh",
      recommendation: "session cookie only",
    }),
    [createRecord()],
  );

  assert.equal(
    analysis.scopeConflictWith?.knowledgeId,
    "backend.auth.pattern.jwt",
  );
});

test("KnowledgeRegistry 会递增版本并应用 supersedes", () => {
  const registry = new KnowledgeRegistry();
  const nextVersion = registry.nextVersion("backend.auth.pattern.jwt", [
    createRecord({ version: 1 }),
    createRecord({ version: 2 }),
  ]);
  assert.equal(nextVersion, 3);

  const updated = registry.applySupersedes(
    [createRecord({ version: 2 })],
    createRecord({
      version: 3,
      supersedes: ["backend.auth.pattern.jwt@2"],
      updatedAt: "2026-04-16T01:00:00.000Z",
    }),
  );

  assert.equal(updated[0]?.status, "deprecated");
  assert.equal(updated[0]?.supersededBy, "backend.auth.pattern.jwt@3");
});

test("KnowledgeRegistry 会给出 publish/review/archive 决策", () => {
  const registry = new KnowledgeRegistry();

  const publishDecision = registry.decideReview(
    registry.analyzeCandidate(createCandidate(), []),
  );
  assert.equal(publishDecision.status, "publish");

  const archiveDecision = registry.decideReview(
    registry.analyzeCandidate(createCandidate(), [createRecord()]),
  );
  assert.equal(archiveDecision.status, "archive");

  const reviewDecision = registry.decideReview(
    registry.analyzeCandidate(
      createCandidate({ recommendation: "session cookie only" }),
      [createRecord()],
    ),
  );
  assert.equal(reviewDecision.status, "review");
});

test("KnowledgeRegistry 支持归档判断与审计日志", () => {
  const registry = new KnowledgeRegistry();
  const record = createRecord({ status: "deprecated", confidence: 0.4 });

  assert.equal(
    registry.shouldArchive(record, {
      citationCount: 0,
      confidenceThreshold: 0.5,
      duplicate: false,
    }),
    true,
  );

  registry.recordCandidateCreated(createCandidate());
  registry.recordPublished(createRecord());
  const auditEntries = registry.listAuditByKnowledgeId(
    "backend.auth.pattern.jwt",
  );

  assert.equal(auditEntries.length >= 2, true);
});
