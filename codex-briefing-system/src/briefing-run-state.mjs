#!/usr/bin/env node
import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync
} from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { targetDateFromArg } from './lib.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = resolve(__dirname, '..');
const DEFAULT_ACTIVE_MINUTES = 45;

function readJson(filePath, fallback) {
  try {
    return JSON.parse(readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function collectFiles(directory) {
  if (!existsSync(directory)) return [];
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.name.startsWith('._')) continue;
    const filePath = resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...collectFiles(filePath));
    if (entry.isFile()) files.push(filePath);
  }
  return files;
}

function hasFiles(directory) {
  return collectFiles(directory).length > 0;
}

function detectStage(runDir) {
  const hasTask = existsSync(resolve(runDir, 'briefing-task.md'));
  const hasPlan = existsSync(resolve(runDir, 'editorial-plan.json'));
  const hasContent = existsSync(resolve(runDir, 'content.json'));
  const hasCover = existsSync(resolve(runDir, 'cover.png'));
  const hasOutput = existsSync(resolve(runDir, 'output.html'));
  const hasImages = hasFiles(resolve(runDir, 'images'));

  if (hasOutput && hasContent && hasCover) return 'local_rendered';
  if (hasImages && hasContent && hasCover) return 'item_images_ready';
  if (hasContent && hasCover) return 'draft_ready';
  if (hasContent) return 'content_ready';
  if (hasCover) return 'cover_ready';
  if (hasPlan) return 'editorial_plan_ready';
  if (hasTask) return 'researching';
  return 'not_started';
}

function siteIsPublished(siteRoot, date) {
  const dataRoot = resolve(siteRoot, 'data');
  const editionDir = resolve(dataRoot, date);
  const tripletReady = ['content.json', 'output.html', 'cover.png']
    .every((name) => existsSync(resolve(editionDir, name)));
  const manifest = readJson(resolve(dataRoot, 'MANIFEST.json'), []);
  const index = readJson(resolve(dataRoot, 'news-index.json'), {});
  return tripletReady
    && Array.isArray(manifest)
    && manifest[0] === date
    && index.latest_edition_id === date;
}

export function inspectBriefingRun({
  date,
  root = DEFAULT_ROOT,
  siteRoot = resolve(root, '..'),
  now = Date.now(),
  activeMinutes = DEFAULT_ACTIVE_MINUTES
}) {
  const runDir = resolve(root, 'runs', date);
  if (siteIsPublished(siteRoot, date)) {
    return {
      status: 'already_published',
      date,
      stage: 'published'
    };
  }

  const files = collectFiles(runDir);
  const timestamps = files.map((filePath) => ({
    filePath,
    mtimeMs: statSync(filePath).mtimeMs
  }));
  const newest = timestamps.sort((left, right) => right.mtimeMs - left.mtimeMs)[0];
  const oldest = timestamps.sort((left, right) => left.mtimeMs - right.mtimeMs)[0];
  const ageMinutes = newest ? Math.max(0, (now - newest.mtimeMs) / 60_000) : null;
  const stage = detectStage(runDir);

  if (newest && ageMinutes <= activeMinutes) {
    return {
      status: 'briefing_in_progress',
      date,
      stage,
      started_at: new Date(oldest.mtimeMs).toISOString(),
      latest_activity_at: new Date(newest.mtimeMs).toISOString(),
      latest_file: basename(newest.filePath),
      age_minutes: Number(ageMinutes.toFixed(1)),
      active_window_minutes: activeMinutes
    };
  }

  return {
    status: 'briefing_missing',
    date,
    stage,
    latest_activity_at: newest ? new Date(newest.mtimeMs).toISOString() : null,
    latest_file: newest ? basename(newest.filePath) : null,
    age_minutes: ageMinutes === null ? null : Number(ageMinutes.toFixed(1)),
    active_window_minutes: activeMinutes
  };
}

function activeMinutesFromArgs() {
  const option = process.argv.find((value) => value.startsWith('--active-minutes='));
  const raw = option?.split('=')[1] || process.env.BRIEFING_ACTIVE_MINUTES;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_ACTIVE_MINUTES;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = process.env.BRIEFING_ROOT || DEFAULT_ROOT;
  const siteRoot = process.env.PUBLIC_SITE_DIR || resolve(root, '..');
  const result = inspectBriefingRun({
    date: targetDateFromArg(),
    root,
    siteRoot,
    activeMinutes: activeMinutesFromArgs()
  });
  console.log(JSON.stringify(result, null, 2));
}
