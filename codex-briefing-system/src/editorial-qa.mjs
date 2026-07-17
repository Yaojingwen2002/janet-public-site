import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export const EDITORIAL_QA_START_DATE = '2026-07-18';

const SECTION_COUNTS = {
  news: 5,
  models: 4,
  insights: 4,
  insights2: 3,
  tools: 1
};

const EXPECTED_SLOTS = Object.entries(SECTION_COUNTS).flatMap(([section, count]) =>
  Array.from({ length: count }, (_, index) => `${section}[${index}]`)
);

const DIRECTIVE_RE = /(应该|必须|需要|建议|务必|别(?:再|只|急|忘|把|看|信|学|跟|被|让|拿|用)|不要再|不要|该(?:先|把|看|问|做|算|盯|查|用|学|等)|先(?:把|看|算|想|问|做|查|盯|搞|学|用|等))/;
const TAKE_LABEL_RE = /^(破防点|槽点|搞钱)[:：]/;

function textLength(value) {
  return [...String(value || '').trim()].length;
}

function previousDates(dateString, days = 5) {
  const [year, month, day] = String(dateString).split('-').map(Number);
  const base = Date.UTC(year, month - 1, day);
  return Array.from({ length: days }, (_, index) =>
    new Date(base - (index + 1) * 86400000).toISOString().slice(0, 10)
  );
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

function collectTakes(content) {
  return Object.values(content?.sections || {}).flatMap((section) =>
    (section?.items || []).map((item) => String(item?.janet_take || '').trim()).filter(Boolean)
  );
}

function sentenceCount(text) {
  return String(text || '')
    .split(/[。！？!?]\s*/)
    .map((part) => part.trim())
    .filter(Boolean).length;
}

export function normalizeEditorialText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[\s\p{P}\p{S}]+/gu, '');
}

export function textSimilarity(left, right, width = 3) {
  const a = normalizeEditorialText(left);
  const b = normalizeEditorialText(right);
  if (!a || !b) return 0;
  if (a === b) return 1;

  const shingles = (text) => {
    if (text.length <= width) return new Set([text]);
    return new Set(Array.from({ length: text.length - width + 1 }, (_, index) => text.slice(index, index + width)));
  };

  const aSet = shingles(a);
  const bSet = shingles(b);
  let intersection = 0;
  for (const item of aSet) {
    if (bSet.has(item)) intersection += 1;
  }
  return intersection / (aSet.size + bSet.size - intersection);
}

export function validateEditorialPlan(plan, { date } = {}) {
  const issues = [];
  if (!plan || typeof plan !== 'object') return ['editorial_plan_not_object'];
  if (plan.date !== date) issues.push(`editorial_plan_date_mismatch:${plan.date || 'missing'}!=${date}`);

  const mode = plan.narrative_mode;
  if (!['threaded', 'constellation'].includes(mode)) {
    issues.push(`editorial_plan_invalid_narrative_mode:${mode || 'missing'}`);
  }
  if (textLength(plan.reader_promise) < 12) issues.push('editorial_plan_reader_promise_too_thin');

  const selected = Array.isArray(plan.selected_items) ? plan.selected_items : [];
  if (selected.length !== EXPECTED_SLOTS.length) {
    issues.push(`editorial_plan_selected_count:${selected.length}!=${EXPECTED_SLOTS.length}`);
  }

  const slots = selected.map((item) => String(item?.slot || ''));
  for (const expected of EXPECTED_SLOTS) {
    const count = slots.filter((slot) => slot === expected).length;
    if (count !== 1) issues.push(`editorial_plan_slot_count:${expected}:${count}`);
  }

  const eventItems = new Map();
  let focusCount = 0;
  for (const item of selected) {
    const slot = String(item?.slot || 'missing');
    const eventKey = String(item?.event_key || '').trim();
    const depth = String(item?.depth || '');
    if (!eventKey) {
      issues.push(`editorial_plan_missing_event_key:${slot}`);
      continue;
    }
    if (!['focus', 'brief', 'reference'].includes(depth)) {
      issues.push(`editorial_plan_invalid_depth:${slot}:${depth || 'missing'}`);
    }
    if (depth === 'focus') focusCount += 1;
    if (!eventItems.has(eventKey)) eventItems.set(eventKey, []);
    eventItems.get(eventKey).push(item);
  }
  if (focusCount < 3 || focusCount > 5) issues.push(`editorial_plan_focus_count:${focusCount}`);

  for (const [eventKey, items] of eventItems) {
    if (items.length > 2) issues.push(`editorial_plan_event_third_repeat:${eventKey}:${items.length}`);
    const fullCount = items.filter((item) => item.full_expansion === true).length;
    if (fullCount !== 1) issues.push(`editorial_plan_event_full_expansion_count:${eventKey}:${fullCount}`);
    if (items.length === 2) {
      const referenceCount = items.filter((item) => item.depth === 'reference' && item.full_expansion !== true).length;
      if (referenceCount !== 1) issues.push(`editorial_plan_event_reference_invalid:${eventKey}`);
    }
  }

  const rejected = Array.isArray(plan.rejected_items) ? plan.rejected_items : [];
  if (!rejected.length) issues.push('editorial_plan_missing_rejected_item');
  if (rejected.some((item) => !String(item?.event_key || '').trim() || textLength(item?.reason) < 4)) {
    issues.push('editorial_plan_rejected_item_incomplete');
  }

  if (mode === 'threaded') {
    if (textLength(plan.daily_question) < 10) issues.push('editorial_plan_daily_question_too_thin');
    const evidence = Array.isArray(plan.narrative_evidence) ? plan.narrative_evidence : [];
    const evidenceKeys = new Set(evidence.map((item) => String(item?.event_key || '').trim()).filter(Boolean));
    const answers = new Set(evidence.map((item) => normalizeEditorialText(item?.answer)).filter(Boolean));
    if (evidence.length < 3 || evidenceKeys.size < 3) issues.push('editorial_plan_narrative_evidence_too_thin');
    if (answers.size < 3) issues.push('editorial_plan_narrative_answers_not_distinct');
    if ([...evidenceKeys].some((eventKey) => !eventItems.has(eventKey))) {
      issues.push('editorial_plan_narrative_evidence_not_selected');
    }
    if (plan.headline_removal_test?.still_holds !== true) issues.push('editorial_plan_headline_removal_test_failed');
    if (textLength(plan.headline_removal_test?.reason) < 8) issues.push('editorial_plan_headline_removal_reason_too_thin');
    if (!evidenceKeys.has(String(plan.headline_removal_test?.removed_event_key || '').trim())) {
      issues.push('editorial_plan_headline_removal_event_not_in_evidence');
    }
  }

  if (mode === 'constellation' && textLength(plan.constellation_reason) < 16) {
    issues.push('editorial_plan_constellation_reason_too_thin');
  }

  return issues;
}

export function validateEditorialVoice(content) {
  const issues = [];
  const takes = collectTakes(content);
  if (takes.length !== EXPECTED_SLOTS.length) return issues;

  const lengths = takes.map(textLength);
  const longCount = lengths.filter((length) => length >= 105).length;
  const shortCount = lengths.filter((length) => length <= 85).length;
  const spread = Math.max(...lengths) - Math.min(...lengths);
  if (longCount < 3) issues.push(`janet_take_long_form_too_few:${longCount}<3`);
  if (shortCount < 3) issues.push(`janet_take_brief_form_too_few:${shortCount}<3`);
  if (spread < 45) issues.push(`janet_take_length_rhythm_too_flat:${spread}<45`);

  const directiveCount = takes.filter((take) => DIRECTIVE_RE.test(take)).length;
  if (directiveCount > 5) issues.push(`janet_take_directive_voice_overused:${directiveCount}>5`);

  const labeledCount = takes.filter((take) => TAKE_LABEL_RE.test(take)).length;
  if (labeledCount > 2) issues.push(`janet_take_labels_overused:${labeledCount}>2`);

  const twoSentenceCount = takes.filter((take) => sentenceCount(take) === 2).length;
  if (twoSentenceCount > 12) issues.push(`janet_take_two_sentence_rhythm_overused:${twoSentenceCount}>12`);

  return issues;
}

export function validateEditorialArtifacts(content, { date, rootPath }) {
  if (String(date) < EDITORIAL_QA_START_DATE) return [];
  const issues = validateEditorialVoice(content);
  const planPath = resolve(rootPath, 'runs', date, 'editorial-plan.json');
  if (!existsSync(planPath)) {
    issues.push('missing_editorial_plan');
    return issues;
  }

  const plan = readJson(planPath);
  if (!plan) {
    issues.push('invalid_editorial_plan_json');
    return issues;
  }
  issues.push(...validateEditorialPlan(plan, { date }));

  for (const previousDate of previousDates(date)) {
    const previousContent = readJson(resolve(rootPath, 'runs', previousDate, 'content.json'));
    if (previousContent) {
      const trendSimilarity = textSimilarity(content?.trend, previousContent?.trend);
      if (trendSimilarity >= 0.58) {
        issues.push(`trend_too_similar_to_recent:${previousDate}:${trendSimilarity.toFixed(2)}`);
      }

      const previousTakes = collectTakes(previousContent);
      for (const [index, take] of collectTakes(content).entries()) {
        const highest = previousTakes.reduce((best, previousTake) => Math.max(best, textSimilarity(take, previousTake)), 0);
        if (highest >= 0.72) {
          issues.push(`janet_take_too_similar_to_recent:${index}:${previousDate}:${highest.toFixed(2)}`);
        }
      }
    }

    const previousPlan = readJson(resolve(rootPath, 'runs', previousDate, 'editorial-plan.json'));
    if (previousPlan && plan.narrative_mode === 'threaded' && previousPlan.narrative_mode === 'threaded') {
      const questionSimilarity = textSimilarity(plan.daily_question, previousPlan.daily_question);
      if (questionSimilarity >= 0.68) {
        issues.push(`daily_question_too_similar_to_recent:${previousDate}:${questionSimilarity.toFixed(2)}`);
      }
    }
  }

  return issues;
}
