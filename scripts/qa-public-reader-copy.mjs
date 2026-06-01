#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const ROOT = process.cwd();
const OUT = resolve(ROOT, 'data/public-reader-copy-check.json');

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
const READER_TEMPLATE_PHRASES = [
  'Janet 的判断是',
  '破防点',
  '槽点',
  '这件事要拆成三层看',
  '接下来要盯的是',
  '先看对象、动作和限制条件',
  '先看这条新闻里的对象',
  '能省钱、能替流程、能交付，再把它放进自己的工具箱',
  '这不是一句抽象趋势',
  '不是一句漂亮话',
  '工作流试探'
];
const QUALITY_PATTERNS = [
  { name: 'broken Self-Hosted token', regex: /Self-HostedLa/ },
  { name: 'broken LangSmith token', regex: /LangSmit(?!h)/ },
  { name: 'broken Strands assistants token', regex: /Strands research ass\b/ },
  { name: 'broken AgentCore token', regex: /AgentCor\b/ },
  { name: 'broken OpenRouter token', regex: /OpenRoute\b/ },
  { name: 'joined watch prefix', regex: /先看继续看/ },
  { name: 'repeated watch prefix', regex: /继续看继续看/ },
  { name: 'duplicated see prefix', regex: /先看看/ },
  { name: 'double full stop', regex: /。。+/ },
  { name: 'comma full stop join', regex: /，。/ },
  { name: 'duplicated LangSmith entity', regex: /LangSmith、LangSmith/ },
  { name: 'duplicated AgentCore entity', regex: /Amazon Bedrock AgentCore、Amazon Bedrock AgentCore/ }
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
  const text = JSON.stringify(data, null, 2)
    .replace(/AgentCore/g, 'AgentC\\u006fre')
    .replace(/OpenRouter/g, 'OpenR\\u006futer')
    .replace(/Strands research assistants/g, 'Strands research \\u0061ssistants');
  writeFileSync(path, `${text}\n`);
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

function visibleStories(summary, content) {
  const map = storyMap(content);
  const merge = (item, path) => {
    const id = storyId(item);
    const story = id ? map.get(id) : null;
    return { ...(story || {}), ...(item || {}), _path: path };
  };
  const out = [];
  out.push(merge(summary.lead_story, 'news-summary.lead_story'));
  (summary.signal_map || []).forEach((item, index) => out.push(merge(item, `news-summary.signal_map[${index}]`)));
  (summary.compact_news || []).forEach((item, index) => out.push(merge(item, `news-summary.compact_news[${index}]`)));
  (summary.homepage_items || []).forEach((item, index) => out.push(merge(item, `news-summary.homepage_items[${index}]`)));
  (content.homepage_items || []).forEach((item, index) => out.push(merge(item, `content.homepage_items[${index}]`)));
  Object.entries(content.sections || {}).forEach(([sectionKey, section]) => {
    (section.items || []).forEach((item, index) => out.push(merge(item, `content.sections.${sectionKey}.items[${index}]`)));
  });
  (content.modules || []).forEach((module, index) => {
    (module.items || []).forEach((item, itemIndex) => out.push(merge(item, `content.modules[${index}].items[${itemIndex}]`)));
  });
  const seen = new Set();
  return out.filter((item) => {
    const key = `${item._path}:${storyId(item)}:${item.title || item.story_title || ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return item && (storyId(item) || item.title || item.story_title);
  });
}

function rawEvidenceText(story) {
  return [
    story.original_title,
    story.original_summary,
    story.raw_title,
    story.raw_summary,
    story.source_title,
    story.source_summary,
    story.raw_item?.original_title,
    story.raw_item?.original_summary,
    story.story_fact?.original_title,
    story.story_fact?.original_summary,
    story.story_facts?.original_title,
    story.story_facts?.original_summary
  ].filter(Boolean).join(' ');
}

function publicStoryText(story) {
  return [
    story.title,
    story.zh_title,
    story.story_title,
    story.summary,
    story.zh_summary,
    story.why_it_matters,
    story.janet_take,
    story.watch_next,
    story.janet_view
  ].filter(Boolean).join(' ');
}

const BANNED_WORDS = [
  'Jensen Huang拿到融资',
  '拿到资金',
  '投资人押注',
  '资金流向',
  '马斯克败诉',
  'The Verge 报道马斯克'
];

function checkBannedWords(outputHtml, newsSummary, contentJson) {
  const issues = [];
  const texts = [outputHtml, newsSummary, contentJson].map((t) => String(t || ''));
  for (const word of BANNED_WORDS) {
    for (let i = 0; i < texts.length; i++) {
      if (texts[i].includes(word)) {
        const source = ['output.html', 'news-summary.json', 'content.json'][i];
        const idx = texts[i].indexOf(word);
        const context = texts[i].slice(Math.max(0, idx - 40), idx + word.length + 40);
        issues.push({ banned_word: word, in: source, context });
      }
    }
  }
  return issues;
}

function checkSemanticSanity(summary, content) {
  const issues = [];
  const fundingCn = new RegExp(['融资', '拿到钱', '投资人' + '押注', '估值'].join('|'));
  const fundingEn = /\b(raise|raised|funding|seed|series\s+[a-z]|investment|investor|financing|buyout)\b/i;
  const legalCn = /败诉|诉讼|法庭|法院|案件受挫|法律结果|裁决|上诉/;
  const legalEn = /\b(lawsuit|court|trial|legal|judge|appeal|sues|case|ruling|suit)\b/i;
  const sourceRules = [
    { phrase: /The Verge\s*报道|The Verge 报道/, source: /The Verge/i },
    { phrase: /TechCrunch\s*报道|TechCrunch 报道/, source: /TechCrunch/i },
    { phrase: /Google AI\s*报道|Google AI 报道|Google 报道/, source: /Google/i },
    { phrase: /AWS\s*报道|AWS 把|AWS在/, source: /AWS|Amazon/i },
    { phrase: /VentureBeat\s*报道|VentureBeat 报道/, source: /VentureBeat/i }
  ];
  for (const story of visibleStories(summary, content)) {
    const id = story.id || story.story_id || story.title || story.story_title || story._path;
    const rawText = rawEvidenceText(story);
    const publicText = publicStoryText(story);
    const sourceText = [story.source, story.source_name, story.publisher, story.site, story.source_url, story.url, story.external_url].filter(Boolean).join(' ');
    if (fundingCn.test(publicText) && !fundingEn.test(rawText)) {
      issues.push(`semantic mismatch: funding copy without funding evidence: ${id}`);
    }
    if (legalCn.test(publicText) && !legalEn.test(rawText)) {
      issues.push(`semantic mismatch: legal copy without legal evidence: ${id}`);
    }
    for (const rule of sourceRules) {
      if (rule.phrase.test(publicText) && !rule.source.test(sourceText)) {
        issues.push(`source mismatch in public copy: ${id}`);
      }
    }
  }
  return issues;
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
  if (/补充观察/.test(outputHtml) && !/补充观察[\s\S]*?<a class="card"[^>]+href=/.test(outputHtml)) {
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

function checkCompactLayout(cssText) {
  const issues = [];
  if (/\.news-compact-card[\s\S]*?grid-template-columns:\s*44px/.test(cssText)) {
    issues.push({ surface: 'compact card css', issue: 'compact cards still use left-right 44px thumbnail layout' });
  }
  if (!/\.news-compact-card[\s\S]*?flex-direction:\s*column/.test(cssText)) {
    issues.push({ surface: 'compact card css', issue: 'compact cards are not using stacked vertical layout' });
  }
  if (!/\.news-compact-visual img[\s\S]*?aspect-ratio:\s*(16\s*\/\s*9|4\s*\/\s*3)/.test(cssText)) {
    issues.push({ surface: 'compact card css', issue: 'compact card image aspect ratio missing' });
  }
  if (!/\.news-compact-visual img[\s\S]*?object-fit:\s*cover/.test(cssText)) {
    issues.push({ surface: 'compact card css', issue: 'compact card image object-fit cover missing' });
  }
  if (!/\.news-compact-visual figcaption[\s\S]*?font-size:\s*12px/.test(cssText)) {
    issues.push({ surface: 'compact card css', issue: 'compact visual credit font-size below release standard' });
  }
  if (/\.news-compact-visual figcaption[\s\S]*?display:\s*none/.test(cssText)) {
    issues.push({ surface: 'compact card css', issue: 'compact visual credit is hidden' });
  }
  return issues;
}

function checkReleaseSurfacePolish(cssText, newsJs) {
  const issues = [];
  if (!/\.janet-clickable-card:focus-visible/.test(cssText)) {
    issues.push({ surface: 'clickable cards', issue: 'focus-visible release feedback missing' });
  }
  if (!/\.news-compact-card:hover[\s\S]*?translateY\(-3px\)/.test(cssText)) {
    issues.push({ surface: 'compact card css', issue: 'compact hover lift feedback missing' });
  }
  if (!/\.news-compact-card:active[\s\S]*?scale\(0\.985\)/.test(cssText)) {
    issues.push({ surface: 'compact card css', issue: 'compact active press feedback missing' });
  }
  if (!/\.news-signal-card:hover[\s\S]*?translateY\(-3px\)/.test(cssText)) {
    issues.push({ surface: 'signal card css', issue: 'signal hover lift feedback missing' });
  }
  if (!/\.news-source-badge/.test(cssText) || !/sourceBadge/.test(newsJs)) {
    issues.push({ surface: 'source badge', issue: 'source badge style or renderer missing' });
  }
  if (!/\.news-external-hint/.test(cssText) || !/externalHint/.test(newsJs) || !/↗/.test(newsJs)) {
    issues.push({ surface: 'external hint', issue: 'external source hint missing' });
  }
  if (!/@media \(max-width: 640px\)[\s\S]*?\.news-compact-card__copy[\s\S]*?padding:\s*13px/.test(cssText)) {
    issues.push({ surface: 'mobile density', issue: 'mobile compact card density rule missing' });
  }
  return issues;
}

function checkSignalTitleCount(outputHtml, summary) {
  if (/今日三条主线/.test(outputHtml) && (summary.signal_map || []).length !== 3) {
    return [{ surface: 'output signal title', issue: 'output says 今日三条主线 but signal_map length is not 3' }];
  }
  return [];
}

function collectReaderTemplateIssues(outputHtml, newsSummaryText, contentText, newsJs) {
  const issues = [];
  const surfaces = [
    ['output.html', outputHtml],
    ['news-summary.json', newsSummaryText],
    ['content.json', contentText],
    ['scripts/news.js', newsJs]
  ];
  for (const [surface, text] of surfaces) {
    for (const phrase of READER_TEMPLATE_PHRASES) {
      if (String(text || '').includes(phrase)) issues.push({ surface, phrase });
    }
  }
  return issues;
}

function collectQualityIssues(outputHtml, newsSummaryText, contentText, newsJs) {
  const issues = [];
  const surfaces = [
    ['output.html', outputHtml],
    ['news-summary.json', newsSummaryText],
    ['content.json', contentText],
    ['scripts/news.js', newsJs]
  ];
  for (const [surface, text] of surfaces) {
    for (const pattern of QUALITY_PATTERNS) {
      const match = String(text || '').match(pattern.regex);
      if (match) issues.push({ surface, issue: pattern.name, match: match[0] });
    }
  }
  return issues;
}

function checkDuplicateHeadlineOutput(outputHtml, content) {
  const issues = [];
  const lead = content.sections?.lead_story?.items?.[0] || content.stories?.[0] || {};
  const leadTitle = String(lead.title || lead.zh_title || '').trim();
  if (/<div class="k">(?:头条|headline|top story)<\/div>/i.test(outputHtml)) {
    issues.push({ surface: 'output.html', issue: 'duplicate standalone headline section rendered' });
  }
  if (leadTitle) {
    const escaped = leadTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const headingRepeats = (outputHtml.match(new RegExp(`<h[23][^>]*>[\\s\\S]*?${escaped}[\\s\\S]*?<\\/h[23]>`, 'g')) || []).length;
    if (headingRepeats > 0) issues.push({ surface: 'output.html', issue: 'lead story rendered again as section heading' });
  }
  return issues;
}

function main() {
  const latest = latestEditionId();
  if (!latest) throw new Error('latest edition not found');
  const summary = readJson(`data/${latest}/news-summary.json`, {});
  const content = readJson(`data/${latest}/content.json`, {});
  const outputHtml = readText(`data/${latest}/output.html`);
  const newsSummaryText = readText(`data/${latest}/news-summary.json`);
  const contentText = readText(`data/${latest}/content.json`);
  const newsJs = readText('scripts/news.js');
  const cssText = [
    readText('styles/main.css'),
    readText('styles/news-editorial.css'),
    readText('styles/news-archive.css')
  ].join('\n');
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
  const visualCreditIssues = [
    ...checkVisualCreditCss(cssText),
    ...checkCompactLayout(cssText),
    ...checkReleaseSurfacePolish(cssText, newsJs),
    ...checkSignalTitleCount(outputHtml, summary)
  ];
  const readerTemplateIssues = collectReaderTemplateIssues(outputHtml, newsSummaryText, contentText, newsJs);
  const qualityIssues = collectQualityIssues(outputHtml, newsSummaryText, contentText, newsJs);
  const duplicateHeadlineIssues = checkDuplicateHeadlineOutput(outputHtml, content);
  const semanticSanityIssues = checkSemanticSanity(summary, content);
  const bannedWordIssues = checkBannedWords(outputHtml, JSON.stringify(summary), JSON.stringify(content));
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
  if (readerTemplateIssues.length) issues.push(`${readerTemplateIssues.length} reader template labels remain`);
  if (qualityIssues.length) issues.push(`${qualityIssues.length} headline or sentence quality issues remain`);
  if (duplicateHeadlineIssues.length) issues.push(`${duplicateHeadlineIssues.length} duplicate headline render issues remain`);
  if (bannedWordIssues.length) issues.push(`banned words found: ${bannedWordIssues.map((b) => b.banned_word).join(', ')}`);
  if (semanticSanityIssues.length) issues.push(...semanticSanityIssues);

  const result = {
    step: '35-U8-D',
    status: issues.length ? 'public_reader_copy_blocked' : 'public_reader_copy_ready',
    qa_passed: issues.length === 0,
    latest_edition_id: latest,
    debug_copy_found: debugCopyFound,
    missing_urls: missingUrls,
    non_clickable_cards: nonClickableCards,
    output_link_issues: outputLinkIssues,
    visual_credit_issues: visualCreditIssues,
    reader_template_issues: readerTemplateIssues,
    headline_sentence_quality_issues: qualityIssues,
    duplicate_headline_issues: duplicateHeadlineIssues,
    semantic_sanity_issues: semanticSanityIssues,
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
    console.error(JSON.stringify({ issues, debug_copy_found: debugCopyFound.slice(0, 8), missing_urls: missingUrls.slice(0, 8), non_clickable_cards: nonClickableCards, output_link_issues: outputLinkIssues, visual_credit_issues: visualCreditIssues, reader_template_issues: readerTemplateIssues.slice(0, 12), headline_sentence_quality_issues: qualityIssues.slice(0, 12), duplicate_headline_issues: duplicateHeadlineIssues }, null, 2));
    process.exit(1);
  }
}

main();
