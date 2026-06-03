#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadEnv, targetDateFromArg } from './lib.mjs';
import { validateBriefing } from './qa-briefing.mjs';

const ROOT = resolve(new URL('..', import.meta.url).pathname);
loadEnv(resolve(ROOT, '.env'));

const date = targetDateFromArg();
const runContentPath = process.env.RUN_CONTENT_PATH || resolve(ROOT, 'runs', date, 'content.json');
const runOutputPath = process.env.RUN_OUTPUT_PATH || resolve(ROOT, 'runs', date, 'output.html');

if (!existsSync(runContentPath)) throw new Error(`run_content_missing:${runContentPath}`);
if (!existsSync(runOutputPath)) throw new Error(`run_output_missing:${runOutputPath}`);

const content = JSON.parse(readFileSync(runContentPath, 'utf8'));
const qa = validateBriefing(content, { date, rootPath: ROOT, outputPath: runOutputPath });
if (!qa.ok) {
  console.error(JSON.stringify(qa, null, 2));
  throw new Error(`briefing_qa_failed:${qa.issues.length}`);
}

execFileSync('bash', ['scripts/sync-to-site.sh', date], { cwd: ROOT, stdio: 'inherit' });

console.log(JSON.stringify({
  status: 'briefing_published',
  date,
  public_site: resolve(new URL('../..', import.meta.url).pathname),
  git: 'pushed'
}, null, 2));
