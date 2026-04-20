import { createDecipheriv, createHash } from "node:crypto";

import type { AppEnv } from "../core/config/env.js";
import { AppError } from "../core/errors/app-error.js";

export interface FeishuCallbackResult {
  statusCode: number;
  body: Record<string, unknown>;
  cardAction?: FeishuCardAction;
}

export interface FeishuCardAction {
  action: string;
  planId?: string;
  taskId?: string;
  relatedId: string;
  actor: string;
  summary: string;
}

type FeishuPayload = Record<string, unknown>;

export class FeishuCallbackHandler {
  constructor(private readonly env: AppEnv) {}

  handle(rawBody: string): FeishuCallbackResult {
    this.assertConfigured();

    const payload = this.parsePayload(rawBody);
    this.assertVerificationToken(payload);

    if (payload.type === "url_verification") {
      return {
        statusCode: 200,
        body: {
          challenge: payload.challenge,
        },
      };
    }

    const cardAction = this.extractCardAction(payload);
    if (cardAction) {
      return {
        statusCode: 200,
        body: {
          toast: {
            type: "info",
            content: "AgentForge 已收到卡片动作",
            i18n: {
              zh_cn: "AgentForge 已收到卡片动作",
              en_us: "AgentForge received the card action",
            },
          },
        },
        cardAction,
      };
    }

    return {
      statusCode: 200,
      body: {
        code: 0,
        msg: "success",
      },
    };
  }

  private assertConfigured(): void {
    if (!this.env.feishuVerificationToken) {
      throw new AppError({
        code: "CONFIG_MISSING",
        message: "飞书事件回调缺少 FEISHU_VERIFICATION_TOKEN。",
        details: { key: "FEISHU_VERIFICATION_TOKEN" },
      });
    }
  }

  private parsePayload(rawBody: string): FeishuPayload {
    const outerPayload = JSON.parse(rawBody || "{}") as FeishuPayload;
    const encryptedPayload = outerPayload.encrypt;
    if (typeof encryptedPayload !== "string") {
      return outerPayload;
    }

    if (!this.env.feishuEncryptKey) {
      throw new AppError({
        code: "CONFIG_MISSING",
        message: "收到飞书加密事件，但缺少 FEISHU_ENCRYPT_KEY。",
        details: { key: "FEISHU_ENCRYPT_KEY" },
      });
    }

    return JSON.parse(this.decrypt(encryptedPayload)) as FeishuPayload;
  }

  private assertVerificationToken(payload: FeishuPayload): void {
    if (
      typeof payload.token === "string" &&
      payload.token !== this.env.feishuVerificationToken
    ) {
      throw new AppError({
        code: "AUTH_INVALID",
        message: "飞书事件 token 校验失败。",
      });
    }
  }

  private decrypt(encryptedPayload: string): string {
    const key = createHash("sha256")
      .update(this.env.feishuEncryptKey ?? "")
      .digest();
    const encryptedBuffer = Buffer.from(encryptedPayload, "base64");
    const iv = encryptedBuffer.subarray(0, 16);
    const cipherText = encryptedBuffer.subarray(16);
    const decipher = createDecipheriv("aes-256-cbc", key, iv);

    return Buffer.concat([
      decipher.update(cipherText),
      decipher.final(),
    ]).toString("utf8");
  }

  private extractCardAction(payload: FeishuPayload): FeishuCardAction | undefined {
    const actionValue = readActionValue(payload);
    if (!actionValue) {
      return undefined;
    }

    const action = readString(actionValue, ["action", "value"]);
    const planId = readString(actionValue, ["plan_id", "planId"]);
    const taskId = readString(actionValue, ["task_id", "taskId"]);
    const relatedId = readString(actionValue, [
      "related_id",
      "relatedId",
      "incident_id",
      "incidentId",
    ]) ?? taskId;

    if (!action || !relatedId) {
      return undefined;
    }

    return {
      action,
      planId,
      taskId,
      relatedId,
      actor: readActor(payload),
      summary: `飞书卡片动作 ${action}`,
    };
  }
}

function readActionValue(payload: FeishuPayload): Record<string, unknown> | undefined {
  const candidates = [
    payload.action,
    readObject(payload.event)?.action,
    readObject(payload.event)?.card,
    payload,
  ];

  for (const candidate of candidates) {
    const object = readObject(candidate);
    const value = readObject(object?.value);
    if (value) {
      return value;
    }

    if (
      object &&
      (object.action ||
        object.related_id ||
        object.relatedId ||
        object.task_id ||
        object.taskId ||
        object.plan_id ||
        object.planId)
    ) {
      return object;
    }
  }

  return undefined;
}

function readActor(payload: FeishuPayload): string {
  const user =
    readObject(payload.operator) ??
    readObject(readObject(payload.event)?.operator) ??
    readObject(payload.user) ??
    readObject(readObject(payload.event)?.user);

  return (
    readString(user, ["open_id", "openId", "user_id", "userId"]) ?? "feishu"
  );
}

function readObject(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : undefined;
}

function readString(
  value: unknown,
  keys: string[],
): string | undefined {
  const object = readObject(value);
  if (!object) {
    return undefined;
  }

  for (const key of keys) {
    const item = object[key];
    if (typeof item === "string" && item.trim()) {
      return item;
    }
  }

  return undefined;
}
