#!/usr/bin/env bash
set -euo pipefail

# Resolve paths relative to repo root
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ROOT="$REPO_ROOT/codex-briefing-system"
cd "$ROOT"

if [[ -f "$ROOT/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$ROOT/.env"
  set +a
fi

DATE="${1:-$(TZ=Asia/Taipei date +%F)}"
MODE="${2:-app}"
RUN_DIR="$ROOT/runs/$DATE"
RUN_CONTENT_PATH="$RUN_DIR/content.json"
TASK_PATH="$RUN_DIR/briefing-task.md"

mkdir -p "$RUN_DIR"

read -r VOL WINDOW_START WINDOW_END <<EOF
$(node --input-type=module - "$DATE" <<'NODE'
import { briefingVol, cstWindow } from './src/lib.mjs';
const date = process.argv[2];
const { start, end } = cstWindow(date);
console.log(`${briefingVol(date)} ${start.toISOString()} ${end.toISOString()}`);
NODE
)
EOF

sed \
  -e "s|{{DATE}}|$DATE|g" \
  -e "s|{{VOL}}|$VOL|g" \
  -e "s|{{WINDOW_START}}|$WINDOW_START|g" \
  -e "s|{{WINDOW_END}}|$WINDOW_END|g" \
  -e "s|{{RUN_CONTENT_PATH}}|$RUN_CONTENT_PATH|g" \
  "$ROOT/prompts/briefing-task.md" > "$TASK_PATH"

if [[ "$MODE" == "--cli" ]]; then
  CODEX_BIN="${CODEX_BIN:-codex}"
  CODEX_MODEL="${CODEX_MODEL:-gpt-5.5}"
  if ! command -v "$CODEX_BIN" >/dev/null 2>&1 && [[ ! -x "$CODEX_BIN" ]]; then
    echo "Codex CLI 不可用。当前默认流程是 Codex App-native，请在 Codex App 中执行：$TASK_PATH" >&2
    exit 1
  fi
  "$CODEX_BIN" exec \
    --search \
    --model "$CODEX_MODEL" \
    --sandbox danger-full-access \
    --ask-for-approval never \
    --cd "$ROOT" \
    --add-dir "$RUN_DIR" \
    --output-last-message "$RUN_DIR/codex-last-message.txt" \
    - < "$TASK_PATH"
  echo "Codex CLI optional mode finished. Draft path: $RUN_CONTENT_PATH"
  exit 0
fi

cat <<EOF
Codex App-native briefing task prepared.

1. 在 Codex App 中打开：
   $ROOT

2. 让 Codex App 读取并执行：
   $TASK_PATH

3. Codex App 必须把结果写入：
   $RUN_CONTENT_PATH

4. 写稿完成后运行：
   bash scripts/postprocess-briefing.sh $DATE --publish

当前只准备任务，不会调用 codex exec；写稿完成后由后处理脚本同步 janet-public-site。
EOF
