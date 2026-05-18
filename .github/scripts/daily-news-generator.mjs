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
const VISUAL_DIR = resolve(ROOT, 'assets/news-visuals');
const FORBIDDEN_TAKES = [
  'AI 正在改变世界',
  '未来已来',
  '智能体时代来了',
  '行业正在重构',
  '值得关注',
  '持续关注'
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
  const text = `${item.title || ''} ${item.summary || ''}`.toLowerCase();
  if (/codex/.test(text)) return 'Codex';
  if (/copilot/.test(text)) return 'Copilot';
  if (/agent|agentic/.test(text)) return '智能体';
  if (/api|sdk/.test(text)) return 'API';
  if (/open source|weights|hugging face/.test(text)) return '开源模型';
  if (/benchmark|paper|arxiv|research/.test(text)) return '研究信号';
  if (/enterprise|customer|pricing|partnership/.test(text)) return '企业落地';
  if (/availability report|status report|incident|outage|maintenance/.test(text)) return '可用性报告';
  if (/model|reasoning|multimodal|llm/.test(text)) return '模型能力';
  if (/github/.test(text)) return '开发入口';
  return item.category === 'research' ? '研究进展' : item.category === 'business' ? '商业动作' : 'AI 工具';
}

function chineseVerb(item) {
  const text = `${item.title || ''} ${item.summary || ''}`.toLowerCase();
  if (/launch|introduc|announce|release/.test(text)) return '发布新动作';
  if (/deploy|adopt|use|using/.test(text)) return '开始落到团队里';
  if (/future|view|vision/.test(text)) return '押注下一步';
  if (/report|availability|status/.test(text)) return '交出运行报告';
  if (/benchmark|paper|research/.test(text)) return '给出研究信号';
  if (/fund|partner|customer|enterprise/.test(text)) return '把商业线往前推';
  return '放出一个新信号';
}

function makeChineseTitle(item) {
  if (hasChinese(item.title) && englishWordCount(item.title) < 5) return clamp(item.title, 34);
  const source = chineseSourceName(item.source);
  const topic = normalizeTopic(item);
  const verb = chineseVerb(item);
  const text = `${item.title || ''} ${item.summary || ''}`.toLowerCase();

  if (/availability report|status report|incident|outage|maintenance/.test(text)) {
    return `${source} 可用性报告，放进归档就好`;
  }
  if (/codex/.test(text) && /agent|agentic|software development|developer/.test(text)) {
    return `${source} 押注 Codex，开发开始代理化`;
  }
  if (/copilot/.test(text)) return `${source} 继续把 Copilot 往工作流里塞`;
  if (/hugging face|open source|weights|dataset/.test(text)) return `${source} 放出开源信号，社区有活干了`;
  if (/arxiv|paper|benchmark/.test(text)) return `${source} 新论文冒头，先看能否复现`;
  if (/api|sdk|developer|workflow|agent/.test(text)) return `${source} 把${topic}继续推向开发者`;
  return `${source} 围绕${topic}${verb}`;
}

function makeChineseSummary(item) {
  const source = chineseSourceName(item.source);
  const topic = normalizeTopic(item);
  const text = `${item.title || ''} ${item.summary || ''}`.toLowerCase();
  if (/availability report|status report|incident|outage|maintenance/.test(text)) {
    return `${source} 这条更像服务运行记录，不适合作为头条，但可以帮助判断工具稳定性和平台状态。`;
  }
  if (/codex/.test(text)) {
    return `${source} 这条围绕 Codex 和软件开发展开，重点是智能体不再只做演示，而是被推向真实工程团队。`;
  }
  if (/api|sdk|developer|workflow|copilot|agent/.test(text)) {
    return `${source} 正在把 AI 能力塞进开发者工作流，影响的是入口、工具选择和团队每天怎么交付。`;
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
  return `${source} 给出了一条关于${topic}的新信号，适合和今天其他新闻一起看，不必单独拔高。`;
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
    { label: '开源补位', test: (story) => /hugging face|open source|github|arxiv|paper|benchmark|dataset|weights/i.test(`${story.title} ${story.summary} ${story.source}`) }
  ];
  return groups.map((group) => {
    const picks = stories.filter(group.test).slice(0, 2);
    const first = picks[0] || stories[0] || {};
    return {
      signal: group.label,
      evidence: picks.length ? picks.map((story) => story.id) : [first.id].filter(Boolean),
      janet_view: clamp(`${sourceNames(picks.length ? picks : [first], 2).join('、') || first.source || '公开源'}给了信号：${group.label}不是口号，是今天具体新闻里能点开的变化。`, 45)
    };
  });
}

function whyItMatters(story) {
  const text = `${story.title} ${story.summary} ${story.source}`.toLowerCase();
  const audience = /api|sdk|github|copilot|developer|workflow|agent/.test(text)
    ? '开发者'
    : /arxiv|paper|benchmark|training|inference|alignment|evaluation/.test(text)
      ? '研究者'
      : /hugging face|open source|dataset|weights|repository/.test(text)
        ? '开源社区'
        : /enterprise|pricing|customer|funding|partnership|business/.test(text)
          ? '企业'
          : '创作者和产品团队';
  return clamp(`${audience}要看这条：它影响的是入口、成本或可用工具，而不是一句泛泛的 AI 热闹。`, 90);
}

function janetTake(story) {
  const text = `${story.title} ${story.summary} ${story.source}`.toLowerCase();
  const source = chineseSourceName(story.source);
  const topic = normalizeTopic(story);
  if (/availability report|status report|incident|outage|maintenance/.test(text)) {
    return '这类更像值班记录，能进归档，但别让它抢头条。';
  }
  if (/api|sdk|developer|workflow|copilot|github|agent/.test(text)) {
    return '重点不是多一个按钮，是开发者每天工作的入口又被模型咬住一块。';
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
  const text = `${story.title} ${story.summary} ${story.source}`.toLowerCase();
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
    watchNext(story),
    `看${source}在${topic}上的产品入口。`,
    `看${source}这条${topic}是否有真实用户。`,
    `看${topic}是否被${source}继续推向默认流程。`
  ];
  let selected = candidates.find((item) => item && !used.has(item));
  if (!selected) selected = `看${source}第${used.size + 1}条${topic}的落地位置。`;
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
  return {
    id: item.id,
    title: clamp(makeChineseTitle(item), 52),
    original_title: clamp(item.title, 140),
    url: item.url,
    source: item.source,
    source_type: sourceType(item.source),
    source_rank: item.source_rank,
    category: schemaCategory(item.category),
    score: scoreFor(item.source_rank),
    published_at: item.published_at,
    published_at_source: item.published_at_source,
    summary: clamp(makeChineseSummary(item), 120),
    original_summary: clamp(item.summary || item.title, 220),
    why_it_matters: whyItMatters(item),
    janet_take: janetTake(item),
    watch_next: watchNext(item),
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
  const stories = ordered.map(storyToPublicItem);
  const usedWatchNext = new Set();
  stories.forEach((story) => {
    story.verified_at = now;
    story.primary_section = assignPrimarySection(story);
    story.watch_next = uniqueWatchNext(story, usedWatchNext);
  });
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
  const signalMap = signalMapForEdition(stories).map((signal, index) => {
    const story = stories.find((item) => signal.evidence.includes(item.id)) || stories[index + 1] || stories[0];
    return {
      ...signal,
      label: signal.signal,
      summary: signal.janet_view,
      story_id: story?.id || '',
      story_title: story?.title || '',
      source: story?.source || '',
      visual: writeNewsVisual(`${date}-signal-${index + 1}.svg`, signal.signal, story?.source || 'Janet', story?.category || 'models')
    };
  });
  homepageItems.push({
    role: 'lead',
    story_id: stories[0]?.id || '',
    title: stories[0]?.title || '',
    source: stories[0]?.source || '',
    category: stories[0]?.category || '',
    summary: stories[0]?.summary || '',
    why_it_matters: stories[0]?.why_it_matters || '',
    janet_take: stories[0]?.janet_take || '',
    watch_next: stories[0]?.watch_next || '',
    visual: stories[0]?.visual || ''
  });
  signalMap.forEach((signal) => {
    const story = stories.find((item) => item.id === signal.story_id) || {};
    homepageItems.push({
      role: 'signal',
      story_id: signal.story_id,
      title: signal.story_title,
      source: signal.source,
      category: story.category || '',
      summary: story.summary || signal.summary || '',
      why_it_matters: story.why_it_matters || '',
      janet_take: story.janet_take || '',
      watch_next: story.watch_next || '',
      visual: signal.visual
    });
  });
  const signalIds = new Set(signalMap.map((signal) => signal.story_id).filter(Boolean));
  const compactNews = stories
    .filter((story) => story.id !== stories[0]?.id && !signalIds.has(story.id) && story.core_eligible)
    .slice(0, 6);
  compactNews.forEach((story) => homepageItems.push({
    role: 'compact',
    story_id: story.id,
    title: story.title,
    source: story.source,
    category: story.category,
    summary: story.summary,
    why_it_matters: story.why_it_matters,
    janet_take: story.janet_take,
    watch_next: story.watch_next
  }));
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
    intro_text: publicIntroForEdition(stories),
    daily_thesis: thesisForEdition(stories),
    signal_map: signalMap,
    lead_story_id: stories[0].id,
    sections,
    collected_items_count: included.length,
    edition_items: stories,
    homepage_items: homepageItems,
    hidden_items: hiddenItems,
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
    edition_type: editionType,
    item_count: (content.edition_items || Object.values(content.sections).flatMap((section) => section.items || [])).length,
    edition_items_count: (content.edition_items || []).length,
    homepage_items_count: (content.homepage_items || []).length,
    lead_story: lead,
    daily_thesis: content.daily_thesis,
    intro_text: content.intro_text,
    signal_map: content.signal_map,
    compact_news: content.compact_news || [],
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
    status.raw_items = rawItems.length;
    const { included, excluded } = filterWindow(rawItems, window);
    status.included = included.length;
    status.excluded = excluded.length;
    status.exclusion_reasons = excluded.reduce((acc, item) => {
      acc[item.excluded_reason] = (acc[item.excluded_reason] || 0) + 1;
      return acc;
    }, {});

    if (included.length < Number(pool.min_publish_count || 5)) {
      status.status = 'blocked_insufficient_fresh_news';
      status.edition_type = 'blocked';
      status.published = false;
      writeJson(STATUS_PATH, status);
      console.log(`status: ${status.status}`);
      return;
    }

    const editionType = included.length >= Number(pool.full_edition_count || 10) ? 'full_edition' : 'limited_edition';
    const statusName = editionType === 'full_edition' ? 'published_full_edition' : 'published_limited_edition';
    status.status = dryRun ? `dry_run_${statusName}` : statusName;
    status.edition_type = editionType;

    if (dryRun) {
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
    const content = buildContent(templateContent, included, date, editionType, editorialRules);
    writeJson(resolve(outDir, 'content.json'), content);
    writeText(resolve(outDir, 'output.html'), renderHtml(content));
    writeJson(resolve(outDir, 'news-summary.json'), buildSummary(templateSummary, content, editionId, editionType));
    updateManifest(editionId);

    status.published = true;
    status.published_edition_id = editionId;
    writeJson(STATUS_PATH, status);
    console.log(`status: ${status.status}`);
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
