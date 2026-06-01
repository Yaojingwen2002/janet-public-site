#!/usr/bin/env node
// QA for the incremental Janet news store.

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const ROOT = resolve(process.cwd());
const STORE_DIR = resolve(ROOT, 'data/news-store');
const CHECK_PATH = resolve(STORE_DIR, 'news-store-check.json');
const CANDIDATES_PATH = resolve(STORE_DIR, 'daily-candidates.json');
const SUMMARY_PATH = resolve(STORE_DIR, 'daily-harvest-summary.json');

function ensureDir(filePath) {
  mkdirSync(dirname(filePath), { recursive: true });
}

function writeJson(filePath, data) {
  ensureDir(filePath);
  writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

function readJson(filePath, fallback) {
  if (!existsSync(filePath)) return fallback;
  try {
    return JSON.parse(readFileSync(filePath, 'utf8'));
  } catch (error) {
    return { __invalid: error.message };
  }
}

function readJsonlItems(issues) {
  if (!existsSync(STORE_DIR)) {
    issues.push('data/news-store directory missing');
    return [];
  }
  const files = readdirSync(STORE_DIR)
    .filter((name) => /^items-\d{4}-\d{2}\.jsonl$/.test(name))
    .sort();
  if (!files.length) {
    issues.push('no data/news-store/items-YYYY-MM.jsonl files found');
    return [];
  }
  const items = [];
  for (const file of files) {
    const fullPath = resolve(STORE_DIR, file);
    const lines = readFileSync(fullPath, 'utf8').split(/\n+/).filter(Boolean);
    lines.forEach((line, index) => {
      try {
        items.push({ ...JSON.parse(line), __file: file, __line: index + 1 });
      } catch (error) {
        issues.push(`${file}:${index + 1} invalid JSONL: ${error.message}`);
      }
    });
  }
  return items;
}

function validDate(value) {
  if (!value) return false;
  return !Number.isNaN(new Date(value).getTime());
}

function expectedCoreWindow(dateStr) {
  const [year, month, day] = String(dateStr || '').split('-').map(Number);
  if (!year || !month || !day) return null;
  const end = new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
  const start = new Date(end.getTime() - 24 * 36e5);
  return {
    start: start.toISOString(),
    end: end.toISOString()
  };
}

function storyIdentity(item) {
  return item.story_id || item.canonical_url || item.dedupe_key || item.url || item.id || '';
}

function main() {
  const issues = [];
  const warnings = [];
  const items = readJsonlItems(issues);
  const idSeen = new Map();
  const dedupeSeen = new Map();

  for (const item of items) {
    const label = `${item.__file}:${item.__line}`;
    for (const field of ['id', 'source_id', 'source_name', 'title', 'url', 'canonical_url', 'dedupe_key', 'content_hash', 'status']) {
      if (!item[field]) issues.push(`${label} missing required field: ${field}`);
    }
    if (!item.published_at) {
      warnings.push(`${label} missing published_at`);
    } else if (!validDate(item.published_at)) {
      issues.push(`${label} invalid published_at: ${item.published_at}`);
    }
    if (idSeen.has(item.id)) {
      issues.push(`duplicate item id: ${item.id}`);
    }
    idSeen.set(item.id, item);
    const dedupeKey = item.dedupe_key || item.canonical_url;
    if (dedupeKey) {
      dedupeSeen.set(dedupeKey, (dedupeSeen.get(dedupeKey) || 0) + 1);
    }
  }

  const duplicateDedupeKeys = [...dedupeSeen.entries()].filter(([, count]) => count > 1);
  if (duplicateDedupeKeys.length) {
    warnings.push(`duplicate dedupe keys in JSONL store: ${duplicateDedupeKeys.length}`);
  }

  const candidates = readJson(CANDIDATES_PATH, null);
  const summary = readJson(SUMMARY_PATH, null);
  if (!candidates) {
    issues.push('data/news-store/daily-candidates.json missing');
  } else if (candidates.__invalid) {
    issues.push(`daily-candidates.json invalid: ${candidates.__invalid}`);
  } else {
    if (!Array.isArray(candidates.selected)) issues.push('daily-candidates selected must be an array');
    if (!Array.isArray(candidates.blocked)) issues.push('daily-candidates blocked must be an array');
    const selectedCount = Number(candidates.selected_count || 0);
    const actualSelectedCount = Array.isArray(candidates.selected) ? candidates.selected.length : 0;
    const uniqueStoryCount = Number(candidates.unique_story_count || 0);
    const selected = Array.isArray(candidates.selected) ? candidates.selected : [];
    const expectedWindow = expectedCoreWindow(candidates.target_date);
    if (selectedCount !== actualSelectedCount) {
      issues.push(`selected_count mismatch: ${selectedCount} != ${actualSelectedCount}`);
    }
    if (!candidates.historical_pool_count) {
      issues.push('historical_pool_count missing');
    }
    if (Object.prototype.hasOwnProperty.call(candidates, 'item_pool_count')) {
      issues.push('item_pool_count must not be used in daily-candidates; use historical_pool_count');
    }
    if (!expectedWindow) {
      issues.push('target_date missing or invalid');
    } else {
      if (candidates.core_window_start !== expectedWindow.start) {
        issues.push(`core_window_start must be previous day 08:00 +08: ${candidates.core_window_start} != ${expectedWindow.start}`);
      }
      if (candidates.core_window_end !== expectedWindow.end) {
        issues.push(`core_window_end must be target day 08:00 +08: ${candidates.core_window_end} != ${expectedWindow.end}`);
      }
      if (String(candidates.core_window_end || '').includes('15:59:59')) {
        issues.push('core_window_end appears to use target_date 23:59:59 +08');
      }
    }
    if (Number(candidates.core_window_hours) !== 24) {
      issues.push('core_window_hours must be 24');
    }
    for (const field of [
      'core_window_items_count',
      'core_window_eligible_count',
      'extended_48h_eligible_count',
      'weekly_context_count',
      'blocked_reason_counts',
      'source_mix'
    ]) {
      if (!Object.prototype.hasOwnProperty.call(candidates, field)) issues.push(`daily-candidates missing field: ${field}`);
    }
    if (!candidates.publish_recommendation) {
      issues.push('publish_recommendation missing');
    }
    if (uniqueStoryCount < 8 && candidates.publish_recommendation !== 'no_new_edition_allowed') {
      issues.push('unique_story_count < 8 must publish_recommendation no_new_edition_allowed');
    }
    if (uniqueStoryCount >= 8 && uniqueStoryCount < 12 && candidates.publish_recommendation !== 'limited_edition') {
      issues.push('unique_story_count 8-11 must publish_recommendation limited_edition');
    }
    if (uniqueStoryCount >= 12 && candidates.publish_recommendation !== 'full_edition') {
      issues.push('unique_story_count >= 12 must publish_recommendation full_edition');
    }
    const computedUniqueStories = new Set(selected.filter((item) => !item.reuse_as_angle).map(storyIdentity).filter(Boolean)).size;
    if (uniqueStoryCount !== computedUniqueStories) {
      issues.push(`unique_story_count must count independent stories only: ${uniqueStoryCount} != ${computedUniqueStories}`);
    }
    const reuseCounts = new Map();
    for (const item of selected) {
      const identity = storyIdentity(item);
      if (!identity) issues.push(`selected item missing story identity: ${item.id || item.title}`);
      reuseCounts.set(identity, (reuseCounts.get(identity) || 0) + 1);
      for (const field of ['story_id', 'canonical_url', 'dedupe_key', 'window_role', 'display_badge', 'reuse_as_angle', 'story_reuse_count', 'angle']) {
        if (!Object.prototype.hasOwnProperty.call(item, field)) issues.push(`selected item missing ${field}: ${item.id || item.title}`);
      }
      if (item.window_role === 'extended_48h' && item.display_badge === '今日新闻') {
        issues.push(`extended_48h item cannot display 今日新闻: ${item.id || item.title}`);
      }
      if (item.window_role === 'weekly_context' && item.display_badge === '今日新闻') {
        issues.push(`weekly_context item cannot display 今日新闻: ${item.id || item.title}`);
      }
      if (item.window_role === 'core_window') {
        if (!item.published_at || !validDate(item.published_at)) issues.push(`core_window item missing/invalid published_at: ${item.id || item.title}`);
        if (item.published_at_confidence === 'low' || (item.quality_flags || []).includes('low_published_at_confidence')) {
          issues.push(`low-confidence item cannot enter core_window: ${item.id || item.title}`);
        }
      }
    }
    const maxReuse = Math.max(0, ...reuseCounts.values());
    if (maxReuse > 2) {
      issues.push(`same story/canonical_url reused more than 2 times: ${maxReuse}`);
    }
    for (const item of selected) {
      const declared = Number(item.story_reuse_count || 0);
      const actual = reuseCounts.get(storyIdentity(item)) || 0;
      if (declared !== actual) {
        issues.push(`story_reuse_count mismatch for ${item.id || item.title}: ${declared} != ${actual}`);
      }
    }
  }

  if (!summary) {
    issues.push('data/news-store/daily-harvest-summary.json missing');
  } else if (summary.__invalid) {
    issues.push(`daily-harvest-summary.json invalid: ${summary.__invalid}`);
  } else {
    for (const field of [
      'target_date',
      'timezone',
      'core_window_start',
      'core_window_end',
      'rss_raw_seen',
      'search_raw_seen',
      'direct_raw_seen',
      'chinese_raw_seen',
      'official_raw_seen',
      'new_items_added',
      'historical_pool_count',
      'core_window_items_count',
      'core_window_eligible_count',
      'extended_48h_eligible_count',
      'weekly_context_count',
      'unique_story_count',
      'selected_count',
      'publish_recommendation',
      'blocked_reason_counts',
      'source_breakdown'
    ]) {
      if (!Object.prototype.hasOwnProperty.call(summary, field)) issues.push(`daily-harvest-summary missing field: ${field}`);
    }
    if (summary.target_date && candidates?.target_date && summary.target_date !== candidates.target_date) {
      issues.push(`daily-harvest-summary target_date mismatch: ${summary.target_date} != ${candidates.target_date}`);
    }
    if (summary.core_window_start !== candidates?.core_window_start || summary.core_window_end !== candidates?.core_window_end) {
      issues.push('daily-harvest-summary core window does not match daily-candidates');
    }
    if (summary.source_breakdown && typeof summary.source_breakdown === 'object') {
      const failedSources = Object.values(summary.source_breakdown).filter((entry) => entry.status === 'error');
      if (failedSources.length && !failedSources.every((entry) => Object.prototype.hasOwnProperty.call(entry, 'error'))) {
        issues.push('failed source entries must include error status details');
      }
    }
  }

  const check = {
    step: '35-U13-B',
    qa_passed: issues.length === 0,
    status: issues.length === 0 ? 'news_store_ready' : 'news_store_blocked',
    issues,
    warnings,
    items_checked: items.length,
    candidate_selected_count: candidates && !candidates.__invalid ? Number(candidates.selected_count || 0) : 0,
    candidate_unique_story_count: candidates && !candidates.__invalid ? Number(candidates.unique_story_count || 0) : 0,
    publish_recommendation: candidates && !candidates.__invalid ? candidates.publish_recommendation || '' : ''
  };
  writeJson(CHECK_PATH, check);
  console.log(`news store qa status: ${check.status}`);
  if (issues.length) {
    console.error(JSON.stringify({ issues, warnings }, null, 2));
    process.exit(1);
  }
}

main();
