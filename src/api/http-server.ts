import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { URL } from "node:url";

import { isAppError } from "../core/errors/app-error.js";
import type { AppEnv } from "../core/config/env.js";
import { renderConsoleHtml, renderConsoleScript } from "./console-app.js";
import {
  requireControlPlaneAuth,
  requireHumanGateAuth,
  requireProjectAccess,
  resolveProjectIdFromRequest,
} from "../core/security/auth.js";
import { redactJsonString } from "../core/security/redaction.js";
import { FeishuCallbackHandler } from "../integrations/feishu-callback.js";
import { ControlPlaneService } from "./control-plane-service.js";

export function createHttpApp(env: AppEnv) {
  const service = new ControlPlaneService(env);
  const feishuCallbackHandler = new FeishuCallbackHandler(env);

  return createServer(async (request, response) => {
    try {
      const method = request.method ?? "GET";
      const url = new URL(request.url ?? "/", "http://127.0.0.1");
      const pathname = url.pathname;

      if (method === "GET" && pathname === "/health") {
        return json(response, 200, { ok: true });
      }

      if (method === "GET" && pathname === "/console") {
        return text(response, 200, renderConsoleHtml(), "text/html; charset=utf-8");
      }

      if (method === "GET" && pathname === "/console/app.js") {
        return text(response, 200, renderConsoleScript(), "text/javascript; charset=utf-8");
      }

      if (method === "GET" && pathname === "/metrics") {
        const metrics = await service.renderPrometheusMetrics();
        return text(response, 200, metrics, "text/plain; version=0.0.4; charset=utf-8");
      }

      if (method === "GET" && pathname === "/api/metrics/snapshot") {
        requireControlPlaneAuth(request, env);
        return json(response, 200, await service.getMetricsSnapshot());
      }

      const testTaskStatusMatch = pathname.match(/^\/api\/test\/tasks\/([^/]+)\/status$/);
      if (env.nodeEnv === "test" && method === "POST" && testTaskStatusMatch) {
        const body = await readJson(request);
        const result = await service.updateTaskStatus(
          decodeURIComponent(testTaskStatusMatch[1] ?? ""),
          String(body.status ?? "") as never,
          typeof body.planId === "string" ? body.planId : undefined,
        );
        return json(response, 200, result);
      }

      if (
        method === "POST" &&
        (pathname === "/feishu/events" || pathname === "/api/feishu/events")
      ) {
        const rawBody = await readText(request);
        console.log(
          JSON.stringify({
            level: "info",
            message: "收到飞书事件回调",
            pathname,
            bytes: Buffer.byteLength(rawBody),
            body: redactJsonString(rawBody.slice(0, 4000)),
            timestamp: new Date().toISOString(),
          }),
        );
        const result = feishuCallbackHandler.handle(rawBody);
        if (result.cardAction) {
          const cardActionResult = await service.processFeishuCardAction(
            result.cardAction,
          );
          return json(response, result.statusCode, {
            ...result.body,
            data: cardActionResult,
          });
        }

        return json(response, result.statusCode, result.body);
      }

      if (
        method === "POST" &&
        (pathname === "/feishu/card-actions" ||
          pathname === "/api/feishu/card-actions")
      ) {
        const rawBody = await readText(request);
        console.log(
          JSON.stringify({
            level: "info",
            message: "收到飞书卡片动作回调",
            pathname,
            bytes: Buffer.byteLength(rawBody),
            body: redactJsonString(rawBody.slice(0, 4000)),
            timestamp: new Date().toISOString(),
          }),
        );
        const result = feishuCallbackHandler.handle(rawBody);
        if (result.cardAction) {
          const cardActionResult = await service.processFeishuCardAction(
            result.cardAction,
          );
          return json(response, result.statusCode, {
            ...result.body,
            data: cardActionResult,
          });
        }

        return json(response, result.statusCode, result.body);
      }

      if (method === "POST" && pathname === "/api/plans") {
        requireControlPlaneAuth(request, env);
        const body = await readJson(request);
        const headerProjectId = resolveProjectIdFromRequest(request);
        const projectId =
          headerProjectId ?? (typeof body.projectId === "string" ? body.projectId : undefined);
        requireProjectAccess(request, env, projectId);
        const result = await service.createPlan({
          request: String(body.request ?? ""),
          phase: String(body.phase ?? ""),
          projectId,
          constraints: Array.isArray(body.constraints)
            ? body.constraints.map((item) => String(item))
            : undefined,
          targetModules: Array.isArray(body.targetModules)
            ? body.targetModules.map((item) => String(item))
            : undefined,
        });
        return json(response, 201, {
          planId: result.planId,
          taskCount: result.tasks.length,
          tasks: result.tasks,
        });
      }

      if (method === "GET" && pathname === "/api/plans") {
        requireControlPlaneAuth(request, env);
        return json(response, 200, {
          plans: await service.listPlans(),
        });
      }

      const taskGraphMatch = pathname.match(/^\/api\/plans\/([^/]+)\/tasks$/);
      if (method === "GET" && taskGraphMatch) {
        requireControlPlaneAuth(request, env);
        requireProjectAccess(
          request,
          env,
          await service.getPlanProjectId(taskGraphMatch[1] ?? ""),
        );
        const result = await service.getTaskGraph(taskGraphMatch[1] ?? "");
        return json(response, 200, result);
      }

      const runMatch = pathname.match(/^\/api\/plans\/([^/]+)\/runs$/);
      if (method === "POST" && runMatch) {
        requireControlPlaneAuth(request, env);
        requireProjectAccess(
          request,
          env,
          await service.getPlanProjectId(runMatch[1] ?? ""),
        );
        const result = await service.runPlan(runMatch[1] ?? "");
        return json(response, 200, result);
      }

      const statusMatch = pathname.match(/^\/api\/plans\/([^/]+)\/status$/);
      if (method === "GET" && statusMatch) {
        requireControlPlaneAuth(request, env);
        requireProjectAccess(
          request,
          env,
          await service.getPlanProjectId(statusMatch[1] ?? ""),
        );
        const result = await service.getPlanStatus(statusMatch[1] ?? "");
        return json(response, 200, result);
      }

      const knowledgeMatch = pathname.match(/^\/api\/knowledge\/([^/]+)$/);
      if (method === "GET" && knowledgeMatch) {
        requireControlPlaneAuth(request, env);
        const decodedKnowledgeId = decodeURIComponent(knowledgeMatch[1] ?? "");
        const records = await service.getKnowledgeById(decodedKnowledgeId);
        return json(response, 200, {
          knowledgeId: decodedKnowledgeId,
          records,
        });
      }

      if (method === "GET" && pathname === "/api/knowledge") {
        requireControlPlaneAuth(request, env);
        const status = url.searchParams.get("status") ?? undefined;
        const scope = url.searchParams.get("scope") ?? undefined;
        return json(response, 200, {
          records: await service.listKnowledge({ status, scope }),
        });
      }

      const taskDetailMatch = pathname.match(/^\/api\/tasks\/([^/]+)$/);
      if (method === "GET" && taskDetailMatch) {
        requireControlPlaneAuth(request, env);
        const taskId = decodeURIComponent(taskDetailMatch[1] ?? "");
        const planId = url.searchParams.get("planId") ?? undefined;
        if (planId) {
          requireProjectAccess(request, env, await service.getPlanProjectId(planId));
        }
        return json(response, 200, await service.getTaskDetail(taskId, planId));
      }

      if (method === "GET" && pathname === "/api/audit") {
        requireControlPlaneAuth(request, env);
        const limitParam = url.searchParams.get("limit");
        const snapshot = await service.getAuditSnapshot({
          entityType: (url.searchParams.get("entityType") as
            | "plan"
            | "task"
            | "assignment"
            | "acceptance_run"
            | "knowledge_record"
            | "incident"
            | "human_intervention"
            | null) ?? undefined,
          entityId: url.searchParams.get("entityId") ?? undefined,
          eventType: url.searchParams.get("eventType") ?? undefined,
          limit: limitParam ? Number(limitParam) : undefined,
        });
        return json(response, 200, snapshot);
      }

      if (method === "GET" && pathname === "/api/alerts") {
        requireControlPlaneAuth(request, env);
        return json(response, 200, {
          alerts: await service.getAlerts(),
        });
      }

      if (method === "GET" && pathname === "/api/human-gates") {
        requireControlPlaneAuth(request, env);
        return json(response, 200, {
          items: await service.listHumanGates(
            url.searchParams.get("relatedId") ?? undefined,
          ),
        });
      }

      if (method === "POST" && pathname === "/api/human-gates") {
        requireControlPlaneAuth(request, env);
        requireHumanGateAuth(request, env);
        const body = await readJson(request);
        const result = await service.createHumanGate({
          relatedId: String(body.relatedId ?? ""),
          type: String(body.type ?? "") as
            | "approval"
            | "rejection"
            | "decision"
            | "handoff",
          summary: String(body.summary ?? ""),
          actor: String(body.actor ?? ""),
        });
        return json(response, 201, result);
      }

      if (method === "POST" && pathname === "/api/human-gates/actions") {
        requireControlPlaneAuth(request, env);
        requireHumanGateAuth(request, env);
        const body = await readJson(request);
        return json(response, 200, await service.applyHumanGateAction({
          action: String(body.action ?? ""),
          actor: String(body.actor ?? ""),
          summary:
            typeof body.summary === "string" ? body.summary : undefined,
          relatedId: String(body.relatedId ?? body.taskId ?? ""),
          taskId:
            typeof body.taskId === "string" ? body.taskId : undefined,
          planId:
            typeof body.planId === "string" ? body.planId : undefined,
        }));
      }

      return json(response, 404, {
        error: "NOT_FOUND",
        message: `未找到路由 ${method} ${pathname}`,
      });
    } catch (error) {
      if (isAppError(error)) {
        return json(response, errorStatusCode(error.code), {
          error: error.code,
          message: error.message,
          details: error.details,
        });
      }

      return json(response, 500, {
        error: "INTERNAL_ERROR",
        message: error instanceof Error ? error.message : "未知错误",
      });
    }
  });
}

async function readJson(
  request: IncomingMessage,
): Promise<Record<string, unknown>> {
  const body = await readText(request);
  if (!body) {
    return {};
  }

  return JSON.parse(body) as Record<string, unknown>;
}

async function readText(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  if (chunks.length === 0) {
    return "";
  }

  return Buffer.concat(chunks).toString("utf8");
}

function json(
  response: ServerResponse,
  statusCode: number,
  body: unknown,
): void {
  response.statusCode = statusCode;
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.end(JSON.stringify(body, null, 2));
}

function text(
  response: ServerResponse,
  statusCode: number,
  body: string,
  contentType: string,
): void {
  response.statusCode = statusCode;
  response.setHeader("content-type", contentType);
  response.end(body);
}

function errorStatusCode(code: string): number {
  if (code === "AUTH_REQUIRED") {
    return 401;
  }
  if (code === "AUTH_INVALID") {
    return 404;
  }
  if (code === "AUTH_FORBIDDEN" || code === "PERMISSION_DENIED") {
    return 403;
  }
  if (code === "NOT_FOUND" || code === "TASK_NOT_FOUND") {
    return 404;
  }
  return 400;
}
