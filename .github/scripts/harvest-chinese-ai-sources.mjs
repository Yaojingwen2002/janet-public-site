#!/usr/bin/env node
// Chinese AI source harvester.
// Vague relative times such as "刚刚" stay low confidence and cannot enter core_window.

import { resolve } from 'node:path';
import {
  STORE_DIR,
  appendNewItemsToStore,
  createNewsItem,
  emptyRunMetrics,
  fetchText,
  htmlAnchors,
  jsonLdItems,
  parseDate,
  slug,
  summarizeSourceResults,
  tag,
  updateSourceStatusEntries,
  writeHarvestRunStatus
} from './news-store-utils.mjs';

const STATUS_PATH = resolve(STORE_DIR, 'harvest-chinese-ai-sources-status.json');

const SOURCES = [
  {
    id: 'chinese-aibase',
    source: 'AIBase',
    rank: 'B',
    category: 'china',
    source_type: 'chinese',
    list_url: 'https://www.aibase.com/zh/news',
    google_query: 'site:aibase.com AI OR 人工智能'
  },
  {
    id: 'chinese-ithome',
    source: 'IT之家',
    rank: 'B',
    category: 'china',
    source_type: 'chinese',
    list_url: 'https://www.ithome.com/',
    google_query: 'site:ithome.com AI OR 人工智能 OR 大模型'
  },
  {
    id: 'chinese-tmtpost',
    source: '钛媒体',
    rank: 'B',
    category: 'china',
    source_type: 'chinese',
    list_url: 'https://www.tmtpost.com/',
    google_query: 'site:tmtpost.com AI OR 人工智能 OR 大模型'
  },
  {
    id: 'chinese-sina-ai',
    source: '新浪 AI 热点',
    rank: 'B',
    category: 'china',
    source_type: 'chinese',
    list_url: 'https://finance.sina.com.cn/tech/',
    google_query: 'site:sina.com.cn AI OR 人工智能 OR 大模型'
  },
  {
    id: 'chinese-sciencenet',
    source: '科学网',
    rank: 'B',
    category: 'china',
    source_type: 'chinese',
    list_url: 'https://news.sciencenet.cn/',
    google_query: 'site:sciencenet.cn AI OR 人工智能 OR 大模型'
  },
  {
    id: 'chinese-setn',
    source: '三立新闻网',
    rank: 'C',
    category: 'china',
    source_type: 'chinese',
    list_url: 'https://www.setn.com/',
    google_query: 'site:setn.com AI OR 人工智能'
  }
];

function itemBlocks(text) {
  return [...String(text || '').matchAll(/<item(?:\s[^>]*)?>[\s\S]*?<\/item>/gi)].map((match) => match[0]);
}

function isRelevant(item) {
  const text = `${item.title || ''} ${item.summary_raw || ''} ${item.url || ''}`.toLowerCase();
  return /ai|openai|chatgpt|claude|gemini|nvidia|人工智能|大模型|生成式|智能体|算力|芯片|机器人|aigc/.test(text);
}

function confidenceForText(item) {
  const text = `${item.title || ''} ${item.summary_raw || ''}`;
  if (/刚刚|分钟前|小时前|今日|今天/.test(text) && !item.published_at) return 'low';
  return item.published_at ? (item.published_at_confidence || 'high') : 'low';
}

async function harvestGoogleNews(source) {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(`${source.google_query} when:3d`)}&hl=zh-CN&gl=CN&ceid=CN:zh-Hans`;
  const { text } = await fetchText(url, { timeoutMs: 12000 });
  const items = itemBlocks(text).slice(0, 35).map((block) => {
    const sourceName = tag(block, 'source') || source.source;
    const pubDate = parseDate(tag(block, 'pubDate'));
    return createNewsItem({
      source: {
        ...source,
        id: `${source.id}-${slug(sourceName).slice(0, 24)}`,
        source: sourceName
      },
      title: tag(block, 'title'),
      url: tag(block, 'link'),
      baseUrl: 'https://news.google.com/',
      publishedAt: pubDate,
      publishedAtSource: pubDate ? 'google_news.pubDate' : '',
      summaryRaw: tag(block, 'description'),
      sourceType: 'chinese',
      categoryHint: 'china',
      publishedAtConfidence: pubDate ? 'high' : 'low'
    });
  }).filter(isRelevant);
  return items;
}

async function harvestSource(source) {
  const items = [];
  const errors = [];

  try {
    const { text } = await fetchText(source.list_url, {
      timeoutMs: 14000,
      headers: { accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' }
    });
    items.push(...jsonLdItems(text, source.list_url, source));
    items.push(...htmlAnchors(text, source.list_url, source, 40));
  } catch (error) {
    errors.push(`direct:${error.message}`);
  }

  try {
    items.push(...await harvestGoogleNews(source));
  } catch (error) {
    errors.push(`google_news:${error.message}`);
  }

  const seen = new Set();
  const normalized = [];
  for (const item of items.filter(isRelevant)) {
    const key = item.dedupe_key || item.canonical_url || item.url;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const confidence = confidenceForText(item);
    normalized.push(createNewsItem({
      source,
      title: item.title,
      url: item.url || item.canonical_url,
      canonicalUrl: item.canonical_url || item.url,
      publishedAt: item.published_at,
      publishedAtSource: item.published_at_source,
      summaryRaw: item.summary_raw,
      sourceType: 'chinese',
      categoryHint: 'china',
      qualityFlags: [
        ...(item.quality_flags || []),
        ...(confidence === 'low' ? ['low_published_at_confidence'] : [])
      ],
      publishedAtConfidence: confidence
    }));
  }

  if (normalized.length) {
    return { layer: 'chinese', source, status: 'success', items: normalized.slice(0, 60), rawCount: normalized.length, error: errors.join('; ') };
  }
  if (errors.length) return { layer: 'chinese', source, status: 'error', items: [], rawCount: 0, error: errors.join('; ') };
  return { layer: 'chinese', source, status: 'empty', items: [], rawCount: 0, error: 'no_chinese_ai_items' };
}

async function main() {
  const runAt = new Date().toISOString();
  const metrics = emptyRunMetrics({ layer: 'chinese', sourceCount: SOURCES.length });
  const sourceResults = [];
  for (const source of SOURCES) sourceResults.push(await harvestSource(source));

  const allItems = sourceResults.flatMap((result) => result.items || []);
  const storeResult = appendNewItemsToStore(allItems, { runAt });
  const addedBySource = new Map();
  for (const item of storeResult.addedItems) {
    addedBySource.set(item.source_id, (addedBySource.get(item.source_id) || 0) + 1);
  }
  for (const result of sourceResults) {
    const sourceIds = new Set((result.items || []).map((item) => item.source_id));
    result.addedCount = [...sourceIds].reduce((sum, id) => sum + (addedBySource.get(id) || 0), 0);
  }

  summarizeSourceResults(metrics, sourceResults);
  metrics.new_items_added = storeResult.addedItems.length;
  metrics.duplicate_items = storeResult.duplicateItems.length;
  metrics.invalid_items = storeResult.invalidItems.length;
  updateSourceStatusEntries(sourceResults, runAt);
  writeHarvestRunStatus(STATUS_PATH, metrics);
}

main().catch((error) => {
  const metrics = emptyRunMetrics({ layer: 'chinese', sourceCount: SOURCES.length });
  metrics.status = 'harvest_failed';
  metrics.errors.push({ error: error.message });
  writeHarvestRunStatus(STATUS_PATH, metrics);
  console.error(error);
  process.exit(1);
});
