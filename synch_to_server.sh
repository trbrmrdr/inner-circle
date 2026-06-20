#!/bin/bash

set -euo pipefail

SERVER="${SERVER:-root@155.212.245.24}"
SSH_OPTS="${SSH_OPTS:- -o ServerAliveInterval=30 -o ServerAliveCountMax=20}"
SERVER_SYNC_SHEETS="${SERVER_SYNC_SHEETS:-false}"

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$ROOT_DIR/app/"
STATIC_DIR="$ROOT_DIR/app/dist"
SPISKI_ROOT="${SPISKI_ROOT:-$ROOT_DIR/../Spi.Ski}"
SPISKI_SYNC_SCRIPT="${SPISKI_SYNC_SCRIPT:-$SPISKI_ROOT/synch_to_server.sh}"

INNER_CIRCLE_HOST="${INNER_CIRCLE_HOST:-inner-circle.spi.ski}"
INNER_CIRCLE_DOMAIN="${INNER_CIRCLE_DOMAIN:-https://${INNER_CIRCLE_HOST}}"
INNER_CIRCLE_REMOTE_DIR="${INNER_CIRCLE_REMOTE_DIR:-/srv/static/${INNER_CIRCLE_HOST}}"

RUN_STATIC=false
RUN_MOSCOW_CADDY=false
SERVER_TARGET=""
SHEETS_MODE=""
SERVER_ENV_AUDIT_PATTERN='^(NODE_ENV|PUBLIC_BASE_URL|PUBLIC_HOST|AUTOPOST_ENABLED|AUTOPOST_INTERVAL_MS|AUTOPOST_BATCH_LIMIT|EMAIL_ENABLED|TELEGRAM_POST_ENABLED|TELEGRAM_TECH_ENABLED|GOOGLE_SHEETS_ENABLED|DEEPSEEK_ENABLED|VK_ENABLED|INSTAGRAM_ENABLED|FACEBOOK_ENABLED)='

help() {
  cat <<EOF
Использование: bash ./synch_to_server.sh [команда]

Команды:
  --static            Собрать сайт и выгрузить статику на secondary/Moscow.
  --secondary         Выгрузить secondary API на Moscow через Spi.Ski host.
  --primary           Выгрузить primary API на Germany с отдельным Caddy.
  --all               Статика + secondary API + primary API.
  --caddy-secondary   Только обновить Caddy/host-файлы на secondary/Moscow.
  --sheets-check      Проверить Google Sheets без изменений.
  --sheets-sync       Синхронизировать Google Sheets.
  -h, --help          Показать эту справку.

Текущие пути:
  static: ${STATIC_DIR}
  remote: ${INNER_CIRCLE_REMOTE_DIR}
  url:    ${INNER_CIRCLE_DOMAIN}
EOF
}

if [[ $# -eq 0 ]]; then
  help
  exit 0
fi

while [[ $# -gt 0 ]]; do
  case "$1" in
    --static)
      RUN_STATIC=true
      shift
      ;;
    --secondary)
      SERVER_TARGET="moscow"
      shift
      ;;
    --primary)
      SERVER_TARGET="germany"
      shift
      ;;
    --all)
      RUN_STATIC=true
      SERVER_TARGET="all"
      shift
      ;;
    --caddy-secondary)
      RUN_MOSCOW_CADDY=true
      shift
      ;;
    --sheets-check)
      SHEETS_MODE="check"
      shift
      ;;
    --sheets-sync)
      SHEETS_MODE="sync"
      shift
      ;;
    -h|--help) help; exit 0 ;;
    *) echo "Unknown option: $1"; help; exit 1 ;;
  esac
done

deploy_static() {
  cd "$PROJECT_DIR"
  npm run build
  cd "$ROOT_DIR"

  if [[ ! -f "$STATIC_DIR/index.html" ]]; then
    echo "Missing static site entrypoint: $STATIC_DIR/index.html" >&2
    exit 1
  fi

  echo "Sync Inner Circle -> ${INNER_CIRCLE_DOMAIN}"
  ssh $SSH_OPTS "$SERVER" "mkdir -p '$INNER_CIRCLE_REMOTE_DIR'"
  rsync -e "ssh $SSH_OPTS" -rlptDz --delete --progress \
    --no-owner \
    --no-group \
    --exclude '.DS_Store' \
    "$STATIC_DIR/" "$SERVER:$INNER_CIRCLE_REMOTE_DIR/"

  echo "Site synced -> ${INNER_CIRCLE_DOMAIN}"
  echo "Caddy config is managed by /Users/trbrmrdr/Documents/Project/Spi.Ski/synch_to_server.sh --inner-circle"
}

run_sheets() {
  if [[ -z "$SHEETS_MODE" ]]; then
    return
  fi

  cd "$ROOT_DIR/server"
  case "$SHEETS_MODE" in
    check)
      npm run sheets:check
      ;;
    sync)
      npm run sheets:sync
      ;;
    *)
      echo "Unknown sheets mode: $SHEETS_MODE" >&2
      exit 1
      ;;
  esac
  cd "$ROOT_DIR"
}

verify_moscow_server() {
  echo "Verify Moscow Inner Circle env -> api2.inner-circle.spi.ski"
  ssh $SSH_OPTS "$SERVER" "cd /opt/server.inner-circle-moscow && echo '[verify] remote .env flags' && grep -nE '$SERVER_ENV_AUDIT_PATTERN' .env || true"
  ssh $SSH_OPTS "$SERVER" "echo '[verify] container env flags' && docker exec innercircle-moscow-server sh -lc 'printenv | grep -E \"$SERVER_ENV_AUDIT_PATTERN\" | sort || true'"
  ssh $SSH_OPTS "$SERVER" "echo '[verify] container health' && docker exec innercircle-moscow-server node -e 'fetch(\"http://127.0.0.1:4100/api/autopost/health\").then(async r=>{console.log(r.status); console.log(await r.text())}).catch(e=>{console.error(e.message);process.exit(1)})'"
}

deploy_server_profile() {
  local profile="$1"
  local profile_sync_sheets="$SERVER_SYNC_SHEETS"
  if [[ -n "$SHEETS_MODE" ]]; then
    profile_sync_sheets=false
  fi

  case "$profile" in
    moscow)
      if [[ ! -f "$SPISKI_SYNC_SCRIPT" ]]; then
        echo "Missing Spi.Ski host sync script: $SPISKI_SYNC_SCRIPT" >&2
        exit 1
      fi
      INNER_CIRCLE_SERVER_SYNC_SHEETS="$profile_sync_sheets" \
        bash "$SPISKI_SYNC_SCRIPT" --inner-circle-server
      verify_moscow_server
      ;;
    germany)
      cd "$ROOT_DIR/server"
      if [[ "$profile_sync_sheets" == "true" ]]; then
        SYNC_SHEETS=true bash scripts/deploy-profile.sh "$profile"
      else
        bash scripts/deploy-profile.sh "$profile"
      fi
      cd "$ROOT_DIR"
      ;;
    *)
      echo "Unknown server profile: $profile" >&2
      echo "Expected: moscow, germany" >&2
      exit 1
      ;;
  esac
}

deploy_server() {
  if [[ -z "$SERVER_TARGET" ]]; then
    return
  fi

  case "$SERVER_TARGET" in
    moscow|germany)
      deploy_server_profile "$SERVER_TARGET"
      ;;
    all)
      deploy_server_profile moscow
      deploy_server_profile germany
      ;;
    *)
      echo "Unknown server target: $SERVER_TARGET" >&2
      echo "Expected: moscow, germany, all" >&2
      exit 1
      ;;
  esac
}

sync_moscow_caddy() {
  if [[ "$RUN_MOSCOW_CADDY" != "true" ]]; then
    return
  fi
  if [[ ! -f "$SPISKI_SYNC_SCRIPT" ]]; then
    echo "Missing Spi.Ski host sync script: $SPISKI_SYNC_SCRIPT" >&2
    exit 1
  fi
  bash "$SPISKI_SYNC_SCRIPT" --caddy
}

if [[ "$RUN_STATIC" == "true" ]]; then
  deploy_static
fi

run_sheets
deploy_server
sync_moscow_caddy

echo "Done"
