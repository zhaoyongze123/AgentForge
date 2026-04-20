export type AppErrorCode =
  | "CONFIG_INVALID"
  | "CONFIG_MISSING"
  | "AUTH_INVALID"
  | "AUTH_REQUIRED"
  | "AUTH_FORBIDDEN"
  | "STATE_TRANSITION_INVALID"
  | "TASK_NOT_FOUND"
  | "TASK_DEPENDENCY_UNMET"
  | "TASK_CONFLICT"
  | "PERMISSION_DENIED"
  | "KNOWLEDGE_CONFLICT"
  | "BUDGET_EXCEEDED"
  | "EXTERNAL_UNAVAILABLE"
  | "EXECUTION_TIMEOUT"
  | "EXECUTION_CANCELLED";

export interface AppErrorOptions {
  code: AppErrorCode;
  message: string;
  details?: Record<string, unknown>;
  cause?: unknown;
}

export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(options: AppErrorOptions) {
    super(
      options.message,
      options.cause ? { cause: options.cause } : undefined,
    );
    this.name = "AppError";
    this.code = options.code;
    this.details = options.details;
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}
