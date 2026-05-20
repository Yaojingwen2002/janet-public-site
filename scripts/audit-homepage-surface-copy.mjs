import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = process.cwd();
const OUT = resolve(ROOT, 'data/homepage-surface-copy-audit.json');
const RECENT_LIMIT = 3;
const NEAR_DUPLICATE_THRESHOLD = 0.62;

const GENERIC_SURFACE_PHRASES = [
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

const DISPLAY_FIELD_DEFS = [
  ['title'],
  ['theme'],
  ['intro_text'],
  ['daily_thesis'],
  ['daily_title'],
  ['daily_brief'],
  ['daily_brief', 'daily_title'],
  ['daily_brief', 'daily_summary'],
  ['daily_brief', 'daily_judgment'],
  ['lead_story', 'title'],
  ['lead_story', 'summary'],
  ['lead_story', 'original_title'],
  ['cover', 'daily_title'],
  ['cover', 'cover_title'],
  ['cover', 'cover_summary'],
  ['cover', 'daily_judgment']
];

const ARRAY_FIELD_DEFS = [
  { key: 'modules', fields: ['module_title', 'module_summary'] },
  { key: 'signal_map', fields: ['label', 'summary', 'story_title'] },
  { key: 'compact_news', fields: ['title', 'summary', 'why_it_matters', 'janet_take', 'watch_next', 'original_title'] },
  { key: 'compact_articles', fields: ['title', 'summary', 'why_it_matters', 'janet_take', 'watch_next', 'original_title'] },
  { key: 'homepage_items', fields: ['title', 'summary', 'why_it_matters', 'janet_take', 'watch_next', 'original_title'] },
  { key: 'modules.items', fields: ['title', 'summary', 'why_it_matters', 'janet_take', 'watch_next', 'original_title'] }
];

const QA_FILES = [
  '.github/scripts/qa-daily-news-output.mjs',
  'scripts/qa-main-ux.mjs',
  'scripts/qa-section-hydration.mjs',
  'scripts/qa-homepage-assembly.mjs',
  'scripts/qa-homepage-surface-copy.mjs',
  'scripts/qa-semantic-copy.mjs',
  'scripts/qa-editorial-architecture.mjs',
  'scripts/qa-live-source-stability.mjs',
  'scripts/qa-site-polish.mjs'
];

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function readText(path) {
  return existsSync(path) ? readFileSync(path, 'utf8') : '';
}

function latestEntries() {
  const manifest = readJson(resolve(ROOT, 'data/MANIFEST.json'));
  if (Array.isArray(manifest)) return manifest;
  if (Array.isArray(manifest?.items)) return manifest.items;
  return manifest?.latest ? [manifest.latest] : [];
}

function getPath(value, parts) {
  return parts.reduce((current, key) => (current && typeof current === 'object' ? current[key] : undefined), value);
}

function addField(fields, editionId, sourceFile, path, value) {
  if (value === undefined || value === null) return;
  if (typeof value !== 'string' && typeof value !== 'number') return;
  const text = String(value).trim();
  if (!text) return;
  fields.push({
    edition_id: editionId,
    source_file: sourceFile,
    path,
    field: path.split('.').at(-1).replace(/\[\d+\]/g, ''),
    text
  });
}

function collectSummaryDisplayFields(summary, editionId) {
  const fields = [];
  const sourceFile = `data/${editionId}/news-summary.json`;

  for (const parts of DISPLAY_FIELD_DEFS) {
    addField(fields, editionId, sourceFile, parts.join('.'), getPath(summary, parts));
  }

  for (const def of ARRAY_FIELD_DEFS) {
    if (def.key === 'modules.items') continue;
    const array = getPath(summary, def.key.split('.'));
    if (!Array.isArray(array)) continue;
    array.forEach((item, index) => {
      for (const field of def.fields) {
        addField(fields, editionId, sourceFile, `${def.key}[${index}].${field}`, item?.[field]);
      }
    });
  }

  if (Array.isArray(summary.modules)) {
    summary.modules.forEach((module, moduleIndex) => {
      const items = Array.isArray(module?.items) ? module.items : [];
      items.forEach((item, itemIndex) => {
        for (const field of ARRAY_FIELD_DEFS.find((def) => def.key === 'modules.items').fields) {
          addField(fields, editionId, sourceFile, `modules[${moduleIndex}].items[${itemIndex}].${field}`, item?.[field]);
        }
      });
    });
  }

  return fields;
}

function collectContentDisplayFields(content, editionId) {
  const fields = [];
  const sourceFile = `data/${editionId}/content.json`;
  for (const parts of [
    ['daily_title'],
    ['title'],
    ['theme'],
    ['intro_text'],
    ['daily_thesis'],
    ['cover', 'daily_title'],
    ['cover', 'cover_title'],
    ['cover', 'cover_summary'],
    ['cover', 'daily_judgment'],
    ['homepage', 'daily_title'],
    ['homepage', 'daily_summary'],
    ['homepage', 'daily_judgment']
  ]) {
    addField(fields, editionId, sourceFile, parts.join('.'), getPath(content, parts));
  }
  for (const def of ARRAY_FIELD_DEFS) {
    if (def.key === 'modules.items') continue;
    const array = getPath(content, def.key.split('.'));
    if (!Array.isArray(array)) continue;
    array.forEach((item, index) => {
      for (const field of def.fields) {
        addField(fields, editionId, sourceFile, `${def.key}[${index}].${field}`, item?.[field]);
      }
    });
  }
  return fields;
}

function normalizeText(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[，。！？、：；,.!?;:"'“”‘’()[\]{}<>《》/\s]+/g, '')
    .trim();
}

function bigrams(text) {
  const normalized = normalizeText(text);
  const chars = [...normalized];
  if (!chars.length) return new Set();
  if (chars.length === 1) return new Set(chars);
  const output = new Set();
  for (let index = 0; index < chars.length - 1; index += 1) output.add(chars[index] + chars[index + 1]);
  return output;
}

function jaccard(left, right) {
  const a = bigrams(left);
  const b = bigrams(right);
  if (!a.size && !b.size) return 0;
  let intersection = 0;
  for (const item of a) if (b.has(item)) intersection += 1;
  return intersection / (a.size + b.size - intersection);
}

function slim(field) {
  return {
    edition_id: field.edition_id,
    source_file: field.source_file,
    path: field.path,
    text: field.text
  };
}

function duplicateGroups(fields) {
  const groups = new Map();
  for (const field of fields) {
    const key = normalizeText(field.text);
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(field);
  }
  return [...groups.values()]
    .filter((items) => items.length > 1)
    .map((items) => ({ text: items[0].text, count: items.length, items: items.map(slim) }));
}

function nearDuplicateGroups(fields) {
  const groups = [];
  for (let leftIndex = 0; leftIndex < fields.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < fields.length; rightIndex += 1) {
      const left = fields[leftIndex];
      const right = fields[rightIndex];
      if (normalizeText(left.text) === normalizeText(right.text)) continue;
      const score = jaccard(left.text, right.text);
      if (score >= NEAR_DUPLICATE_THRESHOLD) {
        groups.push({
          similarity: Number(score.toFixed(3)),
          item_a: slim(left),
          item_b: slim(right)
        });
      }
    }
  }
  return groups.sort((a, b) => b.similarity - a.similarity).slice(0, 50);
}

function genericPhraseFindings(fields, newsJs) {
  const findings = [];
  for (const phrase of GENERIC_SURFACE_PHRASES) {
    const hits = [];
    for (const field of fields) {
      if (field.text.includes(phrase)) hits.push(slim(field));
    }
    if (newsJs.includes(phrase)) {
      hits.push({ source_file: 'scripts/news.js', path: 'source', text: phrase });
    }
    if (hits.length) findings.push({ phrase, count: hits.length, hits });
  }
  return findings;
}

function newsJsUsage(newsJs) {
  const usage = new Set();
  const patterns = [
    /\bsummary\.([A-Za-z0-9_]+)/g,
    /\blead\.([A-Za-z0-9_]+)/g,
    /\bsignal\.([A-Za-z0-9_]+)/g,
    /\bitem\.([A-Za-z0-9_]+)/g,
    /\bpreview\.([A-Za-z0-9_]+)/g
  ];
  for (const pattern of patterns) {
    for (const match of newsJs.matchAll(pattern)) usage.add(match[0]);
  }
  return [...usage].sort();
}

function qaCorpus() {
  return QA_FILES.map((file) => readText(resolve(ROOT, file))).join('\n');
}

function coveredByQa(field, corpus) {
  const explicitPath = field.path.replace(/\[\d+\]/g, '');
  const exactTokens = [
    explicitPath,
    field.field,
    'daily_thesis',
    'intro_text',
    'cover_title',
    'cover_summary',
    'daily_judgment',
    'module_title',
    'module_summary',
    'signal_map',
    'compact_news'
  ];
  if (corpus.includes(explicitPath)) return true;
  if (['title', 'summary', 'why_it_matters', 'janet_take', 'watch_next'].includes(field.field)) {
    return corpus.includes(field.field) && /homepage|compact|signal|cover|module|lead/.test(field.path);
  }
  return exactTokens.includes(field.field) ? corpus.includes(field.field) : corpus.includes(field.field);
}

function fieldsNotCovered(fields, corpus) {
  const uncovered = [];
  const seen = new Set();
  for (const field of fields) {
    if (coveredByQa(field, corpus)) continue;
    const key = `${field.source_file}:${field.path}`;
    if (seen.has(key)) continue;
    seen.add(key);
    uncovered.push({
      source_file: field.source_file,
      path: field.path,
      field: field.field,
      sample: field.text.slice(0, 120)
    });
  }
  return uncovered;
}

function recentThreeAnalysis(entries) {
  const editionFields = entries.map((editionId) => {
    const summaryPath = resolve(ROOT, `data/${editionId}/news-summary.json`);
    if (!existsSync(summaryPath)) return { edition_id: editionId, fields: [] };
    return { edition_id: editionId, fields: collectSummaryDisplayFields(readJson(summaryPath), editionId) };
  });
  const topLevelFields = editionFields.flatMap(({ edition_id, fields }) => fields
    .filter((field) => ['title', 'theme', 'intro_text', 'daily_thesis'].includes(field.path))
    .map((field) => ({ ...field, edition_id })));
  const watchFields = editionFields.flatMap(({ fields }) => fields.filter((field) => field.path.endsWith('.watch_next')));
  const moduleFields = editionFields.flatMap(({ fields }) => fields.filter((field) => field.path.includes('modules') && /module_(title|summary)$/.test(field.path)));

  return {
    editions_checked: entries,
    title_theme_duplicates: duplicateGroups(topLevelFields.filter((field) => ['title', 'theme'].includes(field.path))),
    title_theme_near_duplicates: nearDuplicateGroups(topLevelFields.filter((field) => ['title', 'theme'].includes(field.path))),
    intro_daily_thesis_near_duplicates: nearDuplicateGroups(topLevelFields.filter((field) => ['intro_text', 'daily_thesis'].includes(field.path))),
    module_near_duplicates: nearDuplicateGroups(moduleFields),
    watch_next_near_duplicates: nearDuplicateGroups(watchFields),
    template_like_intro_daily_thesis: topLevelFields
      .filter((field) => ['intro_text', 'daily_thesis'].includes(field.path))
      .filter((field) => /今天窗口里|摆在台面上|共同说明|日常环节里挤/.test(field.text))
      .map((field) => ({
        edition_id: field.edition_id,
        source_file: field.source_file,
        path: field.path,
        reason: 'repeated_intro_daily_thesis_skeleton'
      }))
  };
}

function main() {
  const entries = latestEntries();
  const latest = entries[0] || '';
  const latestSummary = readJson(resolve(ROOT, `data/${latest}/news-summary.json`));
  const latestContent = readJson(resolve(ROOT, `data/${latest}/content.json`));
  const newsJs = readText(resolve(ROOT, 'scripts/news.js'));
  const fields = [
    ...collectSummaryDisplayFields(latestSummary, latest),
    ...collectContentDisplayFields(latestContent, latest)
  ];
  const qaText = qaCorpus();
  const genericFindings = genericPhraseFindings(fields, newsJs);
  const duplicateDisplayTextGroups = duplicateGroups(fields);
  const nearDuplicateDisplayTextGroups = nearDuplicateGroups(fields);
  const uncovered = fieldsNotCovered(fields, qaText);
  const recent = recentThreeAnalysis(entries.slice(0, RECENT_LIMIT));
  const issues = [];
  const warnings = [];

  if (genericFindings.length) issues.push('Generic homepage surface phrases are present in display fields or scripts/news.js.');
  if (uncovered.length) warnings.push('Some homepage surface fields are not explicitly covered by existing QA.');
  if (recent.template_like_intro_daily_thesis.length) issues.push('Recent intro_text/daily_thesis fields still use a repeated surface-copy skeleton.');
  if (duplicateDisplayTextGroups.length) warnings.push('Duplicate homepage display text exists in the latest edition.');
  if (nearDuplicateDisplayTextGroups.length) warnings.push('Near-duplicate homepage display text exists in the latest edition.');

  const report = {
    step: '35-U6-A',
    status: 'homepage_surface_copy_audited',
    latest_edition_id: latest,
    display_fields_checked: fields.length,
    generic_surface_phrases_found: genericFindings,
    duplicate_display_text_groups: duplicateDisplayTextGroups,
    near_duplicate_display_text_groups: nearDuplicateDisplayTextGroups,
    fields_not_covered_by_qa: uncovered,
    news_js_field_usage: newsJsUsage(newsJs),
    recent_three_analysis: recent,
    issues,
    warnings
  };

  writeFileSync(OUT, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`homepage surface copy audit: ${report.status}`);
  console.log(`latest edition: ${latest}`);
  console.log(`display fields checked: ${fields.length}`);
  console.log(`generic phrases found: ${genericFindings.length}`);
  console.log(`fields not covered by QA: ${uncovered.length}`);
}

main();
