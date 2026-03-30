#!/usr/bin/env bash
# Запускать на сервере из корня проекта после git pull.
# ВАЖНО: не удаляйте server/data.json и server/admin.json — там пользователи и настройки.
set -euo pipefail
cd "$(dirname "$0")/.."
if [[ -f package-lock.json ]]; then
  npm ci --omit=dev
else
  npm install --omit=dev
fi
npm run build
echo "OK: dist/ собран. Запуск приложения: PORT=3002 node server/index.js"
echo "   (или pm2 restart … / systemctl restart … — как настроено у вас)"
