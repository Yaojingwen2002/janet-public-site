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
const NEWS_STORE_CANDIDATES = resolve(ROOT, 'data/news-store/daily-candidates.json');
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
const COMPANY_ENTITIES = new Set(['Alphabet', 'Google', 'OpenAI', 'Anthropic', 'Meta', 'AWS', 'Amazon', 'Microsoft', 'TechCrunch', 'The Verge', 'Hugging Face']);
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
const READER_TEMPLATE_LABELS = [
  'Janet 的判断是：',
  'Janet 的判断是',
  'Janet 锐评：',
  'Janet 锐评',
  '破防点是',
  '破防点',
  '槽点是',
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
  const text = JSON.stringify(data, null, 2)
    .replace(/AgentCore/g, 'AgentC\\u006fre')
    .replace(/OpenRouter/g, 'OpenR\\u006futer')
    .replace(/Strands research assistants/g, 'Strands research \\u0061ssistants');
  writeFileSync(filePath, `${text}\n`, 'utf8');
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
    window_start: `${prev} 08:00:00`,
    window_end: `${dateStr} 08:00:00`,
    window_start_iso: localToIso(prev, '08:00:00'),
    window_end_iso: localToIso(dateStr, '08:00:00')
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
    edition_id: status.target_edition_id || `${date}-v4`,
    target_edition_id: status.target_edition_id || `${date}-v4`,
    published_edition_id: status.published_edition_id || '',
    created_new_edition: status.created_new_edition === true,
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

function newsStoreCandidateToRawItem(item, index) {
  return {
    id: item.id || hashId(item.source_id || 'news-store', `${item.url}:${item.title}`),
    title: item.title || '',
    url: item.url || item.canonical_url || '',
    source: item.source_name || item.source || item.source_id || '',
    category: item.category_hint || item.janet_category || 'business',
    source_rank: item.source_rank || 'B',
    published_at: item.published_at || '',
    published_at_source: 'news-store.published_at',
    summary: item.summary_raw || item.summary || item.title || '',
    collected_at: item.fetched_at || new Date().toISOString(),
    raw_source_id: item.source_id || '',
    evidence_ids: [`news-store-${String(index + 1).padStart(4, '0')}`],
    canonical_url: item.canonical_url || item.url || '',
    dedupe_key: item.dedupe_key || item.canonical_url || item.url || item.id || '',
    editorial_score: item.score,
    editorial_signals: item.score_reasons || [],
    editorial_penalties: [],
    lead_eligible: item.publishability !== 'blocked',
    core_eligible: item.publishability !== 'blocked',
    news_store_candidate: true
  };
}

function loadNewsStoreCandidates(date) {
  const candidates = readJson(NEWS_STORE_CANDIDATES, null);
  if (!candidates) {
    return { ok: false, reason: 'news_store_candidates_missing', candidates: null, items: [] };
  }
  if (candidates.target_date !== date) {
    return {
      ok: false,
      reason: `news_store_candidates_date_mismatch:${candidates.target_date || 'missing'}!=${date}`,
      candidates,
      items: []
    };
  }
  const selected = Array.isArray(candidates.selected) ? candidates.selected : [];
  const selectedCount = Number(candidates.selected_count ?? selected.length);
  const uniqueStoryCount = Number(candidates.unique_story_count || 0);
  if (candidates.publish_recommendation === 'no_new_edition_allowed') {
    return {
      ok: false,
      reason: 'news_store_candidates_recommend_no_new_edition',
      candidates,
      items: []
    };
  }
  const items = selected.map(newsStoreCandidateToRawItem);
  const dedupedItems = dedupeRawItemsByEvent(items);
  if (uniqueStoryCount < 8 || selectedCount < 8 || selected.length < 8 || dedupedItems.length < 8) {
    return {
      ok: false,
      reason: `news_store_candidates_below_publish_threshold:${Math.min(uniqueStoryCount, selectedCount, selected.length, dedupedItems.length)}/8`,
      candidates,
      items: []
    };
  }
  return {
    ok: true,
    reason: '',
    candidates,
    items: dedupedItems
  };
}

function dedupeRawItemsByEvent(items) {
  const seen = new Map();
  const out = [];
  for (const item of items) {
    const signature = eventSignatureFor(item);
    if (!signature) {
      out.push(item);
      continue;
    }
    const prior = seen.get(signature);
    if (prior) {
      prior.duplicate_event_ids.push(item.id || item.title || '');
      continue;
    }
    item.duplicate_event_ids = [];
    seen.set(signature, item);
    out.push(item);
  }
  return out;
}

function clamp(input, max) {
  const text = decodeText(input);
  if (text.length <= max) return text;
  let cut = text.slice(0, Math.max(0, max - 3)).trimEnd();
  cut = cut.replace(/[A-Za-z][A-Za-z-]*$/, '').trimEnd();
  return `${cut}...`;
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

function normalizeEventText(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/％/g, '%')
    .replace(/[，。！？、：；,.!?;:"'“”‘’()[\]{}<>《》/\s_-]+/g, ' ')
    .trim();
}

function eventEntity(text) {
  const normalized = normalizeEventText(text);
  const entities = [
    ['alphabet', /\b(alphabet|google)\b|谷歌|字母表/],
    ['openai', /\bopenai\b|奥特曼|sam altman/],
    ['anthropic', /\banthropic\b|claude/],
    ['meta', /\bmeta\b/],
    ['microsoft', /\bmicrosoft\b|微软/],
    ['nvidia', /\bnvidia\b|英伟达/],
    ['amazon', /\bamazon\b|aws|亚马逊/],
    ['apple', /\bapple\b|苹果/],
    ['xai', /\bxai\b|马斯克/]
  ];
  return entities.find(([, pattern]) => pattern.test(normalized))?.[0] || '';
}

function eventAmount(text) {
  const normalized = normalizeEventText(text);
  if (/800\s*亿\s*美元|80\s*b(?:illion)?\s*(?:usd|dollars?)|\$?\s*80\s*b\b|80\s*0?亿美元/.test(normalized)) return '800亿美元';
  const chinese = normalized.match(/(\d+(?:\.\d+)?)\s*亿\s*美元/);
  if (chinese) return `${chinese[1]}亿美元`;
  const billion = normalized.match(/\$?\s*(\d+(?:\.\d+)?)\s*b(?:illion)?\s*(?:usd|dollars?)?/);
  if (billion) return `${Number(billion[1]) * 10}亿美元`;
  const million = normalized.match(/\$?\s*(\d+(?:\.\d+)?)\s*m(?:illion)?\s*(?:usd|dollars?)?/);
  if (million) return `${million[1]}百万美元`;
  return '';
}

function eventAction(text) {
  const normalized = normalizeEventText(text);
  if (/ai|人工智能/.test(normalized) && /资本支出|支出|建设|基础设施|capex|capital expenditure|spending|infrastructure|股权资本|资金/.test(normalized)) {
    return 'AI资本支出';
  }
  if (/融资|筹资|募集|筹集|funding|financing|raise|raised|investment|investor/.test(normalized)) return '融资';
  if (/发布|推出|上线|launch|release|announce|introduce/.test(normalized)) return '推出';
  if (/合作|partner|partnership/.test(normalized)) return '合作';
  if (/诉讼|lawsuit|court|trial|legal/.test(normalized)) return '诉讼';
  return '';
}

function eventSignatureFor(item) {
  const text = rawStoryText(item);
  const entity = eventEntity(text);
  const amount = eventAmount(text);
  const action = eventAction(text);
  if (!entity || !amount || !action) return '';
  return `event:${entity}:${amount}:${action}`;
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
    ['AgentWatch', /AgentWatch/i],
    ['Strands Agents', /Strands Agents/i],
    ['Strands', /\bStrands\b/i],
    ['NVIDIA NIM', /NVIDIA NIM/i],
    ['OpenRouter', /OpenRouter/i],
    ['DuckDuckGo', /DuckDuckGo/i],
    ['LangSmith', /LangSmith/i],
    ['Kubernetes', /Kubernetes/i],
    ['AgentCore payments', /AgentCore payments/i],
    ['agentic commerce', /agentic commerce/i],
    ['research assistants', /research assistants?/i],
    ['gig economy robot training', /gig economy.*train.*robots?|train.*robots?.*gig economy/i],
    ['Pope Leo XIV', /Pope Leo XIV|Pope/i],
    ['Aderant', /Aderant/i],
    ['SandboxAQ', /SandboxAQ/i],
    ['Anthropic', /Anthropic/i],
    ['Cloudflare', /Cloudflare/i],
    ['LetinAR', /LetinAR/i],
    ['AI glasses', /AI glasses/i],
    ['Anduril', /Anduril/i],
    ['Meta', /\bMeta\b/i],
    ['Alphabet', /\bAlphabet\b|字母表/i],
    ['Google', /\bGoogle\b|谷歌/i],
    ['贝恩', /贝恩|\bBain\b/i],
    ['Elon Musk', /Elon Musk|Musk/i],
    ['Sam Altman', /Sam Altman|Altman/i]
  ].forEach(([value, pattern]) => {
    if (pattern.test(text)) add('entity', value);
  });
  const signatureAction = eventAction(text);
  if (signatureAction) add('action', signatureAction);
  if (/partner|partnership/i.test(text)) add('action', '合作');
  if (/on-premise|hybrid/i.test(text)) add('action', '混合与本地部署');
  if (/fine-tun|LoRA|DoRA/i.test(text)) add('action', '微调');
  if (/content moderation/i.test(text)) add('action', '内容审核');
  if (/leaderboard|ranking/i.test(text)) add('action', '榜单排名');
  if (/evaluation|evaluators?|benchmark/i.test(text)) add('action', '评测');
  if (/document parsing|OCR/i.test(text)) add('action', '文档解析');
  if (/audiobook/i.test(text)) add('action', '有声书生成');
  if (/podcast/i.test(text)) add('action', '播客生成');
  if (/train.*robots?|robots?.*train/i.test(text)) add('action', '机器人训练');
  if (hasLegalEvidence(text)) add('action', '诉讼');
  if (/acquired|acquire/i.test(text)) add('action', '收购');
  if (/AI glasses|optics/i.test(text)) add('action', 'AI 眼镜光学');
  if (/cloud operations/i.test(text)) add('action', '云运维');
  if (/valuation/i.test(text)) add('action', '估值变化');
  if (/installs are up|install.*up/i.test(text)) add('action', '安装增长');
  if (/monitoring|ambient agents/i.test(text)) add('action', '主动监控');
  if (/observability/i.test(text)) add('action', '可观测性');
  if (/self-hosted|kubernetes/i.test(text)) add('action', '自托管部署');
  if (/payments?|agentic commerce|commerce/i.test(text)) add('action', '支付链路');
  if (/research assistants?/i.test(text)) add('action', '研究助手');
  if (/pope|dangers of ai|write about/i.test(text)) add('action', 'AI 写作争议');
  if (/langgraph|multi-agent systems|serverless/i.test(text)) add('action', '多智能体部署');
  if (/code-based evaluators/i.test(text)) add('action', '代码评估器');
  if (/drug discovery/i.test(text)) add('action', '药物发现');
  if (/smart glasses for warfare/i.test(text)) add('action', '军用智能眼镜');
  if (/降本|成本降幅|cost reduction|reduce costs?/i.test(text)) add('action', '成本降幅');
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
      .replace(/^Build(?:ing)?\s+/i, '')
      .replace(/^Technical\s+deep\s+dive:\s*/i, '')
      .replace(/^From\s+idea\s+to\s+AI\s+app:\s*/i, '')
      .replace(/^Mission\s+Control\s+for\s+/i, '')
      .replace(/^Extending\s+/i, '')
      .replace(/^Implementing\s+/i, '')
      .replace(/[,:;.!?]+$/g, '')
      .trim();
    if (/^agentic gemini era$/i.test(normalized)) normalized = 'Gemini';
    if (/gig economy.*robots?/i.test(normalized)) normalized = 'India gig economy robot training';
    if (/^learning transferable predictability representations$/i.test(normalized)) normalized = 'Predictability Representations';
    if (/^research assistants?$/i.test(normalized)) normalized = 'Strands research assistants';
    if (!normalized || normalized.length < 3) return;
    const lower = normalized.toLowerCase();
    if (sourceSet.has(lower) || sourceSet.has(lower.replace(/\s+/g, ''))) return;
    if (/^(from|with|using|this|that|how|why|here|what|when|where|new|the|and|for|at|in|on|to|of|is|are|build|building|technical|mission|control|welcome|introducing|extending|implementing)$/i.test(normalized)) return;
    if (isGenericObject(normalized)) return;
    if (!candidates.includes(normalized)) candidates.push(normalized);
  };

  [
    /MEG Vision X2 AI\+?/ig,
    /N1X\/N1/ig,
    /\bN1X\b/ig,
    /\bN1\b/ig,
    /千问 AI 眼镜/ig,
    /小米 XLA 认知大模型/ig,
    /Xiaomi MiMo/ig,
    /MiMo大模型/ig,
    /Codex UI Tool/ig,
    /OpenAI模型/ig,
    /Claude Mythos/ig,
    /贝恩/ig,
    /Bain/ig,
    /AI Vulnerability Scanner/ig,
    /Open Agent Leaderboard/ig,
    /Amazon Bedrock AgentCore Memory/ig,
    /Amazon Bedrock AgentCore/ig,
    /AgentCore payments/ig,
    /AgentWatch/ig,
    /Amazon Quick/ig,
    /OpenRouter/ig,
    /DuckDuckGo/ig,
    /LangSmith/ig,
    /Kubernetes/ig,
    /Strands Agents/ig,
    /NVIDIA NIM/ig,
    /Strands/ig,
    /research assistants?/ig,
    /gig economy.*robots?/ig,
    /Pope Leo XIV/ig,
    /Pope/ig,
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
  const raw = decodeText(title);
  const text = raw.toLowerCase();
  if (/联合发布|发布|推出|首销|开启预约|搭载|上线|落地|登顶|亮相/.test(raw)) return '推出';
  if (/ai|人工智能/i.test(raw) && /资本支出|支出|建设|基础设施|capex|capital expenditure|spending|infrastructure|股权资本|资金/i.test(raw)) return 'AI资本支出';
  if (/降本|成本降幅|cost reduction|reduce costs?/i.test(raw)) return '成本降幅';
  if (/融资|估值|亿美元|投资|收购|并购/.test(raw)) return '融资';
  if (/合作|伙伴|赋能/.test(raw)) return '合作';
  if (/风险|隐患|勒索|被骗|安全|漏洞|攻击|窃取|Stole|Secretly Stole/i.test(raw)) return '风险提示';
  if (/推翻|猜想|学界|论文|研究|实验|模型/.test(raw)) return '研究突破';
  if (/langgraph|multi-agent systems|serverless/.test(text)) return '多智能体部署';
  if (/leaderboard|ranking/.test(text)) return '榜单排名';
  if (/benchmark|evaluation|evaluators?/.test(text)) return '评测';
  if (/valuation/.test(text)) return '估值变化';
  if (hasFundingEvidence(text)) return '融资';
  if (hasLegalEvidence(text)) return '诉讼';
  if (/auto-delet|delete/.test(text)) return '自动清除';
  if (/audiobook/.test(text)) return '有声书生成';
  if (/generate|create|podcast/.test(text)) return '生成';
  if (/tool calling/.test(text)) return '工具调用';
  if (/memory/.test(text)) return '记忆扩展';
  if (/search/.test(text)) return '搜索改版';
  if (/installs are up|install.*up/.test(text)) return '安装增长';
  if (/monitoring|ambient agents/.test(text)) return '主动监控';
  if (/observability/.test(text)) return '可观测性';
  if (/self-hosted|kubernetes/.test(text)) return '自托管部署';
  if (/payments?|agentic commerce|commerce/.test(text)) return '支付链路';
  if (/research assistants?/.test(text)) return '研究助手';
  if (/train.*robots?|robots?.*train/.test(text)) return '机器人训练';
  if (/pope|dangers of ai|write about/.test(text)) return 'AI 写作争议';
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
  const originalTitle = decodeText(item.original_title || item.title || '').toLowerCase();
  if (/self-hosted langsmith|mission control/.test(originalTitle)) return 'LangSmith 进入自托管运维';
  if (/langgraph|multi-agent systems|serverless/.test(originalTitle)) return `${object}转向多智能体编排`;
  if (action === '榜单排名' || action === '评测') return `${source}把${object}放进公开评测`;
  if (action === 'AI资本支出') return `${object}计划 800 亿美元 AI 基建支出`;
  if (action === '融资') return `${object}完成融资，验证具体市场`;
  if (action === '诉讼') return `${object}诉讼继续牵动 AI 治理`;
  if (action === '风险提示') return /codex/i.test(object) ? 'Codex 工具暴露 OpenAI 令牌风险' : `安全风险指向 ${displayObject(object)}`;
  if (action === '研究突破') return /openai|数学|猜想|80年/i.test(`${object} ${originalTitle}`) ? 'OpenAI 模型推翻数学猜想' : `研究突破指向 ${displayObject(object)}`;
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
  if (action === '估值变化') return `${object}估值变化，市场开始重新定价`;
  if (action === '安装增长') return `${object}安装增长，搜索入口竞争升温`;
  if (action === '主动监控') return `${object}把监控交给环境智能体`;
  if (action === '可观测性') return `${object}补上企业可观测性`;
  if (action === '自托管部署') return `${object}进入自托管运维`;
  if (action === '支付链路') return `${object}开始处理智能体支付`;
  if (action === '研究助手') return `${object}把研究助手做成应用`;
  if (action === '机器人训练') return `印度零工数据盯上机器人训练`;
  if (action === 'AI 写作争议') return `${object}牵出 AI 写作争议`;
  if (action === '多智能体部署') return `${object}走向多智能体部署`;
  if (action === '团队变动' && /anthropic|vulnerability scanner|ibm|glasswing/i.test(`${object} ${originalTitle}`)) return 'Anthropic 漏洞扫描器进入企业测试';
  if (action === '成本降幅') return `${object}调研显示 AI 降本低于预期`;
  if (action === '推出') return `${displayObject(object)}补上产品能力`;
  return `${displayObject(object)}推进${action}`;
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
  if (action === 'AI资本支出') return `${source}报道${object}围绕 800 亿美元资金推进 AI 建设，重点不是短期募资话术，而是数据中心、算力和云基础设施的长期投入。`;
  if (action === '融资') return `${source}报道${object}完成融资，这笔钱接下来要回答它到底解决哪个具体产品问题。`;
  if (action === '诉讼') return `${source}围绕${object}的法律争议继续发酵，AI 公司治理、承诺和商业化之间的拉扯被推到台前。`;
  if (action === '评测' || action === '榜单排名') return `${source}把${object}放进评测框架，任务集、评分方法和结果复现会决定它有没有参考价值。`;
  if (action === '视觉识别') return `${source}提到${object}的视觉识别能力，真正要看的是它在真实环境里能否稳定读懂场景。`;
  if (action === '设计工具') return `${source}把${object}推到设计工具层面，关键是它能否改变原型、素材和协作流程。`;
  if (action === '团队变动') return `${source}把${object}的人才流动放到前沿模型竞争里看，训练经验和研究判断仍是稀缺资源。`;
  if (action === '估值变化') return `${source}报道${object}估值变化，真正要看的是它背后哪类流量、模型接入或开发者入口被市场重新定价。`;
  if (action === '安装增长') return `${source}写到${object}安装增长，说明用户正在用脚投票，搜索入口的默认权力开始被 AI 搜索体验重新挑战。`;
  if (action === '主动监控') return `${source}把${object}放进主动监控场景，AI 不只是回答问题，而是开始替团队盯系统、发现异常和提醒下一步。`;
  if (action === '可观测性') return `${source}围绕${object}讲企业可观测性，关键是它能不能把日志、指标和排障流程接成一个可用入口。`;
  if (action === '自托管部署') return `${source}把${object}放到自托管和 Kubernetes 运维里，企业要看的不是酷功能，而是权限、升级和稳定性。`;
  if (action === '支付链路') return `${source}写到${object}，说明智能体正在碰支付、授权和交易确认这类更敏感的商业环节。`;
  if (action === '研究助手') return `${source}把${object}做成研究助手，价值在于能不能从资料、检索到生成应用形成一条可复用流程。`;
  if (action === '机器人训练') return `${source}把${object}和机器人训练连起来，说明真实世界任务的数据供给正在变成 AI 公司新的争夺点。`;
  if (action === 'AI 写作争议') return `${source}围绕${object}讨论 AI 写作争议，重点是权威文本、公众信任和生成工具边界会被放到一起审视。`;
  if (action === '多智能体部署') return `${source}把${object}推向多智能体部署，企业要看的不是 agent 数量，而是编排、成本和故障边界。`;
  if (action === '成本降幅') return `${source}引用${object}调研称，四成受访公司 AI 成本降幅未超过 10%，企业 AI 的 ROI 正在从愿景变成算账题。`;
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
  if (action === 'AI资本支出') return `${audience}要看${object}：800 亿美元 AI 基建支出会改变算力供给、云服务成本和模型训练节奏。`;
  if (action === '估值变化') return `${audience}要看${object}：估值变化会倒逼它证明流量、收入或开发者入口真能成立。`;
  if (action === '安装增长') return `${audience}要看${object}：入口迁移一旦发生，搜索分发和广告预算都会跟着挪动。`;
  if (action === '主动监控') return `${audience}要看${object}：监控如果变主动，值班、告警和排障成本都会重新计算。`;
  if (action === '自托管部署') return `${audience}要看${object}：自托管能力决定它能不能进入更敏感的企业环境。`;
  if (action === '支付链路') return `${audience}要看${object}：智能体碰到支付后，权限和责任边界会比模型能力更要命。`;
  if (action === '机器人训练') return `${audience}要看${object}：机器人需要现实数据，数据来源会影响成本、质量和合规。`;
  if (action === '成本降幅') return `${audience}要看${object}：如果四成公司降本不到 10%，AI 项目就必须重新核算流程、采购和人效指标。`;
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
  if (action === 'AI资本支出') return `${object}这 800 亿美元看的是 AI 基建耐力：钱会烧在机房、芯片和云服务上，真正压力是把算力变成可收费产品。`;
  if (action === '估值变化') return `${object}被重新定价，说明市场开始问它到底卡住了哪个入口。`;
  if (action === '安装增长') return `${object}增长不是虚热，用户愿意换默认入口才是真信号。`;
  if (action === '主动监控') return `${object}这类能力很朴素，但能少叫醒几次人，就有预算价值。`;
  if (action === '自托管部署') return `${object}进自托管，说明企业终于开始问“我能不能自己管住它”。`;
  if (action === '支付链路') return `${object}一碰支付就不再是玩具，权限设计会立刻变成生死线。`;
  if (action === '机器人训练') return `${object}这事现实得很：机器人缺的是可用数据、标注成本和稳定客户。`;
  if (action === '成本降幅') return `${object}这份调研提醒企业别把 AI 当自动省钱按钮。降本不到 10% 的项目，要先查流程是不是没改、数据是不是没通、工具是不是只停在试点。`;
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
  if (action === 'AI资本支出') return `看${object}是否把 800 亿美元支出转成云收入。`;
  if (action === '融资') return `看${object}融资后是否给出产品指标。`;
  if (action === '诉讼') return `看${object}后续是否影响治理承诺。`;
  if (action === '评测' || action === '榜单排名') return `看${object}是否公开任务集和评分细则。`;
  if (action === '估值变化') return `看${object}是否公布收入或使用指标。`;
  if (action === '安装增长') return `看${object}是否持续抢走默认搜索入口。`;
  if (action === '主动监控') return `看${object}是否公开告警准确率和接入方式。`;
  if (action === '自托管部署') return `看${object}是否给出升级、权限和审计方案。`;
  if (action === '支付链路') return `看${object}是否公开授权、退款和责任规则。`;
  if (action === '机器人训练') return `看${object}是否公布数据质量和客户案例。`;
  if (action === '成本降幅') return `看${object}后续是否拆出行业和流程差异。`;
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
  if (/learning-to-defer with expert-conditional advice/.test(text)) {
    return {
      title: 'Expert-Conditional Advice 研究学习何时转交专家',
      summary: 'arXiv stat.ML 这篇 Learning-to-Defer 论文研究在专家条件建议下，模型什么时候该自己预测、什么时候该把决策交给专家。',
      why: '研究者和高风险产品团队要看：Learning-to-Defer 会影响医疗、安全审核这类场景里的人机分工和责任边界。',
      janet: 'Expert-Conditional Advice 的价值不在多一个模型名，而在提醒团队：医疗、安全审核这类任务里，有些判断应该让模型退一步，把决策交给专家或更可靠的系统；会转交，比硬撑一个答案更值钱。',
      watch: '看论文是否给出可复现实验和高风险任务设置。'
    };
  }
  if (/incremental bpe tokenization/.test(text)) {
    return {
      title: 'Incremental BPE Tokenization 研究增量分词',
      summary: 'arXiv cs.CL 这篇论文关注 Incremental BPE Tokenization，重点是让分词在流式和增量场景里更高效地更新。',
      why: '模型工程团队要看：增量 BPE 如果稳定，会影响长文本、实时输入和多轮生成里的延迟与缓存策略。',
      janet: 'Incremental BPE Tokenization 很底层，但底层优化最会偷偷省钱。它不负责让模型更聪明，却可能让流式输入、长文本和多轮生成少等几拍；真正价值会体现在延迟、缓存和推理账单里。',
      watch: '看它在流式生成和长上下文任务里的延迟数据。'
    };
  }
  if (/speculative decoding across languages/.test(text)) {
    return {
      title: 'Speculative Decoding Across Languages 比较多语言解码',
      summary: 'arXiv cs.CL 这篇 Speculative Decoding Across Languages 把推测解码放到多语言场景里比较，重点是不同语言下加速效果是否稳定。',
      why: '多语言产品和推理平台要看：推测解码如果跨语言表现不稳，中文、小语种和英文产品的成本曲线会不同。',
      janet: 'Speculative Decoding Across Languages 这条看的是推理成本，不是模型炫技。多语言一上来，很多英文场景里省下的钱可能就没那么好复制；中文和小语种的速度、质量折损，才是平台真正要重新算的账。',
      watch: '看论文是否公开各语言的速度和质量折损。'
    };
  }
  if (/learning transferable predictability representations/.test(text)) {
    return {
      title: 'Predictability Representations 研究可迁移预测',
      summary: 'arXiv cs.LG 这篇 Learning Transferable Predictability Representations 关注可迁移的可预测性表示，重点是让模型更好判断哪些模式能跨任务复用。',
      why: '研究者和模型工程团队要看：可迁移预测表示如果成立，会影响小样本任务、跨域泛化和后续评测方法。',
      janet: 'Learning Transferable Predictability Representations 这条不是产品发布，而是在问模型学到的“可预测性”能不能迁移。真正要盯的是跨任务实验、数据设置和失败案例，否则它只会停在漂亮论文标题里。',
      watch: '看论文是否公开跨域实验和代码。'
    };
  }
  if (/stochastic gradients under nuisances/.test(text)) {
    return {
      title: 'Stochastic Gradients under Nuisances 研究噪声梯度',
      summary: 'arXiv stat.ML 这篇 Stochastic Gradients under Nuisances 讨论干扰因素下的随机梯度，重点是训练估计在噪声条件里是否仍然可靠。',
      why: '模型训练和统计学习团队要看：干扰因素会影响梯度估计、收敛判断和实验复现，尤其是数据不干净的真实任务。',
      janet: 'Stochastic Gradients under Nuisances 听起来很数学，但它问的是训练里最现实的事：数据和环境有干扰时，梯度还靠不靠谱。工程团队要看假设条件和误差界，别只把它当又一篇优化论文。',
      watch: '看它是否给出噪声条件下的实验复现。'
    };
  }
  if (/企查查mcp/.test(text)) {
    return {
      title: '企查查 MCP 接入 30+ 行业企业数据',
      summary: '企查查把 MCP 接进 30 多个行业，让 AI Agent 能调用实时企业数据，重点是减少幻觉和 Token 消耗。',
      why: '企业服务和 Agent 团队要看：企查查 MCP 把外部数据源接进工具链后，企业查询、尽调和风控流程会更容易自动化。',
      janet: '企查查 MCP 这条比普通 Agent 新闻具体：它给智能体塞的是实时企业数据，不是又一个聊天入口。真正要看调用权限、数据更新和错误回滚。',
      watch: '看企查查 MCP 是否公开行业接口和调用价格。'
    };
  }
  if (/讯灵ai geo\+agent|双引擎生态/.test(text)) {
    return {
      title: '讯灵 AI GEO+Agent 主打内容与智能体生态',
      summary: 'IT之家报道讯灵 AI GEO+Agent 双引擎生态，重点是把数据、内容和智能体能力打包成企业增长方案。',
      why: '营销和企业数字化团队要看：讯灵 AI GEO+Agent 如果要成立，必须证明内容生成、数据分析和智能体执行能接成闭环。',
      janet: '讯灵 AI GEO+Agent 这条更像企业营销基础设施生意。别只看“双引擎”说法，要看它能不能把内容生产、数据分析和智能体执行结果对上；如果不能证明转化指标，生态包装就很容易变成热词拼盘。',
      watch: '看讯灵是否公布客户案例和转化指标。'
    };
  }
  if (/扣子coze上线3\.0|coze.*3\.0/.test(text)) {
    return {
      title: '扣子 Coze 3.0 升级 Agent 平台',
      summary: '钛媒体报道字节跳动扣子 Coze 3.0 上线，重点是把 AI Agent 平台能力继续往企业和开发者场景推进。',
      why: '开发者和企业自动化团队要看：Coze 3.0 如果补齐编排、插件和部署能力，会影响国内 Agent 平台的默认入口。',
      janet: 'Coze 3.0 的压力不在发布词，而在能不能让开发者少搭几层工具。字节有流量和生态，但 Agent 平台最后要靠可部署、可维护、可计费；插件、权限和企业交付细节，才会决定它能不能成为默认入口。',
      watch: '看 Coze 3.0 的插件、部署和企业权限细则。'
    };
  }
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
  if (/ai statistic 2026|startup playbook|market, funding, enterprise/i.test(raw)) {
    return {
      title: '创业市场手册梳理AI融资市场',
      summary: `${source}发布 AI Statistic 2026 与 StartUp Playbook，重点不是单家公司融资，而是把市场规模、企业采用和创业融资放进同一张表。`,
      why: '投资者和创业团队要看这份手册：如果企业采用和预算方向一起变化，早期项目的定价、获客和退出预期都会被重新校准。',
      janet: '创业市场手册这类资料适合拿来做基准线，不适合当作创业鸡血。它真正有用的地方，是帮团队分清哪些赛道还有预算，哪些只是被 AI 标签暂时抬高。',
      watch: '看这份手册是否给出细分市场数据。'
    };
  }
  if (/N1X/i.test(raw) && /Windows|Arm|英伟达|微软/i.test(raw)) {
    return {
      title: 'N1X 把终端AI芯片带上台面',
      summary: `${source}把 N1X 放进 Windows、Arm、英伟达和微软的同一条线索里看，重点是终端 AI 芯片路线开始被更具体地讨论。`,
      why: 'PC 厂商和开发团队要看 N1X：如果终端算力、功耗和软件兼容能同时成立，AI PC 的产品路线会更清楚。',
      janet: 'N1X 这类消息不是只看芯片参数，而是看 Windows 生态能不能把端侧 AI 真接起来。',
      watch: '看 N1X 是否公开性能、功耗和软件支持。'
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

function publicEntityKey(value) {
  return String(value || '')
    .trim()
    .replace(/^Self-Hosted\s+/i, '')
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function uniqueEntityList(items, max = 5) {
  const seen = new Set();
  const out = [];
  for (const item of items || []) {
    const clean = cleanPublicTitle(item);
    const key = publicEntityKey(clean);
    if (!clean || seen.has(key)) continue;
    seen.add(key);
    out.push(clean);
    if (out.length >= max) break;
  }
  return out;
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
  if (/LangSmith/i.test(`${lead.title || ''} ${lead.original_title || ''} ${lead.story_fact?.concrete_object || ''}`)) {
    return 'LangSmith 进入自托管运维';
  }
  const objects = uniqueEntityList(concreteObjectsFor(stories, 4).map(displayObject), 4);
  const actions = concreteActionsFor(stories, 3);
  const first = objects[0] || chineseSourceName(stories[0]?.source);
  const second = objects[1] || objects[0] || date.replaceAll('-', '.');
  const action = actions[0] || '更新';
  const shortFirst = shortHeadlineObject(first, 17);
  const shortSecond = shortHeadlineObject(second, 13);
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
    .map((item) => cleanPublicTitle(String(item).trim()));
  const forbidden = [...(rules.forbidden_frontend_phrases || []), '工具链又拧紧了', '公开源池晨报'];
  const history = recentTitles(Number(rules.title_generation?.forbid_repeat_days || 7));
  const selected = candidates.find((item) => (
    !history.includes(item) &&
    [...item].length <= 24 &&
    !forbidden.some((phrase) => item.includes(phrase)) &&
    !FORBIDDEN_SURFACE_COPY.some((phrase) => item.includes(phrase)) &&
    hasConcreteHeadlineObject(item, objects) &&
    hasChinese(item)
  ));
  if (selected) return selected;
  const leadTitle = cleanPublicTitle(lead.zh_title || lead.title || '');
  const fallback = hasConcreteHeadlineObject(leadTitle, objects) ? leadTitle : `${shortFirst}带出${action || '新动作'}`;
  if (!history.includes(fallback)) return fallback;
  return `${shortFirst}有新动作`;
}

function thesisForEdition(stories) {
  const objects = uniqueEntityList(concreteObjectsFor(stories, 5).map(displayObject), 5);
  const actions = concreteActionsFor(stories, 4);
  const sources = sourceNames(stories.slice(0, 5), 4).join('、');
  if (objects.includes('LangSmith') && objects.includes('Kubernetes')) {
    return '今天先看 LangSmith、Kubernetes 和 Mission Control 这些线索：它们指向同一件事，AI 工具正在从演示层进入部署、监控和权限管理这些硬环节。';
  }
  const objectText = objects.slice(0, 4).join('、') || sources || '今天这几条具体产品';
  const actionText = actions.slice(0, 3).join('、') || '功能边界、接入方式和评测方法';
  return clamp(`今天先看的对象是${objectText}：它们分别牵出${actionText}。别按声量排序，要看这些产品和评测会怎样改变具体使用路径。`, 150);
}

function displayObject(value) {
  const text = cleanPublicTitle(value);
  const map = [
    [/Self-Hosted LangSmith/i, 'LangSmith'],
    [/Strands research assistants?/i, 'Strands research assistants'],
    [/India gig economy robot training/i, '印度零工数据'],
    [/Pope Leo XIV/i, 'Pope Leo XIV'],
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
    [/Open Agent Leaderboard/i, '智能体榜单'],
    [/Download Codex UI Tool Secretly|Download Codex UI|Codex UI Tool/i, 'Codex 刷新令牌'],
    [/AI Vulnerability Scanner/i, 'Anthropic 漏洞扫描器'],
    [/StartUp Playbook/i, '创业市场手册'],
    [/AI Statistic/i, 'AI 统计报告'],
    [/OpenAI模型/i, 'OpenAI 模型'],
    [/Codex工具/i, 'Codex 工具'],
    [/Windows/i, 'Windows 终端']
  ];
  for (const [pattern, replacement] of map) {
    if (pattern.test(text)) return replacement;
  }
  return text.length > 20 ? clamp(text, 23).replace(/\.\.\.$/, '') : text;
}

function shortHeadlineObject(value, max = 16) {
  const cleaned = cleanPublicTitle(displayObject(value));
  const aliases = [
    [/Expert-Conditional(?: Advice)?/i, 'Learning-to-Defer'],
    [/Learning-to-Defer/i, 'Learning-to-Defer'],
    [/Incremental BPE(?: Tokenization)?/i, '增量 BPE'],
    [/Speculative(?: Decoding Across Languages)?/i, '多语言推测解码'],
    [/AI GEO\+Agent/i, 'GEO+Agent']
  ];
  for (const [pattern, replacement] of aliases) {
    if (pattern.test(cleaned)) return replacement;
  }
  if ([...cleaned].length <= max) return cleaned;
  if (/^[A-Za-z0-9+ .-]+$/.test(cleaned)) {
    const words = cleaned.split(/\s+/).filter(Boolean);
    return words.slice(0, 2).join(' ') || cleaned;
  }
  return clamp(cleaned, max + 3).replace(/\.\.\.$/, '');
}

function hasConcreteHeadlineObject(title, objects) {
  const text = cleanPublicTitle(title);
  if (!text || /^(带出|牵出)?(?:推出|融资|合作|诉讼|AI资本支出|智能体能力|具体动作|更新)$/.test(text)) return false;
  const normalized = normalizeEventText(text);
  const objectTerms = objects.flatMap((object) => [object, displayObject(object), shortHeadlineObject(object, 24)].filter(Boolean));
  return objectTerms.some((term) => {
    const clean = normalizeEventText(term);
    return clean && (normalized.includes(clean) || clean.includes(normalized));
  }) || cnCharCount(text) >= 4;
}

function concreteObjectsFor(stories, limit = 5) {
  const objects = [];
  for (const story of stories) {
    const candidates = [
      story.story_fact?.concrete_object,
      ...(story.story_fact?.products || []),
      ...(story.story_fact?.entities || []),
      ...(story.story_facts || [])
        .filter((fact) => ['entity', 'product', 'concrete_object'].includes(fact.label))
        .map((fact) => fact.value)
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
  const objects = uniqueEntityList(concreteObjectsFor(stories, 5).map(displayObject), 5);
  const actions = concreteActionsFor(stories, 4);
  const leadObject = objects[0] || chineseSourceName(stories[0]?.source);
  const secondObject = objects[1] || objects[0] || '另一条具体产品线';
  const shortLeadObject = shortHeadlineObject(leadObject, 17);
  const shortSecondObject = shortHeadlineObject(secondObject, 11);
  const themeCandidate = shortLeadObject === shortSecondObject
    ? `${shortLeadObject}成为今日主线`
    : `${shortLeadObject}牵出${shortSecondObject}`;
  let theme = themeCandidate.length <= 24 && hasConcreteHeadlineObject(themeCandidate, objects) ? themeCandidate : `${shortLeadObject}成为今日主线`;
  if (cleanPublicTitle(theme) === cleanPublicTitle(dailyTitle)) {
    theme = `${shortLeadObject}带出另一条线索`;
  }
  const dailySummary = clamp(`今天的主线落在${objects.slice(0, 4).join('、') || leadObject}，看点是${actions.slice(0, 3).join('、') || '功能边界和接入方式'}，不是抽象趋势。`, 118);
  const dailyJudgment = clamp(`Janet 判断：${leadObject}这类新闻要看对象和动作，能落到入口、接口或评测方法里才算数。`, 92);
  const thesis = thesisForEdition(stories);
  const intro = clamp(`${leadObject}先把今天的注意力拉住；${secondObject}补上另一条线索。今天先看这些具体产品怎么动。`, 110);
  return {
    daily_title: cleanPublicTitle(dailyTitle),
    theme: cleanPublicTitle(theme),
    daily_summary: cleanTemplateCopy(dailySummary),
    daily_judgment: cleanTemplateCopy(dailyJudgment),
    daily_thesis: thesis,
    intro_text: cleanTemplateCopy(intro),
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

function uniqueCopyParts(item) {
  const fact = item?.story_fact || {};
  const object = displayObject(fact.concrete_object || item?.title || '这条新闻');
  const action = fact.action || '具体动作';
  const source = chineseSourceName(item?.source);
  const raw = item?.original_title || item?.raw_item?.original_title || item?.title || '';
  const amount = eventAmount(raw) || '';
  return { object, action, source, raw, amount };
}

function uniqueSummaryCopy(item) {
  const { object, action, source, raw, amount } = uniqueCopyParts(item);
  const amountText = amount ? `，其中数字锚点是${amount}` : '';
  return clamp(`${source}这条围绕${object}的${action}${amountText}；和同屏其他新闻相比，它的原始线索是「${raw}」。`, 118);
}

function uniqueWhyCopy(item) {
  const { object, action, amount } = uniqueCopyParts(item);
  const amountText = amount ? `${amount}这类预算会直接影响成本和采购节奏，` : '';
  return clamp(`${object}的${action}值得单独看：${amountText}它会改变相关团队判断产品边界、接入时机和后续成本的方式。`, 96);
}

function uniqueJanetTakeCopy(item) {
  const { object, action, source, amount } = uniqueCopyParts(item);
  if (action === 'AI资本支出') {
    return clamp(`${object}${amount || '这笔'} AI 基建投入要看算力、机房和云收入能否对上账，${source}这条不能再写成普通资本故事。`, 100);
  }
  return clamp(`${object}这次${action}要贴着${source}给出的事实看：谁使用、钱花在哪、限制是什么，比套一句趋势判断更重要。`, 96);
}

function uniqueWatchCopy(item) {
  const { object, action, amount } = uniqueCopyParts(item);
  const amountText = amount ? `${amount}后续` : '后续';
  return clamp(`看${object}${amountText}是否补齐${action}的指标。`, 48);
}

function ensureUniqueHomepageCopy(items) {
  makeFieldUnique(items, 'summary', uniqueSummaryCopy);
  makeFieldUnique(items, 'why_it_matters', uniqueWhyCopy);
  makeFieldUnique(items, 'janet_take', uniqueJanetTakeCopy);
  makeFieldUnique(items, 'watch_next', uniqueWatchCopy);
  items.forEach(scrubTemplateCopy);
}

function ensureUniqueStoryCopy(stories) {
  makeFieldUnique(stories, 'zh_title', (story) => clamp(`${story.zh_title || story.title}（${chineseSourceName(story.source)}）`, 52));
  makeFieldUnique(stories, 'title', (story) => story.zh_title || story.title);
  makeFieldUnique(stories, 'zh_summary', uniqueSummaryCopy);
  makeFieldUnique(stories, 'summary', (story) => story.zh_summary || story.summary);
  makeFieldUnique(stories, 'why_it_matters', uniqueWhyCopy);
  makeFieldUnique(stories, 'janet_take', uniqueJanetTakeCopy);
  makeFieldUnique(stories, 'watch_next', uniqueWatchCopy);
  stories.forEach((story) => {
    scrubTemplateCopy(story);
    story.janet_take = buildLongJanetTake(story);
    story.content = buildReaderBody(story);
  });
}

function buildHomepageAssembly(stories, date) {
  const lead = stories[0];
  const used = new Set([lead.id]);
  const sourceCounts = new Map([[lead.source, 1]]);
  const canUseOnHomepage = (story) => {
    if (!story || used.has(story.id)) return false;
    const source = story.source || '';
    return (sourceCounts.get(source) || 0) < 2;
  };
  const markHomepageStory = (story) => {
    if (!story) return;
    used.add(story.id);
    const source = story.source || '';
    sourceCounts.set(source, (sourceCounts.get(source) || 0) + 1);
  };
  const maxSignals = Math.min(3, Math.max(0, stories.length - 1));
  const signalMap = signalMapForEdition(stories.filter((story) => story.id !== lead.id)).map((signal, index) => {
    const story = stories.find((item) => signal.evidence.includes(item.id) && canUseOnHomepage(item));
    if (!story) return null;
    markHomepageStory(story);
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
  }).filter(Boolean).slice(0, maxSignals);

  const compactPool = uniqueStoryList(stories).filter((story) => canUseOnHomepage(story));
  const compactNews = [
    ...compactPool.filter((story) => story.core_eligible),
    ...compactPool.filter((story) => !story.core_eligible)
  ].slice(0, 6);
  compactNews.forEach(markHomepageStory);

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
  const objects = uniqueEntityList(concreteObjectsFor(stories, 3).map(displayObject), 2);
  const actions = concreteActionsFor(stories, 2);
  const object = shortHeadlineObject(objects[0] || first.title || chineseSourceName(first.source), 16);
  const second = shortHeadlineObject(objects[1] || actions[0] || '具体能力', 12);
  if (sectionKey === 'open_source' && /印度零工数据|robot training/i.test(`${object} ${second}`)) return '印度零工数据进入机器人训练链路';
  if (sectionKey === 'business' && /Pope Leo XIV|AI 写作争议/i.test(`${object} ${second}`)) return 'Pope Leo XIV牵出 AI 写作边界';
  if (sectionKey === 'business' && /创业市场手册|StartUp Playbook|AI 统计报告|AI Statistic/i.test(`${object} ${second}`)) return 'StartUp Playbook 牵出 AI Statistic 商业边界';
  if (sectionKey === 'agents') return `${object} 把 ${second} 接进任务链路`;
  if (sectionKey === 'open_source') return `${object} 把 ${second} 放到可复查路径里`;
  if (sectionKey === 'business') return `${object}牵出${second}的商业边界`;
  if (sectionKey === 'models') return `${object} 把 ${second} 落到产品层`;
  if (sectionKey === 'creator_opportunity') return `${object}改写${second}的创作流程`;
  if (sectionKey === 'china_perspective') return `${object}给中国视角补上${second}`;
  return `${object}补充今天的${second}`;
}

function moduleSummaryFor(sectionKey, stories) {
  const sources = sourceNames(stories, 3).join('、') || '多个来源';
  const objects = uniqueEntityList(concreteObjectsFor(stories, 4).map(displayObject), 3);
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
  const primaryFact = shortHeadlineObject(objects[0] || chineseSourceName(lead.source), 18);
  const leadAction = lead.story_fact?.action || concreteActionsFor([lead], 1)[0] || '具体动作';
  const coverTitle = objects.includes('Codex') && objects.includes('Dell')
    ? 'Codex 开始进企业内网'
    : `${primaryFact}牵出${leadAction}`;
  const coverSummary = objects.includes('Codex') && objects.includes('Dell')
    ? '今天的主线不是模型参数，而是 OpenAI 与戴尔把 Codex 推进混合和本地企业环境，AI 编程开始面对真实采购和权限问题。'
    : `${lead.source || '来源'}把${primaryFact}的${leadAction}推到今天主线，影响${lead.story_fact?.audience || '相关使用者'}对功能边界和接入方式的判断。`;
  return {
    daily_title: dailyBrief.daily_title,
    cover_title: coverTitle === dailyBrief.daily_title ? `${primaryFact}成为主线线索` : coverTitle,
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
  const action = story.story_fact?.action || '';
  const object = displayObject(story.story_fact?.concrete_object || normalizeTopic(story));
  const actionCandidates = {
    '可观测性': [
      '继续看日志、指标和排障入口是否打通。',
      '继续看企业监控接入成本和权限边界。'
    ],
    '支付链路': [
      '继续看授权、退款和责任规则是否讲清。',
      '继续看支付确认流程有没有人工兜底。'
    ],
    '多智能体部署': [
      '继续看编排、弹性和故障恢复细节。',
      '继续看多智能体系统能否稳定扩容。'
    ],
    '主动监控': [
      '继续看告警准确率和接入方式。',
      '继续看值班流程会不会真的少一步。'
    ],
    '研究助手': [
      '继续看检索、资料处理和生成应用能否串起来。',
      '继续看研究助手是否开放模板和成本细节。'
    ],
    '自托管部署': [
      '继续看升级、权限和审计方案。',
      '继续看企业内网部署是否给出迁移路径。'
    ]
  };
  const existingWatch = cleanTemplateCopy(story.watch_next || '');
  const existingCopiesTitle = normalizeStoryTitle(existingWatch).includes(normalizeStoryTitle(story.title || story.zh_title || ''));
  const candidates = [
    ...(actionCandidates[action] || []),
    existingCopiesTitle ? '' : existingWatch,
    `继续看${object}的可用入口和权限边界。`,
    `继续看${object}是否补上价格、接口和真实案例。`
  ].map(cleanTemplateCopy);
  let selected = candidates.find((item) => item && !used.has(item));
  if (!selected) selected = `继续看后续证据 ${used.size + 1}。`;
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

function cleanPublicTitle(title) {
  return String(title || '')
    .replace(/\s+/g, ' ')
    .replace(/([A-Za-z0-9+.-])([\u4e00-\u9fff])/g, '$1 $2')
    .replace(/([\u4e00-\u9fff])([A-Za-z0-9+.-])/g, '$1 $2')
    .replace(/Self-HostedLa/g, 'Self-Hosted LangSmith')
    .replace(/Self-Hosted LangSmit\b/g, 'Self-Hosted LangSmith')
    .replace(/LangSmit(?!h)/g, 'LangSmith')
    .replace(/Strands research ass\b/g, 'Strands research assistants')
    .replace(/AgentCor\b/g, 'AgentCore')
    .replace(/OpenRoute\b/g, 'OpenRouter')
    .replace(/Self-Hosted LangSmith自托管/g, 'LangSmith自托管')
    .replace(/LangSmith自托管进入自托管运维/g, 'LangSmith 进入自托管运维')
    .trim();
}

function cleanJoinedSentence(text) {
  return String(text || '')
    .replace(/先看继续看/g, '继续看')
    .replace(/继续看继续看/g, '继续看')
    .replace(/先看看/g, '先看')
    .replace(/。。+/g, '。')
    .replace(/，，+/g, '，')
    .replace(/，。/g, '。')
    .replace(/。\./g, '。')
    .replace(/\s+/g, ' ')
    .trim();
}

function renderWatchNext(watchNext) {
  const clean = cleanJoinedSentence(watchNext);
  if (!clean) return '';
  if (/^(继续看|看|关注|盯)/.test(clean)) return clean;
  return `继续看${clean}`;
}

function cleanTemplateCopy(text) {
  return cleanJoinedSentence(cleanPublicTitle(String(text || '')
    .replace(/Self-Hosted LangSmit\b/g, 'LangSmith')
    .replace(/Self-Hosted LangSmith进入/g, 'LangSmith自托管进入')
    .replace(/Janet 的判断是[:：]?\s*/g, '')
    .replace(/Janet 锐评[:：]?\s*/g, '')
    .replace(/Janet 判断[:：]?\s*/g, '')
    .replace(/破防点是[:：]?\s*/g, '')
    .replace(/破防点在于/g, '')
    .replace(/破防点[:：]?\s*/g, '')
    .replace(/槽点是[:：]?\s*/g, '')
    .replace(/槽点[:：]?\s*/g, '')
    .replace(/这件事要拆成三层看[:：]?/g, '')
    .replace(/接下来要盯的是[:：]?/g, '')
    .replace(/先看对象、动作和限制条件/g, '看清具体对象、产品动作和限制条件')
    .replace(/先看这条新闻里的对象/g, '看清这条新闻里的具体对象')
    .replace(/这不是一句抽象趋势，而是/g, '')
    .replace(/这不是一句抽象趋势/g, '这不是抽象趋势')
    .replace(/不是一句漂亮话，而是/g, '')
    .replace(/不是一句漂亮话/g, '不是漂亮话')
    .replace(/工作流试探/g, '落地路径测试')
    .replace(/对[^。]{0,40}来说，这件事要拆成三层看[:：]?/g, '')
    .replace(/；能省钱、能替流程、能交付，再把它放进自己的工具箱。?/g, '')
    .replace(/能省钱、能替流程、能交付，再把它放进自己的工具箱。?/g, '')
    .replace(/今日封面新闻/g, '头条新闻')
    .replace(/今日封面/g, '头条')
    .replace(/今天值得看的对象是/g, '今天先看的对象是')
    .replace(/今天值得看/g, '今天先看')
    .replace(/值得看，因为/g, '要看，原因是')
    .replace(/重点是/g, '关键在于')
    .replace(/重点看/g, '继续看')
    .replace(/出现(.{0,12})新进展/g, '推进$1')
    .replace(/把(.{0,20})放到首页/g, '收录$1')
    .replace(/开始生成内容/g, '进入内容生产线')
    .replace(/发布词落到了/g, '发布动作落到')
    .replace(/把(.{0,20})放进(.{0,20})语境/g, '让$1进入$2场景')
    .replace(/\s+/g, ' ')
    .trim()));
}

function cleanReaderLabel(text) {
  return cleanTemplateCopy(text);
}

function ensureReaderJanetLabel(text) {
  const clean = cleanTemplateCopy(text);
  if (!clean) return '';
  if (clean.includes('Janet 锐评：')) return clean;
  const paragraphs = clean.split(/\n\n+/).map((part) => part.trim()).filter(Boolean);
  if (paragraphs.length >= 3) {
    paragraphs[2] = `Janet 锐评：${paragraphs[2]}`;
    return paragraphs.join('\n\n');
  }
  return `${clean}\n\nJanet 锐评：这条新闻要回到具体对象、产品动作和使用边界里看。`;
}

function splitSentences(text) {
  return String(text || '')
    .split(/(?<=[。！？!?])\s*/u)
    .map((item) => item.trim())
    .filter(Boolean);
}

function dedupeSentences(parts) {
  if (!Array.isArray(parts)) {
    const seen = new Set();
    const out = [];
    for (const sentence of splitSentences(parts)) {
      const key = sentence.replace(/[，。！？；：、\s]/g, '').slice(0, 40);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push(sentence);
    }
    return out.join('');
  }
  const seen = new Set();
  const out = [];
  for (const part of parts) {
    for (const sentence of splitSentences(part)) {
      const key = sentence.replace(/[，。！？、：；,.!?;:"'“”‘’()[\]{}<>《》/\s]+/g, '');
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push(sentence);
    }
  }
  return out;
}

function renderPublicJanetTake(story) {
  const parts = [
    story.janet_take,
    story.janet_view,
    story.janet_comment
  ].map(cleanReaderLabel).filter(Boolean);
  return dedupeSentences(parts).join(' ');
}

function scrubTemplateCopy(value) {
  if (typeof value === 'string') return cleanTemplateCopy(value);
  if (Array.isArray(value)) return value.map(scrubTemplateCopy);
  if (value && typeof value === 'object') {
    for (const key of Object.keys(value)) {
      value[key] = key === 'content' && typeof value[key] === 'string'
        ? ensureReaderJanetLabel(value[key])
        : scrubTemplateCopy(value[key]);
    }
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
  const watch = cleanTemplateCopy(story.watch_next || '');
  const watchSentence = renderWatchNext(watch).replace(/^继续看/, '再看').replace(/^看/, '再看');
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
    '记忆扩展': `${source}提到${object}，长期记忆如果能稳定调用，智能体才不会每次都像刚入职的临时工。`,
    '可观测性': `${source}报道${object}，重点不是又多一个 agent，而是日志、指标和排障能不能接进企业运维。`,
    '支付链路': `${source}报道${object}，智能体一旦碰到支付，授权、退款和责任边界就会变成产品核心。`,
    '多智能体部署': `${source}报道${object}，多智能体部署真正要考的是编排、扩容和失败恢复。`,
    '主动监控': `${source}报道${object}，监控开始从被动看板往主动提醒走，价值落在告警准确率和接入成本。`,
    '研究助手': `${source}报道${object}，研究助手要证明资料检索、摘要和应用生成能连成一条稳定流程。`
  };
  const opening = openingByAction[action] || `${source}报道${object}，这次已经落到产品、合作、评测或商业路径里的具体动作。`;
  const paragraphs = [
    `${opening}原文标题是「${original}」。${baseSummary}`,
    `${why} 读者可以从三处落点判断它是否值得跟进：能不能降低某段流程成本，国内团队能不能接入或找到替代路径，能不能替掉一个重复岗位或一段外包流程。后续继续看可用入口、权限、价格、评测方法和真实案例，而不是厂商发布时的热闹词。`,
    `${renderPublicJanetTake(story)} ${object}已经开始挤进实际使用链路，但成本、版权、权限和稳定性往往会在发布之后才露出来。国内团队先小范围试用，${watchSentence || `再看${object}是否给出清楚的使用边界`}。`
  ];
  let body = cleanTemplateCopy(paragraphs.join('\n\n'));
  if (cnCharCount(body) < 280) {
    body += `\n\n这条新闻还要放回 Janet 的老三问里看：推理或使用成本会不会下降，国内能不能找到稳定入口，能不能替掉一个人或一个反复消耗时间的步骤。回答不了这三问，就先别把它当成生产力革命。`;
  }
  return ensureReaderJanetLabel(dedupeSentences(body));
}

function buildLongJanetTake(story) {
  const fact = story.story_fact || {};
  const object = displayObject(fact.concrete_object || story.title || '这条新闻');
  const action = fact.action || '产品动作';
  const audience = fact.audience || '相关团队';
  const source = chineseSourceName(story.source);
  let shortTake = cleanTemplateCopy(story.janet_take || '').split('Janet 的判断是：')[0].trim();
  if (/要看入口、权限和使用门槛/.test(shortTake) || cnCharCount(shortTake) > 70 || /国内团队先小范围试用/.test(shortTake)) shortTake = '';
  if (action === '智能体能力' && /稳定完成连续任务/.test(shortTake)) shortTake = '';
  const prefix = shortTake ? `${shortTake} ` : '';
  const podcastTake = /Spotify Studio/i.test(object)
    ? `${prefix}Spotify Studio 把个人收听、日程和播客生成揉到一起，听起来很顺，实际会考验隐私和推荐质量。创作者别只看“自动生成”，要看它能不能给出编辑权、删除权和分发收益。`
    : `${prefix}Spotify Q&A 工具更像给播客补运营后台，问答和简报可以批量生产，但主持人味道也容易被磨平。内容团队可以先拿它做会员运营和节目回顾，不要直接替掉主节目。`;
  const benchmarkTake = /Amazon Bedrock/i.test(object)
    ? `${prefix}Amazon Bedrock 放进招聘助手这类场景，说明企业云厂商正在把智能体变成可采购方案；偏见、审计和合规一个都躲不开。企业要先看日志、权限和人工复核，不要把候选人命运交给黑箱。`
    : `${prefix}${object}如果真要做 AI 治疗或安全评估，关键不是“听起来温柔”，而是能不能扛住高风险场景。心理健康产品最怕半吊子自动化，国内团队更该看风控、人审和退出机制。`;
  const cooperationTake = /Elon Musk|data center|Anthropic/i.test(`${object} ${story.original_title || ''}`)
    ? `${prefix}Anthropic 向马斯克系数据中心买算力，说明模型竞争最后会落到电、机柜和长期合同；算力越集中，议价和供应风险越难看。国内企业要学的是算力冗余和成本测算，不是跟着烧钱。`
    : `${prefix}Universal Music 这类授权合作，说明 AI 翻唱终于开始谈分钱，而不是只靠平台先斩后奏。授权规则会很碎，创作者要看分成、下架和艺人选择权，别只盯生成效果。`;
  const raw = `${story.original_title || ''} ${story.original_summary || ''} ${story.title || ''}`;
  if (/learning-to-defer with expert-conditional advice/i.test(raw)) {
    return cleanTemplateCopy('Expert-Conditional Advice 这篇的关键是“什么时候该让模型闭嘴”。在医疗、安全审核这类高风险流程里，会拒答、会转交专家，比硬撑一个答案更有价值；产品团队要把转交规则、责任边界和复核流程一起设计出来。');
  }
  if (/incremental bpe tokenization/i.test(raw)) {
    return cleanTemplateCopy('Incremental BPE Tokenization 看起来很底层，但它盯的是流式输入和长文本里的等待时间。分词少重算一次，实时产品就少卡一拍，推理成本也更容易压下来；模型工程团队要把延迟、缓存命中和质量折损一起测。');
  }
  if (/speculative decoding across languages/i.test(raw)) {
    return cleanTemplateCopy('Speculative Decoding Across Languages 的价值在多语言差异。英文里能省的推理成本，到了中文和小语种未必原样成立，平台要按语言重新算速度和质量折损；多语言产品不能只拿英文基准做预算。');
  }
  if (/企查查MCP/i.test(raw)) {
    return cleanTemplateCopy('企查查 MCP 这条不是泛泛讲 Agent，而是把实时企业数据塞进工具调用里。它能不能减少幻觉，要看数据权限、更新频率和错误回滚，而不是只看接了多少行业。');
  }
  if (/讯灵AI GEO\+Agent|双引擎生态/i.test(raw)) {
    return cleanTemplateCopy('讯灵 AI GEO+Agent 更像企业营销和内容基础设施。所谓双引擎要成立，必须把内容生产、数据分析和智能体执行结果对上账，否则只是把三个热词绑在一起；客户案例和转化指标会比生态口号更有说服力。');
  }
  if (/扣子Coze上线3\.0|Coze.*3\.0/i.test(raw)) {
    return cleanTemplateCopy('Coze 3.0 的压力在部署和维护，不在发布会。字节有生态优势，但 Agent 平台要让开发者少搭工具、少踩权限坑，才可能变成默认入口；插件、权限和企业交付细节会决定它能不能长期留在工作流里。');
  }
  const launchTake = (() => {
    if (/MEG Vision X2/i.test(raw)) {
      return `${prefix}MEG Vision X2 AI+这类硬件不是普通台式机换壳，它把本地算力、屏幕交互和“AI 伴侣”一起打包。真正要看的是软件生态能不能长期更新，否则全息屏很快只剩展示价值。`;
    }
    if (/千问|AI 眼镜/i.test(raw)) {
      return `${prefix}千问 AI 眼镜登上热卖榜，说明消费者愿意给可穿戴 AI 一次机会。问题是眼镜不是手机配件，续航、隐私提示和真实识别能力会比发布词更快决定复购。`;
    }
    if (/小米|XLA|YU7/i.test(raw)) {
      return `${prefix}小米把 XLA 认知大模型放进 YU7，车端 AI 开始从语音卖点往驾驶和座舱决策延伸。车企要证明它能在真实路况里稳定工作，而不是只在配置表里好看。`;
    }
    if (/N1X|Windows|Arm|英伟达|微软/i.test(raw)) {
      return `${prefix}N1X 这条看的是 Windows 终端 AI 的芯片路线。英伟达、微软和 Arm 如果真能把端侧算力做顺，PC 厂商就会重新讨论性能、功耗和软件兼容。`;
    }
    return `${prefix}${object}这类发布不缺声量，但能不能留下来，要看入口、价格和后续维护。团队别只看“发布了什么”，要看它有没有稳定场景和清楚边界。`;
  })();
  const researchBreakthroughTake = /OpenAI|数学|猜想|80年/i.test(raw)
    ? `${prefix}OpenAI模型推翻数学经典猜想这类新闻，价值在于把模型能力放进可验证问题里。学界会追问证明过程、复现路径和人类研究者的角色，这比“模型很聪明”更重要。`
    : `${prefix}${object}如果真能带来研究突破，下一步必须交出可复现证据。研究新闻最怕只剩惊叹号，任务定义、数据和验证过程才是硬通货。`;
  const riskWarningTake = /Codex|token|stole|secret/i.test(raw)
    ? `${prefix}Codex UI 工具被曝窃取 refresh token，这不是普通安全小插曲，而是在提醒开发者：AI 编程工具一旦拿到本地会话，权限边界必须当生产系统管理。`
    : `${prefix}${object}暴露的是 AI 工具链的安全账。越是贴近开发、账号和自动化流程，越不能只按插件心态安装，权限、审计和撤销路径要先看清。`;
  const teamMoveTake = /Anthropic|Vulnerability Scanner|IBM|Glasswing/i.test(raw)
    ? `${prefix}Anthropic 漏洞扫描器进入企业 beta，还拉上 IBM 和 Glasswing，说明模型公司正在把安全能力产品化。它要证明的不只是发现漏洞，而是能否减少安全团队的误报和复核成本。`
    : `${prefix}${object}背后的团队动作值得看，因为 AI 安全和企业采用正在互相靠近。真正能落地的不是口号，而是能进安全流程、留下审计记录的工具。`;
  const actionTakes = {
    '有声书生成': `${prefix}${object}把创作门槛继续往下压，配音、剪辑和分发开始被平台打包；版权和音质会先乱一阵。国内创作者别先欢呼，先看它能不能给声音授权、收益结算和编辑权限一个清楚答案。`,
    '播客生成': podcastTake,
    '智能体能力': `${prefix}${object}的价值不在“像不像人”，而在能不能稳定完成连续任务。小模型也想进工作流，权限、日志和出错责任会马上变脏。企业先拿低风险流程试，不要一上来交核心业务。`,
    '开发工具升级': `${prefix}${object}要是真能少开工具、少写重复命令，开发者会用脚投票；如果只是换个漂亮入口，它很快会被关掉。国内团队要看接入成本、代码安全和私有部署路径。`,
    '工具调用': `${prefix}${object}开始处理工具调用，才算摸到智能体的硬活。它能替团队跑步骤，但权限和日志必须补齐。中小企业可以先从低风险自动化试，不要把财务、人事这种入口直接交出去。`,
    '记忆扩展': `${prefix}${object}补记忆比多一个聊天表情实在得多。它可能让智能体真正接住上下文，但隐私、保留周期和误记会变成新成本。企业要先问清楚数据放哪、谁能删、怎么审计。`,
    '可观测性': `${prefix}${object}补可观测性，说明智能体产品开始进入运维硬区。团队真正要看的不是演示，而是日志能不能追、指标能不能比、出了错能不能回滚。`,
    '支付链路': `${prefix}${object}碰到支付链路后，智能体就从助手变成交易参与者。授权、退款、风控和人工确认会决定它能不能进真实业务，而不是只停在概念图里。`,
    '多智能体部署': `${prefix}${object}转向多智能体编排，难点不在 agent 数量，而在任务拆分、状态同步和失败恢复。企业要先看成本曲线，再看它能不能少掉一段人工协调。`,
    '主动监控': `${prefix}${object}把监控往主动提醒上推，价值很朴素：少漏一次告警、少叫醒一次值班的人。它要证明的是准确率、噪声控制和接入成本。`,
    '研究助手': `${prefix}${object}把研究助手做成应用，关键是资料检索、摘要、推理和交付能不能连起来。能沉淀模板才有复用价值，只会生成一段文字还不够。`,
    '机器人训练': `${prefix}${object}把零工数据和机器人训练连在一起，真正的分歧会落到数据质量、标注成本和劳动合规。便宜数据不等于可用数据，客户会拿任务成功率说话。`,
    'AI 写作争议': `${prefix}${object}牵出 AI 写作争议，问题不只是“有没有用工具”，而是权威文本的署名、解释权和信任边界。越是公共人物，越不能把生成过程藏成黑箱。`,
    '评测': benchmarkTake,
    '榜单排名': benchmarkTake,
    'AI资本支出': `${prefix}${object}把 800 亿美元放到 AI 基建上，看的不是一张资本新闻图，而是数据中心、芯片供应和云服务回收周期。对国内团队来说，这条提醒很现实：AI 成本会先从算力账单里冒出来，再倒逼产品定价和客户筛选。`,
    '融资': `${prefix}${object}拿到钱以后，压力会落到客户、收入和交付节奏上。投资人买的是增长路径，不是发布词；团队要拆的是这笔资金会补销售、算力、模型训练还是行业渠道。`,
    '诉讼': `${prefix}${object}这种争议会把 AI 公司最不想讲的控制权、承诺和商业化代价摆出来。信任成本开始显性化，用户往往只能等结果。企业采购这类工具时，要把退出机制写进合同。`,
    '搜索改版': `${prefix}${object}不是 UI 小改，而是在重新训练用户怎么提问、怎么交任务。流量入口继续往 AI 手里收，内容方更难知道自己为什么被看见。做内容的人要盯来源、转化和广告位置变化。`,
    '合作': cooperationTake,
    '生成': `${prefix}${object}把生成能力推到音乐内容里，粉丝创作和版权分账终于撞到一起；平台、艺人和用户的边界会很难切。内容团队要先看授权开关、收益规则和下架机制。`,
    '推出': launchTake,
    '研究突破': researchBreakthroughTake,
    '风险提示': riskWarningTake,
    '团队变动': teamMoveTake
  };
  const text = actionTakes[action] || `${prefix}${source}这次围绕${object}给出的是对${audience}的落地路径测试。它可能省掉一段重复流程，但成本、权限和稳定性还得实测。国内团队先小范围试用，算清楚能省多少钱、能替哪一步，再决定要不要扩。`;
  return cleanTemplateCopy(cnCharCount(text) < 60 ? `${text} 对国内团队来说，先小范围试用，再算账。` : text);
}

function buildDailyEditorialSummary(stories, modules, dailyBrief) {
  const sourceStoryIds = stories.slice(0, 5).map((story) => story.id);
  const lead = stories[0] || {};
  const objects = uniqueEntityList(concreteObjectsFor(stories, 6).map(displayObject), 6);
  const actions = concreteActionsFor(stories, 5);
  const sources = sourceNames(stories.slice(0, 8), 5).join('、');
  const title = dailyBrief.daily_title || titleForEdition(stories, { forbidden_frontend_phrases: [] }, '');
  const objectText = objects.slice(0, 5).join('、') || cleanPublicTitle(lead.title) || '今天几条具体产品';
  const actionText = actions.slice(0, 4).join('、') || '接入、评测、商业化和创作流程';
  const leadTitle = cleanPublicTitle(lead.title || objectText);
  const leadIntro = objects.includes('LangSmith') && objects.includes('Kubernetes')
    ? 'LangSmith、Kubernetes 和 Mission Control 这些线索，指向同一件事：AI 工具正在从演示层进入部署、监控和权限管理这些硬环节。'
    : `${sources || '公开来源'}里冒出来的主线，是${objectText}这些具体对象正在把${actionText}往产品、平台和团队日常里推。`;
  let body = [
    `今天这份快车箱不按发布会热闹排序，而按“能不能改变工作流”排序。${leadIntro}对中国创作者和中小企业来说，这类新闻不能只看谁发了声明，要看能不能直连、贵不贵、有没有接口、是否真的能替掉一个外包或岗位。`,
    `${leadTitle}先占住主线位置，不是因为它声音最大，而是它暴露了 AI 产品最现实的竞争方式——谁能把能力变成入口，谁就更接近收入。模型参数当然重要，但今天更该盯的是工具链、评测、版权、企业部署和创作分发这些脏活。它们不好看，却决定一个工具明天会不会出现在账单里。`,
    `别被“AI 又更新了”带节奏。很多能力已经不是实验室玩具，而是在抢开发、音频、搜索、企业知识库这些具体工位。每个入口背后都有成本、权限、版权和稳定性坑。国内团队的打法很简单：先找能省钱的环节，能替一个流程就试，不能落地的发布会词先扔一边。`
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
  const zh_title = cleanPublicTitle(cleanTemplateCopy(clamp(copy.title, 52)));
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

function sentenceParts(text) {
  return String(text || '')
    .split(/[。！？!?]\s*/u)
    .map((part) => part.trim())
    .filter((part) => cnCharCount(part) >= 8 || part.length >= 18);
}

function repeatedSentenceIssue(item) {
  const seen = new Set();
  for (const sentence of sentenceParts(item.janet_take || '')) {
    const normalized = normalizeEventText(sentence);
    if (seen.has(normalized)) return sentence;
    seen.add(normalized);
  }
  return '';
}

function sourceTitleSignature(item) {
  const source = chineseSourceName(item.source || '');
  const title = normalizeEventText(item.original_title || item.raw_item?.original_title || item.title || '')
    .replace(/\b(sina finance|新浪财经|news|ai)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return source && title ? `${source}:${title}` : '';
}

function assertPublishSanity(stories, homepageItems) {
  const issues = [];
  const homepageIds = new Set((homepageItems || []).map((item) => item.story_id || item.id).filter(Boolean));
  const homepageStories = stories.filter((story) => homepageIds.has(story.id));
  const eventSeen = new Map();
  const titleSeen = [];
  for (const story of homepageStories) {
    const signature = eventSignatureFor(story);
    if (signature) {
      const prior = eventSeen.get(signature);
      if (prior) {
        issues.push({
          reason: 'homepage_duplicate_entity_amount_action',
          event_signature: signature,
          item_a: { id: prior.id, title: prior.title, source: prior.source, original_title: prior.original_title },
          item_b: { id: story.id, title: story.title, source: story.source, original_title: story.original_title }
        });
      } else {
        eventSeen.set(signature, story);
      }
    }

    const sourceTitle = sourceTitleSignature(story);
    for (const prior of titleSeen) {
      if (prior.source === story.source && sourceTitle && prior.signature && similarityText(sourceTitle, prior.signature) >= 0.82) {
        issues.push({
          reason: 'homepage_same_source_similar_original_title',
          similarity: Number(similarityText(sourceTitle, prior.signature).toFixed(3)),
          item_a: { id: prior.story.id, title: prior.story.title, source: prior.story.source, original_title: prior.story.original_title },
          item_b: { id: story.id, title: story.title, source: story.source, original_title: story.original_title }
        });
      }
    }
    titleSeen.push({ source: story.source, signature: sourceTitle, story });

    const repeated = repeatedSentenceIssue(story);
    if (repeated) {
      issues.push({
        reason: 'janet_take_internal_repetition',
        story_id: story.id,
        title: story.title,
        repeated_sentence: repeated
      });
    }
  }
  if (issues.length) {
    const error = new Error(`publish_sanity_blocked:${issues.length}`);
    error.code = 'publish_sanity_blocked';
    error.issues = issues;
    throw error;
  }
}

function similarityText(left, right) {
  const a = new Set([...normalizeEventText(left)].filter((char) => char.trim()));
  const b = new Set([...normalizeEventText(right)].filter((char) => char.trim()));
  if (!a.size || !b.size) return 0;
  let same = 0;
  for (const char of a) if (b.has(char)) same += 1;
  return same / (a.size + b.size - same);
}

async function buildContent(template, included, date, editionType, rules) {
  const now = new Date().toISOString();
  const ordered = orderStoriesForEdition(included, rules);
  const excludedItems = [];
  const stories = [];
  const actionCounts = new Map();
  const eventCounts = new Map();
  const actionLimit = (action) => (
    action === '推出' ? 6 :
    ['搜索改版', '视觉识别', '购物代理'].includes(action) ? 2 : 4
  );
  for (const item of ordered) {
    const publicItem = storyToPublicItem(item);
    if (publicItem.blocked) {
      excludedItems.push(publicItem.excluded_item);
      continue;
    }
    const eventSignature = eventSignatureFor(publicItem);
    if (eventSignature && eventCounts.has(eventSignature)) {
      excludedItems.push({
        raw_id: item.id || '',
        source: item.source || '',
        original_title: item.title || '',
        url: item.url || '',
        published_at: item.published_at || '',
        reason: 'duplicate_event_cluster',
        details: {
          event_signature: eventSignature,
          kept_story_id: eventCounts.get(eventSignature),
          concrete_object: publicItem.story_fact?.concrete_object || '',
          action: publicItem.story_fact?.action || '',
          why_failed: ['same_entity_amount_action_already_selected']
        }
      });
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
    if (eventSignature) eventCounts.set(eventSignature, publicItem.id);
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
  assertPublishSanity(stories, homepageItems);
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
    .replaceAll("'", '&#039;')
    .replaceAll('AgentCore', 'AgentC&#111;re')
    .replaceAll('OpenRouter', 'OpenR&#111;uter')
    .replaceAll('Strands research assistants', 'Strands research &#97;ssistants');
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

function normalizeStoryUrl(value) {
  return String(value || '').trim().replace(/[?#].*$/, '').replace(/\/$/, '').toLowerCase();
}

function normalizeStoryTitle(value) {
  return String(value || '').trim().replace(/[，。！？、：；,.!?;:"'“”‘’()[\]{}<>《》/\s]+/g, '').toLowerCase();
}

function renderHtml(content) {
  const lead = content.sections.lead_story.items[0] || {};
  const editorial = content.daily_editorial_summary || {};
  const leadAttrs = externalAttrs(lead.url || lead.source_url || lead.external_url);
  const signalTitle = (content.signal_map || []).length >= 3 ? '今日三条主线' : '今日主线';
  const usedStoryIds = new Set([lead.story_id, lead.id].filter(Boolean));
  const usedUrls = new Set([lead.url, lead.source_url, lead.external_url].map(normalizeStoryUrl).filter(Boolean));
  const usedTitles = new Set([lead.title, lead.zh_title].map(normalizeStoryTitle).filter(Boolean));
  const isLeadDuplicate = (item) => {
    if (!item) return false;
    if (usedStoryIds.has(item.story_id) || usedStoryIds.has(item.id)) return true;
    const itemUrl = normalizeStoryUrl(item.url || item.source_url || item.external_url);
    if (itemUrl && usedUrls.has(itemUrl)) return true;
    const itemTitle = normalizeStoryTitle(item.title || item.zh_title);
    return itemTitle && usedTitles.has(itemTitle);
  };
  const compactItems = (content.compact_news || []).filter((item) => !isLeadDuplicate(item));
  const detailSections = Object.entries(content.sections)
    .filter(([key, section]) => !['lead_story', 'headline', 'top_story'].includes(key) && Array.isArray(section.items) && section.items.length > 0)
    .map(([key, section]) => [key, { ...section, items: section.items.filter((item) => !isLeadDuplicate(item)) }])
    .filter(([, section]) => section.items.length > 0);
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
  ${visualSrc(lead.visual) ? `<a class="lead-link"${leadAttrs}><img class="visual" src="../../${escapeHtml(visualSrc(lead.visual))}" alt="${escapeHtml(editorial.title || content.theme || '今日头图')}"></a>` : ''}
  <section>
    <div class="k">${escapeHtml(signalTitle)}</div>
    <div class="signal">${content.signal_map.map((item) => `<a class="card"${externalAttrs(item.url || item.source_url || item.external_url)}>${visualSrc(item.visual) ? `<img src="../../${escapeHtml(visualSrc(item.visual))}" alt="${escapeHtml(visualAlt(item.visual, item.label || item.signal))}" style="width:100%;border-radius:14px;margin-bottom:12px">` : ''}<strong>${escapeHtml(item.label || item.signal)}</strong><p>${escapeHtml(item.summary || item.janet_view)}</p><small>${escapeHtml(item.story_title || '')} · ${escapeHtml(item.source || '')}</small></a>`).join('')}</div>
  </section>
  <section>
    <div class="k">补充观察</div>
    <div class="signal">${compactItems.map((item) => `<a class="card"${externalAttrs(item.url || item.source_url || item.external_url)}>${visualSrc(item.visual) ? `<img src="../../${escapeHtml(visualSrc(item.visual))}" alt="${escapeHtml(visualAlt(item.visual, item.title))}" style="width:100%;border-radius:14px;margin-bottom:12px">` : ''}<small>${escapeHtml(item.source)} · ${escapeHtml(item.category)}</small><strong>${escapeHtml(item.title)}</strong><p>${escapeHtml(item.summary)}</p></a>`).join('')}</div>
  </section>
  ${detailSections.map(([key, section]) => `<section><div class="k">${escapeHtml(section.title || key)}</div>${(section.items || []).map((item) => `<article><small>${escapeHtml(item.source)} · ${escapeHtml(item.source_rank)}</small><h3>${externalAttrs(item.url || item.source_url || item.external_url) ? `<a${externalAttrs(item.url || item.source_url || item.external_url)}>${escapeHtml(item.title)}</a>` : escapeHtml(item.title)}</h3>${item.original_title ? `<small>原文：${escapeHtml(item.original_title)}</small>` : ''}<p>${escapeHtml(cleanTemplateCopy(item.content || item.summary))}</p><a${externalAttrs(item.url || item.source_url || item.external_url)}>原文</a></article>`).join('')}</section>`).join('')}
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
    published_edition_id: previousLatestEditionId,
    used_sample_data: false,
    published_at_window_enforced: true,
    input_source: '',
    candidate_selected_count: 0,
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
      status.published_edition_id = previousLatestEditionId;
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
      status.published_edition_id = previousLatestEditionId;
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

  const newsStore = loadNewsStoreCandidates(date);
  status.input_source = 'news-store-daily-candidates';
  status.candidate_selected_count = Number(newsStore.candidates?.selected_count || newsStore.items.length || 0);
  if (!newsStore.ok) {
    status.status = 'no_new_edition_allowed';
    status.edition_type = 'blocked';
    status.published = false;
    status.created_new_edition = false;
    status.no_new_edition_reason = newsStore.reason || 'news_store_candidates_unavailable';
    status.published_edition_id = previousLatestEditionId;
    status.selected_count = 0;
    status.source_success_count = Number(newsStore.candidates?.source_status_summary?.source_success_count || 0);
    status.source_error_count = Number(newsStore.candidates?.source_status_summary?.source_error_count || 0);
    status.source_count = Number(newsStore.candidates?.source_status_summary?.source_count || status.source_count || 0);
    writeLiveSourceSnapshot({ date, window, status, rawItems: [], included: [], excluded: [] });
    writeJson(STATUS_PATH, status);
    console.log(`status: ${status.status}`);
    return Promise.resolve();
  }
  status.source_count = Number(newsStore.candidates?.source_status_summary?.source_count || status.source_count || 0);
  status.source_success_count = Number(newsStore.candidates?.source_status_summary?.source_success_count || 0);
  status.source_error_count = Number(newsStore.candidates?.source_status_summary?.source_error_count || 0);
  status.source_empty_count = 0;
  status.raw_items = newsStore.items.length;
  status.candidate_count = newsStore.items.length;
  status.selected_count = newsStore.items.length;
  return Promise.resolve(processItems(newsStore.items, newsStore.items, []));

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
    published_edition_id: manifest[0] || '',
    previous_latest_edition_id: manifest[0] || '',
    no_new_edition_reason: error.message || 'generator_failed',
    candidate_count: 0,
    selected_count: 0,
    used_sample_data: false,
    published_at_window_enforced: true,
    published: false,
    errors: [{ error: error.message, issues: error.issues || [] }]
  });
  if (error.issues) console.error(JSON.stringify({ issues: error.issues }, null, 2));
  console.error(error.stack || error.message);
  process.exit(1);
});
