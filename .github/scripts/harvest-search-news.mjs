#!/usr/bin/env node
// Search-based Janet news store harvester.
// Uses no-key sources first: Google News RSS queries and GDELT DOC API.
// NewsAPI is optional and skipped when NEWSAPI_KEY is absent.

import { resolve } from 'node:path';
import {
  STORE_DIR,
  appendNewItemsToStore,
  canonicalizeUrl,
  createNewsItem,
  defaultDateShanghai,
  emptyRunMetrics,
  fetchText,
  gdeltDate,
  parseDate,
  readJson,
  slug,
  summarizeSourceResults,
  tag,
  updateSourceStatusEntries,
  writeHarvestRunStatus
} from './news-store-utils.mjs';

const STATUS_PATH = resolve(STORE_DIR, 'harvest-search-news-status.json');
const SEARCH_KEYWORDS = [
  'OpenAI',
  'ChatGPT',
  'Anthropic Claude',
  'Google Gemini',
  'NVIDIA AI',
  'AI agent',
  'GitHub Copilot',
  'AI data center',
  'AI regulation',
  'AI model release',
  'AI coding tool',
  'AI video generation',
  'AI music generation',
  'AI startup funding'
];

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

function windowForSearch(dateStr) {
  const [year, month, day] = dateStr.split('-').map(Number);
  const end = new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
  const start = new Date(end.getTime() - 72 * 36e5);
  return { start, end };
}

function itemBlocks(text) {
  return [...String(text || '').matchAll(/<item(?:\s[^>]*)?>[\s\S]*?<\/item>/gi)].map((match) => match[0]);
}

function googleNewsItems(text, query) {
  const items = [];
  const blocks = itemBlocks(text);
  for (const block of blocks.slice(0, 40)) {
    const sourceName = tag(block, 'source') || 'Google News Search';
    const pubDate = parseDate(tag(block, 'pubDate'));
    const link = tag(block, 'link');
    const title = tag(block, 'title');
    const summary = tag(block, 'description');
    const source = {
      id: `search-google-${slug(query)}-${slug(sourceName).slice(0, 24)}`,
      source: sourceName,
      rank: /openai|anthropic|google|microsoft|github|nvidia|hugging face|mit technology review|technologyreview/i.test(sourceName) ? 'A' : 'B',
      category: queryCategory(query),
      source_type: 'search'
    };
    items.push(createNewsItem({
      source,
      title,
      url: link,
      baseUrl: 'https://news.google.com/',
      publishedAt: pubDate,
      publishedAtSource: pubDate ? 'google_news.pubDate' : '',
      summaryRaw: summary,
      sourceType: 'search',
      categoryHint: queryCategory(query),
      publishedAtConfidence: pubDate ? 'high' : 'low'
    }));
  }
  return items;
}

function queryCategory(query) {
  const text = query.toLowerCase();
  if (/agent|copilot|coding/.test(text)) return 'agents';
  if (/model|openai|chatgpt|claude|gemini/.test(text)) return 'models';
  if (/video|music/.test(text)) return 'creator_tools';
  if (/funding|startup|data center|nvidia/.test(text)) return 'business';
  if (/regulation/.test(text)) return 'business';
  return 'products';
}

async function harvestGoogleNews(query) {
  const source = {
    id: `search-google-${slug(query)}`,
    source: `Google News: ${query}`,
    rank: 'B',
    category: queryCategory(query),
    source_type: 'search'
  };
  try {
    const url = `https://news.google.com/rss/search?q=${encodeURIComponent(`${query} when:3d`)}&hl=en-US&gl=US&ceid=US:en`;
    const { text } = await fetchText(url, { timeoutMs: 12000 });
    const items = googleNewsItems(text, query);
    return { layer: 'search', source, status: items.length ? 'success' : 'empty', items, rawCount: items.length, error: '' };
  } catch (error) {
    return { layer: 'search', source, status: 'error', items: [], rawCount: 0, error: error.message };
  }
}

async function harvestGdelt(query, dateStr) {
  const source = {
    id: `search-gdelt-${slug(query)}`,
    source: `GDELT: ${query}`,
    rank: 'B',
    category: queryCategory(query),
    source_type: 'search'
  };
  const { start, end } = windowForSearch(dateStr);
  const api = new URL('https://api.gdeltproject.org/api/v2/doc/doc');
  api.searchParams.set('query', `${query} sourcelang:english`);
  api.searchParams.set('mode', 'ArtList');
  api.searchParams.set('format', 'json');
  api.searchParams.set('maxrecords', '40');
  api.searchParams.set('sort', 'HybridRel');
  api.searchParams.set('startdatetime', gdeltDate(start));
  api.searchParams.set('enddatetime', gdeltDate(end));
  try {
    const { text } = await fetchText(api.toString(), {
      timeoutMs: 15000,
      headers: { accept: 'application/json' }
    });
    const data = JSON.parse(text);
    const articles = Array.isArray(data.articles) ? data.articles : [];
    const items = articles.map((article) => {
      const domain = article.domain || article.sourceCountry || 'GDELT';
      return createNewsItem({
        source: {
          id: `search-gdelt-${slug(query)}-${slug(domain).slice(0, 24)}`,
          source: domain,
          rank: 'B',
          category: queryCategory(query),
          source_type: 'search'
        },
        title: article.title || '',
        url: article.url || '',
        canonicalUrl: canonicalizeUrl(article.url || ''),
        publishedAt: parseDate(article.seendate || article.datetime || ''),
        publishedAtSource: article.seendate ? 'gdelt.seendate' : '',
        summaryRaw: article.sourceCollection || '',
        sourceType: 'search',
        categoryHint: queryCategory(query),
        publishedAtConfidence: (article.seendate || article.datetime) ? 'medium' : 'low'
      });
    });
    return { layer: 'search', source, status: items.length ? 'success' : 'empty', items, rawCount: articles.length, error: '' };
  } catch (error) {
    return { layer: 'search', source, status: 'error', items: [], rawCount: 0, error: error.message };
  }
}

async function harvestNewsApi(query, dateStr) {
  const apiKey = process.env.NEWSAPI_KEY;
  const source = {
    id: `search-newsapi-${slug(query)}`,
    source: `NewsAPI: ${query}`,
    rank: 'B',
    category: queryCategory(query),
    source_type: 'search'
  };
  if (!apiKey) {
    return { layer: 'search', source, status: 'empty', items: [], rawCount: 0, error: 'NEWSAPI_KEY_not_configured' };
  }
  const { start, end } = windowForSearch(dateStr);
  const api = new URL('https://newsapi.org/v2/everything');
  api.searchParams.set('q', query);
  api.searchParams.set('from', start.toISOString().slice(0, 10));
  api.searchParams.set('to', end.toISOString().slice(0, 10));
  api.searchParams.set('language', 'en');
  api.searchParams.set('sortBy', 'publishedAt');
  api.searchParams.set('pageSize', '40');
  api.searchParams.set('apiKey', apiKey);
  try {
    const { text } = await fetchText(api.toString(), {
      timeoutMs: 15000,
      headers: { accept: 'application/json' }
    });
    const data = JSON.parse(text);
    const articles = Array.isArray(data.articles) ? data.articles : [];
    const items = articles.map((article) => createNewsItem({
      source: {
        id: `search-newsapi-${slug(query)}-${slug(article.source?.name || 'source').slice(0, 24)}`,
        source: article.source?.name || 'NewsAPI',
        rank: 'B',
        category: queryCategory(query),
        source_type: 'search'
      },
      title: article.title || '',
      url: article.url || '',
      publishedAt: parseDate(article.publishedAt || ''),
      publishedAtSource: 'newsapi.publishedAt',
      summaryRaw: article.description || article.content || '',
      sourceType: 'search',
      categoryHint: queryCategory(query),
      publishedAtConfidence: article.publishedAt ? 'high' : 'low'
    }));
    return { layer: 'search', source, status: items.length ? 'success' : 'empty', items, rawCount: articles.length, error: '' };
  } catch (error) {
    return { layer: 'search', source, status: 'error', items: [], rawCount: 0, error: error.message };
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const targetDate = String(args.date || defaultDateShanghai());
  const runAt = new Date().toISOString();
  const sourceResults = [];
  const metrics = emptyRunMetrics({ layer: 'search', sourceCount: SEARCH_KEYWORDS.length * 2 + (process.env.NEWSAPI_KEY ? SEARCH_KEYWORDS.length : 0) });

  for (const query of SEARCH_KEYWORDS) {
    sourceResults.push(await harvestGoogleNews(query));
    sourceResults.push(await harvestGdelt(query, targetDate));
    if (process.env.NEWSAPI_KEY) sourceResults.push(await harvestNewsApi(query, targetDate));
  }

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
  const metrics = emptyRunMetrics({ layer: 'search' });
  metrics.status = 'harvest_failed';
  metrics.errors.push({ error: error.message });
  writeHarvestRunStatus(STATUS_PATH, metrics);
  console.error(error);
  process.exit(1);
});
