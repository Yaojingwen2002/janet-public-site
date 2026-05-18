#!/usr/bin/env node
// Janet source coverage audit. Keeps crawler/debug facts out of reader-facing pages.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const ROOT = resolve(process.cwd());
const OUT = resolve(ROOT, 'data/source-coverage-report.json');

function ensureDir(filePath) {
  mkdirSync(dirname(filePath), { recursive: true });
}

function readJson(filePath, fallback = null) {
  if (!existsSync(filePath)) return fallback;
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, data) {
  ensureDir(filePath);
  writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

function allStories(content) {
  if (Array.isArray(content?.edition_items)) return content.edition_items;
  return Object.values(content?.sections || {}).flatMap((section) => section.items || []);
}

function main() {
  const pool = readJson(resolve(ROOT, '.github/scripts/rss-source-pool.json'), { sources: [] });
  const status = readJson(resolve(ROOT, 'data/daily-news-run-status.json'), {});
  const manifest = readJson(resolve(ROOT, 'data/MANIFEST.json'), []);
  const edition = status.published_edition_id || manifest[0] || '';
  const content = edition ? readJson(resolve(ROOT, `data/${edition}/content.json`), {}) : {};
  const editionItems = allStories(content);
  const homepageItems = Array.isArray(content.homepage_items) ? content.homepage_items : [];
  const hiddenItems = Array.isArray(content.hidden_items) ? content.hidden_items : [];
  const sourceReports = Array.isArray(status.source_reports) ? status.source_reports : [];
  const enabled = (pool.sources || []).filter((source) => source.enabled);
  const sourceMap = new Map(sourceReports.map((report) => [report.id, report]));

  const notDisplayedReasons = {
    outside_time_window: Number(status.exclusion_reasons?.outside_time_window || 0),
    duplicate: Number(status.exclusion_reasons?.duplicate || 0),
    low_editorial_score: hiddenItems.filter((item) => item.reason === 'low_editorial_score').length,
    missing_published_at: Number(status.exclusion_reasons?.missing_published_at || 0),
    not_home_slot: hiddenItems.filter((item) => item.reason === 'not_home_slot').length
  };

  const report = {
    step: '35-R',
    source_count: enabled.length,
    source_success_count: Number(status.source_success_count || 0),
    source_error_count: Number(status.source_error_count || 0),
    source_empty_count: Number(status.source_empty_count || 0),
    raw_items: Number(status.raw_items || 0),
    window_items: Number(status.included || editionItems.length || 0),
    included_items: editionItems.length,
    displayed_on_home: homepageItems.length,
    displayed_in_archive: editionItems.length,
    not_displayed_reasons: notDisplayedReasons,
    sources: enabled.map((source) => {
      const sourceReport = sourceMap.get(source.id) || {};
      const includedCount = editionItems.filter((story) => story.source === source.source).length;
      const homeCount = homepageItems.filter((item) => item.source === source.source).length;
      return {
        id: source.id,
        source: source.source,
        category: source.category,
        rank: source.rank,
        status: sourceReport.status || (includedCount ? 'included_without_latest_report' : 'not_in_latest_run'),
        raw_items: Number(sourceReport.item_count || 0),
        included_items: includedCount,
        displayed_on_home: homeCount,
        error: sourceReport.error || ''
      };
    })
  };

  writeJson(OUT, report);
  console.log(`source coverage: ${report.source_count} sources, ${report.displayed_on_home} homepage items`);
}

main();
