import { readdir } from "node:fs/promises";
import { join } from "node:path";

import type { KnowledgeRecord } from "../domain/knowledge.js";
import type {
  ObsidianSyncResult,
  SyncedKnowledgeRecord,
} from "../domain/external.js";
import { ObsidianKnowledgeService } from "../services/obsidian-knowledge.js";

export class ObsidianSyncService {
  private readonly knowledgeService: ObsidianKnowledgeService;

  constructor(private readonly vaultRoot: string) {
    this.knowledgeService = new ObsidianKnowledgeService(vaultRoot);
  }

  async sync(records: KnowledgeRecord[]): Promise<ObsidianSyncResult> {
    const written: string[] = [];
    const archived: string[] = [];

    for (const record of records) {
      if (record.status === "archived") {
        if (record.notePath) {
          archived.push(await this.knowledgeService.archiveRecord(record));
        }
        continue;
      }

      written.push(await this.knowledgeService.writeRecord(record));
    }

    const stale = await this.findStaleFiles(records);
    return { written, archived, stale };
  }

  async syncAndAnnotate(
    records: KnowledgeRecord[],
  ): Promise<SyncedKnowledgeRecord[]> {
    const synced = await this.sync(records);
    const notePaths = new Map(
      synced.written.map((path) => [path.split("/").at(-1), path] as const),
    );

    return records
      .filter((record) => record.status !== "archived")
      .map((record) => ({
        ...record,
        notePath:
          notePaths.get(`${record.knowledgeId}.md`) ??
          record.notePath ??
          join(this.vaultRoot, this.knowledgeService.mapRecord(record).relativePath),
      }));
  }

  private async findStaleFiles(records: KnowledgeRecord[]): Promise<string[]> {
    const activePaths = new Set(
      records
        .filter((record) => record.status !== "archived")
        .map((record) =>
          join(this.vaultRoot, this.knowledgeService.mapRecord(record).relativePath),
        ),
    );
    const root = join(this.vaultRoot, "knowledge");
    const files = await walkMarkdownFiles(root).catch(() => []);
    return files.filter(
      (file) => !activePaths.has(file) && !file.includes("/archive/"),
    );
  }
}

async function walkMarkdownFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const absolutePath = join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walkMarkdownFiles(absolutePath)));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith(".md")) {
      files.push(absolutePath);
    }
  }

  return files;
}
