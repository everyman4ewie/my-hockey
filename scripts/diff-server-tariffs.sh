#!/usr/bin/env bash
# Сравнить локальные server/tariffLimits.js и server/tariffs.js с копией на сервере.
# Нужны: export DEPLOY_SSH='root@IP' и при необходимости DEPLOY_PATH (по умолчанию /root/hockey)
set -euo pipefail
cd "$(dirname "$0")/.."

DEPLOY_SSH="${DEPLOY_SSH:-}"
DEPLOY_PATH="${DEPLOY_PATH:-/root/hockey}"

if [[ -z "$DEPLOY_SSH" ]]; then
  echo "Задайте: export DEPLOY_SSH='root@72.56.233.203'"
  exit 1
fi

TMP="${TMPDIR:-/tmp}/hockey-tariff-diff-$$"
mkdir -p "$TMP"
trap 'rm -rf "$TMP"' EXIT

echo "==> Копируем с сервера..."
scp -q "$DEPLOY_SSH:$DEPLOY_PATH/server/tariffLimits.js" "$TMP/tariffLimits.server.js"
scp -q "$DEPLOY_SSH:$DEPLOY_PATH/server/tariffs.js" "$TMP/tariffs.server.js"

echo ""
echo "=== diff server/tariffLimits.js ==="
diff -u server/tariffLimits.js "$TMP/tariffLimits.server.js" || true

echo ""
echo "=== diff server/tariffs.js ==="
diff -u server/tariffs.js "$TMP/tariffs.server.js" || true

echo ""
echo "Временные файлы: $TMP"
echo "Если есть отличия — перенесите нужное с сервера в репозиторий, затем deploy."
