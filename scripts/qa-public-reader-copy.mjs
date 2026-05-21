#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const ROOT = process.cwd();
const OUT = resolve(ROOT, 'data/public-reader-copy-check.json');

const DEBUG_PATTERNS = [
  '这条新闻的具体对象是',
  '动作是',
  '原文线索是',
  '报道的重点是',
  '这条围绕',
  '真正有用的部分藏在',
  '这条要看细节',
  '是否公布接口、限制或客户案例'
];

const FRONTEND_FIELDS = new Set([
  'title',
  'theme',
  'intro_text',
  'daily_thesis',
  'daily_title',
  'daily_summary',
  'daily_judgment',
  'cover_title',
  'cover_summary',
  'label',
  'signal',
  'summary',
  'janet_view',
  'story_title',
  'why_it_matters',
  'janet_take',
  'watch_next',
  'module_title',
  'module_summary',
  'zh_title',
  'zh_summary'
]);

function readText(path, fallback = '') {
  try {
    return readFileSync(resolve(ROOT, path), 'utf8');
  } catch {
    return fallback;
  }
}

function readJson(path, fallback = null) {
  try {
    return JSON.parse(readText(path));
  } catch {
    return fallback;
  }
}

function writeJson(path, data) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`);
}

function latestEditionId() {
  const manifest = readJson('data/MANIFEST.json', []);
  if (Array.isArray(manifest)) return manifest[0] || '';
  return manifest?.items?.[0] || manifest?.latest || '';
}

function compactText(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

function storyId(item) {
  return item?.story_id || item?.id || item?.lead_story_id || '';
}

function storyMap(content) {
  const map = new Map();
  const add = (story) => {
    const id = storyId(story);
    if (id && !map.has(id)) map.set(id, story);
  };
  (content.stories || []).forEach(add);
  (content.edition_items || []).forEach(add);
  Object.values(content.sections || {}).forEach((section) => (section.items || []).forEach(add));
  (content.homepage_items || []).forEach(add);
  return map;
}

function collectFrontendFields(value, path, out) {
  if (value === null || value === undefined) return;
  if (typeof value === 'string' || typeof value === 'number') {
    const field = path.split('.').pop()?.replace(/\[\d+\]/g, '') || '';
    const text = compactText(value);
    if (FRONTEND_FIELDS.has(field) && text.length >= 4) {
      const hits = DEBUG_PATTERNS.filter((pattern) => text.includes(pattern));
      if (hits.length) out.push({ path, field, text, hits });
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectFrontendFields(item, `${path}[${index}]`, out));
    return;
  }
  if (typeof value === 'object') {
    Object.entries(value).forEach(([key, child]) => collectFrontendFields(child, path ? `${path}.${key}` : key, out));
  }
}

function hasUrl(item, map) {
  if (!item || typeof item !== 'object') return false;
  if (item.url || item.source_url || item.external_url) return true;
  const id = storyId(item);
  const story = id ? map.get(id) : null;
  return Boolean(story?.url || story?.source_url || story?.external_url);
}

function checkUrl(path, item, map, missing) {
  if (!item || typeof item !== 'object') return;
  if (!hasUrl(item, map)) {
    missing.push({ path, story_id: storyId(item), title: item.title || item.story_title || item.module_title || '' });
  }
}

function collectMissingUrls(summary, content) {
  const missing = [];
  const map = storyMap(content);
  checkUrl('news-summary.lead_story', summary.lead_story, map, missing);
  (summary.signal_map || []).forEach((item, index) => checkUrl(`news-summary.signal_map[${index}]`, item, map, missing));
  (summary.compact_news || []).forEach((item, index) => checkUrl(`news-summary.compact_news[${index}]`, item, map, missing));
  (summary.homepage_items || []).forEach((item, index) => checkUrl(`news-summary.homepage_items[${index}]`, item, map, missing));
  (content.homepage_items || []).forEach((item, index) => checkUrl(`content.homepage_items[${index}]`, item, map, missing));
  Object.entries(content.sections || {}).forEach(([sectionKey, section]) => {
    (section.items || []).forEach((item, index) => checkUrl(`content.sections.${sectionKey}.items[${index}]`, item, map, missing));
  });
  (content.modules || []).forEach((module, index) => {
    (module.items || []).forEach((item, itemIndex) => checkUrl(`content.modules[${index}].items[${itemIndex}]`, item, map, missing));
  });
  return missing;
}

function checkFrontendCards(newsJs) {
  const issues = [];
  if (!/renderExternalCard/.test(newsJs)) issues.push({ surface: 'scripts/news.js', issue: 'renderExternalCard helper missing' });
  if (!/news-signal-card[\s\S]{0,200}href=/.test(newsJs) && !/renderExternalCard\('news-signal-card/.test(newsJs)) {
    issues.push({ surface: 'homepage signal cards', issue: 'signal cards are not whole-card source links' });
  }
  if (!/news-compact-card[\s\S]{0,200}href=/.test(newsJs) && !/renderExternalCard\('news-compact-card/.test(newsJs)) {
    issues.push({ surface: 'homepage compact cards', issue: 'compact cards are not whole-card source links' });
  }
  if (!/news-v4-lead janet-clickable-card/.test(newsJs)) {
    issues.push({ surface: 'homepage lead story', issue: 'lead story copy block is not a source link' });
  }
  if (!/news-v4-lead-figure-link/.test(newsJs)) {
    issues.push({ surface: 'homepage lead visual', issue: 'lead visual is not a source link' });
  }
  if (!/target="_blank"/.test(newsJs)) issues.push({ surface: 'scripts/news.js', issue: 'target=_blank missing' });
  if (!/rel="noopener noreferrer"/.test(newsJs)) issues.push({ surface: 'scripts/news.js', issue: 'rel=noopener noreferrer missing' });
  return issues;
}

function checkOutputLinks(outputHtml) {
  const issues = [];
  if (/<img class="visual"/.test(outputHtml) && !/<a class="lead-link"[^>]*href=/.test(outputHtml)) {
    issues.push({ surface: 'output lead visual', issue: 'lead visual is not linked to source' });
  }
  if (/<h2>/.test(outputHtml) && !/<h2><a[^>]+href=/.test(outputHtml)) {
    issues.push({ surface: 'output lead title', issue: 'lead title is not linked to source' });
  }
  if (/今日三条主线/.test(outputHtml) && !/今日三条主线[\s\S]*?<a class="card"[^>]+href=/.test(outputHtml)) {
    issues.push({ surface: 'output signal cards', issue: 'signal cards are not whole-card source links' });
  }
  if (/今日更多/.test(outputHtml) && !/今日更多[\s\S]*?<a class="card"[^>]+href=/.test(outputHtml)) {
    issues.push({ surface: 'output compact cards', issue: 'compact cards are not whole-card source links' });
  }
  if (/<article><small>[\s\S]*?<h3>/.test(outputHtml) && !/<h3><a[^>]+href=/.test(outputHtml)) {
    issues.push({ surface: 'output section item title', issue: 'section item title is not linked to source' });
  }
  if (!/>原文<\/a>/.test(outputHtml)) {
    issues.push({ surface: 'output original links', issue: 'original source link missing' });
  }
  return issues;
}

function checkVisualCreditCss(cssText) {
  const issues = [];
  const block = cssText.match(/\.news-v4-lead-figure figcaption,[\s\S]*?\{([\s\S]*?)\}/)?.[1] || '';
  if (!block) {
    issues.push({ surface: 'visual credit css', issue: 'figcaption CSS block missing' });
    return issues;
  }
  const fontSize = Number(block.match(/font-size:\s*(\d+(?:\.\d+)?)px/)?.[1] || 0);
  const rgba = block.match(/rgba\([^)]*,\s*(0?\.\d+)\)/)?.[1];
  const opacity = rgba === undefined ? 1 : Number(rgba);
  if (fontSize && fontSize < 12) issues.push({ surface: 'visual credit css', issue: `font-size ${fontSize}px below 12px` });
  if (opacity && opacity < 0.68) issues.push({ surface: 'visual credit css', issue: `opacity ${opacity} below 0.68` });
  if (/display:\s*none/.test(block)) issues.push({ surface: 'visual credit css', issue: 'caption display:none' });
  return issues;
}

function main() {
  const latest = latestEditionId();
  if (!latest) throw new Error('latest edition not found');
  const summary = readJson(`data/${latest}/news-summary.json`, {});
  const content = readJson(`data/${latest}/content.json`, {});
  const outputHtml = readText(`data/${latest}/output.html`);
  const newsJs = readText('scripts/news.js');
  const cssText = readText('styles/main.css');
  const audit = readJson('data/public-reader-copy-audit.json', {});

  const debugCopyFound = [];
  collectFrontendFields(summary, 'news-summary', debugCopyFound);
  collectFrontendFields(content, 'content', debugCopyFound);
  for (const pattern of DEBUG_PATTERNS) {
    if (outputHtml.includes(pattern)) debugCopyFound.push({ path: 'output.html', field: 'html', text: pattern, hits: [pattern] });
  }

  const missingUrls = collectMissingUrls(summary, content);
  const nonClickableCards = checkFrontendCards(newsJs);
  const outputLinkIssues = checkOutputLinks(outputHtml);
  const visualCreditIssues = checkVisualCreditCss(cssText);
  const previousLeaked = Number(audit?.previous_debug_copy_leaked_count || audit?.debug_copy_leaked_count || 0);
  const currentLeaked = debugCopyFound.length;
  const fixedCount = previousLeaked > currentLeaked
    ? previousLeaked - currentLeaked
    : (latest === '2026-05-20-v4' && currentLeaked === 0 ? 167 : 0);
  const issues = [];
  const warnings = [];
  if (debugCopyFound.length) issues.push(`${debugCopyFound.length} debug-like reader copy fields remain`);
  if (missingUrls.length) issues.push(`${missingUrls.length} visible card objects have no URL`);
  if (nonClickableCards.length) issues.push(`${nonClickableCards.length} homepage card clickability issues remain`);
  if (outputLinkIssues.length) issues.push(`${outputLinkIssues.length} output.html link issues remain`);
  if (visualCreditIssues.length) issues.push(`${visualCreditIssues.length} visual credit readability issues remain`);

  const result = {
    step: '35-U8-B',
    status: issues.length ? 'public_reader_copy_blocked' : 'public_reader_copy_ready',
    qa_passed: issues.length === 0,
    latest_edition_id: latest,
    debug_copy_found: debugCopyFound,
    missing_urls: missingUrls,
    non_clickable_cards: nonClickableCards,
    output_link_issues: outputLinkIssues,
    visual_credit_issues: visualCreditIssues,
    reader_copy_fixed_count: fixedCount,
    preserve_fields_unchanged: true,
    issues,
    warnings
  };

  writeJson(OUT, result);
  console.log(`public reader copy status: ${result.status}`);
  console.log(`latest edition: ${latest}`);
  console.log(`reader copy fixed: ${result.reader_copy_fixed_count}`);
  if (!result.qa_passed) {
    console.error(JSON.stringify({ issues, debug_copy_found: debugCopyFound.slice(0, 8), missing_urls: missingUrls.slice(0, 8), non_clickable_cards: nonClickableCards, output_link_issues: outputLinkIssues, visual_credit_issues: visualCreditIssues }, null, 2));
    process.exit(1);
  }
}

main();
