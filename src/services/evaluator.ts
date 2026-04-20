import { DEFAULT_KNOWLEDGE_THRESHOLDS } from "../config/defaults.js";
import type {
  AcceptanceCheck,
  AcceptanceEvaluationInput,
  AcceptanceEvaluationReport,
  AcceptanceEvidence,
  AcceptanceResult,
  KnowledgeDraft,
  ApiCheckEvidence,
  ArtifactEvidence,
  LogEvidence,
  PlaywrightEvidence,
  TestCommandEvidence,
} from "../domain/acceptance.js";
import type { TaskUnit } from "../domain/task-unit.js";

export class Evaluator {
  evaluate(
    task: TaskUnit,
    input: AcceptanceEvaluationInput = {},
  ): AcceptanceResult {
    const report = this.buildReport(task, input);
    const status = this.decideStatus(report);
    const rootCause = this.inferRootCause(report);
    const reusableScore = this.scoreReusability(task, status, report);
    const noveltyScore = this.scoreNovelty(task, report);
    const confidence = this.scoreConfidence(status, report);
    const stabilityScore = this.scoreStability(task, status, report);
    const impactScore = task.priority === "high" ? 0.8 : 0.55;

    const recommendedAction =
      status === "passed" &&
      reusableScore >= DEFAULT_KNOWLEDGE_THRESHOLDS.reusableScore &&
      stabilityScore >= DEFAULT_KNOWLEDGE_THRESHOLDS.stabilityScore &&
      confidence >= DEFAULT_KNOWLEDGE_THRESHOLDS.confidence
        ? "capture"
        : status === "blocked"
          ? "review"
        : "ignore";

    return {
      status,
      summary: this.buildSummary(task, status, report),
      acceptanceChecks: report.checks.map(
        (check) => `${check.label}: ${check.status}`,
      ),
      evidence: report.evidence.map((evidence) => this.renderEvidenceLine(evidence)),
      rootCause,
      autoFixable: this.isAutoFixable(status, report),
      requiresHuman: status === "blocked",
      nextAction: this.nextAction(status),
      knowledgeSignal: {
        reusableScore,
        noveltyScore,
        confidence,
        stabilityScore,
        impactScore,
        candidateType: task.knowledgePolicy?.candidateType ?? "pattern",
        recommendedAction,
      },
      knowledgeDraft: this.buildKnowledgeDraft(task, status, report),
    };
  }

  buildReport(
    task: TaskUnit,
    input: AcceptanceEvaluationInput = {},
  ): AcceptanceEvaluationReport {
    const evidence = this.collectEvidence(input);
    const checks = this.buildChecks(task, evidence);
    const anomalies = this.detectAnomalies(task, evidence, checks);
    return { checks, evidence, anomalies };
  }

  private collectEvidence(
    input: AcceptanceEvaluationInput,
  ): AcceptanceEvidence[] {
    const evidence: AcceptanceEvidence[] = [];

    for (const result of input.testCommands ?? []) {
      evidence.push(result);
    }
    for (const apiCheck of input.apiChecks ?? []) {
      evidence.push(apiCheck);
    }
    for (const message of input.buildLogs ?? []) {
      evidence.push({ kind: "build_log", status: "passed", message });
    }
    for (const message of input.runtimeLogs ?? []) {
      evidence.push({ kind: "runtime_log", status: "passed", message });
    }
    for (const artifact of input.screenshots ?? []) {
      evidence.push({ ...artifact, kind: "screenshot" });
    }
    for (const artifact of input.traces ?? []) {
      evidence.push({ ...artifact, kind: "trace" });
    }
    for (const note of input.notes ?? []) {
      evidence.push({ kind: "note", status: "passed", message: note });
    }
    if (input.playwright) {
      evidence.push({
        kind: "playwright",
        status: input.playwright.status === "passed" ? "passed" : "failed",
        summary: input.playwright,
      });
      for (const screenshot of input.playwright.screenshots) {
        evidence.push({
          kind: "screenshot",
          name: screenshot.name,
          status: "failed",
          path: screenshot.path,
        });
      }
      for (const trace of input.playwright.traces) {
        evidence.push({
          kind: "trace",
          name: trace.name,
          status: "failed",
          path: trace.path,
        });
      }
    }

    return evidence;
  }

  private buildChecks(
    task: TaskUnit,
    evidence: AcceptanceEvidence[],
  ): AcceptanceCheck[] {
    const checks: AcceptanceCheck[] = task.acceptanceCriteria.map((criterion, index) => ({
      checkId: `criterion-${index + 1}`,
      label: criterion,
      status: this.inferCriterionStatus(criterion, evidence),
      summary: this.inferCriterionSummary(criterion, evidence),
      evidenceKeys: this.matchEvidenceKeys(criterion, evidence),
    }));

    for (const item of evidence) {
      if (item.kind === "test_command") {
        checks.push({
          checkId: `command-${checks.length + 1}`,
          label: `命令 ${item.command}`,
          status: item.status,
          summary:
            item.status === "passed"
              ? "测试命令通过"
              : item.timedOut
                ? "测试命令超时"
                : "测试命令失败",
          evidenceKeys: [item.command],
        });
      }

      if (item.kind === "api_check") {
        checks.push({
          checkId: `api-${checks.length + 1}`,
          label: item.name,
          status: item.status,
          summary:
            item.status === "passed"
              ? "API 检查通过"
              : "API 检查失败",
          evidenceKeys: [`${item.method} ${item.endpoint}`],
        });
      }

      if (item.kind === "playwright") {
        checks.push({
          checkId: `playwright-${checks.length + 1}`,
          label: "Playwright 浏览器验收",
          status: item.status,
          summary:
            item.status === "passed"
              ? "浏览器验收通过"
              : "浏览器验收失败",
          evidenceKeys: ["playwright-summary"],
        });
      }
    }

    if (checks.length === 0) {
      checks.push({
        checkId: "baseline-1",
        label: "基础规格检查",
        status: "blocked",
        summary: "缺少可执行验收检查项",
        evidenceKeys: [],
      });
    }

    return checks;
  }

  private detectAnomalies(
    task: TaskUnit,
    evidence: AcceptanceEvidence[],
    checks: AcceptanceCheck[],
  ): string[] {
    const anomalies: string[] = [];

    if (checks.length === 1 && checks[0]?.checkId === "baseline-1") {
      anomalies.push(`任务 ${task.taskId} 缺少可执行验收检查项。`);
    }

    for (const item of evidence) {
      if (item.kind === "test_command" && item.status !== "passed") {
        if (item.stderr.length === 0 && item.stdout.length === 0) {
          anomalies.push(`测试命令 ${item.command} 失败但没有 stdout/stderr 证据。`);
        }
      }

      if (item.kind === "api_check" && item.status !== "passed") {
        if (item.statusCode === undefined && !item.responseSummary) {
          anomalies.push(`API 检查 ${item.name} 失败但没有状态码或响应摘要。`);
        }
      }

      if (item.kind === "playwright" && item.status !== "passed") {
        if (item.summary.evidence.length === 0) {
          anomalies.push("Playwright 失败但没有错误证据。");
        }
      }
    }

    return anomalies;
  }

  private decideStatus(report: AcceptanceEvaluationReport): AcceptanceResult["status"] {
    if (report.anomalies.length > 0) {
      return "blocked";
    }

    if (report.checks.some((check) => check.status === "blocked")) {
      return "blocked";
    }

    if (report.checks.some((check) => check.status === "failed")) {
      return "failed";
    }

    return "passed";
  }

  private inferRootCause(report: AcceptanceEvaluationReport): string {
    if (report.anomalies.length > 0) {
      return report.anomalies.join("；");
    }

    for (const evidence of report.evidence) {
      if (evidence.kind === "test_command" && evidence.status !== "passed") {
        return evidence.stderr[0] ?? evidence.stdout[0] ?? "测试命令失败";
      }
      if (evidence.kind === "api_check" && evidence.status !== "passed") {
        return evidence.responseSummary ?? "API 检查失败";
      }
      if (evidence.kind === "playwright" && evidence.status !== "passed") {
        return evidence.summary.evidence[0] ?? "Playwright 验收失败";
      }
    }

    return "";
  }

  private buildSummary(
    task: TaskUnit,
    status: AcceptanceResult["status"],
    report: AcceptanceEvaluationReport,
  ): string {
    if (status === "passed") {
      return `${task.title} 验收通过，共 ${report.checks.length} 项检查。`;
    }
    if (status === "failed") {
      return `${task.title} 验收失败，存在 ${report.checks.filter((check) => check.status === "failed").length} 项失败检查。`;
    }
    return `${task.title} 验收阻塞，需要补充根因或人工判断。`;
  }

  private nextAction(status: AcceptanceResult["status"]): string {
    if (status === "passed") {
      return "进入知识门控或下游任务";
    }
    if (status === "failed") {
      return "修复失败项后重新执行验收";
    }
    return "补充证据或转人工处理";
  }

  private isAutoFixable(
    status: AcceptanceResult["status"],
    report: AcceptanceEvaluationReport,
  ): boolean {
    if (status !== "failed") {
      return false;
    }

    return report.evidence.every((item) => {
      if (item.kind === "test_command") {
        return item.status === "passed" || item.exitCode === 1;
      }
      if (item.kind === "api_check") {
        return item.status === "passed" || (item.statusCode ?? 500) < 500;
      }
      return true;
    });
  }

  private scoreReusability(
    task: TaskUnit,
    status: AcceptanceResult["status"],
    report: AcceptanceEvaluationReport,
  ): number {
    if (status !== "passed") {
      return 0.2;
    }

    const base = task.type.startsWith("knowledge_") ? 0.82 : task.type === "acceptance" ? 0.79 : 0.74;
    const evidenceBoost = report.evidence.some((item) => item.kind === "playwright")
      ? 0.03
      : 0;
    const realExecutionBoost = this.hasRealExecutionEvidence(report) ? 0.03 : -0.01;
    return clamp(base + evidenceBoost + realExecutionBoost);
  }

  private scoreNovelty(
    task: TaskUnit,
    report: AcceptanceEvaluationReport,
  ): number {
    const artifactCount = report.evidence.filter(
      (item) =>
        item.kind === "api_check" ||
        item.kind === "playwright" ||
        item.kind === "screenshot" ||
        item.kind === "trace",
    ).length;
    const base = task.type.startsWith("knowledge_") ? 0.61 : 0.45;
    return clamp(base + Math.min(artifactCount * 0.03, 0.12));
  }

  private scoreConfidence(
    status: AcceptanceResult["status"],
    report: AcceptanceEvaluationReport,
  ): number {
    if (status === "blocked") {
      return 0.45;
    }
    if (status === "failed") {
      return 0.63;
    }
    const commandCount = report.evidence.filter(
      (item) => item.kind === "test_command",
    ).length;
    const realExecutionBoost = this.hasRealExecutionEvidence(report) ? 0.04 : -0.02;
    return clamp(0.84 + Math.min(commandCount * 0.03, 0.09) + realExecutionBoost);
  }

  private scoreStability(
    task: TaskUnit,
    status: AcceptanceResult["status"],
    report: AcceptanceEvaluationReport,
  ): number {
    if (status !== "passed") {
      return 0.3;
    }
    const hasLogs = report.evidence.some(
      (item) => item.kind === "build_log" || item.kind === "runtime_log",
    );
    return clamp(
      (task.type === "acceptance" ? 0.84 : 0.8) +
        (hasLogs ? 0.04 : 0) +
        (this.hasRealExecutionEvidence(report) ? 0.02 : 0),
    );
  }

  private buildKnowledgeDraft(
    task: TaskUnit,
    status: AcceptanceResult["status"],
    report: AcceptanceEvaluationReport,
  ): KnowledgeDraft {
    const passedCommands = report.evidence
      .filter(
        (item): item is TestCommandEvidence =>
          item.kind === "test_command" && item.status === "passed",
      )
      .map((item) => item.command);
    const apiChecks = report.evidence
      .filter(
        (item): item is ApiCheckEvidence =>
          item.kind === "api_check" && item.status === "passed",
      )
      .map((item) => `${item.method} ${item.endpoint}`);
    const sourceRefs = unique([
      `task:${task.taskId}`,
      ...passedCommands.map((command) => `command:${command}`),
      ...apiChecks.map((api) => `api:${api}`),
      ...(report.evidence.some((item) => item.kind === "playwright")
        ? ["playwright:summary"]
        : []),
      this.hasRealExecutionEvidence(report)
        ? "execution:real"
        : "execution:simulated",
    ]);
    const constraints = unique([
      ...task.blockedConditions,
      ...(task.humanGate.triggerConditions ?? []),
    ]).slice(0, 4);

    if (status === "passed") {
      return {
        title: task.title,
        summary: [
          `已验证 ${task.goal}。`,
          passedCommands.length > 0
            ? `通过命令：${passedCommands.join("、")}。`
            : "未采集到显式测试命令输出。",
          apiChecks.length > 0 ? `接口证据：${apiChecks.join("、")}。` : "",
          report.evidence.some((item) => item.kind === "playwright")
            ? "浏览器验收已通过。"
            : "",
          this.hasRealExecutionEvidence(report)
            ? "本条知识来自真实执行证据。"
            : "本条知识主要来自模拟执行证据。",
        ]
          .filter(Boolean)
          .join(" "),
        recommendation: [
          `复用时优先保持：${task.goal}。`,
          passedCommands.length > 0
            ? `最低验证建议包含：${passedCommands.join("、")}。`
            : `最低验证建议包含任务绑定测试：${task.testCommands.join("、")}。`,
        ].join(" "),
        constraints,
        sourceRefs,
        derivedFrom: [`status:${status}`, `task_type:${task.type}`],
      };
    }

    return {
      title: task.title,
      summary: `${task.title} 当前未形成可发布长期知识，状态为 ${status}。`,
      recommendation:
        status === "failed"
          ? `先修复失败项后再沉淀经验：${task.goal}。`
          : "先补齐证据或转人工判断后再决定是否沉淀。",
      constraints,
      sourceRefs,
      derivedFrom: [`status:${status}`, `task_type:${task.type}`],
    };
  }

  private hasRealExecutionEvidence(report: AcceptanceEvaluationReport): boolean {
    return report.evidence.some(
      (item) =>
        item.kind === "note" && item.message === "execution_mode=real",
    );
  }

  private inferCriterionStatus(
    criterion: string,
    evidence: AcceptanceEvidence[],
  ): AcceptanceCheck["status"] {
    if (evidence.some((item) => this.matchesCriterion(criterion, item) && item.status === "blocked")) {
      return "blocked";
    }
    if (evidence.some((item) => this.matchesCriterion(criterion, item) && item.status === "failed")) {
      return "failed";
    }
    return "passed";
  }

  private inferCriterionSummary(
    criterion: string,
    evidence: AcceptanceEvidence[],
  ): string {
    const matched = evidence.filter((item) => this.matchesCriterion(criterion, item));
    if (matched.length === 0) {
      return "未提供专属证据，按基础通过处理";
    }
    if (matched.some((item) => item.status === "blocked")) {
      return "检查项存在阻塞证据";
    }
    if (matched.some((item) => item.status === "failed")) {
      return "检查项存在失败证据";
    }
    return "检查项证据通过";
  }

  private matchEvidenceKeys(
    criterion: string,
    evidence: AcceptanceEvidence[],
  ): string[] {
    return evidence
      .filter((item) => this.matchesCriterion(criterion, item))
      .map((item) => {
        switch (item.kind) {
          case "test_command":
            return item.command;
          case "api_check":
            return `${item.method} ${item.endpoint}`;
          case "screenshot":
          case "trace":
            return item.path;
          case "build_log":
          case "runtime_log":
          case "note":
            return item.message;
          case "playwright":
            return "playwright-summary";
        }
      });
  }

  private matchesCriterion(
    criterion: string,
    evidence: AcceptanceEvidence,
  ): boolean {
    const normalizedCriterion = criterion.toLowerCase();
    switch (evidence.kind) {
      case "test_command":
        return normalizedCriterion.includes("测试") || normalizedCriterion.includes("test");
      case "api_check":
        return normalizedCriterion.includes("接口") || normalizedCriterion.includes("api");
      case "playwright":
      case "screenshot":
      case "trace":
        return (
          normalizedCriterion.includes("playwright") ||
          normalizedCriterion.includes("浏览器") ||
          normalizedCriterion.includes("页面")
        );
      default:
        return false;
    }
  }

  private renderEvidenceLine(evidence: AcceptanceEvidence): string {
    switch (evidence.kind) {
      case "test_command":
        return `命令 ${evidence.command} => ${evidence.status} (exit=${evidence.exitCode ?? "null"})`;
      case "api_check":
        return `API ${evidence.method} ${evidence.endpoint} => ${evidence.status}`;
      case "build_log":
      case "runtime_log":
      case "note":
        return evidence.message;
      case "screenshot":
      case "trace":
        return `${evidence.kind}:${evidence.path}`;
      case "playwright":
        return `Playwright total=${evidence.summary.total} failed=${evidence.summary.failed}`;
    }
  }
}

function clamp(value: number): number {
  return Math.max(0, Math.min(1, Number(value.toFixed(2))));
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}
