#!/usr/bin/env bash
# Запускать на VPS от root (или sudo): настраивает лимиты тела запроса и таймауты для загрузки MP4.
#
#   sudo bash /root/hockey/scripts/server-apply-nginx-upload-limits.sh
#   sudo bash /root/hockey/scripts/server-apply-nginx-upload-limits.sh /etc/nginx/sites-available/hockey
#
set -euo pipefail

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Запустите от root: sudo bash $0" >&2
  exit 1
fi

SITE_CONF="${1:-/etc/nginx/sites-available/hockey}"
SNIPPET_PATH="/etc/nginx/snippets/hockey-upload-limits.conf"

if [[ ! -f "$SITE_CONF" ]]; then
  echo "Нет файла $SITE_CONF — укажите путь к конфигу сайта:" >&2
  echo "  sudo bash $0 /etc/nginx/sites-available/ВАШ_САЙТ" >&2
  exit 1
fi

mkdir -p /etc/nginx/snippets
tee "$SNIPPET_PATH" > /dev/null <<'EOF'
# Hockey: только лимит тела (без proxy_* — иначе дубликаты, если они уже в sites-available/hockey)
client_max_body_size 150m;
client_body_timeout 300s;
EOF
chmod 0644 "$SNIPPET_PATH"

BACKUP="${SITE_CONF}.bak.$(date +%Y%m%d%H%M)"
cp -a "$SITE_CONF" "$BACKUP"
echo "Резервная копия: $BACKUP"

python3 <<PY
import re
import sys

path = "${SITE_CONF}"
with open(path, encoding="utf-8") as f:
    t = f.read()

if "hockey-upload-limits" in t:
    print(f"В {path} уже есть include snippets/hockey-upload-limits — обновлён только файл сниппета.")
    sys.exit(0)

# Уже настроено по инструкции (лимит тела в конфиге) — не добавляем include, иначе дубликаты proxy_*
if re.search(r"client_max_body_size\s+", t, re.I):
    print(
        f"В {path} уже есть client_max_body_size — include не добавляем (избегаем дубликатов). "
        "Если нужно 150m, проверьте значение вручную."
    )
    sys.exit(0)

# Вставить include сразу после "location / {" перед proxy_pass (типичный прокси на Node)
new, n = re.subn(
    r"(location\s+/\s*\{)\s*\n(\s*)(proxy_pass\s+http://127\.0\.0\.1:3002)",
    r"\1\n\2include snippets/hockey-upload-limits.conf;\n\2\3",
    t,
    count=0,
)
if n == 0:
    new, n = re.subn(
        r"(location\s+/\s*\{)\s*\n(\s*)(proxy_pass\s+)",
        r"\1\n\2include snippets/hockey-upload-limits.conf;\n\2\3",
        t,
        count=0,
    )
if n == 0:
    print(
        "Не удалось найти блок «location / {» с proxy_pass. Добавьте вручную внутрь location:",
        "  include snippets/hockey-upload-limits.conf;",
        sep="\n",
        file=sys.stderr,
    )
    sys.exit(1)

with open(path, "w", encoding="utf-8") as f:
    f.write(new)
print(f"Обновлён {path} ({n} блок(ов) location).")
PY

nginx -t
systemctl reload nginx
echo "Готово: nginx перезагружен. Проверка: curl -I https://ваш-домен/"
