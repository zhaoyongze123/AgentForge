import assert from "node:assert/strict";
import test from "node:test";

import type { TaskUnit } from "../src/domain/task-unit.js";
import { acceptanceResultFixture, taskUnitFixture } from "../src/contracts/fixtures.js";
import { AcceptanceCommandCollector } from "../src/services/acceptance-command-collector.js";
import { AcceptanceReportRenderer } from "../src/services/acceptance-report-renderer.js";
import { buildAcceptanceInputFromExecution } from "../src/services/execution-acceptance-input.js";
import { Evaluator } from "../src/services/evaluator.js";

function createTask(overrides: Partial<TaskUnit> = {}): TaskUnit {
  return {
    ...taskUnitFixture,
    ...overrides,
  };
}

test("Evaluator 会在测试、API 与 Playwright 证据全部通过时返回 passed", () => {
  const evaluator = new Evaluator();
  const task = createTask({
    type: "acceptance",
    acceptanceCriteria: ["API 接口检查通过", "浏览器页面验收通过", "测试命令通过"],
  });

  const result = evaluator.evaluate(task, {
    testCommands: [
      {
        kind: "test_command",
        command: "npm test",
        status: "passed",
        durationMs: 1200,
        exitCode: 0,
        stdout: ["tests passed"],
        stderr: [],
      },
    ],
    apiChecks: [
      {
        kind: "api_check",
        name: "注册接口",
        method: "POST",
        endpoint: "/api/register",
        status: "passed",
        statusCode: 200,
        responseSummary: "created",
      },
    ],
    playwright: {
      status: "passed",
      total: 3,
      passed: 3,
      failed: 0,
      skipped: 0,
      durationMs: 2300,
      evidence: [],
      screenshots: [],
      traces: [],
    },
    buildLogs: ["build ok"],
  });

  assert.equal(result.status, "passed");
  assert.equal(result.knowledgeSignal.recommendedAction, "capture");
  assert.equal(result.evidence.some((item) => item.includes("Playwright total=3")), true);
  assert.equal(result.knowledgeDraft?.sourceRefs.includes("command:npm test"), true);
  assert.equal(result.knowledgeDraft?.summary.includes("通过命令"), true);
});

test("Evaluator 会在测试命令失败且根因明确时返回 failed", () => {
  const evaluator = new Evaluator();
  const result = evaluator.evaluate(createTask(), {
    testCommands: [
      {
        kind: "test_command",
        command: "npm test",
        status: "failed",
        durationMs: 900,
        exitCode: 1,
        stdout: [],
        stderr: ["expected 200 but got 500"],
      },
    ],
  });

  assert.equal(result.status, "failed");
  assert.equal(result.autoFixable, true);
  assert.equal(result.rootCause, "expected 200 but got 500");
  assert.equal(result.knowledgeSignal.recommendedAction, "ignore");
});

test("Evaluator 会在失败缺少根因时返回 blocked", () => {
  const evaluator = new Evaluator();
  const result = evaluator.evaluate(createTask(), {
    testCommands: [
      {
        kind: "test_command",
        command: "npm test",
        status: "failed",
        durationMs: 800,
        exitCode: 1,
        stdout: [],
        stderr: [],
      },
    ],
  });

  assert.equal(result.status, "blocked");
  assert.equal(result.requiresHuman, true);
  assert.equal(result.rootCause.includes("没有 stdout/stderr 证据"), true);
  assert.equal(result.knowledgeSignal.recommendedAction, "review");
});

test("AcceptanceCommandCollector 可执行命令并采集输出", async () => {
  const collector = new AcceptanceCommandCollector();
  const results = await collector.collect(
    createTask({
      testCommands: ["printf 'ok-from-command'"],
    }),
    {
      timeoutMs: 5000,
    },
  );

  assert.equal(results.length, 1);
  assert.equal(results[0]?.status, "passed");
  assert.equal(results[0]?.stdout.join("\n").includes("ok-from-command"), true);
});

test("AcceptanceReportRenderer 会输出结构化 Markdown 报告", () => {
  const renderer = new AcceptanceReportRenderer();
  const report = new Evaluator().buildReport(createTask(), {
    testCommands: [
      {
        kind: "test_command",
        command: "npm test",
        status: "passed",
        durationMs: 100,
        exitCode: 0,
        stdout: ["pass"],
        stderr: [],
      },
    ],
    notes: ["人工复核通过"],
  });

  const markdown = renderer.render(report);
  assert.equal(markdown.includes("# 验收报告"), true);
  assert.equal(markdown.includes("命令 npm test"), true);
  assert.equal(markdown.includes("人工复核通过"), true);
});

test("Acceptance fixture 仍满足新的 Evaluator 语义", () => {
  assert.equal(acceptanceResultFixture.status, "passed");
  assert.equal(acceptanceResultFixture.knowledgeSignal.recommendedAction, "capture");
  assert.equal(
    acceptanceResultFixture.knowledgeDraft?.sourceRefs.includes(
      "task:backend-user-register",
    ),
    true,
  );
});

test("执行结果会被转换成 Evaluator 可消费的真实命令证据", () => {
  const input = buildAcceptanceInputFromExecution(createTask(), {
    executor: "codex",
    status: "succeeded",
    stdout: [
      "[typecheck:stdout] tsc ok",
      "[test:stdout] tests passed",
      "[build:stdout] build ok",
    ],
    stderr: [],
    logs: [
      {
        level: "info",
        message: "codex 执行完成",
        timestamp: "2026-04-17T00:00:00.000Z",
      },
    ],
    exitCode: 0,
    durationMs: 1234,
    evidence: [],
  });

  assert.equal(input.testCommands?.length, 3);
  assert.equal(input.notes?.includes("execution_mode=real"), true);
});

test("模拟执行结果在缺少真实外部证据时会被阻塞", () => {
  const evaluator = new Evaluator();
  const task = createTask({
    acceptanceCriteria: ["任务绑定测试命令通过"],
    testCommands: ["npm test"],
  });

  const input = buildAcceptanceInputFromExecution(task, {
    executor: "codex",
    status: "succeeded",
    stdout: ["tests passed"],
    stderr: [],
    logs: [],
    exitCode: 0,
    durationMs: 321,
    evidence: [],
  });
  const result = evaluator.evaluate(task, input);

  assert.equal(input.notes?.includes("execution_mode=simulated"), true);
  assert.equal(result.status, "blocked");
  assert.equal(result.rootCause.includes("缺少真实验收证据"), true);
  assert.equal(result.rootCause.includes("当前仅有 simulated 证据"), true);
});

test("GitHub PR 已创建但 checks 未回流时验收会保持 blocked", () => {
  const evaluator = new Evaluator();
  const task = createTask({
    acceptanceCriteria: ["PR checks 未绿时任务不能 passed"],
  });

  const input = buildAcceptanceInputFromExecution(task, {
    executor: "codex",
    status: "succeeded",
    stdout: [
      "[test:stdout] tests passed",
      "[github-pr:stdout] pull_request=https://github.com/tester/agentforge/pull/12",
      "[github-pr:stdout] head=task/plan-1/backend-user-register",
    ],
    stderr: [],
    logs: [],
    exitCode: 0,
    durationMs: 900,
    evidence: [],
  });
  const result = evaluator.evaluate(task, input);

  assert.equal(result.status, "blocked");
  assert.equal(
    result.acceptanceChecks.some((check) =>
      check.includes("GitHub PR Checks: blocked"),
    ),
    true,
  );
  assert.equal(
    result.evidence.some((line) => line.includes("API GITHUB https://github.com/tester/agentforge/pull/12 => blocked")),
    true,
  );
});

test("执行结果中的 Playwright summary 会被转换成结构化验收证据", () => {
  const summary = {
    status: "failed" as const,
    total: 1,
    passed: 0,
    failed: 1,
    skipped: 0,
    durationMs: 321,
    evidence: ["locator timeout"],
    screenshots: [
      {
        name: "error",
        contentType: "image/png",
        path: "/tmp/artifacts/error.png",
      },
    ],
    traces: [
      {
        name: "trace",
        contentType: "application/zip",
        path: "/tmp/artifacts/trace.zip",
      },
    ],
  };
  const task = createTask({
    type: "acceptance",
    acceptanceCriteria: ["浏览器页面验收通过"],
  });

  const input = buildAcceptanceInputFromExecution(task, {
    executor: "codex",
    status: "failed",
    stdout: [
      `[playwright:stdout] summary=${JSON.stringify(summary)}`,
    ],
    stderr: ["[e2e:stderr] playwright failed"],
    logs: [],
    exitCode: 1,
    durationMs: 700,
    evidence: [],
    failureClassification: "blocked",
    reason: "blocked",
  });
  const result = new Evaluator().evaluate(task, input);

  assert.equal(input.playwright?.failed, 1);
  assert.equal(input.playwright?.screenshots[0]?.path, "/tmp/artifacts/error.png");
  assert.equal(input.playwright?.traces[0]?.path, "/tmp/artifacts/trace.zip");
  assert.equal(result.status, "failed");
  assert.equal(result.rootCause, "locator timeout");
  assert.equal(
    result.evidence.some((line) => line.includes("screenshot:/tmp/artifacts/error.png")),
    true,
  );
  assert.equal(
    result.evidence.some((line) => line.includes("trace:/tmp/artifacts/trace.zip")),
    true,
  );
});
