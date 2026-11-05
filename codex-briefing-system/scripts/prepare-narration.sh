#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DATE="${1:?Pass YYYY-MM-DD}"
node "$ROOT/src/prepare-narration.mjs" "$DATE"
PYTHON="$ROOT/.venv-tts/bin/python"
if [[ ! -x "$PYTHON" ]]; then
  python3 -m venv "$ROOT/.venv-tts"
fi
if ! "$PYTHON" -c 'import edge_tts, mutagen' >/dev/null 2>&1; then
  "$PYTHON" -m pip install -r "$ROOT/scripts/tts-requirements.txt"
fi
"$PYTHON" "$ROOT/scripts/generate-narration.py" "$DATE"
node "$ROOT/src/qa-narration.mjs" "$DATE"
