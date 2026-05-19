import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = process.cwd();
const OUT = resolve(ROOT, 'data/semantic-copy-audit.json');
const FIELDS = ['title', 'summary', 'why_it_matters', 'janet_take', 'watch_next'];
const THRESHOLDS = {
  title: 0.68,
  summary: 0.62,
  why_it_matters: 0.62,
  janet_take: 0.62,
  watch_next: 0.62
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
  '露出新落点'
];
const PATCH_PHRASES = [
  '第2个切面',
  '第3个切面',
  '第2个落点',
  '第3个落点',
  '对应到',
  '这条第',
  '第2个角度',
  '第3个角度'
];
const FUNCTION_NAMES = [
  'makeChineseTitle',
  'makeChineseSummary',
  'whyItMatters',
  'janetTake',
  'watchNext',
  'buildHomepageSlots',
  'signalMap',
  'homepage_items',
  'compact_news'
];
const SPECIFIC_TERMS = [
  { pattern: /NVIDIA Vera/i, terms: ['NVIDIA Vera', 'Vera'] },
  { pattern: /Jensen Huang/i, terms: ['黄仁勋', 'Jensen Huang'] },
  { pattern: /Dell/i, terms: ['戴尔', 'Dell'] },
  { pattern: /Cosmos/i, terms: ['Cosmos'] },
  { pattern: /PaddleOCR/i, terms: ['PaddleOCR'] },
  { pattern: /Nova 2/i, terms: ['Nova 2'] },
  { pattern: /Confluence/i, terms: ['Confluence'] },
  { pattern: /GitHub Copilot/i, terms: ['GitHub Copilot', 'Copilot'] },
  { pattern: /Codex/i, terms: ['Codex'] },
  { pattern: /Siri/i, terms: ['Siri'] },
  { pattern: /OpenAI/i, terms: ['OpenAI'] }
];

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function latestEditionId() {
  const manifest = readJson(resolve(ROOT, 'data/MANIFEST.json'));
  return Array.isArray(manifest) ? manifest[0] : manifest?.items?.[0] || manifest?.latest || '';
}

function collectCards(value, path = '$', output = []) {
  if (!value || typeof value !== 'object') return output;
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectCards(item, `${path}[${index}]`, output));
    return output;
  }
  const looksLikeCard = ['title', 'summary', 'source', 'url', 'story_id', 'id', 'janet_take', 'why_it_matters', 'watch_next']
    .some((key) => Object.prototype.hasOwnProperty.call(value, key));
  if (looksLikeCard) {
    output.push({
      path,
      id: String(value.story_id || value.id || ''),
      story_id: String(value.story_id || value.id || ''),
      title: String(value.title || ''),
      summary: String(value.summary || ''),
      why_it_matters: String(value.why_it_matters || ''),
      janet_take: String(value.janet_take || ''),
      watch_next: String(value.watch_next || ''),
      source: String(value.source || ''),
      category: String(value.category || value.primary_section || ''),
      original_title: String(value.original_title || ''),
      url: String(value.url || '')
    });
  }
  Object.keys(value).forEach((key) => collectCards(value[key], `${path}.${key}`, output));
  return output;
}

function uniqueByPath(cards) {
  const seen = new Set();
  return cards.filter((card) => {
    const key = `${card.path}:${card.id}:${card.title}:${card.summary}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalizeText(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[，。！？、：；,.!?;:"'“”‘’()[\]{}<>《》/\s]+/g, '')
    .trim();
}

function bigrams(text) {
  const normalized = normalizeText(text);
  if (!normalized) return new Set();
  if ([...normalized].length === 1) return new Set([normalized]);
  const chars = [...normalized];
  const result = new Set();
  for (let index = 0; index < chars.length - 1; index += 1) {
    result.add(`${chars[index]}${chars[index + 1]}`);
  }
  return result;
}

function jaccard(a, b) {
  const left = bigrams(a);
  const right = bigrams(b);
  if (!left.size && !right.size) return 0;
  let intersection = 0;
  for (const item of left) {
    if (right.has(item)) intersection += 1;
  }
  return intersection / (left.size + right.size - intersection);
}

function exactGroups(cards, field) {
  const groups = new Map();
  for (const card of cards) {
    const value = String(card[field] || '').trim();
    if (!value) continue;
    if (!groups.has(value)) groups.set(value, []);
    groups.get(value).push(card);
  }
  return [...groups.entries()]
    .filter(([, items]) => items.length > 1)
    .map(([value, items]) => ({ value, count: items.length, items: slimItems(items, field) }));
}

function nearGroups(cards, field, threshold) {
  const groups = [];
  const used = new Set();
  for (let leftIndex = 0; leftIndex < cards.length; leftIndex += 1) {
    if (used.has(leftIndex) || !cards[leftIndex][field]) continue;
    const group = [cards[leftIndex]];
    const similarities = [];
    for (let rightIndex = leftIndex + 1; rightIndex < cards.length; rightIndex += 1) {
      if (used.has(rightIndex) || !cards[rightIndex][field]) continue;
      if (cards[leftIndex][field] === cards[rightIndex][field]) continue;
      const score = jaccard(cards[leftIndex][field], cards[rightIndex][field]);
      if (score >= threshold) {
        group.push(cards[rightIndex]);
        similarities.push({
          left: cards[leftIndex].path,
          right: cards[rightIndex].path,
          score: Number(score.toFixed(3))
        });
        used.add(rightIndex);
      }
    }
    if (group.length > 1) {
      used.add(leftIndex);
      groups.push({ field, threshold, count: group.length, similarities, items: slimItems(group, field) });
    }
  }
  return groups;
}

function slimItems(items, field) {
  return items.map((item) => ({
    path: item.path,
    story_id: item.story_id,
    source: item.source,
    category: item.category,
    original_title: item.original_title,
    title: item.title,
    value: item[field],
    url: item.url
  }));
}

function phraseFindings(cards, phrases) {
  const findings = [];
  for (const phrase of phrases) {
    const hits = [];
    for (const card of cards) {
      for (const field of FIELDS) {
        if (card[field] && card[field].includes(phrase)) {
          hits.push({ path: card.path, story_id: card.story_id, field, value: card[field] });
        }
      }
    }
    if (hits.length) findings.push({ phrase, count: hits.length, hits });
  }
  return findings;
}

function sourceCategoryClusters(cards) {
  const groups = new Map();
  for (const card of cards) {
    if (!card.title) continue;
    const key = `${card.source || '(empty)'}::${card.category || '(empty)'}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(card);
  }
  return [...groups.entries()].flatMap(([key, items]) => {
    if (items.length < 2) return [];
    const nearTitleGroups = nearGroups(items, 'title', 0.52);
    if (!nearTitleGroups.length) return [];
    const [source, category] = key.split('::');
    return nearTitleGroups.map((group) => ({
      source,
      category,
      count: group.count,
      items: group.items
    }));
  });
}

function missingSpecificTerms(cards) {
  const missing = [];
  for (const card of cards) {
    if (!card.original_title || !card.title) continue;
    for (const spec of SPECIFIC_TERMS) {
      if (!spec.pattern.test(card.original_title)) continue;
      const title = card.title.toLowerCase();
      const hasTerm = spec.terms.some((term) => title.includes(term.toLowerCase()));
      if (!hasTerm) {
        missing.push({
          path: card.path,
          story_id: card.story_id,
          source: card.source,
          original_title: card.original_title,
          title: card.title,
          expected_terms: spec.terms
        });
      }
    }
  }
  return missing;
}

function suspectedGeneratorFunctions(generatorSource) {
  return FUNCTION_NAMES.flatMap((name) => {
    const matches = [];
    const regex = new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
    let match;
    while ((match = regex.exec(generatorSource))) {
      const line = generatorSource.slice(0, match.index).split('\n').length;
      matches.push({ name, line });
    }
    return matches;
  });
}

function main() {
  const latest = latestEditionId();
  const content = readJson(resolve(ROOT, `data/${latest}/content.json`));
  const summary = readJson(resolve(ROOT, `data/${latest}/news-summary.json`));
  const generatorSource = readFileSync(resolve(ROOT, '.github/scripts/daily-news-generator.mjs'), 'utf8');
  const newsJsSource = readFileSync(resolve(ROOT, 'scripts/news.js'), 'utf8');
  const cards = uniqueByPath([
    ...collectCards(summary, 'summary'),
    ...collectCards(content, 'content')
  ]);
  const homepageItems = Array.isArray(content.homepage_items) ? content.homepage_items : [];
  const result = {
    step: '35-U2-A',
    status: 'semantic_copy_audited',
    latest_edition_id: latest,
    homepage_items_checked: homepageItems.length,
    duplicate_title_groups: exactGroups(cards, 'title'),
    near_duplicate_title_groups: nearGroups(cards, 'title', THRESHOLDS.title),
    duplicate_summary_groups: exactGroups(cards, 'summary'),
    near_duplicate_summary_groups: nearGroups(cards, 'summary', THRESHOLDS.summary),
    duplicate_why_it_matters_groups: exactGroups(cards, 'why_it_matters'),
    near_duplicate_why_it_matters_groups: nearGroups(cards, 'why_it_matters', THRESHOLDS.why_it_matters),
    duplicate_janet_take_groups: exactGroups(cards, 'janet_take'),
    near_duplicate_janet_take_groups: nearGroups(cards, 'janet_take', THRESHOLDS.janet_take),
    duplicate_watch_next_groups: exactGroups(cards, 'watch_next'),
    near_duplicate_watch_next_groups: nearGroups(cards, 'watch_next', THRESHOLDS.watch_next),
    generic_template_phrases_found: phraseFindings(cards, GENERIC_PHRASES),
    patch_phrases_found: phraseFindings(cards, PATCH_PHRASES),
    source_category_template_clusters: sourceCategoryClusters(cards),
    missing_specific_terms: missingSpecificTerms(cards),
    suspected_generator_functions: suspectedGeneratorFunctions(generatorSource),
    qa_gaps: [
      'homepage assembly QA checks exact duplicate copy but not semantic similarity across all content paths',
      'editorial QA allows source/category based fallback language when it is unique by string',
      'main UX QA does not inspect original_title to title specificity',
      newsJsSource.includes('sanitizePublicCopy') ? 'front-end sanitization hides some engineering copy but cannot repair generator semantics' : 'front-end copy guard not detected'
    ],
    root_cause_hypotheses: [
      'generator still uses source/category fallback copy when original_title does not match a hand-written rule',
      'homepage copy uniqueness patch can append mechanical phrases instead of producing story-specific language',
      'signal and compact slots are now structurally unique, but copy is still derived from repeated helper functions',
      'specific named entities from original_title are not always enforced in Chinese title generation'
    ],
    issues: [],
    warnings: []
  };
  for (const key of Object.keys(result)) {
    if (Array.isArray(result[key]) && key.includes('duplicate') && result[key].length) {
      result.issues.push(`${key}: ${result[key].length}`);
    }
  }
  if (result.generic_template_phrases_found.length) result.issues.push(`generic_template_phrases_found: ${result.generic_template_phrases_found.length}`);
  if (result.patch_phrases_found.length) result.issues.push(`patch_phrases_found: ${result.patch_phrases_found.length}`);
  if (result.missing_specific_terms.length) result.issues.push(`missing_specific_terms: ${result.missing_specific_terms.length}`);
  if (result.source_category_template_clusters.length) result.warnings.push(`source_category_template_clusters: ${result.source_category_template_clusters.length}`);
  writeFileSync(OUT, `${JSON.stringify(result, null, 2)}\n`);
  console.log(`semantic copy audit written: ${OUT}`);
}

main();
