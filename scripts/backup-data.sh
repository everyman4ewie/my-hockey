#!/usr/bin/env bash
# Пример: зашифрованная копия data.json (нужен gpg, пароль задаётся интерактивно).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="${HOCKEY_DATA_PATH:-$ROOT/server/data.json}"
OUT="${BACKUP_DIR:-$ROOT}/data-$(date +%Y%m%d-%H%M).json.gpg"
if [[ ! -f "$SRC" ]]; then
  echo "Файл не найден: $SRC" >&2
  exit 1
fi
gpg --symmetric --cipher-algo AES256 -o "$OUT" "$SRC"
echo "Создано: $OUT"
