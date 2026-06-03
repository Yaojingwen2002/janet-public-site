#!/usr/bin/env bash
set -euo pipefail

# Resolve paths relative to repo root
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ROOT="$REPO_ROOT/codex-briefing-system"
SITE_ROOT="$REPO_ROOT"
DATE="${1:-$(TZ=Asia/Taipei date +%F)}"

SRC_DIR="$ROOT/runs/$DATE"
DEST_DIR="$SITE_ROOT/data/$DATE"

if [[ ! -d "$SRC_DIR" ]]; then
  echo "缺少晨报输出目录：$SRC_DIR" >&2
  exit 1
fi

for required in content.json output.html cover.png; do
  if [[ ! -f "$SRC_DIR/$required" ]]; then
    echo "缺少晨报文件：$SRC_DIR/$required" >&2
    exit 1
  fi
done

mkdir -p "$DEST_DIR"
cp "$SRC_DIR/content.json" "$DEST_DIR/content.json"
cp "$SRC_DIR/output.html" "$DEST_DIR/output.html"
cp "$SRC_DIR/cover.png" "$DEST_DIR/cover.png"
rm -f "$DEST_DIR"/._*
rm -f "$SITE_ROOT/data"/._*

cd "$SITE_ROOT"
DATE="$DATE" node <<'NODE'
const fs = require('node:fs');
const path = require('node:path');

const date = process.env.DATE;
const root = process.cwd();
const dataDir = path.join(root, 'data');
const contentPath = path.join(dataDir, date, 'content.json');
const manifestPath = path.join(dataDir, 'MANIFEST.json');
const indexPath = path.join(dataDir, 'news-index.json');

function readJson(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

const content = readJson(contentPath, {});
const sections = content.sections || {};
const allItems = Object.values(sections).flatMap((section) => Array.isArray(section?.items) ? section.items : []);
const sources = [...new Set(allItems.map((item) => item.source).filter(Boolean))];
const categories = Object.entries(sections).filter(([, section]) => Array.isArray(section?.items) && section.items.length > 0).map(([key]) => key);
const trend = String(content.trend || '').split(/\n{2,}/).map((part) => part.trim()).filter(Boolean);
const summary = trend.join(' ').slice(0, 260) || content.cover?.subtitle || content.intro_text || '';

const oldManifest = readJson(manifestPath, []);
const manifest = [
  date,
  ...oldManifest.filter((entry) => entry !== date && entry !== `${date}-v4`)
];
writeJson(manifestPath, manifest);

const oldIndex = readJson(indexPath, {
  schema_version: 1,
  generated_at: '',
  latest_edition_id: '',
  editions: [],
  sources: [],
  categories: []
});

const entry = {
  edition_id: date,
  date,
  title: content.cover?.title || allItems[0]?.title || 'Janet 快车箱',
  summary,
  edition_type: 'codex_briefing',
  signal_count: allItems.length,
  edition_items_count: allItems.length,
  homepage_items_count: Math.min(5, sections.news?.items?.length || 0),
  url: `data/${date}/output.html`,
  content_url: `data/${date}/content.json`,
  top_sources: sources.slice(0, 8),
  top_categories: categories,
  lead_story: sections.news?.items?.[0]
    ? {
        title: sections.news.items[0].title,
        source: sections.news.items[0].source,
        url: sections.news.items[0].url
      }
    : null
};

const editions = [
  entry,
  ...(Array.isArray(oldIndex.editions) ? oldIndex.editions : []).filter((item) => item.edition_id !== date && item.edition_id !== `${date}-v4`)
];
writeJson(indexPath, {
  ...oldIndex,
  generated_at: new Date().toISOString(),
  latest_edition_id: date,
  editions,
  sources: [...new Set([...(sources || []), ...((oldIndex.sources || []).filter(Boolean))])],
  categories: [...new Set([...(categories || []), ...((oldIndex.categories || []).filter(Boolean))])]
});
NODE

node "$ROOT/src/check-site-briefing.mjs" "$DATE"

git add "data/$DATE/" data/MANIFEST.json data/news-index.json

if git diff --cached --quiet -- "data/$DATE/" data/MANIFEST.json data/news-index.json; then
  echo "No briefing data changes to commit for $DATE."
  exit 0
fi

git commit -m "Briefing $DATE" -- "data/$DATE/" data/MANIFEST.json data/news-index.json
git push
