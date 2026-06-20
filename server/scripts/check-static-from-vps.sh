#!/usr/bin/env bash
set -euo pipefail

SSH_TARGET="${SSH_TARGET:-root@78.17.131.89}"
STATIC_URL="${STATIC_URL:-https://inner-circle.spi.ski/}"

ssh "$SSH_TARGET" "set -e; echo '[static] HEAD ${STATIC_URL}'; curl -fsSI --connect-timeout 10 --max-time 20 '${STATIC_URL}' | sed -n '1,16p'; echo '[static] body probe'; curl -fsS --connect-timeout 10 --max-time 20 '${STATIC_URL}' | head -c 220; printf '\n'"
