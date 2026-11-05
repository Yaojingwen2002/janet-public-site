import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
const source = readFileSync(new URL('../../scripts/briefing-audio.js', import.meta.url), 'utf8');
const base = 'https://example.com/janet-public-site/';
const manifest = { date: '2026-11-05', title: '完整晨报', item_count: 17, audio: 'narration.m4a', transcript: 'narration.txt', duration: 600, chapters: [{ title: '开场', start: 0 }, { title: '新闻与锐评', start: 60 }] };
const tick = () => new Promise(resolve => setTimeout(resolve, 5));
async function harness(t, { route = 'index.html', blocked = false, saved, direct = false, other = false } = {}) {
  const dom = new JSDOM(`<section data-briefing-audio ${direct ? 'data-content-url="content.json"' : ''}></section><script src="${base}scripts/briefing-audio.js"></script>`, { url: base + route, runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window, mount = w.document.querySelector('section'), urls = [];
  t.after(() => { w.dispatchEvent(new w.Event('pagehide')); w.close(); });
  Object.defineProperty(w.document, 'currentScript', { value: w.document.querySelector('script') });
  if (saved) w.sessionStorage.setItem('janet:briefing-audio:2026-11-05', JSON.stringify(saved));
  if (other) w.localStorage.setItem('janet:site-audio-owner:v1', JSON.stringify({ id: 'other-tab', updatedAt: Date.now() }));
  w.fetch = async url => { urls.push(String(url)); return { ok: true, json: async () => String(url).endsWith('news-index.json') ? { latest_edition_id: manifest.date, editions: [{ edition_id: manifest.date, content_url: `data/${manifest.date}/content.json` }] } : manifest }; };
  let paused = true, calls = 0;
  Object.defineProperty(w.HTMLMediaElement.prototype, 'paused', { get() { return paused; } });
  Object.defineProperty(w.HTMLMediaElement.prototype, 'duration', { get() { return 600; } });
  w.HTMLMediaElement.prototype.pause = function () { if (!paused) { paused = true; this.dispatchEvent(new w.Event('pause')); } };
  w.HTMLMediaElement.prototype.play = function () { calls++; if (blocked) return Promise.reject(new w.DOMException('User gesture required', 'NotAllowedError')); paused = false; this.dispatchEvent(new w.Event('playing')); return Promise.resolve(); };
  w.eval(source);
  for (let i = 0; i < 50 && !mount.querySelector('audio'); i++) await tick();
  await tick();
  const audio = mount.querySelector('audio'); assert.ok(audio);
  audio.dispatchEvent(new w.Event('loadedmetadata'));
  return { w, mount, audio, urls, calls: () => calls, allow: () => { blocked = false; } };
}

test('all entry points resolve the right edition and attempt playback', async t => {
  for (const config of [{ route: 'index.html' }, { route: 'news.html' }, { route: 'data/2026-11-05/output.html#daily-comments', direct: true }]) {
    const h = await harness(t, config);
    assert.equal(h.audio.src, base + 'data/2026-11-05/narration.m4a');
    assert.equal(h.mount.dataset.state, 'playing');
    assert.equal(h.calls(), 1);
  }
});

test('blocked autoplay is visible and a click starts; pause remains paused', async t => {
  const h = await harness(t, { blocked: true });
  assert.equal(h.mount.dataset.state, 'blocked');
  h.allow(); h.mount.querySelector('[data-voice-toggle]').click(); await tick();
  assert.equal(h.mount.dataset.state, 'playing');
  h.mount.querySelector('[data-voice-toggle]').click();
  assert.equal(h.audio.paused, true);
  h.w.document.body.click(); await tick();
  assert.equal(h.audio.paused, true);
});

test('restore, seek, chapter selection and speed controls use the same full recording', async t => {
  const h = await harness(t, { saved: { time: 120, rate: 1.25, paused: true } });
  assert.equal(h.calls(), 0); assert.equal(h.audio.currentTime, 120); assert.equal(h.audio.playbackRate, 1.25);
  const chapter = h.mount.querySelector('[data-voice-chapter]'); chapter.value = '1'; chapter.dispatchEvent(new h.w.Event('change'));
  assert.equal(h.audio.currentTime, 60);
  h.mount.querySelector('[data-voice-forward]').click(); assert.equal(h.audio.currentTime, 75);
  const seek = h.mount.querySelector('[data-voice-seek]'); seek.value = '240'; seek.dispatchEvent(new h.w.Event('input'));
  assert.equal(h.audio.currentTime, 240);
  const rate = h.mount.querySelector('[data-voice-rate]'); rate.value = '1.5'; rate.dispatchEvent(new h.w.Event('change'));
  assert.equal(h.audio.playbackRate, 1.5);
});

test('another live tab prevents unsolicited overlapping playback', async t => {
  const h = await harness(t, { other: true });
  assert.equal(h.calls(), 0); assert.equal(h.audio.paused, true);
  h.mount.querySelector('[data-voice-toggle]').click(); await tick();
  assert.equal(h.calls(), 1); assert.equal(h.audio.paused, false);
});
