import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const ROOT = process.cwd();
const SOURCE_POOL_PATH = path.join(ROOT, '.github/scripts/rss-source-pool.json');
const MANIFEST_PATH = path.join(ROOT, 'data/MANIFEST.json');
const RUN_STATUS_PATH = path.join(ROOT, 'data/daily-news-run-status.json');
const TIMEZONE = 'Asia/Shanghai';
const USER_AGENT = 'JanetDailyNewsBot/1.0 (+https://github.com/Yaojingwen2002/janet-public-site)';
const FETCH_TIMEOUT_MS = 20000;
const SECTION_TITLES = {
  lead_story: '今日封面新闻',
  models: '模型与产品',
  agents: 'Agent 与工具',
  open_source: '开源与论文',
  business: '商业与资本',
  china_perspective: '中国视角',
  creator_opportunity: '创作者机会'
};
const SECTION_LIMITS = {
  models: 4,
  agents: 4,
  open_source: 5,
  business: 4,
  creator_opportunity: 2
};
const RANK_SCORE = { S: 50, A: 35, B: 20, C: 10 };

function parseArgs(argv) {
  const args = { dryRun: false, date: null };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--dry-run') args.dryRun = true;
    if (argv[i] === '--date') {
      args.date = argv[i + 1] || null;
      i += 1;
    }
  }
  return args;
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function readJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJson(filePath, data) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

function hash(value, length = 12) {
  return crypto.createHash('sha1').update(String(value || '')).digest('hex').slice(0, length);
}

function getShanghaiDateString(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function assertDateString(dateString) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateString || '')) {
    throw new Error(`Invalid --date value: ${dateString || '(empty)'}`);
  }
}

function previousDay(dateString) {
  const [year, month, day] = dateString.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day - 1)).toISOString().slice(0, 10);
}

function buildWindow(dateString) {
  assertDateString(dateString);
  const prev = previousDay(dateString);
  const windowStartLocal = `${prev}T17:00:00+08:00`;
  const windowEndLocal = `${dateString}T09:00:00+08:00`;
  return {
    timezone: TIMEZONE,
    startLocal: windowStartLocal,
    endLocal: windowEndLocal,
    start: new Date(windowStartLocal),
    end: new Date(windowEndLocal)
  };
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function decodeEntities(value) {
  const named = {
    amp: '&',
    lt: '<',
    gt: '>',
    quot: '"',
    apos: "'",
    nbsp: ' '
  };
  return String(value || '').replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, entity) => {
    if (entity[0] === '#') {
      const hex = entity[1]?.toLowerCase() === 'x';
      const code = Number.parseInt(entity.slice(hex ? 2 : 1), hex ? 16 : 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    return named[entity] || match;
  });
}

function cleanText(value) {
  return decodeEntities(String(value || '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim());
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function extractTag(block, tag) {
  const pattern = new RegExp(`<${escapeRegExp(tag)}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${escapeRegExp(tag)}>`, 'i');
  const match = block.match(pattern);
  return match ? cleanText(match[1]) : '';
}

function extractRawTag(block, tag) {
  const pattern = new RegExp(`<${escapeRegExp(tag)}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${escapeRegExp(tag)}>`, 'i');
  const match = block.match(pattern);
  return match ? match[1].trim() : '';
}

function parseAttributes(tagText) {
  const attrs = {};
  const attrPattern = /([:\w-]+)\s*=\s*(['"])(.*?)\2/g;
  let match;
  while ((match = attrPattern.exec(tagText))) attrs[match[1].toLowerCase()] = decodeEntities(match[3]);
  return attrs;
}

function extractAtomLink(block) {
  const tags = block.match(/<link\b[^>]*>/gi) || [];
  const parsed = tags.map((tag) => parseAttributes(tag));
  const preferred = parsed.find((attrs) => attrs.href && (!attrs.rel || attrs.rel === 'alternate')) || parsed.find((attrs) => attrs.href);
  return preferred ? preferred.href : '';
}

function extractDateField(block) {
  const fields = ['pubDate', 'published', 'updated', 'dc:date', 'date'];
  for (const field of fields) {
    const value = extractTag(block, field);
    if (value) return { value, source: field };
  }
  return { value: '', source: '' };
}

function blocksFromXml(xml) {
  const itemBlocks = xml.match(/<item\b[\s\S]*?<\/item>/gi) || [];
  const entryBlocks = xml.match(/<entry\b[\s\S]*?<\/entry>/gi) || [];
  return [
    ...itemBlocks.map((block) => ({ type: 'rss', block })),
    ...entryBlocks.map((block) => ({ type: 'atom', block }))
  ];
}

function cleanUrl(value) {
  if (!value) return '';
  try {
    const url = new URL(decodeEntities(value.trim()));
    for (const key of Array.from(url.searchParams.keys())) {
      const lower = key.toLowerCase();
      if (lower.startsWith('utm_') || ['fbclid', 'gclid', 'ref'].includes(lower)) url.searchParams.delete(key);
    }
    url.hash = '';
    return url.toString();
  } catch {
    return decodeEntities(value.trim());
  }
}

function normalizedUrl(value) {
  try {
    const url = new URL(value);
    url.hostname = url.hostname.toLowerCase();
    url.pathname = url.pathname.replace(/\/+$/, '');
    return url.toString();
  } catch {
    return String(value || '').trim().toLowerCase();
  }
}

async function fetchSource(source) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(source.url, {
      redirect: 'follow',
      headers: {
        'user-agent': USER_AGENT,
        accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*'
      },
      signal: controller.signal
    });
    const text = await response.text();
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return { ok: true, text };
  } catch (error) {
    const cause = error.cause && (error.cause.code || error.cause.message)
      ? ` (${[error.cause.code, error.cause.message].filter(Boolean).join(': ')})`
      : '';
    return { ok: false, error: `${error.message || String(error)}${cause}` };
  } finally {
    clearTimeout(timer);
  }
}

function parseFeedItems(source, xml, collectedAt) {
  return blocksFromXml(xml).map(({ type, block }) => {
    const dateField = extractDateField(block);
    const url = type === 'atom'
      ? extractAtomLink(block)
      : (extractTag(block, 'link') || extractTag(block, 'guid'));
    const title = extractTag(block, 'title');
    const summary = extractTag(block, 'description') || extractTag(block, 'summary') || extractTag(block, 'content:encoded');
    const rawId = extractTag(block, 'guid') || extractTag(block, 'id') || cleanUrl(url) || title;
    return {
      id: `${source.id}-${hash(rawId || `${title}-${url}`)}`,
      title,
      url: cleanUrl(url),
      source: source.source,
      category: source.category,
      source_rank: source.rank,
      published_at: '',
      published_at_source: dateField.source,
      summary,
      collected_at: collectedAt,
      raw_source_id: source.id,
      evidence_ids: [],
      raw_published_at: dateField.value
    };
  });
}

function classifyItem(item) {
  const text = `${item.title} ${item.summary} ${item.source}`.toLowerCase();
  if (item.category === 'models') return 'models';
  if (item.category === 'agents') return 'agents';
  if (item.category === 'open_source' || item.category === 'research') return 'open_source';
  if (text.includes('agent') || text.includes('codex') || text.includes('workflow')) return 'agents';
  if (text.includes('model') || text.includes('gpt') || text.includes('claude') || text.includes('gemini') || text.includes('mistral')) return 'models';
  if (text.includes('github') || text.includes('open source') || text.includes('arxiv') || text.includes('paper')) return 'open_source';
  if (text.includes('creator') || text.includes('video') || text.includes('image') || text.includes('youtube') || text.includes('instagram')) return 'creator_opportunity';
  return 'business';
}

function scoreItem(item) {
  const rankScore = RANK_SCORE[item.source_rank] || 0;
  const published = Date.parse(item.published_at) || 0;
  return rankScore * 10000000000000 + published;
}

function normalizeAndFilter(rawItems, window) {
  const included = [];
  const excluded = [];
  const seenUrls = new Set();
  const seenTitleSource = new Set();

  for (const item of rawItems) {
    let reason = '';
    if (!item.title) reason = 'missing_title';
    else if (!item.url) reason = 'missing_url';
    else if (!item.source) reason = 'missing_source';
    else if (!item.raw_published_at) reason = 'missing_published_at';

    let parsedDate = null;
    if (!reason) {
      parsedDate = new Date(item.raw_published_at);
      if (Number.isNaN(parsedDate.getTime())) reason = 'invalid_published_at';
    }

    if (!reason && (parsedDate < window.start || parsedDate >= window.end)) reason = 'outside_time_window';

    const urlKey = normalizedUrl(item.url);
    const titleKey = `${item.title.toLowerCase().replace(/\s+/g, ' ').trim()}|${item.source}`;
    if (!reason && (seenUrls.has(urlKey) || seenTitleSource.has(titleKey))) reason = 'duplicate';

    if (reason) {
      excluded.push({ ...item, status: 'excluded', excluded_reason: reason });
      continue;
    }

    seenUrls.add(urlKey);
    seenTitleSource.add(titleKey);
    included.push({
      ...item,
      title: item.title.trim(),
      summary: item.summary.trim().slice(0, 320),
      published_at: parsedDate.toISOString(),
      status: 'included'
    });
  }

  included.sort((a, b) => scoreItem(b) - scoreItem(a));
  included.forEach((item, index) => {
    item.evidence_ids = [`evidence-${String(index + 1).padStart(4, '0')}`];
  });
  return { included, excluded };
}

function createStoryItem(item, index) {
  const section = classifyItem(item);
  const title = item.title;
  const summary = item.summary || '源站提供的信息有限，本条仅按可验证标题和发布时间进入今日窗口。';
  return {
    id: item.id,
    title,
    url: item.url,
    source: item.source,
    source_type: 'public_feed',
    source_rank: item.source_rank,
    category: item.category,
    score: Math.max(60, 100 - index),
    summary,
    why_it_matters: '这条新闻来自公开源，并通过 published_at 时间窗口校验；可作为今日观察信号。',
    janet_take: `基于 ${item.evidence_ids.join(', ')}：先按证据看，不扩大成无依据判断，继续观察源站后续更新。`,
    watch_next: '看源站更新、同行跟进和是否出现可验证产品或政策变化。',
    image: '',
    image_source: '',
    image_credit: '',
    verified_at: item.collected_at,
    published_at: item.published_at,
    duplicate_group: normalizedUrl(item.url),
    evidence_ids: item.evidence_ids,
    section
  };
}

function buildSections(stories) {
  const sections = {
    lead_story: { title: SECTION_TITLES.lead_story, items: [] },
    models: { title: SECTION_TITLES.models, items: [] },
    agents: { title: SECTION_TITLES.agents, items: [] },
    open_source: { title: SECTION_TITLES.open_source, items: [] },
    business: { title: SECTION_TITLES.business, items: [] },
    china_perspective: { title: SECTION_TITLES.china_perspective, items: [] },
    creator_opportunity: { title: SECTION_TITLES.creator_opportunity, items: [] }
  };

  if (stories[0]) sections.lead_story.items.push(stories[0]);
  for (const story of stories.slice(1)) {
    const key = story.section === 'research' ? 'open_source' : story.section;
    const target = sections[key] ? key : 'business';
    const limit = SECTION_LIMITS[target] || 0;
    if (sections[target].items.length < limit) sections[target].items.push(story);
  }
  return sections;
}

function sectionCounts(sections) {
  return Object.fromEntries(Object.entries(sections).map(([key, section]) => [key, section.items.length]));
}

function createSourceLedger(included) {
  return included.map((item) => ({
    evidence_id: item.evidence_ids[0],
    story_id: item.id,
    title: item.title,
    url: item.url,
    source: item.source,
    source_rank: item.source_rank,
    published_at: item.published_at,
    published_at_source: item.published_at_source,
    collected_at: item.collected_at,
    raw_source_id: item.raw_source_id
  }));
}

function buildContent(dateString, editionType, included, window) {
  const selected = included.map(createStoryItem);
  const sections = buildSections(selected);
  const lead = sections.lead_story.items[0] || null;
  const counts = sectionCounts(sections);
  const sourceLedger = createSourceLedger(included);
  const sourceNames = Array.from(new Set(included.map((item) => item.source))).slice(0, 8).join(' / ');

  return {
    date: dateString,
    vol: dateString.replace(/-/g, ''),
    brand: 'Janet 快车箱',
    theme: editionType === 'full_edition' ? '今日 AI 公开源快车箱' : '今日 AI 公开源简版快车箱',
    intro_text: `本期按 ${TIMEZONE} 固定窗口筛选公开 RSS / Atom 新闻，入选 ${included.length} 条；未使用 sample、旧晨报或模型补写。`,
    daily_thesis: lead
      ? `今天最值得先看的信号是：${lead.title}。其余信号按模型产品、Agent 工具、开源论文、商业资本和创作者机会分层整理。`
      : '今天证据不够，不强行发表判断。',
    signal_map: {
      window: {
        timezone: TIMEZONE,
        start: window.startLocal,
        end: window.endLocal
      },
      source_count: sourceNames,
      included_count: included.length,
      section_counts: counts,
      used_sample_data: false,
      published_at_window_enforced: true
    },
    past_context: '本期为 GitHub Actions 自动化生成，所有新闻必须具有 published_at，并落在固定时间窗口内。',
    lead_story_id: lead ? lead.id : '',
    sections,
    source_summary: `公开源池自动生成；窗口内 included=${included.length}；edition=${editionType}；sources=${sourceNames || 'none'}`,
    source_ledger: sourceLedger,
    editorial_angle: '只跟随可追溯证据，不使用旧内容补数量，不把 collected_at 当作 published_at。',
    what_to_watch_next: [
      '是否出现官方后续说明或产品更新。',
      '同一事件是否被多个高可信来源交叉验证。',
      '是否影响创作者、开发者或企业的实际工作流。'
    ]
  };
}

function buildSummary(content, editionId, editionType, included) {
  const sections = content.sections || {};
  const counts = sectionCounts(sections);
  const lead = sections.lead_story.items[0] || null;
  return {
    status: 'content_generated',
    edition_type: editionType,
    date: content.date,
    brand: content.brand,
    theme: content.theme,
    item_count: included.length,
    lead_story: lead ? {
      id: lead.id,
      title: lead.title,
      url: lead.url,
      source: lead.source,
      source_rank: lead.source_rank,
      published_at: lead.published_at,
      summary: lead.summary,
      why_it_matters: lead.why_it_matters,
      janet_take: lead.janet_take,
      evidence_ids: lead.evidence_ids,
      watch_next: lead.watch_next
    } : null,
    section_counts: counts,
    output_url: `data/${editionId}/output.html`,
    summary_url: `data/${editionId}/news-summary.json`,
    content_url: `data/${editionId}/content.json`
  };
}

function renderStoryHtml(item) {
  return `<article>
      <small>${escapeHtml(item.source)} · ${escapeHtml(item.source_rank)} · ${escapeHtml(item.published_at || '')}</small>
      <h3>${escapeHtml(item.title)}</h3>
      <p>${escapeHtml(item.summary)}</p>
      <p><strong>Janet:</strong> ${escapeHtml(item.janet_take)}</p>
      <p><strong>Evidence:</strong> ${escapeHtml((item.evidence_ids || []).join(', '))}</p>
      <a href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">source</a>
    </article>`;
}

function renderOutputHtml(content) {
  const sections = content.sections || {};
  const sectionHtml = Object.entries(sections).map(([key, section]) => {
    const items = section.items || [];
    return `<section>
    <h2>${escapeHtml(section.title || key)} <span>${items.length}</span></h2>
    ${items.length ? items.map(renderStoryHtml).join('\n') : '<p class="empty">今日没有足够窗口内证据，不强行补位。</p>'}
  </section>`;
  }).join('\n');

  const watchNext = Array.isArray(content.what_to_watch_next)
    ? content.what_to_watch_next.map((item) => `<li>${escapeHtml(item)}</li>`).join('')
    : '';

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(content.brand)} ${escapeHtml(content.date)}</title>
  <style>
    body { margin: 0; background: #050505; color: #f0f0f0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; line-height: 1.65; }
    main { max-width: 960px; margin: 0 auto; padding: 56px 20px 80px; }
    a { color: #18e299; }
    h1 { font-size: clamp(32px, 6vw, 64px); line-height: 1; margin: 14px 0 18px; }
    h2 { border-top: 1px solid rgba(255,255,255,.14); padding-top: 28px; margin-top: 42px; display: flex; justify-content: space-between; gap: 20px; }
    article { border-top: 1px solid rgba(255,255,255,.1); padding: 22px 0; }
    small, .muted, .empty { color: rgba(240,240,240,.58); }
    .hero { border: 1px solid rgba(255,255,255,.14); padding: 24px; background: rgba(255,255,255,.04); }
    .signal { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; margin: 26px 0; }
    .signal div { background: rgba(255,255,255,.06); padding: 14px; border-radius: 8px; }
  </style>
</head>
<body>
  <main>
    <small>${escapeHtml(content.date)} · ${escapeHtml(content.brand)} · GitHub Actions 自动生成</small>
    <h1>${escapeHtml(content.theme)}</h1>
    <p class="hero">${escapeHtml(content.intro_text)}</p>
    <h2>Daily Thesis</h2>
    <p>${escapeHtml(content.daily_thesis)}</p>
    <div class="signal">
      <div><strong>Window</strong><br>${escapeHtml(content.signal_map.window.start)}<br>${escapeHtml(content.signal_map.window.end)}</div>
      <div><strong>Included</strong><br>${escapeHtml(content.signal_map.included_count)}</div>
      <div><strong>Sample</strong><br>${escapeHtml(content.signal_map.used_sample_data ? 'true' : 'false')}</div>
      <div><strong>Published At</strong><br>${escapeHtml(content.signal_map.published_at_window_enforced ? 'enforced' : 'not enforced')}</div>
    </div>
    ${sectionHtml}
    <h2>Source Summary</h2>
    <p>${escapeHtml(content.source_summary)}</p>
    <h2>What To Watch Next</h2>
    <ul>${watchNext}</ul>
  </main>
</body>
</html>
`;
}

function updateManifest(editionId) {
  const manifest = readJson(MANIFEST_PATH, []);
  const next = [editionId, ...manifest.filter((entry) => entry !== editionId)];
  writeJson(MANIFEST_PATH, next);
}

function buildRunStatus({ status, dateString, window, pool, sourceResults, rawItems, included, excluded, editionType, published, editionId, errors }) {
  return {
    status,
    run_at: new Date().toISOString(),
    timezone: TIMEZONE,
    window_start: window.startLocal,
    window_end: window.endLocal,
    source_count: pool.sources.filter((source) => source.enabled).length,
    source_success_count: sourceResults.filter((result) => result.ok).length,
    source_error_count: sourceResults.filter((result) => !result.ok).length,
    raw_items: rawItems.length,
    included: included.length,
    excluded: excluded.length,
    edition_type: editionType,
    published,
    published_edition_id: published ? editionId : '',
    used_sample_data: false,
    published_at_window_enforced: true,
    min_publish_count: pool.min_publish_count,
    full_edition_count: pool.full_edition_count,
    dry_run: false,
    date: dateString,
    errors
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const dateString = args.date || getShanghaiDateString();
  assertDateString(dateString);

  const pool = readJson(SOURCE_POOL_PATH, null);
  if (!pool || !Array.isArray(pool.sources)) throw new Error('Missing or invalid rss-source-pool.json');

  const window = buildWindow(dateString);
  const collectedAt = new Date().toISOString();
  const enabledSources = pool.sources.filter((source) => source.enabled);
  const sourceResults = [];
  const rawItems = [];
  const errors = [];

  for (const source of enabledSources) {
    const result = await fetchSource(source);
    sourceResults.push({ source_id: source.id, ok: result.ok, error: result.error || '' });
    if (!result.ok) {
      errors.push({ source_id: source.id, source: source.source, error: result.error });
      continue;
    }
    rawItems.push(...parseFeedItems(source, result.text, collectedAt));
  }

  const { included, excluded } = normalizeAndFilter(rawItems, window);
  const minPublishCount = Number(pool.min_publish_count || 5);
  const fullEditionCount = Number(pool.full_edition_count || 10);
  const editionId = `${dateString}-v4`;
  let editionType = '';
  let status = '';
  let published = false;

  if (included.length < minPublishCount) {
    status = 'blocked_insufficient_fresh_news';
  } else {
    editionType = included.length >= fullEditionCount ? 'full_edition' : 'limited_edition';
    status = editionType === 'full_edition' ? 'published_full_edition' : 'published_limited_edition';
    if (args.dryRun) {
      status = `dry_run_${editionType}`;
    } else {
      const content = buildContent(dateString, editionType, included, window);
      const summary = buildSummary(content, editionId, editionType, included);
      const outDir = path.join(ROOT, 'data', editionId);
      ensureDir(outDir);
      writeJson(path.join(outDir, 'content.json'), content);
      fs.writeFileSync(path.join(outDir, 'output.html'), renderOutputHtml(content), 'utf8');
      writeJson(path.join(outDir, 'news-summary.json'), summary);
      updateManifest(editionId);
      published = true;
    }
  }

  const runStatus = buildRunStatus({
    status,
    dateString,
    window,
    pool,
    sourceResults,
    rawItems,
    included,
    excluded,
    editionType,
    published,
    editionId,
    errors
  });
  runStatus.dry_run = args.dryRun;
  runStatus.excluded_reasons = excluded.reduce((acc, item) => {
    acc[item.excluded_reason] = (acc[item.excluded_reason] || 0) + 1;
    return acc;
  }, {});

  writeJson(RUN_STATUS_PATH, runStatus);
  console.log(JSON.stringify(runStatus, null, 2));
}

main().catch((error) => {
  const fallbackStatus = {
    status: 'generator_error',
    run_at: new Date().toISOString(),
    timezone: TIMEZONE,
    used_sample_data: false,
    published_at_window_enforced: true,
    published: false,
    errors: [error.message || String(error)]
  };
  writeJson(RUN_STATUS_PATH, fallbackStatus);
  console.error(error);
  process.exitCode = 1;
});
