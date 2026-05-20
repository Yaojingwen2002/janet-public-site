#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { mkdirSync } from 'node:fs';

const ROOT = process.cwd();
const OUT = resolve(ROOT, 'data/homepage-surface-copy-check.json');
const FORBIDDEN_SURFACE_PHRASES = [
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
const GENERIC_TITLE_WORDS = ['开发者', '入口', '流程', '工具', '产品', '模型能力', '智能体'];
const META_FIELDS = new Set(['date', 'source', 'brand', 'edition_type', 'status', 'output_url', 'summary_url', 'content_url', 'url', 'visual', 'id', 'story_id', 'lead_story_id', 'category', 'role', 'original_title']);

function ensureDir(filePath) {
  mkdirSync(dirname(filePath), { recursive: true });
}

function readJson(path, fallback = null) {
  if (!existsSync(path)) return fallback;
  return JSON.parse(readFileSync(path, 'utf8'));
}

function readText(path) {
  return existsSync(path) ? readFileSync(path, 'utf8') : '';
}

function writeJson(path, data) {
  ensureDir(path);
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`);
}

function manifestEntries() {
  const manifest = readJson(resolve(ROOT, 'data/MANIFEST.json'), []);
  if (Array.isArray(manifest)) return manifest;
  if (Array.isArray(manifest?.items)) return manifest.items;
  return manifest?.latest ? [manifest.latest] : [];
}

function normalize(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[，。！？、：；,.!?;:"'“”‘’()[\]{}<>《》/\s]+/g, '')
    .trim();
}

function bigrams(text) {
  const chars = [...normalize(text)];
  if (!chars.length) return new Set();
  if (chars.length === 1) return new Set(chars);
  const out = new Set();
  for (let index = 0; index < chars.length - 1; index += 1) out.add(chars[index] + chars[index + 1]);
  return out;
}

function similarity(left, right) {
  const a = bigrams(left);
  const b = bigrams(right);
  if (!a.size && !b.size) return 0;
  let overlap = 0;
  for (const item of a) if (b.has(item)) overlap += 1;
  return overlap / (a.size + b.size - overlap);
}

function getLatest() {
  return manifestEntries()[0] || '';
}

function addField(fields, path, value, source = 'news-summary') {
  if (value === null || value === undefined) return;
  if (typeof value !== 'string' && typeof value !== 'number') return;
  const text = String(value).trim();
  if (!text) return;
  const field = path.split('.').at(-1).replace(/\[\d+\]/g, '');
  if (META_FIELDS.has(field)) return;
  if (/daily_brief\./.test(path) || /cover\.daily_title$/.test(path)) return;
  fields.push({ path, field, text, source });
}

function collectStrings(value, path, fields, source) {
  if (value === null || value === undefined) return;
  if (typeof value === 'string' || typeof value === 'number') {
    addField(fields, path, value, source);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectStrings(item, `${path}[${index}]`, fields, source));
    return;
  }
  if (typeof value !== 'object') return;
  Object.entries(value).forEach(([key, child]) => collectStrings(child, path ? `${path}.${key}` : key, fields, source));
}

function collectHomepageFields(summary, content) {
  const fields = [];
  for (const key of ['title', 'theme', 'intro_text', 'daily_thesis']) addField(fields, key, summary?.[key], 'news-summary');
  for (const key of ['daily_title', 'daily_summary', 'daily_judgment']) addField(fields, `daily_brief.${key}`, summary?.daily_brief?.[key], 'news-summary');
  for (const key of ['cover_title', 'cover_summary']) addField(fields, `cover.${key}`, summary?.cover?.[key], 'news-summary');

  (Array.isArray(summary?.modules) ? summary.modules : []).forEach((module, index) => {
    addField(fields, `modules[${index}].module_title`, module?.module_title, 'news-summary');
    addField(fields, `modules[${index}].module_summary`, module?.module_summary, 'news-summary');
  });
  (Array.isArray(summary?.signal_map) ? summary.signal_map : []).forEach((signal, index) => {
    addField(fields, `signal_map[${index}].label`, signal?.label || signal?.signal, 'news-summary');
    addField(fields, `signal_map[${index}].summary`, signal?.summary || signal?.janet_view, 'news-summary');
    addField(fields, `signal_map[${index}].story_title`, signal?.story_title, 'news-summary');
  });
  (Array.isArray(summary?.compact_news) ? summary.compact_news : []).forEach((item, index) => {
    for (const key of ['title', 'summary', 'why_it_matters', 'janet_take', 'watch_next']) {
      addField(fields, `compact_news[${index}].${key}`, item?.[key], 'news-summary');
    }
  });

  for (const key of ['title', 'theme', 'intro_text', 'daily_thesis']) addField(fields, key, content?.[key], 'content');
  for (const key of ['daily_title', 'daily_summary', 'daily_judgment']) addField(fields, `daily_brief.${key}`, content?.daily_brief?.[key], 'content');
  for (const key of ['cover_title', 'cover_summary']) addField(fields, `homepage.cover.${key}`, content?.homepage?.cover?.[key], 'content');
  (Array.isArray(content?.homepage?.modules) ? content.homepage.modules : []).forEach((module, index) => {
    addField(fields, `homepage.modules[${index}].module_title`, module?.module_title, 'content');
    addField(fields, `homepage.modules[${index}].module_summary`, module?.module_summary, 'content');
  });
  (Array.isArray(content?.homepage?.signal_cards) ? content.homepage.signal_cards : []).forEach((signal, index) => {
    addField(fields, `homepage.signal_cards[${index}].label`, signal?.label || signal?.signal, 'content');
    addField(fields, `homepage.signal_cards[${index}].summary`, signal?.summary || signal?.janet_view, 'content');
    addField(fields, `homepage.signal_cards[${index}].story_title`, signal?.story_title, 'content');
  });
  (Array.isArray(content?.homepage?.compact_news) ? content.homepage.compact_news : []).forEach((item, index) => {
    for (const key of ['title', 'summary', 'why_it_matters', 'janet_take', 'watch_next']) {
      addField(fields, `homepage.compact_news[${index}].${key}`, item?.[key], 'content');
    }
  });
  return fields;
}

function storyObjectMap(content) {
  const map = new Map();
  const stories = Array.isArray(content?.stories) ? content.stories : Array.isArray(content?.edition_items) ? content.edition_items : [];
  for (const story of stories) {
    const id = story.id || story.story_id;
    if (!id) continue;
    const objects = [
      story.story_fact?.concrete_object,
      ...(story.story_fact?.entities || []),
      ...(story.story_fact?.products || []),
      ...(story.story_facts || []).map((fact) => fact.value),
      story.title
    ].filter(Boolean);
    map.set(id, [...new Set(objects.map(String))]);
  }
  return map;
}

function containsAny(text, terms) {
  return terms.some((term) => term && String(text || '').includes(term));
}

function duplicateGroups(fields) {
  const groups = new Map();
  for (const field of fields.filter((item) => item.source === 'news-summary')) {
    if (field.text.length < 8) continue;
    const key = normalize(field.text);
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(field);
  }
  return [...groups.values()]
    .filter((items) => {
      const paths = new Set(items.map((item) => `${item.source}:${item.path}`));
      const logical = new Set(items.map((item) => item.path.replace(/^compact_articles/, 'compact_news')));
      return items.length > 1 && paths.size > 1 && logical.size > 1;
    })
    .map((items) => ({ text: items[0].text, count: items.length, items }));
}

function nearDuplicateGroups(fields, threshold = 0.78) {
  const groups = [];
  const comparable = fields.filter((item) => item.source === 'news-summary');
  for (let left = 0; left < comparable.length; left += 1) {
    for (let right = left + 1; right < comparable.length; right += 1) {
      const a = comparable[left];
      const b = comparable[right];
      if (a.text.length < 12 || b.text.length < 12) continue;
      if (normalize(a.text) === normalize(b.text)) continue;
      const score = similarity(a.text, b.text);
      if (score >= threshold) {
        groups.push({ similarity: Number(score.toFixed(3)), item_a: a, item_b: b });
      }
    }
  }
  return groups.slice(0, 60);
}

function genericTitle(text, concreteTerms) {
  const normalized = normalize(text);
  if (containsAny(text, concreteTerms)) return false;
  return GENERIC_TITLE_WORDS.some((word) => normalized.includes(normalize(word)));
}

function recentSurfaceSimilarity(entries) {
  const rows = entries.slice(0, 3).map((edition) => {
    const summary = readJson(resolve(ROOT, `data/${edition}/news-summary.json`), {});
    return {
      edition,
      daily_title: summary.daily_title || summary.daily_brief?.daily_title || summary.title || '',
      theme: summary.theme || '',
      daily_thesis: summary.daily_thesis || ''
    };
  });
  const issues = [];
  for (let left = 0; left < rows.length; left += 1) {
    for (let right = left + 1; right < rows.length; right += 1) {
      for (const field of ['daily_title', 'theme', 'daily_thesis']) {
        const score = similarity(rows[left][field], rows[right][field]);
        if (score >= (field === 'daily_thesis' ? 0.68 : 0.78)) {
          issues.push({
            field,
            similarity: Number(score.toFixed(3)),
            item_a: { edition: rows[left].edition, text: rows[left][field] },
            item_b: { edition: rows[right].edition, text: rows[right][field] }
          });
        }
      }
    }
  }
  return issues;
}

function main() {
  const issues = [];
  const warnings = [];
  const latest = getLatest();
  const summary = readJson(resolve(ROOT, `data/${latest}/news-summary.json`), {});
  const content = readJson(resolve(ROOT, `data/${latest}/content.json`), {});
  const newsJs = readText(resolve(ROOT, 'scripts/news.js'));
  const fields = collectHomepageFields(summary, content);
  const objectMap = storyObjectMap(content);
  const allObjects = [...new Set([...objectMap.values()].flat())].filter((term) => term && term.length >= 2);
  const forbiddenFound = [];

  for (const phrase of FORBIDDEN_SURFACE_PHRASES) {
    const hits = fields.filter((field) => field.text.includes(phrase));
    if (newsJs.includes(phrase)) hits.push({ source: 'scripts/news.js', path: 'source', field: 'source', text: phrase });
    if (hits.length) forbiddenFound.push({ phrase, count: hits.length, hits });
  }
  if (forbiddenFound.length) issues.push('forbidden surface phrases found');

  const title = summary.title || '';
  const theme = summary.theme || '';
  const dailyTitle = summary.daily_title || summary.daily_brief?.daily_title || title;
  const dailyThesis = summary.daily_thesis || '';
  if (title && theme && title === theme && genericTitle(title, allObjects)) issues.push('title and theme are identical generic text');
  if (!containsAny(dailyTitle, allObjects)) issues.push('daily title lacks a concrete object');
  if (!containsAny(dailyThesis, allObjects)) issues.push('daily_thesis lacks a concrete object');
  if (genericTitle(dailyTitle, allObjects)) issues.push('daily title is generic');

  const leadId = summary.cover?.lead_story_id || content.cover?.lead_story_id || summary.lead_story?.id || summary.lead_story?.story_id || content.lead_story_id;
  const leadObjects = objectMap.get(leadId) || [];
  const coverTitle = summary.cover?.cover_title || content.cover?.cover_title || '';
  const coverSummary = summary.cover?.cover_summary || content.cover?.cover_summary || '';
  if (coverTitle && !containsAny(coverTitle, leadObjects)) issues.push('cover_title lacks lead story concrete object');
  if (coverSummary && !containsAny(coverSummary, leadObjects)) issues.push('cover_summary lacks lead story concrete object');

  const modules = Array.isArray(summary.modules) ? summary.modules : Array.isArray(content.modules) ? content.modules : [];
  const moduleSpecificity = modules.map((module) => {
    const storyIds = Array.isArray(module.story_ids) ? module.story_ids : [];
    const terms = [...new Set(storyIds.flatMap((id) => objectMap.get(id) || []))];
    const titleOk = containsAny(module.module_title || '', terms);
    const summaryOk = containsAny(module.module_summary || '', terms);
    if (!titleOk) issues.push(`module_title lacks module concrete object: ${module.module_id || module.module_title}`);
    if (!summaryOk) issues.push(`module_summary lacks module concrete object: ${module.module_id || module.module_title}`);
    return {
      module_id: module.module_id || '',
      module_title: module.module_title || '',
      story_ids: storyIds,
      concrete_objects: terms,
      title_ok: titleOk,
      summary_ok: summaryOk
    };
  });
  if (modules.length < 2) warnings.push('module count below 2');

  const duplicateDisplayTextGroups = duplicateGroups(fields);
  const nearDuplicateDisplayTextGroups = nearDuplicateGroups(fields);
  if (duplicateDisplayTextGroups.length) issues.push('duplicate homepage display text found');
  const watchNear = nearDuplicateDisplayTextGroups.filter((group) => group.item_a.path.endsWith('watch_next') || group.item_b.path.endsWith('watch_next'));
  if (watchNear.length) issues.push('watch_next surface text is highly similar');

  const crossEditionSurfaceSimilarity = recentSurfaceSimilarity(manifestEntries());
  if (crossEditionSurfaceSimilarity.length) issues.push('recent surface copy is highly similar across editions');

  const result = {
    step: '35-U6-B',
    status: issues.length ? 'homepage_surface_copy_blocked' : 'homepage_surface_copy_ready',
    qa_passed: issues.length === 0,
    latest_edition_id: latest,
    display_fields_checked: fields.length,
    forbidden_surface_phrases_found: forbiddenFound,
    duplicate_display_text_groups: duplicateDisplayTextGroups,
    near_duplicate_display_text_groups: nearDuplicateDisplayTextGroups,
    daily_title_specificity: {
      value: dailyTitle,
      concrete_objects: allObjects,
      contains_concrete_object: containsAny(dailyTitle, allObjects),
      generic: genericTitle(dailyTitle, allObjects)
    },
    theme_specificity: {
      value: theme,
      equals_title: title === theme,
      contains_concrete_object: containsAny(theme, allObjects),
      generic: genericTitle(theme, allObjects)
    },
    daily_thesis_specificity: {
      value: dailyThesis,
      contains_concrete_object: containsAny(dailyThesis, allObjects)
    },
    cover_specificity: {
      lead_story_id: leadId || '',
      concrete_objects: leadObjects,
      cover_title: coverTitle,
      cover_summary: coverSummary,
      title_ok: !coverTitle || containsAny(coverTitle, leadObjects),
      summary_ok: !coverSummary || containsAny(coverSummary, leadObjects)
    },
    module_specificity: moduleSpecificity,
    cross_edition_surface_similarity: crossEditionSurfaceSimilarity,
    issues,
    warnings
  };

  writeJson(OUT, result);
  console.log(`homepage surface copy status: ${result.status}`);
  if (issues.length) {
    for (const issue of issues) console.error(`::error title=Homepage Surface Copy QA Failed::${issue}`);
    process.exit(1);
  }
}

main();
