import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = process.cwd();
const CHECK_PATH = resolve(ROOT, 'data/homepage-assembly-check.json');
const FORBIDDEN = [
  '围绕商业动作',
  '放出一个新信号',
  '给出了一条关于商业动作的新信号',
  '不是口号',
  '今天具体新闻里能点开的变化',
  '看源站是否给出后续细节'
];

function readJson(path, fallback = null) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return fallback;
  }
}

function latestEditionId() {
  const manifest = readJson(resolve(ROOT, 'data/MANIFEST.json'), []);
  return Array.isArray(manifest) ? manifest[0] : manifest?.items?.[0] || manifest?.latest || '';
}

function duplicateValues(items, field) {
  const counts = new Map();
  for (const item of items) {
    const value = String(item?.[field] || '').trim();
    if (!value) continue;
    counts.set(value, (counts.get(value) || 0) + 1);
  }
  return [...counts.entries()].filter(([, count]) => count > 1).map(([value, count]) => ({ value, count }));
}

function duplicateIds(items) {
  return duplicateValues(items, 'story_id');
}

function main() {
  const latest = latestEditionId();
  const contentPath = resolve(ROOT, `data/${latest}/content.json`);
  const summaryPath = resolve(ROOT, `data/${latest}/news-summary.json`);
  const outputPath = resolve(ROOT, `data/${latest}/output.html`);
  const content = readJson(contentPath, {});
  const summary = readJson(summaryPath, {});
  const output = existsSync(outputPath) ? readFileSync(outputPath, 'utf8') : '';
  const homepageItems = Array.isArray(content.homepage_items) ? content.homepage_items : [];
  const signalMap = Array.isArray(content.signal_map) ? content.signal_map : [];
  const compactNews = Array.isArray(content.compact_news) ? content.compact_news : [];
  const leadId = content.lead_story_id || homepageItems.find((item) => item.role === 'lead')?.story_id || '';
  const signalIds = signalMap.map((item) => item.story_id).filter(Boolean);
  const compactIds = compactNews.map((item) => item.id || item.story_id).filter(Boolean);
  const issues = [];
  const warnings = [];

  const homepageDuplicates = duplicateIds(homepageItems);
  const signalDuplicates = duplicateValues(signalMap, 'story_id');
  const compactDuplicates = duplicateValues(compactNews.map((item) => ({ story_id: item.id || item.story_id })), 'story_id');
  const repeatedFields = {
    summary: duplicateValues(homepageItems, 'summary'),
    why_it_matters: duplicateValues(homepageItems, 'why_it_matters'),
    janet_take: duplicateValues(homepageItems, 'janet_take'),
    watch_next: duplicateValues(homepageItems, 'watch_next')
  };

  if (!latest) issues.push('latest edition id missing');
  if (!homepageItems.length) issues.push('homepage_items missing');
  if (homepageDuplicates.length) issues.push(`homepage_items story_id duplicated: ${homepageDuplicates.map((item) => item.value).join(', ')}`);
  if (signalDuplicates.length) issues.push(`signal_map story_id duplicated: ${signalDuplicates.map((item) => item.value).join(', ')}`);
  if (compactDuplicates.length) issues.push(`compact_news story_id duplicated: ${compactDuplicates.map((item) => item.value).join(', ')}`);
  if (leadId && signalIds.includes(leadId)) issues.push('lead story repeats in signal_map');
  if (leadId && compactIds.includes(leadId)) issues.push('lead story repeats in compact_news');
  for (const id of signalIds) {
    if (compactIds.includes(id)) issues.push(`signal story repeats in compact_news: ${id}`);
  }
  for (const [field, duplicates] of Object.entries(repeatedFields)) {
    if (duplicates.length) issues.push(`${field} duplicated: ${duplicates.map((item) => item.value).join(' | ')}`);
  }

  const searchable = [
    JSON.stringify(content),
    JSON.stringify(summary),
    output
  ].join('\n');
  const forbiddenFound = FORBIDDEN.filter((phrase) => searchable.includes(phrase));
  if (forbiddenFound.length) issues.push(`forbidden template copy remains: ${forbiddenFound.join(', ')}`);
  if (signalMap.length > 1 && new Set(signalIds).size !== signalIds.length) issues.push('signal_map does not use unique stories');
  if (signalMap.length > 3) warnings.push('signal_map has more than three items');

  const check = {
    step: '35-U1',
    status: issues.length ? 'homepage_assembly_blocked' : 'homepage_assembly_ready',
    qa_passed: issues.length === 0,
    checked_edition_id: latest,
    homepage_items_count: homepageItems.length,
    signal_map_count: signalMap.length,
    compact_news_count: compactNews.length,
    homepage_story_ids_unique: homepageDuplicates.length === 0,
    lead_unique_across_homepage: !(signalIds.includes(leadId) || compactIds.includes(leadId)),
    signal_story_ids_unique: signalDuplicates.length === 0,
    compact_story_ids_unique: compactDuplicates.length === 0,
    repeated_summary_count: repeatedFields.summary.length,
    repeated_why_it_matters_count: repeatedFields.why_it_matters.length,
    repeated_janet_take_count: repeatedFields.janet_take.length,
    repeated_watch_next_count: repeatedFields.watch_next.length,
    forbidden_template_copy_found: forbiddenFound,
    issues,
    warnings
  };
  writeFileSync(CHECK_PATH, `${JSON.stringify(check, null, 2)}\n`);
  console.log(`homepage assembly status: ${check.status}`);
  if (issues.length) process.exit(1);
}

main();
