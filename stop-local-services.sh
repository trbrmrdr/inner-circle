#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR" && pwd)"

DRY_RUN=false
FORCE=false
PORTS_TEXT="${STOP_LOCAL_PORTS:-4100 4177-4190}"
PIDS=""

usage() {
  cat <<'EOF'
Usage:
  bash scripts/stop-local-services.sh
  bash scripts/stop-local-services.sh --dry-run
  bash scripts/stop-local-services.sh --ports "4100 4177-4195"
  STOP_LOCAL_PORTS="4100 4177-4195" bash scripts/stop-local-services.sh

Stops local Inner Circle dev services:
  - server API on 4100
  - app static dev server on 4177+
  - project-scoped node/tsx processes for this workspace
EOF
}

add_pid() {
  local pid="$1"
  if [ -z "$pid" ] || [ "$pid" = "$$" ] || [ "$pid" = "$PPID" ]; then
    return
  fi

  case " $PIDS " in
    *" $pid "*) ;;
    *) PIDS="$PIDS $pid" ;;
  esac
}

add_port() {
  local port="$1"
  PORTS="$PORTS $port"
}

expand_ports() {
  local text="${1//,/ }"
  local token start end port
  PORTS=""

  for token in $text; do
    if [[ "$token" =~ ^([0-9]+)-([0-9]+)$ ]]; then
      start="${BASH_REMATCH[1]}"
      end="${BASH_REMATCH[2]}"
      for ((port = start; port <= end; port += 1)); do
        add_port "$port"
      done
    elif [[ "$token" =~ ^[0-9]+$ ]]; then
      add_port "$token"
    else
      echo "[stop-local] ignored invalid port token: $token" >&2
    fi
  done
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    --force)
      FORCE=true
      shift
      ;;
    --ports)
      if [ "${2:-}" = "" ]; then
        echo "[stop-local] --ports requires a value" >&2
        exit 2
      fi
      PORTS_TEXT="$2"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "[stop-local] unknown argument: $1" >&2
      usage
      exit 2
      ;;
  esac
done

expand_ports "$PORTS_TEXT"

for port in $PORTS; do
  while IFS= read -r pid; do
    add_pid "$pid"
  done < <(lsof -nP -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true)
done

while IFS= read -r line; do
  pid="${line%% *}"
  command="${line#"$pid"}"
  command="${command#"${command%%[![:space:]]*}"}"

  case "$command" in
    *"$PROJECT_ROOT/app/scripts/dev-server.mjs"*|\
    *"$PROJECT_ROOT/server/src/server.ts"*|\
    *"$PROJECT_ROOT/server/dist/server.js"*)
      add_pid "$pid"
      ;;
    *"$PROJECT_ROOT/server"*tsx*"src/server.ts"*|\
    *"$PROJECT_ROOT/server"*node*"dist/server.js"*|\
    *"$PROJECT_ROOT/app"*node*"scripts/dev-server.mjs"*)
      add_pid "$pid"
      ;;
  esac
done < <(ps -axo pid=,command= 2>/dev/null || true)

if [ -z "${PIDS// }" ]; then
  echo "[stop-local] no local Inner Circle services found"
  exit 0
fi

echo "[stop-local] found processes:"
for pid in $PIDS; do
  ps -p "$pid" -o pid=,command= 2>/dev/null || echo "  $pid"
done

if [ "$DRY_RUN" = "true" ]; then
  echo "[stop-local] dry run only, nothing killed"
  exit 0
fi

if [ "$FORCE" = "true" ]; then
  echo "[stop-local] sending KILL"
  kill -KILL $PIDS 2>/dev/null || true
  exit 0
fi

echo "[stop-local] sending TERM"
kill -TERM $PIDS 2>/dev/null || true

for _ in 1 2 3 4 5 6 7 8 9 10; do
  alive=""
  for pid in $PIDS; do
    if kill -0 "$pid" 2>/dev/null; then
      alive="$alive $pid"
    fi
  done

  if [ -z "${alive// }" ]; then
    echo "[stop-local] stopped"
    exit 0
  fi

  sleep 0.2
done

echo "[stop-local] still alive, sending KILL:$alive"
kill -KILL $alive 2>/dev/null || true
echo "[stop-local] stopped"
