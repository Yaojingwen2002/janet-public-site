#!/usr/bin/env node
// QA for Janet public-site daily news automation.

import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const ROOT = resolve(process.cwd());
const STATUS_PATH = resolve(ROOT, 'data/daily-news-run-status.json');
const OUT = resolve(ROOT, 'data/daily-news-automation-result.json');
const LEAKS = ['/Volumes/', 'file://', '/Users/', 'localhost', '127.0.0.1'];

function ensureDir(filePath) {
  mkdirSync(dirname(filePath), { recursive: true });
}

function readJson(filePath, fallback = null) {
  if (!existsSync(filePath)) return fallback;
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, data) {
  ensureDir(filePath);
  writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

function walk(dir) {
  const files = [];
  if (!existsSync(dir)) return files;
  for (const entry of readdirSync(dir)) {
    if (entry === '.git') continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) files.push(...walk(full));
    if (st.isFile()) files.push(full);
  }
  return files;
}

function textFile(file) {
  return /\.(html|css|js|json|md|txt|yml|yaml|svg)$/i.test(file);
}

function main() {
  const status = readJson(STATUS_PATH, {});
  const issues = [];

  if (status.status === 'blocked_insufficient_fresh_news') {
    if (status.published !== false) issues.push('blocked run must not publish');
  } else if (['published_full_edition', 'published_limited_edition'].includes(status.status)) {
    const edition = status.published_edition_id;
    if (!edition) issues.push('published edition id missing');
    for (const file of ['content.json', 'output.html', 'news-summary.json']) {
      if (!existsSync(resolve(ROOT, 'data', edition, file))) issues.push(`missing ${edition}/${file}`);
    }
    readJson(resolve(ROOT, 'data', edition, 'content.json'));
    readJson(resolve(ROOT, 'data', edition, 'news-summary.json'));
    const html = existsSync(resolve(ROOT, 'data', edition, 'output.html'))
      ? readFileSync(resolve(ROOT, 'data', edition, 'output.html'), 'utf8')
      : '';
    if (!html.trim()) issues.push('output html empty');
    const manifest = readJson(resolve(ROOT, 'data/MANIFEST.json'), []);
    if (manifest[0] !== edition) issues.push('manifest first entry mismatch');
  } else if (/^dry_run_/.test(status.status || '')) {
    // Dry run is allowed locally; workflow uses non-dry-run mode.
  } else {
    issues.push(`unknown run status: ${status.status}`);
  }

  for (const forbidden of ['engineering', 'docs', 'data/_working', 'node_modules']) {
    if (existsSync(resolve(ROOT, forbidden))) issues.push(`forbidden path exists: ${forbidden}`);
  }
  for (const file of walk(ROOT)) {
    const rel = file.replace(`${ROOT}/`, '');
    const base = rel.split('/').pop() || '';
    if (/_pack_.*\.zip$/.test(base) || base === '.env' || /\.env$/.test(base)) issues.push(`forbidden file: ${rel}`);
    if (!textFile(file)) continue;
    const text = readFileSync(file, 'utf8');
    for (const leak of LEAKS) {
      if (text.includes(leak)) issues.push(`local path leak ${leak} in ${rel}`);
    }
  }

  const result = {
    step: '31',
    status: issues.length ? 'daily_news_automation_blocked' : 'daily_news_automation_ready',
    qa_passed: issues.length === 0,
    schedule_utc: '37 0 * * *',
    schedule_asia_shanghai: '08:37',
    requires_paid_api: false,
    requires_secret: false,
    uses_public_sources: true,
    workflow: '.github/workflows/daily-news-pages.yml',
    generator: '.github/scripts/daily-news-generator.mjs',
    issues
  };

  writeJson(OUT, result);
  console.log(`status: ${result.status}`);
  if (issues.length) process.exit(1);
}

main();
