#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const ROOT = resolve(process.cwd());
const OUT = resolve(ROOT, 'data/main-ux-check.json');
const LEAKS = ['/Volumes/', 'file://', '/Users/', 'localhost', '127.0.0.1'];
const FORBIDDEN = ['engineering', 'docs', 'data/_working', 'node_modules'];

function ensureDir(filePath) {
  mkdirSync(dirname(filePath), { recursive: true });
}

function read(file) {
  return readFileSync(resolve(ROOT, file), 'utf8');
}

function readJson(file, fallback = null) {
  const p = resolve(ROOT, file);
  if (!existsSync(p)) return fallback;
  return JSON.parse(readFileSync(p, 'utf8'));
}

function writeJson(file, data) {
  ensureDir(file);
  writeFileSync(file, JSON.stringify(data, null, 2) + '\n', 'utf8');
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

function hasChinese(text) {
  return /[\u4e00-\u9fff]/.test(String(text || ''));
}

function englishWordCount(text) {
  const matches = String(text || '').match(/[A-Za-z][A-Za-z'-]+/g);
  return matches ? matches.length : 0;
}

function allStories(content) {
  return Object.values(content?.sections || {}).flatMap((section) => section.items || []);
}

function main() {
  const issues = [];
  const warnings = [];
  const manifest = readJson('data/MANIFEST.json', []);
  const edition = manifest[0] || '2026-05-15-v4';
  const content = readJson(`data/${edition}/content.json`, {});
  const summary = readJson(`data/${edition}/news-summary.json`, {});
  const surfaceCheck = readJson('data/homepage-surface-copy-check.json', null);
  const indexHtml = read('index.html');
  const newsJs = read('scripts/news.js');
  const siteNav = read('scripts/site-nav.js');
  const sitePolish = read('styles/site-polish.css');
  const stories = allStories(content);
  const lead = content?.sections?.lead_story?.items?.[0] || {};
  const visuals = existsSync(resolve(ROOT, 'assets/news-visuals'))
    ? walk(resolve(ROOT, 'assets/news-visuals')).filter((file) => file.endsWith('.svg'))
    : [];

  if (!surfaceCheck) issues.push('homepage surface copy check missing');
  else if (surfaceCheck.qa_passed !== true) issues.push('homepage surface copy check failed');

  if ((indexHtml.match(/浏览晨报归档/g) || []).length > 0) issues.push('homepage still has static duplicate archive button');
  if (/查看运行状态|news-status\.html/.test(indexHtml)) issues.push('homepage main html still links automation status');
  if (!/janet-status-link/.test(siteNav)) issues.push('footer status link missing');
  if ((siteNav.match(/href="news-status\.html"/g) || []).length !== 1) issues.push('automation status should exist only once in site footer script');
  if (/入选信号/.test(indexHtml) || /入选信号/.test(newsJs)) issues.push('selected signals block text still exists');
  if (/news-v4-panel-number|news-v4-chip-grid/.test(newsJs)) issues.push('old signals count panel still rendered');
  if (!/news-signal-map/.test(newsJs)) issues.push('signal map cards are not rendered on homepage');
  if (!/is-compact|is-floating-up|requestAnimationFrame/.test(siteNav)) issues.push('nav scroll motion script missing');
  if (!/backdrop-filter:\s*blur\(18px\)\s*saturate\(150%\)/.test(sitePolish)) issues.push('glass nav style missing');
  if (!/cubic-bezier\(\.16,\s*1,\s*\.3,\s*1\)/.test(sitePolish)) issues.push('curved nav transition missing');
  if (!/prefers-reduced-motion/.test(sitePolish)) issues.push('reduced motion guard missing');
  if (!/translateY\(-2px\)/.test(sitePolish) || !/scale\(0\.96\)/.test(sitePolish)) issues.push('button elastic motion missing');
  if (!hasChinese(summary.title || summary.theme)) issues.push('news-summary title is not Chinese');
  if (!hasChinese(summary.lead_story?.summary || summary.summary || '')) issues.push('news-summary summary is not Chinese');
  if (!hasChinese(lead.title) || englishWordCount(lead.title) >= 5) issues.push('lead title is not Chinese-first');
  if (!hasChinese(lead.summary)) issues.push('lead summary is not Chinese-first');
  for (const story of stories) {
    if (!story.title || !story.summary || !story.why_it_matters || !story.janet_take || !story.watch_next) {
      issues.push(`story has missing public content: ${story.id || story.title}`);
    }
    if (!hasChinese(story.title) || englishWordCount(story.title) >= 5) issues.push(`story title is not Chinese-first: ${story.id || story.title}`);
    if (story.summary && !hasChinese(story.summary)) issues.push(`story summary is not Chinese-first: ${story.id || story.title}`);
  }
  if (visuals.length < 4) issues.push('news visuals fewer than 4 SVG files');

  for (const forbidden of FORBIDDEN) {
    if (existsSync(resolve(ROOT, forbidden))) issues.push(`forbidden path exists: ${forbidden}`);
  }
  for (const file of walk(ROOT)) {
    const rel = file.replace(ROOT + '/', '');
    const base = rel.split('/').pop() || '';
    if (/_pack_.*\.zip$/.test(base) || base === '.env' || /\.env$/.test(base)) issues.push(`forbidden file: ${rel}`);
    if (!/\.(html|css|js|json|md|txt|xml|svg|yml|yaml)$/i.test(file)) continue;
    const text = readFileSync(file, 'utf8');
    for (const leak of LEAKS) {
      if (text.includes(leak)) issues.push(`local path leak ${leak} in ${rel}`);
    }
  }

  const result = {
    step: '34-R',
    status: issues.length ? 'main_ux_polish_blocked' : 'main_ux_polish_ready',
    qa_passed: issues.length === 0,
    nav_glass_motion_passed: !issues.some((issue) => issue.includes('nav')),
    button_motion_passed: !issues.some((issue) => issue.includes('button')),
    status_links_cleaned: !issues.some((issue) => issue.includes('status')),
    duplicate_archive_buttons_removed: !issues.some((issue) => issue.includes('archive')),
    selected_signals_removed: !issues.some((issue) => issue.includes('signals')),
    signal_map_cards_added: !issues.some((issue) => issue.includes('signal map')),
    chinese_first_passed: !issues.some((issue) => issue.includes('Chinese')),
    news_visuals_created: visuals.length >= 4,
    janet_daily_news_complete: !issues.some((issue) => issue.includes('missing public content')),
    issues,
    warnings
  };

  writeJson(OUT, result);
  console.log(`main ux status: ${result.status}`);
  if (issues.length) process.exit(1);
}

main();
