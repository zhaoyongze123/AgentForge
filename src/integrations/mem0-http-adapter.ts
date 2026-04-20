import { execFileSync } from "node:child_process";

import { AppError } from "../core/errors/app-error.js";
import type {
  Mem0AddMemoryInput,
  Mem0SearchResult,
  Mem0Snapshot,
} from "../domain/external.js";
import type {
  BudgetDecision,
  KnowledgeCandidate,
  Mem0Entry,
} from "../domain/knowledge.js";

export interface Mem0HttpAdapterOptions {
  baseUrl: string;
  apiKey?: string;
  fetchImpl?: typeof fetch;
}

export interface Mem0WriteResult {
  id: string;
  key: string;
}

export class Mem0HttpAdapter {
  private readonly baseUrl: string;
  private readonly apiKey?: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: Mem0HttpAdapterOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.apiKey = options.apiKey;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async addMemory(input: Mem0AddMemoryInput): Promise<{ id: string }> {
    const payload = await this.request<{ id: string }>("/memories", {
      method: "POST",
      body: JSON.stringify(input),
    });
    return { id: payload.id };
  }

  async searchMemories(
    userId: string,
    query: string,
  ): Promise<Mem0SearchResult[]> {
    return this.request<Mem0SearchResult[]>(
      `/memories/search?user_id=${encodeURIComponent(userId)}&query=${encodeURIComponent(query)}`,
    );
  }

  async listMemories(userId: string): Promise<Mem0Snapshot> {
    const items = await this.request<Mem0Entry[]>(
      `/memories?user_id=${encodeURIComponent(userId)}`,
    );
    return { items };
  }

  buildCandidateKey(candidate: KnowledgeCandidate): string {
    return `candidate:${candidate.scope}:${candidate.knowledgeId}`;
  }

  buildDeferredKey(candidate: KnowledgeCandidate): string {
    return `deferred:${candidate.scope}:${candidate.knowledgeId}`;
  }

  saveCandidateSync(
    candidate: KnowledgeCandidate,
    userId: string,
  ): Mem0WriteResult {
    const key = this.buildCandidateKey(candidate);
    const metadata = {
      key,
      kind: "candidate",
      scope: candidate.scope,
      candidateId: candidate.candidateId,
      knowledgeId: candidate.knowledgeId,
      candidateType: candidate.candidateType,
      sourceRefs: candidate.sourceRefs,
      scores: candidate.scores,
      createdAt: candidate.createdAt,
    };
    const payload = this.requestSync<{ id: string }>("/memories", {
      method: "POST",
      body: JSON.stringify({
        userId,
        messages: [
          {
            role: "system",
            content: buildKnowledgeMemoryContent("candidate", candidate),
          },
        ],
        metadata,
      } satisfies Mem0AddMemoryInput),
    });

    return {
      id: payload.id,
      key,
    };
  }

  saveDeferredCandidateSync(
    candidate: KnowledgeCandidate,
    userId: string,
    decision: BudgetDecision,
  ): Mem0WriteResult {
    const key = this.buildDeferredKey(candidate);
    const metadata = {
      key,
      kind: "deferred",
      scope: candidate.scope,
      candidateId: candidate.candidateId,
      knowledgeId: candidate.knowledgeId,
      candidateType: candidate.candidateType,
      sourceRefs: candidate.sourceRefs,
      scores: candidate.scores,
      createdAt: candidate.createdAt,
      budgetDecision: {
        reason: decision.reason,
        queuePosition: decision.queuePosition,
        publishScore: decision.publishScore,
        windowStart: decision.activeWindow.windowStart,
        windowEnd: decision.activeWindow.windowEnd,
      },
    };
    const payload = this.requestSync<{ id: string }>("/memories", {
      method: "POST",
      body: JSON.stringify({
        userId,
        messages: [
          {
            role: "system",
            content: buildKnowledgeMemoryContent("deferred", candidate),
          },
        ],
        metadata,
      } satisfies Mem0AddMemoryInput),
    });

    return {
      id: payload.id,
      key,
    };
  }

  private async request<T>(
    path: string,
    init: RequestInit = {},
  ): Promise<T> {
    this.assertApiKey();

    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        authorization: `Bearer ${this.apiKey}`,
        "content-type": "application/json",
        ...(init.headers ?? {}),
      },
    });

    if (!response.ok) {
      throw new AppError({
        code: "EXTERNAL_UNAVAILABLE",
        message: "mem0 服务调用失败。",
        details: {
          path,
          status: response.status,
          body: await response.text(),
        },
      });
    }

    return (await response.json()) as T;
  }

  private requestSync<T>(path: string, init: RequestInit = {}): T {
    this.assertApiKey();

    const requestInit = {
      ...init,
      headers: {
        authorization: `Bearer ${this.apiKey}`,
        "content-type": "application/json",
        ...(init.headers ?? {}),
      },
    };

    try {
      const raw = execFileSync(
        process.execPath,
        [
          "--input-type=module",
          "-e",
          SYNC_FETCH_SCRIPT,
          `${this.baseUrl}${path}`,
          JSON.stringify(requestInit),
        ],
        {
          encoding: "utf8",
        },
      );
      const payload = JSON.parse(raw) as {
        ok: boolean;
        status: number;
        body: string;
      };

      if (!payload.ok) {
        throw new AppError({
          code: "EXTERNAL_UNAVAILABLE",
          message: "mem0 服务调用失败。",
          details: {
            path,
            status: payload.status,
            body: payload.body,
          },
        });
      }

      return JSON.parse(payload.body) as T;
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }

      const stderr =
        typeof error === "object" &&
        error !== null &&
        "stderr" in error &&
        typeof error.stderr === "string"
          ? error.stderr.trim()
          : undefined;
      const stdout =
        typeof error === "object" &&
        error !== null &&
        "stdout" in error &&
        typeof error.stdout === "string"
          ? error.stdout.trim()
          : undefined;

      throw new AppError({
        code: "EXTERNAL_UNAVAILABLE",
        message: "mem0 同步写入失败。",
        details: {
          path,
          stdout,
          stderr,
        },
        cause: error,
      });
    }
  }

  private assertApiKey(): void {
    if (!this.apiKey) {
      throw new AppError({
        code: "CONFIG_MISSING",
        message: "mem0 真实服务适配层需要 API Key。",
        details: { key: "MEM0_API_KEY" },
      });
    }
  }
}

const SYNC_FETCH_SCRIPT = `
const [url, initJson] = process.argv.slice(1);
const init = JSON.parse(initJson);
const response = await fetch(url, init);
const body = await response.text();
process.stdout.write(JSON.stringify({
  ok: response.ok,
  status: response.status,
  body,
}));
`;

function buildKnowledgeMemoryContent(
  kind: "candidate" | "deferred",
  candidate: KnowledgeCandidate,
): string {
  return [
    `kind=${kind}`,
    `knowledge_id=${candidate.knowledgeId}`,
    `scope=${candidate.scope}`,
    `summary=${candidate.summary}`,
    `recommendation=${candidate.recommendation}`,
    `source_refs=${candidate.sourceRefs.join(",")}`,
    `publish_score=${candidate.scores.publishScore}`,
  ].join("\n");
}
