import type {
  AcceptanceCheck,
  AcceptanceEvaluationReport,
  AcceptanceEvidence,
} from "../domain/acceptance.js";

export class AcceptanceReportRenderer {
  render(report: AcceptanceEvaluationReport): string {
    const lines = ["# 验收报告", ""];

    lines.push("## 检查项");
    for (const check of report.checks) {
      lines.push(this.renderCheck(check));
    }

    lines.push("");
    lines.push("## 证据");
    for (const evidence of report.evidence) {
      lines.push(this.renderEvidence(evidence));
    }

    lines.push("");
    lines.push("## 异常");
    if (report.anomalies.length === 0) {
      lines.push("- 无");
    } else {
      for (const anomaly of report.anomalies) {
        lines.push(`- ${anomaly}`);
      }
    }

    return lines.join("\n");
  }

  private renderCheck(check: AcceptanceCheck): string {
    return `- [${check.status}] ${check.label}: ${check.summary}`;
  }

  private renderEvidence(evidence: AcceptanceEvidence): string {
    switch (evidence.kind) {
      case "test_command":
        return `- [${evidence.status}] 命令 ${evidence.command} (exit=${evidence.exitCode ?? "null"}, duration=${evidence.durationMs}ms)`;
      case "api_check":
        return `- [${evidence.status}] API ${evidence.method} ${evidence.endpoint} (${evidence.statusCode ?? "n/a"})`;
      case "build_log":
      case "runtime_log":
      case "note":
        return `- [${evidence.status}] ${evidence.kind}: ${evidence.message}`;
      case "screenshot":
      case "trace":
        return `- [${evidence.status}] ${evidence.kind} ${evidence.name}: ${evidence.path}`;
      case "playwright":
        return `- [${evidence.status}] Playwright total=${evidence.summary.total} failed=${evidence.summary.failed}`;
    }
  }
}
