#!/usr/bin/env bash
# Безопасная выгрузка на VPS: обновляет код и dist/, НЕ перезаписывает на сервере
# server/data.json, server/admin.json и папку server/uploads/ (пользователи и видео).
# Файл .env на сервер не выгружается — секреты остаются только в существующем .env на VPS
# (перед деплоем делается резервная копия .env.bak.* на сервере).
#
# Перед первым запуском:
#   export DEPLOY_SSH='root@ВАШ_IP'
#   export DEPLOY_PATH='/root/hockey'   # каталог проекта на сервере
#   export DEPLOY_SSH_PORT=2222         # опционально, если ssh не на 22
# Запуск из корня репозитория:
#   bash scripts/rsync-to-server.sh
#
# Если «Connection timed out» / «banner exchange» — это сеть или файрвол (порт 22 до VPS не
# доходит или сервер не отвечает), а не этот скрипт. Проверьте VPS, правила файрвола, VPN.
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

# Один раз открыть SSH-сессию и переиспользовать её для всех ssh/rsync (меньше ожидания и
# один запрос пароля к ключу вместо многих). Сокет: ~/.ssh/cm-<хост>-p<порт>.sock
DEPLOY_SSH_SAFE="${DEPLOY_SSH//[^a-zA-Z0-9._@-]/_}"
SSH_PORT="${DEPLOY_SSH_PORT:-22}"
SSH_CONTROL_SOCK="${HOME}/.ssh/cm-${DEPLOY_SSH_SAFE}-p${SSH_PORT}.sock"
SSH_COMMON=(
  -o ControlMaster=auto
  -o "ControlPath=${SSH_CONTROL_SOCK}"
  -o ControlPersist=300
  -o ConnectTimeout=25
  -o ServerAliveInterval=5
  -o ServerAliveCountMax=3
)
if [[ -n "${DEPLOY_SSH_PORT:-}" ]]; then
  SSH_COMMON+=( -p "$DEPLOY_SSH_PORT" )
fi
# Строка для rsync -e "…" (та же сессия)
RSYNC_RSH="ssh ${SSH_COMMON[*]}"

SSH_DEPLOY_HOST="${DEPLOY_SSH##*@}"

ssh_fail_hint() {
  echo ""
  echo "Не удалось подключиться по SSH (${DEPLOY_SSH}, порт ${SSH_PORT})."
  echo "Это обычно сеть или файрвол, а не ошибка деплоя. Проверьте:"
  echo "  • VPS включён; в панели хостинга — правила входящих (порт ${SSH_PORT}/tcp)."
  echo "  • С этой машины:  nc -vz ${SSH_DEPLOY_HOST} ${SSH_PORT}   или   ssh -v ${DEPLOY_SSH}"
  echo "  • Другой порт SSH:  export DEPLOY_SSH_PORT=ВАШ_ПОРТ"
  echo "  • С другой сети/VPN, если провайдер режет порт 22."
}

ssh_deploy() {
  ssh "${SSH_COMMON[@]}" "$DEPLOY_SSH" "$@" || { ssh_fail_hint; exit 1; }
}

# Только SSH без подсказки «проверьте сеть» — если упала удалённая команда (npm/pm2), это не обязательно сеть.
ssh_remote_cmd() {
  ssh "${SSH_COMMON[@]}" "$DEPLOY_SSH" "$@"
}

rsync_deploy() {
  rsync "$@" || { echo ""; echo "Сбой rsync (часто из‑за SSH до сервера)."; ssh_fail_hint; exit 1; }
}

echo "==> Сборка frontend (dist/)..."
npm run build

echo "==> Резервные копии data/admin/.env на сервере (на всякий случай)..."
ssh_deploy "cd '$DEPLOY_PATH' && TS=\$(date +%Y%m%d%H%M) && cp -f server/data.json server/data.json.bak.\$TS 2>/dev/null; cp -f server/admin.json server/admin.json.bak.\$TS 2>/dev/null; cp -f .env .env.bak.\$TS 2>/dev/null; true"

echo "==> dist/ -> сервер..."
rsync_deploy -avz --delete -e "$RSYNC_RSH" ./dist/ "$DEPLOY_SSH:$DEPLOY_PATH/dist/"

echo "==> server/ (без data.json, admin.json, uploads, *.bak) -> сервер..."
rsync_deploy -avz \
  -e "$RSYNC_RSH" \
  --exclude 'data.json' \
  --exclude 'admin.json' \
  --exclude 'uploads' \
  --exclude '*.bak' \
  ./server/ "$DEPLOY_SSH:$DEPLOY_PATH/server/"

echo "==> package.json, package-lock.json -> сервер..."
rsync_deploy -avz -e "$RSYNC_RSH" ./package.json ./package-lock.json "$DEPLOY_SSH:$DEPLOY_PATH/"

echo "==> scripts/ (smtp-verify, nginx и др.) -> сервер..."
rsync_deploy -avz -e "$RSYNC_RSH" ./scripts/ "$DEPLOY_SSH:$DEPLOY_PATH/scripts/"

echo "==> deploy/nginx/ (сниппеты для ручной настройки) -> сервер..."
# rsync на удалённой стороне не всегда создаёт вложенные каталоги без родителя deploy/
ssh_deploy "mkdir -p '$DEPLOY_PATH/deploy/nginx'"
rsync_deploy -avz -e "$RSYNC_RSH" ./deploy/nginx/ "$DEPLOY_SSH:$DEPLOY_PATH/deploy/nginx/"

echo "==> .env на сервер не копируется (используется текущий файл на VPS)."
echo "    Чтобы обновить секреты на сервере: bash scripts/upload-env-to-server.sh"

echo "==> Установка зависимостей и перезапуск PM2 на сервере..."
if ! ssh_remote_cmd "cd '$DEPLOY_PATH' && npm ci --omit=dev && pm2 restart '$PM2_APP'"; then
  echo ""
  echo "Ошибка при выполнении команд на сервере (часто это npm ci: package-lock.json не совпадает с package.json)."
  echo "Локально: npm install && закоммитьте package-lock.json, затем снова npm run deploy:server."
  echo "Если падение именно на SSH — проверьте сеть и порт: ssh -v $DEPLOY_SSH"
  exit 1
fi

echo ""
echo "Готово. Пользователи и admin.json на сервере не затирались (исключены из rsync); .env на сервере не менялся."
echo "Проверка: pm2 logs $PM2_APP --lines 30"
