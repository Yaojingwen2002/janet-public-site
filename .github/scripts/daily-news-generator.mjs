#!/usr/bin/env node
// Janet public-site daily news generator.
// Pure Node 20: fs/path/crypto/fetch only, no dependencies, no secrets.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { createHash } from 'node:crypto';

const ROOT = resolve(process.cwd());
const TZ = 'Asia/Shanghai';
const SOURCE_POOL = resolve(ROOT, '.github/scripts/rss-source-pool.json');
const EDITORIAL_RULES = resolve(ROOT, '.github/scripts/editorial-rules.json');
const STATUS_PATH = resolve(ROOT, 'data/daily-news-run-status.json');
const FORBIDDEN_TAKES = [
  'AI 正在改变世界',
  '未来已来',
  '智能体时代来了',
  '行业正在重构',
  '值得关注',
  '持续关注'
];

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

async function fetchSource(source) {
  if (!source.enabled) return { items: [], error: null };
  const urls = [source.url, source.fallback_url].filter(Boolean);
  const errors = [];
  for (const url of urls) {
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
      errors.push(`${url}:no_feed_items`);
    } catch (error) {
      errors.push(`${url}:${error.message}`);
    }
  }
  return { items: [], error: errors.join('; ') };
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
  if (['OpenAI', 'Google AI', 'Microsoft AI', 'GitHub Blog', 'Hugging Face', 'arXiv cs.AI', 'arXiv cs.CL', 'arXiv cs.LG', 'arXiv stat.ML'].includes(source)) {
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

function titleForEdition(stories, rules) {
  const lead = stories[0] || {};
  const sources = sourceNames(stories, 3);
  const hasOpenSource = stories.some((story) => story.category === 'open_source' || /hugging face|github/i.test(story.source || story.title || ''));
  const hasResearch = stories.some((story) => story.category === 'research' || /arxiv|paper|benchmark/i.test(story.source || story.title || ''));
  const hasTools = stories.some((story) => /api|sdk|agent|copilot|workflow|developer|tool/i.test(`${story.title} ${story.summary}`));
  const candidates = [
    hasTools ? '工具链又拧紧了' : '',
    hasOpenSource ? '开源模型继续补位' : '',
    hasResearch ? '论文先把路探了' : '',
    sources.includes('OpenAI') || sources.includes('Google AI') ? '巨头继续卡入口' : '',
    lead.source === 'GitHub Blog' ? '开发入口又收紧' : '',
    '今天AI有点实在'
  ].filter(Boolean);
  const forbidden = rules.forbidden_frontend_phrases || [];
  const selected = candidates.find((item) => item.length <= 24 && !forbidden.some((phrase) => item.includes(phrase))) || '今天AI有点实在';
  return selected;
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
  return '这条先按源站事实看，别急着拔高成时代宣言。';
}

function watchNext(story) {
  const text = `${story.title} ${story.summary} ${story.source}`.toLowerCase();
  if (/api|sdk|developer|workflow|copilot|agent/.test(text)) return '看开发者是否真的迁移工作流';
  if (/hugging face|open source|weights|dataset/.test(text)) return '看社区复现和二次封装速度';
  if (/arxiv|paper|benchmark/.test(text)) return '看是否出现代码和独立复现';
  if (/pricing|enterprise|customer|partnership/.test(text)) return '看客户和价格是否跟上';
  return '看源站是否给出后续细节';
}

function emptySections(template) {
  const sections = {};
  for (const [key, value] of Object.entries(template.sections || {})) {
    sections[key] = { title: value.title || key, items: [] };
  }
  return sections;
}

function buildContent(template, included, date, editionType, rules) {
  const now = new Date().toISOString();
  const ordered = orderStoriesForEdition(included, rules);
  const displayItems = ordered.filter((item) => item.core_eligible).slice(0, editionType === 'limited_edition' ? 9 : 18);
  const stories = displayItems.map((item) => ({
    id: item.id,
    title: clamp(item.title, 96),
    url: item.url,
    source: item.source,
    source_type: sourceType(item.source),
    source_rank: item.source_rank,
    category: schemaCategory(item.category),
    score: scoreFor(item.source_rank),
    published_at: item.published_at,
    published_at_source: item.published_at_source,
    summary: clamp(item.summary || item.title, 140),
    why_it_matters: whyItMatters(item),
    janet_take: janetTake(item),
    watch_next: watchNext(item),
    image: null,
    image_source: null,
    image_credit: null,
    verified_at: now,
    duplicate_group: null,
    evidence_ids: item.evidence_ids,
    editorial_score: item.editorial_score,
    editorial_signals: item.editorial_signals,
    editorial_penalties: item.editorial_penalties,
    lead_eligible: item.lead_eligible,
    core_eligible: item.core_eligible
  }));
  for (const phrase of FORBIDDEN_TAKES) {
    if (JSON.stringify(stories).includes(phrase)) throw new Error(`forbidden_janet_take:${phrase}`);
  }

  const sections = emptySections(template);
  sections.lead_story.items.push(stories[0]);
  for (const story of stories.slice(1)) {
    const section = sectionFor(story.category);
    if (!sections[section]) sections[section] = { title: section, items: [] };
    sections[section].items.push(story);
  }

  const evidence = stories.slice(0, Math.max(6, Math.min(stories.length, 9))).map((story) => story.id);
  const theme = titleForEdition(stories, rules);
  return {
    ...template,
    date,
    vol: template.vol || '0000',
    theme,
    intro_text: `本期从公开 RSS / Atom / official feeds 中筛出 ${included.length} 条窗口内新闻，按新闻价值重新排序。`,
    daily_thesis: thesisForEdition(stories),
    signal_map: signalMapForEdition(stories),
    lead_story_id: stories[0].id,
    sections,
    source_summary: `公开来源自动生成；included=${included.length}; edition=${editionType}; lead_score=${stories[0]?.editorial_score || 0}`,
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
    what_to_watch_next: [
      stories[0]?.watch_next || '看头条源站后续动作',
      stories[1]?.watch_next || '看同主题是否继续发酵',
      stories[2]?.watch_next || '看开发者和社区是否跟进'
    ]
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
  <section>
    <div class="k">Signal Map</div>
    <div class="signal">${content.signal_map.map((item) => `<div class="card"><strong>${escapeHtml(item.signal)}</strong><p>${escapeHtml(item.janet_view)}</p></div>`).join('')}</div>
  </section>
  <section>
    <div class="k">Lead Story</div>
    <h2>${escapeHtml(content.sections.lead_story.items[0]?.title || '')}</h2>
    <p>${escapeHtml(content.sections.lead_story.items[0]?.summary || '')}</p>
  </section>
  ${Object.entries(content.sections).filter(([key]) => key !== 'lead_story').map(([key, section]) => `<section><div class="k">${escapeHtml(section.title || key)}</div>${(section.items || []).map((item) => `<article><small>${escapeHtml(item.source)} · ${escapeHtml(item.source_rank)}</small><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.summary)}</p><p>${escapeHtml(item.janet_take)}</p><a href="${escapeHtml(item.url)}">原文</a></article>`).join('')}</section>`).join('')}
  <section>
    <div class="k">Source Summary</div>
    <p>${escapeHtml(content.source_summary)}</p>
    <div class="k">Watch Next</div>
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
    item_count: Object.values(content.sections).flatMap((section) => section.items || []).length,
    lead_story: lead,
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
    raw_items: 0,
    included: 0,
    excluded: 0,
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
    if (result.error) {
      status.source_error_count += 1;
      status.errors.push({ source_id: source.id, error: result.error });
    } else {
      status.source_success_count += 1;
      rawItems.push(...result.items);
    }
  });

  return Promise.all(promises).then(() => {
    status.raw_items = rawItems.length;
    const { included, excluded } = filterWindow(rawItems, window);
    status.included = included.length;
    status.excluded = excluded.length;

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
