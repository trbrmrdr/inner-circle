#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVER_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

print_help() {
  cat <<'EOF'
Использование: bash scripts/deploy-profile.sh <profile>

Профили:
  moscow    Secondary API: выгрузить код/env/credentials на Moscow.
            Контейнер и Caddy запускает host-скрипт Spi.Ski.
  germany   Primary API: выгрузить код/env/credentials и поднять API+Caddy.

Переменные:
  SYNC_SHEETS=true              Дополнительно синхронизировать Google Sheets.
  GOOGLE_CREDENTIALS_SOURCE=... Переопределить путь к service account.

Обычно этот скрипт вызывается из ./synch_to_server.sh.
EOF
}

PROFILE="${DEPLOY_PROFILE:-${1:-}}"
if [ "${1:-}" = "--help" ] || [ "${1:-}" = "-h" ]; then
  print_help
  exit 0
fi

if [ -z "$PROFILE" ]; then
  print_help
  exit 1
fi

case "$PROFILE" in
  moscow)
    SSH_TARGET="${MOSCOW_SSH_TARGET:-${SSH_TARGET:-root@155.212.245.24}}"
    SERVER_IP="${MOSCOW_SERVER_IP:-${SERVER_IP:-155.212.245.24}}"
    REMOTE_DIR="${MOSCOW_REMOTE_DIR:-${REMOTE_DIR:-/opt/server.inner-circle-moscow}}"
    PUBLIC_URL="${MOSCOW_PUBLIC_URL:-${PUBLIC_URL:-https://api2.inner-circle.spi.ski}}"
    ENV_SOURCE="${ENV_SOURCE:-env/moscow.env}"
    COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-innercircle-moscow}"
    CONTAINER_PREFIX="${CONTAINER_PREFIX:-innercircle-moscow}"
    RUN_REMOTE_COMPOSE="${RUN_REMOTE_COMPOSE:-false}"
    LEGACY_CONTAINERS="${LEGACY_CONTAINERS:-}"
    PROFILE_ENV_PREFIX="MOSCOW"
    ;;
  germany)
    SSH_TARGET="${GERMANY_SSH_TARGET:-${SSH_TARGET:-root@78.17.131.89}}"
    SERVER_IP="${GERMANY_SERVER_IP:-${SERVER_IP:-78.17.131.89}}"
    REMOTE_DIR="${GERMANY_REMOTE_DIR:-${REMOTE_DIR:-/opt/server.inner-circle-germany}}"
    PUBLIC_URL="${GERMANY_PUBLIC_URL:-${PUBLIC_URL:-https://api.inner-circle.spi.ski}}"
    ENV_SOURCE="${ENV_SOURCE:-env/germany.env}"
    COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-innercircle-germany}"
    CONTAINER_PREFIX="${CONTAINER_PREFIX:-innercircle-germany}"
    COMPOSE_FILE="${COMPOSE_FILE:-deploy/default-ip/docker-compose.yml}"
    HTTP_PORT="${HTTP_PORT:-80}"
    RUN_REMOTE_COMPOSE="${RUN_REMOTE_COMPOSE:-true}"
    REMOTE_HEALTH_MODE="${REMOTE_HEALTH_MODE:-http}"
    PUBLIC_HEALTH_CHECK="${PUBLIC_HEALTH_CHECK:-true}"
    LEGACY_CONTAINERS="${LEGACY_CONTAINERS:-innercircle-server innercircle-caddy}"
    PROFILE_ENV_PREFIX="GERMANY"
    ;;
  *)
    echo "[deploy] неизвестный профиль: $PROFILE"
    exit 1
    ;;
esac

COMMON_ENV_SOURCE="${COMMON_ENV_SOURCE:-}"
PUBLIC_HOST="${PUBLIC_HOST:-$(printf '%s' "$PUBLIC_URL" | sed -E 's#^https?://##; s#/.*$##')}"
GOOGLE_CREDENTIALS_DEFAULT="${GOOGLE_CREDENTIALS_DEFAULT:-$SERVER_DIR/../secrets/inner-circle-499809-1795952a720e.json}"
GOOGLE_CREDENTIALS_UPLOAD="${GOOGLE_CREDENTIALS_SOURCE:-$GOOGLE_CREDENTIALS_DEFAULT}"
ENV_AUDIT_PATTERN='^(NODE_ENV|PUBLIC_BASE_URL|PUBLIC_HOST|AUTOPOST_ENABLED|AUTOPOST_INTERVAL_MS|AUTOPOST_BATCH_LIMIT|EMAIL_ENABLED|TELEGRAM_POST_ENABLED|TELEGRAM_TECH_ENABLED|GOOGLE_SHEETS_ENABLED|DEEPSEEK_ENABLED|VK_ENABLED|INSTAGRAM_ENABLED|FACEBOOK_ENABLED)='

if [ -z "$SSH_TARGET" ]; then
  echo "[deploy] нужен SSH target. Заполни ${PROFILE_ENV_PREFIX}_SSH_TARGET или SSH_TARGET."
  exit 1
fi

if [ -z "$PUBLIC_URL" ]; then
  echo "[deploy] нужен PUBLIC_URL. Заполни ${PROFILE_ENV_PREFIX}_PUBLIC_URL или PUBLIC_URL."
  exit 1
fi

cd "$SERVER_DIR"

if [ ! -f "$ENV_SOURCE" ]; then
  echo "[deploy] env-файл не найден: $SERVER_DIR/$ENV_SOURCE"
  echo "[deploy] создай env/${PROFILE}.env и заполни секреты локально."
  exit 1
fi

ENV_UPLOAD="$ENV_SOURCE"
TMP_ENV_UPLOAD=""
if [ -n "$COMMON_ENV_SOURCE" ] && [ -f "$COMMON_ENV_SOURCE" ] && [ "$COMMON_ENV_SOURCE" != "$ENV_SOURCE" ]; then
  TMP_ENV_UPLOAD="$(mktemp "${TMPDIR:-/tmp}/innercircle-env.XXXXXX")"
  trap 'if [ -n "${TMP_ENV_UPLOAD:-}" ]; then rm -f "$TMP_ENV_UPLOAD"; fi' EXIT
  {
    printf '# merged from %s + %s\n' "$COMMON_ENV_SOURCE" "$ENV_SOURCE"
    cat "$COMMON_ENV_SOURCE"
    printf '\n# profile overrides: %s\n' "$ENV_SOURCE"
    cat "$ENV_SOURCE"
  } > "$TMP_ENV_UPLOAD"
  ENV_UPLOAD="$TMP_ENV_UPLOAD"
  echo "[deploy] объединяю env: $COMMON_ENV_SOURCE + $ENV_SOURCE"
fi

if [ "${SYNC_SHEETS:-false}" = "true" ]; then
  echo "[deploy] Google Sheets dry-run для $PROFILE"
  ENV_FILE="$ENV_SOURCE" npx tsx scripts/sync-google-sheets.ts --dry-run
  echo "[deploy] Google Sheets sync для $PROFILE"
  ENV_FILE="$ENV_SOURCE" npx tsx scripts/sync-google-sheets.ts
fi

echo "[deploy] локальная сборка для $PROFILE"
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

echo "[deploy] выгружаю env: $ENV_SOURCE -> ${REMOTE_DIR}/.env"
scp "$ENV_UPLOAD" "$SSH_TARGET:$REMOTE_DIR/.env"

if [ -f "$GOOGLE_CREDENTIALS_UPLOAD" ]; then
  echo "[deploy] выгружаю Google credentials"
  scp "$GOOGLE_CREDENTIALS_UPLOAD" "$SSH_TARGET:$REMOTE_DIR/private/google-service-account.json"
elif grep -q '^GOOGLE_SHEETS_ENABLED=true' "$ENV_SOURCE"; then
  echo "[deploy] Google credentials не найдены: $GOOGLE_CREDENTIALS_UPLOAD"
  echo "[deploy] GOOGLE_CREDENTIALS_SOURCE нужен только для переопределения стандартного пути."
  exit 1
else
  echo "[deploy] Google credentials пропущены: Google Sheets выключены или файла нет"
fi

echo "[deploy] проверяю PUBLIC_BASE_URL в remote env"
ssh "$SSH_TARGET" "cd '$REMOTE_DIR' && if grep -q '^PUBLIC_BASE_URL=' .env; then sed -i 's#^PUBLIC_BASE_URL=.*#PUBLIC_BASE_URL=${PUBLIC_URL}#' .env; else printf '\nPUBLIC_BASE_URL=${PUBLIC_URL}\n' >> .env; fi"

echo "[deploy] проверяю PUBLIC_HOST в remote env"
ssh "$SSH_TARGET" "cd '$REMOTE_DIR' && if grep -q '^PUBLIC_HOST=' .env; then sed -i 's#^PUBLIC_HOST=.*#PUBLIC_HOST=${PUBLIC_HOST}#' .env; else printf '\nPUBLIC_HOST=${PUBLIC_HOST}\n' >> .env; fi"

echo "[deploy] удаляю запрещенные абстрактные SERVER_* role/profile поля из remote env"
ssh "$SSH_TARGET" "cd '$REMOTE_DIR' && sed -i '/^SERVER_PROFILE=/d; /^SERVER_ROLE=/d' .env"

echo "[deploy] remote env flags"
ssh "$SSH_TARGET" "cd '$REMOTE_DIR' && grep -nE '$ENV_AUDIT_PATTERN' .env || true"

if [ "$RUN_REMOTE_COMPOSE" != "true" ]; then
  echo "[deploy] remote compose пропущен для $PROFILE"
  echo "[deploy] запуск/пересборка идёт из host-проекта, где лежат Caddy/docker-compose."
  echo "[deploy] done: ${PROFILE} ${PUBLIC_URL}"
  exit 0
fi

if [ -n "$LEGACY_CONTAINERS" ]; then
  echo "[deploy] останавливаю старые контейнеры профиля: $LEGACY_CONTAINERS"
  ssh "$SSH_TARGET" "docker rm -f $LEGACY_CONTAINERS >/dev/null 2>&1 || true"
fi

echo "[deploy] запускаю docker compose"
ssh "$SSH_TARGET" "cd '$REMOTE_DIR' && REMOTE_DIR='$REMOTE_DIR' COMPOSE_PROJECT_NAME='$COMPOSE_PROJECT_NAME' CONTAINER_PREFIX='$CONTAINER_PREFIX' HTTP_PORT='${HTTP_PORT:-80}' HTTPS_PORT='${HTTPS_PORT:-443}' PUBLIC_HOST='$PUBLIC_HOST' docker compose -f '$COMPOSE_FILE' up -d --build --force-recreate && REMOTE_DIR='$REMOTE_DIR' COMPOSE_PROJECT_NAME='$COMPOSE_PROJECT_NAME' CONTAINER_PREFIX='$CONTAINER_PREFIX' HTTP_PORT='${HTTP_PORT:-80}' HTTPS_PORT='${HTTPS_PORT:-443}' PUBLIC_HOST='$PUBLIC_HOST' docker compose -f '$COMPOSE_FILE' ps"

echo "[deploy] container env flags"
ssh "$SSH_TARGET" "docker exec '${CONTAINER_PREFIX}-server' sh -lc 'printenv | grep -E \"$ENV_AUDIT_PATTERN\" | sort || true'"

echo "[deploy] container health"
ssh "$SSH_TARGET" "docker exec '${CONTAINER_PREFIX}-server' node -e 'fetch(\"http://127.0.0.1:4100/api/autopost/health\").then(async r=>{console.log(r.status); console.log(await r.text())}).catch(e=>{console.error(e.message);process.exit(1)})'"

echo "[deploy] health-check с VPS"
if [ "$REMOTE_HEALTH_MODE" = "container" ]; then
  ssh "$SSH_TARGET" "docker exec '${CONTAINER_PREFIX}-server' node -e 'fetch(\"http://127.0.0.1:4100/api/autopost/health\").then(r=>r.text()).then(t=>{console.log(t);process.exit(0)}).catch(e=>{console.error(e.message);process.exit(1)})'"
else
  ssh "$SSH_TARGET" "curl -fsS http://127.0.0.1:${HTTP_PORT:-80}/api/autopost/health || curl -fsS http://127.0.0.1/api/autopost/health"
fi
echo

if [ "${PUBLIC_HEALTH_CHECK:-true}" = "true" ]; then
  echo "[deploy] health-check с локальной машины"
  curl -fsS "${PUBLIC_URL}/api/autopost/health"
  echo
fi

echo "[deploy] done: ${PROFILE} ${PUBLIC_URL}"
