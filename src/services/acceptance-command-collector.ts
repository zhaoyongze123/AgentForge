import { spawn } from "node:child_process";

import type { TaskUnit } from "../domain/task-unit.js";
import type { TestCommandEvidence } from "../domain/acceptance.js";

export interface AcceptanceCommandCollectorOptions {
  cwd?: string;
  timeoutMs?: number;
  shell?: string;
}

export class AcceptanceCommandCollector {
  async collect(
    task: TaskUnit,
    options: AcceptanceCommandCollectorOptions = {},
  ): Promise<TestCommandEvidence[]> {
    const results: TestCommandEvidence[] = [];
    for (const command of task.testCommands) {
      results.push(await this.runCommand(command, options));
    }
    return results;
  }

  async runCommand(
    command: string,
    options: AcceptanceCommandCollectorOptions = {},
  ): Promise<TestCommandEvidence> {
    const startedAt = Date.now();
    const stdout: string[] = [];
    const stderr: string[] = [];
    const shell = options.shell ?? process.env.SHELL ?? "/bin/sh";
    const timeoutMs = options.timeoutMs ?? 30_000;

    return await new Promise<TestCommandEvidence>((resolve) => {
      const child = spawn(shell, ["-lc", command], {
        cwd: options.cwd,
        stdio: ["ignore", "pipe", "pipe"],
      });

      let finished = false;
      let timedOut = false;
      let exitCode: number | null = null;

      const finalize = (code: number | null) => {
        if (finished) {
          return;
        }
        finished = true;
        clearTimeout(timer);
        exitCode = code;
        resolve({
          kind: "test_command",
          command,
          status:
            timedOut || code !== 0
              ? timedOut
                ? "blocked"
                : "failed"
              : "passed",
          durationMs: Date.now() - startedAt,
          exitCode,
          stdout,
          stderr,
          timedOut,
          cwd: options.cwd,
        });
      };

      const timer = setTimeout(() => {
        timedOut = true;
        child.kill("SIGTERM");
      }, timeoutMs);

      child.stdout.on("data", (chunk) => {
        stdout.push(String(chunk).trimEnd());
      });
      child.stderr.on("data", (chunk) => {
        stderr.push(String(chunk).trimEnd());
      });
      child.on("error", (error) => {
        stderr.push(error.message);
        finalize(1);
      });
      child.on("close", (code) => finalize(code));
    });
  }
}
