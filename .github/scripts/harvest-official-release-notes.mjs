#!/usr/bin/env node
// Official release-note and product-update harvester.
// Recent official/API/model updates are useful weekly_context even when outside core_window.

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
  summarizeSourceResults,
  updateSourceStatusEntries,
  writeHarvestRunStatus
} from './news-store-utils.mjs';

const STATUS_PATH = resolve(STORE_DIR, 'harvest-official-release-notes-status.json');

const SOURCES = [
  {
    id: 'official-openai-help-release-notes',
    source: 'OpenAI Help Center Release Notes',
    rank: 'S',
    category: 'models',
    source_type: 'official_release_notes',
    list_url: 'https://help.openai.com/en/articles/6825453-chatgpt-release-notes'
  },
  {
    id: 'official-openai-blog',
    source: 'OpenAI Blog',
    rank: 'S',
    category: 'models',
    source_type: 'official_release_notes',
    list_url: 'https://openai.com/news/',
    feed_url: 'https://openai.com/news/rss.xml'
  },
  {
    id: 'official-anthropic-news',
    source: 'Anthropic News',
    rank: 'S',
    category: 'models',
    source_type: 'official_release_notes',
    list_url: 'https://www.anthropic.com/news'
  },
  {
    id: 'official-google-ai-updates',
    source: 'Google AI / Gemini Updates',
    rank: 'S',
    category: 'models',
    source_type: 'official_release_notes',
    list_url: 'https://blog.google/products/gemini/',
    feed_url: 'https://blog.google/products/gemini/rss/'
  },
  {
    id: 'official-github-changelog',
    source: 'GitHub Changelog',
    rank: 'A',
    category: 'agents',
    source_type: 'official_release_notes',
    list_url: 'https://github.blog/changelog/',
    feed_url: 'https://github.blog/changelog/feed/'
  },
  {
    id: 'official-github-blog',
    source: 'GitHub Blog',
    rank: 'A',
    category: 'agents',
    source_type: 'official_release_notes',
    list_url: 'https://github.blog/',
    feed_url: 'https://github.blog/feed/'
  },
  {
    id: 'official-huggingface-blog',
    source: 'Hugging Face Blog',
    rank: 'A',
    category: 'open_source',
    source_type: 'official_release_notes',
    list_url: 'https://huggingface.co/blog',
    feed_url: 'https://huggingface.co/blog/feed.xml'
  },
  {
    id: 'official-langchain-blog',
    source: 'LangChain Blog',
    rank: 'A',
    category: 'agents',
    source_type: 'official_release_notes',
    list_url: 'https://www.langchain.com/blog',
    feed_url: 'https://www.langchain.com/blog/rss.xml'
  }
];

function importantOfficialUpdate(item) {
  const text = `${item.title || ''} ${item.summary_raw || ''} ${item.url || ''}`.toLowerCase();
  return /release|launch|introduc|announce|update|api|sdk|model|gpt|chatgpt|claude|gemini|copilot|agent|changelog|release notes|github|hugging face|langchain|open source|weights|benchmark|eval|tool calling|memory|computer use/.test(text);
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
      items.push(...parseFeed(text, { ...source, url: source.feed_url }, 60));
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
    .filter(importantOfficialUpdate)
    .slice(0, 70)
    .map((item) => createNewsItem({
      source,
      title: item.title,
      url: item.url || item.canonical_url,
      canonicalUrl: item.canonical_url || item.url,
      publishedAt: item.published_at,
      publishedAtSource: item.published_at_source,
      summaryRaw: item.summary_raw,
      sourceType: 'official_release_notes',
      categoryHint: source.category,
      qualityFlags: item.quality_flags || [],
      publishedAtConfidence: item.published_at_confidence || (item.published_at ? 'high' : 'low')
    }));

  if (normalized.length) {
    return { layer: 'official', source, status: 'success', items: normalized, rawCount: normalized.length, error: errors.join('; ') };
  }
  if (errors.length) return { layer: 'official', source, status: 'error', items: [], rawCount: 0, error: errors.join('; ') };
  return { layer: 'official', source, status: 'empty', items: [], rawCount: 0, error: 'no_official_release_items' };
}

async function main() {
  const runAt = new Date().toISOString();
  const metrics = emptyRunMetrics({ layer: 'official', sourceCount: SOURCES.length });
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
  const metrics = emptyRunMetrics({ layer: 'official', sourceCount: SOURCES.length });
  metrics.status = 'harvest_failed';
  metrics.errors.push({ error: error.message });
  writeHarvestRunStatus(STATUS_PATH, metrics);
  console.error(error);
  process.exit(1);
});
