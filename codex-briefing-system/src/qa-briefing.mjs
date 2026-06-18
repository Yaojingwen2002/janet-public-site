import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { briefingVol, loadEnv, targetDateFromArg, titleLength } from './lib.mjs';

const FORBIDDEN = [
  '总而言之',
  '在这个瞬息万变的时代',
  'AI 是一把双刃剑',
  '值得关注的是',
  '影响行业格局',
  '补上产品能力',
  '验证具体市场',
  '这条新闻真正的意义',
  '积极布局',
  '赋能',
  '发布了新动作',
  '值得看'
];

const OUTPUT_BLOCKED_TERMS = [
  '事实剥离',
  'JANET:',
  'Janet:'
];

const TREND_FORBIDDEN_OPENERS = [
  '今天的共同主线不是',
  '今天最强的共同信号是'
];

const JANET_TAKE_TEMPLATE_TERMS = [
  '企业交付',
  '流程改造',
  '合规',
  '审计',
  '生态',
  '赋能',
  '升级'
];

const TITLE_PARTICLE_LIMITS = [
  ['ba_particle', /把/, 1],
  ['bei_particle', /被/, 1],
  ['rang_particle', /让/, 1],
  ['kaishi_particle', /开始/, 1]
];

const JANET_TAKE_ROLE_RE = /(中国|国内|创作者|创业者|老板|团队|公司|从业者|开发者|产品|研发|运营|销售|客服|法务|财务|内容|代码|RAG|Agent|模型|工具|安全|教育|医疗|工业|投资人)/i;
const JANET_TAKE_ACTION_RE = /(先|别|要|该|应该|可以|直接|用|做|测|买|接|拿|盯|避开|切|跑|砍|留|投|卖|上|查|准备|优先|停止|放弃|建立)/;

const REQUIRED_COUNTS = {
  news: 5,
  models: 4,
  insights: 4,
  insights2: 3,
  tools: 1
};

const MIN_COVER_BYTES = 20_000;
const MIN_ITEM_IMAGE_BYTES = 1_200;
const MIN_JANET_TAKE_LENGTH = 120;
const MIN_TREND_PARAGRAPHS = 2;
const MAX_TREND_PARAGRAPHS = 3;
const MIN_ITEM_TITLE_LENGTH = 10;
const MAX_ITEM_TITLE_LENGTH = 22;
const TITLE_ACTION_RE = /(发|发布|推出|推|上线|开业|接入|接|整合|合作|融资|完成|收购|开放|限制|限|管理|生成|整理|扩展|押|逼|管|用|给|把|进|上|入场|做|卖|测|开测|运行|面向|支持|治理|控制|变小|变成|加|标|拿|赌|继续|浇|吃|换|试水|成|戴|烧|看|塞|让|写|盯|算|来|按|冲|得|抢|跑|反超|签|签下|签署|组建|推行|推迟|裁员|起诉|调查|批准|否决|罚|投资|并购|买|砸|组|建|秘密|选|禁|停|关|涨|跌|亏|赚|租|交付|募资|领投|开源|闭源|训练|部署|接管|追责|游说)/;
const PURE_HOOK_TITLES = new Set([
  'Agent进厂',
  'Agent要上岗',
  '监控先赚钱',
  '搜索被迫让路',
  '知识层抢位',
  '巨头继续吸钱',
  '微软自研脑',
  '图像也入场',
  'Copilot换芯',
  '小模型反攻',
  '上下文成护城河',
  '权限开始值钱',
  '搜索流量变账单',
  '基础设施吸血',
  '观测层变肥',
  '记忆开始后台跑',
  '治理变控制塔',
  '身份成新防线',
  'AI花钱该刹车'
]);

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
    items.forEach((item, index) => validateItem(item, `${section}[${index}]`, issues, { rootPath, targetDate }));
  }
  validateTitleVariety(content, issues);
  validateJanetTakeVariety(content, issues);

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
  if (parts.length > MAX_TREND_PARAGRAPHS) issues.push(`trend_too_long:${parts.length}>${MAX_TREND_PARAGRAPHS}`);
  const firstParagraph = parts[0] || '';
  for (const opener of TREND_FORBIDDEN_OPENERS) {
    if (firstParagraph.startsWith(opener)) issues.push(`trend_forbidden_opener:${opener}`);
  }
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
  const images = [...new Set(Object.values(content.sections || {}).flatMap((section) =>
    (section?.items || []).map((item) => String(item.image || '').trim()).filter(Boolean)
  ))];
  for (const image of images) {
    if (!html.includes(image)) issues.push(`output_missing_item_image:${image}`);
  }
}

function validateCover(content, { targetDate, rootPath, outputPath }, issues) {
  const cover = content?.cover;
  const expectedImagePath = `runs/${targetDate}/cover.png`;
  if (!cover || typeof cover !== 'object') {
    issues.push('missing_cover');
    return;
  }
  if (!cover.title) {
    issues.push('missing_cover_title');
  } else {
    validateCoverTitleFreshness(cover.title, { targetDate, rootPath }, issues);
    validateCoverTitleStyle(cover.title, { targetDate, rootPath }, issues);
  }
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

function coverTitleStartsAiOrAgent(title) {
  return /^(AI|Agent)\b/i.test(String(title || '').trim());
}

function validateCoverTitleStyle(title, { targetDate, rootPath }, issues) {
  const trimmed = String(title || '').trim();
  const bannedPatterns = [
    [/^Agent\b.*(账单|进账|见血|商业|合同|开始)/i, 'agent_business_pattern'],
    [/^AI\b.*(资产|管制|交付|账单|生态|格局|升级|新阶段|变|进入|开始)/i, 'ai_abstract_pattern']
  ];
  for (const [pattern, label] of bannedPatterns) {
    if (pattern.test(trimmed)) issues.push(`cover_title_banned_pattern:${label}:${title}`);
  }
  if (!coverTitleStartsAiOrAgent(trimmed)) return;

  const siteRoot = resolve(rootPath, '..');
  for (const date of previousDates(targetDate, 5)) {
    const path = resolve(siteRoot, 'data', date, 'content.json');
    if (!existsSync(path)) continue;
    try {
      const previous = JSON.parse(readFileSync(path, 'utf8'));
      const previousTitle = previous?.cover?.title || '';
      if (coverTitleStartsAiOrAgent(previousTitle)) {
        issues.push(`cover_title_repeats_ai_agent_prefix:${title}:${date}`);
        return;
      }
    } catch {}
  }
}

function normalizeTitleForCompare(title) {
  return String(title || '')
    .toLowerCase()
    .replace(/[：:，,。！？!?、；;（）()【】\[\]「」『』《》"'“”‘’\s-]/g, '');
}

function previousDates(dateString, days = 7) {
  const [year, month, day] = dateString.split('-').map(Number);
  const base = Date.UTC(year, month - 1, day);
  return Array.from({ length: days }, (_, index) => {
    const date = new Date(base - (index + 1) * 86400000);
    return date.toISOString().slice(0, 10);
  });
}

function validateCoverTitleFreshness(title, { targetDate, rootPath }, issues) {
  const normalized = normalizeTitleForCompare(title);
  const siteRoot = resolve(rootPath, '..');
  for (const date of previousDates(targetDate)) {
    const path = resolve(siteRoot, 'data', date, 'content.json');
    if (!existsSync(path)) continue;
    try {
      const previous = JSON.parse(readFileSync(path, 'utf8'));
      const previousTitle = previous?.cover?.title || '';
      if (previousTitle && normalizeTitleForCompare(previousTitle) === normalized) {
        issues.push(`cover_title_duplicate_recent:${title}:${date}`);
        return;
      }
    } catch {}
  }
}

function validateItemImage(item, path, issues, { rootPath, targetDate }) {
  const image = String(item.image || '').trim();
  if (!image) {
    issues.push(`missing_item_image:${path}`);
    return;
  }
  if (/^https?:\/\//i.test(image) || image.startsWith('data:')) {
    issues.push(`item_image_not_uploaded:${path}`);
    return;
  }
  const clean = image.replace(/^\.?\//, '');
  if (!clean.startsWith('images/')) {
    issues.push(`item_image_path_invalid:${path}:${image}`);
    return;
  }
  const imagePath = resolve(rootPath, 'runs', targetDate, clean);
  if (!existsSync(imagePath)) {
    issues.push(`missing_item_image_file:${path}:${clean}`);
    return;
  }
  const size = statSync(imagePath).size;
  if (size < MIN_ITEM_IMAGE_BYTES) issues.push(`item_image_too_small:${path}:${size}<${MIN_ITEM_IMAGE_BYTES}`);
}

function validateItem(item, path, issues, context) {
  if (!item || typeof item !== 'object') {
    issues.push(`item_not_object:${path}`);
    return;
  }
  if (!item.title) issues.push(`missing_title:${path}`);
  if (item.title) validateItemTitle(item.title, path, issues);
  const url = item.url || item.link;
  if (!url) issues.push(`missing_url:${path}`);
  if (url && !/^https?:\/\//i.test(url)) issues.push(`invalid_url:${path}`);
  if (!item.source) issues.push(`missing_source:${path}`);
  const content = String(item.content || '');
  if (content) issues.push(`legacy_content_field_present:${path}`);
  if (!item.body) issues.push(`missing_body:${path}`);
  if (item.body && /(破防点|槽点|搞钱)[:：]/.test(String(item.body))) {
    issues.push(`body_contains_janet_take_label:${path}`);
  }
  validateItemImage(item, path, issues, context);
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
    if (!JANET_TAKE_ROLE_RE.test(janetTake)) {
      issues.push(`janet_take_missing_role_or_scene:${path}`);
    }
    if (!JANET_TAKE_ACTION_RE.test(janetTake)) {
      issues.push(`janet_take_missing_actionable_advice:${path}`);
    }
  }
}

function validateItemTitle(title, path, issues) {
  const length = titleLength(title);
  if (length < MIN_ITEM_TITLE_LENGTH) issues.push(`title_too_short:${path}:${title}`);
  if (length > MAX_ITEM_TITLE_LENGTH) issues.push(`title_too_long:${path}:${title}`);
  const compact = String(title || '').replace(/\s+/g, '');
  if (PURE_HOOK_TITLES.has(compact)) issues.push(`title_pure_hook:${path}:${title}`);
  if (!TITLE_ACTION_RE.test(title)) issues.push(`title_missing_action:${path}:${title}`);
}

function validateTitleVariety(content, issues) {
  const titles = Object.values(content.sections || {}).flatMap((section) =>
    (section?.items || []).map((item) => String(item.title || '').trim()).filter(Boolean)
  );
  if (titles.length < 8) return;
  const colonCount = titles.filter((title) => /[：:]/.test(title)).length;
  if (colonCount > Math.ceil(titles.length * 0.65)) {
    issues.push(`title_style_too_repetitive:colon_template:${colonCount}/${titles.length}`);
  }
  for (const [label, pattern, limit] of TITLE_PARTICLE_LIMITS) {
    const count = titles.filter((title) => pattern.test(title)).length;
    if (count > limit) issues.push(`title_particle_overused:${label}:${count}>${limit}`);
  }
  const repeatedPatterns = [
    ['ba_sentence', /把.+(进|给|上|送|塞|压)/],
    ['rang_sentence', /让.+(进|入|带)/],
    ['bei_sentence', /被.+(盯|按|推|拖)/],
    ['kaishi_sentence', /开始/]
  ];
  for (const [label, pattern] of repeatedPatterns) {
    const count = titles.filter((title) => pattern.test(title)).length;
    if (count > 2) issues.push(`title_pattern_repeated:${label}:${count}`);
  }
}

function validateJanetTakeVariety(content, issues) {
  const takes = Object.values(content.sections || {}).flatMap((section) =>
    (section?.items || []).map((item) => String(item.janet_take || '').trim()).filter(Boolean)
  );
  if (!takes.length) return;

  const weakOpeningCount = takes.filter((take) => /^(这|这种|这类|这个|这条|这件事|这比|这就是)/.test(take)).length;
  if (weakOpeningCount > 2) issues.push(`janet_take_weak_opening_repeated:${weakOpeningCount}`);

  const repeatedSentencePatterns = [
    ['not_but_sentence', /不是[^。！？]*而是|不是[^。！？]*，是|不是[^。！？]*是/],
    ['real_x_sentence', /真正(难|贵|该|要|能|的|看|值得|问题)/]
  ];
  for (const [label, pattern] of repeatedSentencePatterns) {
    const count = takes.filter((take) => pattern.test(take)).length;
    if (count > 3) issues.push(`janet_take_sentence_pattern_repeated:${label}:${count}`);
  }

  const templateTermCount = takes.filter((take) =>
    JANET_TAKE_TEMPLATE_TERMS.some((term) => take.includes(term))
  ).length;
  if (templateTermCount > 3) issues.push(`janet_take_template_terms_overused:${templateTermCount}`);
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
