#!/usr/bin/env node
import {execFileSync} from 'node:child_process';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadEnv, targetDateFromArg} from './lib.mjs';
import {validBriefingDate} from './verification-contract.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  loadEnv(resolve(ROOT, '.env'));
  const date = targetDateFromArg();
  if (!validBriefingDate(date)) throw Error('invalid_date');
  for (const [key, name] of Object.entries({RUN_CONTENT_PATH: 'content.json', RUN_OUTPUT_PATH: 'output.html'})) {
    if (process.env[key] && resolve(process.env[key]) !== resolve(ROOT, 'runs', date, name)) {
      throw Error('Use the canonical runs/date directory for publication: ' + key);
    }
  }
  // Use the same text, image and full-narration gates as the daily task.
  execFileSync('bash', ['scripts/postprocess-briefing.sh', date, '--publish'], {cwd: ROOT, stdio: 'inherit'});
  console.log(JSON.stringify({status: 'briefing_pushed', date, deployment: 'pending_verification',
    next_step: 'Wait for Pages, then run npm run verify -- ' + date}, null, 2));
}
