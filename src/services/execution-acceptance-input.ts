import type {
  AcceptanceEvaluationInput,
  ApiCheckEvidence,
  TestCommandEvidence,
} from "../domain/acceptance.js";
import type { ExecutionResult } from "../domain/execution.js";
import type { TaskUnit } from "../domain/task-unit.js";

const LINE_PREFIX_RE =
  /^\[(?<label>[a-z0-9-]+):(?<stream>stdout|stderr)\]\s?(?<text>.*)$/iu;
const COMMAND_LABELS = new Set(["install", "typecheck", "test", "build", "e2e"]);

export function buildAcceptanceInputFromExecution(
  task: TaskUnit,
  executionResult: ExecutionResult,
): AcceptanceEvaluationInput {
  const parsed = new Map<string, { stdout: string[]; stderr: string[] }>();
  const notes: string[] = [
    `executor=${executionResult.executor}`,
    `execution_status=${executionResult.status}`,
    `execution_duration_ms=${executionResult.durationMs}`,
    `execution_mode=${inferExecutionMode(executionResult)}`,
  ];

  if (executionResult.exitCode !== null) {
    notes.push(`execution_exit_code=${executionResult.exitCode}`);
  }
  if (executionResult.reason) {
    notes.push(`execution_reason=${executionResult.reason}`);
  }

  for (const line of executionResult.stdout) {
    collectPrefixedLine(line, "stdout", parsed, notes);
  }
  for (const line of executionResult.stderr) {
    collectPrefixedLine(line, "stderr", parsed, notes);
  }

  const githubPrGate = buildGithubPrGate(notes);

  return {
    testCommands:
      parsed.size > 0
        ? buildParsedCommandEvidence(task, executionResult, parsed)
        : buildFallbackCommandEvidence(task, executionResult),
    apiChecks: githubPrGate ? [githubPrGate] : undefined,
    buildLogs: executionResult.logs.map(
      (log) => `${log.level}: ${log.message}`,
    ),
    notes,
  };
}

function collectPrefixedLine(
  line: string,
  defaultStream: "stdout" | "stderr",
  parsed: Map<string, { stdout: string[]; stderr: string[] }>,
  notes: string[],
): void {
  const match = line.match(LINE_PREFIX_RE);
  if (!match?.groups) {
    notes.push(`${defaultStream}:${line}`);
    return;
  }

  const label = match.groups.label;
  const stream = match.groups.stream as "stdout" | "stderr";
  const text = match.groups.text;

  if (!COMMAND_LABELS.has(label)) {
    notes.push(`${label}:${text}`);
    return;
  }

  const bucket = parsed.get(label) ?? { stdout: [], stderr: [] };
  bucket[stream].push(text);
  parsed.set(label, bucket);
}

function buildParsedCommandEvidence(
  task: TaskUnit,
  executionResult: ExecutionResult,
  parsed: Map<string, { stdout: string[]; stderr: string[] }>,
): TestCommandEvidence[] {
  return [...parsed.entries()].map(([label, bucket]) => ({
    kind: "test_command",
    command: resolveCommandName(label, task),
    status:
      bucket.stderr.length > 0 && executionResult.status !== "succeeded"
        ? "failed"
        : "passed",
    durationMs: executionResult.durationMs,
    exitCode: executionResult.status === "succeeded" ? 0 : executionResult.exitCode,
    stdout: bucket.stdout,
    stderr: bucket.stderr,
  }));
}

function buildFallbackCommandEvidence(
  task: TaskUnit,
  executionResult: ExecutionResult,
): TestCommandEvidence[] {
  if (task.testCommands.length === 0) {
    return [];
  }

  return task.testCommands.map((command) => ({
    kind: "test_command",
    command,
    status: executionResult.status === "succeeded" ? "passed" : "failed",
    durationMs: executionResult.durationMs,
    exitCode: executionResult.exitCode,
    stdout: executionResult.stdout,
    stderr: executionResult.stderr,
  }));
}

function resolveCommandName(label: string, task: TaskUnit): string {
  const mapping: Record<string, RegExp> = {
    install: /\binstall\b/iu,
    typecheck: /\btypecheck\b|tsc/iu,
    test: /\btest\b/iu,
    build: /\bbuild\b/iu,
    e2e: /\bplaywright\b|\be2e\b/iu,
  };

  const matched = task.testCommands.find((command) =>
    mapping[label]?.test(command),
  );
  return matched ?? label;
}

function inferExecutionMode(
  executionResult: ExecutionResult,
): "real" | "simulated" {
  const combined = [...executionResult.stdout, ...executionResult.stderr].join("\n");
  return /\[(install|typecheck|test|build|e2e):(stdout|stderr)\]/iu.test(
    combined,
  )
    ? "real"
    : "simulated";
}

function buildGithubPrGate(notes: string[]): ApiCheckEvidence | undefined {
  const metadata = new Map<string, string>();
  for (const note of notes) {
    const match = note.match(/^github-pr:(?<key>[^=]+)=(?<value>.+)$/u);
    if (!match?.groups) {
      continue;
    }
    metadata.set(match.groups.key, match.groups.value);
  }

  const pullRequestUrl = metadata.get("pull_request");
  if (!pullRequestUrl) {
    return undefined;
  }

  const branchName = metadata.get("head");
  return {
    kind: "api_check",
    name: "GitHub PR Checks",
    method: "GITHUB",
    endpoint: pullRequestUrl,
    status: "blocked",
    responseSummary: branchName
      ? `等待 GitHub checks 通过，head=${branchName}`
      : "等待 GitHub checks 通过",
  };
}
