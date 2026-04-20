import { mkdir, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import type {
  KnowledgeRecord,
  ObsidianNoteMapping,
} from "../domain/knowledge.js";

export class ObsidianKnowledgeService {
  constructor(private readonly vaultRoot: string) {}

  mapRecord(record: KnowledgeRecord): ObsidianNoteMapping {
    const noteType = record.candidateType;
    const scopePath = record.scope.replaceAll("/", "/");
    const filename = `${record.knowledgeId}.md`;

    if (noteType === "incident") {
      return {
        noteType,
        relativePath: join("knowledge", "incidents", scopePath, filename),
        title: record.title,
      };
    }

    if (noteType === "sop") {
      return {
        noteType,
        relativePath: join("knowledge", "sop", scopePath, filename),
        title: record.title,
      };
    }

    if (noteType === "adr") {
      return {
        noteType,
        relativePath: join("knowledge", "adr", scopePath, filename),
        title: record.title,
      };
    }

    return {
      noteType: "pattern",
      relativePath: join("knowledge", "patterns", scopePath, filename),
      title: record.title,
    };
  }

  renderRecord(record: KnowledgeRecord): string {
    return [
      `# ${record.title}`,
      "",
      "## 元信息",
      `- knowledge_id: ${record.knowledgeId}`,
      `- version: ${record.version}`,
      `- scope: ${record.scope}`,
      `- status: ${record.status}`,
      `- confidence: ${record.confidence}`,
      `- updated_at: ${record.updatedAt}`,
      `- mem0_id: ${record.mem0Key ?? "无"}`,
      "",
      "## 推荐规则",
      record.recommendation,
      "",
      "## 摘要",
      record.summary,
      "",
      "## 约束条件",
      ...(record.constraints.length > 0
        ? record.constraints.map((item) => `- ${item}`)
        : ["- 无"]),
      "",
      "## 来源证据",
      ...(record.sourceRefs.length > 0
        ? record.sourceRefs.map((item) => `- ${item}`)
        : ["- 无"]),
      "",
      "## 替代关系",
      ...(record.supersedes.length > 0
        ? record.supersedes.map((item) => `- supersedes: ${item}`)
        : ["- supersedes: 无"]),
      `- superseded_by: ${record.supersededBy ?? "无"}`,
      "",
    ].join("\n");
  }

  async writeRecord(record: KnowledgeRecord): Promise<string> {
    const mapping = this.mapRecord(record);
    const absolutePath = join(this.vaultRoot, mapping.relativePath);
    await mkdir(dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, this.renderRecord(record), "utf8");
    return absolutePath;
  }

  async archiveRecord(record: KnowledgeRecord): Promise<string> {
    const mapping = this.mapRecord(record);
    const sourcePath =
      record.notePath ?? join(this.vaultRoot, mapping.relativePath);
    const archivePath = join(
      this.vaultRoot,
      "knowledge",
      "archive",
      `${record.knowledgeId}.md`,
    );
    await mkdir(dirname(archivePath), { recursive: true });
    await rename(sourcePath, archivePath);
    return archivePath;
  }
}
