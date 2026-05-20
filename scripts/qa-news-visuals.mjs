#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const ROOT = process.cwd();
const OUT = resolve(ROOT, 'data/news-visuals-check.json');
const BAD_MODES = ['legacy_green_visual', 'placeholder'];

function readJson(file, fallback = null) {
  try {
    return JSON.parse(readFileSync(resolve(ROOT, file), 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJson(file, data) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
}

function latestEditionId() {
  const manifest = readJson('data/MANIFEST.json', []);
  if (Array.isArray(manifest)) return manifest[0] || '';
  return manifest?.items?.[0] || manifest?.latest || '';
}

function hasChinese(text) {
  return /[\u4e00-\u9fff]/.test(String(text || ''));
}

function visualSrc(visual) {
  if (!visual) return '';
  if (typeof visual === 'string') return visual;
  return visual.src || visual.local_path || '';
}

function visualMode(visual) {
  if (!visual) return '';
  if (typeof visual === 'string') return 'legacy_string_visual';
  return visual.mode || '';
}

function localFileExists(src) {
  if (!src || /^https?:\/\//.test(src)) return true;
  return existsSync(resolve(ROOT, src));
}

function svgText(src) {
  if (!src || /^https?:\/\//.test(src) || !src.endsWith('.svg') || !existsSync(resolve(ROOT, src))) return '';
  return readFileSync(resolve(ROOT, src), 'utf8');
}

function collectVisibleItems(summary) {
  const items = [];
  if (summary?.lead_story) items.push({ role: 'lead', item: summary.lead_story });
  (summary?.signal_map || []).forEach((item, index) => items.push({ role: `signal_${index + 1}`, item }));
  (summary?.compact_news || []).forEach((item, index) => items.push({ role: `compact_${index + 1}`, item }));
  return items;
}

function visualKey(entry) {
  return visualSrc(entry.item.visual || entry.item.image || '');
}

function main() {
  const latest = latestEditionId();
  const summary = readJson(`data/${latest}/news-summary.json`, {});
  const content = readJson(`data/${latest}/content.json`, {});
  const visible = collectVisibleItems(summary);
  const issues = [];
  const warnings = [];
  const missingVisuals = [];
  const lowRelevanceVisuals = [];
  const missingAlt = [];
  const missingCaption = [];
  const missingCredit = [];
  const duplicateVisuals = [];
  const modes = new Map();
  const generatedTemplates = new Set();
  const srcCounts = new Map();

  for (const entry of visible) {
    const visual = entry.item.visual;
    const mode = visualMode(visual);
    const src = visualSrc(visual);
    modes.set(mode, (modes.get(mode) || 0) + 1);
    if (!visual || typeof visual === 'string') missingVisuals.push({ role: entry.role, story_id: entry.item.story_id || entry.item.id || '', reason: 'visual object missing' });
    if (!src) missingVisuals.push({ role: entry.role, story_id: entry.item.story_id || entry.item.id || '', reason: 'visual src missing' });
    if (BAD_MODES.includes(mode) || /legacy|placeholder|fallback|green/i.test(mode)) issues.push(`forbidden visual mode: ${entry.role} ${mode}`);
    if (/assets\/visuals-legacy/.test(JSON.stringify(visual || {}))) issues.push(`legacy visual path exposed: ${entry.role}`);
    if (!localFileExists(src)) issues.push(`local visual missing: ${entry.role} ${src}`);
    if (!visual?.alt || !hasChinese(visual.alt)) missingAlt.push({ role: entry.role, src, alt: visual?.alt || '' });
    if (!visual?.caption || !hasChinese(visual.caption)) missingCaption.push({ role: entry.role, src, caption: visual?.caption || '' });
    if (!visual?.credit) missingCredit.push({ role: entry.role, src, mode });
    if (!Array.isArray(visual?.matched_terms) || !visual.matched_terms.length) issues.push(`visual matched_terms missing: ${entry.role}`);
    const score = Number(visual?.relevance_score || 0);
    const minScore = mode === 'generated_story_svg' ? 0.5 : (mode === 'source_image' || mode === 'official_image' ? 0.75 : 0.65);
    if (score < minScore) lowRelevanceVisuals.push({ role: entry.role, mode, src, relevance_score: score, min_score: minScore });
    if ((mode === 'open_license_image') && (!visual.license || !visual.credit || !visual.source_url)) issues.push(`open license visual attribution incomplete: ${entry.role}`);
    if ((mode === 'source_image' || mode === 'official_image') && (!visual.source_url || !visual.credit)) issues.push(`source visual attribution incomplete: ${entry.role}`);
    if (mode === 'generated_story_svg') {
      if (!visual.local_path) issues.push(`generated SVG local_path missing: ${entry.role}`);
      const text = svgText(src);
      if (/#18e299|JANET DAILY|visualPattern|legacy/i.test(text)) issues.push(`generated SVG looks like legacy green visual: ${entry.role}`);
      if (visual.template) generatedTemplates.add(visual.template);
    }
    if (src) srcCounts.set(src, (srcCounts.get(src) || 0) + 1);
  }

  for (const [src, count] of srcCounts.entries()) {
    if (count > 1) duplicateVisuals.push({ src, count });
  }
  if (visible.length && visible.every((entry) => visualMode(entry.item.visual) === 'generated_story_svg') && generatedTemplates.size <= 1 && visible.length > 1) {
    issues.push('all generated story SVGs use the same template');
  }
  if (!visible.length) issues.push('no homepage-visible news items found');
  if (missingVisuals.length) issues.push('homepage-visible item missing visual object or src');
  if (missingAlt.length) issues.push('visual alt missing or not Chinese');
  if (missingCaption.length) issues.push('visual caption missing or not Chinese');
  if (missingCredit.length) issues.push('visual credit missing');
  if (lowRelevanceVisuals.length) issues.push('visual relevance below threshold');
  if (duplicateVisuals.length) issues.push('duplicate visuals found');

  const check = {
    step: '35-U7-B',
    status: issues.length ? 'news_visuals_blocked' : 'news_visuals_ready',
    qa_passed: issues.length === 0,
    latest_edition_id: latest,
    visuals_checked: visible.length,
    source_image_count: modes.get('source_image') || 0,
    official_image_count: modes.get('official_image') || 0,
    open_license_image_count: modes.get('open_license_image') || 0,
    generated_story_svg_count: modes.get('generated_story_svg') || 0,
    legacy_green_visual_count: [...modes.keys()].filter((mode) => /legacy_green_visual|legacy_string_visual/i.test(mode)).reduce((total, mode) => total + (modes.get(mode) || 0), 0),
    placeholder_visual_count: [...modes.keys()].filter((mode) => /placeholder|fallback/i.test(mode)).reduce((total, mode) => total + (modes.get(mode) || 0), 0),
    missing_visuals: missingVisuals,
    low_relevance_visuals: lowRelevanceVisuals,
    missing_alt: missingAlt,
    missing_caption: missingCaption,
    missing_credit: missingCredit,
    duplicate_visuals: duplicateVisuals,
    generated_templates: [...generatedTemplates],
    issues,
    warnings
  };

  writeJson(OUT, check);
  console.log(`news visuals status: ${check.status}`);
  if (issues.length) process.exit(1);
}

main();
