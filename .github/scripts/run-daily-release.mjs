#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = resolve(process.cwd());
const STATUS_PATH = resolve(ROOT, 'data/daily-news-run-status.json');

const STEPS = [
  ['Generate daily news', ['node', '.github/scripts/daily-news-generator.mjs']],
  ['Build news index', ['node', '.github/scripts/build-news-index.mjs']],
  ['Audit source coverage', ['node', '.github/scripts/source-coverage-audit.mjs']],
  ['QA generated news', ['node', '.github/scripts/qa-daily-news-output.mjs']],
  ['QA live source stability', ['node', 'scripts/qa-live-source-stability.mjs']],
  ['QA section hydration', ['node', 'scripts/qa-section-hydration.mjs']],
  ['QA homepage assembly', ['node', 'scripts/qa-homepage-assembly.mjs']],
  ['QA semantic copy', ['node', 'scripts/qa-semantic-copy.mjs']],
  ['QA editorial architecture', ['node', 'scripts/qa-editorial-architecture.mjs']],
  ['QA homepage surface copy', ['node', 'scripts/qa-homepage-surface-copy.mjs']],
  ['QA news visuals', ['node', 'scripts/qa-news-visuals.mjs']],
  ['QA public reader copy', ['node', 'scripts/qa-public-reader-copy.mjs']],
  ['QA main UX polish', ['node', 'scripts/qa-main-ux.mjs']],
  ['QA release gate', ['node', 'scripts/qa-release-gate.mjs']]
];

function readJson(filePath, fallback = {}) {
  if (!existsSync(filePath)) return fallback;
  try {
    return JSON.parse(readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJson(filePath, data) {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

function markFailed(stepName, command, status) {
  const current = readJson(STATUS_PATH, {});
  writeJson(STATUS_PATH, {
    ...current,
    status: 'blocked_qa_failed',
    created_new_edition: current.created_new_edition === true,
    no_new_edition_reason: current.no_new_edition_reason || `daily_release_failed:${stepName}`,
    failed_step: stepName,
    failed_command: command.join(' '),
    failed_exit_code: status,
    updated_at: new Date().toISOString()
  });
}

for (const [stepName, command] of STEPS) {
  console.log(`\n==> ${stepName}`);
  console.log(command.join(' '));
  const result = spawnSync(command[0], command.slice(1), {
    cwd: ROOT,
    stdio: 'inherit',
    env: process.env
  });
  if (result.status !== 0) {
    const status = typeof result.status === 'number' ? result.status : 1;
    markFailed(stepName, command, status);
    console.error(`Daily release failed at step: ${stepName}`);
    process.exit(status);
  }
}

console.log('\nDaily release runner completed.');
