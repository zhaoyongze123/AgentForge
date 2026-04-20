import { redactSensitiveData } from "../security/redaction.js";

export interface LogContext {
  [key: string]: unknown;
}

export interface LogEntry {
  level: "info" | "warn" | "error";
  message: string;
  timestamp: string;
  context?: LogContext;
}

export class Logger {
  info(message: string, context?: LogContext): void {
    this.write({
      level: "info",
      message,
      timestamp: new Date().toISOString(),
      context,
    });
  }

  warn(message: string, context?: LogContext): void {
    this.write({
      level: "warn",
      message,
      timestamp: new Date().toISOString(),
      context,
    });
  }

  error(message: string, context?: LogContext): void {
    this.write({
      level: "error",
      message,
      timestamp: new Date().toISOString(),
      context,
    });
  }

  private write(entry: LogEntry): void {
    const line = JSON.stringify(redactSensitiveData(entry));
    if (entry.level === "error") {
      console.error(line);
      return;
    }

    console.log(line);
  }
}
