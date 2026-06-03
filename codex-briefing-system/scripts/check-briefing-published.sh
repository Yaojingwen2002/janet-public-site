#!/usr/bin/env bash
set -euo pipefail

# Resolve paths relative to repo root
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ROOT="$REPO_ROOT/codex-briefing-system"
SITE_ROOT="$REPO_ROOT"
SITE_DIR="${PUBLIC_SITE_DIR:-$SITE_ROOT}"
DATE="${1:-$(TZ=Asia/Taipei date +%F)}"

RUN_DIR="$ROOT/runs/$DATE"
SITE_DATA_DIR="$SITE_ROOT/data/$DATE"

missing=()

for required in content.json output.html cover.png; do
  [[ -f "$RUN_DIR/$required" ]] || missing+=("$RUN_DIR/$required")
  [[ -f "$SITE_DATA_DIR/$required" ]] || missing+=("$SITE_DATA_DIR/$required")
done

if [[ -f "$SITE_ROOT/data/MANIFEST.json" ]]; then
  first_manifest="$(node -e 'const fs=require("fs"); const p=process.argv[1]; const d=JSON.parse(fs.readFileSync(p,"utf8")); console.log(Array.isArray(d) ? (d[0] || "") : "")' "$SITE_ROOT/data/MANIFEST.json")"
  [[ "$first_manifest" == "$DATE" ]] || missing+=("$SITE_ROOT/data/MANIFEST.json:first_entry=$first_manifest")
else
  missing+=("$SITE_ROOT/data/MANIFEST.json")
fi

if [[ -f "$SITE_ROOT/data/news-index.json" ]]; then
  latest="$(node -e 'const fs=require("fs"); const p=process.argv[1]; const d=JSON.parse(fs.readFileSync(p,"utf8")); console.log(d.latest_edition_id || "")' "$SITE_ROOT/data/news-index.json")"
  [[ "$latest" == "$DATE" ]] || missing+=("$SITE_ROOT/data/news-index.json:latest_edition_id=$latest")
else
  missing+=("$SITE_ROOT/data/news-index.json")
fi

if (( ${#missing[@]} > 0 )); then
  printf 'briefing_site_scan_failed:%s\n' "$DATE" >&2
  printf '%s\n' "${missing[@]}" >&2
  exit 1
fi

node "$ROOT/src/qa-briefing.mjs" "$DATE"
node "$ROOT/src/check-site-briefing.mjs" "$DATE"

BASE_URL="${PUBLIC_SITE_URL:-https://yaojingwen2002.github.io/janet-public-site}"
remote_missing=()
for path in \
  "index.html" \
  "news.html" \
  "data/$DATE/content.json" \
  "data/$DATE/output.html" \
  "data/$DATE/cover.png"; do
  code="$(curl -L -s -o /dev/null -w '%{http_code}' "$BASE_URL/$path" || true)"
  [[ "$code" == "200" ]] || remote_missing+=("$BASE_URL/$path:$code")
done

if (( ${#remote_missing[@]} > 0 )); then
  printf 'briefing_remote_scan_failed:%s\n' "$DATE" >&2
  printf '%s\n' "${remote_missing[@]}" >&2
  exit 1
fi

printf '{"status":"briefing_site_scan_ready","date":"%s","issues":0}\n' "$DATE"
