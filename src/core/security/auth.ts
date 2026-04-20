import type { IncomingMessage } from "node:http";

import type { AppEnv } from "../config/env.js";
import { AppError } from "../errors/app-error.js";

export function requireControlPlaneAuth(
  request: IncomingMessage,
  env: AppEnv,
): void {
  if (!env.controlPlaneApiKey) {
    return;
  }

  const token = readAuthToken(request);
  if (!token) {
    throw new AppError({
      code: "AUTH_REQUIRED",
      message: "访问控制平面需要认证。",
    });
  }

  if (token !== env.controlPlaneApiKey) {
    throw new AppError({
      code: "AUTH_FORBIDDEN",
      message: "控制平面认证失败。",
    });
  }
}

export function requireHumanGateAuth(
  request: IncomingMessage,
  env: AppEnv,
): void {
  if (!env.humanGateApiKey) {
    return;
  }

  const token = readHeader(request, "x-human-gate-key");
  if (!token) {
    throw new AppError({
      code: "AUTH_REQUIRED",
      message: "执行人工 gate 操作需要额外认证。",
    });
  }

  if (token !== env.humanGateApiKey) {
    throw new AppError({
      code: "AUTH_FORBIDDEN",
      message: "人工 gate 认证失败。",
    });
  }
}

export function resolveProjectIdFromRequest(
  request: IncomingMessage,
): string | undefined {
  return readHeader(request, "x-project-id");
}

export function requireProjectAccess(
  request: IncomingMessage,
  env: AppEnv,
  projectId?: string,
): void {
  if (env.projectAllowlist.length === 0) {
    return;
  }

  const requestedProjectId = resolveProjectIdFromRequest(request);
  if (!requestedProjectId) {
    throw new AppError({
      code: "AUTH_REQUIRED",
      message: "访问项目资源时必须提供 x-project-id。",
      details: { allowedProjects: env.projectAllowlist },
    });
  }

  if (!env.projectAllowlist.includes(requestedProjectId)) {
    throw new AppError({
      code: "AUTH_FORBIDDEN",
      message: "当前项目不在授权范围内。",
      details: { projectId: requestedProjectId },
    });
  }

  if (projectId && projectId !== requestedProjectId) {
    throw new AppError({
      code: "AUTH_FORBIDDEN",
      message: "请求头中的项目与目标资源项目不匹配。",
      details: {
        requestedProjectId,
        resourceProjectId: projectId,
      },
    });
  }
}

function readAuthToken(request: IncomingMessage): string | undefined {
  const authorization = readHeader(request, "authorization");
  if (!authorization) {
    return undefined;
  }

  if (authorization.startsWith("Bearer ")) {
    return authorization.slice("Bearer ".length).trim();
  }

  return authorization.trim();
}

function readHeader(request: IncomingMessage, name: string): string | undefined {
  const value = request.headers[name];
  if (Array.isArray(value)) {
    return value[0];
  }
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
