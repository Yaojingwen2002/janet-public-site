import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const DATA_DIR = path.join(ROOT, 'data');

function readText(filePath, fallback = '') {
  try {
    return fs.readFileSync(path.join(ROOT, filePath), 'utf8');
  } catch {
    return fallback;
  }
}

function readJson(filePath, fallback = null) {
  try {
    return JSON.parse(readText(filePath));
  } catch {
    return fallback;
  }
}

function writeJson(filePath, data) {
  const abs = path.join(ROOT, filePath);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, `${JSON.stringify(data, null, 2)}\n`);
}

function manifestLatest() {
  const manifest = readJson('data/MANIFEST.json', []);
  if (Array.isArray(manifest)) return manifest[0] || '';
  return manifest.items?.[0] || manifest.latest || '';
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function isLocalVisual(visualPath) {
  return typeof visualPath === 'string' && visualPath.startsWith('assets/news-visuals/');
}

function visualSrc(value) {
  if (!value) return '';
  if (typeof value === 'string') return value;
  return value.src || value.local_path || '';
}

function fileExists(relPath) {
  return fs.existsSync(path.join(ROOT, relPath));
}

function visualFileText(relPath) {
  return isLocalVisual(relPath) ? readText(relPath) : '';
}

function classifyVisual(value) {
  const relPath = visualSrc(value);
  if (!relPath) return 'missing';
  if (value && typeof value === 'object' && value.mode) return value.mode;
  if (/^https?:\/\//.test(relPath)) return 'external_image';
  if (!isLocalVisual(relPath)) return 'local_other';
  const svg = visualFileText(relPath);
  if (/#18e299|JANET DAILY|visual/i.test(svg)) return 'legacy_green_svg';
  return 'generated_svg';
}

function looksLikePlaceholder(value) {
  const relPath = visualSrc(value);
  if (!relPath) return true;
  if (value && typeof value === 'object' && !/legacy|placeholder/i.test(value.mode || '')) return false;
  const text = visualFileText(relPath);
  return /placeholder|fallback|JANET DAILY/i.test(relPath + '\n' + text);
}

function storyFacts(item = {}) {
  const fact = item.story_fact || {};
  const terms = [
    fact.concrete_object,
    ...(fact.entities || []),
    ...(fact.products || []),
    item.source,
    item.title,
    item.original_title
  ].filter(Boolean).map((value) => String(value));
  return [...new Set(terms)];
}

function visualHasStoryTerms(item, visualPath) {
  const text = visualFileText(visualPath);
  if (!text) return false;
  const terms = storyFacts(item)
    .filter((term) => term.length >= 3)
    .map((term) => term.toLowerCase());
  const haystack = text.toLowerCase();
  return terms.some((term) => haystack.includes(term.toLowerCase()));
}

function recordVisual({ role, item, visualPath, sourceField }) {
  const src = visualSrc(visualPath);
  const visualType = classifyVisual(visualPath);
  const exists = src ? (src.startsWith('http') || fileExists(src)) : false;
  const hasStoryTerms = visualPath && typeof visualPath === 'object'
    ? Array.isArray(visualPath.matched_terms) && visualPath.matched_terms.length > 0
    : visualHasStoryTerms(item, src);
  const legacyGreen = visualType === 'legacy_green_svg';
  return {
    role,
    path: src || '',
    source_field: sourceField,
    source: item?.source || '',
    story_id: item?.story_id || item?.id || '',
    title: item?.title || item?.zh_title || '',
    original_title: item?.original_title || item?.raw_item?.original_title || '',
    category: item?.category || item?.primary_section || '',
    visual_type: visualType,
    exists,
    related_to_story_terms: hasStoryTerms,
    is_placeholder: looksLikePlaceholder(visualPath),
    is_legacy_green_visual: legacyGreen,
    matched_terms: visualPath && typeof visualPath === 'object'
      ? visualPath.matched_terms || []
      : (hasStoryTerms ? storyFacts(item).filter((term) => visualFileText(src).toLowerCase().includes(String(term).toLowerCase())) : [])
  };
}

function findGeneratorLocations(generatorText) {
  const targets = [
    'function visualTitle',
    'function visualPattern',
    'function visualSvg',
    'function writeNewsVisual',
    'writeNewsVisual(`${date}-lead.svg`',
    'writeNewsVisual(`${date}-signal-${index + 1}.svg`',
    'lead.visual ? `<img class="visual"',
    'item.visual ? `<img src="../../'
  ];
  const lines = generatorText.split('\n');
  return targets.flatMap((target) => lines
    .map((line, index) => ({ line, index: index + 1 }))
    .filter(({ line }) => line.includes(target))
    .map(({ line, index }) => ({
      file: '.github/scripts/daily-news-generator.mjs',
      line: index,
      match: target,
      snippet: line.trim().slice(0, 220)
    })));
}

function findFrontendImageFields(newsJsText) {
  const patterns = [
    'getNewsImageHtml',
    'item.image',
    'signal.visual',
    'lead.visual',
    'news-signal-visual-fallback',
    'safeLocalPath(signal.visual',
    'safeLocalPath(lead.visual'
  ];
  const lines = newsJsText.split('\n');
  return patterns.flatMap((pattern) => lines
    .map((line, index) => ({ line, index: index + 1 }))
    .filter(({ line }) => line.includes(pattern))
    .map(({ line, index }) => ({
      file: 'scripts/news.js',
      line: index,
      field_or_function: pattern,
      snippet: line.trim().slice(0, 220)
    })));
}

const latest = manifestLatest();
if (!latest) {
  throw new Error('Cannot resolve latest edition from data/MANIFEST.json');
}

const summary = readJson(`data/${latest}/news-summary.json`, {});
const content = readJson(`data/${latest}/content.json`, {});
const generatorText = readText('.github/scripts/daily-news-generator.mjs');
const newsJsText = readText('scripts/news.js');

const visibleVisuals = [];
if (summary.lead_story) {
  visibleVisuals.push(recordVisual({
    role: 'lead_story',
    item: summary.lead_story,
    visualPath: summary.lead_story.visual || '',
    sourceField: 'news-summary.lead_story.visual'
  }));
}

for (const [index, signal] of asArray(summary.signal_map).entries()) {
  visibleVisuals.push(recordVisual({
    role: `signal_map_${index + 1}`,
    item: signal,
    visualPath: signal.visual || '',
    sourceField: `news-summary.signal_map[${index}].visual`
  }));
}

for (const [index, item] of asArray(summary.compact_news).entries()) {
  if (item.visual || item.image) {
    visibleVisuals.push(recordVisual({
      role: `compact_news_${index + 1}`,
      item,
      visualPath: item.visual || item.image || '',
      sourceField: `news-summary.compact_news[${index}].visual`
    }));
  }
}

const currentVisualGenerators = findGeneratorLocations(generatorText);
const currentFrontendImageFields = findFrontendImageFields(newsJsText);
const legacyGreenVisuals = visibleVisuals.filter((visual) => visual.is_legacy_green_visual);
const placeholderVisuals = visibleVisuals.filter((visual) => visual.is_placeholder);
const withoutSourceImage = visibleVisuals
  .filter((visual) => visual.visual_type === 'legacy_green_svg' || visual.visual_type === 'generated_svg')
  .map((visual) => ({
    role: visual.role,
    story_id: visual.story_id,
    title: visual.title,
    source: visual.source,
    path: visual.path,
    reason: 'visible homepage image is locally generated; no source/official/open-license image is attached'
  }));
const withoutRelevance = visibleVisuals
  .filter((visual) => visual.is_legacy_green_visual || !visual.related_to_story_terms)
  .map((visual) => ({
    role: visual.role,
    story_id: visual.story_id,
    title: visual.title,
    source: visual.source,
    path: visual.path,
    visual_type: visual.visual_type,
    reason: visual.is_legacy_green_visual
      ? 'legacy green SVG uses shared abstract geometry rather than a story-specific visual resolver'
      : 'visual text/content does not clearly match story facts'
  }));

const compactWithoutVisual = asArray(summary.compact_news).filter((item) => !item.visual && !item.image).length;

const audit = {
  step: '35-U7-A',
  status: 'news_visuals_audited',
  latest_edition_id: latest,
  visuals_checked: visibleVisuals.length,
  legacy_green_visual_count: legacyGreenVisuals.length,
  placeholder_visual_count: placeholderVisuals.length,
  story_visuals_without_source_image: withoutSourceImage,
  story_visuals_without_relevance: withoutRelevance,
  current_visual_generators: currentVisualGenerators,
  current_frontend_image_fields: currentFrontendImageFields,
  current_homepage_visuals: visibleVisuals,
  recommended_visual_pipeline: [
    'source_image: RSS media:content/enclosure/image, Atom media, article og:image/twitter:image/schema.org image',
    'official_image: official blog/product/share images for OpenAI, Anthropic, Google AI, GitHub, Hugging Face, AWS, Microsoft, NVIDIA',
    'open_license_image: Wikimedia Commons or equivalent with license, credit, and imageinfo',
    'generated_story_svg: local story-specific SVG based on story_facts concrete_object/company/product/action/domain',
    'final_fallback: abstract but related local SVG, with legacy green placeholder disabled'
  ],
  issues: [
    ...(legacyGreenVisuals.length ? [`${legacyGreenVisuals.length} visible homepage visuals are legacy green generated SVGs.`] : []),
    ...(withoutSourceImage.length ? [`${withoutSourceImage.length} visible homepage visuals have no source/official/open-license image candidate.`] : [])
  ],
  warnings: [
    ...(compactWithoutVisual ? [`${compactWithoutVisual} compact news items have no visual field and currently render as text-only cards.`] : []),
    'This audit does not modify frontend rendering; it documents the current visual layer before resolver replacement.'
  ]
};

writeJson('data/news-visuals-audit.json', audit);
console.log(`news visuals audit status: ${audit.status}`);
console.log(`latest edition: ${latest}`);
console.log(`visible visuals checked: ${audit.visuals_checked}`);
console.log(`legacy green visuals: ${audit.legacy_green_visual_count}`);
console.log(`placeholder visuals: ${audit.placeholder_visual_count}`);
