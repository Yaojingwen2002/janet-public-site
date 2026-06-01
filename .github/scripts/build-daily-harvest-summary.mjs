#!/usr/bin/env node
// Build a transparent daily harvest summary for the Janet news store.

import { resolve } from 'node:path';
import {
  STORE_DIR,
  defaultDateShanghai,
  localCoreWindowForDate,
  readJson,
  readNewsStoreItems,
  writeJson
} from './news-store-utils.mjs';

const SUMMARY_PATH = resolve(STORE_DIR, 'daily-harvest-summary.json');
const CANDIDATES_PATH = resolve(STORE_DIR, 'daily-candidates.json');
const STATUS_FILES = {
  rss: resolve(STORE_DIR, 'harvest-run-status.json'),
  search: resolve(STORE_DIR, 'harvest-search-news-status.json'),
  direct: resolve(STORE_DIR, 'harvest-direct-web-sources-status.json'),
  chinese: resolve(STORE_DIR, 'harvest-chinese-ai-sources-status.json'),
  official: resolve(STORE_DIR, 'harvest-official-release-notes-status.json')
};

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i];
    if (!item.startsWith('--')) continue;
    const key = item.slice(2);
    const value = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
    args[key] = value;
  }
  return args;
}

function validDate(value) {
  const date = new Date(value || '');
  return !Number.isNaN(date.getTime()) ? date : null;
}

function isGenericTitle(title) {
  return /update|updates|roundup|weekly|newsletter|latest news|新进展|更新汇总|最新动态/i.test(String(title || ''));
}

function eligible(item, { allowLowConfidence = false } = {}) {
  if (!item.title || !item.url || !validDate(item.published_at)) return false;
  if (isGenericTitle(item.title)) return false;
  if (!allowLowConfidence && (item.published_at_confidence === 'low' || (item.quality_flags || []).includes('low_published_at_confidence'))) return false;
  return true;
}

function importantWeekly(item) {
  const text = `${item.title || ''} ${item.summary_raw || ''} ${item.source_name || ''} ${item.source_type || ''}`.toLowerCase();
  const official = ['S', 'A'].includes(item.source_rank) || /official|release|openai|anthropic|google|github|hugging face|langchain|nvidia/.test(text);
  const important = /release|launch|announce|introduc|model|api|sdk|changelog|release notes|gpt|claude|gemini|copilot|agent|benchmark|open source|weights|tool calling|memory/.test(text);
  return official && important;
}

function inRange(item, start, end) {
  const date = validDate(item.published_at);
  return Boolean(date && date >= start && date < end);
}

function sourceBreakdown(statuses) {
  const breakdown = {};
  for (const [layer, status] of Object.entries(statuses)) {
    for (const [sourceId, entry] of Object.entries(status?.source_breakdown || {})) {
      breakdown[sourceId] = { layer, ...entry };
    }
  }
  return breakdown;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const targetDate = String(args.date || defaultDateShanghai());
  const window = localCoreWindowForDate(targetDate);
  const coreStart = new Date(window.core_window_start);
  const coreEnd = new Date(window.core_window_end);
  const extendedStart = new Date(coreEnd.getTime() - 48 * 36e5);
  const weeklyStart = new Date(coreEnd.getTime() - 7 * 24 * 36e5);
  const statuses = Object.fromEntries(Object.entries(STATUS_FILES).map(([key, file]) => [key, readJson(file, {})]));
  const items = readNewsStoreItems();
  const coreItems = items.filter((item) => inRange(item, coreStart, coreEnd));
  const extendedItems = items.filter((item) => inRange(item, extendedStart, coreStart));
  const weeklyItems = items.filter((item) => inRange(item, weeklyStart, coreEnd));
  const candidates = readJson(CANDIDATES_PATH, {});
  const candidateMatchesDate = candidates?.target_date === targetDate;

  const summary = {
    target_date: targetDate,
    timezone: window.timezone,
    core_window_start: window.core_window_start,
    core_window_end: window.core_window_end,
    rss_raw_seen: Number(statuses.rss?.raw_items_seen || 0),
    search_raw_seen: Number(statuses.search?.raw_items_seen || 0),
    direct_raw_seen: Number(statuses.direct?.raw_items_seen || 0),
    chinese_raw_seen: Number(statuses.chinese?.raw_items_seen || 0),
    official_raw_seen: Number(statuses.official?.raw_items_seen || 0),
    new_items_added: Object.values(statuses).reduce((sum, status) => sum + Number(status?.new_items_added || 0), 0),
    historical_pool_count: candidateMatchesDate ? Number(candidates.historical_pool_count || items.length) : items.length,
    core_window_items_count: candidateMatchesDate ? Number(candidates.core_window_items_count || coreItems.length) : coreItems.length,
    core_window_eligible_count: candidateMatchesDate
      ? Number(candidates.core_window_eligible_count || 0)
      : coreItems.filter((item) => eligible(item)).length,
    extended_48h_eligible_count: candidateMatchesDate
      ? Number(candidates.extended_48h_eligible_count || 0)
      : extendedItems.filter((item) => eligible(item, { allowLowConfidence: true })).length,
    weekly_context_count: candidateMatchesDate
      ? Number(candidates.weekly_context_count || 0)
      : weeklyItems.filter((item) => eligible(item, { allowLowConfidence: true }) && importantWeekly(item)).length,
    unique_story_count: candidateMatchesDate ? Number(candidates.unique_story_count || 0) : 0,
    selected_count: candidateMatchesDate ? Number(candidates.selected_count || 0) : 0,
    publish_recommendation: candidateMatchesDate ? candidates.publish_recommendation || '' : '',
    blocked_reason_counts: candidateMatchesDate ? candidates.blocked_reason_counts || {} : {},
    source_breakdown: sourceBreakdown(statuses)
  };

  writeJson(SUMMARY_PATH, summary);
  console.log('daily harvest summary ready');
  console.log(JSON.stringify({
    target_date: summary.target_date,
    core_window_start: summary.core_window_start,
    core_window_end: summary.core_window_end,
    new_items_added: summary.new_items_added,
    core_window_eligible_count: summary.core_window_eligible_count,
    extended_48h_eligible_count: summary.extended_48h_eligible_count,
    weekly_context_count: summary.weekly_context_count,
    unique_story_count: summary.unique_story_count,
    publish_recommendation: summary.publish_recommendation
  }, null, 2));
}

main();
