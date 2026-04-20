import { AppError } from "../core/errors/app-error.js";
import type {
  Mem0AddMemoryInput,
  Mem0SearchResult,
  Mem0Snapshot,
} from "../domain/external.js";
import type { Mem0Entry } from "../domain/knowledge.js";

export interface Mem0HttpAdapterOptions {
  baseUrl: string;
  apiKey?: string;
  fetchImpl?: typeof fetch;
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

  private async request<T>(
    path: string,
    init: RequestInit = {},
  ): Promise<T> {
    if (!this.apiKey) {
      throw new AppError({
        code: "CONFIG_MISSING",
        message: "mem0 真实服务适配层需要 API Key。",
        details: { key: "MEM0_API_KEY" },
      });
    }

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
}
