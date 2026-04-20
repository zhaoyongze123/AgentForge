import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type {
  KnowledgeCandidate,
  KnowledgeRecord,
} from "../src/domain/knowledge.js";
import { InMemoryStore } from "../src/runtime/in-memory-store.js";
import { Mem0Adapter } from "../src/services/mem0-adapter.js";
import { ObsidianKnowledgeService } from "../src/services/obsidian-knowledge.js";

function createCandidate(
  overrides: Partial<KnowledgeCandidate> = {},
): KnowledgeCandidate {
  return {
    candidateId: overrides.candidateId ?? "kc-1",
    knowledgeId: overrides.knowledgeId ?? "knowledge.auth.flow",
    scope: overrides.scope ?? "knowledge/auth",
    summary: overrides.summary ?? "认证链路稳定经验",
    recommendation: overrides.recommendation ?? "优先使用 refresh token",
    sourceRefs: overrides.sourceRefs ?? ["task:knowledge-auth-flow"],
    candidateType: overrides.candidateType ?? "pattern",
    normalizedKey: overrides.normalizedKey,
    createdAt: overrides.createdAt ?? "2026-04-16T12:00:00.000Z",
    mem0Key: overrides.mem0Key,
    scores: overrides.scores ?? {
      reusableScore: 0.88,
      noveltyScore: 0.66,
      confidence: 0.94,
      stabilityScore: 0.89,
      impactScore: 0.8,
      publishScore: 0.83,
    },
  };
}

function createRecord(
  overrides: Partial<KnowledgeRecord> = {},
): KnowledgeRecord {
  return {
    knowledgeId: overrides.knowledgeId ?? "knowledge.auth.flow",
    version: overrides.version ?? 1,
    scope: overrides.scope ?? "knowledge/auth",
    status: overrides.status ?? "active",
    title: overrides.title ?? "认证链路稳定经验",
    summary: overrides.summary ?? "认证链路稳定经验",
    recommendation: overrides.recommendation ?? "优先使用 refresh token",
    constraints: overrides.constraints ?? [],
    confidence: overrides.confidence ?? 0.94,
    candidateType: overrides.candidateType ?? "pattern",
    sourceRefs: overrides.sourceRefs ?? ["task:knowledge-auth-flow"],
    derivedFrom: overrides.derivedFrom ?? [],
    supersedes: overrides.supersedes ?? [],
    updatedAt: overrides.updatedAt ?? "2026-04-16T12:00:00.000Z",
    supersededBy: overrides.supersededBy,
    notePath: overrides.notePath,
  };
}

test("Mem0Adapter 支持候选知识写入与读取", () => {
  const store = new InMemoryStore();
  const mem0 = new Mem0Adapter(store);
  const candidate = createCandidate();

  const entry = mem0.saveCandidate(candidate);

  assert.equal(entry.kind, "candidate");
  assert.equal(mem0.get(entry.key)?.scope, "knowledge/auth");
});

test("Mem0Adapter 支持 deferred 候选写入", () => {
  const store = new InMemoryStore();
  const mem0 = new Mem0Adapter(store);
  const candidate = createCandidate();

  const entry = mem0.saveDeferredCandidate(candidate);

  assert.equal(entry.kind, "deferred");
  assert.equal(mem0.listByScope("knowledge/auth").length, 1);
});

test("ObsidianKnowledgeService 能把长期知识写成 Markdown", async () => {
  const root = await mkdtemp(join(tmpdir(), "agentforge-obsidian-"));
  const service = new ObsidianKnowledgeService(root);
  const record = createRecord();

  const notePath = await service.writeRecord(record);
  const content = await readFile(notePath, "utf8");

  assert.equal(notePath.includes("knowledge/patterns/knowledge/auth"), true);
  assert.equal(content.includes("knowledge_id: knowledge.auth.flow"), true);
  assert.equal(content.includes("## 推荐规则"), true);
});

test("ObsidianKnowledgeService 会按 candidateType 映射到固定目录", () => {
  const service = new ObsidianKnowledgeService("/tmp/agentforge-vault");

  assert.equal(
    service.mapRecord(createRecord({ candidateType: "pattern" })).relativePath,
    "knowledge/patterns/knowledge/auth/knowledge.auth.flow.md",
  );
  assert.equal(
    service.mapRecord(createRecord({ candidateType: "incident" })).relativePath,
    "knowledge/incidents/knowledge/auth/knowledge.auth.flow.md",
  );
  assert.equal(
    service.mapRecord(createRecord({ candidateType: "sop" })).relativePath,
    "knowledge/sop/knowledge/auth/knowledge.auth.flow.md",
  );
  assert.equal(
    service.mapRecord(createRecord({ candidateType: "adr" })).relativePath,
    "knowledge/adr/knowledge/auth/knowledge.auth.flow.md",
  );
});
