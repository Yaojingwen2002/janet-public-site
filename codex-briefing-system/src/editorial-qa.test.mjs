import assert from 'node:assert/strict';
import test from 'node:test';
import { textSimilarity, validateEditorialPlan, validateEditorialVoice } from './editorial-qa.mjs';

const sectionCounts = { news: 5, models: 4, insights: 4, insights2: 3, tools: 1 };
const slots = Object.entries(sectionCounts).flatMap(([section, count]) =>
  Array.from({ length: count }, (_, index) => `${section}[${index}]`)
);

function makePlan() {
  return {
    date: '2026-07-18',
    narrative_mode: 'threaded',
    daily_question: '当模型开始替人执行工作，谁来承担失败的成本？',
    reader_promise: '看清自动执行背后的责任并没有一起自动化。',
    narrative_evidence: [
      { event_key: 'event-0', answer: '平台把审核写进产品入口。' },
      { event_key: 'event-1', answer: '企业把责任转回采购和管理者。' },
      { event_key: 'event-2', answer: '监管要求留下可追溯的责任链。' }
    ],
    headline_removal_test: {
      removed_event_key: 'event-0',
      still_holds: true,
      reason: '另外两个独立事件仍在回答责任由谁承担。'
    },
    constellation_reason: '',
    selected_items: slots.map((slot, index) => ({
      slot,
      event_key: `event-${index}`,
      depth: index < 3 ? 'focus' : 'brief',
      full_expansion: true
    })),
    rejected_items: [{ event_key: 'old-event', reason: '发布时间超出窗口' }]
  };
}

function makeContent(takes) {
  let index = 0;
  return {
    sections: Object.fromEntries(Object.entries(sectionCounts).map(([section, count]) => [
      section,
      { items: Array.from({ length: count }, () => ({ janet_take: takes[index++] })) }
    ]))
  };
}

test('valid editorial plan passes', () => {
  assert.deepEqual(validateEditorialPlan(makePlan(), { date: '2026-07-18' }), []);
});

test('editorial plan blocks a third telling of one event', () => {
  const plan = makePlan();
  plan.selected_items[1] = { ...plan.selected_items[1], event_key: 'event-0', depth: 'reference', full_expansion: false };
  plan.selected_items[2] = { ...plan.selected_items[2], event_key: 'event-0', depth: 'reference', full_expansion: false };
  const issues = validateEditorialPlan(plan, { date: '2026-07-18' });
  assert.ok(issues.some((issue) => issue.startsWith('editorial_plan_event_third_repeat:event-0')));
});

test('voice QA accepts visible length and rhythm changes', () => {
  const long = '这份合同最有意思的地方，不是金额本身，而是采购方终于把失败责任写进了交付条件。模型可以犯错，平台也可以甩锅，可一旦真实员工要拿它完成工作，最后签字的人仍然得知道哪些判断来自机器、哪些风险只能由自己承担。演示结束以后，责任不会跟着投影仪一起关掉。';
  const short = '价格降了，限制也写清了，这次可以先夸产品。';
  const medium = '市场会先记住演示效果，真正付费的团队却会追问失败后能不能复盘，这决定它是玩具还是工作工具。';
  const takes = slots.map((_, index) => index < 3 ? `${index}${long}` : index < 6 ? `${index}${short}` : `${index}${medium}`);
  assert.deepEqual(validateEditorialVoice(makeContent(takes)), []);
});

test('voice QA blocks an issue that keeps ordering the reader around', () => {
  const take = '你应该先把预算算清楚，再决定是否接入；模型的演示很漂亮，但账单和责任不会因为演示结束而消失。';
  const issues = validateEditorialVoice(makeContent(slots.map((_, index) => `${take}${index}`)));
  assert.ok(issues.some((issue) => issue.startsWith('janet_take_directive_voice_overused')));
});

test('text similarity catches lightly edited recent copy', () => {
  const left = '平台把审核写进产品入口，责任并没有随着自动化一起消失。';
  const right = '平台把审核写进产品入口，但责任并没有随着自动化一起消失。';
  assert.ok(textSimilarity(left, right) > 0.72);
});
