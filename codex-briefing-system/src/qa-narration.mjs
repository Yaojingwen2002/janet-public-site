import { readFileSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { targetDateFromArg } from './lib.mjs';
import { buildNarration } from './narration.mjs';
const date = targetDateFromArg();
const root = resolve(new URL('..', import.meta.url).pathname, 'runs', date);
const content = JSON.parse(readFileSync(resolve(root, 'content.json')));
const expected = buildNarration(content);
const manifest = JSON.parse(readFileSync(resolve(root, 'narration.json')));
if (manifest.content_sha256 !== expected.content_sha256 || manifest.date !== date) throw new Error('stale_narration');
if (manifest.item_count !== 17 || manifest.chapters.length !== expected.segments.length) throw new Error('incomplete_narration');
let end = 0;
for (const [i, chapter] of manifest.chapters.entries()) {
  if (chapter.id !== expected.segments[i].id || chapter.text !== expected.segments[i].text) throw new Error(`narration_content_mismatch:${i}`);
  if (Math.abs(chapter.start - end) > .02 || chapter.duration <= 0) throw new Error(`invalid_chapter_timing:${i}`);
  end = chapter.start + chapter.duration;
}
if (Math.abs(end - manifest.duration) > 1 || manifest.duration < 300) throw new Error('truncated_audio');
const audio = readFileSync(resolve(root, manifest.audio));
if (statSync(resolve(root, manifest.audio)).size < 100000 || createHash('sha256').update(audio).digest('hex') !== manifest.audio_sha256) throw new Error('invalid_audio');
if (readFileSync(resolve(root, 'narration.txt'), 'utf8') !== expected.segments.map(s => s.text).join('\n\n') + '\n') throw new Error('transcript_mismatch');
console.log(`narration_qa_ready date=${date} items=17 chapters=${manifest.chapters.length} duration=${manifest.duration}s`);
