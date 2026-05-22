#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const ROOT = resolve(process.cwd());
const OUT = resolve(ROOT, 'data/site-polish-check.json');
const REQUIRED_FILES = [
  '404.html',
  'sitemap.xml',
  'robots.txt',
  'assets/og/janet-og.svg',
  'assets/og/news-og.svg',
  'assets/og/works-og.svg',
  'scripts/site-meta.js',
  'scripts/site-nav.js',
  'styles/site-polish.css'
];
const HTML_FILES = [
  'index.html',
  'portfolio.html',
  'project-detail.html',
  'news.html',
  'news-detail.html',
  'news-status.html',
  '404.html'
];
const LEAKS = ['/Volumes/', 'file://', '/Users/', 'localhost', '127.0.0.1'];
const FORBIDDEN_PATHS = ['engineering', 'data/_working', 'node_modules'];
const BASE = 'https://Yaojingwen2002.github.io/janet-public-site/';

function ensureDir(filePath) {
  mkdirSync(dirname(filePath), { recursive: true });
}

function writeJson(filePath, data) {
  ensureDir(filePath);
  writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

function walk(dir) {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    if (entry === '.git') continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

function read(file) {
  return readFileSync(resolve(ROOT, file), 'utf8');
}

function hasMeta(html, pattern) {
  return pattern.test(html);
}

function metaContent(html, pattern) {
  const match = html.match(pattern);
  return match ? match[1] : '';
}

function main() {
  const issues = [];
  const warnings = [];
  const localPathLeaks = [];
  const forbiddenFilesFound = [];

  for (const file of REQUIRED_FILES) {
    if (!existsSync(resolve(ROOT, file))) issues.push('missing required file: ' + file);
  }

  for (const file of HTML_FILES) {
    if (!existsSync(resolve(ROOT, file))) {
      issues.push('missing html file: ' + file);
      continue;
    }
    const html = read(file);
    const checks = [
      ['title', /<title>[^<]+<\/title>/i],
      ['meta description', /<meta\s+name=["']description["']\s+content=["'][^"']+["']/i],
      ['canonical', /<link\s+rel=["']canonical["']\s+href=["']https:\/\/Yaojingwen2002\.github\.io\/janet-public-site\/[^"']*["']/i],
      ['og:title', /<meta\s+property=["']og:title["']\s+content=["'][^"']+["']/i],
      ['og:description', /<meta\s+property=["']og:description["']\s+content=["'][^"']+["']/i],
      ['og:type', /<meta\s+property=["']og:type["']\s+content=["']website["']/i],
      ['og:url', /<meta\s+property=["']og:url["']\s+content=["']https:\/\/Yaojingwen2002\.github\.io\/janet-public-site\/[^"']*["']/i],
      ['og:image', /<meta\s+property=["']og:image["']\s+content=["']https:\/\/Yaojingwen2002\.github\.io\/janet-public-site\/assets\/og\/[^"']+\.svg["']/i],
      ['og:site_name', /<meta\s+property=["']og:site_name["']\s+content=["']Janet["']/i],
      ['twitter:card', /<meta\s+name=["']twitter:card["']\s+content=["']summary_large_image["']/i]
    ];
    for (const [label, pattern] of checks) {
      if (!hasMeta(html, pattern)) issues.push(file + ' missing ' + label);
    }
    const canonical = metaContent(html, /<link\s+rel=["']canonical["']\s+href=["']([^"']+)["']/i);
    const ogImage = metaContent(html, /<meta\s+property=["']og:image["']\s+content=["']([^"']+)["']/i);
    if (canonical && !canonical.startsWith(BASE)) issues.push(file + ' canonical is not public absolute URL');
    if (ogImage && !ogImage.startsWith(BASE)) issues.push(file + ' og:image is not public absolute URL');
  }

  for (const forbidden of FORBIDDEN_PATHS) {
    if (existsSync(resolve(ROOT, forbidden))) forbiddenFilesFound.push(forbidden);
  }

  for (const file of walk(ROOT)) {
    const rel = file.replace(ROOT + '/', '');
    const base = rel.split('/').pop() || '';
    if (/_pack_.*\.zip$/.test(base) || base === '.env' || /\.env$/.test(base) || /secret/i.test(base) || /key/i.test(base)) {
      forbiddenFilesFound.push(rel);
    }
    if (!/\.(html|css|js|json|md|txt|xml|svg|yml|yaml)$/i.test(file)) continue;
    const text = readFileSync(file, 'utf8');
    for (const leak of LEAKS) {
      if (text.includes(leak)) localPathLeaks.push({ file: rel, leak });
    }
  }

  if (forbiddenFilesFound.length) issues.push('forbidden files found');
  if (localPathLeaks.length) issues.push('local path leaks found');

  const result = {
    step: '34',
    status: issues.length ? 'site_polish_blocked' : 'site_polish_ready',
    qa_passed: issues.length === 0,
    seo_meta_passed: !issues.some((issue) => issue.includes('title') || issue.includes('description') || issue.includes('canonical')),
    og_meta_passed: !issues.some((issue) => issue.includes('og:')),
    twitter_meta_passed: !issues.some((issue) => issue.includes('twitter:')),
    custom_404_exists: existsSync(resolve(ROOT, '404.html')),
    sitemap_exists: existsSync(resolve(ROOT, 'sitemap.xml')),
    robots_exists: existsSync(resolve(ROOT, 'robots.txt')),
    og_assets_exist: ['assets/og/janet-og.svg', 'assets/og/news-og.svg', 'assets/og/works-og.svg'].every((file) => existsSync(resolve(ROOT, file))),
    local_path_leaks: localPathLeaks,
    forbidden_files_found: forbiddenFilesFound,
    issues,
    warnings
  };

  writeJson(OUT, result);
  console.log('site polish status:', result.status);
  if (issues.length) process.exit(1);
}

main();
