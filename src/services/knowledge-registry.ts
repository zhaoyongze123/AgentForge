import type {
  KnowledgeAuditEntry,
  KnowledgeCandidate,
  KnowledgeRecord,
  KnowledgeReviewDecision,
  KnowledgeStatus,
} from "../domain/knowledge.js";

export interface CandidateAnalysis {
  normalizedCandidate: KnowledgeCandidate;
  duplicateOf?: KnowledgeRecord;
  idConflictWith?: KnowledgeRecord;
  scopeConflictWith?: KnowledgeRecord;
}

export class KnowledgeRegistry {
  private readonly auditEntries: KnowledgeAuditEntry[] = [];

  normalizeKnowledgeId(parts: {
    scope: string;
    title: string;
    candidateType: KnowledgeCandidate["candidateType"];
  }): string {
    const scopePrefix = parts.scope
      .replace(/\//g, ".")
      .replace(/[^a-zA-Z0-9.]/g, "")
      .replace(/\.{2,}/g, ".")
      .replace(/^\.|\.$/g, "")
      .toLowerCase();
    const titleSuffix = parts.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ".")
      .replace(/\.{2,}/g, ".")
      .replace(/^\.|\.$/g, "");

    return `${scopePrefix}.${parts.candidateType}.${titleSuffix}`;
  }

  normalizeCandidate(candidate: KnowledgeCandidate): KnowledgeCandidate {
    return {
      ...candidate,
      knowledgeId:
        candidate.knowledgeId ||
        this.normalizeKnowledgeId({
          scope: candidate.scope,
          title: candidate.summary,
          candidateType: candidate.candidateType,
        }),
      normalizedKey: normalizeText(candidate.recommendation),
    };
  }

  analyzeCandidate(
    candidate: KnowledgeCandidate,
    existingRecords: KnowledgeRecord[],
  ): CandidateAnalysis {
    const normalizedCandidate = this.normalizeCandidate(candidate);

    const duplicateOf = existingRecords.find(
      (record) =>
        record.scope === normalizedCandidate.scope &&
        normalizeText(record.recommendation) ===
          normalizedCandidate.normalizedKey,
    );

    const idConflictWith = existingRecords.find(
      (record) =>
        record.knowledgeId === normalizedCandidate.knowledgeId &&
        normalizeText(record.recommendation) !==
          normalizedCandidate.normalizedKey &&
        record.status !== "archived",
    );

    const scopeConflictWith = existingRecords.find(
      (record) =>
        record.scope === normalizedCandidate.scope &&
        record.knowledgeId !== normalizedCandidate.knowledgeId &&
        hasSharedTopic(record, normalizedCandidate) &&
        normalizeText(record.recommendation) !==
          normalizedCandidate.normalizedKey &&
        record.status === "active",
    );

    if (duplicateOf) {
      this.recordAudit(
        normalizedCandidate.knowledgeId,
        "duplicate_detected",
        `候选 ${normalizedCandidate.candidateId} 与 ${duplicateOf.knowledgeId}@${duplicateOf.version} 重复`,
      );
    }
    if (idConflictWith) {
      this.recordAudit(
        normalizedCandidate.knowledgeId,
        "conflict_detected",
        `候选 ${normalizedCandidate.candidateId} 与同 ID 记录 ${idConflictWith.knowledgeId}@${idConflictWith.version} 冲突`,
      );
    }
    if (scopeConflictWith) {
      this.recordAudit(
        normalizedCandidate.knowledgeId,
        "conflict_detected",
        `候选 ${normalizedCandidate.candidateId} 与同 scope 记录 ${scopeConflictWith.knowledgeId}@${scopeConflictWith.version} 冲突`,
      );
    }

    return {
      normalizedCandidate,
      duplicateOf,
      idConflictWith,
      scopeConflictWith,
    };
  }

  nextVersion(knowledgeId: string, existingRecords: KnowledgeRecord[]): number {
    const versions = existingRecords
      .filter((record) => record.knowledgeId === knowledgeId)
      .map((record) => record.version);

    return versions.length === 0 ? 1 : Math.max(...versions) + 1;
  }

  applySupersedes(
    existingRecords: KnowledgeRecord[],
    nextRecord: KnowledgeRecord,
  ): KnowledgeRecord[] {
    return existingRecords.map((record) => {
      if (
        !nextRecord.supersedes.includes(
          `${record.knowledgeId}@${record.version}`,
        )
      ) {
        return record;
      }

      const updatedRecord: KnowledgeRecord = {
        ...record,
        status: "deprecated",
        supersededBy: `${nextRecord.knowledgeId}@${nextRecord.version}`,
        updatedAt: nextRecord.updatedAt,
      };
      this.recordAudit(
        record.knowledgeId,
        "deprecated",
        `${record.knowledgeId}@${record.version} 被 ${nextRecord.knowledgeId}@${nextRecord.version} 替代`,
      );
      return updatedRecord;
    });
  }

  transitionStatus(
    record: KnowledgeRecord,
    nextStatus: KnowledgeStatus,
    reason: string,
  ): KnowledgeRecord {
    this.recordAudit(
      record.knowledgeId,
      nextStatus === "archived" ? "archived" : "review_requested",
      `${record.knowledgeId}@${record.version} 状态变更为 ${nextStatus}，原因：${reason}`,
    );

    return {
      ...record,
      status: nextStatus,
      updatedAt: new Date().toISOString(),
    };
  }

  decideReview(analysis: CandidateAnalysis): KnowledgeReviewDecision {
    if (analysis.duplicateOf) {
      return {
        status: "archive",
        reason: "候选与已有知识重复，直接归档",
      };
    }

    if (analysis.idConflictWith || analysis.scopeConflictWith) {
      return {
        status: "review",
        reason: "候选命中知识冲突，需要 review 或人工 gate",
      };
    }

    return {
      status: "publish",
      reason: "候选可直接发布",
    };
  }

  shouldArchive(
    record: KnowledgeRecord,
    options: {
      citationCount: number;
      confidenceThreshold: number;
      duplicate: boolean;
    },
  ): boolean {
    if (options.duplicate) {
      return true;
    }

    if (record.status === "deprecated" && options.citationCount === 0) {
      return true;
    }

    return record.confidence < options.confidenceThreshold;
  }

  listAuditByKnowledgeId(knowledgeId: string): KnowledgeAuditEntry[] {
    return this.auditEntries.filter(
      (entry) => entry.knowledgeId === knowledgeId,
    );
  }

  recordCandidateCreated(candidate: KnowledgeCandidate): void {
    this.recordAudit(
      candidate.knowledgeId,
      "candidate_created",
      `创建候选知识 ${candidate.candidateId}`,
    );
  }

  recordPublished(record: KnowledgeRecord): void {
    this.recordAudit(
      record.knowledgeId,
      "published",
      `发布知识 ${record.knowledgeId}@${record.version}`,
    );
  }

  private recordAudit(
    knowledgeId: string,
    action: KnowledgeAuditEntry["action"],
    summary: string,
  ): void {
    this.auditEntries.push({
      auditId: `audit-${knowledgeId}-${this.auditEntries.length + 1}`,
      knowledgeId,
      action,
      summary,
      timestamp: new Date().toISOString(),
    });
  }
}

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function hasSharedTopic(
  record: KnowledgeRecord,
  candidate: KnowledgeCandidate,
): boolean {
  const recordTopic = normalizeText(`${record.title} ${record.summary}`);
  const candidateTopic = normalizeText(candidate.summary);

  if (!recordTopic || !candidateTopic) {
    return false;
  }

  if (recordTopic === candidateTopic) {
    return true;
  }

  const recordTokens = new Set(recordTopic.split(/\s+/).filter(Boolean));
  const candidateTokens = candidateTopic.split(/\s+/).filter(Boolean);
  return candidateTokens.some((token) => recordTokens.has(token));
}
