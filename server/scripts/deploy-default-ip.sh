#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVER_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

SSH_TARGET="${SSH_TARGET:-root@78.17.131.89}"
SERVER_IP="${SERVER_IP:-78.17.131.89}"
REMOTE_DIR="${REMOTE_DIR:-/opt/server.inner-circle}"
COMPOSE_FILE="${COMPOSE_FILE:-deploy/default-ip/docker-compose.yml}"
PUBLIC_URL="${PUBLIC_URL:-http://${SERVER_IP}}"

cd "$SERVER_DIR"

echo "[deploy] local build"
npm run build

echo "[deploy] prepare remote directories: ${SSH_TARGET}:${REMOTE_DIR}"
ssh "$SSH_TARGET" "mkdir -p '$REMOTE_DIR/private' '$REMOTE_DIR/tmp/media'"

echo "[deploy] sync server files"
rsync -az --delete \
  --exclude node_modules \
  --exclude tmp \
  --exclude private \
  --exclude .env \
  "$SERVER_DIR/" "$SSH_TARGET:$REMOTE_DIR/"

echo "[deploy] ensure disabled env"
ssh "$SSH_TARGET" "cd '$REMOTE_DIR' && if [ ! -f .env ]; then cp deploy/default-ip/.env.disabled .env; fi && if grep -q '^PUBLIC_BASE_URL=' .env; then sed -i 's#^PUBLIC_BASE_URL=.*#PUBLIC_BASE_URL=${PUBLIC_URL}#' .env; else printf '\nPUBLIC_BASE_URL=${PUBLIC_URL}\n' >> .env; fi"

echo "[deploy] docker compose up"
ssh "$SSH_TARGET" "cd '$REMOTE_DIR' && docker compose -f '$COMPOSE_FILE' up -d --build && docker compose -f '$COMPOSE_FILE' ps"

echo "[deploy] health from VPS"
ssh "$SSH_TARGET" "curl -fsS http://127.0.0.1/api/autopost/health"
echo

echo "[deploy] health from local machine"
curl -fsS "${PUBLIC_URL}/api/autopost/health"
echo

echo "[deploy] done: ${PUBLIC_URL}"
