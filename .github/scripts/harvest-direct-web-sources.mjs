#!/usr/bin/env node
// Direct web-source harvester for high-value AI pages.
// Single-source failures are captured in source status and do not stop the run.

import { resolve } from 'node:path';
import {
  STORE_DIR,
  appendNewItemsToStore,
  createNewsItem,
  emptyRunMetrics,
  fetchText,
  htmlAnchors,
  jsonLdItems,
  parseFeed,
  readJson,
  summarizeSourceResults,
  updateSourceStatusEntries,
  writeHarvestRunStatus
} from './news-store-utils.mjs';

const STATUS_PATH = resolve(STORE_DIR, 'harvest-direct-web-sources-status.json');

const SOURCES = [
  {
    id: 'direct-openai-news',
    source: 'OpenAI News',
    rank: 'S',
    category: 'models',
    source_type: 'direct',
    list_url: 'https://openai.com/news/',
    feed_url: 'https://openai.com/news/rss.xml'
  },
  {
    id: 'direct-openai-help-release-notes',
    source: 'OpenAI Help Center Release Notes',
    rank: 'S',
    category: 'models',
    source_type: 'direct',
    list_url: 'https://help.openai.com/en/articles/6825453-chatgpt-release-notes'
  },
  {
    id: 'direct-anthropic-news',
    source: 'Anthropic News',
    rank: 'S',
    category: 'models',
    source_type: 'direct',
    list_url: 'https://www.anthropic.com/news'
  },
  {
    id: 'direct-google-ai-blog',
    source: 'Google AI Blog',
    rank: 'S',
    category: 'models',
    source_type: 'direct',
    list_url: 'https://blog.google/technology/ai/',
    feed_url: 'https://blog.google/technology/ai/rss/'
  },
  {
    id: 'direct-nvidia-news',
    source: 'NVIDIA News',
    rank: 'A',
    category: 'business',
    source_type: 'direct',
    list_url: 'https://nvidianews.nvidia.com/news'
  },
  {
    id: 'direct-cnbc-ai-tech',
    source: 'CNBC AI / Technology',
    rank: 'B',
    category: 'business',
    source_type: 'direct',
    list_url: 'https://www.cnbc.com/artificial-intelligence/'
  },
  {
    id: 'direct-techcrunch-ai',
    source: 'TechCrunch AI',
    rank: 'B',
    category: 'business',
    source_type: 'direct',
    list_url: 'https://techcrunch.com/category/artificial-intelligence/',
    feed_url: 'https://techcrunch.com/category/artificial-intelligence/feed/'
  },
  {
    id: 'direct-venturebeat-ai',
    source: 'VentureBeat AI',
    rank: 'B',
    category: 'business',
    source_type: 'direct',
    list_url: 'https://venturebeat.com/category/ai/',
    feed_url: 'https://venturebeat.com/category/ai/feed/'
  },
  {
    id: 'direct-the-decoder',
    source: 'The Decoder',
    rank: 'B',
    category: 'business',
    source_type: 'direct',
    list_url: 'https://the-decoder.com/artificial-intelligence-news/'
  },
  {
    id: 'direct-mit-tech-review-ai',
    source: 'MIT Technology Review AI',
    rank: 'B',
    category: 'business',
    source_type: 'direct',
    list_url: 'https://www.technologyreview.com/topic/artificial-intelligence/',
    feed_url: 'https://www.technologyreview.com/topic/artificial-intelligence/feed/'
  }
];

function relevant(item, source) {
  const text = `${item.title || ''} ${item.summary_raw || ''} ${item.url || ''} ${source.source || ''}`.toLowerCase();
  return /ai|artificial intelligence|openai|chatgpt|anthropic|claude|gemini|nvidia|agent|copilot|model|data center|machine learning|生成式|人工智能/.test(text);
}

function uniqueItems(items) {
  const seen = new Set();
  const out = [];
  for (const item of items) {
    const key = item.dedupe_key || item.canonical_url || item.url || item.title;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

async function harvestSource(source) {
  const items = [];
  const errors = [];

  if (source.feed_url) {
    try {
      const { text } = await fetchText(source.feed_url, { timeoutMs: 12000 });
      items.push(...parseFeed(text, { ...source, url: source.feed_url }, 40).map((item) => ({
        ...item,
        source_type: 'direct',
        source_name: source.source
      })));
    } catch (error) {
      errors.push(`feed:${error.message}`);
    }
  }

  try {
    const { text } = await fetchText(source.list_url, { timeoutMs: 14000 });
    items.push(...jsonLdItems(text, source.list_url, source));
    items.push(...htmlAnchors(text, source.list_url, source, 40));
  } catch (error) {
    errors.push(`list:${error.message}`);
  }

  const normalized = uniqueItems(items)
    .filter((item) => relevant(item, source))
    .slice(0, 60)
    .map((item) => createNewsItem({
      source,
      title: item.title,
      url: item.url || item.canonical_url,
      canonicalUrl: item.canonical_url || item.url,
      publishedAt: item.published_at,
      publishedAtSource: item.published_at_source,
      summaryRaw: item.summary_raw,
      sourceType: 'direct',
      categoryHint: source.category,
      qualityFlags: item.quality_flags || [],
      publishedAtConfidence: item.published_at_confidence || (item.published_at ? 'high' : 'low')
    }));

  if (normalized.length) {
    return { layer: 'direct', source, status: 'success', items: normalized, rawCount: normalized.length, error: errors.join('; ') };
  }
  if (errors.length) {
    return { layer: 'direct', source, status: 'error', items: [], rawCount: 0, error: errors.join('; ') };
  }
  return { layer: 'direct', source, status: 'empty', items: [], rawCount: 0, error: 'no_direct_items' };
}

async function main() {
  const runAt = new Date().toISOString();
  const metrics = emptyRunMetrics({ layer: 'direct', sourceCount: SOURCES.length });
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
  const metrics = emptyRunMetrics({ layer: 'direct', sourceCount: SOURCES.length });
  metrics.status = 'harvest_failed';
  metrics.errors.push({ error: error.message });
  writeHarvestRunStatus(STATUS_PATH, metrics);
  console.error(error);
  process.exit(1);
});
