#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const ROOT = resolve(process.cwd());
const OUT = resolve(ROOT, 'data/section-hydration-check.json');
const GENERIC_WATCH_NEXT = [
  '看源站是否给出后续细节',
  '持续关注',
  '值得关注',
  '后续进展',
  '等待更多信息',
  '看是否有更多细节'
];
const ENGINEERING_COPY = [
  '本期从公开 RSS',
  'RSS / Atom',
  'Atom / official feeds',
  '窗口内新闻',
  'Janet 已改写',
  '筛出'
];

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

function hasChinese(text) {
  return /[\u4e00-\u9fff]/.test(String(text || ''));
}

function englishWordCount(text) {
  const matches = String(text || '').match(/[A-Za-z][A-Za-z'-]+/g);
  return matches ? matches.length : 0;
}

function allStories(content) {
  if (Array.isArray(content?.edition_items)) return content.edition_items;
  return Object.values(content?.sections || {}).flatMap((section) => section.items || []);
}

function main() {
  const issues = [];
  const warnings = [];
  const manifest = readJson(resolve(ROOT, 'data/MANIFEST.json'), []);
  const edition = manifest[0] || '2026-05-15-v4';
  const contentPath = resolve(ROOT, `data/${edition}/content.json`);
  const summaryPath = resolve(ROOT, `data/${edition}/news-summary.json`);
  const outputPath = resolve(ROOT, `data/${edition}/output.html`);
  const content = readJson(contentPath, null);
  const summary = readJson(summaryPath, null);
  const output = existsSync(outputPath) ? readFileSync(outputPath, 'utf8') : '';
  const homepageHtml = existsSync(resolve(ROOT, 'index.html')) ? readFileSync(resolve(ROOT, 'index.html'), 'utf8') : '';
  const newsJs = existsSync(resolve(ROOT, 'scripts/news.js')) ? readFileSync(resolve(ROOT, 'scripts/news.js'), 'utf8') : '';

  if (!content) issues.push(`content.json missing or invalid for ${edition}`);
  const sections = content?.sections || {};
  const emptySections = Object.entries(sections)
    .filter(([key, section]) => key !== 'lead_story' && (!Array.isArray(section.items) || section.items.length === 0))
    .map(([key, section]) => section.title || key);
  if (emptySections.length) issues.push(`empty sections rendered in content: ${emptySections.join(', ')}`);

  const nonEmptySections = Object.entries(sections)
    .filter(([key, section]) => key !== 'lead_story' && Array.isArray(section.items) && section.items.length > 0);
  if (nonEmptySections.length < 3) issues.push(`non-empty sections below 3: ${nonEmptySections.length}`);

  for (const [key, section] of Object.entries(sections)) {
    if (key === 'lead_story') continue;
    const title = section.title || key;
    const escaped = title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (new RegExp(`<section><div class="k">${escaped}<\\/div><\\/section>`).test(output)) {
      issues.push(`empty section title appears in output.html: ${title}`);
    }
  }

  const stories = allStories(content || {});
  const watchNext = stories.map((story) => story.watch_next).filter(Boolean);
  const duplicates = watchNext.length - new Set(watchNext).size;
  if (duplicates > 0) issues.push(`duplicate watch_next found: ${duplicates}`);
  const genericWatch = GENERIC_WATCH_NEXT.filter((phrase) => JSON.stringify(content || {}).includes(phrase) || output.includes(phrase));
  if (genericWatch.length) issues.push(`generic watch_next found: ${genericWatch.join(', ')}`);

  const homepageItems = Array.isArray(content?.homepage_items) ? content.homepage_items : [];
  for (const item of homepageItems) {
    for (const field of ['title', 'summary', 'why_it_matters', 'janet_take', 'watch_next']) {
      if (!item[field]) issues.push(`homepage item missing ${field}: ${item.story_id || item.title || item.role}`);
    }
    if (!hasChinese(item.title) || englishWordCount(item.title) >= 5) {
      issues.push(`homepage item title is not Chinese-first: ${item.story_id || item.title}`);
    }
  }

  const compactCount = Array.isArray(content?.compact_news) ? content.compact_news.length : 0;
  if (compactCount < 3) warnings.push(`compact news below preferred range: ${compactCount}`);

  const publicText = [
    JSON.stringify(content || {}),
    JSON.stringify(summary || {}),
    output,
    homepageHtml
  ].join('\n');
  for (const phrase of ENGINEERING_COPY) {
    if (publicText.includes(phrase)) issues.push(`engineering copy remains: ${phrase}`);
  }
  if (/\bundefined\b|\bnull\b/.test(output) || /\bundefined\b/.test(newsJs)) {
    issues.push('undefined/null literal found in public rendering');
  }

  const result = {
    step: '35-S',
    status: issues.length ? 'section_hydration_blocked' : 'section_hydration_ready',
    qa_passed: issues.length === 0,
    checked_edition_id: edition,
    diagnosis: {
      empty_section_source: 'daily-news-generator wrote template sections even when items were empty; output.html rendered them without hydration guard',
      watch_next_source: 'daily-news-generator watchNext fallback returned generic repeated copy',
      previous_qa_gap: 'previous QA checked required fields but not empty sections, duplicated watch_next, or generic fallback phrases'
    },
    empty_sections_found: emptySections,
    generic_watch_next_found: genericWatch.length > 0,
    duplicate_watch_next_count: Math.max(0, duplicates),
    non_empty_section_count: nonEmptySections.length,
    homepage_items_checked: homepageItems.length,
    compact_news_count: compactCount,
    issues,
    warnings
  };

  writeJson(OUT, result);
  console.log(`section hydration status: ${result.status}`);
  if (issues.length) process.exit(1);
}

main();
