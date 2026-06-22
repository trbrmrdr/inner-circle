#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVER_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

SSH_TARGET="${SSH_TARGET:-root@155.212.245.24}"
SERVER_IP="${SERVER_IP:-155.212.245.24}"
REMOTE_DIR="${REMOTE_DIR:-/opt/server.inner-circle}"
COMPOSE_FILE="${COMPOSE_FILE:-deploy/default-ip/docker-compose.yml}"
PUBLIC_URL="${PUBLIC_URL:-http://${SERVER_IP}}"
ENV_AUDIT_PATTERN='^(NODE_ENV|TZ|PUBLIC_BASE_URL|PUBLIC_HOST|AUTOPOST_ENABLED|AUTOPOST_INTERVAL_MS|AUTOPOST_PUBLISH_WINDOW_MINUTES|AUTOPOST_FUTURE_GRACE_SECONDS|EMAIL_ENABLED|TELEGRAM_POST_ENABLED|TELEGRAM_TECH_ENABLED|TELEGRAM_STARTUP_STATUS_ENABLED|GOOGLE_SHEETS_ENABLED|DEEPSEEK_ENABLED|VK_ENABLED|INSTAGRAM_ENABLED|FACEBOOK_ENABLED)='

if [ "${1:-}" = "--help" ] || [ "${1:-}" = "-h" ]; then
  cat <<'EOF'
Использование: bash scripts/deploy-default-ip.sh

Старый прямой deploy на IP для первичной проверки VPS.
Для обычной работы используй ./synch_to_server.sh.

Переменные:
  SSH_TARGET=root@host
  SERVER_IP=ip
  REMOTE_DIR=/opt/server.inner-circle
  PUBLIC_URL=http://ip
EOF
  exit 0
fi

cd "$SERVER_DIR"

echo "[deploy] локальная сборка"
npm run build

echo "[deploy] готовлю папки на сервере: ${SSH_TARGET}:${REMOTE_DIR}"
ssh "$SSH_TARGET" "mkdir -p '$REMOTE_DIR/private/tg_sessions' '$REMOTE_DIR/tmp/media' '$REMOTE_DIR/tmp/autopost' '$REMOTE_DIR/tmp/work' '$REMOTE_DIR/tmp/logs' '$REMOTE_DIR/scripts/media'"

echo "[deploy] выгружаю файлы сервера"
rsync -az --delete \
  --exclude node_modules \
  --exclude tmp \
  --exclude private \
  --exclude .env \
  --exclude '.env.*' \
  --exclude 'env/*.env' \
  "$SERVER_DIR/" "$SSH_TARGET:$REMOTE_DIR/"

echo "[deploy] проверяю disabled env"
ssh "$SSH_TARGET" "cd '$REMOTE_DIR' && if [ ! -f .env ]; then cp deploy/default-ip/.env.disabled .env; fi && if grep -q '^PUBLIC_BASE_URL=' .env; then sed -i 's#^PUBLIC_BASE_URL=.*#PUBLIC_BASE_URL=${PUBLIC_URL}#' .env; else printf '\nPUBLIC_BASE_URL=${PUBLIC_URL}\n' >> .env; fi"

echo "[deploy] удаляю запрещенные абстрактные SERVER_* role/profile поля из remote env"
ssh "$SSH_TARGET" "cd '$REMOTE_DIR' && sed -i '/^SERVER_PROFILE=/d; /^SERVER_ROLE=/d' .env"

echo "[deploy] remote env flags"
ssh "$SSH_TARGET" "cd '$REMOTE_DIR' && grep -nE '$ENV_AUDIT_PATTERN' .env || true"

echo "[deploy] запускаю docker compose"
ssh "$SSH_TARGET" "cd '$REMOTE_DIR' && docker compose -f '$COMPOSE_FILE' up -d --build --force-recreate && docker compose -f '$COMPOSE_FILE' ps"

echo "[deploy] container env flags"
ssh "$SSH_TARGET" "docker exec innercircle-server sh -lc 'printenv | grep -E \"$ENV_AUDIT_PATTERN\" | sort || true'"

echo "[deploy] health-check с VPS"
ssh "$SSH_TARGET" "curl -fsS http://127.0.0.1/api/autopost/health"
echo

echo "[deploy] health-check с локальной машины"
curl -fsS "${PUBLIC_URL}/api/autopost/health"
echo

echo "[deploy] done: ${PUBLIC_URL}"
