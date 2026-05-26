#!/usr/bin/env node
// Incremental Janet news store harvester.
// It fetches feeds, normalizes items, dedupes them, and appends JSONL records.
// It does not publish daily editions or update MANIFEST.

import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { createHash } from 'node:crypto';

if (!process.env.CI && !process.env.NODE_TLS_REJECT_UNAUTHORIZED) {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
}

const ROOT = resolve(process.cwd());
const TZ = 'Asia/Shanghai';
const SOURCE_POOL = resolve(ROOT, '.github/scripts/rss-source-pool.json');
const STORE_DIR = resolve(ROOT, 'data/news-store');
const SOURCE_STATUS_PATH = resolve(STORE_DIR, 'sources-status.json');
const DEDUPE_INDEX_PATH = resolve(STORE_DIR, 'dedupe-index.json');
const HARVEST_STATUS_PATH = resolve(STORE_DIR, 'harvest-run-status.json');
const USER_AGENT = 'JanetNewsStoreBot/1.0 (+https://yaojingwen2002.github.io/janet-public-site/)';
const TRACKING_PARAMS = new Set([
  'fbclid',
  'gclid',
  'igshid',
  'mc_cid',
  'mc_eid',
  'mkt_tok',
  'ref',
  'ref_src',
  'spm',
  'utm_campaign',
  'utm_content',
  'utm_medium',
  'utm_source',
  'utm_term'
]);

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

function hash(value, length = 12) {
  return createHash('sha1').update(String(value || '')).digest('hex').slice(0, length);
}

function slug(value) {
  return String(value || 'source')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'source';
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

function decodeText(value) {
  return String(value || '')
    .replace(/<!\[CDATA\[|\]\]>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tag(block, name) {
  const pattern = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, 'i');
  const match = block.match(pattern);
  return match ? decodeText(match[1]) : '';
}

function attr(block, name, attrName) {
  const pattern = new RegExp(`<${name}\\b[^>]*\\s${attrName}=["']([^"']+)["'][^>]*>`, 'i');
  const match = block.match(pattern);
  return match ? decodeText(match[1]) : '';
}

function canonicalizeUrl(url, baseUrl = '') {
  try {
    const parsed = new URL(String(url || '').trim(), baseUrl || undefined);
    for (const key of [...parsed.searchParams.keys()]) {
      const lower = key.toLowerCase();
      if (lower.startsWith('utm_') || TRACKING_PARAMS.has(lower)) {
        parsed.searchParams.delete(key);
      }
    }
    parsed.hash = '';
    if (parsed.pathname.length > 1) parsed.pathname = parsed.pathname.replace(/\/+$/, '');
    return parsed.toString();
  } catch {
    return String(url || '').trim();
  }
}

function parseDate(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString();
}

function publishedFromBlock(block) {
  const fields = ['pubDate', 'published', 'updated', 'dc:date', 'date'];
  for (const field of fields) {
    const value = tag(block, field);
    if (value) return { raw: value, iso: parseDate(value), source: field };
  }
  return { raw: '', iso: '', source: '' };
}

function parseFeed(text, source) {
  const blocks = [
    ...[...text.matchAll(/<item(?:\s[^>]*)?>[\s\S]*?<\/item>/gi)].map((match) => ({ type: 'rss', block: match[0] })),
    ...[...text.matchAll(/<entry(?:\s[^>]*)?>[\s\S]*?<\/entry>/gi)].map((match) => ({ type: 'atom', block: match[0] }))
  ];
  const limit = maxItemsForSource(source);
  return blocks.slice(0, limit).map(({ type, block }) => {
    const title = tag(block, 'title');
    const link = type === 'atom'
      ? (attr(block, 'link', 'href') || tag(block, 'id'))
      : (tag(block, 'link') || tag(block, 'guid'));
    const summary = tag(block, 'description') || tag(block, 'summary') || tag(block, 'content') || tag(block, 'content:encoded');
    const published = publishedFromBlock(block);
    const canonicalUrl = canonicalizeUrl(link, source.url);
    const fallbackKey = title ? `title:${hash(`${source.id}:${title}`, 16)}` : `empty:${hash(block, 16)}`;
    const dedupeKey = canonicalUrl || fallbackKey;
    const id = `${slug(source.id)}-${hash(dedupeKey, 12)}`;
    const qualityFlags = [];
    if (!published.iso) qualityFlags.push('missing_published_at');
    if (!canonicalUrl) qualityFlags.push('missing_url');
    if (!title) qualityFlags.push('missing_title');
    return {
      id,
      source_id: source.id,
      source_name: source.source || source.id,
      source_rank: source.rank || 'B',
      category_hint: source.category || 'business',
      title,
      title_zh: '',
      summary_raw: summary,
      url: canonicalUrl,
      canonical_url: canonicalUrl,
      published_at: published.iso,
      fetched_at: nowShanghai(),
      content_hash: hash(`${title}\n${summary}`, 20),
      dedupe_key: dedupeKey,
      tags: [],
      quality_flags: qualityFlags,
      status: 'new'
    };
  });
}

function maxItemsForSource(source) {
  const id = String(source.id || '').toLowerCase();
  const name = String(source.source || '').toLowerCase();
  if (/techcrunch|verge|venturebeat/.test(`${id} ${name}`)) return 20;
  if (/openai|huggingface|arxiv/.test(`${id} ${name}`)) return 50;
  return 50;
}

function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label}_timeout`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function fetchSource(source, previousStatus) {
  if (source.enabled === false) {
    return { source, status: 'disabled', items: [], rawCount: 0, error: '' };
  }
  const url = source.url || source.rss_url || source.feed_url;
  if (!url) {
    return { source, status: 'error', items: [], rawCount: 0, error: 'missing_source_url' };
  }
  const headers = {
    'user-agent': USER_AGENT,
    accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, text/html;q=0.8'
  };
  if (previousStatus?.last_etag) headers['if-none-match'] = previousStatus.last_etag;
  if (previousStatus?.last_modified) headers['if-modified-since'] = previousStatus.last_modified;
  try {
    const response = await withTimeout(fetch(url, { headers, redirect: 'follow' }), 12000, 'source_fetch');
    if (response.status === 304) {
      return { source, status: 'not_modified', items: [], rawCount: 0, response };
    }
    if (!response.ok) throw new Error(`http_${response.status}`);
    const text = await withTimeout(response.text(), 12000, 'source_body');
    const items = parseFeed(text, { ...source, url });
    return { source, status: 'success', items, rawCount: items.length, response };
  } catch (error) {
    return { source, status: 'error', items: [], rawCount: 0, error: error.message };
  }
}

function monthFileForItem(item, fallbackDate = new Date()) {
  const sourceDate = item.published_at ? new Date(item.published_at) : fallbackDate;
  const date = Number.isNaN(sourceDate.getTime()) ? fallbackDate : sourceDate;
  const month = date.toISOString().slice(0, 7);
  return resolve(STORE_DIR, `items-${month}.jsonl`);
}

function appendJsonl(filePath, records) {
  if (!records.length) return;
  ensureDir(filePath);
  appendFileSync(filePath, records.map((record) => JSON.stringify(record)).join('\n') + '\n', 'utf8');
}

async function main() {
  mkdirSync(STORE_DIR, { recursive: true });
  const pool = readJson(SOURCE_POOL, { sources: [] });
  const sources = Array.isArray(pool.sources) ? pool.sources : [];
  const sourceStatus = readJson(SOURCE_STATUS_PATH, {});
  const dedupeIndex = readJson(DEDUPE_INDEX_PATH, {});
  const runAt = nowShanghai();
  const metrics = {
    status: 'harvest_completed',
    run_at: runAt,
    source_count: sources.length,
    source_success_count: 0,
    source_error_count: 0,
    source_not_modified_count: 0,
    raw_items_seen: 0,
    items_considered: 0,
    new_items_added: 0,
    duplicate_items: 0,
    invalid_items: 0,
    missing_date_items: 0,
    errors: []
  };
  const additionsByFile = new Map();

  for (const source of sources) {
    const result = await fetchSource(source, sourceStatus[source.id]);
    const previous = sourceStatus[source.id] || {};
    const etag = result.response?.headers?.get('etag') || previous.last_etag || '';
    const lastModified = result.response?.headers?.get('last-modified') || previous.last_modified || '';
    const publishedDates = result.items.map((item) => item.published_at).filter(Boolean).sort();

    sourceStatus[source.id] = {
      source_id: source.id,
      source_name: source.source || source.id,
      enabled: source.enabled !== false,
      last_checked_at: runAt,
      last_success_at: result.status === 'success' ? runAt : (previous.last_success_at || ''),
      last_error: result.status === 'error' ? result.error : '',
      last_status: result.status,
      last_etag: etag,
      last_modified: lastModified,
      last_item_published_at: publishedDates.at(-1) || previous.last_item_published_at || '',
      last_item_count: result.items.length
    };

    if (result.status === 'success') metrics.source_success_count += 1;
    if (result.status === 'not_modified') metrics.source_not_modified_count += 1;
    if (result.status === 'error') {
      metrics.source_error_count += 1;
      metrics.errors.push({ source_id: source.id, error: result.error });
    }

    metrics.raw_items_seen += result.rawCount;
    for (const item of result.items) {
      metrics.items_considered += 1;
      if (!item.title || !item.url) {
        metrics.invalid_items += 1;
        continue;
      }
      if (item.quality_flags.includes('missing_published_at')) metrics.missing_date_items += 1;
      const key = item.dedupe_key || item.content_hash || item.id;
      if (dedupeIndex[key]) {
        metrics.duplicate_items += 1;
        dedupeIndex[key].last_seen_at = runAt;
        dedupeIndex[key].source_ids = [...new Set([...(dedupeIndex[key].source_ids || []), item.source_id])];
        continue;
      }
      dedupeIndex[key] = {
        id: item.id,
        first_seen_at: runAt,
        last_seen_at: runAt,
        source_ids: [item.source_id]
      };
      const filePath = monthFileForItem(item);
      if (!additionsByFile.has(filePath)) additionsByFile.set(filePath, []);
      additionsByFile.get(filePath).push(item);
      metrics.new_items_added += 1;
    }
  }

  for (const [filePath, records] of additionsByFile.entries()) {
    appendJsonl(filePath, records);
  }
  writeJson(SOURCE_STATUS_PATH, sourceStatus);
  writeJson(DEDUPE_INDEX_PATH, dedupeIndex);
  writeJson(HARVEST_STATUS_PATH, metrics);
  console.log(`news store harvest status: ${metrics.status}`);
  console.log(JSON.stringify({
    raw_items_seen: metrics.raw_items_seen,
    items_considered: metrics.items_considered,
    new_items_added: metrics.new_items_added,
    duplicate_items: metrics.duplicate_items,
    invalid_items: metrics.invalid_items,
    source_success_count: metrics.source_success_count,
    source_error_count: metrics.source_error_count,
    source_not_modified_count: metrics.source_not_modified_count
  }, null, 2));
}

main().catch((error) => {
  writeJson(HARVEST_STATUS_PATH, {
    status: 'harvest_failed',
    run_at: nowShanghai(),
    source_count: 0,
    source_success_count: 0,
    source_error_count: 0,
    source_not_modified_count: 0,
    raw_items_seen: 0,
    items_considered: 0,
    new_items_added: 0,
    duplicate_items: 0,
    invalid_items: 0,
    missing_date_items: 0,
    errors: [{ error: error.message }]
  });
  console.error(error);
  process.exit(1);
});
