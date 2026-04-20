#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DATA_DIR="${DATA_DIR:-$ROOT_DIR/.agentforge}"
BACKUP_DIR="${BACKUP_DIR:-$ROOT_DIR/.backups}"
STAMP="$(date +%Y%m%d-%H%M%S)"
TARGET="$BACKUP_DIR/agentforge-backup-$STAMP.tgz"

mkdir -p "$BACKUP_DIR"

if [[ ! -d "$DATA_DIR" ]]; then
  echo "[backup] 未找到数据目录: $DATA_DIR"
  exit 1
fi

tar -czf "$TARGET" -C "$DATA_DIR" .
echo "[backup] 已生成 $TARGET"
