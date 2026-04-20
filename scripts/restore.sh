#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "用法: $0 <backup-file.tgz> [target-dir]"
  exit 1
fi

BACKUP_FILE="$1"
TARGET_DIR="${2:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/.agentforge}"

if [[ ! -f "$BACKUP_FILE" ]]; then
  echo "[restore] 备份文件不存在: $BACKUP_FILE"
  exit 1
fi

mkdir -p "$TARGET_DIR"
tar -xzf "$BACKUP_FILE" -C "$TARGET_DIR"
echo "[restore] 已恢复到 $TARGET_DIR"
