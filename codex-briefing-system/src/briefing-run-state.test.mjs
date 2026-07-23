import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import test from 'node:test';
import { inspectBriefingRun } from './briefing-run-state.mjs';

const date = '2026-07-23';

function fixture() {
  const siteRoot = mkdtempSync(resolve(tmpdir(), 'janet-briefing-state-'));
  const root = resolve(siteRoot, 'codex-briefing-system');
  mkdirSync(resolve(root, 'runs', date), { recursive: true });
  return { root, siteRoot };
}

function write(filePath, value = 'ready') {
  mkdirSync(resolve(filePath, '..'), { recursive: true });
  writeFileSync(filePath, value, 'utf8');
}

test('reports a fully indexed site edition as published', (t) => {
  const { root, siteRoot } = fixture();
  t.after(() => rmSync(siteRoot, { recursive: true, force: true }));
  const dataRoot = resolve(siteRoot, 'data');
  for (const name of ['content.json', 'output.html', 'cover.png']) {
    write(resolve(dataRoot, date, name));
  }
  write(resolve(dataRoot, 'MANIFEST.json'), JSON.stringify([date]));
  write(resolve(dataRoot, 'news-index.json'), JSON.stringify({ latest_edition_id: date }));

  assert.equal(inspectBriefingRun({ date, root, siteRoot }).status, 'already_published');
});

test('reports a recent task file as active research', (t) => {
  const { root, siteRoot } = fixture();
  t.after(() => rmSync(siteRoot, { recursive: true, force: true }));
  const now = Date.parse('2026-07-23T01:15:00Z');
  const taskPath = resolve(root, 'runs', date, 'briefing-task.md');
  write(taskPath);
  utimesSync(taskPath, new Date(now - 5 * 60_000), new Date(now - 5 * 60_000));

  const result = inspectBriefingRun({ date, root, siteRoot, now, activeMinutes: 45 });
  assert.equal(result.status, 'briefing_in_progress');
  assert.equal(result.stage, 'researching');
  assert.equal(result.age_minutes, 5);
});

test('reports an old unfinished task as missing instead of active', (t) => {
  const { root, siteRoot } = fixture();
  t.after(() => rmSync(siteRoot, { recursive: true, force: true }));
  const now = Date.parse('2026-07-23T02:00:00Z');
  const taskPath = resolve(root, 'runs', date, 'briefing-task.md');
  write(taskPath);
  utimesSync(taskPath, new Date(now - 90 * 60_000), new Date(now - 90 * 60_000));

  const result = inspectBriefingRun({ date, root, siteRoot, now, activeMinutes: 45 });
  assert.equal(result.status, 'briefing_missing');
  assert.equal(result.stage, 'researching');
});

test('uses generated files to expose the current pipeline stage', (t) => {
  const { root, siteRoot } = fixture();
  t.after(() => rmSync(siteRoot, { recursive: true, force: true }));
  const runDir = resolve(root, 'runs', date);
  write(resolve(runDir, 'content.json'), '{}');
  write(resolve(runDir, 'cover.png'));

  const result = inspectBriefingRun({ date, root, siteRoot });
  assert.equal(result.status, 'briefing_in_progress');
  assert.equal(result.stage, 'draft_ready');
});
