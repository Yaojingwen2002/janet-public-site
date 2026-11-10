import assert from 'node:assert/strict';import test from 'node:test';
import {feedItems,normalizeCandidates,dedupeCandidates} from './collect-candidates.mjs';
import {inspectLive} from './inspect-live-briefing.mjs';
import {liveFixture as fixture} from './testing/live-fixture.mjs';
import {dueBriefingDate,validBriefingDate} from './verification-contract.mjs';
const source={id:'test',name:'Test',home:'https://example.org',channel:'official',tier:'primary'},date='2026-11-10';
test('hard window includes 08:01 and excludes old timestamps, date-only records require review',()=>{const rows=normalizeCandidates([{title:'start',url:'/a',published_at:'2026-11-09T00:01:00Z'},{title:'old',url:'/b',published_at:'2026-11-08T23:59:00Z'},{title:'day',url:'/c',published_at:'2026-11-09'}],source,date);assert.deepEqual(rows.map(x=>[x.title,x.time_status]),[['start','in_window'],['day','needs_time_review']]);});
test('updated-only feed records never become claimed first-publication times',()=>{const [x]=feedItems('<feed><entry><title>old post</title><link href="https://example.org/a"/><updated>2026-11-09T12:00:00Z</updated></entry></feed>');assert.equal(x.published_at,'');assert.equal(normalizeCandidates([x],source,date)[0].time_status,'needs_time_review');});
test('tracking links and release aliases cannot inflate candidate counts',()=>{const rows=normalizeCandidates([{title:'a',url:'/a?utm_source=x',published_at:'2026-11-09T12:00:00Z'},{title:'a',url:'/a#top',published_at:'2026-11-09T12:00:00Z'}],source,date);assert.equal(dedupeCandidates(rows).length,1);assert.equal(dedupeCandidates([{...rows[0],event_key:'repo@1.0'},{...rows[1],url:'https://example.org/stable',event_key:'repo@1.0'}]).length,1);});
test('complete live edition passes all 29 URL and full-text audio checks',async()=>{const f=fixture(),r=await inspectLive({date,base:'https://example.org/',fetcher:f.fetcher});assert.equal(r.ok,true);assert.equal(r.results.length,29);assert.equal(r.repair,'none');});
test('missing audio requests audio-only repair and preserves verified editorial content',async()=>{const f=fixture();f.files.set(f.prefix+'narration.m4a',null);const r=await inspectLive({date,base:'https://example.org/',fetcher:f.fetcher});assert.equal(r.status,'audio_incomplete');assert.equal(r.repair,'audio_only');});
test('a changed fact invalidates cached audio even when every file returns 200',async()=>{const f=fixture();f.content.sections.news.items[0].body='changed fact';f.files.set(f.prefix+'content.json',JSON.stringify(f.content));const r=await inspectLive({date,base:'https://example.org/',fetcher:f.fetcher});assert.equal(r.ok,false);assert(r.issues.includes('audio_stale'));});
test('missing images and an outdated index are deployment failures',async()=>{const f=fixture();f.files.set(f.prefix+'images/news-0.png',null);f.files.set('data/news-index.json',JSON.stringify({latest_edition_id:'2026-11-07',editions:[]}));const r=await inspectLive({date,base:'https://example.org/',fetcher:f.fetcher});assert.equal(r.repair,'review_deployment');assert(r.issues.includes('index_not_current'));});

test('audio connection failures request connectivity review rather than audio regeneration',async()=>{const f=fixture();const fetcher=async u=>{if(new URL(u).pathname.endsWith('/narration.m4a'))throw Error('connection timeout');return f.fetcher(u);};const r=await inspectLive({date,base:'https://example.org/',fetcher});assert.equal(r.status,'check_failed');assert.equal(r.repair,'review_connectivity');assert(!r.issues.includes('audio_stale'));});

test('the due date changes at 08:00 Taipei, independently of the host timezone', () => {
 assert.equal(dueBriefingDate('2026-11-09T23:59:59Z'), '2026-11-09');
 assert.equal(dueBriefingDate('2026-11-10T00:00:00Z'), '2026-11-10');
 assert.equal(validBriefingDate('2026-02-30'), false);
 assert.equal(validBriefingDate('2028-02-29'), true);
});
for (const [label, mutate] of [
 ['invalid volume object', c => {c.vol = {toString: null};}],
 ['invalid image object', c => {c.sections.news.items[0].image = {toString: null};}],
 ['null item', c => {c.sections.news.items[0] = null;}],
 ['unexpected section', c => {c.sections.extra = null;}],
 ['missing introduction', c => {delete c.intro_text;}],
 ['non-web original source', c => {c.sections.news.items[0].url = 'javascript:alert(1)';}],
 ['unsafe image path', c => {c.sections.news.items[0].image = '../private.png';}]
]) test('malformed editorial data is reported without crashing: ' + label, async () => {
 const f = fixture(); mutate(f.content); f.files.set(f.prefix + 'content.json', JSON.stringify(f.content));
 const result = await inspectLive({date, base: 'https://example.org/', fetcher: f.fetcher});
 assert.equal(result.status, 'invalid_content'); assert.equal(result.repair, 'review_content');
});
for (const chapters of [{}, [null], null]) test('malformed audio chapter data requests audio-only repair: ' + JSON.stringify(chapters), async () => {
 const f = fixture(); f.manifest.chapters = chapters;
 f.files.set(f.prefix + 'narration.json', JSON.stringify(f.manifest));
 const result = await inspectLive({date, base: 'https://example.org/', fetcher: f.fetcher});
 assert.equal(result.status, 'audio_incomplete'); assert.equal(result.repair, 'audio_only');
});
test('an HTML error page served with HTTP 200 is not accepted as a news image', async () => {
 const f = fixture(); f.files.set(f.prefix + 'images/news-0.png', '<html>not an image</html>');
 const result = await inspectLive({date, base: 'https://example.org/', fetcher: f.fetcher});
 assert.equal(result.status, 'deployment_incomplete');
 assert(result.issues.some(issue => issue.startsWith('image_file:')));
});
test('a stale HTML page cannot pass merely because JSON and audio are current', async () => {
 const f = fixture();
 f.files.set(f.prefix + 'output.html', '<script src="scripts/briefing-audio.js"></script><p>old edition</p>');
 const result = await inspectLive({date, base: 'https://example.org/', fetcher: f.fetcher});
 assert.equal(result.status, 'deployment_incomplete');
 assert(result.issues.includes('output_text_mismatch:0:body'));
});
test('HTML escaping preserves literal facts during the live text comparison', async () => {
 const f = fixture(); f.content.sections.news.items[0].body = 'a < b & b > c';
 f.files.set(f.prefix + 'content.json', JSON.stringify(f.content));
 const result = await inspectLive({date, base: 'https://example.org/', fetcher: f.fetcher});
 assert(!result.issues.some(issue => issue.startsWith('output_text_mismatch:')));
});
