#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const ROOT = process.cwd();
const OUT = resolve(ROOT, 'data/public-reader-copy-audit.json');

const DEBUG_PATTERNS = [
  '这条新闻的' + '具体对象是',
  '动作是',
  '原文' + '线索是',
  '报道的重点是',
  '这条围绕',
  '真正有用的部分藏在',
  '这条要看细节',
  '是否公布接口、限制或' + '客户案例'
];

const FRONTEND_FIELD_ALLOWLIST = new Set([
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

function hasChinese(text) {
  return /[\u4e00-\u9fff]/.test(String(text || ''));
}

function compactText(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

function hitDebug(text) {
  const value = String(text || '');
  return DEBUG_PATTERNS.filter((pattern) => value.includes(pattern));
}

function addField(fields, path, value, source) {
  if (value === null || value === undefined) return;
  if (typeof value !== 'string' && typeof value !== 'number') return;
  const text = compactText(value);
  if (!text || text.length < 4) return;
  const field = path.split('.').pop()?.replace(/\[\d+\]/g, '') || '';
  if (!FRONTEND_FIELD_ALLOWLIST.has(field)) return;
  fields.push({ path, source, field, text, debug_hits: hitDebug(text) });
}

function collectFields(value, path, source, fields) {
  if (value === null || value === undefined) return;
  if (typeof value === 'string' || typeof value === 'number') {
    addField(fields, path, value, source);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectFields(item, `${path}[${index}]`, source, fields));
    return;
  }
  if (typeof value !== 'object') return;
  Object.entries(value).forEach(([key, child]) => collectFields(child, path ? `${path}.${key}` : key, source, fields));
}

function storyId(item) {
  return item?.story_id || item?.id || item?.lead_story_id || '';
}

function storyMap(content) {
  const map = new Map();
  const add = (story) => {
    const id = storyId(story);
    if (!id) return;
    if (!map.has(id)) map.set(id, story);
  };
  (content.stories || []).forEach(add);
  (content.edition_items || []).forEach(add);
  Object.values(content.sections || {}).forEach((section) => (section.items || []).forEach(add));
  (content.homepage_items || []).forEach(add);
  return map;
}

function auditUrlObject(path, item, map, missing, backfillable) {
  if (!item || typeof item !== 'object') return;
  const direct = item.url || item.source_url || item.external_url;
  if (direct) return;
  const id = storyId(item);
  const sourceStory = id ? map.get(id) : null;
  if (sourceStory?.url || sourceStory?.source_url || sourceStory?.external_url) {
    backfillable.push({
      path,
      story_id: id,
      backfill_url: sourceStory.url || sourceStory.source_url || sourceStory.external_url
    });
    return;
  }
  missing.push({ path, story_id: id, title: item.title || item.story_title || item.module_title || '' });
}

function auditUrls(summary, content) {
  const missing = [];
  const backfillable = [];
  const map = storyMap(content);
  auditUrlObject('news-summary.lead_story', summary.lead_story, map, missing, backfillable);
  (summary.signal_map || []).forEach((item, index) => auditUrlObject(`news-summary.signal_map[${index}]`, item, map, missing, backfillable));
  (summary.compact_news || []).forEach((item, index) => auditUrlObject(`news-summary.compact_news[${index}]`, item, map, missing, backfillable));
  (summary.homepage_items || []).forEach((item, index) => auditUrlObject(`news-summary.homepage_items[${index}]`, item, map, missing, backfillable));
  (content.homepage_items || []).forEach((item, index) => auditUrlObject(`content.homepage_items[${index}]`, item, map, missing, backfillable));
  Object.entries(content.sections || {}).forEach(([sectionKey, section]) => {
    (section.items || []).forEach((item, index) => auditUrlObject(`content.sections.${sectionKey}.items[${index}]`, item, map, missing, backfillable));
  });
  (content.modules || []).forEach((module, index) => {
    if (Array.isArray(module.items)) {
      module.items.forEach((item, itemIndex) => auditUrlObject(`content.modules[${index}].items[${itemIndex}]`, item, map, missing, backfillable));
    } else if (Array.isArray(module.story_ids)) {
      module.story_ids.forEach((id, itemIndex) => auditUrlObject(`content.modules[${index}].story_ids[${itemIndex}]`, { story_id: id }, map, missing, backfillable));
    }
  });
  return { missing, backfillable };
}

function auditFrontendClicks(newsJs) {
  const issues = [];
  if (/<article class="news-signal-card/.test(newsJs) && !/news-signal-card[\s\S]{0,220}href=/.test(newsJs)) {
    issues.push({
      surface: 'homepage signal cards',
      issue: 'signal cards render as article elements without whole-card source href'
    });
  }
  if (/<article class="news-compact-card/.test(newsJs) && !/news-compact-card[\s\S]{0,220}href=/.test(newsJs)) {
    issues.push({
      surface: 'homepage compact cards',
      issue: 'compact cards render as article elements without whole-card source href'
    });
  }
  if (/<div class="news-v4-lead">/.test(newsJs)) {
    issues.push({
      surface: 'homepage lead story',
      issue: 'lead title/visual area is not a whole-card source link; only a small source link is clickable'
    });
  }
  if (!/target="_blank"/.test(newsJs)) issues.push({ surface: 'scripts/news.js', issue: 'target=_blank not found' });
  if (!/rel="noopener noreferrer"/.test(newsJs)) issues.push({ surface: 'scripts/news.js', issue: 'rel=noopener noreferrer not found' });
  return issues;
}

function auditOutputLinks(outputHtml) {
  const issues = [];
  if (/<img class="visual"/.test(outputHtml) && !/<a[^>]+href=[^>]+>\s*<img class="visual"/.test(outputHtml)) {
    issues.push({ surface: 'output lead visual', issue: 'lead visual is not linked to source' });
  }
  if (/<h2>/.test(outputHtml) && !/<a[^>]+href=[^>]+>\s*<h2>/.test(outputHtml)) {
    issues.push({ surface: 'output lead title', issue: 'lead title is not linked to source' });
  }
  if (/<div class="signal"><div class="card"><img/.test(outputHtml) && !/<div class="signal"><a/.test(outputHtml)) {
    issues.push({ surface: 'output signal cards', issue: 'signal cards are not whole-card source links' });
  }
  if (/今日更多[\s\S]*?<div class="signal"><div class="card">/.test(outputHtml)) {
    issues.push({ surface: 'output compact cards', issue: 'compact cards are not whole-card source links' });
  }
  if (/<article><small>[\s\S]*?<h3>/.test(outputHtml) && !/<article>[\s\S]*?<a[^>]+href=[^>]+>\s*<h3>/.test(outputHtml)) {
    issues.push({ surface: 'output section item title', issue: 'section item title is not linked to source' });
  }
  if (!/>原文<\/a>/.test(outputHtml)) {
    issues.push({ surface: 'output original links', issue: '原文 link missing' });
  }
  return issues;
}

function auditTinyCredits(cssText, newsJs) {
  const issues = [];
  const figcaptionBlock = cssText.match(/\.news-v4-lead-figure figcaption,[\s\S]*?\{([\s\S]*?)\}/)?.[1] || '';
  const fontSize = Number(figcaptionBlock.match(/font-size:\s*(\d+(?:\.\d+)?)px/)?.[1] || 0);
  const opacity = Number(figcaptionBlock.match(/rgba\([^)]*,\s*(0?\.\d+)\)/)?.[1] || 1);
  if (fontSize && fontSize <= 11) {
    issues.push({ surface: 'visual figcaption credit', issue: `font-size ${fontSize}px may be too small for image credit/source` });
  }
  if (opacity && opacity <= 0.55) {
    issues.push({ surface: 'visual figcaption credit', issue: `text opacity ${opacity} may be too low for readability` });
  }
  if (/display:\s*none/.test(figcaptionBlock)) {
    issues.push({ surface: 'visual figcaption credit', issue: 'caption/credit is display:none' });
  }
  if (/figcaption/.test(newsJs) && !figcaptionBlock) {
    issues.push({ surface: 'visual figcaption credit', issue: 'frontend renders figcaption but CSS block was not found' });
  }
  return issues;
}

function main() {
  const previous = readJson('data/public-reader-copy-audit.json', {});
  const latest = latestEditionId();
  if (!latest) throw new Error('latest edition not found');
  const summary = readJson(`data/${latest}/news-summary.json`, {});
  const content = readJson(`data/${latest}/content.json`, {});
  const outputHtml = readText(`data/${latest}/output.html`);
  const newsJs = readText('scripts/news.js');
  const cssText = [readText('styles/main.css'), readText('styles/news-editorial.css'), readText('styles/news-archive.css')].join('\n');
  const fields = [];
  collectFields(summary, 'news-summary', 'news-summary', fields);
  collectFields(content, 'content', 'content', fields);
  const leaked = fields.filter((field) => field.debug_hits.length);
  const ok = fields.filter((field) => !field.debug_hits.length && hasChinese(field.text));
  const { missing, backfillable } = auditUrls(summary, content);
  const nonClickable = auditFrontendClicks(newsJs);
  const outputIssues = auditOutputLinks(outputHtml);
  const tinyCredits = auditTinyCredits(cssText, newsJs);
  const preserveFields = ok.slice(0, 40).map((field) => ({ path: field.path, text: field.text.slice(0, 140) }));
  const fixFields = leaked.map((field) => ({
    path: field.path,
    source: field.source,
    debug_hits: field.debug_hits,
    text: field.text.slice(0, 220)
  }));
  const issues = [];
  const warnings = [];
  if (leaked.length) issues.push(`${leaked.length} frontend reader-copy fields contain debug-like copy`);
  if (missing.length) issues.push(`${missing.length} frontend objects have no direct/backfilled URL`);
  if (nonClickable.length) warnings.push(`${nonClickable.length} homepage card clickability gaps found`);
  if (outputIssues.length) warnings.push(`${outputIssues.length} output.html link gaps found`);
  if (tinyCredits.length) warnings.push(`${tinyCredits.length} visual credit readability warnings found`);

  const result = {
    step: '35-U8-A',
    status: 'public_reader_copy_audited',
    latest_edition_id: latest,
    reader_copy_ok_count: ok.length,
    debug_copy_leaked_count: leaked.length,
    previous_debug_copy_leaked_count: Number(previous?.debug_copy_leaked_count || 0),
    debug_copy_leaked_fields: fixFields,
    missing_url_fields: missing,
    can_backfill_url_from_story_id: backfillable,
    non_clickable_card_surfaces: nonClickable,
    output_link_issues: outputIssues,
    tiny_visual_credit_surfaces: tinyCredits,
    preserve_fields: preserveFields,
    fix_fields: fixFields,
    issues,
    warnings
  };

  writeJson(OUT, result);
  console.log(`public reader copy audit status: ${result.status}`);
  console.log(`latest edition: ${latest}`);
  console.log(`debug copy leaked fields: ${leaked.length}`);
}

main();
