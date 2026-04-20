import type { FeishuHumanGateCard, FeishuMessageReceipt } from "../domain/external.js";

import { AppError } from "../core/errors/app-error.js";

export interface FeishuAdapterOptions {
  fetchImpl?: typeof fetch;
}

export class FeishuAdapter {
  private readonly fetchImpl: typeof fetch;

  constructor(options: FeishuAdapterOptions = {}) {
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async sendText(
    webhookUrl: string,
    text: string,
  ): Promise<FeishuMessageReceipt> {
    return this.send(webhookUrl, {
      msg_type: "text",
      content: {
        text,
      },
    });
  }

  async sendHumanGateCard(
    webhookUrl: string,
    card: FeishuHumanGateCard,
  ): Promise<FeishuMessageReceipt> {
    return this.send(webhookUrl, {
      msg_type: "interactive",
      card: {
        config: { wide_screen_mode: true },
        header: {
          title: {
            tag: "plain_text",
            content: `AgentForge 人工介入：${card.intervention.type}`,
          },
        },
        elements: [
          {
            tag: "markdown",
            content: [
              `**事件**：${card.incident.summary}`,
              `**等级**：${card.incident.severity}`,
              `**介入说明**：${card.intervention.summary}`,
              `**证据**：${card.incident.evidence.join("；") || "无"}`,
            ].join("\n"),
          },
          {
            tag: "action",
            actions: card.actions.map((action) => ({
              tag: "button",
              text: {
                tag: "plain_text",
                content: action.text,
              },
              type: "primary",
              value: {
                action: action.value,
                plan_id: card.planId,
                task_id: card.taskId,
                related_id: card.intervention.relatedId,
              },
            })),
          },
        ],
      },
    });
  }

  private async send(
    webhookUrl: string,
    body: Record<string, unknown>,
  ): Promise<FeishuMessageReceipt> {
    const response = await this.fetchImpl(webhookUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new AppError({
        code: "EXTERNAL_UNAVAILABLE",
        message: "飞书 webhook 调用失败。",
        details: {
          status: response.status,
          body: await response.text(),
        },
      });
    }

    const payload = (await response.json()) as {
      code?: number;
      msg?: string;
      request_id?: string;
    };

    return {
      ok: payload.code === 0 || payload.code === undefined,
      requestId: payload.request_id,
      message: payload.msg,
    };
  }
}
