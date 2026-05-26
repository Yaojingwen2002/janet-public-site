#!/usr/bin/env node
// QA for the incremental Janet news store.

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const ROOT = resolve(process.cwd());
const STORE_DIR = resolve(ROOT, 'data/news-store');
const CHECK_PATH = resolve(STORE_DIR, 'news-store-check.json');
const CANDIDATES_PATH = resolve(STORE_DIR, 'daily-candidates.json');

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
  if (!candidates) {
    issues.push('data/news-store/daily-candidates.json missing');
  } else if (candidates.__invalid) {
    issues.push(`daily-candidates.json invalid: ${candidates.__invalid}`);
  } else {
    if (!Array.isArray(candidates.selected)) issues.push('daily-candidates selected must be an array');
    if (!Array.isArray(candidates.blocked)) issues.push('daily-candidates blocked must be an array');
    const selectedCount = Number(candidates.selected_count || 0);
    const actualSelectedCount = Array.isArray(candidates.selected) ? candidates.selected.length : 0;
    if (selectedCount !== actualSelectedCount) {
      issues.push(`selected_count mismatch: ${selectedCount} != ${actualSelectedCount}`);
    }
    if (!candidates.publish_recommendation) {
      issues.push('publish_recommendation missing');
    }
    if (selectedCount < 5 && candidates.publish_recommendation !== 'no_new_edition_allowed') {
      issues.push('selected_count < 5 must publish_recommendation no_new_edition_allowed');
    }
    if (selectedCount >= 8 && candidates.publish_recommendation === 'no_new_edition_allowed') {
      issues.push('selected_count >= 8 must not publish_recommendation no_new_edition_allowed');
    }
    if (selectedCount >= 5 && selectedCount < 8 && candidates.publish_recommendation !== 'limited_edition_candidate') {
      issues.push('selected_count 5-7 must publish_recommendation limited_edition_candidate');
    }
    if (!Number.isFinite(Number(candidates.window_hours))) {
      issues.push('window_hours missing or invalid');
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
