#!/usr/bin/env node
// Build daily Janet news candidates from the incremental JSONL news store.
// It does not fetch RSS, publish editions, update MANIFEST, or render pages.

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const ROOT = resolve(process.cwd());
const TZ = 'Asia/Shanghai';
const STORE_DIR = resolve(ROOT, 'data/news-store');
const DAILY_CANDIDATES_PATH = resolve(STORE_DIR, 'daily-candidates.json');
const SOURCE_STATUS_PATH = resolve(STORE_DIR, 'sources-status.json');
const MIN_FULL_EDITION_COUNT = 8;
const MIN_LIMITED_EDITION_COUNT = 5;

function ensureDir(filePath) {
  mkdirSync(dirname(filePath), { recursive: true });
}

function readJson(filePath, fallback) {
  if (!existsSync(filePath)) return fallback;
  try {
    return JSON.parse(readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJson(filePath, data) {
  ensureDir(filePath);
  writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

function defaultDateShanghai() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date());
}

function nowShanghai() {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).format(new Date()).replace(' ', 'T') + '+08:00';
}

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

function localEndForDate(dateStr) {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day, 23, 59, 59) - 8 * 60 * 60 * 1000);
}

function readJsonlFiles() {
  if (!existsSync(STORE_DIR)) return [];
  const files = readdirSync(STORE_DIR)
    .filter((name) => /^items-\d{4}-\d{2}\.jsonl$/.test(name))
    .sort();
  const items = [];
  for (const file of files) {
    const fullPath = resolve(STORE_DIR, file);
    const lines = readFileSync(fullPath, 'utf8').split(/\n+/).filter(Boolean);
    for (const line of lines) {
      try {
        items.push(JSON.parse(line));
      } catch {
        // QA owns line-level JSON failures. Candidate builder skips broken lines.
      }
    }
  }
  return items;
}

function isGenericTitle(title) {
  return /update|updates|roundup|weekly|newsletter|latest news|新进展|更新汇总|最新动态/i.test(String(title || ''));
}

function categorize(item) {
  const text = `${item.title || ''} ${item.summary_raw || ''} ${item.category_hint || ''}`.toLowerCase();
  if (/agent|agents|workflow|copilot|coding|developer|github|langchain|llamaindex/.test(text)) return 'agents';
  if (/model|gpt|claude|gemini|llama|mistral|openai|anthropic|deepmind/.test(text)) return 'models';
  if (/paper|research|benchmark|arxiv|dataset|evaluation|leaderboard/.test(text)) return 'research';
  if (/open source|opensource|hugging face|github|license|weights/.test(text)) return 'open_source';
  if (/creator|video|image|audio|music|design|studio|adobe|canva|spotify|elevenlabs/.test(text)) return 'creator_tools';
  if (/china|chinese|alibaba|tencent|baidu|bytedance|国内|中国/.test(text)) return 'china';
  if (/enterprise|business|revenue|market|startup|funding|customer|cloud|aws|microsoft|nvidia/.test(text)) return 'business';
  return item.category_hint || 'products';
}

function scoreItem(item, windowEnd) {
  const reasons = [];
  let score = 0;
  const rankScore = { S: 32, A: 24, B: 16, C: 8 }[item.source_rank] || 12;
  score += rankScore;
  reasons.push(`source_rank_${item.source_rank || 'unknown'}:+${rankScore}`);

  const publishedAt = new Date(item.published_at);
  const ageHours = Math.max(0, (windowEnd.getTime() - publishedAt.getTime()) / 36e5);
  const freshness = Math.max(0, Math.round(24 - Math.min(ageHours, 48) / 2));
  score += freshness;
  reasons.push(`freshness:+${freshness}`);

  const text = `${item.title || ''} ${item.summary_raw || ''}`;
  if (/[A-Z][A-Za-z0-9.-]{2,}|GPT|Claude|Gemini|Llama|Copilot|Bedrock|CUDA|AI|API/.test(text)) {
    score += 10;
    reasons.push('specific_entity:+10');
  }
  if (/\b(model|agent|benchmark|API|tool|launch|release|open source|funding|market|enterprise|developer|workflow)\b/i.test(text)) {
    score += 8;
    reasons.push('clear_ai_signal:+8');
  }
  if (/\d|%|\$|million|billion|万|亿/.test(text)) {
    score += 6;
    reasons.push('has_data:+6');
  }
  if (/creator|small business|enterprise|developer|workflow|automation|tool|studio|design|video|audio|image/i.test(text)) {
    score += 7;
    reasons.push('janet_relevance:+7');
  }
  if (isGenericTitle(item.title)) {
    score -= 18;
    reasons.push('generic_title:-18');
  }
  if ((item.quality_flags || []).includes('missing_published_at')) {
    score -= 40;
    reasons.push('missing_published_at:-40');
  }
  if (!item.url) {
    score -= 50;
    reasons.push('missing_url:-50');
  }
  return { score, score_reasons: reasons };
}

function itemInWindow(item, windowStart, windowEnd) {
  if (!item.title || !item.url || !item.published_at) return false;
  const date = new Date(item.published_at);
  if (Number.isNaN(date.getTime())) return false;
  return date >= windowStart && date <= windowEnd;
}

function uniqueByCluster(items) {
  const seen = new Set();
  const selected = [];
  const blocked = [];
  for (const item of items) {
    const key = item.dedupe_key || item.canonical_url || item.url || item.id;
    if (seen.has(key)) {
      blocked.push({ id: item.id, title: item.title, reason: 'duplicate_canonical_cluster' });
      continue;
    }
    seen.add(key);
    selected.push(item);
  }
  return { selected, blocked };
}

function buildForWindow(items, windowHours, windowEnd) {
  const windowStart = new Date(windowEnd.getTime() - windowHours * 36e5);
  const blocked = [];
  const eligible = [];
  for (const item of items) {
    if (!item.title) {
      blocked.push({ id: item.id, title: item.title || '', reason: 'missing_title' });
      continue;
    }
    if (!item.url) {
      blocked.push({ id: item.id, title: item.title || '', reason: 'missing_url' });
      continue;
    }
    if (!item.published_at || Number.isNaN(new Date(item.published_at).getTime())) {
      blocked.push({ id: item.id, title: item.title || '', reason: 'missing_or_invalid_published_at' });
      continue;
    }
    if (!itemInWindow(item, windowStart, windowEnd)) {
      blocked.push({ id: item.id, title: item.title || '', reason: 'outside_window' });
      continue;
    }
    if (isGenericTitle(item.title)) {
      blocked.push({ id: item.id, title: item.title || '', reason: 'generic_title' });
      continue;
    }
    eligible.push(item);
  }
  const scored = eligible.map((item) => {
    const score = scoreItem(item, windowEnd);
    const janetCategory = categorize(item);
    const publishability = score.score >= 34 ? 'eligible' : 'weak';
    return {
      ...item,
      janet_category: janetCategory,
      score: score.score,
      score_reasons: score.score_reasons,
      publishability
    };
  }).sort((a, b) => b.score - a.score);
  const deduped = uniqueByCluster(scored);
  return {
    window_start: windowStart.toISOString(),
    window_end: windowEnd.toISOString(),
    qualified: deduped.selected.filter((item) => item.publishability === 'eligible'),
    weak: deduped.selected.filter((item) => item.publishability !== 'eligible'),
    blocked: [...blocked, ...deduped.blocked]
  };
}

function recommendation(selectedCount) {
  if (selectedCount >= MIN_FULL_EDITION_COUNT) return 'full_edition';
  if (selectedCount >= MIN_LIMITED_EDITION_COUNT) return 'limited_edition_candidate';
  return 'no_new_edition_allowed';
}

function selectDiverseCandidates(qualified, limit = 12) {
  const selected = [];
  const sourceCounts = {};
  const categoryCounts = {};
  const bySource = new Map();
  for (const item of qualified) {
    if (!bySource.has(item.source_id)) bySource.set(item.source_id, []);
    bySource.get(item.source_id).push(item);
  }
  const sourceLeaders = [...bySource.values()]
    .map((items) => items[0])
    .sort((a, b) => b.score - a.score);
  for (const item of sourceLeaders) {
    selected.push(item);
    sourceCounts[item.source_id] = 1;
    categoryCounts[item.janet_category] = (categoryCounts[item.janet_category] || 0) + 1;
    if (selected.length >= limit) return selected;
  }
  for (const item of qualified) {
    if (selected.some((selectedItem) => selectedItem.id === item.id)) continue;
    const sourceCount = sourceCounts[item.source_id] || 0;
    const categoryCount = categoryCounts[item.janet_category] || 0;
    if (sourceCount >= 4) continue;
    if (categoryCount >= 5) continue;
    selected.push(item);
    sourceCounts[item.source_id] = sourceCount + 1;
    categoryCounts[item.janet_category] = categoryCount + 1;
    if (selected.length >= limit) return selected;
  }
  for (const item of qualified) {
    if (selected.some((selectedItem) => selectedItem.id === item.id)) continue;
    selected.push(item);
    if (selected.length >= limit) break;
  }
  return selected;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const targetDate = String(args.date || defaultDateShanghai());
  const windowEnd = localEndForDate(targetDate);
  const items = readJsonlFiles();
  let finalWindow = null;
  for (const hours of [24, 36, 48]) {
    const candidateWindow = buildForWindow(items, hours, windowEnd);
    finalWindow = { hours, ...candidateWindow };
    if (candidateWindow.qualified.length >= MIN_FULL_EDITION_COUNT || hours === 48) break;
  }
  const selected = selectDiverseCandidates(finalWindow.qualified, 12);
  const sourceMix = {};
  for (const item of selected) {
    sourceMix[item.source_id] = (sourceMix[item.source_id] || 0) + 1;
  }
  const publishRecommendation = recommendation(selected.length);
  const sourceStatus = readJson(SOURCE_STATUS_PATH, {});
  const result = {
    status: 'daily_candidates_ready',
    run_at: nowShanghai(),
    target_date: targetDate,
    timezone: TZ,
    window_hours: finalWindow.hours,
    window_start: finalWindow.window_start,
    window_end: finalWindow.window_end,
    expanded_window_reason: finalWindow.hours > 24 ? 'qualified_items_below_minimum' : '',
    item_pool_count: items.length,
    qualified_count: finalWindow.qualified.length,
    weak_count: finalWindow.weak.length,
    selected_count: selected.length,
    min_full_edition_count: MIN_FULL_EDITION_COUNT,
    min_limited_edition_count: MIN_LIMITED_EDITION_COUNT,
    publish_recommendation: publishRecommendation,
    no_new_edition_reason: publishRecommendation === 'no_new_edition_allowed' ? 'selected_count_below_min_limited_edition_count' : '',
    selected,
    blocked: finalWindow.blocked.slice(0, 200),
    source_mix: sourceMix,
    source_status_summary: {
      source_count: Object.keys(sourceStatus).length,
      source_success_count: Object.values(sourceStatus).filter((entry) => entry.last_status === 'success').length,
      source_error_count: Object.values(sourceStatus).filter((entry) => entry.last_status === 'error').length,
      source_not_modified_count: Object.values(sourceStatus).filter((entry) => entry.last_status === 'not_modified').length
    }
  };
  writeJson(DAILY_CANDIDATES_PATH, result);
  console.log(`daily candidates status: ${result.status}`);
  console.log(JSON.stringify({
    target_date: result.target_date,
    window_hours: result.window_hours,
    qualified_count: result.qualified_count,
    selected_count: result.selected_count,
    publish_recommendation: result.publish_recommendation
  }, null, 2));
}

main();
