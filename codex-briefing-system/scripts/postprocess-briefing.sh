#!/usr/bin/env bash
set -euo pipefail

# Resolve paths relative to repo root (janet-public-site)
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ROOT="$REPO_ROOT/codex-briefing-system"
SITE_ROOT="$REPO_ROOT"
cd "$ROOT"

DATE="${1:-$(TZ=Asia/Taipei date +%F)}"
PUBLISH="${2:-}"
RUN_CONTENT_PATH="$ROOT/runs/$DATE/content.json"

if [[ ! -f "$RUN_CONTENT_PATH" ]]; then
  echo "请先在 Codex App 中执行 prompts/briefing-task.md 生成 content.json" >&2
  echo "缺少文件：$RUN_CONTENT_PATH" >&2
  exit 1
fi

node src/ensure-item-images.mjs "$DATE"
node src/render-output.mjs "$DATE"
node src/qa-briefing.mjs "$DATE"

if [[ "$PUBLISH" == "--publish" ]]; then
  bash scripts/sync-to-site.sh "$DATE"
else
  echo "QA 通过。当前为复查模式，未发布。需要发布时运行：bash scripts/postprocess-briefing.sh $DATE --publish"
fi
