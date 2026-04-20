#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT_DIR/.env.production}"
REMOTE_HOST="${REMOTE_HOST:-}"
REMOTE_DIR="${REMOTE_DIR:-/opt/agentforge-production}"
IMAGE_TAG="${IMAGE_TAG:-agentforge:production}"
CONTAINER_NAME="${CONTAINER_NAME:-agentforge-production}"
PORT_BINDING="${PORT_BINDING:-127.0.0.1:3302:3000}"
SKIP_RELEASE_CHECK="${SKIP_RELEASE_CHECK:-false}"

if [[ "$SKIP_RELEASE_CHECK" != "true" ]]; then
  "$ROOT_DIR/scripts/release-check.sh"
fi

if [[ -z "$REMOTE_HOST" ]]; then
  echo "[deploy-production] 缺少 REMOTE_HOST"
  exit 1
fi

if [[ ! -f "$ENV_FILE" ]]; then
  echo "[deploy-production] 未找到环境文件: $ENV_FILE"
  exit 1
fi

TMP_ARCHIVE="$(mktemp /tmp/agentforge-production.XXXXXX.tgz)"
trap 'rm -f "$TMP_ARCHIVE"' EXIT

cd "$ROOT_DIR"
tar -czf "$TMP_ARCHIVE" dist Dockerfile .dockerignore package.json package-lock.json

scp -o StrictHostKeyChecking=no "$TMP_ARCHIVE" "$REMOTE_HOST:/tmp/agentforge-production.tgz"
scp -o StrictHostKeyChecking=no "$ENV_FILE" "$REMOTE_HOST:/tmp/agentforge-production.env"

ssh -o StrictHostKeyChecking=no "$REMOTE_HOST" bash <<EOF
set -euo pipefail
mkdir -p "$REMOTE_DIR" "$REMOTE_DIR/data" "$REMOTE_DIR/backups"
rm -rf "$REMOTE_DIR/app"
mkdir -p "$REMOTE_DIR/app"
tar -xzf /tmp/agentforge-production.tgz -C "$REMOTE_DIR/app"
mv /tmp/agentforge-production.env "$REMOTE_DIR/.env"
cd "$REMOTE_DIR/app"
docker build -t "$IMAGE_TAG" .
docker rm -f "$CONTAINER_NAME" >/dev/null 2>&1 || true
docker run -d \
  --name "$CONTAINER_NAME" \
  --restart unless-stopped \
  --env-file "$REMOTE_DIR/.env" \
  -v "$REMOTE_DIR/data:/app/.agentforge" \
  -p "$PORT_BINDING" \
  "$IMAGE_TAG"
docker ps --filter "name=$CONTAINER_NAME" --format "{{.Names}} {{.Image}} {{.Ports}} {{.Status}}"
EOF

echo "[deploy-production] 完成"
