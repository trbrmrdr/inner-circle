#!/usr/bin/env bash
set -euo pipefail

SSH_TARGET="${SSH_TARGET:-root@78.17.131.89}"

if [ "${1:-}" = "--help" ] || [ "${1:-}" = "-h" ]; then
  cat <<'EOF'
Использование: bash scripts/check-vps-network.sh

Проверяет с VPS доступность Telegram, Meta, VK, Google Sheets и DeepSeek.
По умолчанию проверяет primary/Germany: root@78.17.131.89.

Переменные:
  SSH_TARGET=root@host
EOF
  exit 0
fi

echo "[network] проверяю внешние API с ${SSH_TARGET}"
ssh "$SSH_TARGET" 'set -e; for u in \
  https://api.telegram.org/botINVALID/getMe \
  https://graph.facebook.com \
  https://graph.instagram.com \
  https://www.instagram.com \
  https://www.facebook.com \
  "https://api.vk.com/method/users.get?user_ids=1&v=5.199" \
  https://sheets.googleapis.com \
  https://api.deepseek.com; do \
    printf "%s -> " "$u"; \
    curl -L -sS -o /dev/null --connect-timeout 10 --max-time 20 \
      -w "%{http_code} ip=%{remote_ip} time=%{time_total} err=%{errormsg}\n" "$u"; \
  done'
