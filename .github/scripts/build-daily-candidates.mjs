#!/usr/bin/env node
// Build daily Janet news candidates from the incremental JSONL news store.
// This does not fetch sources, publish editions, update MANIFEST, or render pages.

import { resolve } from 'node:path';
import {
  STORE_DIR,
  SOURCE_STATUS_PATH,
  canonicalizeUrl,
  defaultDateShanghai,
  hash,
  localCoreWindowForDate,
  nowShanghai,
  readJson,
  readNewsStoreItems,
  writeJson
} from './news-store-utils.mjs';

const DAILY_CANDIDATES_PATH = resolve(STORE_DIR, 'daily-candidates.json');
const DAILY_HARVEST_SUMMARY_PATH = resolve(STORE_DIR, 'daily-harvest-summary.json');
const MINIMUM_UNIQUE_STORY_COUNT = 8;
const FULL_UNIQUE_STORY_COUNT = 12;
const SELECT_LIMIT = 12;

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
  if (/china|chinese|alibaba|tencent|baidu|bytedance|国内|中国|中文|ai base|aibase|it之家|钛媒体|新浪|科学网|三立/.test(text)) return 'china';
  if (/enterprise|business|revenue|market|startup|funding|customer|cloud|aws|microsoft|nvidia|data center/.test(text)) return 'business';
  return item.category_hint || 'products';
}

function inferAngle(item) {
  const text = `${item.title || ''} ${item.summary_raw || ''} ${item.category_hint || ''}`.toLowerCase();
  if (/risk|safety|regulat|lawsuit|court|privacy|security|copyright|policy/.test(text)) return 'risk';
  if (/funding|invest|valuation|stock|revenue|market|business|customer|enterprise|data center/.test(text)) return 'business';
  if (/paper|research|benchmark|eval|dataset|leaderboard|arxiv/.test(text)) return 'research';
  if (/tool|copilot|coding|agent|workflow|api|sdk|developer|github|langchain/.test(text)) return 'tool';
  if (/model|gpt|claude|gemini|llama|release|launch|openai|anthropic/.test(text)) return 'model';
  if (/nvidia|softbank|fund|capex|investment/.test(text)) return 'investment';
  return 'fact';
}

function scoreItem(item, windowEnd) {
  const reasons = [];
  let score = 0;
  const rankScore = { S: 36, A: 28, B: 18, C: 10 }[item.source_rank] || 14;
  score += rankScore;
  reasons.push(`source_rank_${item.source_rank || 'unknown'}:+${rankScore}`);

  const publishedAt = new Date(item.published_at);
  const ageHours = Math.max(0, (windowEnd.getTime() - publishedAt.getTime()) / 36e5);
  const freshness = Math.max(0, Math.round(26 - Math.min(ageHours, 96) / 4));
  score += freshness;
  reasons.push(`freshness:+${freshness}`);

  const text = `${item.title || ''} ${item.summary_raw || ''}`;
  if (/[A-Z][A-Za-z0-9.-]{2,}|GPT|Claude|Gemini|Llama|Copilot|Bedrock|CUDA|AI|API/.test(text)) {
    score += 10;
    reasons.push('specific_entity:+10');
  }
  if (/\b(model|agent|benchmark|API|tool|launch|release|open source|funding|market|enterprise|developer|workflow|data center)\b/i.test(text)) {
    score += 9;
    reasons.push('clear_ai_signal:+9');
  }
  if (/\d|%|\$|million|billion|万|亿/.test(text)) {
    score += 6;
    reasons.push('has_data:+6');
  }
  if (/creator|small business|enterprise|developer|workflow|automation|tool|studio|design|video|audio|image/i.test(text)) {
    score += 7;
    reasons.push('janet_relevance:+7');
  }
  if (item.source_type === 'official_release_notes' || /release notes|changelog/i.test(`${item.source_name} ${text}`)) {
    score += 8;
    reasons.push('official_release_signal:+8');
  }
  if (/[\u4e00-\u9fff]/.test(item.title || '')) {
    score += 8;
    reasons.push('chinese_title:+8');
  }
  if (item.source_type === 'search') {
    score -= 8;
    reasons.push('search_source_penalty:-8');
  }
  const leadingEnglishWords = leadingEnglishWordCount(item.title);
  if (leadingEnglishWords >= 5) {
    score -= 22;
    reasons.push('long_english_lead:-22');
  }
  if (isGenericTitle(item.title)) {
    score -= 18;
    reasons.push('generic_title:-18');
  }
  if ((item.quality_flags || []).includes('missing_published_at')) {
    score -= 40;
    reasons.push('missing_published_at:-40');
  }
  if (item.published_at_confidence === 'low' || (item.quality_flags || []).includes('low_published_at_confidence')) {
    score -= 14;
    reasons.push('low_published_at_confidence:-14');
  }
  if (!item.url) {
    score -= 50;
    reasons.push('missing_url:-50');
  }
  return { score, score_reasons: reasons };
}

function leadingEnglishWordCount(title) {
  const cleaned = String(title || '').replace(/\s+-\s+[^-]{2,80}$/u, '').trim();
  const prefix = cleaned.split(/[\u4e00-\u9fff]/)[0] || '';
  const words = prefix.match(/[A-Za-z][A-Za-z0-9+.-]*/g);
  return words ? words.length : 0;
}

function validPublishedDate(item) {
  const date = new Date(item.published_at || '');
  return Number.isNaN(date.getTime()) ? null : date;
}

function itemInWindow(item, windowStart, windowEnd) {
  const date = validPublishedDate(item);
  return Boolean(date && date >= windowStart && date < windowEnd);
}

function normalizeTitle(title) {
  return String(title || '')
    .toLowerCase()
    .replace(/\s+-\s+[^-]{2,80}$/u, '')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[^a-z0-9\u4e00-\u9fff]+/gi, ' ')
    .replace(/\b(the|a|an|and|or|to|of|for|in|on|with|by|from|as|is|are|was|were|new|news|ai)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function eventText(item) {
  return [
    item.title,
    item.original_title,
    item.summary_raw,
    item.summary,
    item.source_name,
    item.canonical_url,
    item.url
  ].filter(Boolean).join(' ');
}

function normalizeEventText(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/％/g, '%')
    .replace(/[，。！？、：；,.!?;:"'“”‘’()[\]{}<>《》/\s_-]+/g, ' ')
    .trim();
}

function eventEntity(text) {
  const normalized = normalizeEventText(text);
  const entities = [
    ['alphabet', /\b(alphabet|google)\b|谷歌|字母表/],
    ['openai', /\bopenai\b|奥特曼|sam altman/],
    ['anthropic', /\banthropic\b|claude/],
    ['meta', /\bmeta\b/],
    ['microsoft', /\bmicrosoft\b|微软/],
    ['nvidia', /\bnvidia\b|英伟达/],
    ['amazon', /\bamazon\b|aws|亚马逊/],
    ['apple', /\bapple\b|苹果/],
    ['xai', /\bxai\b|马斯克/]
  ];
  return entities.find(([, pattern]) => pattern.test(normalized))?.[0] || '';
}

function eventAmount(text) {
  const normalized = normalizeEventText(text);
  if (/800\s*亿\s*美元|80\s*b(?:illion)?\s*(?:usd|dollars?)|\$?\s*80\s*b\b|80\s*0?亿美元/.test(normalized)) return '800亿美元';
  const chinese = normalized.match(/(\d+(?:\.\d+)?)\s*亿\s*美元/);
  if (chinese) return `${chinese[1]}亿美元`;
  const billion = normalized.match(/\$?\s*(\d+(?:\.\d+)?)\s*b(?:illion)?\s*(?:usd|dollars?)?/);
  if (billion) return `${Number(billion[1]) * 10}亿美元`;
  const million = normalized.match(/\$?\s*(\d+(?:\.\d+)?)\s*m(?:illion)?\s*(?:usd|dollars?)?/);
  if (million) return `${million[1]}百万美元`;
  return '';
}

function eventAction(text) {
  const normalized = normalizeEventText(text);
  if (/ai|人工智能/.test(normalized) && /资本支出|支出|建设|基础设施|capex|capital expenditure|spending|infrastructure|股权资本|资金/.test(normalized)) {
    return 'ai_capex';
  }
  if (/融资|筹资|募集|筹集|funding|financing|raise|raised|investment|investor/.test(normalized)) return 'financing';
  if (/发布|推出|上线|launch|release|announce|introduce/.test(normalized)) return 'launch';
  if (/合作|partner|partnership/.test(normalized)) return 'partnership';
  if (/诉讼|lawsuit|court|trial|legal/.test(normalized)) return 'legal';
  return '';
}

function eventSignature(item) {
  const text = eventText(item);
  const entity = eventEntity(text);
  const amount = eventAmount(text);
  const action = eventAction(text);
  if (!entity || !amount || !action) return '';
  return `event:${entity}:${amount}:${action}`;
}

function titleTokens(title) {
  return new Set(normalizeTitle(title).split(/\s+/).filter((token) => token.length >= 2));
}

function jaccard(a, b) {
  if (!a.size || !b.size) return 0;
  let overlap = 0;
  for (const token of a) if (b.has(token)) overlap += 1;
  return overlap / (a.size + b.size - overlap);
}

function storyKeys(item) {
  return [
    eventSignature(item),
    item.canonical_url ? `canonical:${canonicalizeUrl(item.canonical_url)}` : '',
    item.dedupe_key ? `dedupe:${item.dedupe_key}` : '',
    item.url ? `url:${canonicalizeUrl(item.url)}` : ''
  ].filter(Boolean);
}

function attachStoryIds(items) {
  const exact = new Map();
  const clusters = [];
  for (const item of items) {
    const keys = storyKeys(item);
    let cluster = keys.map((key) => exact.get(key)).find(Boolean);
    const normalized = normalizeTitle(item.title);
    const tokens = titleTokens(item.title);
    const source = String(item.source_id || item.source_name || '').toLowerCase();
    if (!cluster && normalized) {
      cluster = clusters.find((candidate) => {
        const similarity = jaccard(tokens, candidate.tokens);
        const sameSource = source && source === candidate.source;
        return similarity >= 0.86 || (sameSource && similarity >= 0.78);
      });
    }
    if (!cluster) {
      const seed = keys[0] || `title:${normalized}`;
      cluster = {
        story_id: `story-${hash(seed, 12)}`,
        keys: new Set(keys),
        normalized,
        tokens,
        source,
        titles: []
      };
      clusters.push(cluster);
    }
    keys.forEach((key) => exact.set(key, cluster));
    cluster.titles.push(item.title || '');
    item.story_id = cluster.story_id;
  }
  return items;
}

function blockedReason(item, role) {
  if (!item.title) return 'missing_title';
  if (!item.url && !item.canonical_url) return 'missing_url';
  if (!item.published_at || !validPublishedDate(item)) return 'missing_or_invalid_published_at';
  if (isGenericTitle(item.title)) return 'generic_title';
  if (role === 'core_window' && (item.published_at_confidence === 'low' || (item.quality_flags || []).includes('low_published_at_confidence'))) {
    return 'low_confidence_in_core_window';
  }
  return '';
}

function importantWeeklyContext(item) {
  const text = `${item.title || ''} ${item.summary_raw || ''} ${item.source_name || ''} ${item.source_type || ''}`.toLowerCase();
  const official = ['S', 'A'].includes(item.source_rank) ||
    item.source_type === 'official_release_notes' ||
    /openai|anthropic|google|github|hugging face|langchain|nvidia|microsoft|aws/.test(text);
  const important = /release|launch|announce|introduc|model|api|sdk|changelog|release notes|gpt|claude|gemini|copilot|agent|benchmark|open source|weights|tool calling|memory|data center/.test(text);
  return official && important;
}

function decorateItem(item, role, badge, windowEnd) {
  const score = scoreItem(item, windowEnd);
  return {
    ...item,
    canonical_url: item.canonical_url || item.url || '',
    dedupe_key: item.dedupe_key || item.canonical_url || item.url || item.id || '',
    window_role: role,
    display_badge: badge,
    reuse_as_angle: false,
    story_reuse_count: 1,
    angle: inferAngle(item),
    janet_category: categorize(item),
    score: score.score,
    score_reasons: score.score_reasons,
    publishability: score.score >= 30 ? 'eligible' : 'weak'
  };
}

function buildPool(items, { role, badge, start, end, allowLowConfidence = false, weeklyContext = false }) {
  const blocked = [];
  const qualified = [];
  const weak = [];
  for (const item of items) {
    if (!itemInWindow(item, start, end)) continue;
    const reason = blockedReason(item, role);
    if (reason) {
      blocked.push({ id: item.id, title: item.title || '', reason, window_role: role });
      continue;
    }
    if (!allowLowConfidence && (item.published_at_confidence === 'low' || (item.quality_flags || []).includes('low_published_at_confidence'))) {
      blocked.push({ id: item.id, title: item.title || '', reason: 'low_published_at_confidence', window_role: role });
      continue;
    }
    if (weeklyContext && !importantWeeklyContext(item)) {
      blocked.push({ id: item.id, title: item.title || '', reason: 'not_weekly_context_priority', window_role: role });
      continue;
    }
    const decorated = decorateItem(item, role, badge, end);
    if (decorated.publishability === 'eligible') qualified.push(decorated);
    else weak.push(decorated);
  }
  qualified.sort((a, b) => b.score - a.score);
  weak.sort((a, b) => b.score - a.score);
  return { qualified, weak, blocked };
}

function uniqueStoryItems(items) {
  const seen = new Set();
  const out = [];
  const blocked = [];
  for (const item of items) {
    const key = item.story_id || item.dedupe_key || item.canonical_url || item.url || item.id;
    if (seen.has(key)) {
      blocked.push({ id: item.id, title: item.title || '', reason: 'duplicate_story_cluster', story_id: item.story_id || '' });
      continue;
    }
    seen.add(key);
    out.push(item);
  }
  return { selected: out, blocked };
}

function selectDiverseCandidates(pools, limit = SELECT_LIMIT) {
  const selected = [];
  const storyCounts = new Map();
  const sourceCounts = new Map();
  const categoryCounts = new Map();

  const canUse = (item, enforceDiversity) => {
    const storyId = item.story_id || item.dedupe_key || item.canonical_url || item.url || item.id;
    if ((storyCounts.get(storyId) || 0) >= 1) return false;
    if (!enforceDiversity) return true;
    if ((sourceCounts.get(item.source_id) || 0) >= 4) return false;
    if ((categoryCounts.get(item.janet_category) || 0) >= 5) return false;
    return true;
  };

  const add = (item) => {
    const storyId = item.story_id || item.dedupe_key || item.canonical_url || item.url || item.id;
    selected.push(item);
    storyCounts.set(storyId, (storyCounts.get(storyId) || 0) + 1);
    sourceCounts.set(item.source_id, (sourceCounts.get(item.source_id) || 0) + 1);
    categoryCounts.set(item.janet_category, (categoryCounts.get(item.janet_category) || 0) + 1);
  };

  for (const enforceDiversity of [true, false]) {
    for (const pool of pools) {
      for (const item of pool) {
        if (selected.length >= limit) break;
        if (canUse(item, enforceDiversity)) add(item);
      }
      if (selected.length >= limit) break;
    }
    if (selected.length >= limit) break;
  }

  const reuse = new Map();
  for (const item of selected) {
    const storyId = item.story_id || item.dedupe_key || item.canonical_url || item.url || item.id;
    reuse.set(storyId, (reuse.get(storyId) || 0) + 1);
  }
  return selected.map((item) => {
    const storyId = item.story_id || item.dedupe_key || item.canonical_url || item.url || item.id;
    const count = reuse.get(storyId) || 1;
    return {
      ...item,
      story_reuse_count: count,
      reuse_as_angle: count > 1
    };
  });
}

function recommendation(uniqueStoryCount) {
  if (uniqueStoryCount >= FULL_UNIQUE_STORY_COUNT) return 'full_edition';
  if (uniqueStoryCount >= MINIMUM_UNIQUE_STORY_COUNT) return 'limited_edition';
  return 'no_new_edition_allowed';
}

function reasonCounts(blocked) {
  return blocked.reduce((acc, item) => {
    acc[item.reason || 'unknown'] = (acc[item.reason || 'unknown'] || 0) + 1;
    return acc;
  }, {});
}

function sourceStatusSummary() {
  const sourceStatus = readJson(SOURCE_STATUS_PATH, {});
  const values = Object.values(sourceStatus);
  return {
    source_count: values.length,
    source_success_count: values.filter((entry) => entry.last_status === 'success').length,
    source_error_count: values.filter((entry) => entry.last_status === 'error').length,
    source_empty_count: values.filter((entry) => entry.last_status === 'empty').length,
    source_not_modified_count: values.filter((entry) => entry.last_status === 'not_modified').length
  };
}

function updateHarvestSummary(result) {
  const summary = readJson(DAILY_HARVEST_SUMMARY_PATH, {});
  if (summary?.target_date && summary.target_date !== result.target_date) return;
  writeJson(DAILY_HARVEST_SUMMARY_PATH, {
    ...summary,
    target_date: result.target_date,
    timezone: result.timezone,
    core_window_start: result.core_window_start,
    core_window_end: result.core_window_end,
    historical_pool_count: result.historical_pool_count,
    core_window_items_count: result.core_window_items_count,
    core_window_eligible_count: result.core_window_eligible_count,
    extended_48h_eligible_count: result.extended_48h_eligible_count,
    weekly_context_count: result.weekly_context_count,
    unique_story_count: result.unique_story_count,
    selected_count: result.selected_count,
    publish_recommendation: result.publish_recommendation,
    blocked_reason_counts: result.blocked_reason_counts
  });
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const targetDate = String(args.date || defaultDateShanghai());
  const window = localCoreWindowForDate(targetDate);
  const coreStart = new Date(window.core_window_start);
  const coreEnd = new Date(window.core_window_end);
  const extendedStart = new Date(coreEnd.getTime() - 48 * 36e5);
  const weeklyStart = new Date(coreEnd.getTime() - 7 * 24 * 36e5);
  const allItems = attachStoryIds(readNewsStoreItems());
  const coreWindowItemsCount = allItems.filter((item) => itemInWindow(item, coreStart, coreEnd)).length;

  const core = buildPool(allItems, {
    role: 'core_window',
    badge: '今日新闻',
    start: coreStart,
    end: coreEnd,
    allowLowConfidence: false
  });
  const coreUnique = uniqueStoryItems(core.qualified);
  const coreSelectedStories = new Set(coreUnique.selected.map((item) => item.story_id));

  const extended = buildPool(allItems, {
    role: 'extended_48h',
    badge: '补位观察',
    start: extendedStart,
    end: coreStart,
    allowLowConfidence: true
  });
  const extendedUnique = uniqueStoryItems(extended.qualified.filter((item) => !coreSelectedStories.has(item.story_id)));

  const earlierWeekly = buildPool(allItems, {
    role: 'weekly_context',
    badge: '本周背景',
    start: weeklyStart,
    end: extendedStart,
    allowLowConfidence: true,
    weeklyContext: true
  });
  const earlierSelectedStories = new Set([
    ...coreUnique.selected.map((item) => item.story_id),
    ...extendedUnique.selected.map((item) => item.story_id)
  ]);
  const weeklyUnique = uniqueStoryItems(earlierWeekly.qualified.filter((item) => !earlierSelectedStories.has(item.story_id)));

  const selected = selectDiverseCandidates([
    coreUnique.selected,
    extendedUnique.selected,
    weeklyUnique.selected
  ], SELECT_LIMIT);
  const storyIds = new Set(selected.map((item) => item.story_id || item.dedupe_key || item.canonical_url || item.url || item.id));
  const uniqueStoryCount = storyIds.size;
  const publishRecommendation = recommendation(uniqueStoryCount);
  const blocked = [
    ...core.blocked,
    ...coreUnique.blocked,
    ...extended.blocked,
    ...extendedUnique.blocked,
    ...earlierWeekly.blocked,
    ...weeklyUnique.blocked
  ];
  const sourceMix = {};
  for (const item of selected) sourceMix[item.source_id] = (sourceMix[item.source_id] || 0) + 1;

  const result = {
    status: 'daily_candidates_ready',
    run_at: nowShanghai(),
    target_date: targetDate,
    timezone: window.timezone,
    core_window_start: window.core_window_start,
    core_window_end: window.core_window_end,
    core_window_hours: window.core_window_hours,
    historical_pool_count: allItems.length,
    core_window_items_count: coreWindowItemsCount,
    core_window_eligible_count: coreUnique.selected.length,
    extended_48h_eligible_count: extendedUnique.selected.length,
    weekly_context_count: weeklyUnique.selected.length,
    unique_story_count: uniqueStoryCount,
    selected_count: selected.length,
    minimum_unique_story_count: MINIMUM_UNIQUE_STORY_COUNT,
    full_unique_story_count: FULL_UNIQUE_STORY_COUNT,
    publish_recommendation: publishRecommendation,
    no_new_edition_reason: publishRecommendation === 'no_new_edition_allowed'
      ? `unique_story_count_below_minimum:${uniqueStoryCount}/${MINIMUM_UNIQUE_STORY_COUNT}`
      : '',
    blocked_reason_counts: reasonCounts(blocked),
    source_mix: sourceMix,
    selected,
    blocked: blocked.slice(0, 240),
    weak: [...core.weak, ...extended.weak, ...earlierWeekly.weak].slice(0, 120),
    source_status_summary: sourceStatusSummary()
  };

  writeJson(DAILY_CANDIDATES_PATH, result);
  updateHarvestSummary(result);
  console.log(`daily candidates status: ${result.status}`);
  console.log(JSON.stringify({
    target_date: result.target_date,
    core_window_start: result.core_window_start,
    core_window_end: result.core_window_end,
    core_window_eligible_count: result.core_window_eligible_count,
    extended_48h_eligible_count: result.extended_48h_eligible_count,
    weekly_context_count: result.weekly_context_count,
    unique_story_count: result.unique_story_count,
    selected_count: result.selected_count,
    publish_recommendation: result.publish_recommendation
  }, null, 2));
}

main();
