#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const ROOT = resolve(process.cwd());
const OUT = resolve(ROOT, 'data/release-gate-check.json');

const REQUIRED_CHECKS = [
  'data/public-reader-copy-check.json',
  'data/main-ux-check.json',
  'data/semantic-copy-check.json',
  'data/news-visuals-check.json',
  'data/homepage-surface-copy-check.json'
];

const TEMPLATE_PATTERNS = [
  { label: '今日封面', pattern: /今日封面/g },
  { label: '重点是', pattern: /重点是/g },
  { label: '今天值得看', pattern: /今天值得看/g },
  { label: '值得看，因为', pattern: /值得看，因为/g },
  { label: '出现.*新进展', pattern: /出现.{0,16}新进展/g },
  { label: '开始生成内容', pattern: /开始生成内容/g },
  { label: '发布词落到了', pattern: /发布词落到了/g },
  { label: '把.*放进.*语境', pattern: /把.{0,24}放进.{0,24}语境/g },
  { label: 'debug copy: 具体对象是', pattern: /这条新闻的具体对象是|原文线索是|是否公布接口、限制或客户案例/g }
];

function ensureDir(filePath) {
  mkdirSync(dirname(filePath), { recursive: true });
}

function readText(file, fallback = '') {
  const p = resolve(ROOT, file);
  if (!existsSync(p)) return fallback;
  return readFileSync(p, 'utf8');
}

function readJson(file, fallback = null) {
  const text = readText(file, '');
  if (!text) return fallback;
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

function writeJson(filePath, data) {
  ensureDir(filePath);
  writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

function latestEditionId() {
  const manifest = readJson('data/MANIFEST.json', []);
  if (Array.isArray(manifest)) return manifest[0] || '';
  return manifest?.items?.[0] || manifest?.latest || '';
}

function findTemplateHits(files) {
  const hits = [];
  for (const file of files) {
    const text = readText(file, '');
    for (const rule of TEMPLATE_PATTERNS) {
      const matches = [...text.matchAll(rule.pattern)];
      for (const match of matches.slice(0, 20)) {
        const start = Math.max(0, match.index - 50);
        const end = Math.min(text.length, match.index + match[0].length + 50);
        hits.push({
          file,
          phrase: rule.label,
          match: match[0],
          context: text.slice(start, end).replace(/\s+/g, ' ').trim()
        });
      }
    }
  }
  return hits;
}

function cnCharCount(text) {
  return (String(text || '').match(/[\u4e00-\u9fff]/g) || []).length;
}

const issues = [];
const warnings = [];
const duplicateFileFindings = [];
const latest = latestEditionId();
const latestDir = latest ? `data/${latest}` : '';

if (!latest) issues.push('MANIFEST.json has no latest edition');
if (latest && !existsSync(resolve(ROOT, latestDir))) issues.push(`latest edition directory missing: ${latestDir}`);

const requiredEditionFiles = latest
  ? [`${latestDir}/content.json`, `${latestDir}/news-summary.json`, `${latestDir}/output.html`]
  : [];
for (const file of requiredEditionFiles) {
  if (!existsSync(resolve(ROOT, file))) issues.push(`missing latest edition file: ${file}`);
}

for (const checkFile of REQUIRED_CHECKS) {
  const check = readJson(checkFile, null);
  if (!check) {
    issues.push(`required check missing or invalid: ${checkFile}`);
    continue;
  }
  if (check.qa_passed !== true) {
    issues.push(`required check failed: ${checkFile}`);
  }
}

const templateCopyHits = findTemplateHits(requiredEditionFiles);
if (templateCopyHits.length) {
  issues.push(`${templateCopyHits.length} release-blocking template copy hits found`);
}

const content = latest ? readJson(`${latestDir}/content.json`, {}) : {};
const summary = latest ? readJson(`${latestDir}/news-summary.json`, {}) : {};
if (content?.edition_id !== latest) issues.push('content.json edition_id does not match MANIFEST latest');
if (summary?.edition_id !== latest) issues.push('news-summary.json edition_id does not match MANIFEST latest');

if (!content?.daily_editorial_summary) {
  issues.push('daily_editorial_summary missing from content.json');
} else {
  if (cnCharCount(content.daily_editorial_summary.body) < 350) issues.push('daily_editorial_summary.body below 350 Chinese chars');
  if (!Array.isArray(content.daily_editorial_summary.source_story_ids) || !content.daily_editorial_summary.source_story_ids.length) {
    issues.push('daily_editorial_summary.source_story_ids missing');
  }
}

const stories = Array.isArray(content?.stories) ? content.stories : [];
if (!stories.length) issues.push('content.stories missing');
for (const story of stories) {
  const id = story.story_id || story.id || story.title || 'unknown-story';
  if (cnCharCount(story.content) < 280) issues.push(`story.content below 280 Chinese chars: ${id}`);
  if (!String(story.content || '').includes('Janet 锐评：')) issues.push(`story.content missing Janet 锐评： ${id}`);
  if (cnCharCount(story.janet_take) < 60) issues.push(`story.janet_take below 60 Chinese chars: ${id}`);
}

if ((summary?.lead_story?.summary || '') === (content?.daily_editorial_summary?.body || '')) {
  issues.push('homepage summary equals lead story summary');
}

if (existsSync(resolve(ROOT, 'data/semantic-copy-audit.json'))) duplicateFileFindings.push('data/semantic-copy-audit.json is an old one-off audit artifact');
if (existsSync(resolve(ROOT, 'data/news-visuals-audit.json'))) duplicateFileFindings.push('data/news-visuals-audit.json is an old one-off audit artifact');
if (existsSync(resolve(ROOT, 'data/homepage-surface-copy-audit.json'))) duplicateFileFindings.push('data/homepage-surface-copy-audit.json is an old one-off audit artifact');

const result = {
  step: '35-U10-0',
  qa_passed: issues.length === 0,
  issues,
  warnings,
  latest_edition_id: latest,
  content_truth_source: 'content.json',
  template_copy_hits: templateCopyHits,
  duplicate_file_findings: duplicateFileFindings,
  local_public_sync: {
    production_source: 'janet-public-site',
    reference_archive: 'local Janet archive',
    schedule_utc: '10 0 * * *',
    schedule_asia: '08:10'
  }
};

writeJson(OUT, result);
console.log(`release gate status: ${issues.length ? 'blocked' : 'ready'}`);
if (issues.length) {
  console.error(JSON.stringify({ issues, template_copy_hits: templateCopyHits.slice(0, 10) }, null, 2));
  process.exit(1);
}
