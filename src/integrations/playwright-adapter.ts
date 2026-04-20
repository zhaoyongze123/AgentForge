import { access, readFile } from "node:fs/promises";
import path from "node:path";

import { AppError } from "../core/errors/app-error.js";
import type {
  PlaywrightArtifact,
  PlaywrightRunSummary,
} from "../domain/external.js";

interface PlaywrightJsonAttachment {
  name?: string;
  path?: string;
  contentType?: string;
}

interface PlaywrightJsonSpec {
  ok?: boolean;
  tests?: Array<{
    results?: Array<{
      status?: string;
      duration?: number;
      attachments?: PlaywrightJsonAttachment[];
      error?: { message?: string };
    }>;
  }>;
  suites?: PlaywrightJsonSpec[];
}

interface PlaywrightJsonResult {
  status?: string;
  duration?: number;
  attachments?: PlaywrightJsonAttachment[];
  error?: { message?: string };
}

export interface PlaywrightPreparedCommand {
  command: string;
  reportFile: string;
}

export interface PlaywrightCollectedRun {
  reportPath: string;
  summary: PlaywrightRunSummary;
}

export class PlaywrightAdapter {
  prepareExecutionCommand(
    command: string,
    artifactDir: string,
  ): PlaywrightPreparedCommand {
    const reportFile = path.join(artifactDir, "playwright-report.json");
    const htmlOutputDir = path.join(artifactDir, "playwright-report");
    const commandWithReporter = injectJsonReporter(command);

    return {
      reportFile,
      command: [
        `PLAYWRIGHT_JSON_OUTPUT_FILE=${quoteForShell(reportFile)}`,
        `PLAYWRIGHT_HTML_OUTPUT_DIR=${quoteForShell(htmlOutputDir)}`,
        commandWithReporter,
      ].join(" "),
    };
  }

  async collectFromJsonReport(reportPath: string): Promise<PlaywrightRunSummary> {
    let raw: string;
    try {
      raw = await readFile(reportPath, "utf8");
    } catch (error) {
      throw new AppError({
        code: "TASK_NOT_FOUND",
        message: "未找到 Playwright JSON 报告。",
        details: { reportPath },
        cause: error,
      });
    }

    const report = JSON.parse(raw) as PlaywrightJsonSpec;
    const buckets = {
      total: 0,
      passed: 0,
      failed: 0,
      skipped: 0,
      durationMs: 0,
      evidence: [] as string[],
      screenshots: [] as PlaywrightArtifact[],
      traces: [] as PlaywrightArtifact[],
    };

    walkSpecs(report, (result) => {
      buckets.total += 1;
      buckets.durationMs += result.duration ?? 0;
      if (result.status === "passed") {
        buckets.passed += 1;
      } else if (result.status === "skipped") {
        buckets.skipped += 1;
      } else {
        buckets.failed += 1;
      }

      if (result.error?.message) {
        buckets.evidence.push(result.error.message);
      }

      for (const attachment of result.attachments ?? []) {
        if (!attachment.path || !attachment.contentType) {
          continue;
        }
        const artifact: PlaywrightArtifact = {
          name: attachment.name ?? "artifact",
          contentType: attachment.contentType,
          path: attachment.path,
        };
        if (attachment.contentType.includes("image")) {
          buckets.screenshots.push(artifact);
        }
        if (
          attachment.contentType.includes("zip") ||
          artifact.name.toLowerCase().includes("trace")
        ) {
          buckets.traces.push(artifact);
        }
      }
    });

    return {
      status: buckets.failed > 0 ? "failed" : "passed",
      total: buckets.total,
      passed: buckets.passed,
      failed: buckets.failed,
      skipped: buckets.skipped,
      durationMs: buckets.durationMs,
      evidence: buckets.evidence,
      screenshots: buckets.screenshots,
      traces: buckets.traces,
    };
  }

  async collectFromRuntime(
    commandCwd: string,
    artifactDir: string,
    reportFile?: string,
  ): Promise<PlaywrightCollectedRun | undefined> {
    const candidates = uniquePaths([
      reportFile,
      path.join(artifactDir, "playwright-report.json"),
      path.join(commandCwd, "playwright-report.json"),
      path.join(commandCwd, "test-results.json"),
      path.join(commandCwd, "playwright-report", "results.json"),
    ]);

    for (const candidate of candidates) {
      if (!(await pathExists(candidate))) {
        continue;
      }

      return {
        reportPath: candidate,
        summary: await this.collectFromJsonReport(candidate),
      };
    }

    return undefined;
  }
}

function walkSpecs(
  spec: PlaywrightJsonSpec,
  onResult: (result: PlaywrightJsonResult) => void,
): void {
  for (const test of spec.tests ?? []) {
    for (const result of test.results ?? []) {
      onResult(result);
    }
  }

  for (const suite of spec.suites ?? []) {
    walkSpecs(suite, onResult);
  }
}

function injectJsonReporter(command: string): string {
  if (/\b--reporter(?:=|\s+)/iu.test(command)) {
    return command;
  }

  if (/^\s*(npm|pnpm|yarn|bun)\b.*\b(e2e|playwright)\b/iu.test(command)) {
    return `${command} -- --reporter=json`;
  }

  if (/\bplaywright\b/iu.test(command)) {
    return `${command} --reporter=json`;
  }

  return command;
}

function quoteForShell(value: string): string {
  return `'${value.replace(/'/gu, `'\\''`)}'`;
}

function uniquePaths(values: Array<string | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await access(targetPath);
    return true;
  } catch {
    return false;
  }
}
