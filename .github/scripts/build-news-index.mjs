#!/usr/bin/env node
// Build Janet news archive index for the public site.
// Pure Node 20, no dependencies.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const ROOT = resolve(process.cwd());
const MANIFEST = resolve(ROOT, 'data/MANIFEST.json');
const OUT = resolve(ROOT, 'data/news-index.json');

function ensureDir(filePath) {
  mkdirSync(dirname(filePath), { recursive: true });
}

function readJson(filePath, fallback = null) {
  if (!existsSync(filePath)) return fallback;
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, data) {
  ensureDir(filePath);
  writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

function allStories(content) {
  return Object.values(content?.sections || {}).flatMap((section) => section.items || []);
}

function unique(values) {
  return [...new Set(values.filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b)));
}

function entryDate(entry, summary, content) {
  if (summary?.date) return summary.date;
  if (content?.date) return content.date;
  const match = String(entry).match(/^\d{4}-\d{2}-\d{2}/);
  return match ? match[0] : entry;
}

function buildEdition(entry) {
  const contentPath = resolve(ROOT, `data/${entry}/content.json`);
  const summaryPath = resolve(ROOT, `data/${entry}/news-summary.json`);
  const outputPath = resolve(ROOT, `data/${entry}/output.html`);
  const content = readJson(contentPath, null);
  const summary = readJson(summaryPath, null);
  if (!content && !summary) return null;

  const stories = allStories(content || {});
  const sources = unique(stories.map((story) => story.source));
  const categories = unique(stories.map((story) => story.category));
  const date = entryDate(entry, summary, content);

  return {
    edition_id: entry,
    date,
    title: summary?.title || summary?.theme || content?.theme || 'Janet 快车箱',
    summary: content?.daily_thesis || summary?.lead_story?.summary || content?.intro_text || '',
    edition_type: summary?.edition_type || 'archive',
    signal_count: Number(summary?.item_count || stories.length || 0),
    url: existsSync(outputPath) ? `data/${entry}/output.html` : '',
    content_url: existsSync(contentPath) ? `data/${entry}/content.json` : '',
    summary_url: existsSync(summaryPath) ? `data/${entry}/news-summary.json` : '',
    top_sources: sources.slice(0, 6),
    top_categories: categories.slice(0, 6),
    lead_story: summary?.lead_story ? {
      id: summary.lead_story.id || '',
      title: summary.lead_story.title || '',
      source: summary.lead_story.source || '',
      url: summary.lead_story.url || ''
    } : null
  };
}

function main() {
  const manifest = readJson(MANIFEST, []);
  if (!Array.isArray(manifest) || manifest.length === 0) {
    throw new Error('data/MANIFEST.json must be a non-empty array');
  }

  const editions = manifest
    .map(buildEdition)
    .filter(Boolean)
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));

  const index = {
    schema_version: '1.0.0',
    generated_at: new Date().toISOString(),
    latest_edition_id: manifest[0],
    editions,
    sources: unique(editions.flatMap((edition) => edition.top_sources)),
    categories: unique(editions.flatMap((edition) => edition.top_categories))
  };

  writeJson(OUT, index);
  console.log(`news-index editions: ${editions.length}`);
  console.log(`latest_edition_id: ${index.latest_edition_id}`);
}

main();
