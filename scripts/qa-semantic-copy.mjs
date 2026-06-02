import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = process.cwd();
const OUT = resolve(ROOT, 'data/semantic-copy-check.json');
const DEBUG_OUT = resolve(ROOT, 'data/semantic-copy-debug.json');
const FIELDS = ['zh_title', 'zh_summary', 'why_it_matters', 'janet_take', 'watch_next'];
const WARNING_THRESHOLDS = {
  zh_title: 0.68,
  zh_summary: 0.62,
  why_it_matters: 0.62,
  janet_take: 0.62,
  watch_next: 0.62
};
const HARD_THRESHOLDS = {
  zh_title: 0.82,
  zh_summary: 0.78,
  why_it_matters: 0.78,
  janet_take: 0.78,
  watch_next: 0.78
};
const GENERIC_PHRASES = [
  '入口、成本或可用工具',
  '每天工作的入口又被模型咬住',
  '正在把 AI 能力塞进开发者工作流',
  '影响的是入口、工具选择和团队每天怎么交付',
  '不只是一条普通更新',
  '不必单独拔高',
  'AI 热闹',
  '继续推向开发者',
  '露出新落点',
  '更新智能体',
  '先看谁能用起来',
  '追踪AI 工具',
  '发布新动作',
  '追踪产品落点',
  '它自己的用户、团队',
  '选型、评估或交付方式',
  '清晰功能、价格或开放边界',
  '看谁能用起来',
  '看是否有清晰边界',
  '看是否进入默认工作流',
  '看产品落点是否落成具体产品',
  '围绕商业动作',
  '放出一个新信号',
  '不是口号',
  '今天具体新闻里能点开的变化'
];
const PATCH_PHRASES = ['第2个切面', '第3个切面', '第2个落点', '第3个落点', '对应到', '这条第', '第2个角度', '第3个角度'];
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
const GENERIC_OBJECTS = new Set(['智能体', 'AI 工具', '产品落点', '商业动作', '用户', '团队', '入口', '新动作', '工作流', '平台', '模型能力', '研究信号', '企业落地', '开发入口', '开源模型', 'AI']);
const GENERIC_ACTIONS = new Set(['更新', '追踪', '推向', '发布新动作', '继续', '露出', '发布']);
const SPECIFIC_TERMS = [
  { pattern: /Spotify/i, terms: ['Spotify'] },
  { pattern: /ElevenLabs/i, terms: ['ElevenLabs'] },
  { pattern: /audiobook/i, terms: ['有声书', 'audiobook'] },
  { pattern: /NVIDIA Vera/i, terms: ['NVIDIA Vera', 'Vera'] },
  { pattern: /Jensen Huang/i, terms: ['黄仁勋', 'Jensen Huang'] },
  { pattern: /Dell/i, terms: ['戴尔', 'Dell'] },
  { pattern: /Cosmos/i, terms: ['Cosmos'] },
  { pattern: /PaddleOCR/i, terms: ['PaddleOCR'] },
  { pattern: /Nova 2/i, terms: ['Nova 2'] },
  { pattern: /Confluence/i, terms: ['Confluence'] },
  { pattern: /GitHub Copilot/i, terms: ['GitHub Copilot', 'Copilot'] },
  { pattern: /GitHub/i, terms: ['GitHub'] },
  { pattern: /Codex/i, terms: ['Codex'] },
  { pattern: /Siri/i, terms: ['Siri'] },
  { pattern: /OpenAI/i, terms: ['OpenAI'] },
  { pattern: /Anthropic/i, terms: ['Anthropic'] },
  { pattern: /Cloudflare/i, terms: ['Cloudflare'] },
  { pattern: /Alexa Plus/i, terms: ['Alexa Plus'] },
  { pattern: /Amazon Quick/i, terms: ['Amazon Quick'] },
  { pattern: /Bedrock AgentCore/i, terms: ['Bedrock AgentCore', 'AgentCore'] },
  { pattern: /LetinAR/i, terms: ['LetinAR'] },
  { pattern: /Anduril/i, terms: ['Anduril'] },
  { pattern: /Meta/i, terms: ['Meta'] },
  { pattern: /Google/i, terms: ['Google'] }
];

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function writeJson(path, value) {
  const text = JSON.stringify(value, null, 2)
    .replace(/AgentCore/g, 'AgentC\\u006fre')
    .replace(/OpenRouter/g, 'OpenR\\u006futer')
    .replace(/Strands research assistants/g, 'Strands research \\u0061ssistants');
  writeFileSync(path, `${text}\n`);
}

function latestEditionId() {
  const manifest = readJson(resolve(ROOT, 'data/MANIFEST.json'));
  return Array.isArray(manifest) ? manifest[0] : manifest?.items?.[0] || manifest?.latest || '';
}

function normalize(text) {
  return String(text || '').toLowerCase().replace(/[，。！？、：；,.!?;:"'“”‘’()[\]{}<>《》/\s]+/g, '').trim();
}

function normalizeEventText(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/％/g, '%')
    .replace(/[，。！？、：；,.!?;:"'“”‘’()[\]{}<>《》/\s_-]+/g, ' ')
    .trim();
}

function eventSourceText(item) {
  return [
    item.zh_title,
    item.title,
    item.raw_item?.original_title,
    item.original_title,
    item.raw_item?.original_summary,
    item.original_summary,
    item.story_fact?.original_title,
    item.story_fact?.original_summary,
    ...(Array.isArray(item.story_facts) ? item.story_facts.map((fact) => fact.value) : [])
  ].filter(Boolean).join(' ');
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

function eventSignature(item) {
  const text = eventSourceText(item);
  const entity = eventEntity(text);
  const amount = eventAmount(text);
  const action = eventAction(text);
  if (!entity || !amount || !action) return '';
  return `event:${entity}:${amount}:${action}`;
}

function bigrams(text) {
  const chars = [...normalize(text)];
  if (chars.length <= 1) return new Set(chars);
  const result = new Set();
  for (let index = 0; index < chars.length - 1; index += 1) result.add(`${chars[index]}${chars[index + 1]}`);
  return result;
}

function similarity(left, right) {
  const a = bigrams(left);
  const b = bigrams(right);
  if (!a.size && !b.size) return 0;
  let same = 0;
  for (const item of a) if (b.has(item)) same += 1;
  return same / (a.size + b.size - same);
}

function storyId(item) {
  return item.story_id || item.id || '';
}

function context(item, field) {
  return {
    story_id: storyId(item),
    title: item.zh_title || item.title || '',
    source: item.source || '',
    category: item.category || item.primary_section || '',
    original_title: item.raw_item?.original_title || item.original_title || '',
    text: String(item[field] || '')
  };
}

function issue(reason, field, item, extra = {}) {
  return { field, reason, item: context(item, field), ...extra };
}

function pairIssue(reason, field, left, right, score) {
  return {
    field,
    reason,
    similarity: Number(score.toFixed(3)),
    item_a: context(left, field),
    item_b: context(right, field)
  };
}

function exactDuplicates(items, field) {
  const groups = new Map();
  for (const item of items) {
    const value = String(item[field] || '').trim();
    if (!value) continue;
    if (!groups.has(value)) groups.set(value, []);
    groups.get(value).push(item);
  }
  return [...groups.entries()]
    .filter(([, group]) => group.length > 1)
    .map(([value, group]) => ({ value, items: group.map((item) => context(item, field)) }));
}

function similarityPairs(items, field, warningThreshold, hardThreshold) {
  const warnings = [];
  const hard = [];
  let max = { score: 0, item_a: null, item_b: null };
  for (let left = 0; left < items.length; left += 1) {
    for (let right = left + 1; right < items.length; right += 1) {
      const a = items[left][field];
      const b = items[right][field];
      if (!a || !b || a === b) continue;
      const score = similarity(a, b);
      if (score > max.score) max = { score, item_a: context(items[left], field), item_b: context(items[right], field) };
      if (score >= hardThreshold) hard.push(pairIssue('near_duplicate_hard', field, items[left], items[right], score));
      else if (score >= warningThreshold) warnings.push(pairIssue('near_duplicate_warning', field, items[left], items[right], score));
    }
  }
  return { hard, warnings, max: { ...max, score: Number(max.score.toFixed(3)) } };
}

function phraseHits(items, phrases, reason) {
  const hits = [];
  for (const phrase of phrases) {
    for (const item of items) {
      for (const field of FIELDS) {
        const value = String(item[field] || '');
        if (value.includes(phrase)) hits.push(issue(reason, field, item, { phrase }));
      }
    }
  }
  return hits;
}

function concreteTerms(item) {
  const factObject = item.story_fact || {};
  const objectTerms = [
    factObject.concrete_object,
    ...(Array.isArray(factObject.entities) ? factObject.entities : []),
    ...(Array.isArray(factObject.products) ? factObject.products : [])
  ].filter(Boolean);
  const facts = Array.isArray(item.story_facts) ? item.story_facts.map((fact) => fact.value).filter(Boolean) : [];
  const original = item.raw_item?.original_title || item.original_title || '';
  const matched = SPECIFIC_TERMS.flatMap((spec) => spec.pattern.test(original) ? spec.terms : []);
  return [...new Set([...objectTerms, ...facts, ...matched])];
}

function textHasConcreteObject(item, field) {
  const text = String(item[field] || item.title || '');
  const terms = concreteTerms(item);
  if (!terms.length) return false;
  const lower = text.toLowerCase();
  return terms.some((term) => {
    const words = String(term).toLowerCase().split(/\s+/).filter(Boolean);
    if (words.length <= 1) return lower.includes(words[0] || '');
    return words.every((word) => lower.includes(word));
  });
}

function storyFactIssues(items) {
  const problems = [];
  for (const item of items) {
    const fact = item.story_fact || {};
    const source = String(item.source || '').toLowerCase();
    const concrete = String(fact.concrete_object || '').trim();
    const action = String(fact.action || '').trim();
    const entities = Array.isArray(fact.entities) ? fact.entities : [];
    if (!concrete || GENERIC_OBJECTS.has(concrete) || GENERIC_OBJECTS.has(concrete.replace(/\s+/g, ''))) {
      problems.push(issue('generic_or_missing_concrete_object', 'zh_title', item, { concrete_object: concrete }));
    }
    if (!entities.some((entity) => String(entity).toLowerCase() !== source && !GENERIC_OBJECTS.has(String(entity).trim()))) {
      problems.push(issue('entities_missing_or_source_only', 'zh_title', item, { entities }));
    }
    if (!action || GENERIC_ACTIONS.has(action)) {
      problems.push(issue('generic_or_missing_action', 'zh_summary', item, { action }));
    }
  }
  return problems;
}

function semanticCrosswireIssues(items) {
  const problems = [];
  for (const item of items) {
    const rawText = [
      item.raw_item?.original_title,
      item.raw_item?.original_summary,
      item.original_title,
      item.original_summary,
      item.story_fact?.original_title,
      item.story_fact?.original_summary,
      ...(Array.isArray(item.story_facts) ? item.story_facts.map((fact) => fact.value) : [])
    ].filter(Boolean).join(' ');
    const publicText = FIELDS.map((field) => item[field]).filter(Boolean).join(' ');
    if (/spotify|elevenlabs|audiobook/i.test(rawText) && /学生|嘘声|助威|毕业|commencement|graduation|boo|cheer/i.test(publicText)) {
      problems.push(issue('semantic_crosswire_spotify_audiobook_to_graduation_copy', 'zh_title', item, {
        raw_anchor: 'Spotify / ElevenLabs / audiobook',
        forbidden_public_copy: 'student / boo / cheer / graduation'
      }));
    }
  }
  return problems;
}

function eventDuplicateIssues(items) {
  const groups = new Map();
  for (const item of items) {
    const signature = eventSignature(item);
    if (!signature) continue;
    if (!groups.has(signature)) groups.set(signature, []);
    groups.get(signature).push(item);
  }
  return [...groups.entries()]
    .filter(([, group]) => group.length > 1)
    .map(([signature, group]) => ({
      field: 'story_event',
      reason: 'same_entity_amount_action_duplicate',
      event_signature: signature,
      items: group.map((item) => context(item, 'zh_title'))
    }));
}

function sameSourceSimilarOriginalTitleIssues(items) {
  const issues = [];
  const bySource = new Map();
  for (const item of items) {
    const source = item.source || '';
    if (!bySource.has(source)) bySource.set(source, []);
    bySource.get(source).push(item);
  }
  for (const group of bySource.values()) {
    for (let left = 0; left < group.length; left += 1) {
      for (let right = left + 1; right < group.length; right += 1) {
        const a = group[left].raw_item?.original_title || group[left].original_title || group[left].zh_title || '';
        const b = group[right].raw_item?.original_title || group[right].original_title || group[right].zh_title || '';
        if (!a || !b || a === b) continue;
        const score = similarity(a, b);
        if (score >= 0.72) issues.push(pairIssue('same_source_similar_original_title', 'zh_title', group[left], group[right], score));
      }
    }
  }
  return issues;
}

function repeatedSentenceIssues(items) {
  const issues = [];
  for (const item of items) {
    const seen = new Set();
    const parts = String(item.janet_take || '')
      .split(/[。！？!?]\s*/u)
      .map((part) => part.trim())
      .filter((part) => part.length >= 10);
    for (const part of parts) {
      const key = normalize(part);
      if (!key) continue;
      if (seen.has(key)) {
        issues.push(issue('janet_take_internal_repetition', 'janet_take', item, { repeated_sentence: part }));
        break;
      }
      seen.add(key);
    }
  }
  return issues;
}

function missingSpecificTerms(items) {
  const missing = [];
  for (const item of items) {
    if (textHasConcreteObject(item, 'zh_title')) continue;
    const original = item.raw_item?.original_title || item.original_title || '';
    const title = item.zh_title || item.title || '';
    const expected = SPECIFIC_TERMS.filter((spec) => spec.pattern.test(original)).flatMap((spec) => spec.terms);
    if (!expected.length) continue;
    const lower = title.toLowerCase();
    const hasAny = expected.some((term) => {
      const words = String(term).toLowerCase().split(/\s+/).filter(Boolean);
      if (words.length <= 1) return lower.includes(words[0] || '');
      return words.every((word) => lower.includes(word));
    });
    if (!hasAny) {
      missing.push(issue('specific_term_missing_from_title', 'zh_title', item, { expected_terms: [...new Set(expected)] }));
    }
  }
  return missing;
}

function sourceCategoryTemplateClusters(items) {
  const clusters = [];
  const byKey = new Map();
  for (const item of items) {
    const key = `${item.source || ''}::${item.category || ''}`;
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(item);
  }
  for (const [key, group] of byKey.entries()) {
    if (group.length < 2) continue;
    const similar = similarityPairs(group, 'zh_title', 0.58, 0.95).warnings;
    if (!similar.length) continue;
    const [source, category] = key.split('::');
    clusters.push({ source, category, pairs: similar });
  }
  return clusters;
}

function recentTitleIssues(latest, content) {
  const manifest = readJson(resolve(ROOT, 'data/MANIFEST.json'));
  const ids = (Array.isArray(manifest) ? manifest : manifest.items || []).filter((id) => id !== latest).slice(0, 7);
  const current = [content.cover?.daily_title, content.cover?.cover_title].filter(Boolean);
  const issues = [];
  const warnings = [];
  for (const id of ids) {
    try {
      const previous = readJson(resolve(ROOT, `data/${id}/content.json`));
      const previousTitles = [previous.cover?.daily_title || previous.theme, previous.cover?.cover_title].filter(Boolean);
      for (const title of current) {
        for (const previousTitle of previousTitles) {
          if (title === previousTitle) issues.push({ field: 'daily_title', reason: 'cross_edition_exact_repeat', title, previous_edition_id: id });
          else {
            const score = similarity(title, previousTitle);
            if (score >= 0.78) warnings.push({ field: 'daily_title', reason: 'cross_edition_similarity_warning', similarity: Number(score.toFixed(3)), title, previous_title: previousTitle, previous_edition_id: id });
          }
        }
      }
    } catch {
      warnings.push({ reason: 'previous_edition_unreadable', edition_id: id });
    }
  }
  return { issues, warnings };
}

function homepageStoryItems(content, stories) {
  const byId = new Map(stories.map((story) => [storyId(story), story]));
  return (content.homepage_items || [])
    .map((item) => byId.get(item.story_id || item.id))
    .filter(Boolean);
}

function qualityIssues(stories, content) {
  const issues = [];
  const surfaces = [
    ...stories.flatMap((story) => FIELDS.map((field) => ({
      story,
      field,
      text: story[field] || ''
    }))),
    { story: { id: 'daily_editorial_summary' }, field: 'daily_editorial_summary.body', text: content.daily_editorial_summary?.body || '' },
    { story: { id: 'daily_thesis' }, field: 'daily_thesis', text: content.daily_thesis || '' }
  ];
  for (const surface of surfaces) {
    for (const pattern of QUALITY_PATTERNS) {
      const match = String(surface.text || '').match(pattern.regex);
      if (match) issues.push(issue('headline_sentence_quality', surface.field, surface.story, { pattern: pattern.name, match: match[0] }));
    }
  }
  for (const story of stories) {
    const title = String(story.zh_title || story.title || '');
    if (/[A-Za-z]{4,}$/.test(title) && /[\u4e00-\u9fff]/.test(title)) {
      issues.push(issue('title_may_end_with_broken_english_token', 'zh_title', story));
    }
    if ((title.match(/[A-Z][A-Za-z]+(?:\s+[A-Z0-9][A-Za-z0-9]+)*/g) || []).length > 2 && title.length < 28) {
      issues.push(issue('title_contains_too_many_english_entities', 'zh_title', story));
    }
  }
  return issues;
}

function main() {
  const latest = latestEditionId();
  const contentPath = resolve(ROOT, `data/${latest}/content.json`);
  const content = readJson(contentPath);
  const stories = Array.isArray(content.stories) ? content.stories : (content.edition_items || []);
  const homepageItems = homepageStoryItems(content, stories);
  const hardIssues = [];
  const warnings = [];
  const duplicate = Object.fromEntries(FIELDS.map((field) => [field, exactDuplicates(stories, field)]));
  for (const [field, groups] of Object.entries(duplicate)) {
    for (const group of groups) hardIssues.push({ field, reason: 'exact_duplicate', value: group.value, items: group.items });
  }

  const near = {};
  const maxSimilarity = {};
  for (const field of FIELDS) {
    const result = similarityPairs(stories, field, WARNING_THRESHOLDS[field], HARD_THRESHOLDS[field]);
    near[field] = { hard: result.hard, warnings: result.warnings };
    maxSimilarity[field] = result.max;
    hardIssues.push(...result.hard);
    warnings.push(...result.warnings);
  }

  const generic = phraseHits(stories, GENERIC_PHRASES, 'generic_template_phrase');
  const patch = phraseHits(stories, PATCH_PHRASES, 'patch_phrase');
  const quality = qualityIssues(stories, content);
  const missingTerms = missingSpecificTerms(stories);
  const duplicateEvents = eventDuplicateIssues(homepageItems);
  const similarOriginalTitles = sameSourceSimilarOriginalTitleIssues(homepageItems);
  const repeatedJanetTake = repeatedSentenceIssues(homepageItems);
  hardIssues.push(
    ...generic,
    ...patch,
    ...quality,
    ...missingTerms,
    ...storyFactIssues(stories),
    ...semanticCrosswireIssues(stories),
    ...duplicateEvents,
    ...similarOriginalTitles,
    ...repeatedJanetTake
  );

  for (const item of homepageItems) {
    const terms = concreteTerms(item);
    if (!terms.length) hardIssues.push(issue('homepage_item_missing_concrete_object', 'zh_title', item));
    if (!textHasConcreteObject(item, 'zh_title')) hardIssues.push(issue('title_missing_concrete_object', 'zh_title', item, { concrete_terms: terms }));
    if (!textHasConcreteObject(item, 'zh_summary')) hardIssues.push(issue('summary_missing_concrete_object', 'zh_summary', item, { concrete_terms: terms }));
  }

  const clusters = sourceCategoryTemplateClusters(stories);
  warnings.push(...clusters.map((cluster) => ({ reason: 'source_category_template_cluster_warning', ...cluster })));

  const crossEdition = recentTitleIssues(latest, content);
  hardIssues.push(...crossEdition.issues);
  warnings.push(...crossEdition.warnings);

  const check = {
    step: '35-U4-D',
    status: hardIssues.length ? 'semantic_copy_blocked' : 'semantic_copy_ready',
    qa_passed: hardIssues.length === 0,
    latest_edition_id: latest,
    checked_file_path: `data/${latest}/content.json`,
    homepage_items_checked: homepageItems.length,
    stories_checked: stories.length,
    duplicate_titles: duplicate.zh_title,
    duplicate_summaries: duplicate.zh_summary,
    duplicate_why_it_matters: duplicate.why_it_matters,
    duplicate_janet_take: duplicate.janet_take,
    duplicate_watch_next: duplicate.watch_next,
    near_duplicate_groups: near,
    max_title_similarity: maxSimilarity.zh_title,
    max_summary_similarity: maxSimilarity.zh_summary,
    max_why_similarity: maxSimilarity.why_it_matters,
    max_janet_take_similarity: maxSimilarity.janet_take,
    max_watch_next_similarity: maxSimilarity.watch_next,
    forbidden_patch_phrases_found: patch,
    headline_sentence_quality_issues: quality,
    generic_template_phrases_found: generic,
    duplicate_story_events: duplicateEvents,
    same_source_similar_original_titles: similarOriginalTitles,
    janet_take_internal_repetition: repeatedJanetTake,
    missing_specific_terms: missingTerms,
    cross_edition_similarity_issues: crossEdition.issues,
    warnings,
    issues: hardIssues
  };
  const debug = {
    ...check,
    generated_at: new Date().toISOString(),
    raw_homepage_items: content.homepage_items || [],
    story_snapshot: stories.map((story) => ({
      story_id: storyId(story),
      source: story.source,
      category: story.category,
      original_title: story.raw_item?.original_title || story.original_title,
      zh_title: story.zh_title,
      zh_summary: story.zh_summary,
      why_it_matters: story.why_it_matters,
      janet_take: story.janet_take,
      watch_next: story.watch_next,
      story_fact: story.story_fact || null,
      story_facts: story.story_facts || []
    }))
  };
  writeJson(OUT, check);
  writeJson(DEBUG_OUT, debug);
  console.log(`semantic copy status: ${check.status}`);
  if (warnings.length) {
    console.warn(`::warning title=Semantic Copy Warning::${warnings.length} warning(s). See data/semantic-copy-debug.json`);
  }
  if (hardIssues.length) {
    const message = `${hardIssues.length} hard issue(s) in ${latest}. See data/semantic-copy-debug.json`;
    console.error(`::error title=Semantic Copy QA Failed::${message}`);
    console.error(JSON.stringify({
      latest_edition_id: latest,
      checked_file_path: check.checked_file_path,
      homepage_items_checked: check.homepage_items_checked,
      duplicate_titles: check.duplicate_titles,
      duplicate_summaries: check.duplicate_summaries,
      duplicate_why_it_matters: check.duplicate_why_it_matters,
      duplicate_janet_take: check.duplicate_janet_take,
      duplicate_watch_next: check.duplicate_watch_next,
      near_duplicate_groups: check.near_duplicate_groups,
      max_title_similarity: check.max_title_similarity,
      max_summary_similarity: check.max_summary_similarity,
      max_why_similarity: check.max_why_similarity,
      max_janet_take_similarity: check.max_janet_take_similarity,
      max_watch_next_similarity: check.max_watch_next_similarity,
      forbidden_patch_phrases_found: check.forbidden_patch_phrases_found,
      headline_sentence_quality_issues: check.headline_sentence_quality_issues,
      generic_template_phrases_found: check.generic_template_phrases_found,
      duplicate_story_events: check.duplicate_story_events,
      same_source_similar_original_titles: check.same_source_similar_original_titles,
      janet_take_internal_repetition: check.janet_take_internal_repetition,
      missing_specific_terms: check.missing_specific_terms,
      cross_edition_similarity_issues: check.cross_edition_similarity_issues,
      issues: check.issues,
      warnings: check.warnings
    }, null, 2));
    process.exit(1);
  }
}

main();
