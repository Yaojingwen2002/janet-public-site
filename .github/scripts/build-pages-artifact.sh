#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
OUTPUT="${1:-_site}"
if [[ "$OUTPUT" != /* ]]; then OUTPUT="$ROOT/$OUTPUT"; fi
if [[ "$OUTPUT" == "$ROOT" ]]; then
  echo "Refusing to replace repository root." >&2
  exit 1
fi

rm -rf "$OUTPUT"
mkdir -p "$OUTPUT/data"

find "$ROOT" -maxdepth 1 -type f -name '*.html' -exec cp {} "$OUTPUT/" \;
for file in robots.txt sitemap.xml .nojekyll; do
  [[ -f "$ROOT/$file" ]] && cp "$ROOT/$file" "$OUTPUT/$file"
done

for directory in auth asset assets styles; do
  cp -R "$ROOT/$directory" "$OUTPUT/$directory"
done
mkdir -p "$OUTPUT/scripts"
find "$ROOT/scripts" -maxdepth 1 -type f -name '*.js' -exec cp {} "$OUTPUT/scripts/" \;

for file in MANIFEST.json news-index.json; do
  cp "$ROOT/data/$file" "$OUTPUT/data/$file"
done

while IFS= read -r name; do
  [[ "$name" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}(-v[0-9]+)?$ ]] || continue
  [[ -d "$ROOT/data/$name" ]] || { echo "Missing manifest directory: data/$name" >&2; exit 1; }
  cp -R "$ROOT/data/$name" "$OUTPUT/data/$name"
done < <(node -e 'const fs=require("fs"); JSON.parse(fs.readFileSync(process.argv[1], "utf8")).forEach((id)=>console.log(id))' "$ROOT/data/MANIFEST.json")

for name in works gpt-image2-handbook; do
  cp -R "$ROOT/data/$name" "$OUTPUT/data/$name"
done

find "$OUTPUT" -name '._*' -delete
find "$OUTPUT" -name '.DS_Store' -delete
touch "$OUTPUT/.nojekyll"
node "$ROOT/scripts/prepare-pages-artifact.mjs" "$OUTPUT"

file_count="$(find "$OUTPUT" -type f | wc -l | tr -d ' ')"
size_kb="$(du -sk "$OUTPUT" | awk '{print $1}')"
echo "pages_artifact_ready files=$file_count size_kb=$size_kb output=$OUTPUT"
