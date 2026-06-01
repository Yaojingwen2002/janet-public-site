#!/usr/bin/env node
// QA for Janet public-site daily news automation.

import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const ROOT = resolve(process.cwd());
const STATUS_PATH = resolve(ROOT, 'data/daily-news-run-status.json');
const EDITORIAL_RULES = resolve(ROOT, '.github/scripts/editorial-rules.json');
const EDITORIAL_COPY_RULES = resolve(ROOT, '.github/scripts/editorial-copy-rules.json');
const EDITORIAL_REDESIGN_OUT = resolve(ROOT, 'data/editorial-redesign-check.json');
const EDITORIAL_ARCHITECTURE_OUT = resolve(ROOT, 'data/editorial-architecture-check.json');
const SOURCE_POOL = resolve(ROOT, '.github/scripts/rss-source-pool.json');
const SOURCE_COVERAGE = resolve(ROOT, 'data/source-coverage-report.json');
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

function hasChinese(text) {
  return /[\u4e00-\u9fff]/.test(String(text || ''));
}

function englishWordCount(text) {
  const matches = String(text || '').match(/[A-Za-z][A-Za-z'-]+/g);
  return matches ? matches.length : 0;
}

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
    if (!hasChinese(lead.title) || englishWordCount(lead.title) >= 5) {
      issues.push('lead title is not Chinese-first');
    }
    if (lead.summary && !hasChinese(lead.summary)) {
      issues.push('lead summary is not Chinese-first');
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
    if (!hasChinese(story.title) || englishWordCount(story.title) >= 5) issues.push(`story title is not Chinese-first: ${story.id || story.title}`);
    if (story.summary && !hasChinese(story.summary)) issues.push(`story summary is not Chinese-first: ${story.id || story.title}`);
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

function recentTitles(limit = 7) {
  const index = readJson(resolve(ROOT, 'data/news-index.json'), null);
  const titles = [];
  if (Array.isArray(index?.editions)) {
    return index.editions.slice(0, limit).map((edition) => edition.title).filter(Boolean);
  }
  const manifest = readJson(resolve(ROOT, 'data/MANIFEST.json'), []);
  for (const editionId of manifest.slice(0, limit)) {
    const summary = readJson(resolve(ROOT, `data/${editionId}/news-summary.json`), null);
    const content = readJson(resolve(ROOT, `data/${editionId}/content.json`), null);
    titles.push(summary?.title || summary?.theme || content?.theme || '');
  }
  return titles.filter(Boolean);
}

function runEditorialRedesignQa(content, status, rules, copyRules) {
  const issues = [];
  const warnings = [];
  const pool = readJson(SOURCE_POOL, { sources: [] });
  const coverage = readJson(SOURCE_COVERAGE, null);
  const stories = allStories(content);
  const editionItems = Array.isArray(content?.edition_items) ? content.edition_items : stories;
  const homepageItems = Array.isArray(content?.homepage_items) ? content.homepage_items : [];
  const compactCards = Array.isArray(content?.compact_news)
    ? content.compact_news.length
    : homepageItems.filter((item) => item.role === 'compact').length;
  const enabledSourceCount = (pool.sources || []).filter((source) => source.enabled).length;
  const forbiddenPublic = [
    ...(copyRules.forbidden_public_phrases || []),
    '本期从公开 RSS',
    'Atom / official feeds',
    '窗口内新闻',
    'Janet 已改写',
    '筛出',
    '入选信号'
  ];
  const publicText = [
    content?.theme,
    content?.intro_text,
    content?.daily_thesis,
    JSON.stringify(content?.signal_map || []),
    JSON.stringify(content?.compact_news || []),
    readFileSync(resolve(ROOT, 'index.html'), 'utf8')
  ].join('\n');
  for (const phrase of forbiddenPublic) {
    if (phrase && publicText.includes(phrase)) issues.push(`public engineering/generic phrase remains: ${phrase}`);
  }
  const titles = recentTitles(Number(rules.title_generation?.forbid_repeat_days || 7));
  const currentTitle = content?.theme || '';
  const duplicateCount = titles.filter((title) => title === currentTitle).length;
  const dailyTitleUnique7d = duplicateCount <= 1;
  if (!dailyTitleUnique7d) issues.push('daily title repeats in recent 7 editions');
  if (currentTitle === '工具链又拧紧了') issues.push('dead repeated title remains');
  if (enabledSourceCount < 20) issues.push('enabled source pool is below 20');
  if (!coverage) issues.push('source coverage report missing');
  if (Number(status.source_success_count || 0) < 8) issues.push('source_success_count below 8');
  if (compactCards < 3) warnings.push(`homepage compact cards below preferred range: ${compactCards}`);
  if (editionItems.length < Number(status.included || 0)) issues.push('edition_items fewer than included stories');
  for (const story of editionItems) {
    if (!story.title || !hasChinese(story.title) || englishWordCount(story.title) >= 5) issues.push(`story title not Chinese-first: ${story.id || story.title}`);
    if (!story.summary || !hasChinese(story.summary)) issues.push(`story summary missing or not Chinese: ${story.id || story.title}`);
    if (!story.janet_take) issues.push(`story missing janet_take: ${story.id || story.title}`);
    if (!story.why_it_matters) issues.push(`story missing why_it_matters: ${story.id || story.title}`);
    if (!story.watch_next) issues.push(`story missing watch_next: ${story.id || story.title}`);
  }
  if (Number(status.source_error_count || 0) > 0) warnings.push('some sources failed; kept as warning because wide pool is resilient');

  return {
    step: '35-R',
    status: issues.length ? 'editorial_system_redesign_blocked' : 'editorial_system_redesigned',
    qa_passed: issues.length === 0,
    daily_title_unique_7d: dailyTitleUnique7d,
    public_engineering_copy_removed: !issues.some((issue) => issue.includes('public engineering')),
    wide_source_pool_passed: enabledSourceCount >= 20,
    enabled_source_count: enabledSourceCount,
    source_success_count: Number(status.source_success_count || 0),
    source_error_count: Number(status.source_error_count || 0),
    homepage_compact_cards: compactCards,
    chinese_first_passed: !issues.some((issue) => issue.includes('Chinese') || issue.includes('summary')),
    edition_items_count: editionItems.length,
    homepage_items_count: homepageItems.length,
    source_coverage_report_exists: Boolean(coverage),
    issues,
    warnings
  };
}

function validateEditorialArchitectureV2(content, summary, edition) {
  const issues = [];
  const architectureCheck = readJson(EDITORIAL_ARCHITECTURE_OUT, null);
  if (!architectureCheck) {
    issues.push('editorial architecture check missing');
  } else {
    if (architectureCheck.latest_edition_id !== edition) issues.push('editorial architecture latest_edition_id mismatch');
    if (architectureCheck.qa_passed !== true) issues.push('editorial architecture qa did not pass');
  }

  if (!Array.isArray(content?.raw_items) || !content.raw_items.length) issues.push('v2 raw_items missing');
  if (!Array.isArray(content?.stories || content?.articles) || !(content.stories || content.articles).length) issues.push('v2 stories/articles missing');
  if (!Array.isArray(content?.modules || content?.topic_modules) || !(content.modules || content.topic_modules).length) issues.push('v2 modules/topic_modules missing');
  if (!content?.cover || !content.cover.cover_title || !content.cover.cover_summary || !content.cover.lead_story_id) issues.push('v2 cover missing');
  if (!content?.homepage || !Array.isArray(content.homepage.compact_news)) issues.push('v2 homepage missing');
  if (!content?.detail || !Array.isArray(content.detail.stories)) issues.push('v2 detail missing');

  if (!(summary?.daily_brief || summary?.daily_title || summary?.title)) issues.push('summary daily_brief/daily_title missing');
  if (!summary?.cover) issues.push('summary cover missing');
  if (!Array.isArray(summary?.modules) || !summary.modules.length) issues.push('summary modules missing');
  if (!Array.isArray(summary?.compact_articles || summary?.homepage_items || summary?.compact_news)) issues.push('summary compact_articles/homepage_items missing');
  return issues;
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
  let editorialRedesign = {
    step: '35-R',
    status: 'editorial_system_redesign_not_applicable',
    qa_passed: true,
    daily_title_unique_7d: true,
    public_engineering_copy_removed: true,
    wide_source_pool_passed: true,
    enabled_source_count: 0,
    homepage_compact_cards: 0,
    chinese_first_passed: true,
    edition_items_count: 0,
    homepage_items_count: 0,
    source_coverage_report_exists: existsSync(SOURCE_COVERAGE),
    issues: [],
    warnings: []
  };

  if (status.status === 'blocked_insufficient_fresh_news') {
    if (status.published !== false) issues.push('blocked run must not publish');
    const manifest = readJson(resolve(ROOT, 'data/MANIFEST.json'), []);
    const latest = manifest[0];
    if (latest) {
      const content = readJson(resolve(ROOT, 'data', latest, 'content.json'), null);
      if (content) {
        editorialQuality = runEditorialQa(content, rules);
        editorialRedesign = runEditorialRedesignQa(content, status, rules, readJson(EDITORIAL_COPY_RULES, { forbidden_public_phrases: [] }));
        issues.push(...editorialQuality.issues);
        issues.push(...editorialRedesign.issues);
      }
    }
  } else if (['published_full_edition', 'published_limited_edition'].includes(status.status)) {
    const edition = status.published_edition_id;
    if (!edition) issues.push('published edition id missing');
    for (const file of ['content.json', 'output.html', 'news-summary.json']) {
      if (!existsSync(resolve(ROOT, 'data', edition, file))) issues.push(`missing ${edition}/${file}`);
    }
    readJson(resolve(ROOT, 'data', edition, 'content.json'));
    const content = readJson(resolve(ROOT, 'data', edition, 'content.json'));
    const summary = readJson(resolve(ROOT, 'data', edition, 'news-summary.json'));
    const html = existsSync(resolve(ROOT, 'data', edition, 'output.html'))
      ? readFileSync(resolve(ROOT, 'data', edition, 'output.html'), 'utf8')
      : '';
    if (!html.trim()) issues.push('output html empty');
    const manifest = readJson(resolve(ROOT, 'data/MANIFEST.json'), []);
    if (manifest[0] !== edition) issues.push('manifest first entry mismatch');
    editorialQuality = runEditorialQa(content, rules);
    editorialRedesign = runEditorialRedesignQa(content, status, rules, readJson(EDITORIAL_COPY_RULES, { forbidden_public_phrases: [] }));
    issues.push(...editorialQuality.issues);
    issues.push(...editorialRedesign.issues);
    issues.push(...validateEditorialArchitectureV2(content, summary, edition));
  } else if (/^dry_run_/.test(status.status || '')) {
    // Dry run is allowed locally; workflow uses non-dry-run mode.
  } else {
    issues.push(`unknown run status: ${status.status}`);
  }

  const experienceFiles = [
    'news.html',
    'scripts/news-archive.js',
    'styles/news-archive.css',
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

  for (const forbidden of ['engineering', 'node_modules']) {
    if (existsSync(resolve(ROOT, forbidden))) issues.push(`forbidden path exists: ${forbidden}`);
  }
  for (const file of walk(ROOT)) {
    const rel = file.replace(`${ROOT}/`, '');
    const base = rel.split('/').pop() || '';
    if (/_pack_.*\.zip$/.test(base) || base === '.env' || /\.env$/.test(base)) issues.push(`forbidden file: ${rel}`);
    if (!textFile(file)) continue;
    const text = readFileSync(file, 'utf8').replace(/const LEAKS = \[[\s\S]*?\];/g, '');
    for (const leak of LEAKS) {
      if (text.includes(leak)) issues.push(`local path leak ${leak} in ${rel}`);
    }
  }

  const result = {
    step: '31',
    status: issues.length ? 'daily_news_automation_blocked' : 'daily_news_automation_ready',
    qa_passed: issues.length === 0,
    schedule_utc: '10 0 * * *',
    schedule_asia_shanghai: '08:10',
    requires_paid_api: false,
    requires_secret: false,
    uses_public_sources: true,
    news_experience_layer_passed: !issues.some((issue) => issue.includes('news experience') || issue.includes('news-index')),
    workflow: '.github/workflows/daily-news-pages.yml',
    generator: '.github/scripts/daily-news-generator.mjs',
    issues
  };

  writeJson(EDITORIAL_REDESIGN_OUT, editorialRedesign);
  writeJson(resolve(ROOT, 'data/daily-news-output-check.json'), result);
  console.log(`status: ${result.status}`);
  if (issues.length) {
    console.error(JSON.stringify({ issues }, null, 2));
    process.exit(1);
  }
}

main();
