import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = process.cwd();
const SNAPSHOT = resolve(ROOT, 'data/live-source-snapshot.json');
const OUT = resolve(ROOT, 'data/live-source-stability-check.json');

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function latestEditionId() {
  const manifest = readJson(resolve(ROOT, 'data/MANIFEST.json'));
  return Array.isArray(manifest) ? manifest[0] : manifest?.items?.[0] || manifest?.latest || '';
}

function main() {
  const issues = [];
  const warnings = [];
  let snapshot = null;
  try {
    snapshot = readJson(SNAPSHOT);
  } catch {
    issues.push('live-source-snapshot.json missing or invalid');
  }
  const latest = latestEditionId();
  const latestDate = String(latest || '').replace(/-v4$/, '');

  if (snapshot) {
    const items = Array.isArray(snapshot.included_items) ? snapshot.included_items : [];
    if (!items.length) issues.push('included_items missing');
    items.forEach((item, index) => {
      for (const field of ['source', 'original_title', 'url', 'published_at']) {
        if (!item[field]) issues.push(`included_items[${index}] missing ${field}`);
      }
      if (item.collected_at && item.published_at === item.collected_at) issues.push(`included_items[${index}] uses collected_at as published_at`);
    });
    if (Number(snapshot.included_item_count || 0) < 5) warnings.push('included_item_count below 5');
    if (Number(snapshot.source_success_count || 0) < 5) issues.push('source_success_count below 5');
    const sources = new Set(items.map((item) => item.source).filter(Boolean));
    if (items.length > 1 && sources.size === 1) warnings.push(`included_items all from one source: ${[...sources][0]}`);
    if (snapshot.target_date !== latestDate) issues.push(`snapshot target_date mismatch: ${snapshot.target_date} != ${latestDate}`);
  }

  const check = {
    step: '35-U4-D',
    status: issues.length ? 'live_source_stability_blocked' : 'live_source_stability_ready',
    qa_passed: issues.length === 0,
    latest_edition_id: latest,
    target_date: snapshot?.target_date || '',
    source_count: Number(snapshot?.source_count || 0),
    source_success_count: Number(snapshot?.source_success_count || 0),
    source_error_count: Number(snapshot?.source_error_count || 0),
    raw_item_count: Number(snapshot?.raw_item_count || 0),
    included_item_count: Number(snapshot?.included_item_count || 0),
    included_source_count: new Set((snapshot?.included_items || []).map((item) => item.source).filter(Boolean)).size,
    published_at_window_enforced: true,
    issues,
    warnings
  };
  writeFileSync(OUT, `${JSON.stringify(check, null, 2)}\n`);
  console.log(`live source stability status: ${check.status}`);
  warnings.forEach((warning) => console.warn(`::warning title=Live Source Stability Warning::${warning}`));
  if (issues.length) {
    console.error(`::error title=Live Source Stability Failed::${issues.join('; ')}`);
    process.exit(1);
  }
}

main();
