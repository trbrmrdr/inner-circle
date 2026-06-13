#!/bin/bash

set -euo pipefail

SERVER="${SERVER:-root@155.212.245.24}"
SSH_OPTS="${SSH_OPTS:- -o ServerAliveInterval=30 -o ServerAliveCountMax=20}"

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
STATIC_DIR="$ROOT_DIR/app/dst"

INNER_CIRCLE_HOST="${INNER_CIRCLE_HOST:-inner-circle.spi.ski}"
INNER_CIRCLE_DOMAIN="${INNER_CIRCLE_DOMAIN:-https://${INNER_CIRCLE_HOST}}"
INNER_CIRCLE_REMOTE_DIR="${INNER_CIRCLE_REMOTE_DIR:-/srv/static/${INNER_CIRCLE_HOST}}"

help() {
  cat <<EOF
Usage: bash ./synch_to_server.sh

Deploy static Inner Circle site:
  local:  ${STATIC_DIR}
  remote: ${INNER_CIRCLE_REMOTE_DIR}
  url:    ${INNER_CIRCLE_DOMAIN}

Environment:
  SERVER=${SERVER}
  INNER_CIRCLE_HOST=${INNER_CIRCLE_HOST}
  INNER_CIRCLE_REMOTE_DIR=${INNER_CIRCLE_REMOTE_DIR}
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    -h|--help) help; exit 0 ;;
    *) echo "Unknown option: $1"; help; exit 1 ;;
  esac
done

if [[ ! -f "$STATIC_DIR/index.html" ]]; then
  echo "Missing static site entrypoint: $STATIC_DIR/index.html" >&2
  exit 1
fi

echo "Sync Inner Circle -> ${INNER_CIRCLE_DOMAIN}"
ssh $SSH_OPTS "$SERVER" "mkdir -p '$INNER_CIRCLE_REMOTE_DIR'"
rsync -rlptDz --delete --progress \
  --no-owner \
  --no-group \
  --exclude '.DS_Store' \
  "$STATIC_DIR/" "$SERVER:$INNER_CIRCLE_REMOTE_DIR/"

echo "Site synced -> ${INNER_CIRCLE_DOMAIN}"
echo "Caddy config is managed by /Users/trbrmrdr/Documents/Project/Spi.Ski/synch_to_server.sh --inner-circle"
echo "Done"
