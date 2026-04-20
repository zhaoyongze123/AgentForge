#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "[release-check] 运行类型检查"
npm run typecheck

echo "[release-check] 运行测试"
npm test

echo "[release-check] 校验 Docker Compose"
docker compose -f docker-compose.dev.yml config >/dev/null

echo "[release-check] 构建镜像"
docker build -t agentforge:release-check .

echo "[release-check] 完成"
