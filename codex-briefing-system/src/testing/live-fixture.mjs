import {createHash} from 'node:crypto';
import {buildNarration} from '../narration.mjs';

export function liveFixture() {
  const date = '2026-11-10';
  const content = {
    date, vol: '406', cover: {title: 'test', subtitle: 'test'}, intro_text: 'intro', trend: 'trend',
    sections: Object.fromEntries(Object.entries({news: 5, models: 4, insights: 4, insights2: 3, tools: 1}).map(([key, count]) =>
      [key, {items: Array.from({length: count}, (_, index) => ({
        title: key + index, body: 'full body ' + index, janet_take: 'full take ' + index,
        source: 'source', url: 'https://example.org/' + key + index, image: 'images/' + key + '-' + index + '.png'
      }))}]))
  };
  const script = buildNarration(content), audio = Buffer.alloc(120000);
  audio.write('ftyp', 4);
  const manifest = {
    date, item_count: 17, content_sha256: script.content_sha256,
    audio_sha256: createHash('sha256').update(audio).digest('hex'), duration: 600,
    chapters: script.segments.map((segment, index) => ({...segment, start: index * 30, duration: 30}))
  };
  const prefix = 'data/' + date + '/';
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jB9sAAAAASUVORK5CYII=', 'base64');
  const files = new Map([
    [prefix + 'content.json', JSON.stringify(content)],
    [prefix + 'narration.json', JSON.stringify(manifest)],
    [prefix + 'narration.txt', script.segments.map(segment => segment.text).join('\n\n') + '\n'],
    [prefix + 'narration.m4a', audio],
    ['data/news-index.json', JSON.stringify({latest_edition_id: date, editions: [{edition_id: date}]})]
  ]);
  const fetcher = async url => {
    const path = new URL(url).pathname.slice(1);
    if (files.get(path) === null) return new Response('missing', {status: 404});
    const escape=value=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
    if(path===prefix+'output.html'&&!files.has(path))return new Response('<script src="scripts/briefing-audio.js"></script>'+[content.intro_text,content.trend,...Object.values(content.sections).flatMap(section=>section.items.flatMap(item=>[item.title,item.body,item.janet_take]))].map(value=>'<p>'+escape(value)+'</p>').join(''));
    const fallback = /\/(?:images\/[^/]+|cover)\.png$/.test(path) ? png : '<script src="scripts/briefing-audio.js"></script>';
    return new Response(files.has(path) ? files.get(path) : fallback);
  };
  return {date, content, files, fetcher, prefix, manifest};
}
