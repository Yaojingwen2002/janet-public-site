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
      evidence_ids: []
    });
  }

  return items;
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
      const response = await fetch(url, {
        headers: {
          'user-agent': 'JanetDailyNewsBot/31',
          accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, text/html;q=0.8'
        },
        redirect: 'follow'
      });
      if (!response.ok) throw new Error(`http_${response.status}`);
      const text = await response.text();
      const items = parseFeed(text, { ...source, url });
      if (items.length) return { items, error: null };
      const discovered = feedLinksFromHtml(text, url).filter((link) => !visited.has(link));
      for (const feedUrl of discovered.slice(0, 3)) {
        visited.add(feedUrl);
        try {
          const feedResponse = await fetch(feedUrl, {
            headers: {
              'user-agent': 'JanetDailyNewsBot/31',
              accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, text/html;q=0.8'
            },
            redirect: 'follow'
          });
          if (!feedResponse.ok) throw new Error(`http_${feedResponse.status}`);
          const feedText = await feedResponse.text();
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
  if (/podcast/i.test(text)) add('action', '播客生成');
  if (/trial|lawsuit|suit|case/i.test(text)) add('action', '诉讼');
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
    const normalized = String(value || '')
      .replace(/^(The|How|With|Would|Welcome to|Everything new in our|New ways to)\s+/i, '')
      .replace(/[,:;.!?]+$/g, '')
      .trim();
    if (!normalized || normalized.length < 3) return;
    const lower = normalized.toLowerCase();
    if (sourceSet.has(lower) || sourceSet.has(lower.replace(/\s+/g, ''))) return;
    if (/^(from|with|using|this|that|how|why|here|what|when|where|new|the|and|for|at|in|on|to|of|is|are)$/i.test(normalized)) return;
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
  if (/raised|funding|fund|series [a-z]|\$/.test(text)) return '融资';
  if (/lawsuit|trial|case|suit|court/.test(text)) return '诉讼';
  if (/auto-delet|delete/.test(text)) return '自动清除';
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
  if (action === '融资') return `${object}拿到融资，押注${source.includes('TechCrunch') ? 'AI 安全' : 'AI 落地'}`;
  if (action === '诉讼') return `${object}诉讼继续牵动 AI 治理`;
  if (action === '自动清除') return `苹果重做 Siri，聊天记录可能自动清除`;
  if (action === '生成') return `${object}开始生成内容`;
  if (action === '工具调用') return `${object}补上程序化工具调用`;
  if (action === '记忆扩展') return `${object}加入对话记忆`;
  if (action === '搜索改版') return `${object}正在改写搜索入口`;
  if (action === '订阅调整') return `${object}订阅能力重新打包`;
  if (action === '购物代理') return `${object}想接管购物流程`;
  if (action === '视觉识别') return `${object}接入外部摄像头识别`;
  if (action === '设计工具') return `${object}把 AI 设计摆上台面`;
  if (action === '推出') return `${object}推出新版本或新功能`;
  return `${object}出现${action}新进展`;
}

function summaryFromStoryFact(item, storyFact) {
  const object = storyFact.concrete_object;
  const action = storyFact.action;
  const source = chineseSourceName(item.source);
  const original = clamp(storyFact.original_title || item.title || '', 58);
  if (action === '搜索改版') return `${source}报道的重点是${object}：搜索正在从“输入关键词”转向更主动的 AI 入口，原文线索是「${original}」。`;
  if (action === '开发工具升级') return `${source}把${object}放在开发工具语境里，关键不是概念，而是 CLI、编码流程和实际接入方式是否变顺。`;
  if (action === '智能体能力') return `${source}这条围绕${object}展开，重点看它是否把智能体从演示带到更具体的任务入口。`;
  if (action === '购物代理') return `${source}写到${object}，意思是 AI 不只推荐商品，还可能进入跨站购物流程，风险和便利都会一起出现。`;
  if (action === '订阅调整') return `${source}这条指向${object}的订阅变化，用户真正要看的是哪些能力被打包、哪些功能需要额外付费。`;
  if (action === '生成') return `${source}把${object}放进生成场景，关键是生成结果能否被编辑、追溯和稳定使用。`;
  if (action === '融资') return `${source}报道${object}拿到资金，说明投资人押注的不是 AI 口号，而是更具体的安全或产品问题。`;
  if (action === '诉讼') return `${source}围绕${object}的法律争议继续发酵，重点是 AI 公司治理、承诺和商业化之间的拉扯。`;
  if (action === '评测' || action === '榜单排名') return `${source}把${object}放进评测语境，重点是任务集、评分方法和结果是否经得起复现。`;
  if (action === '视觉识别') return `${source}提到${object}的视觉识别能力，真正要看的是它在真实环境里能否稳定读懂场景。`;
  if (action === '设计工具') return `${source}把${object}推到设计工具层面，关键是它能否改变原型、素材和协作流程。`;
  if (action === '团队变动') return `${source}这条围绕${object}的人才流动展开，说明前沿模型团队仍在争夺训练和研究经验。`;
  if (action === '推出') return `${source}报道${object}的新功能或版本，原文线索是「${original}」，重点看它具体补上了哪一段能力。`;
  return `${source}这条新闻的具体对象是${object}，动作是${action}；原文线索是「${original}」。`;
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
  if (action === '融资') return `${audience}要看${object}：资金流向说明市场正在押注哪个具体痛点。`;
  if (action === '评测' || action === '榜单排名') return `${audience}要看${object}：公开评测能让能力比较少一点玄学，多一点可复查证据。`;
  if (action === '推出') return `${audience}要看${object}：新功能是否改变现有产品路径，而不是只增加发布会信息量。`;
  return `${audience}要看${object}：${action}会影响它接下来能否进入真实使用场景。`;
}

function janetFromStoryFact(item, storyFact) {
  const object = storyFact.concrete_object;
  const action = storyFact.action;
  if (action === '搜索改版') return `${object}这事不小，搜索框一变，很多流量游戏就要重新算账。`;
  if (action === '开发工具升级') return `${object}如果真能少敲几步命令，开发者会比发布会掌声更诚实。`;
  if (action === '记忆扩展') return `${object}补记忆这事很实在，智能体没上下文就像刚睡醒的同事。`;
  if (action === '工具调用') return `${object}开始认真处理工具调用，说明智能体终于要学会按流程干活。`;
  if (action === '购物代理') return `${object}听起来方便，但让 AI 花钱这件事，最好先问清楚谁背锅。`;
  if (action === '融资') return `${object}拿到钱只是开场，接下来要证明它不是又一个安全 PPT。`;
  if (action === '评测' || action === '榜单排名') return `${object}终于要拿分数说话了，虽然榜单也会有自己的小心思。`;
  if (action === '推出') return `${object}这类发布不缺声量，缺的是用户第二天还会不会打开。`;
  return `${object}有明确动作，先别喊革命，看它有没有真实用户和可复查结果。`;
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
  if (action === '融资') return `看${object}资金后是否给出产品指标。`;
  if (action === '诉讼') return `看${object}后续是否影响治理承诺。`;
  if (action === '评测' || action === '榜单排名') return `看${object}是否公开任务集和评分细则。`;
  if (action === '推出') return `看${object}是否给出可用入口和限制。`;
  return `看${object}是否出现真实使用证据。`;
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
      title: 'The Verge 梳理 OpenAI 控制权交锋',
      summary: 'The Verge 汇总马斯克与 Sam Altman 围绕 OpenAI 的持续交锋，这条更像时间线，帮读者看清争议如何滚动。',
      why: '关注 AI 治理的人要看：持续更新的争议会影响公众对 OpenAI 控制权和商业化路径的判断。',
      janet: '这不是一条单点新闻，是 OpenAI 家庭剧的滚动字幕。',
      watch: '看 Altman 与马斯克是否继续公开交锋。'
    };
  }
  if (/elon musk loses his case against sam altman/.test(text)) {
    return {
      title: 'The Verge 记录马斯克败给 Altman',
      summary: 'The Verge 报道马斯克对 Sam Altman 的案件失利，重点是围绕 OpenAI 的法律攻击暂时没有打穿。',
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
  if (/elon musk/.test(text) && /sam altman|openai/.test(text) && /lost|suit|case/.test(text)) {
    return {
      title: '马斯克败诉，OpenAI 争议还没结束',
      summary: 'The Verge 报道马斯克对 Sam Altman 和 OpenAI 的案件受挫，法律结果暂时落定，但 AI 公司治理争议仍会继续。',
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
  if (/musk|elon/.test(text) && /openai/.test(text) && /trial|trust|lawsuit/.test(text)) {
    return {
      title: '马斯克与 OpenAI 诉讼，信任成核心问题',
      summary: `${source}把马斯克与 OpenAI 的诉讼焦点放在“谁能被信任”上，这不是普通法务新闻，而是 AI 公司治理和商业承诺的压力测试。`,
      why: '企业和投资者要看：AI 公司讲开放、使命和商业化时，合同与治理会不会被重新审视。',
      janet: '这场官司真正吵的不是情绪，是 AI 公司说过的话还能不能算数。',
      watch: '看法庭如何处理 OpenAI 的使命与商业边界。'
    };
  }
  if (/commencement speech|graduation|boo|cheerleading/.test(text) && /ai/.test(text)) {
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
  if (/api|sdk|developer|workflow|agent/.test(text)) return `${source}更新${topic}，先看谁能用起来`;
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
    return `${source} 这条围绕 Codex 和软件开发展开，重点是智能体不再只做演示，而是被推向真实工程团队。`;
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
  const lead = stories[0] || {};
  const top = stories.slice(0, 5);
  const sources = sourceNames(top, 4);
  const hasOpenSource = stories.some((story) => story.category === 'open_source' || /hugging face|github/i.test(story.source || story.title || ''));
  const hasResearch = stories.some((story) => story.category === 'research' || /arxiv|paper|benchmark/i.test(story.source || story.title || ''));
  const hasTools = stories.some((story) => /api|sdk|agent|copilot|workflow|developer|tool/i.test(`${story.title} ${story.summary}`));
  const hasModel = stories.some((story) => /openai|anthropic|google|deepmind|mistral|model|reasoning|multimodal/i.test(`${story.source} ${story.title} ${story.summary}`));
  const subject = hasTools
    ? '开发者入口'
    : hasOpenSource
      ? '开源模型'
      : hasResearch
        ? '研究侧'
        : hasModel
          ? '模型'
          : 'AI 工位';
  const object = hasTools
    ? '开发流程'
    : hasOpenSource
      ? '开源战场'
      : hasResearch
        ? '评测短板'
        : hasModel
          ? '模型入口'
          : '企业工作流';
  const verb = hasTools ? '进工位' : hasOpenSource ? '补位' : hasResearch ? '换挡' : '抢入口';
  const titleRules = rules.title_generation || {};
  const patterns = titleRules.title_patterns || [];
  const generated = patterns.map((pattern) => fillTitlePattern(pattern, subject, verb, object));
  const concrete = [
    lead.source ? `${chineseSourceName(lead.source)}把入口往前挪` : '',
    sources.includes('OpenAI') ? 'OpenAI把开发流往前推' : '',
    sources.includes('GitHub Blog') ? 'GitHub继续收开发入口' : '',
    sources.includes('Hugging Face') ? '开源侧今天继续补位' : '',
    hasResearch ? '论文先把短板照出来' : '',
    `${subject}今天有实事`
  ];
  const candidates = [...generated, ...concrete]
    .filter(Boolean)
    .map((item) => String(item).replace(/\s+/g, '').trim());
  const forbidden = [...(rules.forbidden_frontend_phrases || []), '工具链又拧紧了', '公开源池晨报'];
  const history = recentTitles(Number(titleRules.forbid_repeat_days || 7));
  const maxLength = Number(titleRules.max_length_cn || 18);
  const selected = candidates.find((item) => (
    item.length <= maxLength + 6 &&
    !history.includes(item) &&
    !forbidden.some((phrase) => item.includes(phrase)) &&
    hasChinese(item)
  ));
  if (selected) return selected;
  const suffix = sources[0] ? chineseSourceName(sources[0]) : date.replaceAll('-', '.');
  const fallback = `${subject}换挡：${suffix}`;
  if (!history.includes(fallback)) return fallback;
  return `${subject}换挡${date.slice(5).replace('-', '')}`;
}

function thesisForEdition(stories) {
  const top = stories.slice(0, 5);
  const sources = sourceNames(top, 5).join('、');
  const verbs = top
    .map((story) => story.editorial_signals?.[0]?.name)
    .filter(Boolean);
  const focus = verbs.includes('developer_tooling') ? '工具入口' : verbs.includes('open_source_release') ? '开源补位' : verbs.includes('research_signal') ? '研究信号' : '产品和研究';
  return clamp(`今天窗口里，${sources || '公开源'}把${focus}摆在台面上：不是每条都惊天动地，但它们共同说明，模型能力正在往开发、开源和研究的日常环节里挤。`, 140);
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

function homepageStoryItem(role, story, visual) {
  return {
    role,
    story_id: story?.id || '',
    title: story?.title || '',
    source: story?.source || '',
    category: story?.category || '',
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
  makeFieldUnique(items, 'summary', (item) => clamp(`这条聚焦「${item.title}」，和同屏其他新闻分工不同：它提供的是另一条具体产品或研究线索。`, 118));
  makeFieldUnique(items, 'why_it_matters', (item) => clamp(`「${item.title}」会影响相关团队对这项能力的使用、评估或采购判断。`, 96));
  makeFieldUnique(items, 'janet_take', (item) => clamp(`Janet 看这条「${item.title}」：重点在具体动作，不在发布词。`, 86));
  makeFieldUnique(items, 'watch_next', (item) => clamp(`看「${item.title}」后续是否出现产品、代码或客户证据。`, 48));
}

function ensureUniqueStoryCopy(stories) {
  makeFieldUnique(stories, 'zh_title', (story) => clamp(`${story.zh_title || story.title}（${chineseSourceName(story.source)}）`, 52));
  makeFieldUnique(stories, 'title', (story) => story.zh_title || story.title);
  makeFieldUnique(stories, 'zh_summary', (story) => clamp(`${chineseSourceName(story.source)}这条讲的是「${story.zh_title || story.title}」：${story.original_title || story.raw_item?.original_title || ''}`.replace(/\s+/g, ' '), 120));
  makeFieldUnique(stories, 'summary', (story) => story.zh_summary || story.summary);
  makeFieldUnique(stories, 'why_it_matters', (story) => clamp(`「${story.zh_title || story.title}」会影响相关团队对这项能力的使用、评估或采购判断。`, 90));
  makeFieldUnique(stories, 'janet_take', (story) => clamp(`Janet 看「${story.zh_title || story.title}」：先看这条新闻里的对象和动作。`, 80));
  makeFieldUnique(stories, 'watch_next', (story) => clamp(`看「${story.zh_title || story.title}」是否出现后续产品证据。`, 42));
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
      label: signal.signal,
      summary: story.summary,
      story_id: story.id,
      story_title: story.title,
      source: story.source,
      visual: writeNewsVisual(`${date}-signal-${index + 1}.svg`, signal.signal, story.source || 'Janet', story.category || 'models')
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
  const facts = (first.story_facts || []).map((fact) => fact.value).filter(Boolean);
  if (sectionKey === 'agents') return facts[0] ? `${facts[0]} 进入开发链路` : '开发工具进入任务链路';
  if (sectionKey === 'open_source') return facts[0] ? `${facts[0]} 带出开源工具线` : '开源工具链继续补位';
  if (sectionKey === 'business') return facts[0] ? `${facts[0]} 指向商业落地` : '企业入口与商业落地';
  if (sectionKey === 'models') return facts[0] ? `${facts[0]} 改写产品能力` : '模型能力进入产品层';
  if (sectionKey === 'creator_opportunity') return facts[0] ? `${facts[0]} 给创作工具添变量` : '创作者工具出现新变量';
  if (sectionKey === 'china_perspective') return '中国视角里的 AI 动向';
  return '更多值得留意的 AI 动态';
}

function moduleSummaryFor(sectionKey, stories) {
  const sources = sourceNames(stories, 3).join('、') || '多个来源';
  const facts = [...new Set(stories.flatMap((story) => (story.story_facts || []).map((fact) => fact.value)))].slice(0, 3);
  const factText = facts.length ? `，具体对象包括${facts.join('、')}` : '';
  if (sectionKey === 'agents') return `${sources}显示开发入口继续被 AI 工具占据${factText}，重点看企业和团队是否真的接入。`;
  if (sectionKey === 'open_source') return `${sources}把开源工具和可复现路径摆到台前${factText}，适合观察社区接力速度。`;
  if (sectionKey === 'business') return `${sources}集中在商业部署、客户入口和组织变化${factText}，不是单纯发布口号。`;
  if (sectionKey === 'models') return `${sources}的信号落在模型能力与产品接口${factText}，需要看真实可用范围。`;
  if (sectionKey === 'creator_opportunity') return `${sources}给创作者和内容团队提供了新的工具线索${factText}，关键是成本是否下降。`;
  return `${sources}补充了今日 AI 动态的侧面信息${factText}，放在主线之外一起观察。`;
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

function buildCover(stories, modules, dailyTitle) {
  const lead = stories[0] || {};
  const facts = (lead.story_facts || []).map((fact) => fact.value);
  const primaryFact = facts[0] || chineseSourceName(lead.source);
  const coverTitle = facts.includes('Codex') && facts.includes('Dell')
    ? 'Codex 开始进企业内网'
    : `${primaryFact} 成为今天的第一信号`;
  const coverSummary = facts.includes('Codex') && facts.includes('Dell')
    ? '今天的主线不是模型参数，而是 OpenAI 与戴尔把 Codex 推进混合和本地企业环境，AI 编程开始面对真实采购和权限问题。'
    : `今天的封面围绕${primaryFact}展开，它把${modules[0]?.module_title || 'AI 产品变化'}推到更具体的位置。`;
  return {
    daily_title: dailyTitle,
    cover_title: coverTitle,
    cover_summary: coverSummary,
    daily_judgment: `Janet 判断：今天值得看的不是热词数量，而是谁把 AI 放进了更难撤回的工作入口。`,
    lead_story_id: lead.id
  };
}

function whyItMatters(story) {
  const brief = storyBrief(story);
  if (brief?.why) return brief.why;
  const text = `${story.original_title || ''} ${story.title} ${story.original_summary || ''} ${story.summary} ${story.source}`.toLowerCase();
  const audience = /api|sdk|github|copilot|developer|workflow|agent/.test(text)
    ? '开发者'
    : /arxiv|paper|benchmark|training|inference|alignment|evaluation/.test(text)
      ? '研究者'
      : /hugging face|open source|dataset|weights|repository/.test(text)
        ? '开源社区'
        : /enterprise|pricing|customer|funding|partnership|business/.test(text)
          ? '企业'
          : '创作者和产品团队';
  return clamp(`${audience}要看这条：它可能改变选型、评估或交付方式，关键是是否有清晰功能、价格或开放边界。`, 90);
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
  return `${source}这条不必喊口号，先看它会不会把${topic}变成可用入口。`;
}

function watchNext(story) {
  const brief = storyBrief(story);
  if (brief?.watch) return brief.watch;
  const text = `${story.original_title || ''} ${story.title} ${story.original_summary || ''} ${story.summary} ${story.source}`.toLowerCase();
  const source = chineseSourceName(story.source);
  const topic = normalizeTopic(story);
  if (/openai|model|reasoning|multimodal/.test(text)) return `看${source}是否开放 API、价格和企业权限。`;
  if (/github|codex|copilot|api|sdk|developer|workflow|agent/.test(text)) return `看${topic}是否进入默认开发工作流。`;
  if (/hugging face|open source|weights|dataset/.test(text)) return `看${source}社区复现速度和许可边界。`;
  if (/arxiv|paper|benchmark/.test(text)) return '看这篇论文有没有代码和基准跟进。';
  if (/creator|video|image|audio|design|media|content/.test(text)) return '看创作者工具是否真正降低制作成本。';
  if (/pricing|enterprise|customer|partnership|funding|trial|lawsuit|finance/.test(text)) return `看${source}的客户、定价和入口变化。`;
  if (/apple|siri|chatbot|assistant|drive-thru|automotive/.test(text)) return `看${source}是否把${topic}做成默认入口。`;
  return `看${source}能否把${topic}落成具体产品。`;
}

function uniqueWatchNext(story, used) {
  const source = chineseSourceName(story.source);
  const topic = normalizeTopic(story);
  const candidates = [
    story.watch_next,
    `看「${story.title}」是否公布使用范围。`,
    `看「${story.title}」是否出现真实案例。`,
    `看「${story.title}」是否给出可复查证据。`
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

function publicIntroForEdition(stories) {
  const lead = stories[0] || {};
  const sources = sourceNames(stories.slice(0, 6), 4).join('、');
  const leadTopic = normalizeTopic(lead);
  return clamp(`今天最值得看的不是热闹数量，而是${sources || '几个关键来源'}把${leadTopic}推到了台前：谁在抢入口，谁在补工具，谁还只是发声明，一眼分清。`, 110);
}

function storyToPublicItem(item) {
  const raw_item = {
    source: item.source,
    original_title: item.title,
    original_summary: item.summary || '',
    url: item.url,
    published_at: item.published_at,
    category: schemaCategory(item.category)
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
  const zh_title = clamp(copy.title, 52);
  const zh_summary = clamp(copy.summary, 120);
  const story_facts = storyFact.story_facts;
  return {
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
    source: item.source,
    source_type: sourceType(item.source),
    source_rank: item.source_rank,
    category: schemaCategory(item.category),
    score: scoreFor(item.source_rank),
    published_at: item.published_at,
    published_at_source: item.published_at_source,
    summary: zh_summary,
    original_summary: clamp(item.summary || item.title, 220),
    why_it_matters: copy.why,
    janet_take: copy.janet,
    watch_next: copy.watch,
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
}

function buildContent(template, included, date, editionType, rules) {
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
  const serializedStories = JSON.stringify(stories);
  for (const phrase of FORBIDDEN_GENERIC_COPY) {
    if (serializedStories.includes(phrase)) throw new Error(`forbidden_generic_copy:${phrase}`);
  }
  for (const phrase of FORBIDDEN_TAKES) {
    if (JSON.stringify(stories).includes(phrase)) throw new Error(`forbidden_janet_take:${phrase}`);
  }

  const sections = {
    lead_story: { title: '今日封面', items: [] }
  };
  const homepageItems = [];
  const hiddenItems = [];
  stories.forEach((story, index) => {
    if (index === 0) {
      story.visual = writeNewsVisual(`${date}-lead.svg`, story.title, story.source, story.category);
    }
  });
  sections.lead_story.items.push(stories[0]);
  for (const story of stories.slice(1)) {
    const section = story.primary_section || sectionFor(story.category);
    if (!sections[section]) sections[section] = { title: SECTION_LABELS[section] || '更多 AI 动态', items: [] };
    sections[section].items.push(story);
  }

  const theme = titleForEdition(stories, rules, date);
  const homepageAssembly = buildHomepageAssembly(stories, date);
  const signalMap = homepageAssembly.signalMap;
  const compactNews = homepageAssembly.compactNews;
  homepageItems.push(...homepageAssembly.homepageItems);
  const modules = buildModules(sections);
  const cover = buildCover(stories, modules, theme);
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

  return {
    ...template,
    date,
    vol: template.vol || '0000',
    theme,
    title: theme,
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
        category: story.category
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
        raw_item: story.raw_item
      }))
    },
    intro_text: publicIntroForEdition(stories),
    daily_thesis: thesisForEdition(stories),
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
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function renderHtml(content) {
  const allItems = Object.values(content.sections).flatMap((section) => section.items || []);
  const lead = content.sections.lead_story.items[0] || {};
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
    .card{border:1px solid rgba(255,255,255,.1);border-radius:18px;padding:18px;background:rgba(255,255,255,.025)}
  </style>
</head>
<body>
<main>
  <div class="k">Janet Daily News</div>
  <h1>${escapeHtml(content.theme)}</h1>
  <p>${escapeHtml(content.intro_text)}</p>
  <p>${escapeHtml(content.daily_thesis)}</p>
  ${lead.visual ? `<img class="visual" src="../../${escapeHtml(lead.visual)}" alt="${escapeHtml(lead.title)}">` : ''}
  <section>
    <div class="k">今日三条主线</div>
    <div class="signal">${content.signal_map.map((item) => `<div class="card">${item.visual ? `<img src="../../${escapeHtml(item.visual)}" alt="${escapeHtml(item.label || item.signal)}" style="width:100%;border-radius:14px;margin-bottom:12px">` : ''}<strong>${escapeHtml(item.label || item.signal)}</strong><p>${escapeHtml(item.summary || item.janet_view)}</p><small>${escapeHtml(item.story_title || '')} · ${escapeHtml(item.source || '')}</small></div>`).join('')}</div>
  </section>
  <section>
    <div class="k">今日封面</div>
    <h2>${escapeHtml(lead.title || '')}</h2>
    ${lead.original_title ? `<small>原文：${escapeHtml(lead.original_title)}</small>` : ''}
    <p>${escapeHtml(lead.summary || '')}</p>
  </section>
  <section>
    <div class="k">今日更多</div>
    <div class="signal">${(content.compact_news || []).map((item) => `<div class="card"><small>${escapeHtml(item.source)} · ${escapeHtml(item.category)}</small><strong>${escapeHtml(item.title)}</strong><p>${escapeHtml(item.summary)}</p></div>`).join('')}</div>
  </section>
  ${Object.entries(content.sections).filter(([key, section]) => key !== 'lead_story' && Array.isArray(section.items) && section.items.length > 0).map(([key, section]) => `<section><div class="k">${escapeHtml(section.title || key)}</div>${(section.items || []).map((item) => `<article><small>${escapeHtml(item.source)} · ${escapeHtml(item.source_rank)}</small><h3>${escapeHtml(item.title)}</h3>${item.original_title ? `<small>原文：${escapeHtml(item.original_title)}</small>` : ''}<p>${escapeHtml(item.summary)}</p><p>${escapeHtml(item.janet_take)}</p><a href="${escapeHtml(item.url)}">原文</a></article>`).join('')}</section>`).join('')}
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
  return {
    ...template,
    date: content.date,
    vol: content.vol,
    brand: content.brand,
    theme: content.theme,
    title: content.theme,
    daily_title: content.cover?.daily_title || content.theme,
    daily_brief: content.cover?.cover_summary || content.daily_thesis,
    edition_type: editionType,
    item_count: (content.edition_items || Object.values(content.sections).flatMap((section) => section.items || [])).length,
    edition_items_count: (content.edition_items || []).length,
    homepage_items_count: (content.homepage_items || []).length,
    cover: content.cover || null,
    modules: content.modules || [],
    lead_story: lead,
    daily_thesis: content.daily_thesis,
    intro_text: content.intro_text,
    signal_map: content.signal_map,
    compact_news: content.compact_news || [],
    compact_articles: content.compact_news || [],
    homepage_items: content.homepage_items || [],
    output_url: `data/${editionId}/output.html`,
    summary_url: `data/${editionId}/news-summary.json`,
    content_url: `data/${editionId}/content.json`
  };
}

function updateManifest(editionId) {
  const manifestPath = resolve(ROOT, 'data/MANIFEST.json');
  const manifest = readJson(manifestPath, []);
  const next = [editionId, ...manifest.filter((entry) => entry !== editionId)];
  writeJson(manifestPath, next);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const date = args.date || defaultDateShanghai();
  const dryRun = args['dry-run'] === true;
  const window = computeWindow(date);
  const pool = readJson(SOURCE_POOL, { sources: [], min_publish_count: 5, full_edition_count: 10 });
  const status = {
    status: 'running',
    run_at: new Date().toISOString(),
    timezone: TZ,
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
  const processItems = (rawItemList, included, excluded, snapshot = null) => {
    status.raw_items = Number(snapshot?.raw_item_count || rawItemList.length);
    status.included = included.length;
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
      writeJson(STATUS_PATH, status);
      console.log(`status: ${status.status}`);
      return;
    }

    if (dryRun) {
      status.status = 'dry_run_candidate_ready';
      status.edition_type = included.length >= Number(pool.full_edition_count || 10) ? 'full_edition' : 'limited_edition';
      status.published = false;
      writeJson(STATUS_PATH, status);
      console.log(`status: ${status.status}`);
      return;
    }

    const manifest = readJson(resolve(ROOT, 'data/MANIFEST.json'), []);
    const templateId = manifest[0] || '2026-05-14-v4';
    const templateContent = readJson(resolve(ROOT, `data/${templateId}/content.json`));
    const templateSummary = readJson(resolve(ROOT, `data/${templateId}/news-summary.json`), {});
    const editorialRules = readJson(EDITORIAL_RULES, { positive_signals: [], negative_signals: [], source_priority: {}, forbidden_frontend_phrases: [] });
    const editionId = `${date}-v4`;
    const outDir = resolve(ROOT, `data/${editionId}`);
    const draftEditionType = included.length >= Number(pool.full_edition_count || 10) ? 'full_edition' : 'limited_edition';
    const content = buildContent(templateContent, included, date, draftEditionType, editorialRules);
    const publishableCount = (content.edition_items || []).length;
    const genericBlocked = (content.excluded_items || []).filter((item) => item.reason === 'generic_fallback_blocked').length;
    status.included = publishableCount;
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
  writeJson(STATUS_PATH, {
    status: 'failed',
    run_at: new Date().toISOString(),
    timezone: TZ,
    used_sample_data: false,
    published_at_window_enforced: true,
    published: false,
    errors: [{ error: error.message }]
  });
  console.error(error.stack || error.message);
  process.exit(1);
});
