import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = process.cwd();
const OUT = resolve(ROOT, 'data/semantic-copy-check.json');
const FIELDS = ['zh_title', 'zh_summary', 'why_it_matters', 'janet_take', 'watch_next'];
const THRESHOLDS = {
  zh_title: 0.68,
  zh_summary: 0.62,
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
  '露出新落点',
  '围绕商业动作',
  '放出一个新信号',
  '不是口号',
  '今天具体新闻里能点开的变化'
];
const PATCH_PHRASES = ['第2个切面', '第3个切面', '第2个落点', '第3个落点', '对应到', '这条第', '第2个角度', '第3个角度'];
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

function normalize(text) {
  return String(text || '').toLowerCase().replace(/[，。！？、：；,.!?;:"'“”‘’()[\]{}<>《》/\s]+/g, '').trim();
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

function exactDuplicates(items, field) {
  const groups = new Map();
  for (const item of items) {
    const value = String(item[field] || '').trim();
    if (!value) continue;
    if (!groups.has(value)) groups.set(value, []);
    groups.get(value).push(item.story_id || item.id);
  }
  return [...groups.entries()].filter(([, ids]) => ids.length > 1).map(([value, ids]) => ({ value, ids }));
}

function nearDuplicates(items, field, threshold) {
  const pairs = [];
  for (let left = 0; left < items.length; left += 1) {
    for (let right = left + 1; right < items.length; right += 1) {
      const a = items[left][field];
      const b = items[right][field];
      if (!a || !b || a === b) continue;
      const score = similarity(a, b);
      if (score >= threshold) {
        pairs.push({
          left: items[left].story_id || items[left].id,
          right: items[right].story_id || items[right].id,
          score: Number(score.toFixed(3)),
          left_value: a,
          right_value: b
        });
      }
    }
  }
  return pairs;
}

function phraseHits(items, phrases) {
  const hits = [];
  for (const phrase of phrases) {
    for (const item of items) {
      for (const field of FIELDS) {
        const value = String(item[field] || '');
        if (value.includes(phrase)) hits.push({ phrase, story_id: item.story_id || item.id, field, value });
      }
    }
  }
  return hits;
}

function missingSpecificTerms(items) {
  const missing = [];
  for (const item of items) {
    const original = item.raw_item?.original_title || item.original_title || '';
    const title = item.zh_title || item.title || '';
    for (const spec of SPECIFIC_TERMS) {
      if (!spec.pattern.test(original)) continue;
      if (!spec.terms.some((term) => title.toLowerCase().includes(term.toLowerCase()))) {
        missing.push({ story_id: item.story_id || item.id, original_title: original, title, expected_terms: spec.terms });
      }
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
    const titlePairs = nearDuplicates(group, 'zh_title', 0.58);
    if (!titlePairs.length) continue;
    const [source, category] = key.split('::');
    clusters.push({ source, category, pairs: titlePairs });
  }
  return clusters;
}

function main() {
  const latest = latestEditionId();
  const content = readJson(resolve(ROOT, `data/${latest}/content.json`));
  const items = Array.isArray(content.stories) ? content.stories : (content.edition_items || []);
  const duplicate = Object.fromEntries(FIELDS.map((field) => [field, exactDuplicates(items, field)]));
  const near = Object.fromEntries(FIELDS.map((field) => [field, nearDuplicates(items, field, THRESHOLDS[field])]));
  const generic = phraseHits(items, GENERIC_PHRASES);
  const patch = phraseHits(items, PATCH_PHRASES);
  const missingTerms = missingSpecificTerms(items);
  const clusters = sourceCategoryTemplateClusters(items);
  const issues = [];
  for (const [field, groups] of Object.entries(duplicate)) if (groups.length) issues.push(`${field} exact duplicates`);
  for (const [field, groups] of Object.entries(near)) if (groups.length) issues.push(`${field} near duplicates`);
  if (generic.length) issues.push('generic template phrases found');
  if (patch.length) issues.push('patch phrases found');
  if (missingTerms.length) issues.push('specific terms missing from zh_title');
  if (clusters.length) issues.push('source/category template clusters found');

  const check = {
    step: '35-U4-B',
    status: issues.length ? 'semantic_copy_blocked' : 'semantic_copy_ready',
    qa_passed: issues.length === 0,
    latest_edition_id: latest,
    stories_checked: items.length,
    duplicate_title_groups: duplicate.zh_title,
    near_duplicate_title_groups: near.zh_title,
    duplicate_summary_groups: duplicate.zh_summary,
    near_duplicate_summary_groups: near.zh_summary,
    duplicate_why_it_matters_groups: duplicate.why_it_matters,
    near_duplicate_why_it_matters_groups: near.why_it_matters,
    duplicate_janet_take_groups: duplicate.janet_take,
    near_duplicate_janet_take_groups: near.janet_take,
    duplicate_watch_next_groups: duplicate.watch_next,
    near_duplicate_watch_next_groups: near.watch_next,
    generic_template_phrases_found: generic,
    patch_phrases_found: patch,
    source_category_template_clusters: clusters,
    missing_specific_terms: missingTerms,
    issues,
    warnings: []
  };
  writeFileSync(OUT, `${JSON.stringify(check, null, 2)}\n`);
  console.log(`semantic copy status: ${check.status}`);
  if (issues.length) process.exit(1);
}

main();
