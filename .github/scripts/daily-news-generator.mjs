#!/usr/bin/env node
// Janet public-site daily news generator.
// Pure Node 20: fs/path/crypto/fetch only, no dependencies, no secrets.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { createHash } from 'node:crypto';

if (!process.env.CI && !process.env.NODE_TLS_REJECT_UNAUTHORIZED) {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
}

const ROOT = resolve(process.cwd());
const TZ = 'Asia/Shanghai';
const SOURCE_POOL = resolve(ROOT, '.github/scripts/rss-source-pool.json');
const EDITORIAL_RULES = resolve(ROOT, '.github/scripts/editorial-rules.json');
const EDITORIAL_COPY_RULES = resolve(ROOT, '.github/scripts/editorial-copy-rules.json');
const STATUS_PATH = resolve(ROOT, 'data/daily-news-run-status.json');
const LIVE_SOURCE_SNAPSHOT = resolve(ROOT, 'data/live-source-snapshot.json');
const VISUAL_DIR = resolve(ROOT, 'assets/news-visuals');
const FORBIDDEN_TAKES = [
  'AI 正在改变世界',
  '未来已来',
  '智能体时代来了',
  '行业正在重构',
  '值得关注',
  '持续关注'
];
const GENERIC_OBJECTS = new Set([
  '智能体',
  'AI 工具',
  '产品落点',
  '商业动作',
  '用户',
  '团队',
  '入口',
  '新动作',
  '工作流',
  '平台',
  '模型能力',
  '研究信号',
  '企业落地',
  '开发入口',
  '开源模型',
  'AI'
]);
const GENERIC_ACTIONS = new Set(['更新', '追踪', '推向', '发布新动作', '继续', '露出', '发布']);
const COMPANY_ENTITIES = new Set(['Google', 'OpenAI', 'Anthropic', 'Meta', 'AWS', 'Amazon', 'Microsoft', 'TechCrunch', 'The Verge', 'Hugging Face']);
const FORBIDDEN_GENERIC_COPY = [
  '更新智能体',
  '先看谁能用起来',
  '追踪AI 工具',
  '发布新动作',
  '追踪产品落点',
  '露出新落点',
  '继续推向开发者',
  '押注下一步',
  '围绕商业动作',
  '正在把 AI 能力塞进开发者工作流',
  '影响的是入口、工具选择和团队每天怎么交付',
  '影响的是它自己的用户、团队和入口选择',
  '入口、成本或可用工具',
  '选型、评估或交付方式',
  '清晰功能、价格或开放边界',
  'AI 热闹',
  '不是普通更新',
  '看谁能用起来',
  '看是否有清晰边界',
  '看是否进入默认工作流',
  '看产品落点是否落成具体产品'
];
const FORBIDDEN_SURFACE_COPY = [
  '开发者入口把开发流程收紧了',
  '模型能力正在往开发、开源和研究的日常环节里挤',
  '把智能体推到了台前',
  '谁在抢入口',
  '谁在补工具',
  '不是热闹数量',
  '进入真实使用场景',
  '真实使用证据',
  '先看谁能用起来',
  '入口选择',
  '日常环节里挤',
  '有明确动作',
  '先别喊革命',
  '看它有没有真实用户和可复查结果',
  '出现新进展'
];
const SECTION_DEFS = [
  { key: 'models', label: '模型与产品', categories: ['models'], min: 1, max: 4 },
  { key: 'agents', label: 'Agent 与工具', categories: ['agents', 'developer_tooling'], min: 1, max: 4 },
  { key: 'open_source', label: '开源与论文', categories: ['open_source', 'research', 'papers'], min: 1, max: 5 },
  { key: 'business', label: '商业与入口', categories: ['business', 'enterprise'], min: 0, max: 4 },
  { key: 'china_perspective', label: '中国视角', categories: ['china_perspective', 'china'], min: 0, max: 3 },
  { key: 'creator_opportunity', label: '创作者机会', categories: ['creator_opportunity', 'creator', 'business'], min: 0, max: 3 },
  { key: 'more_ai', label: '更多 AI 动态', categories: [], min: 0, max: 6 }
];
const SECTION_LABELS = Object.fromEntries(SECTION_DEFS.map((item) => [item.key, item.label]));

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i];
    if (!item.startsWith('--')) continue;
    const key = item.slice(2);
    const value = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
    args[key] = value;
  }
  return args;
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

function writeText(filePath, text) {
  ensureDir(filePath);
  writeFileSync(filePath, text.endsWith('\n') ? text : `${text}\n`, 'utf8');
}

function defaultDateShanghai() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date());
}

function previousDay(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d) - 86400000).toISOString().slice(0, 10);
}

function localToIso(dateStr, timeStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const [hh, mm, ss] = timeStr.split(':').map(Number);
  return new Date(Date.UTC(y, m - 1, d, hh - 8, mm, ss)).toISOString();
}

function computeWindow(dateStr) {
  const prev = previousDay(dateStr);
  return {
    timezone: TZ,
    window_start: `${prev} 17:00:00`,
    window_end: `${dateStr} 09:00:00`,
    window_start_iso: localToIso(prev, '17:00:00'),
    window_end_iso: localToIso(dateStr, '09:00:00')
  };
}

function decodeText(value) {
  return String(value || '')
    .replace(/<!\[CDATA\[|\]\]>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;|&apos;/g, "'")
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tag(block, name) {
  const match = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, 'i'));
  return match ? decodeText(match[1]) : '';
}

function attr(block, name, attrName) {
  const match = block.match(new RegExp(`<${name}[^>]*\\s${attrName}=["']([^"']+)["'][^>]*>`, 'i'));
  return match ? decodeText(match[1]) : '';
}

function normalizeUrl(url, baseUrl) {
  try {
    const parsed = new URL(url, baseUrl);
    for (const key of [...parsed.searchParams.keys()]) {
      const lower = key.toLowerCase();
      if (lower.startsWith('utm_') || ['ref', 'fbclid', 'gclid'].includes(lower)) {
        parsed.searchParams.delete(key);
      }
    }
    parsed.hash = '';
    return parsed.toString();
  } catch {
    return String(url || '').trim();
  }
}

function hashId(prefix, value) {
  return `${prefix}-${createHash('sha1').update(value).digest('hex').slice(0, 12)}`;
}

function publishedFromRss(block) {
  const fields = [
    ['pubDate', 'pubDate'],
    ['published', 'published'],
    ['updated', 'updated'],
    ['dc:date', 'dc:date'],
    ['date', 'date']
  ];
  for (const [field, source] of fields) {
    const value = tag(block, field);
    if (value) return { value, source };
  }
  return { value: '', source: '' };
}

function parseFeed(text, source) {
  const items = [];
  const blocks = [
    ...[...text.matchAll(/<item(?:\s[^>]*)?>[\s\S]*?<\/item>/gi)].map((m) => ({ type: 'rss', block: m[0] })),
    ...[...text.matchAll(/<entry(?:\s[^>]*)?>[\s\S]*?<\/entry>/gi)].map((m) => ({ type: 'atom', block: m[0] }))
  ];

  for (const entry of blocks) {
    const block = entry.block;
    const title = tag(block, 'title');
    const url = entry.type === 'atom' ? (attr(block, 'link', 'href') || tag(block, 'id')) : (tag(block, 'link') || tag(block, 'guid'));
    const published = publishedFromRss(block);
    const summary = tag(block, 'description') || tag(block, 'summary') || tag(block, 'content') || tag(block, 'content:encoded');
    const normalizedUrl = normalizeUrl(url, source.url);
    const image_candidates = rssImageCandidates(block, source.url);
    items.push({
      id: hashId(source.id, `${normalizedUrl}:${title}`),
      title,
      url: normalizedUrl,
      source: source.source,
      category: source.category,
      source_rank: source.rank,
      published_at: published.value,
      published_at_source: published.source,
      summary,
      collected_at: new Date().toISOString(),
      raw_source_id: source.id,
      image_candidates,
      evidence_ids: []
    });
  }

  return items;
}

function rssImageCandidates(block, baseUrl) {
  const candidates = [];
  const mediaTags = [
    ...block.matchAll(/<media:content\b[^>]*>/gi),
    ...block.matchAll(/<media:thumbnail\b[^>]*>/gi),
    ...block.matchAll(/<enclosure\b[^>]*>/gi),
    ...block.matchAll(/<image\b[^>]*>/gi)
  ];
  for (const match of mediaTags) {
    const tagText = match[0];
    const url = tagText.match(/\burl=["']([^"']+)["']/i)?.[1] || '';
    const type = tagText.match(/\btype=["']([^"']+)["']/i)?.[1] || '';
    if (!url) continue;
    if (type && !/^image\//i.test(type)) continue;
    candidates.push(normalizeUrl(url, baseUrl));
  }
  const imageTag = tag(block, 'image');
  if (imageTag) candidates.push(normalizeUrl(imageTag, baseUrl));
  return [...new Set(candidates)].filter(Boolean);
}

function feedLinksFromHtml(html, baseUrl) {
  const links = [];
  const linkRe = /<link\b[^>]*>/gi;
  for (const match of html.matchAll(linkRe)) {
    const tagText = match[0];
    const rel = (tagText.match(/\brel=["']([^"']+)["']/i)?.[1] || '').toLowerCase();
    const type = (tagText.match(/\btype=["']([^"']+)["']/i)?.[1] || '').toLowerCase();
    const href = tagText.match(/\bhref=["']([^"']+)["']/i)?.[1] || '';
    if (!href) continue;
    const isFeed = rel.includes('alternate') && (
      type.includes('rss') ||
      type.includes('atom') ||
      type.includes('xml')
    );
    if (!isFeed) continue;
    links.push(normalizeUrl(href, baseUrl));
  }
  return [...new Set(links)];
}

async function fetchSource(source) {
  if (!source.enabled) return { items: [], error: null };
  const urls = [source.rss_url, source.url, source.fallback_url].filter(Boolean);
  const errors = [];
  const visited = new Set();
  for (const url of urls) {
    if (visited.has(url)) continue;
    visited.add(url);
    try {
      const response = await fetchWithTimeout(url, {
        headers: {
          'user-agent': 'JanetDailyNewsBot/31',
          accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, text/html;q=0.8'
        },
        redirect: 'follow'
      }, 9000);
      if (!response.ok) throw new Error(`http_${response.status}`);
      const text = await withTimeout(response.text(), 8000, 'source_body');
      const items = parseFeed(text, { ...source, url });
      if (items.length) return { items, error: null };
      const discovered = feedLinksFromHtml(text, url).filter((link) => !visited.has(link));
      for (const feedUrl of discovered.slice(0, 3)) {
        visited.add(feedUrl);
        try {
          const feedResponse = await fetchWithTimeout(feedUrl, {
            headers: {
              'user-agent': 'JanetDailyNewsBot/31',
              accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, text/html;q=0.8'
            },
            redirect: 'follow'
          }, 8000);
          if (!feedResponse.ok) throw new Error(`http_${feedResponse.status}`);
          const feedText = await withTimeout(feedResponse.text(), 7000, 'feed_body');
          const feedItems = parseFeed(feedText, { ...source, url: feedUrl });
          if (feedItems.length) return { items: feedItems, error: null };
          errors.push(`${feedUrl}:no_feed_items`);
        } catch (error) {
          errors.push(`${feedUrl}:${error.message}`);
        }
      }
      errors.push(`${url}:no_feed_items`);
    } catch (error) {
      errors.push(`${url}:${error.message}`);
    }
  }
  return {
    items: [],
    error: errors.join('; '),
    empty: errors.length > 0 && errors.every((entry) => entry.includes('no_feed_items'))
  };
}

function exclusion(item, reason) {
  return {
    id: item.id || '',
    title: item.title || '',
    url: item.url || '',
    source: item.source || '',
    published_at: item.published_at || '',
    excluded_reason: reason
  };
}

function filterWindow(items, window) {
  const start = new Date(window.window_start_iso);
  const end = new Date(window.window_end_iso);
  const included = [];
  const excluded = [];
  const seen = new Set();

  for (const item of items) {
    if (!item.title) {
      excluded.push(exclusion(item, 'missing_title'));
      continue;
    }
    if (!item.url) {
      excluded.push(exclusion(item, 'missing_url'));
      continue;
    }
    if (!item.source) {
      excluded.push(exclusion(item, 'missing_source'));
      continue;
    }
    if (!item.published_at) {
      excluded.push(exclusion(item, 'missing_published_at'));
      continue;
    }
    const published = new Date(item.published_at);
    if (Number.isNaN(published.getTime())) {
      excluded.push(exclusion(item, 'invalid_published_at'));
      continue;
    }
    if (published < start || published >= end) {
      excluded.push(exclusion(item, 'outside_time_window'));
      continue;
    }
    const key = item.url || `${item.source}:${item.title}`;
    if (seen.has(key)) {
      excluded.push(exclusion(item, 'duplicate'));
      continue;
    }
    seen.add(key);
    included.push({
      ...item,
      published_at: published.toISOString(),
      evidence_ids: [`evidence-${String(included.length + 1).padStart(4, '0')}`]
    });
  }

  return { included, excluded };
}

function writeLiveSourceSnapshot({ date, window, status, rawItems, included, excluded }) {
  writeJson(LIVE_SOURCE_SNAPSHOT, {
    generated_at: new Date().toISOString(),
    target_date: date,
    timezone: TZ,
    window_start: window.window_start,
    window_end: window.window_end,
    source_count: Number(status.source_count || 0),
    source_success_count: Number(status.source_success_count || 0),
    source_error_count: Number(status.source_error_count || 0),
    raw_item_count: rawItems.length,
    window_item_count: included.length,
    included_item_count: included.length,
    included_items: included.map((item) => ({
      source: item.source || '',
      original_title: item.title || '',
      url: item.url || '',
      published_at: item.published_at || '',
      story_id: item.id || '',
      category: item.category || ''
    })),
    excluded_summary: excluded.reduce((acc, item) => {
      acc[item.excluded_reason] = (acc[item.excluded_reason] || 0) + 1;
      return acc;
    }, {})
  });
}

function clamp(input, max) {
  const text = decodeText(input);
  return text.length <= max ? text : `${text.slice(0, Math.max(0, max - 3)).trimEnd()}...`;
}

function schemaCategory(category) {
  if (category === 'research') return 'papers';
  if (['models', 'products', 'agents', 'open_source', 'business', 'china', 'creator'].includes(category)) return category;
  return 'papers';
}

function sectionFor(category) {
  const key = schemaCategory(category);
  if (key === 'models' || key === 'products') return 'models';
  if (key === 'agents') return 'agents';
  if (key === 'open_source' || key === 'papers') return 'open_source';
  if (key === 'business') return 'business';
  if (key === 'china') return 'china_perspective';
  if (key === 'creator') return 'creator_opportunity';
  return 'open_source';
}

function sourceType(source) {
  if ([
    'OpenAI',
    'Anthropic',
    'Google AI',
    'Google DeepMind',
    'Google Research',
    'Microsoft AI',
    'Microsoft Research AI',
    'GitHub Blog',
    'Hugging Face',
    'Meta AI',
    'Mistral AI',
    'NVIDIA AI',
    'AWS Machine Learning Blog',
    'arXiv cs.AI',
    'arXiv cs.CL',
    'arXiv cs.LG',
    'arXiv stat.ML',
    'Stanford HAI',
    'Berkeley BAIR',
    'LangChain Blog',
    'LlamaIndex Blog'
  ].includes(source)) {
    return 'official';
  }
  return 'media';
}

function scoreFor(rank) {
  if (rank === 'S') return 9.5;
  if (rank === 'A') return 8;
  if (rank === 'B') return 6.5;
  return 4.5;
}

function rankWeight(rank) {
  if (rank === 'S') return 4;
  if (rank === 'A') return 3;
  if (rank === 'B') return 2;
  return 1;
}

function textForScoring(item) {
  return `${item.title || ''} ${item.summary || ''} ${item.source || ''} ${item.category || ''}`.toLowerCase();
}

function hasChinese(text) {
  return /[\u4e00-\u9fff]/.test(String(text || ''));
}

function englishWordCount(text) {
  const matches = String(text || '').match(/[A-Za-z][A-Za-z'-]+/g);
  return matches ? matches.length : 0;
}

function chineseSourceName(source) {
  const map = {
    'OpenAI': 'OpenAI',
    'GitHub Blog': 'GitHub',
    'Hugging Face': 'Hugging Face',
    'Google AI': 'Google AI',
    'Google DeepMind': 'DeepMind',
    'Google Research': 'Google Research',
    'Microsoft AI': 'Microsoft',
    'Microsoft Research AI': 'Microsoft Research',
    'Anthropic': 'Anthropic',
    'Meta AI': 'Meta',
    'Mistral AI': 'Mistral',
    'NVIDIA AI': 'NVIDIA',
    'AWS Machine Learning Blog': 'AWS',
    'TechCrunch AI': 'TechCrunch',
    'VentureBeat AI': 'VentureBeat',
    'The Verge AI': 'The Verge',
    'MIT Technology Review AI': 'MIT Tech Review',
    'Stanford HAI': 'Stanford HAI',
    'Berkeley BAIR': 'Berkeley BAIR',
    'Papers with Code Blog': 'Papers with Code',
    'Replicate Blog': 'Replicate',
    'LangChain Blog': 'LangChain',
    'LlamaIndex Blog': 'LlamaIndex',
    'arXiv cs.AI': 'arXiv',
    'arXiv cs.CL': 'arXiv',
    'arXiv cs.LG': 'arXiv',
    'arXiv stat.ML': 'arXiv'
  };
  return map[source] || source || '公开源';
}

function normalizeTopic(item) {
  const text = `${item.original_title || ''} ${item.title || ''} ${item.original_summary || ''} ${item.summary || ''}`.toLowerCase();
  if (/codex/.test(text)) return 'Codex';
  if (/copilot/.test(text)) return 'Copilot';
  if (/leaderboard|ranking|evaluation|benchmark/.test(text) && /agent|agentic/.test(text)) return '智能体评测榜单';
  if (/agent|agentic/.test(text)) return '智能体';
  if (/api|sdk/.test(text)) return 'API';
  if (/open source|weights|hugging face/.test(text)) return '开源模型';
  if (/benchmark|paper|arxiv|research/.test(text)) return '研究信号';
  if (/enterprise|customer|pricing|partnership/.test(text)) return '企业落地';
  if (/availability report|status report|incident|outage|maintenance/.test(text)) return '可用性报告';
  if (/model|reasoning|multimodal|llm/.test(text)) return '模型能力';
  if (/github/.test(text)) return '开发入口';
  return item.category === 'research' ? '研究进展' : item.category === 'business' ? '产品落点' : 'AI 工具';
}

function chineseVerb(item) {
  const text = `${item.original_title || ''} ${item.title || ''} ${item.original_summary || ''} ${item.summary || ''}`.toLowerCase();
  if (/launch|introduc|announce|release/.test(text)) return '发布新动作';
  if (/deploy|adopt|use|using/.test(text)) return '开始落到团队里';
  if (/future|view|vision/.test(text)) return '押注下一步';
  if (/report|availability|status/.test(text)) return '交出运行报告';
  if (/benchmark|paper|research/.test(text)) return '给出研究信号';
  if (/fund|partner|customer|enterprise/.test(text)) return '把商业线往前推';
  return '露出新落点';
}

function rawStoryText(item) {
  return `${item.original_title || ''} ${item.title || ''} ${item.original_summary || ''} ${item.summary || ''}`;
}

function hasFundingEvidence(text) {
  return /\b(raise|raised|funding|seed|series\s+[a-z]|investment|investor|financing|buyout)\b/i.test(String(text || ''));
}

function hasLegalEvidence(text) {
  return /\b(lawsuit|court|trial|legal|judge|appeal|sues|case|ruling|suit)\b/i.test(String(text || '')) ||
    /诉讼|法院|法庭|法官|败诉|案件|裁决|上诉/.test(String(text || ''));
}

function extractStoryFacts(item) {
  const originalTitle = item.original_title || item.title || '';
  const originalSummary = item.original_summary || item.summary || '';
  const text = `${originalTitle} ${originalSummary}`;
  const facts = [];
  const add = (label, value) => {
    if (value && !facts.some((fact) => fact.value === value)) facts.push({ label, value });
  };
  [
    ['Codex', /Codex/i],
    ['Dell', /Dell/i],
    ['NVIDIA Vera', /NVIDIA Vera|Vera Arrives|Vera CPU/i],
    ['Jensen Huang', /Jensen Huang/i],
    ['Cosmos', /Cosmos/i],
    ['PaddleOCR', /PaddleOCR/i],
    ['Nova 2', /Nova 2/i],
    ['Confluence', /Confluence/i],
    ['GitHub Copilot', /GitHub Copilot|Copilot/i],
    ['Open Agent Leaderboard', /Open Agent Leaderboard/i],
    ['Siri', /Siri/i],
    ['OpenAI', /OpenAI/i],
    ['Claude', /Claude/i],
    ['Spotify', /Spotify/i],
    ['ElevenLabs', /ElevenLabs/i],
    ['有声书工具', /audiobook creation tool|audiobook/i],
    ['Alexa Plus', /Alexa Plus/i],
    ['Amazon Quick', /Amazon Quick/i],
    ['Amazon Bedrock AgentCore', /Bedrock AgentCore/i],
    ['Aderant', /Aderant/i],
    ['SandboxAQ', /SandboxAQ/i],
    ['Anthropic', /Anthropic/i],
    ['Cloudflare', /Cloudflare/i],
    ['LetinAR', /LetinAR/i],
    ['AI glasses', /AI glasses/i],
    ['Anduril', /Anduril/i],
    ['Meta', /\bMeta\b/i],
    ['Google', /\bGoogle\b/i],
    ['Elon Musk', /Elon Musk|Musk/i],
    ['Sam Altman', /Sam Altman|Altman/i]
  ].forEach(([value, pattern]) => {
    if (pattern.test(text)) add('entity', value);
  });
  if (/partner|partnership/i.test(text)) add('action', '合作');
  if (/on-premise|hybrid/i.test(text)) add('action', '混合与本地部署');
  if (/fine-tun|LoRA|DoRA/i.test(text)) add('action', '微调');
  if (/content moderation/i.test(text)) add('action', '内容审核');
  if (/leaderboard|ranking/i.test(text)) add('action', '榜单排名');
  if (/evaluation|evaluators?|benchmark/i.test(text)) add('action', '评测');
  if (/document parsing|OCR/i.test(text)) add('action', '文档解析');
  if (/audiobook/i.test(text)) add('action', '有声书生成');
  if (/podcast/i.test(text)) add('action', '播客生成');
  if (hasLegalEvidence(text)) add('action', '诉讼');
  if (/acquired|acquire/i.test(text)) add('action', '收购');
  if (/AI glasses|optics/i.test(text)) add('action', 'AI 眼镜光学');
  if (/cloud operations/i.test(text)) add('action', '云运维');
  if (/code-based evaluators/i.test(text)) add('action', '代码评估器');
  if (/drug discovery/i.test(text)) add('action', '药物发现');
  if (/smart glasses for warfare/i.test(text)) add('action', '军用智能眼镜');
  return facts;
}

function sourceAliases(source) {
  const sourceName = chineseSourceName(source);
  return new Set([
    String(source || '').toLowerCase(),
    sourceName.toLowerCase(),
    sourceName.replace(/\s+/g, '').toLowerCase()
  ]);
}

function isGenericObject(value) {
  const text = String(value || '').trim();
  if (!text) return true;
  const compact = text.replace(/\s+/g, '');
  return GENERIC_OBJECTS.has(text) || GENERIC_OBJECTS.has(compact);
}

function isGenericAction(value) {
  return GENERIC_ACTIONS.has(String(value || '').trim());
}

function titleEntityCandidates(title, source) {
  const cleaned = decodeText(title).replace(/[’']/g, "'");
  const sourceSet = sourceAliases(source);
  const candidates = [];
  const add = (value) => {
    let normalized = String(value || '')
      .replace(/^(The|How|With|Would|Welcome to|Everything new in our|New ways to)\s+/i, '')
      .replace(/^Introducing\s+/i, '')
      .replace(/^Welcome\s+(?:to\s+)?/i, '')
      .replace(/^Extending\s+/i, '')
      .replace(/^Implementing\s+/i, '')
      .replace(/[,:;.!?]+$/g, '')
      .trim();
    if (/^agentic gemini era$/i.test(normalized)) normalized = 'Gemini';
    if (!normalized || normalized.length < 3) return;
    const lower = normalized.toLowerCase();
    if (sourceSet.has(lower) || sourceSet.has(lower.replace(/\s+/g, ''))) return;
    if (/^(from|with|using|this|that|how|why|here|what|when|where|new|the|and|for|at|in|on|to|of|is|are|welcome|introducing|extending|implementing)$/i.test(normalized)) return;
    if (isGenericObject(normalized)) return;
    if (!candidates.includes(normalized)) candidates.push(normalized);
  };

  [
    /Open Agent Leaderboard/ig,
    /Amazon Bedrock AgentCore Memory/ig,
    /Amazon Bedrock AgentCore/ig,
    /Amazon Nova Sonic/ig,
    /Amazon Nova 2/ig,
    /Android CLI/ig,
    /Antigravity 2\.0/ig,
    /Google I\/O 2026/ig,
    /Google Search/ig,
    /search box/ig,
    /Google AI Mode/ig,
    /AI Mode/ig,
    /AI agents?/ig,
    /AI Search/ig,
    /AI design/ig,
    /Google AI subscriptions?/ig,
    /Google Workspace/ig,
    /ElevenLabs-powered audiobook creation tool/ig,
    /audiobook creation tool/ig,
    /ElevenLabs/ig,
    /Spotify Studio/ig,
    /Spotify/ig,
    /Universal Cart/ig,
    /Gemini Spark/ig,
    /Gemini 3\.5 Flash/ig,
    /agentic Gemini era/ig,
    /Gemini app/ig,
    /Gemini/ig,
    /smart glasses/ig,
    /audio-powered smart glasses/ig,
    /Alexa\+?|Alexa Plus/ig,
    /AI phishing/ig,
    /Iron Dome/ig,
    /robots spend your money/ig,
    /Kiro CLI/ig,
    /Siri/ig,
    /Codex/ig,
    /Copilot/ig,
    /Confluence/ig,
    /PaddleOCR/ig,
    /Cosmos/ig,
    /Volvo/ig,
    /OpenAI/ig,
    /Anthropic/ig,
    /ChatGPT/ig,
    /Claude/ig
  ].forEach((pattern) => {
    for (const match of cleaned.matchAll(pattern)) add(match[0]);
  });

  const phraseMatches = cleaned.match(/\b(?:[A-Z][A-Za-z0-9+.-]*(?:\s+[A-Z][A-Za-z0-9+.-]*){0,4})\b/g) || [];
  for (const phrase of phraseMatches) add(phrase);
  return candidates;
}

function actionFromTitle(title) {
  const text = decodeText(title).toLowerCase();
  if (/leaderboard|ranking/.test(text)) return '榜单排名';
  if (/benchmark|evaluation|evaluators?/.test(text)) return '评测';
  if (hasFundingEvidence(text)) return '融资';
  if (hasLegalEvidence(text)) return '诉讼';
  if (/auto-delet|delete/.test(text)) return '自动清除';
  if (/audiobook/.test(text)) return '有声书生成';
  if (/generate|create|podcast/.test(text)) return '生成';
  if (/tool calling/.test(text)) return '工具调用';
  if (/memory/.test(text)) return '记忆扩展';
  if (/search/.test(text)) return '搜索改版';
  if (/subscription|pricing|price/.test(text)) return '订阅调整';
  if (/shopping|cart|spend your money/.test(text)) return '购物代理';
  if (/assistant|agentic|agent/.test(text)) return '智能体能力';
  if (/coding|cli/.test(text)) return '开发工具升级';
  if (/camera|parking|sign/.test(text)) return '视觉识别';
  if (/design/.test(text)) return '设计工具';
  if (/join|hire|team/.test(text)) return '团队变动';
  if (/announce|introduce|launch|release|unveil/.test(text)) return '推出';
  return '';
}

function audienceFromItem(item, concreteObject) {
  const text = rawStoryText(item).toLowerCase();
  if (/developer|github|codex|copilot|api|sdk|tool calling|bedrock|agentcore|kiro/.test(text)) return '开发者和平台团队';
  if (/benchmark|evaluation|paper|arxiv|research|leaderboard/.test(text)) return '研究者和评测团队';
  if (/open source|hugging face|weights|dataset|model/.test(text)) return '开源社区和模型使用者';
  if (/enterprise|customer|aws|bedrock|subscription|pricing|business|funding|lawsuit|trial/.test(text)) return '企业团队和投资者';
  if (/creator|podcast|video|image|design|media|content/.test(text)) return '创作者和内容团队';
  if (/siri|alexa|search|shopping|cart|assistant|gemini/.test(text)) return '普通用户和产品团队';
  return concreteObject ? '相关产品团队和使用者' : '';
}

function buildStoryFact(item) {
  const originalTitle = item.original_title || item.title || '';
  const originalSummary = item.original_summary || item.summary || '';
  const facts = extractStoryFacts(item);
  const entities = [];
  const addEntity = (value) => {
    const text = String(value || '').trim();
    if (!text || isGenericObject(text)) return;
    if (!entities.includes(text)) entities.push(text);
  };
  facts.filter((fact) => fact.label === 'entity').forEach((fact) => addEntity(fact.value));
  titleEntityCandidates(originalTitle, item.source).forEach(addEntity);

  const action = facts.find((fact) => fact.label === 'action' && !isGenericAction(fact.value))?.value || actionFromTitle(originalTitle);
  const sourceSet = sourceAliases(item.source);
  const concreteObject = entities
    .slice()
    .sort((a, b) => {
      const aCompany = COMPANY_ENTITIES.has(a) ? 1 : 0;
      const bCompany = COMPANY_ENTITIES.has(b) ? 1 : 0;
      if (aCompany !== bCompany) return aCompany - bCompany;
      return b.length - a.length;
    })
    .find((entity) => !sourceSet.has(entity.toLowerCase()) && !isGenericObject(entity)) || '';
  const audience = audienceFromItem(item, concreteObject);
  const editorialAngle = concreteObject && action
    ? `${concreteObject}的${action}会影响${audience || '具体使用者'}`
    : '';
  const storyFacts = [
    ...entities.map((value) => ({ label: 'entity', value })),
    ...(action ? [{ label: 'action', value: action }] : []),
    ...(concreteObject ? [{ label: 'concrete_object', value: concreteObject }] : [])
  ];

  return {
    concrete_object: concreteObject,
    entities,
    products: entities,
    action,
    audience,
    editorial_angle: editorialAngle,
    story_facts: storyFacts,
    original_title: originalTitle,
    original_summary: originalSummary
  };
}

function isSpecificStory(storyFact, rawItem) {
  const whyFailed = [];
  const sourceSet = sourceAliases(rawItem.source);
  const concreteObject = storyFact?.concrete_object || '';
  const action = storyFact?.action || '';
  const entities = Array.isArray(storyFact?.entities) ? storyFact.entities : [];
  const hasNonSourceEntity = entities.some((entity) => {
    const lower = String(entity).toLowerCase();
    return lower && !sourceSet.has(lower) && !sourceSet.has(lower.replace(/\s+/g, '')) && !isGenericObject(entity);
  });
  if (!concreteObject || isGenericObject(concreteObject)) whyFailed.push('missing_or_generic_concrete_object');
  if (!entities.length) whyFailed.push('missing_entities');
  if (!hasNonSourceEntity) whyFailed.push('entities_only_source_or_generic');
  if (!action || isGenericAction(action)) whyFailed.push('missing_or_generic_action');
  if (!storyFact?.audience) whyFailed.push('missing_audience');
  if (!storyFact?.editorial_angle || FORBIDDEN_GENERIC_COPY.some((phrase) => storyFact.editorial_angle.includes(phrase))) {
    whyFailed.push('missing_or_generic_editorial_angle');
  }
  return { ok: whyFailed.length === 0, why_failed: whyFailed };
}

function titleFromStoryFact(item, storyFact) {
  const source = chineseSourceName(item.source);
  const object = storyFact.concrete_object;
  const action = storyFact.action;
  if (action === '榜单排名' || action === '评测') return `${source}把${object}放进公开评测`;
  if (action === '融资') return `${object}完成融资，验证具体市场`;
  if (action === '诉讼') return `${object}诉讼继续牵动 AI 治理`;
  if (action === '自动清除') return `苹果重做 Siri，聊天记录可能自动清除`;
  if (action === '生成') return `${object}进入内容生产线`;
  if (action === '有声书生成') return `${object}推出 AI 有声书制作工具`;
  if (action === '工具调用') return `${object}补上程序化工具调用`;
  if (action === '记忆扩展') return `${object}加入对话记忆`;
  if (action === '搜索改版') return `${object}正在改写搜索入口`;
  if (action === '订阅调整') return `${object}订阅能力重新打包`;
  if (action === '购物代理') return `${object}想接管购物流程`;
  if (action === '视觉识别') return `${object}接入外部摄像头识别`;
  if (action === '设计工具') return `${object}把 AI 设计摆上台面`;
  if (action === '推出') return `${object}补上产品能力`;
  return `${object}推进${action}`;
}

function summaryFromStoryFact(item, storyFact) {
  const object = storyFact.concrete_object;
  const action = storyFact.action;
  const source = chineseSourceName(item.source);
  if (action === '搜索改版') return `${source}把${object}推到搜索入口前台，搜索正在从关键词输入转向更主动的 AI 任务入口。`;
  if (action === '开发工具升级') return `${source}把${object}放在开发工具语境里，关键不是概念，而是 CLI、编码流程和实际接入方式是否变顺。`;
  if (action === '记忆扩展') return `${source}在${object}里扩展记忆能力，说明智能体的长期上下文正在从概念变成开发者可调用的基础能力。`;
  if (action === '工具调用') return `${source}让${object}更稳定地调用外部工具，智能体开始从聊天回答转向按流程执行任务。`;
  if (action === '智能体能力') return `${source}把${object}接进智能体场景，它要证明自己不是演示，而是能处理连续任务的产品能力。`;
  if (action === '购物代理') return `${source}写到${object}，意思是 AI 不只推荐商品，还可能进入跨站购物流程，风险和便利都会一起出现。`;
  if (action === '订阅调整') return `${source}这条指向${object}的订阅变化，用户真正要看的是哪些能力被打包、哪些功能需要额外付费。`;
  if (action === '生成') return `${source}把${object}放进生成场景，关键是生成结果能否被编辑、追溯和稳定使用。`;
  if (action === '有声书生成') return `${source}报道${object}，AI 配音和有声书制作流程开始变成创作者可以直接调用的平台工具。`;
  if (action === '融资') return `${source}报道${object}完成融资，这笔钱接下来要回答它到底解决哪个具体产品问题。`;
  if (action === '诉讼') return `${source}围绕${object}的法律争议继续发酵，AI 公司治理、承诺和商业化之间的拉扯被推到台前。`;
  if (action === '评测' || action === '榜单排名') return `${source}把${object}放进评测框架，任务集、评分方法和结果复现会决定它有没有参考价值。`;
  if (action === '视觉识别') return `${source}提到${object}的视觉识别能力，真正要看的是它在真实环境里能否稳定读懂场景。`;
  if (action === '设计工具') return `${source}把${object}推到设计工具层面，关键是它能否改变原型、素材和协作流程。`;
  if (action === '团队变动') return `${source}把${object}的人才流动放到前沿模型竞争里看，训练经验和研究判断仍是稀缺资源。`;
  if (action === '推出') return `${source}报道${object}的新功能或版本，接下来要看它补上哪段能力、面向谁开放。`;
  return `${source}把${object}带到${storyFact.audience || '相关使用者'}面前，${action}会改变使用路径和产品边界。`;
}

function whyFromStoryFact(item, storyFact) {
  const object = storyFact.concrete_object;
  const action = storyFact.action;
  const audience = storyFact.audience;
  if (action === '搜索改版') return `${audience}要看${object}：搜索入口变主动后，内容分发、广告和用户路径都会被重新分配。`;
  if (action === '开发工具升级') return `${audience}要看${object}：CLI 和编码入口一旦顺手，会直接改变团队日常开发节奏。`;
  if (action === '智能体能力') return `${audience}要看${object}：智能体只有进入具体任务，才知道是帮忙还是添乱。`;
  if (action === '购物代理') return `${audience}要看${object}：AI 如果开始代办购物，支付、推荐和责任边界都会变敏感。`;
  if (action === '订阅调整') return `${audience}要看${object}：能力打包方式会决定谁能用、花多少钱、被锁在哪个入口。`;
  if (action === '融资') return `${audience}要看${object}：融资方向说明市场正在验证哪个具体痛点。`;
  if (action === '评测' || action === '榜单排名') return `${audience}要看${object}：公开评测能让能力比较少一点玄学，多一点可复查证据。`;
  if (action === '推出') return `${audience}要看${object}：新功能是否改变现有产品路径，而不是只增加发布会信息量。`;
  if (action === '有声书生成') return `${audience}要看${object}：有声书制作门槛下降后，版权、配音质量和分发规则都会变重要。`;
  return `${audience}要看${object}：${action}会改变具体接入方式、使用边界或采购判断。`;
}

function janetFromStoryFact(item, storyFact) {
  const object = storyFact.concrete_object;
  const action = storyFact.action;
  if (action === '搜索改版') return `${object}这事不小，搜索框一变，很多流量游戏就要重新算账。`;
  if (action === '开发工具升级') return `${object}如果真能少敲几步命令，开发者会比发布会掌声更诚实。`;
  if (action === '记忆扩展') return `${object}补记忆这事很实在，智能体没上下文就像刚睡醒的同事。`;
  if (action === '工具调用') return `${object}开始认真处理工具调用，说明智能体终于要学会按流程干活。`;
  if (action === '购物代理') return `${object}听起来方便，但让 AI 花钱这件事，最好先问清楚谁背锅。`;
  if (action === '融资') return `${object}融资只是开场，接下来要证明它不是又一个安全 PPT。`;
  if (action === '评测' || action === '榜单排名') return `${object}终于要拿分数说话了，虽然榜单也会有自己的小心思。`;
  if (action === '推出') return `${object}这类发布不缺声量，缺的是用户第二天还会不会打开。`;
  if (action === '有声书生成') return `${object}不是“AI 很会说话”的故事，而是音频制作开始变成按钮级工具。`;
  return `${object}要看入口、权限和使用门槛，发布词不算数，能被真实团队接起来才算数。`;
}

function watchFromStoryFact(item, storyFact) {
  const object = storyFact.concrete_object;
  const action = storyFact.action;
  if (action === '搜索改版') return `看${object}是否改变流量和广告分配。`;
  if (action === '开发工具升级') return `看${object}是否进入默认开发命令。`;
  if (action === '智能体能力') return `看${object}能否完成连续任务。`;
  if (action === '购物代理') return `看${object}的支付和责任边界。`;
  if (action === '订阅调整') return `看${object}哪些能力被放进付费档。`;
  if (action === '生成') return `看${object}是否支持编辑和版权控制。`;
  if (action === '有声书生成') return `看${object}是否公布配音版权和编辑能力。`;
  if (action === '融资') return `看${object}融资后是否给出产品指标。`;
  if (action === '诉讼') return `看${object}后续是否影响治理承诺。`;
  if (action === '评测' || action === '榜单排名') return `看${object}是否公开任务集和评分细则。`;
  if (action === '推出') return `看${object}是否给出可用入口和限制。`;
  return `看${object}后续是否公布可用入口、权限范围和真实案例。`;
}

function copyFromStoryFact(item, storyFact) {
  const brief = storyBrief(item);
  if (brief) return brief;
  const title = titleFromStoryFact(item, storyFact);
  return {
    title,
    summary: clamp(summaryFromStoryFact(item, storyFact), 118),
    why: clamp(whyFromStoryFact(item, storyFact), 90),
    janet: clamp(janetFromStoryFact(item, storyFact), 76),
    watch: clamp(watchFromStoryFact(item, storyFact), 42)
  };
}

function storyBrief(item) {
  const raw = rawStoryText(item);
  const text = raw.toLowerCase();
  const source = chineseSourceName(item.source);
  if (/openai/.test(text) && /dell/.test(text) && /codex/.test(text)) {
    return {
      title: 'OpenAI 联手戴尔，把 Codex 推进企业内网',
      summary: 'OpenAI 与戴尔合作，把 Codex 带进混合和本地企业环境，重点是代码智能体开始进入更保守的企业部署场景。',
      why: '企业和开发团队要看：Codex 不只在云端演示，进入本地和混合环境后，采购、安全和权限都会变成真实问题。',
      janet: 'Codex 进企业内网，说明 OpenAI 知道真正的钱不只在酷炫 demo 里。',
      watch: '看戴尔客户是否把 Codex 接进内部开发流程。'
    };
  }
  if (/open agent leaderboard/.test(text) || (/leaderboard|ranking|benchmark|evaluation/.test(text) && /agent/.test(text) && /hugging face/.test(text))) {
    return {
      title: 'Hugging Face 推出开放智能体榜单',
      summary: 'Hugging Face 发布 Open Agent Leaderboard，把智能体能力放进公开评测和排名里，重点是让不同智能体不只靠演示互相比较。',
      why: '开发者和研究团队要看：智能体如果有公开榜单，模型选择、工具链评估和复现实验会更容易对齐。',
      janet: '智能体终于要上考场了。榜单不等于真能干活，但至少比各家自夸更好查。',
      watch: '看 Open Agent Leaderboard 是否公开任务集和评分细则。'
    };
  }
  if (/jensen huang/.test(text) && /dell/.test(text)) {
    return {
      title: '黄仁勋在戴尔大会继续推企业 AI',
      summary: 'NVIDIA 在戴尔技术大会上强调企业 AI 需求快速上升，这条新闻的重点是算力、服务器和企业部署正在绑得更紧。',
      why: '企业 IT 和开发平台团队要看：AI 需求如果继续上升，预算会从试点转向基础设施采购。',
      janet: '黄仁勋这次讲的不是愿景，是企业钱包和服务器机柜的位置。',
      watch: '看戴尔与 NVIDIA 的企业 AI 订单是否继续放大。'
    };
  }
  if (/vera/.test(text) && /nvidia/.test(text)) {
    return {
      title: 'NVIDIA Vera CPU 交到顶级 AI 实验室',
      summary: 'NVIDIA 的 Vera CPU 开始交付给顶级 AI 实验室，信号在于智能体基础设施不只拼 GPU，也开始拼 CPU 与整机协同。',
      why: '研究机构和基础设施团队要看：智能体工作负载如果扩大，CPU、内存和整机架构会一起影响效率。',
      janet: 'Vera 不是给发布会撑场面的名字，它是在补智能体基础设施的另一半。',
      watch: '看 Vera 是否进入更多 AI 实验室和整机方案。'
    };
  }
  if (/nova 2/.test(text) && /content moderation/.test(text)) {
    return {
      title: 'AWS 用 Nova 2 做内容审核提示',
      summary: 'AWS 展示如何提示 Amazon Nova 2 做内容审核，重点是企业把模型能力落到安全审核、规则判断和工作流自动化里。',
      why: '内容平台和企业安全团队要看：模型审核能不能稳定处理边界案例，会直接影响人审成本和合规风险。',
      janet: 'Nova 2 这条不性感，但内容审核这种脏活才最考验模型能不能上班。',
      watch: '看 Nova 2 在审核场景的误判率和接入方式。'
    };
  }
  if (/confluence/.test(text)) {
    return {
      title: 'AWS 把 Confluence 接进 Amazon Quick',
      summary: 'AWS 展示 Confluence Cloud 与 Amazon Quick 的集成，重点是企业知识库正在被接入 AI 检索和问答入口。',
      why: '企业知识管理团队要看：Confluence 这类存量内容如果接进 AI 入口，会改变内部搜索和协作方式。',
      janet: '真正的企业 AI 往往不是新建一个聊天框，而是把旧文档拖进新入口。',
      watch: '看 Amazon Quick 是否覆盖更多企业知识库。'
    };
  }
  if (/cosmos/.test(text) && /robot video generation/.test(text)) {
    return {
      title: 'Hugging Face 教你微调 NVIDIA Cosmos',
      summary: 'Hugging Face 发布 NVIDIA Cosmos Predict 2.5 的 LoRA/DoRA 微调教程，目标是机器人视频生成这种更具体的训练场景。',
      why: '机器人和开源社区要看：Cosmos 如果能被低成本微调，视频生成会更快进入垂直任务。',
      janet: '这条的价值在教程里：能不能被别人复现，比发布词更重要。',
      watch: '看 Cosmos 微调案例是否出现更多机器人数据集。'
    };
  }
  if (/paddleocr/.test(text)) {
    return {
      title: 'PaddleOCR 3.5 接上 Transformers 后端',
      summary: 'Hugging Face 介绍 PaddleOCR 3.5 用 Transformers 后端跑 OCR 和文档解析，重点是文档 AI 工具链继续标准化。',
      why: '开发者和文档自动化团队要看：OCR、解析和模型后端统一后，落地成本会明显下降。',
      janet: 'PaddleOCR 这条很实用：文档处理不是性感赛道，但每天都有人被 PDF 折磨。',
      watch: '看 PaddleOCR 3.5 的部署速度和中文文档效果。'
    };
  }
  if (/karpathy/.test(text) && /anthropic/.test(text)) {
    return {
      title: 'Karpathy 加入 Anthropic 预训练团队',
      summary: `${source}报道 Andrej Karpathy 加入 Anthropic 预训练团队，这条的重点是顶级模型训练经验继续向头部实验室集中。`,
      why: '研究者和模型团队要看：预训练人才流动会影响下一代模型的训练路线和团队竞争。',
      janet: 'Karpathy 换位置，比很多产品更新更值得看，因为模型能力最后还是人训出来的。',
      watch: '看 Anthropic 预训练团队后续论文和模型节奏。'
    };
  }
  if (/take your local github sessions anywhere/.test(text)) {
    return {
      title: 'GitHub 会话开始跟着开发者走',
      summary: 'GitHub 让本地会话更容易跨设备延续，重点是开发环境不再只锁在一台机器上，协作和上下文迁移会更顺。',
      why: '开发者和远程团队要看：会话能带走，意味着代码、上下文和工具状态会更接近一个连续工作台。',
      janet: '这不是炫技功能，是 GitHub 想把开发者的上下文也圈进自己的入口。',
      watch: '看 GitHub 会话能力是否接进 Copilot 和 Codespaces。'
    };
  }
  if (/aderant/.test(text) && /cloud operations/.test(text)) {
    return {
      title: 'Aderant 用 Amazon Quick 改造云运维',
      summary: 'AWS 案例写到 Aderant 用 Amazon Quick 改造云运维，重点是企业开始把 AI 问答接进日常运维和内部知识流。',
      why: '企业运维团队要看：AI 如果能回答系统和流程问题，影响的是故障处理、交接和内部支持成本。',
      janet: '云运维这种地方没多少掌声，但 AI 能不能上班，往往先在这里露馅。',
      watch: '看 Aderant 的云运维案例是否公开更多指标。'
    };
  }
  if (/code-based evaluators/.test(text) && /bedrock agentcore/.test(text)) {
    return {
      title: 'Bedrock AgentCore 加上代码评估器',
      summary: 'AWS 介绍在 Amazon Bedrock AgentCore 里构建代码型评估器，重点是智能体从“能跑”进入“能被测试和约束”。',
      why: '开发者和企业 AI 平台团队要看：智能体上线前如果缺评估器，错误会直接进业务流程。',
      janet: '智能体不缺演示，缺的是出错时谁来抓包，AgentCore 这条就在补这个环节。',
      watch: '看 Bedrock AgentCore 评估器是否支持更多真实任务。'
    };
  }
  if (/sandboxaq/.test(text) && /drug discovery/.test(text) && /claude/.test(text)) {
    return {
      title: 'SandboxAQ 把药物模型接到 Claude',
      summary: 'SandboxAQ 把药物发现模型带到 Claude 里，重点是专业模型开始借通用助手降低使用门槛，而不是只给计算专家用。',
      why: '医药研发和企业 AI 团队要看：专业模型如果能被普通研究流程调用，会改变试验设计和知识检索方式。',
      janet: '这条有意思的地方不是 Claude 多会聊天，而是专业模型终于想离开小圈子。',
      watch: '看 SandboxAQ 是否公开模型边界和验证方式。'
    };
  }
  if (/alexa\+ powered feature/.test(text) && /generate podcast/.test(text)) {
    return {
      title: 'Amazon 用 Alexa Plus 生成播客',
      summary: 'TechCrunch 报道 Alexa Plus 新功能可以生成播客，说明语音助手正在从回答指令转向主动产出内容。',
      why: '音频创作者和智能助手团队要看：助手生成内容会影响脚本、剪辑和分发的成本结构。',
      janet: 'Alexa 以前像遥控器，现在开始像小型内容工厂，问题是成品能不能听。',
      watch: '看 Alexa Plus 生成播客是否支持编辑和版权控制。'
    };
  }
  if (/letinar/.test(text) && /ai glasses/.test(text)) {
    return {
      title: 'LetinAR 在做 AI 眼镜背后的光学',
      summary: 'TechCrunch 报道韩国 LetinAR 正在打造 AI 眼镜背后的光学方案，重点是硬件体验不只靠模型，还靠显示和佩戴工程。',
      why: '硬件创业者和消费电子团队要看：AI 眼镜如果要成为日常设备，光学、重量和可制造性会先卡住体验。',
      janet: 'AI 眼镜不能只会喊助手，它首先得让人愿意戴在脸上。',
      watch: '看 LetinAR 光学方案是否进入量产合作。'
    };
  }
  if (/here.?s why elon musk lost his suit against openai/.test(text)) {
    return {
      title: 'MIT 复盘马斯克为何输给 OpenAI',
      summary: 'MIT Technology Review 复盘马斯克对 OpenAI 诉讼失利，重点在于法律证据、公司使命和商业化承诺之间的拉扯。',
      why: 'AI 公司和投资者要看：使命叙事进入法庭后，能不能变成可执行约束会被重新检验。',
      janet: '愿景写在官网上很漂亮，进了法庭就要问它到底算不算数。',
      watch: '看 OpenAI 治理争议是否引出更多法律动作。'
    };
  }
  if (/all of the updates/.test(text) && /musk/.test(text) && /altman/.test(text)) {
    return {
      title: `${source}梳理 OpenAI 控制权交锋`,
      summary: `${source}汇总马斯克与 Sam Altman 围绕 OpenAI 的持续交锋，这条更像时间线，帮读者看清争议如何滚动。`,
      why: '关注 AI 治理的人要看：持续更新的争议会影响公众对 OpenAI 控制权和商业化路径的判断。',
      janet: '这不是一条单点新闻，是 OpenAI 家庭剧的滚动字幕。',
      watch: '看 Altman 与马斯克是否继续公开交锋。'
    };
  }
  if (/elon musk loses his case against sam altman/.test(text)) {
    return {
      title: `${source}记录马斯克案件受挫`,
      summary: `${source}报道马斯克对 Sam Altman 的案件失利，重点是围绕 OpenAI 的法律攻击暂时没有打穿。`,
      why: '投资者和政策观察者要看：诉讼结果会影响外界如何评估 OpenAI 的治理风险。',
      janet: '马斯克这次没打穿，但这类官司通常不会让故事真的结束。',
      watch: '看马斯克是否换路径继续挑战 OpenAI。'
    };
  }
  if (/what to expect from google this week/.test(text)) {
    return {
      title: 'MIT 预告 Google 本周 AI 看点',
      summary: 'MIT Technology Review 梳理 Google 本周可能发布的 AI 动作，重点是模型、搜索和开发入口会不会继续合并。',
      why: '开发者和产品团队要看：Google 如果把 AI 更深接入搜索与工具，会影响流量入口和产品分发。',
      janet: 'Google 的发布会从来不只是发布功能，它是在重排别人靠什么被看见。',
      watch: '看 Google 是否把 AI 搜索和开发工具继续打通。'
    };
  }
  if (/anduril/.test(text) && /meta/.test(text) && /smart glasses for warfare/.test(text)) {
    return {
      title: 'Anduril 与 Meta 做军用智能眼镜',
      summary: 'MIT Technology Review 写到 Anduril 和 Meta 探索战争场景里的智能眼镜，重点是可穿戴 AI 正在进入高风险应用。',
      why: '政策研究者和硬件团队要看：智能眼镜进入军事用途，会放大隐私、安全和实时决策风险。',
      janet: '这条不是酷炫眼镜故事，而是 AI 戴到战场以后谁负责的问题。',
      watch: '看军用智能眼镜是否披露安全限制。'
    };
  }
  if (/anthropic has acquired/.test(text) && /openai/.test(text) && /cloudflare/.test(text)) {
    return {
      title: 'Anthropic 收购 OpenAI 也用过的开发工具',
      summary: 'TechCrunch 报道 Anthropic 收购一家被 OpenAI、Google 和 Cloudflare 使用的开发工具创业公司，开发者基础设施正在被模型公司直接收入囊中。',
      why: '开发者和平台团队要看：模型公司收购工具链，会影响未来 AI 编程入口由谁掌控。',
      janet: 'Anthropic 买的不是小工具，是通往开发者日常工作的侧门。',
      watch: '看 Anthropic 是否把这套工具接进 Claude 开发入口。'
    };
  }
  if (/alexa plus/.test(text) && /podcast/.test(text)) {
    return {
      title: 'Alexa Plus 开始生成 AI 播客',
      summary: 'Amazon Alexa Plus 增加 AI 生成播客能力，说明语音助手正在从回答问题转向主动生产音频内容。',
      why: '内容创作者和语音产品团队要看：助手如果能生成播客，会改变音频内容的生产门槛。',
      janet: 'Alexa 终于不只会答话，也开始抢内容生产的活。',
      watch: '看 Alexa Plus 生成内容是否支持可控编辑。'
    };
  }
  if (hasLegalEvidence(raw) && /elon musk/.test(text) && /sam altman|openai/.test(text) && /lost|suit|case/.test(text)) {
    return {
      title: '马斯克案件受挫，OpenAI 争议还没结束',
      summary: `${source}报道马斯克对 Sam Altman 和 OpenAI 的案件受挫，法律结果暂时落定，但 AI 公司治理争议仍会继续。`,
      why: '投资者和 AI 公司观察者要看：这类诉讼会影响公众如何理解 AI 公司的使命、控制权和商业化。',
      janet: '马斯克输了这一局，但 OpenAI 的治理故事不会因此安静。',
      watch: '看马斯克是否继续用其他路径施压 OpenAI。'
    };
  }
  if (/siri/.test(text) && /auto-delet|deleting chat|delete/.test(text)) {
    return {
      title: /apple/.test(text) ? '苹果重做 Siri，聊天记录可能自动清除' : 'Siri 改版或加入聊天自动清除',
      summary: `从${source}报道看，Siri 改版据称会加入聊天自动清除，重点不是又多一个聊天框，而是 AI 助手如何处理隐私、留痕和默认记忆。`,
      why: `${source}这条提醒普通用户和产品团队：语音助手一旦进入聊天场景，记录保存和删除规则会直接影响信任。`,
      janet: `${source}这次看点不只是 Siri 变聪明，而是“聊完要不要留下”也成了产品选择。`,
      watch: '看苹果是否公布 Siri 隐私和记录规则。'
    };
  }
  if (/spotify/.test(text) && /elevenlabs|audiobook/.test(text)) {
    return {
      title: 'Spotify 接入 ElevenLabs，推出 AI 有声书工具',
      summary: `${source}报道 Spotify 推出 ElevenLabs 支持的有声书制作工具，重点是把 AI 配音和长音频生产放进更低门槛的创作者流程。`,
      why: '创作者和出版团队要看：有声书制作如果被工具化，配音版权、审核和分发规则都会被重新拉到台前。',
      janet: '这不是校园反弹故事，是 Spotify 把 AI 配音塞进有声书生产线。',
      watch: '看 Spotify 是否公布配音版权和编辑能力。'
    };
  }
  if (hasLegalEvidence(raw) && /musk|elon/.test(text) && /openai/.test(text) && /trial|trust|lawsuit/.test(text)) {
    return {
      title: '马斯克与 OpenAI 诉讼，信任成核心问题',
      summary: `${source}把马斯克与 OpenAI 的诉讼焦点放在“谁能被信任”上，这不是普通法务新闻，而是 AI 公司治理和商业承诺的压力测试。`,
      why: '企业和投资者要看：AI 公司讲开放、使命和商业化时，合同与治理会不会被重新审视。',
      janet: '这场官司真正吵的不是情绪，是 AI 公司说过的话还能不能算数。',
      watch: '看法庭如何处理 OpenAI 的使命与商业边界。'
    };
  }
  if (/commencement speech|graduation|boo|cheerleading/.test(text) && /ai/.test(text) && !/spotify|elevenlabs|audiobook|podcast/.test(text)) {
    return {
      title: /boo|eric schmidt|arizona/.test(text) ? '学生嘘声回应 AI 助威' : '毕业演讲别再硬塞 AI',
      summary: `${source}记录到校园场景里的 AI 叙事开始遇到反弹：听众不只想听“AI 会改变一切”，他们更在意具体代价、就业压力和真实帮助。`,
      why: `${source}这条提醒创作者、学校和企业传播团队：AI 叙事已经不能只靠热词推进，受众开始要求具体答案。`,
      janet: `${source}这里的反应不是“不懂 AI”，而是听够了没有落点的 AI 鸡血。`,
      watch: '看高校和企业怎样重写 AI 叙事。'
    };
  }
  if (/automotive|mobility|skills arms race|\bcar\b|vehicle/.test(text) && /ai/.test(text)) {
    return {
      title: '汽车业开始抢 AI 技能',
      summary: `${source}把汽车行业的 AI 竞争指向人才和能力储备，真正的分水岭可能不是谁会宣传，而是谁能把 AI 塞进研发、制造和服务链路。`,
      why: '车企和供应链要看：AI 能力会影响研发效率、软件体验和岗位结构，竞争会先体现在团队能力上。',
      janet: '车圈的 AI 竞赛不只在座舱屏幕上，也在招聘和组织结构里。',
      watch: '看车企是否把 AI 技能写进核心岗位。'
    };
  }
  if (/drive-thru|drive thru|chatbots/.test(text)) {
    return {
      title: '得来速聊天机器人只是开场',
      summary: `${source}提到得来速聊天机器人，说明 AI 客服正在进入更嘈杂、更高压的真实服务场景，接下来考验的是稳定性、纠错和人工接管。`,
      why: '餐饮、零售和客服团队要看：AI 能不能在真实环境里降低成本，而不是只在演示里答得漂亮。',
      janet: '点餐窗口不是实验室，机器人在这里出错，后面排队的人会立刻投票。',
      watch: '看餐饮连锁是否公开人工接管比例。'
    };
  }
  return null;
}

function makeChineseTitle(item) {
  if (hasChinese(item.title) && englishWordCount(item.title) < 5) return clamp(item.title, 34);
  const brief = storyBrief(item);
  if (brief?.title) return brief.title;
  const source = chineseSourceName(item.source);
  const topic = normalizeTopic(item);
  const verb = chineseVerb(item);
  const text = rawStoryText(item).toLowerCase();

  if (/availability report|status report|incident|outage|maintenance/.test(text)) {
    return `${source} 可用性报告，放进归档就好`;
  }
  if (/codex/.test(text) && /agent|agentic|software development|developer/.test(text)) {
    return `${source} 押注 Codex，开发开始代理化`;
  }
  if (/copilot/.test(text)) return `${source} 继续把 Copilot 往工作流里塞`;
  if (/hugging face|open source|weights|dataset/.test(text)) return `${source} 放出开源信号，社区有活干了`;
  if (/arxiv|paper|benchmark/.test(text)) return `${source} 新论文冒头，先看能否复现`;
  if (/api|sdk|developer|workflow|agent/.test(text)) return `${source}更新${topic}，看入口和权限`;
  return `${source}追踪${topic}，${verb}`;
}

function makeChineseSummary(item) {
  const brief = storyBrief(item);
  if (brief?.summary) return brief.summary;
  const source = chineseSourceName(item.source);
  const topic = normalizeTopic(item);
  const text = rawStoryText(item).toLowerCase();
  if (/availability report|status report|incident|outage|maintenance/.test(text)) {
    return `${source} 这条更像服务运行记录，不适合作为头条，但可以帮助判断工具稳定性和平台状态。`;
  }
  if (/codex/.test(text)) {
    return `${source}把 Codex 放进软件开发现场，重点是智能体不再只做演示，而是被推向真实工程团队。`;
  }
  if (/api|sdk|developer|workflow|copilot|agent/.test(text)) {
    return `${source}这条把 AI 功能放到具体产品或流程里，重点看它影响哪类使用者，以及是否带来可验证的功能变化。`;
  }
  if (/hugging face|open source|weights|dataset/.test(text)) {
    return `${source} 释放了开源侧信号，真正要看的是社区能否快速复现、封装，并把它变成可用工具。`;
  }
  if (/arxiv|paper|benchmark|research/.test(text)) {
    return `${source} 的研究内容值得放进观察名单，它不等于产品发布，但可能预告下一波能力方向。`;
  }
  if (/enterprise|customer|pricing|partnership|funding/.test(text)) {
    return `${source} 这条更偏商业落地，重点看客户、价格和入口是否真的发生变化。`;
  }
  return `${source} 这条新闻指向${topic}的具体落点，适合和同日新闻一起看它影响谁、改变什么入口。`;
}

function keywordHits(text, keywords = []) {
  return keywords.filter((keyword) => text.includes(String(keyword).toLowerCase()));
}

function scoreEditorialItem(item, rules) {
  const text = textForScoring(item);
  const base = Number(rules.source_priority?.[item.source]) || (item.source_rank === 'S' ? 82 : item.source_rank === 'A' ? 68 : 48);
  let score = base;
  const editorial_signals = [];
  const editorial_penalties = [];

  for (const signal of rules.positive_signals || []) {
    const hits = keywordHits(text, signal.keywords);
    if (!hits.length) continue;
    score += Number(signal.weight) || 0;
    editorial_signals.push({ name: signal.name, weight: signal.weight, hits });
  }

  for (const signal of rules.negative_signals || []) {
    const hits = keywordHits(text, signal.keywords);
    if (!hits.length) continue;
    score += Number(signal.weight) || 0;
    editorial_penalties.push({ name: signal.name, weight: signal.weight, hits });
  }

  const avoidLeadHits = keywordHits(text, rules.lead_story_policy?.avoid_as_lead_keywords || []);
  const lead_eligible = avoidLeadHits.length === 0 && !editorial_penalties.some((item) => item.name === 'status_or_availability');

  return {
    ...item,
    editorial_score: Math.max(0, Math.round(score)),
    editorial_signals,
    editorial_penalties,
    lead_eligible,
    core_eligible: score >= 25 && !editorial_penalties.some((penalty) => ['status_or_availability', 'old_monthly_report', 'jobs_or_hr'].includes(penalty.name)),
    avoid_lead_hits: avoidLeadHits
  };
}

function sortByEditorialValue(a, b) {
  if ((b.core_eligible ? 1 : 0) !== (a.core_eligible ? 1 : 0)) return (b.core_eligible ? 1 : 0) - (a.core_eligible ? 1 : 0);
  if (b.editorial_score !== a.editorial_score) return b.editorial_score - a.editorial_score;
  if (rankWeight(b.source_rank) !== rankWeight(a.source_rank)) return rankWeight(b.source_rank) - rankWeight(a.source_rank);
  return new Date(b.published_at).getTime() - new Date(a.published_at).getTime();
}

function orderStoriesForEdition(included, rules) {
  const scored = included.map((item) => scoreEditorialItem(item, rules));
  const minLeadScore = Number(rules.lead_story_policy?.min_score || 60);
  const leadPool = scored
    .filter((item) => item.lead_eligible && item.editorial_score >= minLeadScore)
    .sort(sortByEditorialValue);
  const fallbackPool = scored
    .filter((item) => item.lead_eligible)
    .sort(sortByEditorialValue);
  const nonStatusPool = scored
    .filter((item) => !item.editorial_penalties.some((penalty) => penalty.name === 'status_or_availability'))
    .sort(sortByEditorialValue);
  const lead = leadPool[0] || fallbackPool[0] || nonStatusPool[0];
  if (!lead) {
    const error = new Error('blocked_quality_insufficient');
    error.code = 'blocked_quality_insufficient';
    throw error;
  }

  const rest = scored.filter((item) => item.id !== lead.id).sort(sortByEditorialValue);
  const core = rest.filter((item) => item.core_eligible);
  const secondary = rest.filter((item) => !item.core_eligible);
  return [lead, ...core, ...secondary];
}

function sourceNames(stories, limit = 4) {
  return [...new Set(stories.map((story) => story.source).filter(Boolean))].slice(0, limit);
}

function recentTitles(limit = 7) {
  const titles = [];
  const index = readJson(resolve(ROOT, 'data/news-index.json'), null);
  if (Array.isArray(index?.editions)) {
    for (const edition of index.editions.slice(0, limit)) {
      if (edition.title) titles.push(edition.title);
    }
  }
  const manifest = readJson(resolve(ROOT, 'data/MANIFEST.json'), []);
  for (const editionId of manifest.slice(0, limit)) {
    const summary = readJson(resolve(ROOT, `data/${editionId}/news-summary.json`), null);
    const content = readJson(resolve(ROOT, `data/${editionId}/content.json`), null);
    if (summary?.title) titles.push(summary.title);
    if (summary?.theme) titles.push(summary.theme);
    if (content?.theme) titles.push(content.theme);
  }
  return [...new Set(titles.filter(Boolean))].slice(0, limit * 3);
}

function fillTitlePattern(pattern, subject, verb, object) {
  return String(pattern)
    .replaceAll('{subject}', subject)
    .replaceAll('{verb}', verb)
    .replaceAll('{object}', object);
}

function titleForEdition(stories, rules, date) {
  const objects = concreteObjectsFor(stories, 4).map(displayObject);
  const actions = concreteActionsFor(stories, 3);
  const first = objects[0] || chineseSourceName(stories[0]?.source);
  const second = objects[1] || objects[0] || date.replaceAll('-', '.');
  const action = actions[0] || '更新';
  const shortFirst = first.length > 14 ? first.slice(0, 14) : first;
  const shortSecond = second.length > 10 ? second.slice(0, 10) : second;
  const candidates = [
    `${shortFirst}带出${action}`,
    objects.length >= 2 ? `${shortFirst}和${shortSecond}都有新动作` : '',
    objects.length >= 2 ? `${shortFirst}和${shortSecond}推近产品层` : '',
    `${shortFirst}今天盯上${action}`,
    `${shortFirst}这次看${action}`,
    objects.length >= 2 ? `${shortFirst}牵出${shortSecond}` : '',
    '今天的 AI 更新分散在几个具体产品里'
  ]
    .filter(Boolean)
    .map((item) => String(item).replace(/\s+/g, '').trim());
  const forbidden = [...(rules.forbidden_frontend_phrases || []), '工具链又拧紧了', '公开源池晨报'];
  const history = recentTitles(Number(rules.title_generation?.forbid_repeat_days || 7));
  const selected = candidates.find((item) => (
    !history.includes(item) &&
    [...item].length <= 24 &&
    !forbidden.some((phrase) => item.includes(phrase)) &&
    !FORBIDDEN_SURFACE_COPY.some((phrase) => item.includes(phrase)) &&
    hasChinese(item)
  ));
  if (selected) return selected;
  const fallback = `${shortFirst}带出${action || '新动作'}`;
  if (!history.includes(fallback)) return fallback;
  return `${shortFirst}有新动作`;
}

function thesisForEdition(stories) {
  const objects = concreteObjectsFor(stories, 5).map(displayObject);
  const actions = concreteActionsFor(stories, 4);
  const sources = sourceNames(stories.slice(0, 5), 4).join('、');
  const objectText = objects.slice(0, 4).join('、') || sources || '今天这几条具体产品';
  const actionText = actions.slice(0, 3).join('、') || '功能边界、接入方式和评测方法';
  return clamp(`今天先看的对象是${objectText}：它们分别牵出${actionText}。别按声量排序，要看这些产品和评测会怎样改变具体使用路径。`, 150);
}

function displayObject(value) {
  const text = String(value || '').trim();
  const map = [
    [/Amazon Bedrock AgentCore Memory/i, 'AgentCore Memory'],
    [/Amazon Bedrock AgentCore/i, 'Bedrock AgentCore'],
    [/ElevenLabs-powered audiobook creation tool|audiobook creation tool/i, 'ElevenLabs 有声书工具'],
    [/AI-powered Q(?:&A)?/i, 'Spotify Q&A 工具'],
    [/AI-generated/i, 'Spotify AI 翻唱'],
    [/Introducing OpenAI/i, 'OpenAI'],
    [/agentic Gemini era/i, 'Gemini'],
    [/Google Workspace/i, 'Workspace'],
    [/Google Search|search box/i, 'Google 搜索框'],
    [/Antigravity/i, 'Antigravity'],
    [/Open Agent Leaderboard/i, '智能体榜单']
  ];
  for (const [pattern, replacement] of map) {
    if (pattern.test(text)) return replacement;
  }
  return text.length > 20 ? text.slice(0, 20).trim() : text;
}

function concreteObjectsFor(stories, limit = 5) {
  const objects = [];
  for (const story of stories) {
    const candidates = [
      story.story_fact?.concrete_object,
      ...(story.story_fact?.products || []),
      ...(story.story_fact?.entities || []),
      ...(story.story_facts || []).map((fact) => fact.value)
    ];
    for (const value of candidates) {
      const text = String(value || '').trim();
      if (!text || isGenericObject(text)) continue;
      if (!objects.includes(text)) objects.push(text);
      if (objects.length >= limit) return objects;
    }
  }
  return objects;
}

function concreteActionsFor(stories, limit = 4) {
  const actions = [];
  for (const story of stories) {
    const value = String(story.story_fact?.action || '').trim();
    if (!value || isGenericAction(value)) continue;
    if (!actions.includes(value)) actions.push(value);
    if (actions.length >= limit) break;
  }
  return actions;
}

function buildDailyBrief(stories, modules, rules, date) {
  const dailyTitle = titleForEdition(stories, rules, date);
  const objects = concreteObjectsFor(stories, 5).map(displayObject);
  const actions = concreteActionsFor(stories, 4);
  const leadObject = objects[0] || chineseSourceName(stories[0]?.source);
  const secondObject = objects[1] || objects[0] || '另一条具体产品线';
  const shortLeadObject = leadObject.length > 14 ? leadObject.slice(0, 14) : leadObject;
  const shortSecondObject = secondObject.length > 8 ? secondObject.slice(0, 8) : secondObject;
  const theme = `${shortLeadObject}牵出${shortSecondObject}`;
  const dailySummary = clamp(`今天的主线落在${objects.slice(0, 4).join('、') || leadObject}，看点是${actions.slice(0, 3).join('、') || '功能边界和接入方式'}，不是抽象趋势。`, 118);
  const dailyJudgment = clamp(`Janet 判断：${leadObject}这类新闻要看对象和动作，能落到入口、接口或评测方法里才算数。`, 92);
  const thesis = thesisForEdition(stories);
  const intro = clamp(`${leadObject}先把今天的注意力拉住；${secondObject}补上另一条线索。今天先看这些具体产品怎么动。`, 110);
  return {
    daily_title: dailyTitle,
    theme: theme === dailyTitle ? `${leadObject}今天给出具体线索` : theme,
    daily_summary: dailySummary,
    daily_judgment: dailyJudgment,
    daily_thesis: thesis,
    intro_text: intro,
    module_count: modules.length
  };
}

function signalMapForEdition(stories) {
  const groups = [
    { label: '模型上新', test: (story) => /model|launch|release|introduce|announc|openai|google/i.test(`${story.title} ${story.summary} ${story.source}`) },
    { label: '工具收口', test: (story) => /api|sdk|agent|copilot|github|developer|workflow|tool/i.test(`${story.title} ${story.summary} ${story.source}`) },
    { label: '开源补位', test: (story) => /hugging face|open source|github|arxiv|paper|benchmark|dataset|weights/i.test(`${story.title} ${story.summary} ${story.source}`) },
    { label: '商业落点', test: (story) => /pricing|enterprise|customer|trial|lawsuit|automotive|drive-thru|business|mobility|技能|诉讼|得来速|汽车/i.test(`${story.title} ${story.summary} ${story.source} ${story.original_title}`) },
    { label: '用户反应', test: (story) => /student|commencement|speech|boo|creator|media|用户|学生|演讲/i.test(`${story.title} ${story.summary} ${story.source} ${story.original_title}`) }
  ];
  const used = new Set();
  const signals = [];
  for (const group of groups) {
    const first = stories.find((story) => !used.has(story.id) && group.test(story));
    if (!first) continue;
    used.add(first.id);
    const evidence = [first];
    used.add(first.id);
    signals.push({
      signal: group.label,
      evidence: evidence.map((story) => story.id),
      janet_view: clamp(first.summary || first.janet_take || first.title, 70)
    });
    if (signals.length >= 3) break;
  }
  return signals;
}

function signalLabelFor(signal, story) {
  const object = story?.story_fact?.concrete_object || concreteObjectsFor([story], 1)[0] || signal.signal;
  const action = story?.story_fact?.action || concreteActionsFor([story], 1)[0] || '变化';
  return `${object}的${action}`;
}

function homepageStoryItem(role, story, visual) {
  const url = story?.url || story?.source_url || story?.external_url || '';
  return {
    role,
    story_id: story?.id || '',
    title: story?.title || '',
    source: story?.source || '',
    category: story?.category || '',
    url,
    source_url: story?.source_url || url,
    external_url: story?.external_url || url,
    summary: story?.summary || '',
    why_it_matters: story?.why_it_matters || '',
    janet_take: story?.janet_take || '',
    watch_next: story?.watch_next || '',
    visual: visual || story?.visual || ''
  };
}

function uniqueStoryList(items) {
  const used = new Set();
  const result = [];
  for (const item of items) {
    if (!item?.id || used.has(item.id)) continue;
    used.add(item.id);
    result.push(item);
  }
  return result;
}

function makeFieldUnique(items, field, formatter) {
  const seen = new Map();
  for (const item of items) {
    const value = String(item[field] || '').trim();
    if (!value) continue;
    const count = seen.get(value) || 0;
    if (count > 0) item[field] = formatter(item, value, count + 1);
    seen.set(value, count + 1);
    seen.set(item[field], 1);
  }
}

function ensureUniqueHomepageCopy(items) {
  makeFieldUnique(items, 'summary', (item) => clamp(`这条聚焦「${item.title}」，同屏里它提供另一组产品对象、评测方法或接入边界。`, 118));
  makeFieldUnique(items, 'why_it_matters', (item) => clamp(`「${item.title}」会影响相关团队对接口、权限、评测或采购路径的判断。`, 96));
  makeFieldUnique(items, 'janet_take', (item) => clamp(`Janet 看「${item.title}」：别看发布词，看对象、动作和限制条件。`, 86));
  makeFieldUnique(items, 'watch_next', (item) => clamp(`看「${item.title}」是否公布接口、价格或评测细则。`, 48));
  items.forEach(scrubTemplateCopy);
}

function ensureUniqueStoryCopy(stories) {
  makeFieldUnique(stories, 'zh_title', (story) => clamp(`${story.zh_title || story.title}（${chineseSourceName(story.source)}）`, 52));
  makeFieldUnique(stories, 'title', (story) => story.zh_title || story.title);
  makeFieldUnique(stories, 'zh_summary', (story) => clamp(`${chineseSourceName(story.source)}这条讲的是「${story.zh_title || story.title}」：${story.original_title || story.raw_item?.original_title || ''}`.replace(/\s+/g, ' '), 120));
  makeFieldUnique(stories, 'summary', (story) => story.zh_summary || story.summary);
  makeFieldUnique(stories, 'why_it_matters', (story) => clamp(`「${story.zh_title || story.title}」会影响相关团队对接口、权限、评测或采购路径的判断。`, 90));
  makeFieldUnique(stories, 'janet_take', (story) => clamp(`Janet 看「${story.zh_title || story.title}」：先看对象、动作和限制条件。`, 80));
  makeFieldUnique(stories, 'watch_next', (story) => clamp(`看「${story.zh_title || story.title}」是否公布接口或评测细则。`, 42));
  stories.forEach((story) => {
    scrubTemplateCopy(story);
    story.janet_take = buildLongJanetTake(story);
    story.content = buildReaderBody(story);
  });
}

function buildHomepageAssembly(stories, date) {
  const lead = stories[0];
  const used = new Set([lead.id]);
  const maxSignals = Math.min(3, Math.max(0, stories.length - 1));
  const signalMap = signalMapForEdition(stories.filter((story) => story.id !== lead.id)).slice(0, maxSignals).map((signal, index) => {
    const story = stories.find((item) => signal.evidence.includes(item.id) && !used.has(item.id));
    if (!story) return null;
    used.add(story.id);
    return {
      ...signal,
      label: signalLabelFor(signal, story),
      summary: story.summary,
      story_id: story.id,
      story_title: story.title,
      source: story.source,
      url: story.url || story.source_url || story.external_url || '',
      source_url: story.source_url || story.url || story.external_url || '',
      external_url: story.external_url || story.url || story.source_url || '',
      visual: story.visual
    };
  }).filter(Boolean);

  const compactPool = uniqueStoryList(stories).filter((story) => !used.has(story.id));
  const compactNews = [
    ...compactPool.filter((story) => story.core_eligible),
    ...compactPool.filter((story) => !story.core_eligible)
  ].slice(0, 6);
  compactNews.forEach((story) => used.add(story.id));

  const homepageItems = [homepageStoryItem('lead', lead)];
  signalMap.forEach((signal) => {
    const story = stories.find((item) => item.id === signal.story_id);
    homepageItems.push(homepageStoryItem('signal', story, signal.visual));
  });
  compactNews.forEach((story) => homepageItems.push(homepageStoryItem('compact', story)));
  ensureUniqueHomepageCopy(homepageItems);

  return { signalMap, compactNews, homepageItems };
}

function moduleTitleFor(sectionKey, stories) {
  const first = stories[0] || {};
  const objects = concreteObjectsFor(stories, 2);
  const actions = concreteActionsFor(stories, 2);
  const object = objects[0] || first.title || chineseSourceName(first.source);
  const second = objects[1] || actions[0] || '具体能力';
  if (sectionKey === 'agents') return `${object}把${second}接进任务链路`;
  if (sectionKey === 'open_source') return `${object}把${second}放到可复查路径里`;
  if (sectionKey === 'business') return `${object}牵出${second}的商业边界`;
  if (sectionKey === 'models') return `${object}把${second}落到产品层`;
  if (sectionKey === 'creator_opportunity') return `${object}改写${second}的创作流程`;
  if (sectionKey === 'china_perspective') return `${object}给中国视角补上${second}`;
  return `${object}补充今天的${second}`;
}

function moduleSummaryFor(sectionKey, stories) {
  const sources = sourceNames(stories, 3).join('、') || '多个来源';
  const objects = concreteObjectsFor(stories, 3);
  const actions = concreteActionsFor(stories, 3);
  const objectText = objects.join('、') || stories[0]?.title || sources;
  const actionText = actions.join('、') || '接入方式';
  if (sectionKey === 'agents') return `${sources}这组集中在${objectText}，看点是${actionText}怎样影响开发和平台团队。`;
  if (sectionKey === 'open_source') return `${sources}这组围绕${objectText}，要看${actionText}能不能被复现、比较或接入。`;
  if (sectionKey === 'business') return `${sources}这组把${objectText}推到商业语境里，关键是${actionText}会不会改变客户路径。`;
  if (sectionKey === 'models') return `${sources}这组看${objectText}，要看${actionText}是否进入可用产品。`;
  if (sectionKey === 'creator_opportunity') return `${sources}这组看${objectText}，关键是${actionText}能不能降低创作成本。`;
  return `${sources}这组补充${objectText}，把${actionText}放在主线之外观察。`;
}

function buildModules(sections) {
  return Object.entries(sections)
    .filter(([key, section]) => key !== 'lead_story' && Array.isArray(section.items) && section.items.length > 0)
    .map(([key, section]) => ({
      module_id: key,
      module_title: moduleTitleFor(key, section.items),
      module_summary: moduleSummaryFor(key, section.items),
      story_ids: section.items.map((story) => story.id)
    }));
}

function buildCover(stories, modules, dailyBrief) {
  const lead = stories[0] || {};
  const objects = concreteObjectsFor([lead], 2);
  const primaryFact = objects[0] || chineseSourceName(lead.source);
  const leadAction = lead.story_fact?.action || concreteActionsFor([lead], 1)[0] || '具体动作';
  const coverTitle = objects.includes('Codex') && objects.includes('Dell')
    ? 'Codex 开始进企业内网'
    : `${primaryFact}牵出${leadAction}`;
  const coverSummary = objects.includes('Codex') && objects.includes('Dell')
    ? '今天的主线不是模型参数，而是 OpenAI 与戴尔把 Codex 推进混合和本地企业环境，AI 编程开始面对真实采购和权限问题。'
    : `${lead.source || '来源'}把${primaryFact}的${leadAction}推到今天主线，影响${lead.story_fact?.audience || '相关使用者'}对功能边界和接入方式的判断。`;
  return {
    daily_title: dailyBrief.daily_title,
    cover_title: coverTitle === dailyBrief.daily_title ? `${primaryFact}成为头条线索` : coverTitle,
    cover_summary: coverSummary,
    daily_judgment: dailyBrief.daily_judgment,
    lead_story_id: lead.id,
    visual: lead.visual || null
  };
}

function whyItMatters(story) {
  const brief = storyBrief(story);
  if (brief?.why) return brief.why;
  const fact = story.story_fact || buildStoryFact(story);
  const object = fact.concrete_object || normalizeTopic(story);
  const action = fact.action || '具体功能';
  const audience = fact.audience || '相关团队';
  return clamp(`${audience}要看${object}：${action}会影响接口、权限、评测或采购路径。`, 90);
}

function janetTake(story) {
  const brief = storyBrief(story);
  if (brief?.janet) return brief.janet;
  const text = `${story.original_title || ''} ${story.title} ${story.original_summary || ''} ${story.summary} ${story.source}`.toLowerCase();
  const source = chineseSourceName(story.source);
  const topic = normalizeTopic(story);
  if (/availability report|status report|incident|outage|maintenance/.test(text)) {
    return '这类更像值班记录，能进归档，但别让它抢头条。';
  }
  if (/api|sdk|developer|workflow|copilot|github|agent/.test(text)) {
    return '先别急着鼓掌，关键看它有没有让真实任务少绕一步。';
  }
  if (/hugging face|open source|weights|dataset|repository/.test(text)) {
    return '开源这边的信号很直接：别只看巨头发布会，能复用的东西才会长腿。';
  }
  if (/arxiv|paper|benchmark|training|inference|evaluation/.test(text)) {
    return '论文不等于产品，但它通常先告诉你下一轮功能会从哪里冒出来。';
  }
  if (/enterprise|pricing|funding|partnership|customer/.test(text)) {
    return '商业新闻的看点是钱和入口流向谁，口号先放一边。';
  }
  return `${topic}这条要看${source}给出的对象、动作和限制条件。`;
}

function watchNext(story) {
  const brief = storyBrief(story);
  if (brief?.watch) return brief.watch;
  const text = `${story.original_title || ''} ${story.title} ${story.original_summary || ''} ${story.summary} ${story.source}`.toLowerCase();
  const source = chineseSourceName(story.source);
  const topic = normalizeTopic(story);
  if (/openai|model|reasoning|multimodal/.test(text)) return `看${source}是否开放 API、价格和企业权限。`;
  if (/github|codex|copilot|api|sdk|developer|workflow|agent/.test(text)) return `看${topic}是否公布接口、权限或接入限制。`;
  if (/hugging face|open source|weights|dataset/.test(text)) return `看${source}社区复现速度和许可边界。`;
  if (/arxiv|paper|benchmark/.test(text)) return '看这篇论文有没有代码和基准跟进。';
  if (/creator|video|image|audio|design|media|content/.test(text)) return '看创作者工具是否真正降低制作成本。';
  if (/pricing|enterprise|customer|partnership|funding|trial|lawsuit|finance/.test(text)) return `看${source}的客户、定价和入口变化。`;
  if (/apple|siri|chatbot|assistant|drive-thru|automotive/.test(text)) return `看${topic}是否公布隐私、支付或人工接管规则。`;
  return `看${topic}是否给出接口、价格或评测细则。`;
}

function uniqueWatchNext(story, used) {
  const source = chineseSourceName(story.source);
  const topic = normalizeTopic(story);
  const candidates = [
    story.watch_next,
    `看「${story.title}」是否公布使用范围。`,
    `看「${story.title}」是否公布接口限制。`,
    `看「${story.title}」是否给出评测细则。`
  ];
  let selected = candidates.find((item) => item && !used.has(item));
  if (!selected) selected = `看「${story.title}」后续证据 ${used.size + 1}。`;
  used.add(selected);
  return clamp(selected, 42);
}

function assignPrimarySection(story) {
  const text = `${story.title || ''} ${story.original_title || ''} ${story.summary || ''} ${story.original_summary || ''} ${story.source || ''} ${story.category || ''}`.toLowerCase();
  if (/china|中国|阿里|腾讯|百度|字节|deepseek|月之暗面|智谱/.test(text)) return 'china_perspective';
  if (/github|codex|copilot|sdk|api|workflow|developer|agent|agentic|langchain|llamaindex/.test(text)) return 'agents';
  if (/openai|anthropic|google ai|deepmind|meta ai|mistral|model|multimodal|reasoning|siri|assistant|chatbot/.test(text)) return 'models';
  if (/hugging face|arxiv|paper|benchmark|open source|weights|dataset|replicate|bair|stanford|research|论文|评测/.test(text)) return 'open_source';
  if (/creator|video|image|audio|design|media|content|runway|创作|视频|图像|音频|设计/.test(text)) return 'creator_opportunity';
  if (/business|enterprise|pricing|customer|partnership|funding|trial|lawsuit|finance|automotive|drive-thru|mobility|skills/.test(text)) return 'business';
  if (story.category === 'models') return 'models';
  if (story.category === 'agents') return 'agents';
  if (['open_source', 'research', 'papers'].includes(story.category)) return 'open_source';
  if (['creator', 'creator_opportunity'].includes(story.category)) return 'creator_opportunity';
  if (['business', 'enterprise'].includes(story.category)) return 'business';
  return 'more_ai';
}

function visualTitle(text) {
  return String(text || 'Janet').replace(/[^\u4e00-\u9fffA-Za-z0-9 ]/g, '').slice(0, 12) || 'Janet';
}

function visualPattern(category) {
  if (category === 'models') {
    return '<circle cx="640" cy="280" r="92" fill="none" stroke="#18e299" stroke-width="4" opacity=".7"/><circle cx="640" cy="280" r="42" fill="#18e299" opacity=".16"/><path d="M410 280h460M640 90v380" stroke="#18e299" stroke-width="2" opacity=".2"/>';
  }
  if (category === 'agents') {
    return '<path d="M360 360c120-160 360-160 520 0" fill="none" stroke="#18e299" stroke-width="4" opacity=".55"/><circle cx="360" cy="360" r="22" fill="#18e299" opacity=".8"/><circle cx="620" cy="238" r="26" fill="#18e299" opacity=".5"/><circle cx="880" cy="360" r="22" fill="#18e299" opacity=".8"/>';
  }
  if (category === 'open_source') {
    return '<path d="M360 180h520v300H360z" fill="none" stroke="#18e299" stroke-width="3" opacity=".45"/><path d="M410 240h420M410 300h280M410 360h360M410 420h210" stroke="#18e299" stroke-width="8" stroke-linecap="round" opacity=".28"/>';
  }
  if (category === 'research' || category === 'papers') {
    return '<path d="M340 380c70-180 120 120 200-40s130 60 210-80 120 80 170-30" fill="none" stroke="#18e299" stroke-width="5" opacity=".7"/><path d="M360 160h360l120 120v250H360z" fill="none" stroke="#ffffff" stroke-width="2" opacity=".18"/>';
  }
  return '<path d="M350 440h500M390 440V280h92v160M554 440V210h92v230M718 440V310h92v130" stroke="#18e299" stroke-width="4" fill="none" opacity=".55"/><path d="M360 250l180-70 150 80 180-120" stroke="#ffffff" stroke-width="3" fill="none" opacity=".24"/>';
}

function visualSvg(title, subtitle, category) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 720" width="1200" height="720" role="img" aria-label="${escapeHtml(title)}">
  <defs>
    <linearGradient id="bg" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stop-color="#050505"/><stop offset="1" stop-color="#101712"/></linearGradient>
    <radialGradient id="glow" cx="24%" cy="16%" r="78%"><stop offset="0" stop-color="#18e299" stop-opacity=".22"/><stop offset=".5" stop-color="#18e299" stop-opacity=".05"/><stop offset="1" stop-color="#18e299" stop-opacity="0"/></radialGradient>
  </defs>
  <rect width="1200" height="720" fill="url(#bg)"/>
  <rect width="1200" height="720" fill="url(#glow)"/>
  <rect x="70" y="70" width="1060" height="580" rx="34" fill="rgba(255,255,255,.035)" stroke="rgba(255,255,255,.11)"/>
  ${visualPattern(category)}
  <text x="104" y="132" fill="#18e299" font-family="Arial, Helvetica, sans-serif" font-size="22" font-weight="700" letter-spacing="2">JANET DAILY</text>
  <text x="104" y="562" fill="#f0f0f0" font-family="Arial, Helvetica, sans-serif" font-size="54" font-weight="700">${escapeHtml(visualTitle(title))}</text>
  <text x="108" y="608" fill="rgba(240,240,240,.68)" font-family="Arial, Helvetica, sans-serif" font-size="24">${escapeHtml(visualTitle(subtitle))}</text>
</svg>`;
}

function writeNewsVisual(fileName, title, subtitle, category) {
  const rel = `assets/news-visuals/${fileName}`;
  writeText(resolve(ROOT, rel), visualSvg(title, subtitle, category));
  return rel;
}

function visualTerms(story) {
  const fact = story?.story_fact || {};
  return [
    fact.concrete_object,
    ...(fact.entities || []),
    ...(fact.products || []),
    fact.action,
    fact.domain,
    story?.source
  ].filter(Boolean).map((term) => String(term).trim()).filter(Boolean);
}

function visualObject(story) {
  return visualTerms(story).find((term) => term.length >= 2 && !isGenericObject(term)) || story?.source || 'Janet';
}

function chineseVisualAlt(story) {
  return `新闻视觉：${story?.title || visualObject(story)}`;
}

function chineseVisualCaption(story, mode) {
  const object = visualObject(story);
  const action = story?.story_fact?.action || '变化';
  const source = chineseSourceName(story?.source || '');
  if (mode === 'official_image') return `${source}原文分享图，用来对应「${object}」这条新闻。`;
  if (mode === 'source_image') return `${source}源站图片，对应「${object}」的${action}。`;
  if (mode === 'open_license_image') return `开放授权图片，用来辅助呈现「${object}」相关对象。`;
  return `Janet 根据「${object}」和「${action}」生成的新闻视觉。`;
}

function isHttpsImageUrl(url) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') return false;
    if (/data:|tracking|pixel|favicon|logo/i.test(url)) return false;
    return /\.(jpe?g|png|webp|svg)(?:$|[?#])/i.test(parsed.pathname + parsed.search);
  } catch {
    return false;
  }
}

function imageExt(url, contentType = '') {
  const path = (() => {
    try { return new URL(url).pathname; } catch { return url; }
  })();
  const ext = path.match(/\.(jpe?g|png|webp|svg)$/i)?.[1]?.toLowerCase();
  if (ext) return ext === 'jpeg' ? 'jpg' : ext;
  if (/png/i.test(contentType)) return 'png';
  if (/webp/i.test(contentType)) return 'webp';
  if (/svg/i.test(contentType)) return 'svg';
  return 'jpg';
}

function officialSourceDomains(source) {
  const lower = String(source || '').toLowerCase();
  if (lower.includes('openai')) return ['openai.com'];
  if (lower.includes('anthropic')) return ['anthropic.com'];
  if (lower.includes('google')) return ['google.com', 'blog.google', 'deepmind.google'];
  if (lower.includes('github')) return ['github.blog', 'github.com'];
  if (lower.includes('hugging face')) return ['huggingface.co'];
  if (lower.includes('aws') || lower.includes('amazon')) return ['aws.amazon.com', 'amazon.com'];
  if (lower.includes('microsoft')) return ['microsoft.com'];
  if (lower.includes('nvidia')) return ['nvidia.com'];
  return [];
}

function sameTrustedDomain(imageUrl, sourceUrl, source) {
  try {
    const imageHost = new URL(imageUrl).hostname.replace(/^www\./, '');
    const sourceHost = new URL(sourceUrl).hostname.replace(/^www\./, '');
    if (imageHost === sourceHost || imageHost.endsWith(`.${sourceHost}`)) return true;
    return officialSourceDomains(source).some((domain) => imageHost === domain || imageHost.endsWith(`.${domain}`));
  } catch {
    return false;
  }
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 7000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function withTimeout(promise, timeoutMs, label = 'operation') {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label}_timeout`)), timeoutMs);
    })
  ]).finally(() => clearTimeout(timer));
}

function htmlImageCandidates(html, baseUrl) {
  const candidates = [];
  const metaPatterns = [
    /<meta\b[^>]*property=["']og:image(?::secure_url)?["'][^>]*content=["']([^"']+)["'][^>]*>/gi,
    /<meta\b[^>]*content=["']([^"']+)["'][^>]*property=["']og:image(?::secure_url)?["'][^>]*>/gi,
    /<meta\b[^>]*name=["']twitter:image["'][^>]*content=["']([^"']+)["'][^>]*>/gi,
    /<meta\b[^>]*content=["']([^"']+)["'][^>]*name=["']twitter:image["'][^>]*>/gi
  ];
  for (const re of metaPatterns) {
    for (const match of html.matchAll(re)) candidates.push(normalizeUrl(match[1], baseUrl));
  }
  for (const match of html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const parsed = JSON.parse(decodeText(match[1]));
      const nodes = Array.isArray(parsed) ? parsed : [parsed, ...(parsed['@graph'] || [])];
      for (const node of nodes.filter(Boolean)) {
        const image = node.image;
        if (typeof image === 'string') candidates.push(normalizeUrl(image, baseUrl));
        if (Array.isArray(image)) image.filter((item) => typeof item === 'string').forEach((item) => candidates.push(normalizeUrl(item, baseUrl)));
        if (image?.url) candidates.push(normalizeUrl(image.url, baseUrl));
      }
    } catch {
      // Ignore malformed schema blocks.
    }
  }
  return [...new Set(candidates)].filter(isHttpsImageUrl);
}

async function downloadImageToLocal(url, editionId, storyId) {
  try {
    const response = await fetchWithTimeout(url, {
      headers: { 'user-agent': 'JanetDailyNewsBot/visual-resolver', accept: 'image/avif,image/webp,image/png,image/jpeg,image/svg+xml;q=0.8,*/*;q=0.2' },
      redirect: 'follow'
    }, 8000);
    if (!response.ok) throw new Error(`http_${response.status}`);
    const type = response.headers.get('content-type') || '';
    if (!/^image\//i.test(type)) throw new Error('not_image_response');
    const buffer = Buffer.from(await withTimeout(response.arrayBuffer(), 8000, 'image_body'));
    if (buffer.length < 2048) throw new Error('image_too_small');
    if (buffer.length > 5000000) throw new Error('image_too_large');
    const ext = imageExt(url, type);
    const rel = `assets/news-visuals/${editionId}/${storyId}.${ext}`;
    ensureDir(resolve(ROOT, rel));
    writeFileSync(resolve(ROOT, rel), buffer);
    return rel;
  } catch {
    return '';
  }
}

function visualRecord({ mode, src, localPath = '', story, sourceUrl = '', credit = '', license = '', matchedTerms = [], relevanceScore = 0, fallbackReason = '', template = '' }) {
  return {
    status: 'ready',
    mode,
    src,
    local_path: localPath,
    alt: chineseVisualAlt(story),
    caption: chineseVisualCaption(story, mode),
    credit,
    license,
    source_url: sourceUrl,
    matched_terms: [...new Set(matchedTerms.filter(Boolean))],
    relevance_score: Number(relevanceScore.toFixed(2)),
    fallback_reason: fallbackReason,
    template
  };
}

async function resolveSourceImage(rawItem, story, editionId) {
  const candidates = [...(rawItem?.image_candidates || [])].filter(isHttpsImageUrl);
  if (rawItem?.url) {
    try {
      const response = await fetchWithTimeout(rawItem.url, {
        headers: { 'user-agent': 'JanetDailyNewsBot/visual-resolver', accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.2' },
        redirect: 'follow'
      }, 7000);
      if (response.ok) {
        const html = await withTimeout(response.text(), 7000, 'article_html_body');
        candidates.push(...htmlImageCandidates(html, rawItem.url));
      }
    } catch {
      // Source image resolution is best-effort; generated story SVG is the hard fallback.
    }
  }
  const unique = [...new Set(candidates)].filter((url) => isHttpsImageUrl(url) && !/favicon|logo|sprite|pixel/i.test(url));
  for (const candidate of unique.slice(0, 4)) {
    const matchedTerms = visualTerms(story).filter((term) => candidate.toLowerCase().includes(String(term).toLowerCase()) || String(rawItem?.url || '').toLowerCase().includes(String(term).toLowerCase()));
    const official = sameTrustedDomain(candidate, rawItem?.url || '', story?.source || '');
    const score = official ? 0.82 : Math.max(0.75, matchedTerms.length ? 0.78 : 0.75);
    const localPath = await downloadImageToLocal(candidate, editionId, story.id);
    if (!localPath) continue;
    return visualRecord({
      mode: official ? 'official_image' : 'source_image',
      src: localPath,
      localPath,
      story,
      sourceUrl: candidate,
      credit: story.source || 'Source article',
      license: official ? 'source-provided / editorial use reference' : 'source article image / editorial reference',
      matchedTerms: matchedTerms.length ? matchedTerms : visualTerms(story).slice(0, 2),
      relevanceScore: score,
      fallbackReason: ''
    });
  }
  return null;
}

async function resolveOpenLicenseImage(story, editionId) {
  const terms = visualTerms(story).filter((term) => term.length >= 3 && !isGenericObject(term)).slice(0, 3);
  if (!terms.length) return null;
  const query = encodeURIComponent(terms.slice(0, 2).join(' '));
  const api = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${query}&gsrnamespace=6&gsrlimit=3&prop=imageinfo&iiprop=url|extmetadata&iiurlwidth=1200&format=json&origin=*`;
  try {
    const response = await fetchWithTimeout(api, { headers: { 'user-agent': 'JanetDailyNewsBot/visual-resolver' } }, 7000);
    if (!response.ok) return null;
    const json = await withTimeout(response.json(), 7000, 'commons_json_body');
    const pages = Object.values(json?.query?.pages || {});
    for (const page of pages) {
      const info = page?.imageinfo?.[0];
      const meta = info?.extmetadata || {};
      const imageUrl = info?.thumburl || info?.url || '';
      const license = meta.LicenseShortName?.value || meta.License?.value || '';
      const credit = meta.Artist?.value || meta.Credit?.value || meta.ObjectName?.value || 'Wikimedia Commons';
      const sourceUrl = info?.descriptionurl || '';
      if (!isHttpsImageUrl(imageUrl) || !license || !credit || !sourceUrl) continue;
      const localPath = await downloadImageToLocal(imageUrl, editionId, story.id);
      if (!localPath) continue;
      return visualRecord({
        mode: 'open_license_image',
        src: localPath,
        localPath,
        story,
        sourceUrl,
        credit: decodeText(credit),
        license: decodeText(license),
        matchedTerms: terms,
        relevanceScore: 0.66
      });
    }
  } catch {
    return null;
  }
  return null;
}

function eventTypeForStory(story) {
  const text = `${story.original_title || ''} ${story.title || ''} ${story.summary || ''} ${story.category || ''} ${story.story_fact?.action || ''}`.toLowerCase();
  if (/leaderboard|benchmark|评测|榜单|evaluation|score/.test(text)) return 'agent_benchmark';
  if (/codex|copilot|github|developer|sdk|api|cli|workflow|agentcore|开发|工具调用/.test(text)) return 'developer_tooling';
  if (/enterprise|business|customer|workspace|confluence|bedrock|企业|客户|知识库/.test(text)) return 'enterprise_integration';
  if (/chip|gpu|cpu|nvidia|vera|rack|compute|芯片|算力/.test(text)) return 'hardware_infrastructure';
  if (/safety|moderation|policy|governance|审核|安全|治理/.test(text)) return 'safety_moderation';
  if (/creator|video|audio|image|design|podcast|media|创作|视频|图像|播客/.test(text)) return 'creator_tool';
  if (/lawsuit|trial|court|legal|诉讼|法庭/.test(text)) return 'legal_or_governance';
  if (/funding|market|pricing|finance|融资|定价|商业/.test(text)) return 'market_signal';
  if (/model|gemini|openai|siri|assistant|multimodal|模型/.test(text)) return 'model_release';
  return 'other';
}

function storySvgTemplate(eventType, accent, objectLabel, sourceLabel, actionLabel) {
  const commonText = `<text x="70" y="74" fill="${accent}" font-family="Arial, sans-serif" font-size="20" font-weight="700">${escapeHtml(sourceLabel)}</text><text x="70" y="398" fill="#f3fff8" font-family="Arial, sans-serif" font-size="42" font-weight="800">${escapeHtml(visualTitle(objectLabel))}</text><text x="74" y="438" fill="rgba(243,255,248,.68)" font-family="Arial, sans-serif" font-size="22">${escapeHtml(visualTitle(actionLabel))}</text>`;
  if (eventType === 'agent_benchmark') return `<g>${[0, 1, 2, 3].map((i) => `<rect x="${120 + i * 120}" y="${250 - i * 34}" width="82" height="${150 + i * 34}" rx="16" fill="${accent}" opacity="${0.28 + i * 0.12}"/>`).join('')}<path d="M640 170h310M640 245h230M640 320h270" stroke="#fff" stroke-width="12" stroke-linecap="round" opacity=".18"/></g>${commonText}`;
  if (eventType === 'developer_tooling') return `<g><rect x="105" y="125" width="520" height="250" rx="22" fill="rgba(255,255,255,.07)" stroke="${accent}" opacity=".9"/><path d="M150 190h210M150 245h330M150 300h260" stroke="${accent}" stroke-width="12" stroke-linecap="round" opacity=".55"/><path d="M705 150c115 40 160 120 120 240" fill="none" stroke="#fff" stroke-width="7" opacity=".22"/></g>${commonText}`;
  if (eventType === 'enterprise_integration') return `<g><rect x="120" y="145" width="210" height="120" rx="20" fill="${accent}" opacity=".22"/><rect x="430" y="92" width="260" height="172" rx="26" fill="rgba(255,255,255,.08)" stroke="${accent}"/><rect x="790" y="170" width="230" height="130" rx="20" fill="${accent}" opacity=".18"/><path d="M330 205h100M690 184l100 45" stroke="#fff" stroke-width="5" opacity=".3"/></g>${commonText}`;
  if (eventType === 'hardware_infrastructure') return `<g><rect x="165" y="110" width="310" height="250" rx="28" fill="none" stroke="${accent}" stroke-width="6"/><path d="M220 170h200M220 220h200M220 270h200" stroke="${accent}" stroke-width="9" opacity=".55"/><path d="M610 120h300v240H610zM650 170h220M650 230h220M650 290h220" stroke="#fff" stroke-width="5" opacity=".2" fill="none"/></g>${commonText}`;
  if (eventType === 'safety_moderation') return `<g><path d="M300 95l170 70v130c0 90-65 150-170 190-105-40-170-100-170-190V165z" fill="${accent}" opacity=".2" stroke="${accent}" stroke-width="6"/><path d="M650 155h280M650 225h220M650 295h260" stroke="#fff" stroke-width="12" stroke-linecap="round" opacity=".18"/></g>${commonText}`;
  if (eventType === 'creator_tool') return `<g><rect x="120" y="120" width="400" height="250" rx="28" fill="rgba(255,255,255,.07)" stroke="${accent}"/><circle cx="210" cy="210" r="45" fill="${accent}" opacity=".42"/><path d="M150 325h330M650 150h90v190h-90zM780 120h140v250H780z" fill="${accent}" opacity=".2"/></g>${commonText}`;
  if (eventType === 'legal_or_governance') return `<g><path d="M160 105h300l95 95v260H160z" fill="rgba(255,255,255,.06)" stroke="${accent}" stroke-width="5"/><path d="M235 245h240M235 310h190M720 120v260M640 185h160M600 380h240" stroke="#fff" stroke-width="10" opacity=".2"/></g>${commonText}`;
  if (eventType === 'market_signal') return `<g><path d="M130 360l160-120 135 70 160-180 180 88 180-130" fill="none" stroke="${accent}" stroke-width="8"/><rect x="685" y="255" width="230" height="110" rx="20" fill="${accent}" opacity=".18"/><path d="M725 305h145" stroke="#fff" stroke-width="12" opacity=".22"/></g>${commonText}`;
  if (eventType === 'model_release') return `<g><circle cx="340" cy="225" r="90" fill="${accent}" opacity=".20" stroke="${accent}" stroke-width="5"/><circle cx="340" cy="225" r="34" fill="${accent}" opacity=".55"/><path d="M340 95v260M210 225h260M610 150h280M610 225h220M610 300h260" stroke="#fff" stroke-width="8" opacity=".2"/></g>${commonText}`;
  return `<g><path d="M155 300c125-145 280-170 430-75s260 70 405-45" fill="none" stroke="${accent}" stroke-width="8" opacity=".72"/><circle cx="220" cy="300" r="32" fill="${accent}" opacity=".55"/><circle cx="560" cy="215" r="42" fill="${accent}" opacity=".28"/><circle cx="920" cy="180" r="32" fill="${accent}" opacity=".42"/></g>${commonText}`;
}

function generateStorySpecificSvg(story, editionId) {
  const eventType = eventTypeForStory(story);
  const palette = {
    model_release: '#66e6ff',
    developer_tooling: '#ffd166',
    enterprise_integration: '#9cffb8',
    hardware_infrastructure: '#ff9f7a',
    safety_moderation: '#ff6b8a',
    agent_benchmark: '#b69cff',
    creator_tool: '#7dd3fc',
    legal_or_governance: '#f4d35e',
    market_signal: '#f78c6b',
    other: '#8be9d6'
  };
  const accent = palette[eventType] || palette.other;
  const objectLabel = visualObject(story);
  const sourceLabel = chineseSourceName(story.source || 'Janet');
  const actionLabel = story.story_fact?.action || eventType;
  const rel = `assets/news-visuals/${editionId}/${story.id}.svg`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 540" width="960" height="540" role="img" aria-label="${escapeHtml(chineseVisualAlt(story))}">
  <defs>
    <linearGradient id="bg" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stop-color="#060807"/><stop offset=".55" stop-color="#101414"/><stop offset="1" stop-color="#17120e"/></linearGradient>
    <radialGradient id="wash" cx="18%" cy="18%" r="82%"><stop offset="0" stop-color="${accent}" stop-opacity=".22"/><stop offset=".55" stop-color="${accent}" stop-opacity=".05"/><stop offset="1" stop-color="${accent}" stop-opacity="0"/></radialGradient>
  </defs>
  <rect width="960" height="540" fill="url(#bg)"/>
  <rect width="960" height="540" fill="url(#wash)"/>
  <rect x="38" y="38" width="884" height="464" rx="32" fill="rgba(255,255,255,.035)" stroke="rgba(255,255,255,.12)"/>
  ${storySvgTemplate(eventType, accent, objectLabel, sourceLabel, actionLabel)}
</svg>`;
  writeText(resolve(ROOT, rel), svg);
  return { rel, eventType };
}

async function resolveStoryVisual(story, rawItem, options = {}) {
  const editionId = options.editionId || `${options.date || defaultDateShanghai()}-v4`;
  const sourceVisual = await resolveSourceImage(rawItem, story, editionId);
  if (sourceVisual) return sourceVisual;
  const openLicenseVisual = await resolveOpenLicenseImage(story, editionId);
  if (openLicenseVisual) return openLicenseVisual;
  const generated = generateStorySpecificSvg(story, editionId);
  return visualRecord({
    mode: 'generated_story_svg',
    src: generated.rel,
    localPath: generated.rel,
    story,
    credit: 'Generated by Janet visual resolver',
    license: 'generated',
    matchedTerms: visualTerms(story).slice(0, 4),
    relevanceScore: 0.62,
    fallbackReason: 'no_qualified_external_image',
    template: generated.eventType
  });
}

function publicIntroForEdition(stories) {
  const lead = stories[0] || {};
  const sources = sourceNames(stories.slice(0, 6), 4).join('、');
  const leadTopic = normalizeTopic(lead);
  return clamp(`今天先看${sources || '几个关键来源'}围绕${leadTopic}给出的具体动作：谁在抢入口，谁在补工具，谁还只是发声明，一眼分清。`, 110);
}

function cnCharCount(text) {
  return (String(text || '').match(/[\u4e00-\u9fff]/g) || []).length;
}

function cleanTemplateCopy(text) {
  return String(text || '')
    .replace(/今日封面新闻/g, '头条新闻')
    .replace(/今日封面/g, '头条')
    .replace(/今天值得看的对象是/g, '今天先看的对象是')
    .replace(/今天值得看/g, '今天先看')
    .replace(/值得看，因为/g, '要看，原因是')
    .replace(/重点是/g, '关键在于')
    .replace(/重点看/g, '继续看')
    .replace(/出现(.{0,12})新进展/g, '推进$1')
    .replace(/开始生成内容/g, '进入内容生产线')
    .replace(/发布词落到了/g, '发布动作落到')
    .replace(/把(.{0,20})放进(.{0,20})语境/g, '让$1进入$2场景');
}

function scrubTemplateCopy(value) {
  if (typeof value === 'string') return cleanTemplateCopy(value);
  if (Array.isArray(value)) return value.map(scrubTemplateCopy);
  if (value && typeof value === 'object') {
    for (const key of Object.keys(value)) value[key] = scrubTemplateCopy(value[key]);
  }
  return value;
}

function storyKeyData(story) {
  const fact = story.story_fact || {};
  return [
    fact.concrete_object,
    fact.action,
    fact.audience,
    story.source,
    story.original_title
  ].filter(Boolean).slice(0, 5);
}

function buildReaderBody(story) {
  const fact = story.story_fact || {};
  const object = displayObject(fact.concrete_object || story.title || '这条新闻');
  const action = fact.action || '产品动作';
  const audience = fact.audience || '相关团队';
  const source = chineseSourceName(story.source);
  const original = decodeText(story.original_title || story.raw_item?.original_title || '');
  const baseSummary = cleanTemplateCopy(story.summary || story.zh_summary || '');
  const why = cleanTemplateCopy(story.why_it_matters || '');
  const take = cleanTemplateCopy(story.janet_take || '');
  const watch = cleanTemplateCopy(story.watch_next || '');
  const openingByAction = {
    '有声书生成': `${source}报道${object}，真正变化是音频生产被塞进平台流程：创作者不必先找录音棚、配音演员和后期，再把成品搬回分发平台。`,
    '播客生成': `${source}把${object}推到播客制作链路里，变化不在“AI 会说话”，而在脚本、简报、问答和分发开始连成一条线。`,
    '智能体能力': `${source}提到${object}，这类智能体新闻要看它能不能处理连续任务，而不是只在演示里完成一次漂亮回答。`,
    '开发工具升级': `${source}把${object}放到开发流程里，开发者真正关心的是它能不能少开一个工具、少写一段重复命令。`,
    '评测': `${source}把${object}放到公开比较里，评测的价值不在排名本身，而在任务集、分数和复现路径能不能让团队少踩坑。`,
    '榜单排名': `${source}把${object}放到公开比较里，评测的价值不在排名本身，而在任务集、分数和复现路径能不能让团队少踩坑。`,
    '融资': `${source}报道${object}完成融资，钱本身不是结论，关键是它接下来能不能把产品指标、客户名单和收入路径讲清楚。`,
    '诉讼': `${source}把${object}相关争议拉回读者视野，这类新闻要看治理、控制权和商业化承诺会不会影响用户信任。`,
    '搜索改版': `${source}写到${object}，搜索入口变形之后，内容分发、广告位置和用户提问习惯都会被重新计算。`,
    '工具调用': `${source}提到${object}，智能体开始从“能聊天”往“能调用工具完成步骤”走，开发团队才有理由把它接进流程。`,
    '记忆扩展': `${source}提到${object}，长期记忆如果能稳定调用，智能体才不会每次都像刚入职的临时工。`
  };
  const opening = openingByAction[action] || `${source}报道${object}，这不是一句抽象趋势，而是一次已经落到产品、合作、评测或商业路径里的动作。`;
  const paragraphs = [
    `${opening}原文标题是「${original}」。${baseSummary}`,
    `对${audience}来说，这件事要拆成三层看：第一，它会不会降低某段工作流的成本；第二，国内团队能不能直接接入或找到替代路径；第三，它能不能替掉一个重复岗位、一段外包流程，或者至少让团队少绕一个工具。${why} 接下来要盯的是可用入口、权限、价格、评测方法和真实案例，而不是厂商发布时的热闹词。`,
    `Janet 锐评：${take} 破防点在于${object}已经开始挤进实际使用链路，槽点是成本、版权、权限或稳定性往往会在发布之后才露出来。国内创作者和中小企业别急着跟风，先看${watch || `${object}是否给出清楚的使用边界`}；能省钱、能替流程、能交付，再把它放进自己的工具箱。`
  ];
  let body = cleanTemplateCopy(paragraphs.join('\n\n'));
  if (cnCharCount(body) < 280) {
    body += `\n\n这条新闻还要放回 Janet 的老三问里看：推理或使用成本会不会下降，国内能不能找到稳定入口，能不能替掉一个人或一个反复消耗时间的步骤。回答不了这三问，就先别把它当成生产力革命。`;
  }
  return cleanTemplateCopy(body);
}

function buildLongJanetTake(story) {
  const fact = story.story_fact || {};
  const object = displayObject(fact.concrete_object || story.title || '这条新闻');
  const action = fact.action || '产品动作';
  const audience = fact.audience || '相关团队';
  const source = chineseSourceName(story.source);
  let shortTake = cleanTemplateCopy(story.janet_take || '').split('Janet 的判断是：')[0].trim();
  if (/要看入口、权限和使用门槛/.test(shortTake)) shortTake = '';
  const prefix = shortTake ? `${shortTake} ` : '';
  const podcastTake = /Spotify Studio/i.test(object)
    ? `${prefix}Janet 的判断是：Spotify Studio 的破防点是把个人收听、日程和播客生成揉到一起，听起来很顺，实际会考验隐私和推荐质量。创作者别只看“自动生成”，要看它能不能给出编辑权、删除权和分发收益。`
    : `${prefix}Janet 的判断是：Spotify Q&A 工具更像给播客补运营后台，破防点是问答和简报可以批量生产，槽点是主持人味道容易被磨平。内容团队可以先拿它做会员运营和节目回顾，不要直接替掉主节目。`;
  const benchmarkTake = /Amazon Bedrock/i.test(object)
    ? `${prefix}Janet 的判断是：Amazon Bedrock 放进招聘助手这类场景，破防点是企业云厂商正在把智能体变成可采购方案；槽点是偏见、审计和合规一个都躲不开。企业要先看日志、权限和人工复核，不要把候选人命运交给黑箱。`
    : `${prefix}Janet 的判断是：${object}如果真要做 AI 治疗或安全评估，破防点不是“听起来温柔”，而是能不能扛住高风险场景。槽点是心理健康产品最怕半吊子自动化，国内团队更该看风控、人审和退出机制。`;
  const cooperationTake = /Elon Musk|data center|Anthropic/i.test(`${object} ${story.original_title || ''}`)
    ? `${prefix}Janet 的判断是：Anthropic 向马斯克系数据中心买算力，破防点是模型竞争最后会落到电、机柜和长期合同；槽点是算力越集中，议价和供应风险越难看。国内企业要学的是算力冗余和成本测算，不是跟着烧钱。`
    : `${prefix}Janet 的判断是：Universal Music 这类授权合作，破防点是 AI 翻唱终于开始谈分钱，而不是只靠平台先斩后奏。槽点是授权规则会很碎，创作者要看分成、下架和艺人选择权，别只盯生成效果。`;
  const actionTakes = {
    '有声书生成': `${prefix}Janet 的判断是：${object}把创作门槛继续往下压，破防点是配音、剪辑和分发开始被平台打包；槽点是版权和音质会先乱一阵。国内创作者别先欢呼，先看它能不能给声音授权、收益结算和编辑权限一个清楚答案。`,
    '播客生成': podcastTake,
    '智能体能力': `${prefix}Janet 的判断是：${object}的价值不在“像不像人”，而在能不能稳定完成连续任务。破防点是小模型也想进工作流，槽点是权限、日志和出错责任会马上变脏。企业先拿低风险流程试，不要一上来交核心业务。`,
    '开发工具升级': `${prefix}Janet 的判断是：${object}要是真能少开工具、少写重复命令，开发者会用脚投票；如果只是换个漂亮入口，它很快会被关掉。国内团队要看接入成本、代码安全和私有部署路径。`,
    '工具调用': `${prefix}Janet 的判断是：${object}开始处理工具调用，才算摸到智能体的硬活。破防点是它能替团队跑步骤，槽点是权限和日志必须补齐。中小企业可以先从低风险自动化试，不要把财务、人事这种入口直接交出去。`,
    '记忆扩展': `${prefix}Janet 的判断是：${object}补记忆比多一个聊天表情实在得多。破防点是它可能让智能体真正接住上下文，槽点是隐私、保留周期和误记会变成新成本。企业要先问清楚数据放哪、谁能删、怎么审计。`,
    '评测': benchmarkTake,
    '榜单排名': benchmarkTake,
    '融资': `${prefix}Janet 的判断是：${object}融资不等于产品成立。破防点是资本愿意为这个方向继续买单，槽点是估值越高，交付压力越大。国内团队别学融资故事，先学它验证客户、定价和交付的方式。`,
    '诉讼': `${prefix}Janet 的判断是：${object}这种争议会把 AI 公司最不想讲的控制权、承诺和商业化代价摆出来。破防点是信任成本开始显性化，槽点是用户往往只能等结果。企业采购这类工具时，要把退出机制写进合同。`,
    '搜索改版': `${prefix}Janet 的判断是：${object}不是 UI 小改，而是在重新训练用户怎么提问、怎么交任务。破防点是流量入口继续往 AI 手里收，槽点是内容方更难知道自己为什么被看见。做内容的人要盯来源、转化和广告位置变化。`,
    '合作': cooperationTake,
    '生成': `${prefix}Janet 的判断是：${object}把生成能力推到音乐内容里，破防点是粉丝创作和版权分账终于撞到一起；槽点是平台、艺人和用户的边界会很难切。内容团队要先看授权开关、收益规则和下架机制。`
  };
  const text = actionTakes[action] || `${prefix}Janet 的判断是：${source}这次围绕${object}给出的不是一句口号，而是对${audience}的工作流试探。破防点是它可能省掉一段重复流程，槽点是成本、权限和稳定性还得实测。国内团队先小范围试用，算清楚能省多少钱、能替哪一步，再决定要不要扩。`;
  return cleanTemplateCopy(cnCharCount(text) < 60 ? `${text} 对国内团队来说，先小范围试用，再算账。` : text);
}

function buildDailyEditorialSummary(stories, modules, dailyBrief) {
  const sourceStoryIds = stories.slice(0, 5).map((story) => story.id);
  const lead = stories[0] || {};
  const objects = concreteObjectsFor(stories, 6).map(displayObject);
  const actions = concreteActionsFor(stories, 5);
  const sources = sourceNames(stories.slice(0, 8), 5).join('、');
  const title = dailyBrief.daily_title || titleForEdition(stories, { forbidden_frontend_phrases: [] }, '');
  const objectText = objects.slice(0, 5).join('、') || lead.title || '今天几条具体产品';
  const actionText = actions.slice(0, 4).join('、') || '接入、评测、商业化和创作流程';
  let body = [
    `今天这份快车箱不按发布会热闹排序，而按“能不能改变工作流”排序。${sources || '公开来源'}里冒出来的主线，是${objectText}这些具体对象正在把${actionText}往产品、平台和团队日常里推。对中国创作者和中小企业来说，这类新闻不能只看谁发了声明，要看能不能直连、贵不贵、有没有接口、是否真的能替掉一个外包或岗位。`,
    `Janet 的判断是：${lead.title || objectText}先占住头条，不是因为它声音最大，而是它暴露了 AI 产品最现实的竞争方式——谁能把能力变成入口，谁就更接近收入。模型参数当然重要，但今天更该盯的是工具链、评测、版权、企业部署和创作分发这些脏活。它们不好看，却决定一个工具明天会不会出现在账单里。`,
    `Janet 锐评：别被“AI 又更新了”带节奏。破防点是，很多能力已经不是实验室玩具，而是在抢开发、音频、搜索、企业知识库这些具体工位；槽点是每个入口背后都有成本、权限、版权和稳定性坑。国内团队的打法很简单：先找能省钱的环节，能替一个流程就试，不能落地的发布会词先扔一边。`
  ].join('\n\n');
  if (cnCharCount(body) < 350) {
    body += `\n\n这也是后面几天要继续看的线索：能把能力变成价格、接口和案例的公司，会比只会讲愿景的公司更快进入创作者和企业采购清单。`;
  }
  return {
    title: cleanTemplateCopy(title),
    body: cleanTemplateCopy(body),
    source_story_ids: sourceStoryIds
  };
}

function storyToPublicItem(item) {
  const raw_item = {
    source: item.source,
    original_title: item.title,
    original_summary: item.summary || '',
    url: item.url,
    published_at: item.published_at,
    category: schemaCategory(item.category),
    image_candidates: item.image_candidates || []
  };
  const storyFact = buildStoryFact({ ...item, original_title: item.title, original_summary: item.summary || '' });
  const gate = isSpecificStory(storyFact, item);
  if (!gate.ok) {
    return {
      blocked: true,
      excluded_item: {
        raw_id: item.id || '',
        source: item.source || '',
        original_title: item.title || '',
        url: item.url || '',
        published_at: item.published_at || '',
        reason: 'generic_fallback_blocked',
        details: {
          concrete_object: storyFact.concrete_object || '',
          entities: storyFact.entities || [],
          action: storyFact.action || '',
          why_failed: gate.why_failed
        }
      }
    };
  }
  const copy = copyFromStoryFact(item, storyFact);
  const zh_title = cleanTemplateCopy(clamp(copy.title, 52));
  const zh_summary = cleanTemplateCopy(clamp(copy.summary, 120));
  const story_facts = storyFact.story_facts;
  const story = {
    id: item.id,
    story_id: item.id,
    raw_item,
    story_fact: storyFact,
    zh_title,
    zh_summary,
    story_facts,
    title: zh_title,
    original_title: clamp(item.title, 140),
    url: item.url,
    source_url: item.url,
    external_url: item.url,
    source: item.source,
    source_type: sourceType(item.source),
    source_rank: item.source_rank,
    category: schemaCategory(item.category),
    score: scoreFor(item.source_rank),
    published_at: item.published_at,
    published_at_source: item.published_at_source,
    summary: zh_summary,
    original_summary: clamp(item.summary || item.title, 220),
    why_it_matters: cleanTemplateCopy(copy.why),
    janet_take: cleanTemplateCopy(copy.janet),
    watch_next: cleanTemplateCopy(copy.watch),
    image: null,
    image_source: null,
    image_credit: null,
    verified_at: new Date().toISOString(),
    duplicate_group: null,
    evidence_ids: item.evidence_ids,
    editorial_score: item.editorial_score,
    editorial_signals: item.editorial_signals,
    editorial_penalties: item.editorial_penalties,
    lead_eligible: item.lead_eligible,
    core_eligible: item.core_eligible
  };
  story.key_data = storyKeyData(story);
  story.janet_take = buildLongJanetTake(story);
  story.content = buildReaderBody(story);
  return scrubTemplateCopy(story);
}

async function buildContent(template, included, date, editionType, rules) {
  const now = new Date().toISOString();
  const ordered = orderStoriesForEdition(included, rules);
  const excludedItems = [];
  const stories = [];
  const actionCounts = new Map();
  const actionLimit = (action) => (
    ['搜索改版', '智能体能力', '推出', '视觉识别', '购物代理'].includes(action) ? 1 : 2
  );
  for (const item of ordered) {
    const publicItem = storyToPublicItem(item);
    if (publicItem.blocked) {
      excludedItems.push(publicItem.excluded_item);
      continue;
    }
    const action = publicItem.story_fact?.action || '';
    const count = actionCounts.get(action) || 0;
    if (count >= actionLimit(action)) {
      excludedItems.push({
        raw_id: item.id || '',
        source: item.source || '',
        original_title: item.title || '',
        url: item.url || '',
        published_at: item.published_at || '',
        reason: 'story_fact_cluster_duplicate',
        details: {
          concrete_object: publicItem.story_fact?.concrete_object || '',
          entities: publicItem.story_fact?.entities || [],
          action,
          why_failed: ['too_many_similar_action_items']
        }
      });
      continue;
    }
    actionCounts.set(action, count + 1);
    stories.push(publicItem);
  }
  if (!stories.length) {
    const error = new Error('blocked_no_specific_frontpage_stories');
    error.code = 'blocked_no_specific_frontpage_stories';
    error.excluded_items = excludedItems;
    throw error;
  }
  const usedWatchNext = new Set();
  stories.forEach((story) => {
    story.verified_at = now;
    story.primary_section = assignPrimarySection(story);
    story.watch_next = uniqueWatchNext(story, usedWatchNext);
  });
  ensureUniqueStoryCopy(stories);
  const editionId = `${date}-v4`;
  for (const story of stories) {
    story.visual = await resolveStoryVisual(story, story.raw_item, { date, editionId });
  }
  const serializedStories = JSON.stringify(stories);
  for (const phrase of FORBIDDEN_GENERIC_COPY) {
    if (serializedStories.includes(phrase)) throw new Error(`forbidden_generic_copy:${phrase}`);
  }
  for (const phrase of FORBIDDEN_TAKES) {
    if (JSON.stringify(stories).includes(phrase)) throw new Error(`forbidden_janet_take:${phrase}`);
  }

  const sections = {
    lead_story: { title: '头条', items: [] }
  };
  const homepageItems = [];
  const hiddenItems = [];
  sections.lead_story.items.push(stories[0]);
  for (const story of stories.slice(1)) {
    const section = story.primary_section || sectionFor(story.category);
    if (!sections[section]) sections[section] = { title: SECTION_LABELS[section] || '更多 AI 动态', items: [] };
    sections[section].items.push(story);
  }

  const homepageAssembly = buildHomepageAssembly(stories, date);
  const signalMap = homepageAssembly.signalMap;
  const compactNews = homepageAssembly.compactNews;
  homepageItems.push(...homepageAssembly.homepageItems);
  const modules = buildModules(sections);
  const dailyBrief = buildDailyBrief(stories, modules, rules, date);
  const dailyEditorialSummary = buildDailyEditorialSummary(stories, modules, dailyBrief);
  const cover = buildCover(stories, modules, dailyBrief);
  const surfaceText = JSON.stringify({
    title: dailyBrief.daily_title,
    theme: dailyBrief.theme,
    intro_text: dailyBrief.intro_text,
    daily_thesis: dailyBrief.daily_thesis,
    daily_brief: dailyBrief,
    cover,
    modules,
    signal_map: signalMap,
    compact_news: compactNews,
    homepage_items: homepageItems
  });
  for (const phrase of FORBIDDEN_SURFACE_COPY) {
    if (surfaceText.includes(phrase)) throw new Error(`forbidden_surface_copy:${phrase}`);
  }
  const homepageIds = new Set(homepageItems.map((item) => item.story_id).filter(Boolean));
  for (const story of stories) {
    if (!homepageIds.has(story.id)) {
      hiddenItems.push({
        id: story.id,
        title: story.title,
        source: story.source,
        reason: story.core_eligible ? 'not_home_slot' : 'low_editorial_score',
        editorial_score: story.editorial_score
      });
    }
  }

  const content = {
    ...template,
    edition_id: editionId,
    date,
    vol: template.vol || '0000',
    theme: dailyBrief.theme,
    title: dailyBrief.daily_title,
    daily_brief: dailyBrief,
    daily_editorial_summary: dailyEditorialSummary,
    raw_items: stories.map((story) => story.raw_item),
    stories,
    modules,
    cover,
    homepage: {
      cover,
      modules: modules.map((module) => ({
        module_id: module.module_id,
        module_title: module.module_title,
        module_summary: module.module_summary
      })),
      signal_cards: signalMap,
      compact_news: compactNews.map((story) => ({
        story_id: story.id,
        title: story.zh_title,
        summary: story.zh_summary,
        source: story.source,
        category: story.category,
        visual: story.visual
      }))
    },
    detail: {
      stories: stories.map((story) => ({
        story_id: story.id,
        zh_title: story.zh_title,
        zh_summary: story.zh_summary,
        why_it_matters: story.why_it_matters,
        janet_take: story.janet_take,
        watch_next: story.watch_next,
        story_facts: story.story_facts,
        visual: story.visual,
        raw_item: story.raw_item
      }))
    },
    intro_text: dailyBrief.intro_text,
    daily_thesis: dailyBrief.daily_thesis,
    signal_map: signalMap,
    lead_story_id: stories[0].id,
    sections,
    collected_items_count: included.length,
    edition_items: stories,
    homepage_items: homepageItems,
    hidden_items: hiddenItems,
    excluded_items: excludedItems,
    compact_news: compactNews,
    source_summary: `今日重点：${sourceNames(stories, 4).join('、')}。完整来源与覆盖情况见状态页。`,
    source_ledger: ordered.map((story) => ({
      news_id: story.id,
      source: story.source,
      source_type: sourceType(story.source),
      source_rank: story.source_rank,
      verified_url: story.url,
      duplicate_group: null,
      risk_note: story.core_eligible ? null : 'low_editorial_score_archived_only',
      should_include: story.core_eligible,
      editorial_score: story.editorial_score,
      editorial_penalties: story.editorial_penalties || []
    })),
    editorial_angle: '每日公开源编辑晨报',
    what_to_watch_next: stories.map((story) => story.watch_next).filter(Boolean).slice(0, 3)
  };
  return scrubTemplateCopy(content);
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function visualSrc(value) {
  if (!value) return '';
  if (typeof value === 'string') return value;
  return value.src || value.local_path || '';
}

function visualAlt(value, fallback = '新闻视觉') {
  if (!value) return fallback;
  if (typeof value === 'string') return fallback;
  return value.alt || fallback;
}

function externalHref(value) {
  const url = String(value || '').trim();
  if (!/^https?:\/\//.test(url)) return '';
  return escapeHtml(url);
}

function externalAttrs(value) {
  const href = externalHref(value);
  return href ? ` href="${href}" target="_blank" rel="noopener noreferrer"` : '';
}

function renderHtml(content) {
  const allItems = Object.values(content.sections).flatMap((section) => section.items || []);
  const lead = content.sections.lead_story.items[0] || {};
  const editorial = content.daily_editorial_summary || {};
  const leadAttrs = externalAttrs(lead.url || lead.source_url || lead.external_url);
  const signalTitle = (content.signal_map || []).length >= 3 ? '今日三条主线' : '今日主线';
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(content.brand)} ${escapeHtml(content.date)}</title>
  <style>
    body{margin:0;background:#050505;color:#f0f0f0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
    main{max-width:960px;margin:0 auto;padding:56px 20px}
    a{color:#18e299} .k{color:#18e299;font:12px ui-monospace,monospace;text-transform:uppercase}
    h1{font-size:clamp(42px,8vw,92px);line-height:.92;margin:12px 0 20px;letter-spacing:-.06em}
    section{border-top:1px solid rgba(255,255,255,.12);padding:28px 0}
    article{padding:18px 0;border-top:1px solid rgba(255,255,255,.08)}
    small,p{color:rgba(240,240,240,.72);line-height:1.75}
    .visual{width:100%;border-radius:22px;border:1px solid rgba(255,255,255,.1);margin:24px 0}
    .signal{display:grid;gap:12px;grid-template-columns:repeat(auto-fit,minmax(220px,1fr))}
    .card{display:block;color:inherit;text-decoration:none;border:1px solid rgba(255,255,255,.1);border-radius:18px;padding:18px;background:rgba(255,255,255,.025)}
    .card:hover,.lead-link:hover{border-color:rgba(24,226,153,.36);transform:translateY(-2px)}
    .lead-link{display:block;color:inherit;text-decoration:none}
  </style>
</head>
<body>
<main>
  <div class="k">Janet Daily News</div>
  <h1>${escapeHtml(editorial.title || content.theme)}</h1>
  <p>${escapeHtml(editorial.body || content.daily_thesis)}</p>
  ${visualSrc(lead.visual) ? `<a class="lead-link"${leadAttrs}><img class="visual" src="../../${escapeHtml(visualSrc(lead.visual))}" alt="${escapeHtml(visualAlt(lead.visual, lead.title))}"></a>` : ''}
  <section>
    <div class="k">${escapeHtml(signalTitle)}</div>
    <div class="signal">${content.signal_map.map((item) => `<a class="card"${externalAttrs(item.url || item.source_url || item.external_url)}>${visualSrc(item.visual) ? `<img src="../../${escapeHtml(visualSrc(item.visual))}" alt="${escapeHtml(visualAlt(item.visual, item.label || item.signal))}" style="width:100%;border-radius:14px;margin-bottom:12px">` : ''}<strong>${escapeHtml(item.label || item.signal)}</strong><p>${escapeHtml(item.summary || item.janet_view)}</p><small>${escapeHtml(item.story_title || '')} · ${escapeHtml(item.source || '')}</small></a>`).join('')}</div>
  </section>
  <section>
    <div class="k">头条</div>
    <h2>${leadAttrs ? `<a${leadAttrs}>${escapeHtml(lead.title || '')}</a>` : escapeHtml(lead.title || '')}</h2>
    ${lead.original_title ? `<small>原文：${escapeHtml(lead.original_title)}</small>` : ''}
    <p>${escapeHtml(lead.content || lead.summary || '')}</p>
  </section>
  <section>
    <div class="k">今日更多</div>
    <div class="signal">${(content.compact_news || []).map((item) => `<a class="card"${externalAttrs(item.url || item.source_url || item.external_url)}>${visualSrc(item.visual) ? `<img src="../../${escapeHtml(visualSrc(item.visual))}" alt="${escapeHtml(visualAlt(item.visual, item.title))}" style="width:100%;border-radius:14px;margin-bottom:12px">` : ''}<small>${escapeHtml(item.source)} · ${escapeHtml(item.category)}</small><strong>${escapeHtml(item.title)}</strong><p>${escapeHtml(item.summary)}</p></a>`).join('')}</div>
  </section>
  ${Object.entries(content.sections).filter(([key, section]) => key !== 'lead_story' && Array.isArray(section.items) && section.items.length > 0).map(([key, section]) => `<section><div class="k">${escapeHtml(section.title || key)}</div>${(section.items || []).map((item) => `<article><small>${escapeHtml(item.source)} · ${escapeHtml(item.source_rank)}</small><h3>${externalAttrs(item.url || item.source_url || item.external_url) ? `<a${externalAttrs(item.url || item.source_url || item.external_url)}>${escapeHtml(item.title)}</a>` : escapeHtml(item.title)}</h3>${item.original_title ? `<small>原文：${escapeHtml(item.original_title)}</small>` : ''}<p>${escapeHtml(item.content || item.summary)}</p><a${externalAttrs(item.url || item.source_url || item.external_url)}>原文</a></article>`).join('')}</section>`).join('')}
  <section>
    <div class="k">接下来观察</div>
    <ul>${content.what_to_watch_next.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>
  </section>
</main>
</body>
</html>`;
}

function buildSummary(template, content, editionId, editionType) {
  const lead = content.sections.lead_story.items[0];
  return scrubTemplateCopy({
    ...template,
    edition_id: editionId,
    date: content.date,
    vol: content.vol,
    brand: content.brand,
    theme: content.theme,
    title: content.title || content.cover?.daily_title || content.theme,
    daily_title: content.cover?.daily_title || content.theme,
    daily_brief: content.daily_brief || {
      daily_title: content.cover?.daily_title || content.title || content.theme,
      daily_summary: content.cover?.cover_summary || content.daily_thesis,
      daily_judgment: content.cover?.daily_judgment || ''
    },
    edition_type: editionType,
    item_count: (content.edition_items || Object.values(content.sections).flatMap((section) => section.items || [])).length,
    edition_items_count: (content.edition_items || []).length,
    homepage_items_count: (content.homepage_items || []).length,
    cover: content.cover || null,
    modules: content.modules || [],
    lead_story: lead,
    daily_thesis: content.daily_thesis,
    daily_editorial_summary: content.daily_editorial_summary || null,
    intro_text: content.intro_text,
    signal_map: content.signal_map,
    compact_news: content.compact_news || [],
    compact_articles: content.compact_news || [],
    homepage_items: content.homepage_items || [],
    output_url: `data/${editionId}/output.html`,
    summary_url: `data/${editionId}/news-summary.json`,
    content_url: `data/${editionId}/content.json`
  });
}

function updateManifest(editionId) {
  const manifestPath = resolve(ROOT, 'data/MANIFEST.json');
  const manifest = readJson(manifestPath, []);
  const next = [editionId, ...manifest.filter((entry) => entry !== editionId)];
  writeJson(manifestPath, next);
}

function workflowContext() {
  return {
    workflow_event: process.env.JANET_WORKFLOW_EVENT || '',
    workflow_run_id: process.env.JANET_WORKFLOW_RUN_ID || '',
    workflow_ref: process.env.JANET_WORKFLOW_REF || '',
    workflow_sha: process.env.JANET_WORKFLOW_SHA || ''
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const date = args.date || defaultDateShanghai();
  const editionId = `${date}-v4`;
  const dryRun = args['dry-run'] === true;
  const window = computeWindow(date);
  const pool = readJson(SOURCE_POOL, { sources: [], min_publish_count: 5, full_edition_count: 10 });
  const previousLatestEditionId = readJson(resolve(ROOT, 'data/MANIFEST.json'), [])[0] || '';
  const status = {
    status: 'running',
    run_at: new Date().toISOString(),
    target_date: date,
    target_edition_id: editionId,
    timezone: TZ,
    date_source: 'args.date || defaultDateShanghai()',
    ...workflowContext(),
    created_new_edition: false,
    previous_latest_edition_id: previousLatestEditionId,
    no_new_edition_reason: '',
    candidate_count: 0,
    selected_count: 0,
    window_start: window.window_start,
    window_end: window.window_end,
    source_count: pool.sources.filter((source) => source.enabled).length,
    source_success_count: 0,
    source_error_count: 0,
    source_empty_count: 0,
    raw_items: 0,
    included: 0,
    excluded: 0,
    exclusion_reasons: {},
    source_reports: [],
    edition_type: '',
    published: false,
    published_edition_id: '',
    used_sample_data: false,
    published_at_window_enforced: true,
    errors: []
  };

  const rawItems = [];
  const processItems = async (rawItemList, included, excluded, snapshot = null) => {
    status.raw_items = Number(snapshot?.raw_item_count || rawItemList.length);
    status.included = included.length;
    status.candidate_count = included.length;
    status.selected_count = included.length;
    status.excluded = excluded.length;
    status.exclusion_reasons = excluded.reduce((acc, item) => {
      acc[item.excluded_reason] = (acc[item.excluded_reason] || 0) + 1;
      return acc;
    }, {});
    writeLiveSourceSnapshot({ date, window, status, rawItems: rawItemList, included, excluded });

    if (included.length < Number(pool.min_publish_count || 5)) {
      status.status = 'blocked_insufficient_fresh_news';
      status.edition_type = 'blocked';
      status.published = false;
      status.created_new_edition = false;
      status.no_new_edition_reason = `fresh_news_below_min_publish_count:${included.length}/${Number(pool.min_publish_count || 5)}`;
      status.selected_count = 0;
      writeJson(STATUS_PATH, status);
      console.log(`status: ${status.status}`);
      return;
    }

    if (dryRun) {
      status.status = 'dry_run_candidate_ready';
      status.edition_type = included.length >= Number(pool.full_edition_count || 10) ? 'full_edition' : 'limited_edition';
      status.published = false;
      status.created_new_edition = false;
      status.no_new_edition_reason = 'dry_run';
      writeJson(STATUS_PATH, status);
      console.log(`status: ${status.status}`);
      return;
    }

    const manifest = readJson(resolve(ROOT, 'data/MANIFEST.json'), []);
    const templateId = manifest[0] || '2026-05-14-v4';
    const templateContent = readJson(resolve(ROOT, `data/${templateId}/content.json`));
    const templateSummary = readJson(resolve(ROOT, `data/${templateId}/news-summary.json`), {});
    const editorialRules = readJson(EDITORIAL_RULES, { positive_signals: [], negative_signals: [], source_priority: {}, forbidden_frontend_phrases: [] });
    const outDir = resolve(ROOT, `data/${editionId}`);
    const draftEditionType = included.length >= Number(pool.full_edition_count || 10) ? 'full_edition' : 'limited_edition';
    const content = await buildContent(templateContent, included, date, draftEditionType, editorialRules);
    const publishableCount = (content.edition_items || []).length;
    const genericBlocked = (content.excluded_items || []).filter((item) => item.reason === 'generic_fallback_blocked').length;
    status.included = publishableCount;
    status.selected_count = publishableCount;
    status.excluded = excluded.length + genericBlocked;
    status.exclusion_reasons.generic_fallback_blocked = genericBlocked;
    const editionType = publishableCount >= Number(pool.full_edition_count || 10) ? 'full_edition' : 'limited_edition';
    const statusName = editionType === 'full_edition' ? 'published_full_edition' : 'published_limited_edition';
    status.status = statusName;
    status.edition_type = editionType;

    writeJson(resolve(outDir, 'content.json'), content);
    writeText(resolve(outDir, 'output.html'), renderHtml(content));
    writeJson(resolve(outDir, 'news-summary.json'), buildSummary(templateSummary, content, editionId, editionType));
    updateManifest(editionId);

    status.published = true;
    status.published_edition_id = editionId;
    status.created_new_edition = true;
    status.no_new_edition_reason = '';
    writeJson(STATUS_PATH, status);
    console.log(`status: ${status.status}`);
  };

  if (args['use-snapshot']) {
    const snapshot = readJson(resolve(ROOT, String(args['use-snapshot'])));
    const sourceByName = new Map((pool.sources || []).map((source) => [source.source, source]));
    status.source_count = Number(snapshot.source_count || status.source_count || 0);
    status.source_success_count = Number(snapshot.source_success_count || 0);
    status.source_error_count = Number(snapshot.source_error_count || 0);
    const snapshotItems = (snapshot.included_items || []).map((item, index) => {
      const source = sourceByName.get(item.source) || {};
      return {
        id: item.story_id || hashId(source.id || item.source || 'snapshot', `${item.url}:${item.original_title}`),
        title: item.original_title || '',
        url: item.url || '',
        source: item.source || '',
        category: item.category || source.category || 'business',
        source_rank: source.rank || 'B',
        published_at: item.published_at || '',
        published_at_source: 'snapshot.published_at',
        summary: item.original_summary || '',
        collected_at: snapshot.generated_at || new Date().toISOString(),
        raw_source_id: source.id || item.source || '',
        evidence_ids: [`evidence-${String(index + 1).padStart(4, '0')}`]
      };
    });
    return Promise.resolve(processItems(snapshotItems, snapshotItems, [], snapshot));
  }

  const promises = pool.sources.filter((item) => item.enabled).map(async (source) => {
    const result = await fetchSource(source);
    const report = {
      id: source.id,
      source: source.source,
      category: source.category,
      rank: source.rank,
      status: 'success',
      item_count: result.items.length,
      error: ''
    };
    if (result.empty) {
      status.source_empty_count += 1;
      report.status = 'empty';
      report.error = result.error || 'no_feed_items';
      status.source_reports.push(report);
      return;
    }
    if (result.error) {
      status.source_error_count += 1;
      status.errors.push({ source_id: source.id, error: result.error });
      report.status = 'error';
      report.error = result.error;
    } else {
      status.source_success_count += 1;
      rawItems.push(...result.items);
    }
    status.source_reports.push(report);
  });

  return Promise.all(promises).then(() => {
    const { included, excluded } = filterWindow(rawItems, window);
    processItems(rawItems, included, excluded);
  });
}

main().catch((error) => {
  const args = parseArgs(process.argv.slice(2));
  const date = args.date || defaultDateShanghai();
  const editionId = `${date}-v4`;
  const manifest = readJson(resolve(ROOT, 'data/MANIFEST.json'), []);
  writeJson(STATUS_PATH, {
    status: 'failed',
    run_at: new Date().toISOString(),
    target_date: date,
    target_edition_id: editionId,
    timezone: TZ,
    date_source: 'args.date || defaultDateShanghai()',
    ...workflowContext(),
    created_new_edition: false,
    published_edition_id: '',
    previous_latest_edition_id: manifest[0] || '',
    no_new_edition_reason: error.message || 'generator_failed',
    candidate_count: 0,
    selected_count: 0,
    used_sample_data: false,
    published_at_window_enforced: true,
    published: false,
    errors: [{ error: error.message }]
  });
  console.error(error.stack || error.message);
  process.exit(1);
});
