#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT_DIR/.env.staging}"
REMOTE_HOST="${REMOTE_HOST:-}"
REMOTE_DIR="${REMOTE_DIR:-/opt/agentforge-staging}"
IMAGE_TAG="${IMAGE_TAG:-agentforge:staging}"
CONTAINER_NAME="${CONTAINER_NAME:-agentforge-staging}"
PORT_BINDING="${PORT_BINDING:-127.0.0.1:3303:3000}"

if [[ -z "$REMOTE_HOST" ]]; then
  echo "[deploy-staging] 缺少 REMOTE_HOST"
  exit 1
fi

if [[ ! -f "$ENV_FILE" ]]; then
  echo "[deploy-staging] 未找到环境文件: $ENV_FILE"
  exit 1
fi

TMP_ARCHIVE="$(mktemp /tmp/agentforge-staging.XXXXXX.tgz)"
trap 'rm -f "$TMP_ARCHIVE"' EXIT

cd "$ROOT_DIR"
tar -czf "$TMP_ARCHIVE" dist Dockerfile .dockerignore package.json package-lock.json

scp -o StrictHostKeyChecking=no "$TMP_ARCHIVE" "$REMOTE_HOST:/tmp/agentforge-staging.tgz"
scp -o StrictHostKeyChecking=no "$ENV_FILE" "$REMOTE_HOST:/tmp/agentforge-staging.env"

ssh -o StrictHostKeyChecking=no "$REMOTE_HOST" bash <<EOF
set -euo pipefail
mkdir -p "$REMOTE_DIR" "$REMOTE_DIR/data"
rm -rf "$REMOTE_DIR/app"
mkdir -p "$REMOTE_DIR/app"
tar -xzf /tmp/agentforge-staging.tgz -C "$REMOTE_DIR/app"
mv /tmp/agentforge-staging.env "$REMOTE_DIR/.env"
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

echo "[deploy-staging] 完成"
