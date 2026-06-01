import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync
} from 'node:fs';
import { dirname, resolve } from 'node:path';
import { createHash } from 'node:crypto';

if (!process.env.CI && !process.env.NODE_TLS_REJECT_UNAUTHORIZED) {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
}

export const ROOT = resolve(process.cwd());
export const TZ = 'Asia/Shanghai';
export const STORE_DIR = resolve(ROOT, 'data/news-store');
export const SOURCE_STATUS_PATH = resolve(STORE_DIR, 'sources-status.json');
export const DEDUPE_INDEX_PATH = resolve(STORE_DIR, 'dedupe-index.json');
export const USER_AGENT = 'JanetNewsStoreBot/1.1 (+https://yaojingwen2002.github.io/janet-public-site/)';

const TRACKING_PARAMS = new Set([
  'fbclid',
  'gclid',
  'igshid',
  'mc_cid',
  'mc_eid',
  'mkt_tok',
  'ocid',
  'ref',
  'ref_src',
  'spm',
  'utm_campaign',
  'utm_content',
  'utm_medium',
  'utm_source',
  'utm_term'
]);

export function ensureDir(filePath) {
  mkdirSync(dirname(filePath), { recursive: true });
}

export function readJson(filePath, fallback) {
  if (!existsSync(filePath)) return fallback;
  try {
    return JSON.parse(readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

export function writeJson(filePath, data) {
  ensureDir(filePath);
  writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

export function hash(value, length = 12) {
  return createHash('sha1').update(String(value || '')).digest('hex').slice(0, length);
}

export function slug(value) {
  return String(value || 'source')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 54) || 'source';
}

export function nowShanghai() {
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

export function defaultDateShanghai() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date());
}

export function previousDate(dateStr, days = 1) {
  const [year, month, day] = String(dateStr).split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day) - days * 86400000).toISOString().slice(0, 10);
}

export function localToUtcIso(dateStr, timeStr = '08:00:00') {
  const [year, month, day] = String(dateStr).split('-').map(Number);
  const [hour, minute, second] = String(timeStr).split(':').map(Number);
  return new Date(Date.UTC(year, month - 1, day, hour - 8, minute, second || 0)).toISOString();
}

export function localCoreWindowForDate(dateStr) {
  const startDate = previousDate(dateStr, 1);
  const start = new Date(localToUtcIso(startDate, '08:00:00'));
  const end = new Date(localToUtcIso(dateStr, '08:00:00'));
  return {
    timezone: TZ,
    core_window_start: start.toISOString(),
    core_window_end: end.toISOString(),
    core_window_hours: Math.round((end.getTime() - start.getTime()) / 36e5)
  };
}

export function gdeltDate(date) {
  return date.toISOString().replace(/[-:T.Z]/g, '').slice(0, 14);
}

export function decodeText(value) {
  return String(value || '')
    .replace(/<!\[CDATA\[|\]\]>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([a-f0-9]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)))
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function tag(block, name) {
  const pattern = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, 'i');
  const match = String(block || '').match(pattern);
  return match ? decodeText(match[1]) : '';
}

export function attr(block, name, attrName) {
  const pattern = new RegExp(`<${name}\\b[^>]*\\s${attrName}=["']([^"']+)["'][^>]*>`, 'i');
  const match = String(block || '').match(pattern);
  return match ? decodeText(match[1]) : '';
}

export function canonicalizeUrl(url, baseUrl = '') {
  try {
    const parsed = new URL(String(url || '').trim(), baseUrl || undefined);
    for (const key of [...parsed.searchParams.keys()]) {
      const lower = key.toLowerCase();
      if (lower.startsWith('utm_') || TRACKING_PARAMS.has(lower)) parsed.searchParams.delete(key);
    }
    parsed.hash = '';
    if (parsed.pathname.length > 1) parsed.pathname = parsed.pathname.replace(/\/+$/, '');
    return parsed.toString();
  } catch {
    return String(url || '').trim();
  }
}

export function parseDate(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString();
}

export function publishedFromBlock(block) {
  const fields = ['pubDate', 'published', 'updated', 'dc:date', 'date'];
  for (const field of fields) {
    const value = tag(block, field);
    if (value) return { raw: value, iso: parseDate(value), source: field };
  }
  return { raw: '', iso: '', source: '' };
}

export function parseFeed(text, source, limit = 50) {
  const blocks = [
    ...[...String(text || '').matchAll(/<item(?:\s[^>]*)?>[\s\S]*?<\/item>/gi)].map((match) => ({ type: 'rss', block: match[0] })),
    ...[...String(text || '').matchAll(/<entry(?:\s[^>]*)?>[\s\S]*?<\/entry>/gi)].map((match) => ({ type: 'atom', block: match[0] }))
  ];
  return blocks.slice(0, limit).map(({ type, block }) => {
    const title = tag(block, 'title');
    const link = type === 'atom'
      ? (attr(block, 'link', 'href') || tag(block, 'id'))
      : (tag(block, 'link') || tag(block, 'guid'));
    const summary = tag(block, 'description') || tag(block, 'summary') || tag(block, 'content') || tag(block, 'content:encoded');
    const published = publishedFromBlock(block);
    return createNewsItem({
      source,
      title,
      url: link,
      baseUrl: source.url || source.feed_url || source.list_url || '',
      publishedAt: published.iso,
      publishedAtSource: published.source,
      summaryRaw: summary,
      publishedAtConfidence: published.iso ? 'high' : 'low'
    });
  });
}

export function guessCategory(input) {
  const text = String(input || '').toLowerCase();
  if (/agent|copilot|coding|developer|github|langchain|llamaindex/.test(text)) return 'agents';
  if (/model|gpt|claude|gemini|llama|mistral|openai|anthropic|deepmind/.test(text)) return 'models';
  if (/paper|research|benchmark|arxiv|dataset|evaluation|leaderboard/.test(text)) return 'research';
  if (/open source|opensource|hugging face|github|license|weights/.test(text)) return 'open_source';
  if (/creator|video|image|audio|music|design|studio|adobe|canva|spotify|elevenlabs/.test(text)) return 'creator_tools';
  if (/china|chinese|alibaba|tencent|baidu|bytedance|国内|中国|中文|ai base|aibase|it之家|钛媒体|新浪|科学网|三立/.test(text)) return 'china';
  if (/enterprise|business|revenue|market|startup|funding|customer|cloud|aws|microsoft|nvidia|data center/.test(text)) return 'business';
  return 'products';
}

export function createNewsItem({
  source,
  title,
  url,
  baseUrl = '',
  publishedAt = '',
  publishedAtSource = '',
  summaryRaw = '',
  canonicalUrl = '',
  dedupeKey = '',
  sourceType = '',
  categoryHint = '',
  qualityFlags = [],
  publishedAtConfidence = ''
}) {
  const cleanTitle = decodeText(title);
  const cleanSummary = decodeText(summaryRaw);
  const canonical = canonicalizeUrl(canonicalUrl || url, baseUrl);
  const sourceId = source.id || source.source_id || slug(source.source || source.name || 'source');
  const fallbackKey = cleanTitle ? `title:${hash(`${sourceId}:${cleanTitle}`, 16)}` : `empty:${hash(`${url}:${cleanSummary}`, 16)}`;
  const key = dedupeKey || canonical || fallbackKey;
  const flags = new Set(qualityFlags);
  if (!publishedAt) flags.add('missing_published_at');
  if (!canonical) flags.add('missing_url');
  if (!cleanTitle) flags.add('missing_title');
  if (publishedAtConfidence === 'low') flags.add('low_published_at_confidence');
  return {
    id: `${slug(sourceId)}-${hash(key, 12)}`,
    source_id: sourceId,
    source_name: source.source || source.name || source.source_name || sourceId,
    source_rank: source.rank || source.source_rank || 'B',
    source_type: sourceType || source.source_type || 'media',
    title: cleanTitle,
    title_zh: '',
    summary_raw: cleanSummary,
    url: canonical,
    canonical_url: canonical,
    published_at: publishedAt ? parseDate(publishedAt) : '',
    published_at_source: publishedAtSource || '',
    published_at_confidence: publishedAtConfidence || (publishedAt ? 'high' : 'low'),
    fetched_at: nowShanghai(),
    content_hash: hash(`${cleanTitle}\n${cleanSummary}`, 20),
    dedupe_key: key,
    category_hint: categoryHint || source.category || guessCategory(`${cleanTitle} ${cleanSummary} ${source.source || ''}`),
    tags: [],
    quality_flags: [...flags],
    status: 'new'
  };
}

export function itemMonthFile(item, fallbackDate = new Date()) {
  const sourceDate = item.published_at ? new Date(item.published_at) : fallbackDate;
  const date = Number.isNaN(sourceDate.getTime()) ? fallbackDate : sourceDate;
  return resolve(STORE_DIR, `items-${date.toISOString().slice(0, 7)}.jsonl`);
}

export function appendJsonl(filePath, records) {
  if (!records.length) return;
  ensureDir(filePath);
  appendFileSync(filePath, records.map((record) => JSON.stringify(record)).join('\n') + '\n', 'utf8');
}

export function readNewsStoreItems() {
  if (!existsSync(STORE_DIR)) return [];
  const files = readdirSync(STORE_DIR)
    .filter((name) => /^items-\d{4}-\d{2}\.jsonl$/.test(name))
    .sort();
  const items = [];
  for (const file of files) {
    const fullPath = resolve(STORE_DIR, file);
    const lines = readFileSync(fullPath, 'utf8').split(/\n+/).filter(Boolean);
    lines.forEach((line, index) => {
      try {
        items.push({ ...JSON.parse(line), __file: file, __line: index + 1 });
      } catch {
        // QA owns malformed JSONL. Harvesters skip bad historical rows.
      }
    });
  }
  return items;
}

export function existingStoreKeys(items = readNewsStoreItems()) {
  const keys = new Set();
  const ids = new Set();
  for (const item of items) {
    if (item.id) ids.add(item.id);
    if (item.dedupe_key) keys.add(item.dedupe_key);
    if (item.canonical_url) keys.add(item.canonical_url);
    if (item.url) keys.add(item.url);
    if (item.content_hash) keys.add(`hash:${item.content_hash}`);
  }
  return { keys, ids };
}

export function normalizeIncomingItem(item) {
  const source = {
    id: item.source_id,
    source: item.source_name,
    rank: item.source_rank,
    category: item.category_hint,
    source_type: item.source_type
  };
  return createNewsItem({
    source,
    title: item.title,
    url: item.url || item.canonical_url,
    canonicalUrl: item.canonical_url || item.url,
    publishedAt: item.published_at,
    publishedAtSource: item.published_at_source,
    summaryRaw: item.summary_raw,
    dedupeKey: item.dedupe_key,
    sourceType: item.source_type,
    categoryHint: item.category_hint,
    qualityFlags: item.quality_flags || [],
    publishedAtConfidence: item.published_at_confidence
  });
}

export function appendNewItemsToStore(rawItems, { runAt = nowShanghai() } = {}) {
  mkdirSync(STORE_DIR, { recursive: true });
  const existing = readNewsStoreItems();
  const { keys, ids } = existingStoreKeys(existing);
  const dedupeIndex = readJson(DEDUPE_INDEX_PATH, {});
  for (const [key, entry] of Object.entries(dedupeIndex)) {
    keys.add(key);
    if (entry?.id) ids.add(entry.id);
  }
  const additionsByFile = new Map();
  const addedItems = [];
  const duplicateItems = [];
  const invalidItems = [];

  for (const rawItem of rawItems) {
    const item = normalizeIncomingItem(rawItem);
    if (!item.title || !item.url) {
      invalidItems.push(item);
      continue;
    }
    const key = item.dedupe_key || item.canonical_url || item.url || `hash:${item.content_hash}`;
    const duplicate = keys.has(key) || ids.has(item.id) || keys.has(item.canonical_url) || keys.has(item.url);
    if (duplicate) {
      duplicateItems.push(item);
      if (dedupeIndex[key]) {
        dedupeIndex[key].last_seen_at = runAt;
        dedupeIndex[key].source_ids = [...new Set([...(dedupeIndex[key].source_ids || []), item.source_id])];
      }
      continue;
    }
    keys.add(key);
    keys.add(item.canonical_url);
    keys.add(item.url);
    keys.add(`hash:${item.content_hash}`);
    ids.add(item.id);
    dedupeIndex[key] = {
      id: item.id,
      first_seen_at: runAt,
      last_seen_at: runAt,
      source_ids: [item.source_id]
    };
    const filePath = itemMonthFile(item);
    if (!additionsByFile.has(filePath)) additionsByFile.set(filePath, []);
    additionsByFile.get(filePath).push(item);
    addedItems.push(item);
  }

  for (const [filePath, records] of additionsByFile.entries()) appendJsonl(filePath, records);
  writeJson(DEDUPE_INDEX_PATH, dedupeIndex);
  return { addedItems, duplicateItems, invalidItems };
}

export async function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label}_timeout`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

export async function fetchText(url, { timeoutMs = 12000, headers = {} } = {}) {
  const response = await withTimeout(fetch(url, {
    headers: {
      'user-agent': USER_AGENT,
      accept: 'application/rss+xml, application/atom+xml, application/json, application/xml, text/xml, text/html;q=0.8',
      ...headers
    },
    redirect: 'follow'
  }), timeoutMs, 'source_fetch');
  if (!response.ok) throw new Error(`http_${response.status}`);
  const text = await withTimeout(response.text(), timeoutMs, 'source_body');
  return { text, response };
}

export function emptyRunMetrics({ layer, runAt = nowShanghai(), sourceCount = 0 }) {
  return {
    status: 'harvest_completed',
    layer,
    run_at: runAt,
    source_count: sourceCount,
    source_success_count: 0,
    source_error_count: 0,
    source_empty_count: 0,
    raw_items_seen: 0,
    items_considered: 0,
    new_items_added: 0,
    duplicate_items: 0,
    invalid_items: 0,
    missing_date_items: 0,
    errors: [],
    source_breakdown: {}
  };
}

export function updateSourceStatusEntries(sourceResults, runAt = nowShanghai()) {
  const sourceStatus = readJson(SOURCE_STATUS_PATH, {});
  for (const result of sourceResults) {
    const source = result.source || {};
    const id = source.id || source.source_id || slug(source.source || source.name || 'source');
    const previous = sourceStatus[id] || {};
    const publishedDates = (result.items || []).map((item) => item.published_at).filter(Boolean).sort();
    sourceStatus[id] = {
      source_id: id,
      source_name: source.source || source.name || source.source_name || id,
      enabled: source.enabled !== false,
      source_type: source.source_type || result.source_type || previous.source_type || 'media',
      harvest_layer: result.layer || previous.harvest_layer || '',
      last_checked_at: runAt,
      last_success_at: result.status === 'success' ? runAt : (previous.last_success_at || ''),
      last_error: result.status === 'error' ? result.error || '' : '',
      last_status: result.status,
      last_item_published_at: publishedDates.at(-1) || previous.last_item_published_at || '',
      last_item_count: (result.items || []).length,
      raw_seen: Number(result.rawCount || 0),
      new_items_added: Number(result.addedCount || 0)
    };
  }
  writeJson(SOURCE_STATUS_PATH, sourceStatus);
  return sourceStatus;
}

export function summarizeSourceResults(metrics, sourceResults) {
  for (const result of sourceResults) {
    const source = result.source || {};
    const id = source.id || source.source_id || slug(source.source || source.name || 'source');
    if (result.status === 'success') metrics.source_success_count += 1;
    if (result.status === 'empty') metrics.source_empty_count += 1;
    if (result.status === 'error') {
      metrics.source_error_count += 1;
      metrics.errors.push({ source_id: id, error: result.error || 'unknown_error' });
    }
    metrics.raw_items_seen += Number(result.rawCount || 0);
    metrics.items_considered += (result.items || []).length;
    metrics.missing_date_items += (result.items || []).filter((item) => !item.published_at).length;
    metrics.source_breakdown[id] = {
      source_name: source.source || source.name || source.source_name || id,
      status: result.status,
      raw_seen: Number(result.rawCount || 0),
      items: (result.items || []).length,
      added: Number(result.addedCount || 0),
      error: result.error || ''
    };
  }
  return metrics;
}

export function writeHarvestRunStatus(statusPath, metrics) {
  writeJson(statusPath, metrics);
  console.log(`${metrics.layer} harvest status: ${metrics.status}`);
  console.log(JSON.stringify({
    raw_items_seen: metrics.raw_items_seen,
    items_considered: metrics.items_considered,
    new_items_added: metrics.new_items_added,
    duplicate_items: metrics.duplicate_items,
    invalid_items: metrics.invalid_items,
    source_success_count: metrics.source_success_count,
    source_error_count: metrics.source_error_count,
    source_empty_count: metrics.source_empty_count
  }, null, 2));
}

export function htmlAnchors(html, baseUrl, source, limit = 80) {
  const items = [];
  const seen = new Set();
  const anchorRe = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  for (const match of String(html || '').matchAll(anchorRe)) {
    const url = canonicalizeUrl(match[1], baseUrl);
    const title = decodeText(match[2]);
    if (!url || !title || title.length < 12 || seen.has(url)) continue;
    if (!/^https?:\/\//i.test(url)) continue;
    if (/\.(jpg|jpeg|png|gif|svg|webp|pdf)(\?|$)/i.test(url)) continue;
    seen.add(url);
    items.push(createNewsItem({
      source,
      title,
      url,
      baseUrl,
      summaryRaw: '',
      publishedAt: '',
      publishedAtConfidence: 'low',
      qualityFlags: ['list_page_date_missing']
    }));
    if (items.length >= limit) break;
  }
  return items;
}

export function jsonLdItems(html, baseUrl, source) {
  const items = [];
  const scripts = [...String(html || '').matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  const visit = (node) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    const type = Array.isArray(node['@type']) ? node['@type'].join(' ') : String(node['@type'] || '');
    if (/NewsArticle|Article|BlogPosting/i.test(type) && (node.headline || node.name) && (node.url || node.mainEntityOfPage?.['@id'])) {
      items.push(createNewsItem({
        source,
        title: node.headline || node.name,
        url: node.url || node.mainEntityOfPage?.['@id'],
        baseUrl,
        publishedAt: parseDate(node.datePublished || node.dateCreated || node.dateModified),
        publishedAtSource: node.datePublished ? 'jsonld.datePublished' : (node.dateModified ? 'jsonld.dateModified' : ''),
        summaryRaw: node.description || '',
        publishedAtConfidence: (node.datePublished || node.dateCreated || node.dateModified) ? 'high' : 'low'
      }));
    }
    for (const value of Object.values(node)) {
      if (value && typeof value === 'object') visit(value);
    }
  };
  for (const script of scripts) {
    try {
      visit(JSON.parse(decodeText(script[1])));
    } catch {
      // Bad JSON-LD should not make a source fail.
    }
  }
  return items;
}
