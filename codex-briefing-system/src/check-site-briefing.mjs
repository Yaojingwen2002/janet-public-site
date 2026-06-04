#!/usr/bin/env node
import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnv, targetDateFromArg } from './lib.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
loadEnv(resolve(ROOT, '.env'));

const date = targetDateFromArg();
const publicSiteDir = process.env.PUBLIC_SITE_DIR || resolve(ROOT, '..');
const dataDir = resolve(publicSiteDir, 'data', date);
const manifestPath = resolve(publicSiteDir, 'data', 'MANIFEST.json');
const indexPath = resolve(publicSiteDir, 'data', 'news-index.json');
const contentPath = resolve(dataDir, 'content.json');
const outputPath = resolve(dataDir, 'output.html');
const coverPath = resolve(dataDir, 'cover.png');

const BLOCKED_OUTPUT_TERMS = [
  '事实剥离',
  '破防点',
  '槽点',
  '代价',
  '搞钱',
  '落地指导',
  'JANET:',
  'Janet:'
];

const REQUIRED_COUNTS = {
  news: 5,
  models: 4,
  insights: 4,
  insights2: 3,
  tools: 1
};
const MIN_ITEM_IMAGE_BYTES = 1_200;

const issues = [];

function readJson(filePath, fallback = null) {
  try {
    return JSON.parse(readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function requireFile(filePath, label) {
  if (!existsSync(filePath)) {
    issues.push(`missing_${label}:${filePath}`);
    return false;
  }
  return true;
}

requireFile(contentPath, 'content_json');
requireFile(outputPath, 'output_html');
if (requireFile(coverPath, 'cover_png')) {
  const size = statSync(coverPath).size;
  if (size < 20_000) issues.push(`cover_png_too_small:${size}`);
}

const manifest = readJson(manifestPath, []);
if (!Array.isArray(manifest) || manifest[0] !== date) {
  issues.push(`manifest_latest_mismatch:${manifest?.[0] || 'missing'}!=${date}`);
}

const index = readJson(indexPath, {});
if (index.latest_edition_id !== date) {
  issues.push(`news_index_latest_mismatch:${index.latest_edition_id || 'missing'}!=${date}`);
}
const indexEntry = Array.isArray(index.editions)
  ? index.editions.find((entry) => entry.edition_id === date)
  : null;
if (!indexEntry) issues.push(`news_index_missing_entry:${date}`);
if (indexEntry && indexEntry.url !== `data/${date}/output.html`) issues.push('news_index_output_url_mismatch');
if (indexEntry && indexEntry.content_url !== `data/${date}/content.json`) issues.push('news_index_content_url_mismatch');

const content = readJson(contentPath, {});
if (content.date !== date) issues.push(`content_date_mismatch:${content.date || 'missing'}!=${date}`);
if (!content.cover) issues.push('content_missing_cover');
if (content.cover?.image_path !== `runs/${date}/cover.png`) {
  issues.push(`content_cover_image_path_mismatch:${content.cover?.image_path || 'missing'}`);
}
if (!content.trend) issues.push('content_missing_trend');
for (const [section, expected] of Object.entries(REQUIRED_COUNTS)) {
  const items = content.sections?.[section]?.items;
  if (!Array.isArray(items)) {
    issues.push(`content_missing_section:${section}`);
    continue;
  }
  if (items.length !== expected) issues.push(`content_section_count:${section}:${items.length}!=${expected}`);
  items.forEach((item, index) => {
    const path = `${section}[${index}]`;
    if (!item.title) issues.push(`item_missing_title:${path}`);
    if (!item.body) issues.push(`item_missing_body:${path}`);
    if (!item.janet_take) issues.push(`item_missing_janet_take:${path}`);
    if (!item.source) issues.push(`item_missing_source:${path}`);
    if (!/^https?:\/\//i.test(String(item.url || ''))) issues.push(`item_invalid_url:${path}`);
    const image = String(item.image || '').trim();
    if (!image) {
      issues.push(`item_missing_image:${path}`);
    } else if (/^https?:\/\//i.test(image) || image.startsWith('data:')) {
      issues.push(`item_image_not_uploaded:${path}`);
    } else if (!image.replace(/^\.?\//, '').startsWith('images/')) {
      issues.push(`item_image_path_invalid:${path}:${image}`);
    } else {
      const imagePath = resolve(dataDir, image.replace(/^\.?\//, ''));
      if (!existsSync(imagePath)) {
        issues.push(`item_image_file_missing:${path}:${image}`);
      } else {
        const size = statSync(imagePath).size;
        if (size < MIN_ITEM_IMAGE_BYTES) issues.push(`item_image_too_small:${path}:${size}<${MIN_ITEM_IMAGE_BYTES}`);
      }
    }
  });
}

if (existsSync(outputPath)) {
  const output = readFileSync(outputPath, 'utf8');
  if (!output.includes('data-janet-cover="true"')) issues.push('output_missing_cover_section');
  if (!output.includes('cover.png')) issues.push('output_missing_cover_png');
  if (!output.includes('今日趋势')) issues.push('output_missing_trend');
  if (!output.includes('Janet 锐评：')) issues.push('output_missing_janet_take');
  const itemImages = Object.values(content.sections || {}).flatMap((section) =>
    (section?.items || []).map((item) => String(item.image || '').trim()).filter(Boolean)
  );
  for (const image of itemImages) {
    if (!output.includes(image)) issues.push(`output_missing_item_image:${image}`);
  }
  for (const term of BLOCKED_OUTPUT_TERMS) {
    if (output.includes(term)) issues.push(`output_blocked_term:${term}`);
  }
}

if (issues.length) {
  console.error(JSON.stringify({ status: 'site_briefing_check_failed', date, issues }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({ status: 'site_briefing_ready', date, issues: 0 }, null, 2));
