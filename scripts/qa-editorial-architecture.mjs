import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = process.cwd();
const OUT = resolve(ROOT, 'data/editorial-architecture-check.json');
const PATCH_PHRASES = ['第2个切面', '第3个切面', '第2个落点', '第3个落点', '对应到', '这条第', '第2个角度', '第3个角度'];
const GENERIC_OBJECTS = new Set(['智能体', 'AI 工具', '产品落点', '商业动作', '用户', '团队', '入口', '新动作', '工作流', '平台', '模型能力', '研究信号', '企业落地', '开发入口', '开源模型', 'AI']);
const GENERIC_ACTIONS = new Set(['更新', '追踪', '推向', '发布新动作', '继续', '露出', '发布']);
const GENERIC_COPY = ['更新智能体', '先看谁能用起来', '追踪AI 工具', '发布新动作', '追踪产品落点', '露出新落点', '它自己的用户、团队', '选型、评估或交付方式', '清晰功能、价格或开放边界', 'AI 热闹', '入口又被模型咬住', '不是普通更新'];
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

function duplicates(items, field) {
  const seen = new Map();
  for (const item of items) {
    const value = String(item?.[field] || '').trim();
    if (!value) continue;
    if (!seen.has(value)) seen.set(value, []);
    seen.get(value).push(item.story_id || item.id || item.module_id || value);
  }
  return [...seen.entries()].filter(([, ids]) => ids.length > 1).map(([value, ids]) => ({ value, ids }));
}

function hasSpecificTerm(story) {
  const concrete = story.story_fact?.concrete_object || '';
  const titleText = story.zh_title || story.title || '';
  if (concrete && titleText.toLowerCase().includes(String(concrete).toLowerCase())) return null;
  if (concrete && String(concrete).split(/\s+/).some((part) => part.length > 3 && titleText.toLowerCase().includes(part.toLowerCase()))) return null;
  const original = story.raw_item?.original_title || story.original_title || '';
  const title = titleText;
  for (const spec of SPECIFIC_TERMS) {
    if (!spec.pattern.test(original)) continue;
    if (!spec.terms.some((term) => title.toLowerCase().includes(term.toLowerCase()))) {
      return { story_id: story.id || story.story_id, original_title: original, zh_title: title, expected_terms: spec.terms };
    }
  }
  return null;
}

function main() {
  const latest = latestEditionId();
  const content = readJson(resolve(ROOT, `data/${latest}/content.json`));
  const summaries = [];
  const issues = [];
  const warnings = [];
  const rawItems = Array.isArray(content.raw_items) ? content.raw_items : [];
  const stories = Array.isArray(content.stories) ? content.stories : [];
  const modules = Array.isArray(content.modules) ? content.modules : [];
  const cover = content.cover || {};
  const homepage = content.homepage || {};
  const detail = content.detail || {};

  if (!rawItems.length) issues.push('raw_items missing');
  if (!stories.length) issues.push('stories missing');
  if (!modules.length) issues.push('modules missing');
  if (!cover.cover_title || !cover.cover_summary || !cover.daily_judgment || !cover.lead_story_id) issues.push('cover fields missing');
  if (!Array.isArray(detail.stories) || detail.stories.length !== stories.length) issues.push('detail.stories missing or out of sync');

  for (const item of rawItems) {
    for (const field of ['source', 'original_title', 'url', 'published_at', 'category']) {
      if (!item[field]) issues.push(`raw_item missing ${field}: ${item.original_title || item.url || '(unknown)'}`);
    }
  }
  for (const story of stories) {
    for (const field of ['zh_title', 'zh_summary', 'why_it_matters', 'janet_take', 'watch_next']) {
      if (!story[field]) issues.push(`story missing ${field}: ${story.id || story.story_id}`);
    }
    if (!Array.isArray(story.story_facts) || !story.story_facts.length) warnings.push(`story_facts empty: ${story.id || story.story_id}`);
    const fact = story.story_fact || {};
    const concrete = String(fact.concrete_object || '').trim();
    const action = String(fact.action || '').trim();
    const entities = Array.isArray(fact.entities) ? fact.entities : [];
    const source = String(story.source || '').toLowerCase();
    if (!concrete || GENERIC_OBJECTS.has(concrete) || GENERIC_OBJECTS.has(concrete.replace(/\s+/g, ''))) {
      issues.push(`generic concrete_object: ${story.id || story.story_id} ${concrete}`);
    }
    if (!entities.some((entity) => String(entity).toLowerCase() !== source && !GENERIC_OBJECTS.has(String(entity).trim()))) {
      issues.push(`entities missing or source-only: ${story.id || story.story_id}`);
    }
    if (!action || GENERIC_ACTIONS.has(action)) issues.push(`generic action: ${story.id || story.story_id} ${action}`);
    const missing = hasSpecificTerm(story);
    if (missing) issues.push(`specific term missing: ${JSON.stringify(missing)}`);
  }

  const duplicateStoryTitles = duplicates(stories, 'zh_title');
  const duplicateStorySummaries = duplicates(stories, 'zh_summary');
  if (duplicateStoryTitles.length) issues.push(`story title duplicates: ${JSON.stringify(duplicateStoryTitles)}`);
  if (duplicateStorySummaries.length) issues.push(`story summary duplicates: ${JSON.stringify(duplicateStorySummaries)}`);

  const storyTitles = new Set(stories.map((story) => story.zh_title || story.title).filter(Boolean));
  const storySummaries = new Set(stories.map((story) => story.zh_summary || story.summary).filter(Boolean));
  const storyTakes = new Set(stories.map((story) => story.janet_take).filter(Boolean));
  const moduleTitles = new Set(modules.map((module) => module.module_title).filter(Boolean));
  const moduleSummaries = new Set(modules.map((module) => module.module_summary).filter(Boolean));

  for (const module of modules) {
    if (!module.module_id || !module.module_title || !module.module_summary || !Array.isArray(module.story_ids) || !module.story_ids.length) {
      issues.push(`module incomplete: ${module.module_id || '(missing)'}`);
    }
    if (storyTitles.has(module.module_title)) issues.push(`module title equals story title: ${module.module_title}`);
    if (storySummaries.has(module.module_summary)) issues.push(`module summary equals story summary: ${module.module_id}`);
  }
  if (storyTitles.has(cover.cover_title) || moduleTitles.has(cover.cover_title)) issues.push('cover title duplicates story/module title');
  if (storySummaries.has(cover.cover_summary) || moduleSummaries.has(cover.cover_summary)) issues.push('cover summary duplicates story/module summary');
  if (storyTakes.has(cover.daily_judgment)) issues.push('daily_judgment duplicates story janet_take');

  const homepageTexts = [
    cover.cover_title,
    cover.cover_summary,
    cover.daily_judgment,
    ...(homepage.signal_cards || []).flatMap((item) => [item.label || item.signal, item.summary]),
    ...(homepage.compact_news || []).flatMap((item) => [item.title, item.summary]),
    ...(homepage.modules || []).flatMap((item) => [item.module_title, item.module_summary])
  ].filter(Boolean);
  const semanticCollisions = [];
  for (let left = 0; left < homepageTexts.length; left += 1) {
    for (let right = left + 1; right < homepageTexts.length; right += 1) {
      const score = similarity(homepageTexts[left], homepageTexts[right]);
      if (score >= 0.74) semanticCollisions.push({ left: homepageTexts[left], right: homepageTexts[right], score: Number(score.toFixed(3)) });
    }
  }
  if (semanticCollisions.length) issues.push(`homepage semantic collisions: ${JSON.stringify(semanticCollisions.slice(0, 10))}`);

  const manifest = readJson(resolve(ROOT, 'data/MANIFEST.json'));
  const recentIds = (Array.isArray(manifest) ? manifest : manifest.items || []).slice(0, 7);
  const currentTitles = [cover.daily_title, cover.cover_title, ...modules.map((module) => module.module_title)].filter(Boolean);
  for (const editionId of recentIds) {
    if (editionId === latest) continue;
    try {
      const previous = readJson(resolve(ROOT, `data/${editionId}/content.json`));
      const previousTitles = [
        previous.cover?.daily_title || previous.theme,
        previous.cover?.cover_title,
        ...(previous.modules || []).map((module) => module.module_title)
      ].filter(Boolean);
      for (const title of currentTitles) {
        for (const previousTitle of previousTitles) {
          const score = similarity(title, previousTitle);
          if (score >= 0.78) issues.push(`recent title too similar: ${title} ~= ${previousTitle} (${score.toFixed(3)})`);
        }
      }
    } catch {
      summaries.push(`skip missing previous edition: ${editionId}`);
    }
  }

  const serialized = JSON.stringify(content);
  const patchPhrasesFound = PATCH_PHRASES.filter((phrase) => serialized.includes(phrase));
  if (patchPhrasesFound.length) issues.push(`patch phrases found: ${patchPhrasesFound.join(', ')}`);
  const genericPhrasesFound = GENERIC_COPY.filter((phrase) => serialized.includes(phrase));
  if (genericPhrasesFound.length) issues.push(`generic copy found: ${genericPhrasesFound.join(', ')}`);

  const check = {
    step: '35-U4',
    status: issues.length ? 'editorial_architecture_blocked' : 'editorial_architecture_ready',
    qa_passed: issues.length === 0,
    latest_edition_id: latest,
    raw_items_count: rawItems.length,
    stories_count: stories.length,
    modules_count: modules.length,
    cover_present: Boolean(cover.cover_title && cover.cover_summary && cover.daily_judgment),
    homepage_present: Boolean(homepage.cover && Array.isArray(homepage.compact_news)),
    detail_present: Array.isArray(detail.stories),
    duplicate_story_title_count: duplicateStoryTitles.length,
    duplicate_story_summary_count: duplicateStorySummaries.length,
    homepage_semantic_collision_count: semanticCollisions.length,
    patch_phrases_found: patchPhrasesFound,
    generic_phrases_found: genericPhrasesFound,
    summaries,
    issues,
    warnings
  };
  writeFileSync(OUT, `${JSON.stringify(check, null, 2)}\n`);
  console.log(`editorial architecture status: ${check.status}`);
  if (issues.length) process.exit(1);
}

main();
