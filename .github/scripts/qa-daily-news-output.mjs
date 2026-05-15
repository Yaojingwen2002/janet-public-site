#!/usr/bin/env node
// QA for Janet public-site daily news automation.

import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const ROOT = resolve(process.cwd());
const STATUS_PATH = resolve(ROOT, 'data/daily-news-run-status.json');
const OUT = resolve(ROOT, 'data/daily-news-automation-result.json');
const EDITORIAL_RULES = resolve(ROOT, '.github/scripts/editorial-rules.json');
const EDITORIAL_QUALITY_OUT = resolve(ROOT, 'data/editorial-quality-check.json');
const LEAKS = ['/Volumes/', 'file://', '/Users/', 'localhost', '127.0.0.1'];
const BAD_LEAD_KEYWORDS = [
  'availability report',
  'status report',
  'incident',
  'outage',
  'degraded performance',
  'maintenance',
  'monthly report'
];
const BAD_VOICE_PHRASES = [
  '值得关注',
  '持续关注',
  'AI 正在改变世界',
  '未来已来',
  '智能体时代来了',
  '行业正在重构'
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

function walk(dir) {
  const files = [];
  if (!existsSync(dir)) return files;
  for (const entry of readdirSync(dir)) {
    if (entry === '.git') continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) files.push(...walk(full));
    if (st.isFile()) files.push(full);
  }
  return files;
}

function textFile(file) {
  return /\.(html|css|js|json|md|txt|yml|yaml|svg)$/i.test(file);
}

function allStories(content) {
  return Object.values(content?.sections || {}).flatMap((section) => section.items || []);
}

function leadStory(content) {
  return content?.sections?.lead_story?.items?.[0] || null;
}

function containsAny(text, phrases) {
  const lower = String(text || '').toLowerCase();
  return phrases.some((phrase) => lower.includes(String(phrase).toLowerCase()));
}

function runEditorialQa(content, rules) {
  const warnings = [];
  const issues = [];
  const lead = leadStory(content);
  const stories = allStories(content);
  const forbiddenFrontend = rules.forbidden_frontend_phrases || [];

  if (!lead) {
    issues.push('lead story missing');
  } else {
    const leadText = `${lead.title || ''} ${lead.summary || ''}`;
    const badLead = containsAny(leadText, BAD_LEAD_KEYWORDS);
    if (badLead) {
      const better = stories.some((story) => story.id !== lead.id && Number(story.editorial_score || 0) >= 60 && !containsAny(`${story.title} ${story.summary}`, BAD_LEAD_KEYWORDS));
      if (better) issues.push('lead story is status/availability while better stories exist');
      else warnings.push('lead story looks like status/availability content');
    }
  }

  const theme = content?.theme || content?.title || '';
  if (theme === '公开源池晨报') issues.push('daily title is old machine label');
  if ([...forbiddenFrontend, '公开源池晨报'].some((phrase) => String(theme).includes(phrase))) issues.push('daily title contains forbidden phrase');
  if (String(theme).length > 24) issues.push('daily title too long');

  for (const story of stories) {
    if (!story.url) issues.push(`missing url: ${story.id || story.title}`);
    if (!story.source) issues.push(`missing source: ${story.id || story.title}`);
    if (!story.published_at) issues.push(`missing published_at: ${story.id || story.title}`);
    if (!Array.isArray(story.evidence_ids) || !story.evidence_ids.length) issues.push(`missing evidence_ids: ${story.id || story.title}`);
    if (!story.janet_take) issues.push(`missing janet_take: ${story.id || story.title}`);
    if (containsAny(story.janet_take, BAD_VOICE_PHRASES)) issues.push(`weak janet_take phrase: ${story.id || story.title}`);
    if (!story.why_it_matters) issues.push(`missing why_it_matters: ${story.id || story.title}`);
    if (!story.watch_next) issues.push(`missing watch_next: ${story.id || story.title}`);
  }

  return {
    step: '32',
    status: issues.length ? 'editorial_quality_blocked' : 'editorial_quality_ready',
    qa_passed: issues.length === 0,
    lead_title: lead?.title || '',
    lead_source: lead?.source || '',
    lead_editorial_score: Number(lead?.editorial_score || 0),
    lead_quality_passed: !issues.some((issue) => issue.includes('lead story')),
    title_quality_passed: !issues.some((issue) => issue.includes('daily title')),
    janet_voice_passed: !issues.some((issue) => issue.includes('janet_take') || issue.includes('why_it_matters') || issue.includes('watch_next')),
    evidence_passed: !issues.some((issue) => issue.includes('missing url') || issue.includes('missing source') || issue.includes('missing evidence_ids') || issue.includes('published')),
    warnings,
    issues
  };
}

function main() {
  const status = readJson(STATUS_PATH, {});
  const issues = [];
  const rules = readJson(EDITORIAL_RULES, { forbidden_frontend_phrases: [] });
  let editorialQuality = {
    step: '32',
    status: 'editorial_quality_not_applicable',
    qa_passed: true,
    lead_title: '',
    lead_source: '',
    lead_editorial_score: 0,
    lead_quality_passed: true,
    title_quality_passed: true,
    janet_voice_passed: true,
    evidence_passed: true,
    warnings: [],
    issues: []
  };

  if (status.status === 'blocked_insufficient_fresh_news') {
    if (status.published !== false) issues.push('blocked run must not publish');
  } else if (['published_full_edition', 'published_limited_edition'].includes(status.status)) {
    const edition = status.published_edition_id;
    if (!edition) issues.push('published edition id missing');
    for (const file of ['content.json', 'output.html', 'news-summary.json']) {
      if (!existsSync(resolve(ROOT, 'data', edition, file))) issues.push(`missing ${edition}/${file}`);
    }
    readJson(resolve(ROOT, 'data', edition, 'content.json'));
    const content = readJson(resolve(ROOT, 'data', edition, 'content.json'));
    readJson(resolve(ROOT, 'data', edition, 'news-summary.json'));
    const html = existsSync(resolve(ROOT, 'data', edition, 'output.html'))
      ? readFileSync(resolve(ROOT, 'data', edition, 'output.html'), 'utf8')
      : '';
    if (!html.trim()) issues.push('output html empty');
    const manifest = readJson(resolve(ROOT, 'data/MANIFEST.json'), []);
    if (manifest[0] !== edition) issues.push('manifest first entry mismatch');
    editorialQuality = runEditorialQa(content, rules);
    issues.push(...editorialQuality.issues);
  } else if (/^dry_run_/.test(status.status || '')) {
    // Dry run is allowed locally; workflow uses non-dry-run mode.
  } else {
    issues.push(`unknown run status: ${status.status}`);
  }

  const experienceFiles = [
    'news.html',
    'news-detail.html',
    'news-status.html',
    'scripts/news-archive.js',
    'scripts/news-detail.js',
    'scripts/news-status.js',
    'styles/news-archive.css',
    'styles/news-detail.css',
    'styles/news-status.css',
    'data/news-index.json'
  ];
  for (const file of experienceFiles) {
    if (!existsSync(resolve(ROOT, file))) issues.push(`missing news experience file: ${file}`);
  }

  const manifestForIndex = readJson(resolve(ROOT, 'data/MANIFEST.json'), []);
  const newsIndex = readJson(resolve(ROOT, 'data/news-index.json'), null);
  if (!newsIndex) {
    issues.push('news-index missing or invalid');
  } else if (newsIndex.latest_edition_id !== manifestForIndex[0]) {
    issues.push('news-index latest_edition_id mismatch');
  }

  for (const forbidden of ['engineering', 'docs', 'data/_working', 'node_modules']) {
    if (existsSync(resolve(ROOT, forbidden))) issues.push(`forbidden path exists: ${forbidden}`);
  }
  for (const file of walk(ROOT)) {
    const rel = file.replace(`${ROOT}/`, '');
    const base = rel.split('/').pop() || '';
    if (/_pack_.*\.zip$/.test(base) || base === '.env' || /\.env$/.test(base)) issues.push(`forbidden file: ${rel}`);
    if (!textFile(file)) continue;
    const text = readFileSync(file, 'utf8');
    for (const leak of LEAKS) {
      if (text.includes(leak)) issues.push(`local path leak ${leak} in ${rel}`);
    }
  }

  const result = {
    step: '31',
    status: issues.length ? 'daily_news_automation_blocked' : 'daily_news_automation_ready',
    qa_passed: issues.length === 0,
    schedule_utc: '37 0 * * *',
    schedule_asia_shanghai: '08:37',
    requires_paid_api: false,
    requires_secret: false,
    uses_public_sources: true,
    news_experience_layer_passed: !issues.some((issue) => issue.includes('news experience') || issue.includes('news-index')),
    workflow: '.github/workflows/daily-news-pages.yml',
    generator: '.github/scripts/daily-news-generator.mjs',
    issues
  };

  writeJson(EDITORIAL_QUALITY_OUT, editorialQuality);
  writeJson(OUT, result);
  console.log(`status: ${result.status}`);
  if (issues.length) process.exit(1);
}

main();
