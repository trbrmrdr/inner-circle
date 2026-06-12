#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SITES_FILE="${SITES_FILE:-$ROOT_DIR/resources/reference-sites.tsv}"
OUT_DIR="${OUT_DIR:-$ROOT_DIR/resources/local-sites}"
DEPTH="${DEPTH:-2}"
EXT_DEPTH="${EXT_DEPTH:-1}"
MAX_SIZE_MB="${MAX_SIZE_MB:-250}"
MAX_TIME_SECONDS="${MAX_TIME_SECONDS:-900}"
SOCKETS="${SOCKETS:-4}"
CONNECTIONS_PER_SECOND="${CONNECTIONS_PER_SECOND:-2}"
TIMEOUT="${TIMEOUT:-25}"
RETRIES="${RETRIES:-1}"
PORT="${PORT:-8123}"
USER_AGENT="${USER_AGENT:-Mozilla/5.0 (Macintosh; Intel Mac OS X) AppleWebKit/537.36 ResearchMirror/1.0}"
LOG_DIR="$OUT_DIR/_logs"
STATUS_FILE="$OUT_DIR/_mirror-status.tsv"

usage() {
  cat <<'USAGE'
Usage:
  ./scripts/mirror-reference-sites.sh list
  ./scripts/mirror-reference-sites.sh mirror [all|core|mechanics|slug]
  ./scripts/mirror-reference-sites.sh viewer
  ./scripts/mirror-reference-sites.sh serve

Environment:
  DEPTH=2                 Internal crawl depth per site.
  EXT_DEPTH=1             External asset/link depth.
  MAX_SIZE_MB=250         Maximum downloaded size per site.
  MAX_TIME_SECONDS=900    Maximum mirror time per site.
  PORT=8123               Local preview server port.

Examples:
  ./scripts/mirror-reference-sites.sh mirror core
  ./scripts/mirror-reference-sites.sh mirror mas-girbau
  DEPTH=1 MAX_SIZE_MB=120 ./scripts/mirror-reference-sites.sh mirror all
USAGE
}

require_tool() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required tool: $1" >&2
    exit 1
  fi
}

max_size_bytes() {
  echo $((MAX_SIZE_MB * 1024 * 1024))
}

is_site_line() {
  local slug="$1"
  [[ -n "$slug" && "${slug#\#}" == "$slug" ]]
}

matches_target() {
  local slug="$1"
  local group="$2"
  local target="$3"

  case "$target" in
    all) return 0 ;;
    core|mechanics) [[ "$group" == "$target" ]] ;;
    *) [[ "$slug" == "$target" ]] ;;
  esac
}

list_sites() {
  while IFS=$'\t' read -r slug url title group; do
    is_site_line "$slug" || continue
    printf '%-22s %-10s %s\n' "$slug" "$group" "$url"
  done < "$SITES_FILE"
}

mirror_site() {
  local slug="$1"
  local url="$2"
  local title="$3"
  local dest="$OUT_DIR/$slug"
  local log_file="$LOG_DIR/$slug.log"
  local exit_code="0"

  mkdir -p "$dest" "$LOG_DIR"

  echo "Mirroring $title"
  echo "  URL: $url"
  echo "  Out: $dest"
  echo "  Log: $log_file"

  set +e
  httrack "$url" \
    -O "$dest" \
    -r"$DEPTH" \
    -%e"$EXT_DEPTH" \
    -M"$(max_size_bytes)" \
    -E"$MAX_TIME_SECONDS" \
    -c"$SOCKETS" \
    -%c"$CONNECTIONS_PER_SECOND" \
    -T"$TIMEOUT" \
    -R"$RETRIES" \
    -s2 \
    -n \
    -%P \
    -F "$USER_AGENT" \
    --quiet > "$log_file" 2>&1
  exit_code="$?"
  set -e

  if [[ "$exit_code" == "0" ]]; then
    echo "Done: $slug"
  else
    echo "Failed: $slug (exit $exit_code)"
    echo "Check: $log_file"
  fi
  echo

  return "$exit_code"
}

mirror_target() {
  local target="${1:-all}"
  local found="0"

  require_tool httrack
  mkdir -p "$OUT_DIR" "$LOG_DIR"
  printf 'slug\tgroup\tstatus\turl\n' > "$STATUS_FILE"

  while IFS=$'\t' read -r slug url title group; do
    is_site_line "$slug" || continue

    if matches_target "$slug" "$group" "$target"; then
      found="1"
      if mirror_site "$slug" "$url" "$title"; then
        printf '%s\t%s\tok\t%s\n' "$slug" "$group" "$url" >> "$STATUS_FILE"
      else
        printf '%s\t%s\tfailed\t%s\n' "$slug" "$group" "$url" >> "$STATUS_FILE"
      fi
    fi
  done < "$SITES_FILE"

  if [[ "$found" != "1" ]]; then
    echo "No site found for target: $target" >&2
    exit 1
  fi

  generate_viewer
  echo "Mirror status: $STATUS_FILE"
}

generate_viewer() {
  mkdir -p "$OUT_DIR"

  {
    cat <<'HTML'
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Local Reference Mirrors</title>
  <style>
    :root {
      color-scheme: dark;
      --bg: #10120f;
      --panel: #181c16;
      --line: #2a3025;
      --text: #f4f1e8;
      --muted: #a8ae9c;
      --accent: #bfd878;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: var(--bg);
      color: var(--text);
      font: 14px/1.45 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    header {
      position: sticky;
      top: 0;
      z-index: 2;
      display: grid;
      grid-template-columns: minmax(220px, 1fr) auto auto;
      gap: 12px;
      align-items: center;
      padding: 12px;
      background: color-mix(in srgb, var(--panel) 94%, transparent);
      border-bottom: 1px solid var(--line);
    }
    select, button {
      height: 36px;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: #20261d;
      color: var(--text);
      padding: 0 12px;
      font: inherit;
    }
    button[aria-pressed="true"] {
      border-color: var(--accent);
      color: var(--accent);
    }
    .viewport-buttons {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      justify-content: flex-end;
    }
    main {
      min-height: calc(100vh - 61px);
      overflow: auto;
      padding: 18px;
    }
    .frame-wrap {
      margin: 0 auto;
      background: #080906;
      border: 1px solid var(--line);
      box-shadow: 0 18px 60px rgba(0, 0, 0, 0.35);
      transition: width 180ms ease, height 180ms ease;
    }
    iframe {
      display: block;
      width: 100%;
      height: 100%;
      border: 0;
      background: white;
    }
    .meta {
      margin-top: 12px;
      color: var(--muted);
      text-align: center;
    }
    @media (max-width: 800px) {
      header {
        grid-template-columns: 1fr;
      }
      .viewport-buttons {
        justify-content: stretch;
      }
      .viewport-buttons button {
        flex: 1;
      }
      main {
        padding: 10px;
      }
    }
  </style>
</head>
<body>
  <header>
    <select id="siteSelect" aria-label="Site"></select>
    <div class="viewport-buttons" aria-label="Viewport">
      <button type="button" data-width="1440" data-height="900" aria-pressed="true">Desktop</button>
      <button type="button" data-width="768" data-height="1024" aria-pressed="false">Tablet</button>
      <button type="button" data-width="390" data-height="844" aria-pressed="false">Mobile</button>
      <button type="button" data-width="100%" data-height="80vh" aria-pressed="false">Fluid</button>
    </div>
  </header>
  <main>
    <div class="frame-wrap" id="frameWrap" style="width: min(1440px, 100%); height: 900px;">
      <iframe id="previewFrame" title="Local mirror preview"></iframe>
    </div>
    <div class="meta" id="meta"></div>
  </main>
  <script>
    const sites = [
HTML

    while IFS=$'\t' read -r slug url title group; do
      is_site_line "$slug" || continue
      local_json_title=$(printf '%s' "$title" | sed 's/\\/\\\\/g; s/"/\\"/g')
      local_json_url=$(printf '%s' "$url" | sed 's/\\/\\\\/g; s/"/\\"/g')
      printf '      { slug: "%s", title: "%s", group: "%s", liveUrl: "%s" },\n' "$slug" "$local_json_title" "$group" "$local_json_url"
    done < "$SITES_FILE"

    cat <<'HTML'
    ];

    const select = document.getElementById('siteSelect');
    const frame = document.getElementById('previewFrame');
    const frameWrap = document.getElementById('frameWrap');
    const meta = document.getElementById('meta');
    const buttons = [...document.querySelectorAll('[data-width]')];

    for (const site of sites) {
      const option = document.createElement('option');
      option.value = site.slug;
      option.textContent = `${site.title} · ${site.group}`;
      select.append(option);
    }

    function setSite(slug) {
      const site = sites.find(item => item.slug === slug) || sites[0];
      select.value = site.slug;
      frame.src = `./${site.slug}/index.html`;
      meta.textContent = `${site.title}: local mirror. Live source: ${site.liveUrl}`;
    }

    function setViewport(button) {
      for (const item of buttons) item.setAttribute('aria-pressed', String(item === button));
      const width = button.dataset.width;
      const height = button.dataset.height;
      frameWrap.style.width = width.endsWith('%') ? width : `min(${width}px, 100%)`;
      frameWrap.style.height = height.endsWith('vh') ? height : `${height}px`;
    }

    select.addEventListener('change', () => setSite(select.value));
    for (const button of buttons) {
      button.addEventListener('click', () => setViewport(button));
    }

    setSite(sites[0]?.slug);
  </script>
</body>
</html>
HTML
  } > "$OUT_DIR/index.html"

  echo "Viewer updated: $OUT_DIR/index.html"
}

serve_viewer() {
  require_tool python3
  generate_viewer
  echo "Serving local mirrors at http://localhost:$PORT/"
  cd "$OUT_DIR"
  python3 -m http.server "$PORT"
}

command="${1:-help}"
target="${2:-all}"

case "$command" in
  list) list_sites ;;
  mirror) mirror_target "$target" ;;
  viewer) generate_viewer ;;
  serve) serve_viewer ;;
  help|-h|--help) usage ;;
  *)
    usage
    exit 1
    ;;
esac
