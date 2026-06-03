import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { briefingVol, loadEnv, targetDateFromArg, titleLength } from './lib.mjs';

const FORBIDDEN = [
  '总而言之',
  '在这个瞬息万变的时代',
  'AI 是一把双刃剑',
  '值得关注',
  '值得关注的是',
  '值得进一步观察',
  '影响行业格局',
  '补上产品能力',
  '验证具体市场',
  '接口、权限、评测或采购路径'
];

const OUTPUT_BLOCKED_TERMS = [
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

const MIN_COVER_BYTES = 20_000;
const MIN_JANET_TAKE_LENGTH = 120;
const MIN_TREND_PARAGRAPHS = 3;

export function validateBriefing(content, { date, rootPath = resolve(new URL('..', import.meta.url).pathname), outputPath } = {}) {
  const issues = [];
  const targetDate = date || content.date;
  if (!content || typeof content !== 'object') issues.push('content_not_object');
  if (content.date !== targetDate) issues.push(`date_mismatch:${content.date || 'missing'}!=${targetDate}`);
  const expectedVol = String(briefingVol(targetDate));
  const actualVol = String(content.vol || '').replace(/^第|期$/g, '');
  if (actualVol !== expectedVol) issues.push(`vol_mismatch:${actualVol || 'missing'}!=${expectedVol}`);
  if (!content.intro_text) issues.push('missing_intro_text');
  validateTrend(content.trend, issues);
  validateCover(content, { targetDate, rootPath, outputPath }, issues);
  if (!content.sections || typeof content.sections !== 'object') issues.push('missing_sections');

  for (const [section, count] of Object.entries(REQUIRED_COUNTS)) {
    const items = content.sections?.[section]?.items;
    if (!Array.isArray(items)) {
      issues.push(`missing_section:${section}`);
      continue;
    }
    if (items.length !== count) issues.push(`section_count:${section}:${items.length}!=${count}`);
    items.forEach((item, index) => validateItem(item, `${section}[${index}]`, issues));
  }

  const allText = JSON.stringify(content);
  for (const phrase of FORBIDDEN) {
    if (allText.includes(phrase)) issues.push(`forbidden_phrase:${phrase}`);
  }
  for (const phrase of OUTPUT_BLOCKED_TERMS) {
    if (allText.includes(phrase)) issues.push(`blocked_publishing_term_in_content:${phrase}`);
  }

  validateOutputHtml(content, { outputPath }, issues);

  return {
    ok: issues.length === 0,
    issues
  };
}

function sentenceCount(text) {
  return String(text || '').split(/[。！？!?]\s*/).map((part) => part.trim()).filter(Boolean).length;
}

function validateTrend(trend, issues) {
  const parts = String(trend || '').split(/\n{2,}/).map((part) => part.trim()).filter(Boolean);
  if (parts.length < MIN_TREND_PARAGRAPHS) issues.push(`trend_too_thin:${parts.length}<${MIN_TREND_PARAGRAPHS}`);
}

function validateOutputHtml(content, { outputPath }, issues) {
  if (!outputPath) return;
  if (!existsSync(outputPath)) {
    issues.push('missing_output_html');
    return;
  }
  const html = readFileSync(outputPath, 'utf8');
  for (const phrase of OUTPUT_BLOCKED_TERMS) {
    if (html.includes(phrase)) issues.push(`blocked_publishing_term_in_output:${phrase}`);
  }
  if (!html.includes('Janet 锐评：')) issues.push('output_missing_janet_take_label');
  if (!html.includes('今日趋势')) issues.push('output_missing_trend');
  if (!html.includes('trend-card')) issues.push('output_missing_trend_card');
  if (!/DATA SOURCES:\s*(?!HACKER NEWS, TECHCRUNCH, ARXIV, GITHUB TRENDING)/.test(html)) {
    issues.push('output_static_or_missing_data_sources');
  }
  const sources = [...new Set(Object.values(content.sections || {}).flatMap((section) =>
    (section?.items || []).map((item) => String(item.source || '').trim()).filter(Boolean)
  ))];
  for (const source of sources) {
    if (!html.includes(source)) issues.push(`output_missing_source:${source}`);
  }
}

function validateCover(content, { targetDate, rootPath, outputPath }, issues) {
  const cover = content?.cover;
  const expectedImagePath = `runs/${targetDate}/cover.png`;
  if (!cover || typeof cover !== 'object') {
    issues.push('missing_cover');
    return;
  }
  if (!cover.title) issues.push('missing_cover_title');
  if (!cover.subtitle) issues.push('missing_cover_subtitle');
  if (!cover.image_prompt) issues.push('missing_cover_image_prompt');
  if (!cover.image_path) {
    issues.push('missing_cover_image_path');
  } else if (cover.image_path !== expectedImagePath) {
    issues.push(`cover_image_path_mismatch:${cover.image_path}!=${expectedImagePath}`);
  }

  const coverPath = resolve(rootPath, expectedImagePath);
  if (!existsSync(coverPath)) {
    issues.push(`missing_cover_png:${expectedImagePath}`);
  } else {
    const size = statSync(coverPath).size;
    if (size < MIN_COVER_BYTES) issues.push(`cover_png_too_small:${size}<${MIN_COVER_BYTES}`);
  }

  if (!outputPath) return;
  if (!existsSync(outputPath)) {
    issues.push('missing_output_html');
    return;
  }
  const html = readFileSync(outputPath, 'utf8');
  if (!html.includes('data-janet-cover="true"')) issues.push('output_missing_cover_section');
  if (!html.includes('cover.png')) issues.push('output_missing_cover_image');
  if (!html.includes(String(cover.title || ''))) issues.push('output_missing_cover_title');
}

function validateItem(item, path, issues) {
  if (!item || typeof item !== 'object') {
    issues.push(`item_not_object:${path}`);
    return;
  }
  if (!item.title) issues.push(`missing_title:${path}`);
  if (item.title && titleLength(item.title) > 15) issues.push(`title_too_long:${path}:${item.title}`);
  const url = item.url || item.link;
  if (!url) issues.push(`missing_url:${path}`);
  if (url && !/^https?:\/\//i.test(url)) issues.push(`invalid_url:${path}`);
  if (!item.source) issues.push(`missing_source:${path}`);
  const content = String(item.content || '');
  if (content) issues.push(`legacy_content_field_present:${path}`);
  if (!item.body) issues.push(`missing_body:${path}`);
  if (!item.janet_take) {
    issues.push(`missing_janet_take:${path}`);
  } else {
    const janetTake = String(item.janet_take);
    if ([...janetTake].length < MIN_JANET_TAKE_LENGTH) {
      issues.push(`janet_take_too_short:${path}`);
    }
    if (sentenceCount(janetTake) < 3) {
      issues.push(`janet_take_missing_three_layers:${path}`);
    }
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const root = resolve(new URL('..', import.meta.url).pathname);
  loadEnv(resolve(root, '.env'));
  const date = targetDateFromArg();
  const contentPath = process.env.RUN_CONTENT_PATH || resolve(root, 'runs', date, 'content.json');
  const outputPath = process.env.RUN_OUTPUT_PATH || resolve(root, 'runs', date, 'output.html');
  const content = JSON.parse(readFileSync(contentPath, 'utf8'));
  const result = validateBriefing(content, { date, rootPath: root, outputPath });
  if (!result.ok) {
    console.error(JSON.stringify(result, null, 2));
    process.exit(1);
  }
  console.log(JSON.stringify({ status: 'briefing_qa_ready', date, issues: 0 }, null, 2));
}
