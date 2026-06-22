#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, extname, resolve } from 'node:path';
import { loadEnv, targetDateFromArg } from './lib.mjs';

const ROOT = resolve(new URL('..', import.meta.url).pathname);
const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36 JanetBriefingImageBot/1.0';
const MAX_HTML_BYTES = 1_500_000;
const MAX_IMAGE_BYTES = 8_000_000;
const MIN_IMAGE_BYTES = 1_200;
const IMAGE_CONCURRENCY = 4;
const SEARCH_CANDIDATE_LIMIT = 4;
const htmlCache = new Map();
const sourceImageCache = new Map();
const searchImageCache = new Map();
const IMAGE_TYPES = new Map([
  ['image/jpeg', 'jpg'],
  ['image/jpg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp'],
  ['image/gif', 'gif'],
  ['image/avif', 'avif']
]);

function allItems(content) {
  return Object.entries(content.sections || {}).flatMap(([section, group]) =>
    (group?.items || []).map((item, index) => ({ section, index, item }))
  );
}

function slug(value) {
  const ascii = String(value || '')
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[-\s]+/g, '-')
    .slice(0, 44);
  if (ascii) return ascii;
  return createHash('sha1').update(String(value || 'item')).digest('hex').slice(0, 10);
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function decodeHtml(value) {
  return String(value || '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function attr(tag, name) {
  const re = new RegExp(`${escapeRegex(name)}\\s*=\\s*(['"])(.*?)\\1`, 'i');
  const match = tag.match(re);
  return match ? decodeHtml(match[2]) : '';
}

function isHttpUrl(value) {
  return /^https?:\/\//i.test(String(value || ''));
}

function absoluteUrl(value, baseUrl) {
  if (!value) return '';
  try {
    return new URL(decodeHtml(value), baseUrl).href;
  } catch {
    return '';
  }
}

function extensionFromUrl(url) {
  try {
    const pathname = new URL(url).pathname;
    const ext = extname(pathname).replace('.', '').toLowerCase();
    if (['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif'].includes(ext)) return ext === 'jpeg' ? 'jpg' : ext;
  } catch {}
  return '';
}

function localImagePath(rootPath, date, image) {
  const value = String(image || '').trim();
  if (!value || isHttpUrl(value) || value.startsWith('data:')) return null;
  const clean = value.replace(/^\.?\//, '');
  if (clean.startsWith(`runs/${date}/images/`)) return resolve(rootPath, clean);
  if (clean.startsWith('images/')) return resolve(rootPath, 'runs', date, clean);
  if (!clean.includes('/')) return resolve(rootPath, 'runs', date, 'images', clean);
  return null;
}

function hasImageProvenance(item) {
  const origin = String(item.image_origin || '').trim().toLowerCase();
  return isHttpUrl(item.image_source_url) ||
    isHttpUrl(item.image_url) ||
    ['source', 'search', 'official', 'archive'].includes(origin);
}

function imageTypeFromBytes(bytes) {
  if (!bytes || bytes.byteLength < 12) return '';
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpg';
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'png';
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) return 'gif';
  const ascii = new TextDecoder('ascii', { fatal: false }).decode(bytes.slice(0, Math.min(bytes.byteLength, 32)));
  if (ascii.startsWith('RIFF') && ascii.slice(8, 12) === 'WEBP') return 'webp';
  if (ascii.slice(4, 8) === 'ftyp' && /avif|avis/.test(ascii.slice(8, 24))) return 'avif';
  return '';
}

function validImageFile(filePath) {
  try {
    return Boolean(imageTypeFromBytes(new Uint8Array(readFileSync(filePath)).slice(0, 32)));
  } catch {
    return false;
  }
}

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs || 15_000);
  try {
    return await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': options.accept || '*/*',
        'Referer': options.referer || new URL(url).origin + '/'
      }
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchHtml(url) {
  if (htmlCache.has(url)) return htmlCache.get(url);
  try {
    const response = await fetchWithTimeout(url, { accept: 'text/html,application/xhtml+xml', timeoutMs: 8_000 });
    if (!response.ok) return '';
    const type = response.headers.get('content-type') || '';
    if (type && !type.includes('html') && !type.includes('text')) return '';
    const buffer = new Uint8Array(await response.arrayBuffer()).slice(0, MAX_HTML_BYTES);
    const html = new TextDecoder('utf-8', { fatal: false }).decode(buffer);
    htmlCache.set(url, html);
    return html;
  } catch {
    const html = fetchHtmlWithCurl(url);
    htmlCache.set(url, html);
    return html;
  }
}

function fetchHtmlWithCurl(url) {
  try {
    const buffer = execFileSync('curl', [
      '-L',
      '--fail',
      '--silent',
      '--show-error',
      '--max-time',
      '8',
      '-A',
      USER_AGENT,
      '-H',
      'Accept: text/html,application/xhtml+xml',
      url
    ], { maxBuffer: MAX_HTML_BYTES });
    return buffer.toString('utf8');
  } catch {
    return '';
  }
}

function extractImagesFromHtml(html, pageUrl) {
  const candidates = [];
  const metaTags = html.match(/<meta\b[^>]*>/gi) || [];
  const wanted = new Set([
    'og:image',
    'og:image:url',
    'og:image:secure_url',
    'twitter:image',
    'twitter:image:src',
    'thumbnail',
    'thumbnailurl'
  ]);

  for (const tag of metaTags) {
    const key = (attr(tag, 'property') || attr(tag, 'name') || attr(tag, 'itemprop')).toLowerCase();
    const content = attr(tag, 'content');
    if (wanted.has(key) && content) candidates.push(absoluteUrl(content, pageUrl));
  }

  const linkTags = html.match(/<link\b[^>]*>/gi) || [];
  for (const tag of linkTags) {
    const rel = attr(tag, 'rel').toLowerCase();
    const href = attr(tag, 'href');
    if ((rel.includes('image_src') || rel.includes('preload')) && href) {
      candidates.push(absoluteUrl(href, pageUrl));
    }
  }

  const jsonLd = html.match(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi) || [];
  for (const script of jsonLd) {
    const body = script.replace(/^<script\b[^>]*>/i, '').replace(/<\/script>$/i, '').trim();
    try {
      const parsed = JSON.parse(body);
      collectJsonLdImages(parsed, pageUrl, candidates);
    } catch {}
  }

  return unique(candidates.filter(isHttpUrl));
}

function collectJsonLdImages(node, pageUrl, out) {
  if (!node) return;
  if (Array.isArray(node)) {
    node.forEach((item) => collectJsonLdImages(item, pageUrl, out));
    return;
  }
  if (typeof node !== 'object') return;
  const image = node.image || node.thumbnailUrl || node.logo;
  if (typeof image === 'string') out.push(absoluteUrl(image, pageUrl));
  if (Array.isArray(image)) image.forEach((entry) => collectJsonLdImages({ image: entry }, pageUrl, out));
  if (typeof image === 'object') {
    const url = image.url || image.contentUrl;
    if (url) out.push(absoluteUrl(url, pageUrl));
  }
}

function unique(values) {
  const seen = new Set();
  return values.filter((value) => {
    if (!value || seen.has(value)) return false;
    seen.add(value);
    return true;
  });
}

async function sourceImageCandidates(item) {
  const pageUrl = item.url || item.link;
  if (!isHttpUrl(pageUrl)) return [];
  if (sourceImageCache.has(pageUrl)) return sourceImageCache.get(pageUrl);
  const html = await fetchHtml(pageUrl);
  const candidates = html ? extractImagesFromHtml(html, pageUrl) : [];
  sourceImageCache.set(pageUrl, candidates);
  return candidates;
}

function searchQueries(item) {
  const urlHost = (() => {
    try { return new URL(item.url || item.link || '').hostname.replace(/^www\./, ''); } catch { return ''; }
  })();
  return unique([
    [item.title, item.source, urlHost].filter(Boolean).join(' '),
    [item.body, item.source].filter(Boolean).join(' ').slice(0, 180),
    [item.title, item.body].filter(Boolean).join(' ').slice(0, 180)
  ]);
}

async function bingImageCandidates(query) {
  const url = `https://www.bing.com/images/search?q=${encodeURIComponent(query)}&qft=+filterui:photo-photo&FORM=IRFLTR`;
  const html = await fetchHtml(url);
  if (!html) return [];
  const decoded = decodeHtml(html);
  const candidates = [];
  for (const match of decoded.matchAll(/"murl"\s*:\s*"([^"]+)"/g)) {
    candidates.push(match[1].replace(/\\\//g, '/'));
  }
  for (const match of decoded.matchAll(/murl&quot;:&quot;([^&]+)&quot;/g)) {
    candidates.push(match[1]);
  }
  return unique(candidates.map(decodeHtml).filter(isHttpUrl)).slice(0, 8);
}

async function searchImageCandidates(item) {
  const out = [];
  for (const query of searchQueries(item).slice(0, 1)) {
    if (searchImageCache.has(query)) {
      out.push(...searchImageCache.get(query));
      continue;
    }
    out.push(...await bingImageCandidates(query));
    searchImageCache.set(query, out.slice(0, SEARCH_CANDIDATE_LIMIT));
    if (out.length >= SEARCH_CANDIDATE_LIMIT) break;
  }
  return unique(out).slice(0, SEARCH_CANDIDATE_LIMIT);
}

function outputName(section, index, item, imageUrl, contentType) {
  const byType = IMAGE_TYPES.get(String(contentType || '').split(';')[0].trim().toLowerCase());
  const ext = byType || extensionFromUrl(imageUrl) || 'jpg';
  return `${section}-${String(index + 1).padStart(2, '0')}-${slug(item.title)}.${ext}`;
}

async function downloadImage(imageUrl, targetPath, referer) {
  try {
    const response = await fetchWithTimeout(imageUrl, {
      accept: 'image/avif,image/webp,image/png,image/jpeg,image/gif,*/*',
      timeoutMs: 12_000,
      referer
    });
    if (!response.ok) throw new Error(`http_${response.status}`);
    const type = (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    const ext = extensionFromUrl(imageUrl);
    if (!IMAGE_TYPES.has(type) && !['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif'].includes(ext)) {
      throw new Error(`not_image:${type || 'unknown'}`);
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength < MIN_IMAGE_BYTES) throw new Error(`image_too_small:${bytes.byteLength}`);
    if (bytes.byteLength > MAX_IMAGE_BYTES) throw new Error(`image_too_large:${bytes.byteLength}`);
    if (!imageTypeFromBytes(bytes)) throw new Error(`image_magic_invalid:${type || ext || 'unknown'}`);
    writeFileSync(targetPath, bytes);
    return { bytes: bytes.byteLength, contentType: type };
  } catch (error) {
    return downloadImageWithCurl(imageUrl, targetPath, referer, error);
  }
}

function downloadImageWithCurl(imageUrl, targetPath, referer, originalError) {
  try {
    execFileSync('curl', [
      '-L',
      '--fail',
      '--silent',
      '--show-error',
      '--max-time',
      '12',
      '--max-filesize',
      String(MAX_IMAGE_BYTES),
      '-A',
      USER_AGENT,
      '-H',
      'Accept: image/avif,image/webp,image/png,image/jpeg,image/gif,*/*',
      '-H',
      `Referer: ${referer || new URL(imageUrl).origin + '/'}`,
      '-o',
      targetPath,
      imageUrl
    ], { maxBuffer: 16_000 });
    const size = statSync(targetPath).size;
    if (size < MIN_IMAGE_BYTES) throw new Error(`image_too_small:${size}`);
    if (size > MAX_IMAGE_BYTES) throw new Error(`image_too_large:${size}`);
    if (!validImageFile(targetPath)) throw new Error('image_magic_invalid');
    return { bytes: size, contentType: '' };
  } catch (curlError) {
    throw new Error(`${originalError?.message || 'fetch_failed'};curl:${curlError.message}`);
  }
}

async function ensureItemImage({ rootPath, date, imageDir, section, index, item }) {
  const existing = localImagePath(rootPath, date, item.image);
  if (existing && existsSync(existing) && statSync(existing).size >= MIN_IMAGE_BYTES && validImageFile(existing) && hasImageProvenance(item)) {
    item.image = `images/${basename(existing)}`;
    return { status: 'kept', section, index, image: item.image };
  }

  const directCandidates = unique([
    item.image_url,
    item.image_source_url,
    isHttpUrl(item.image) ? item.image : '',
    ...(await sourceImageCandidates(item))
  ].filter(isHttpUrl));

  const attempts = [];
  for (const [origin, candidates] of [
    ['source', directCandidates],
    ['search', await searchImageCandidates(item)]
  ]) {
    for (const candidate of candidates) {
      const tempName = outputName(section, index, item, candidate, '');
      const targetPath = resolve(imageDir, tempName);
      try {
        const result = await downloadImage(candidate, targetPath, item.url || candidate);
        const finalName = outputName(section, index, item, candidate, result.contentType);
        const finalPath = resolve(imageDir, finalName);
        if (finalPath !== targetPath) writeFileSync(finalPath, readFileSync(targetPath));
        item.image = `images/${finalName}`;
        item.image_source_url = candidate;
        item.image_origin = origin;
        return { status: 'downloaded', section, index, image: item.image, origin, bytes: result.bytes };
      } catch (error) {
        attempts.push(`${origin}:${candidate}:${error.message}`);
      }
    }
  }

  return { status: 'missing', section, index, title: item.title || '', attempts: attempts.slice(0, 6) };
}

export async function ensureBriefingItemImages({ date, rootPath = ROOT, contentPath = resolve(ROOT, 'runs', date, 'content.json') }) {
  const content = JSON.parse(readFileSync(contentPath, 'utf8'));
  const imageDir = resolve(rootPath, 'runs', date, 'images');
  mkdirSync(imageDir, { recursive: true });

  const entries = allItems(content);
  const results = await mapLimit(entries, IMAGE_CONCURRENCY, (entry) =>
    ensureItemImage({ rootPath, date, imageDir, ...entry })
  );

  writeFileSync(contentPath, `${JSON.stringify(content, null, 2)}\n`, 'utf8');
  const missing = results.filter((result) => result.status === 'missing');
  return { ok: missing.length === 0, date, results, missing };
}

async function mapLimit(values, limit, mapper) {
  const results = new Array(values.length);
  let nextIndex = 0;
  async function worker() {
    while (nextIndex < values.length) {
      const index = nextIndex++;
      results[index] = await mapper(values[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, values.length) }, worker));
  return results;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  loadEnv(resolve(ROOT, '.env'));
  const date = targetDateFromArg();
  const result = await ensureBriefingItemImages({ date });
  if (!result.ok) {
    console.error(JSON.stringify({ status: 'briefing_item_images_missing', date, missing: result.missing }, null, 2));
    process.exit(1);
  }
  console.log(JSON.stringify({
    status: 'briefing_item_images_ready',
    date,
    images: result.results.length
  }, null, 2));
}
