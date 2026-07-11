#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(process.argv[2] || process.cwd());
const baseUrl = String(process.env.PUBLIC_SITE_URL || 'https://yaojingwen2002.github.io/janet-public-site/')
  .replace(/\/+$/, '') + '/';
const indexPath = resolve(root, 'data/news-index.json');
const sitemapPath = resolve(root, 'sitemap.xml');

function escapeXml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

if (!existsSync(indexPath)) throw new Error(`news_index_missing:${indexPath}`);
const index = JSON.parse(readFileSync(indexPath, 'utf8'));
const entries = [
  { path: '' },
  { path: 'news.html' },
  { path: 'portfolio.html' },
  { path: 'gpt-image2-handbook.html' },
  { path: 'shuttle-universe.html' },
  { path: 'misaligned-scenes.html' }
];

for (const edition of index.editions || []) {
  const path = String(edition.url || '').replace(/^\/+/, '');
  if (!path) continue;
  if (!existsSync(resolve(root, path))) throw new Error(`sitemap_target_missing:${path}`);
  entries.push({ path, lastmod: edition.date || '' });
}

const seen = new Set();
const urls = entries.filter((entry) => {
  const url = new URL(entry.path, baseUrl).toString();
  if (seen.has(url)) return false;
  seen.add(url);
  entry.url = url;
  return true;
});

const body = urls.map((entry) => {
  const lastmod = /^\d{4}-\d{2}-\d{2}$/.test(entry.lastmod || '')
    ? `<lastmod>${entry.lastmod}</lastmod>`
    : '';
  return `  <url><loc>${escapeXml(entry.url)}</loc>${lastmod}</url>`;
}).join('\n');

writeFileSync(
  sitemapPath,
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`,
  'utf8'
);

console.log(`sitemap_ready entries=${urls.length} latest=${index.latest_edition_id || ''}`);
