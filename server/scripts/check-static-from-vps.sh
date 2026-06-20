#!/usr/bin/env bash
set -euo pipefail

SSH_TARGET="${SSH_TARGET:-root@155.212.245.24}"
STATIC_URL="${STATIC_URL:-https://inner-circle.spi.ski/}"

if [ "${1:-}" = "--help" ] || [ "${1:-}" = "-h" ]; then
  cat <<'EOF'
Использование: bash scripts/check-static-from-vps.sh

Проверяет с secondary/Moscow, что статика Inner Circle открывается.

Переменные:
  SSH_TARGET=root@host
  STATIC_URL=https://inner-circle.spi.ski/
EOF
  exit 0
fi

ssh "$SSH_TARGET" "set -e; echo '[static] HEAD ${STATIC_URL}'; curl -fsSI --connect-timeout 10 --max-time 20 '${STATIC_URL}' | sed -n '1,16p'; echo '[static] проверка тела страницы'; curl -fsS --connect-timeout 10 --max-time 20 '${STATIC_URL}' | head -c 220; printf '\n'"
