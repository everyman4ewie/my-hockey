#!/usr/bin/env bash
# Безопасная выгрузка на VPS: обновляет код и dist/, НЕ перезаписывает на сервере
# server/data.json, server/admin.json и папку server/uploads/ (пользователи и видео).
#
# Перед первым запуском:
#   export DEPLOY_SSH='root@ВАШ_IP'
#   export DEPLOY_PATH='/root/hockey'   # каталог проекта на сервере
# Запуск из корня репозитория:
#   bash scripts/rsync-to-server.sh
#
set -euo pipefail
cd "$(dirname "$0")/.."

DEPLOY_SSH="${DEPLOY_SSH:-}"
DEPLOY_PATH="${DEPLOY_PATH:-/root/hockey}"
PM2_APP="${PM2_APP:-hockey}"

if [[ -z "$DEPLOY_SSH" ]]; then
  echo "Задайте адрес сервера, например:"
  echo "  export DEPLOY_SSH='root@72.56.233.203'"
  echo "  export DEPLOY_PATH='/root/hockey'   # при необходимости"
  echo "  bash scripts/rsync-to-server.sh"
  exit 1
fi

echo "==> Сборка frontend (dist/)..."
npm run build

echo "==> Резервная копия data/admin на сервере (на всякий случай)..."
ssh "$DEPLOY_SSH" "cd '$DEPLOY_PATH' && TS=\$(date +%Y%m%d%H%M) && cp -f server/data.json server/data.json.bak.\$TS 2>/dev/null; cp -f server/admin.json server/admin.json.bak.\$TS 2>/dev/null; true"

echo "==> dist/ -> сервер..."
rsync -avz --delete ./dist/ "$DEPLOY_SSH:$DEPLOY_PATH/dist/"

echo "==> server/ (без data.json, admin.json, uploads, *.bak) -> сервер..."
rsync -avz \
  --exclude 'data.json' \
  --exclude 'admin.json' \
  --exclude 'uploads' \
  --exclude '*.bak' \
  ./server/ "$DEPLOY_SSH:$DEPLOY_PATH/server/"

echo "==> package.json, package-lock.json -> сервер..."
rsync -avz ./package.json ./package-lock.json "$DEPLOY_SSH:$DEPLOY_PATH/"

echo "==> Установка зависимостей и перезапуск PM2 на сервере..."
ssh "$DEPLOY_SSH" "cd '$DEPLOY_PATH' && npm ci --omit=dev && pm2 restart '$PM2_APP'"

echo ""
echo "Готово. Пользователи и admin.json на сервере не затирались (исключены из rsync)."
echo "Проверка: pm2 logs $PM2_APP --lines 30"
