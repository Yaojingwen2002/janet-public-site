#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';

const rootArg = process.argv.indexOf('--root');
const root = resolve(rootArg >= 0 ? process.argv[rootArg + 1] : process.cwd());
const issues = [];

function readJson(path) {
  try {
    return JSON.parse(readFileSync(resolve(root, path), 'utf8'));
  } catch (error) {
    issues.push(`invalid_json:${path}:${error.message}`);
    return null;
  }
}

function requireFile(path) {
  if (!existsSync(resolve(root, path))) issues.push(`missing_file:${path}`);
}

function localPathFromUrl(path) {
  return String(path || '').split('#')[0].split('?')[0].replace(/^\/+/, '');
}

function validateHtmlReferences(file) {
  const absolute = resolve(root, file);
  if (!existsSync(absolute)) return;
  const html = readFileSync(absolute, 'utf8');
  for (const match of html.matchAll(/\b(?:src|href)\s*=\s*["']([^"']*)["']/gi)) {
    const raw = match[1];
    const clean = localPathFromUrl(raw);
    if (!clean || /^(?:https?:|mailto:|tel:|data:|javascript:)/i.test(raw)) continue;
    const target = resolve(dirname(absolute), decodeURIComponent(clean));
    if (!existsSync(target)) issues.push(`broken_reference:${file}:${raw}`);
  }
}

function walk(path) {
  const absolute = resolve(root, path);
  if (!existsSync(absolute)) return [];
  const files = [];
  for (const entry of readdirSync(absolute)) {
    const next = resolve(absolute, entry);
    const stat = statSync(next);
    if (stat.isDirectory()) files.push(...walk(relative(root, next)));
    if (stat.isFile()) files.push(relative(root, next));
  }
  return files;
}

for (const file of [
  'index.html',
  'news.html',
  'portfolio.html',
  'gpt-image2-handbook.html',
  'shuttle-universe.html',
  'misaligned-scenes.html',
  '404.html',
  'auth/reset-password.html',
  'data/MANIFEST.json',
  'data/news-index.json',
  'sitemap.xml',
  'robots.txt'
]) requireFile(file);

const manifest = readJson('data/MANIFEST.json') || [];
const index = readJson('data/news-index.json') || {};
const editions = Array.isArray(index.editions) ? index.editions : [];
const latest = index.latest_edition_id || '';

if (!Array.isArray(manifest) || !manifest.length) issues.push('manifest_empty');
if (!latest || latest !== manifest[0]) issues.push(`latest_pointer_mismatch:${latest}:${manifest[0] || ''}`);
if (new Set(manifest).size !== manifest.length) issues.push('manifest_duplicates');
if (new Set(editions.map((edition) => edition.edition_id)).size !== editions.length) issues.push('index_duplicates');
if (manifest.length !== editions.length) issues.push(`manifest_index_count_mismatch:${manifest.length}:${editions.length}`);

for (const edition of editions) {
  const id = edition.edition_id || '';
  if (!id || !manifest.includes(id)) issues.push(`index_entry_not_in_manifest:${id}`);
  const contentPath = localPathFromUrl(edition.content_url || `data/${id}/content.json`);
  requireFile(contentPath);
  const outputPath = localPathFromUrl(edition.url || '');
  if (outputPath) {
    requireFile(outputPath);
    if (existsSync(resolve(root, outputPath))) {
      const outputHtml = readFileSync(resolve(root, outputPath), 'utf8');
      if (!/<link\b[^>]*rel=["'](?:shortcut )?icon["']/i.test(outputHtml)) issues.push(`edition_favicon_missing:${id}`);
    }
  }
}

for (const id of manifest) {
  if (!editions.some((edition) => edition.edition_id === id)) issues.push(`manifest_entry_not_in_index:${id}`);
}

const artifactEditionDirs = readdirSync(resolve(root, 'data')).filter((entry) => {
  const path = resolve(root, 'data', entry);
  return /^\d{4}-\d{2}-\d{2}(?:-v\d+)?$/.test(entry) && statSync(path).isDirectory();
});
for (const id of artifactEditionDirs) {
  if (!manifest.includes(id)) issues.push(`unindexed_edition_in_artifact:${id}`);
}

const latestEdition = editions.find((edition) => edition.edition_id === latest);
if (!latestEdition) issues.push('latest_edition_missing_from_index');
const latestContentPath = latestEdition ? localPathFromUrl(latestEdition.content_url) : '';
const latestOutputPath = latestEdition ? localPathFromUrl(latestEdition.url) : '';
requireFile(`data/${latest}/cover.png`);
if (!latestContentPath) issues.push('latest_content_url_missing');
if (!latestOutputPath) issues.push('latest_output_url_missing');

const content = latestContentPath ? readJson(latestContentPath) : null;
if (content) {
  if (content.date !== latest) issues.push(`latest_content_date_mismatch:${content.date || ''}:${latest}`);
  const expectedCounts = { news: 5, models: 4, insights: 4, insights2: 3, tools: 1 };
  for (const [section, expected] of Object.entries(expectedCounts)) {
    const items = content.sections?.[section]?.items;
    if (!Array.isArray(items) || items.length !== expected) {
      issues.push(`section_count_mismatch:${section}:${Array.isArray(items) ? items.length : 0}:${expected}`);
      continue;
    }
    items.forEach((item, index) => {
      const key = `${section}[${index}]`;
      if (!String(item.title || '').trim()) issues.push(`item_title_missing:${key}`);
      if (!String(item.body || '').trim()) issues.push(`item_body_missing:${key}`);
      if (!String(item.janet_take || '').trim()) issues.push(`item_janet_take_missing:${key}`);
      if (!/^https?:\/\//i.test(String(item.url || item.link || ''))) issues.push(`item_source_url_invalid:${key}`);
      const image = localPathFromUrl(item.image || '');
      if (!image || !existsSync(resolve(root, `data/${latest}`, image))) issues.push(`item_image_missing:${key}:${image}`);
    });
  }
}

const shellPages = [
  'index.html',
  'news.html',
  'portfolio.html',
  'project-detail.html',
  'gpt-image2-handbook.html',
  'misaligned-scenes.html',
  'shuttle-universe.html',
  '404.html',
  'auth/reset-password.html'
];
shellPages.forEach(validateHtmlReferences);
if (latestOutputPath) validateHtmlReferences(latestOutputPath);

const sitemap = existsSync(resolve(root, 'sitemap.xml')) ? readFileSync(resolve(root, 'sitemap.xml'), 'utf8') : '';
if (latestOutputPath && !sitemap.includes(latestOutputPath)) issues.push('sitemap_latest_missing');
for (const edition of editions.filter((item) => item.url)) {
  if (!sitemap.includes(localPathFromUrl(edition.url))) issues.push(`sitemap_edition_missing:${edition.edition_id}`);
}

const forbiddenRoots = ['.github', 'codex-briefing-system', 'docs', '镜场计划'];
for (const path of forbiddenRoots) {
  if (existsSync(resolve(root, path))) issues.push(`private_or_source_path_in_artifact:${path}`);
}
for (const file of walk('.')) {
  if (/(^|\/)\._|(^|\/)\.DS_Store$/.test(file)) issues.push(`mac_metadata_in_artifact:${file}`);
  if (/JANET-FULL-PROFILE|Janet完整档案/i.test(file)) issues.push(`private_profile_in_artifact:${file}`);
}

if (issues.length) {
  console.error(JSON.stringify({ status: 'current_site_qa_blocked', root, issues }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  status: 'current_site_qa_ready',
  latest,
  editions: editions.length,
  artifact_files: walk('.').length
}, null, 2));
