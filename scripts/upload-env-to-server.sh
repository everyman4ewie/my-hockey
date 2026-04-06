#!/usr/bin/env bash
# Загрузка локального .env на VPS (основной деплой rsync-to-server.sh .env не копирует).
# Перед первым запуском задайте те же переменные, что и для rsync:
#   export DEPLOY_SSH='root@ВАШ_IP'
#   export DEPLOY_PATH='/root/hockey'
#   export DEPLOY_SSH_PORT=2222   # опционально
# Запуск из корня репозитория:
#   bash scripts/upload-env-to-server.sh
# После загрузки перезапустите API:  ssh … 'cd … && pm2 restart hockey'
set -euo pipefail
cd "$(dirname "$0")/.."

DEPLOY_SSH="${DEPLOY_SSH:-}"
DEPLOY_PATH="${DEPLOY_PATH:-/root/hockey}"
PM2_APP="${PM2_APP:-hockey}"

if [[ -z "$DEPLOY_SSH" ]]; then
  echo "Задайте адрес сервера, например:"
  echo "  export DEPLOY_SSH='root@72.56.233.203'"
  echo "  export DEPLOY_PATH='/root/hockey'"
  echo "  bash scripts/upload-env-to-server.sh"
  exit 1
fi

if [[ ! -f .env ]]; then
  echo "В корне проекта нет файла .env (скопируйте из .env.example и заполните)."
  exit 1
fi

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

ssh_deploy() {
  ssh "${SSH_COMMON[@]}" "$DEPLOY_SSH" "$@"
}

echo "==> Резервная копия .env на сервере…"
ssh_deploy "cd '$DEPLOY_PATH' && TS=\$(date +%Y%m%d%H%M) && test -f .env && cp -f .env .env.bak.\$TS || true"

echo "==> Копирование .env -> $DEPLOY_SSH:$DEPLOY_PATH/.env"
scp "${SSH_COMMON[@]}" .env "$DEPLOY_SSH:$DEPLOY_PATH/.env"

echo ""
echo "Готово. Перезапустите приложение на сервере, чтобы подтянуть переменные:"
echo "  ssh ${DEPLOY_SSH} 'cd $DEPLOY_PATH && pm2 restart $PM2_APP'"
echo "Проверка режима ЮKassa в логе:  pm2 logs $PM2_APP --lines 15"
