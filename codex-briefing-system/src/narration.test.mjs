import assert from 'node:assert/strict';
import test from 'node:test';
import { buildNarration } from './narration.mjs';

const fixture = () => ({ date: '2026-11-05', vol: 401, cover: { title: '标题', subtitle: '副标题' }, intro_text: '完整导语。', trend: '完整趋势。', sections: Object.fromEntries([['news', 5], ['models', 4], ['insights', 4], ['insights2', 3], ['tools', 1]].map(([key, n]) => [key, { items: Array.from({ length: n }, (_, i) => ({ title: `${key}${i}`, source: '原始来源', body: `完整事实${key}${i}，包含数字、限定条件。`, janet_take: `独立观点${key}${i}，紧接事实。`, url: 'https://example.com' })) }])) });

test('all 17 full stories and takes occur in order, alongside intro and trend', () => {
  const content = fixture(), script = buildNarration(content);
  assert.equal(script.item_count, 17);
  assert.equal(script.segments.length, 20);
  assert.ok(script.segments[0].text.includes(content.intro_text));
  assert.ok(script.segments[1].text.includes(content.trend));
  for (const [key, group] of Object.entries(content.sections)) group.items.forEach((item, i) => {
    const text = script.segments.find(s => s.id === `${key}-${i}`).text;
    assert.ok(text.includes(item.title));
    assert.ok(text.includes(item.body));
    assert.ok(text.indexOf(item.janet_take) > text.indexOf(item.body));
  });
});

test('a single changed fact invalidates the previously generated audio manifest', () => {
  const content = fixture(), original = buildNarration(content).content_sha256;
  content.sections.news.items[0].body += '修正后的数字。';
  assert.notEqual(buildNarration(content).content_sha256, original);
});
