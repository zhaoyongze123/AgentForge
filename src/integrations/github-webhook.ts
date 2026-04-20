import { createHmac, timingSafeEqual } from "node:crypto";
import type { IncomingHttpHeaders } from "node:http";

import type { AppEnv } from "../core/config/env.js";
import { AppError } from "../core/errors/app-error.js";

interface GithubWebhookPayloadRepository {
  owner?: {
    login?: string;
  };
  name?: string;
}

interface GithubWebhookPayload {
  action?: string;
  repository?: GithubWebhookPayloadRepository;
  pull_request?: {
    number?: number;
    head?: {
      ref?: string;
    };
  };
  check_run?: {
    name?: string;
    status?: string;
    conclusion?: string | null;
    head_branch?: string;
    html_url?: string;
    details_url?: string;
    pull_requests?: Array<{ number?: number }>;
    check_suite?: {
      head_branch?: string;
    };
  };
  check_suite?: {
    status?: string;
    conclusion?: string | null;
    head_branch?: string;
    pull_requests?: Array<{ number?: number }>;
  };
}

export interface GithubWebhookEvent {
  deliveryId: string;
  event: string;
  action?: string;
  repository: {
    owner: string;
    repo: string;
  };
  branchName?: string;
  pullNumber?: number;
  checkName?: string;
  status?: string;
  conclusion?: string | null;
  detailsUrl?: string;
  raw: Record<string, unknown>;
}

export class GithubWebhookHandler {
  constructor(private readonly env: AppEnv) {}

  handle(
    rawBody: string,
    headers: IncomingHttpHeaders,
  ): GithubWebhookEvent {
    const event = readHeader(headers, "x-github-event");
    if (!event) {
      throw new AppError({
        code: "AUTH_INVALID",
        message: "GitHub webhook 缺少 x-github-event。",
      });
    }

    this.assertSignature(rawBody, headers);

    const payload = JSON.parse(rawBody || "{}") as GithubWebhookPayload;
    const owner = payload.repository?.owner?.login;
    const repo = payload.repository?.name;
    if (!owner || !repo) {
      throw new AppError({
        code: "AUTH_INVALID",
        message: "GitHub webhook 缺少 repository 信息。",
      });
    }

    const deliveryId =
      readHeader(headers, "x-github-delivery") ??
      `github-delivery-${Date.now()}`;
    const checkRun = payload.check_run;
    const checkSuite = payload.check_suite;

    return {
      deliveryId,
      event,
      action: payload.action,
      repository: {
        owner,
        repo,
      },
      branchName:
        checkRun?.head_branch ??
        checkRun?.check_suite?.head_branch ??
        checkSuite?.head_branch ??
        payload.pull_request?.head?.ref,
      pullNumber:
        checkRun?.pull_requests?.[0]?.number ??
        checkSuite?.pull_requests?.[0]?.number ??
        payload.pull_request?.number,
      checkName: checkRun?.name,
      status: checkRun?.status ?? checkSuite?.status,
      conclusion: checkRun?.conclusion ?? checkSuite?.conclusion,
      detailsUrl: checkRun?.details_url ?? checkRun?.html_url,
      raw: payload as Record<string, unknown>,
    };
  }

  private assertSignature(
    rawBody: string,
    headers: IncomingHttpHeaders,
  ): void {
    if (!this.env.githubWebhookSecret) {
      return;
    }

    const signature = readHeader(headers, "x-hub-signature-256");
    if (!signature?.startsWith("sha256=")) {
      throw new AppError({
        code: "AUTH_INVALID",
        message: "GitHub webhook 缺少 x-hub-signature-256。",
      });
    }

    const expected = `sha256=${createHmac("sha256", this.env.githubWebhookSecret)
      .update(rawBody)
      .digest("hex")}`;
    const actualBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expected);

    if (
      actualBuffer.length !== expectedBuffer.length ||
      !timingSafeEqual(actualBuffer, expectedBuffer)
    ) {
      throw new AppError({
        code: "AUTH_INVALID",
        message: "GitHub webhook 签名校验失败。",
      });
    }
  }
}

function readHeader(
  headers: IncomingHttpHeaders,
  key: string,
): string | undefined {
  const value = headers[key];
  if (typeof value === "string" && value.trim()) {
    return value;
  }

  return Array.isArray(value) ? value[0] : undefined;
}
