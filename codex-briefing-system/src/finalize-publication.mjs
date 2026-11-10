import fs from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {inspectLive} from './inspect-live-briefing.mjs';
import {dueBriefingDate, validBriefingDate} from './verification-contract.mjs';

export const REPOSITORY = 'Yaojingwen2002/janet-public-site';
export const SITE_BASE = 'https://yaojingwen2002.github.io/janet-public-site/';
const SHA1 = /^[a-f0-9]{40}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const isSha1 = value => typeof value === 'string' && SHA1.test(value);
const isSha256 = value => typeof value === 'string' && SHA256.test(value);
const WORKFLOW = '.github/workflows/deploy-pages.yml';

export function buildReceipt({live, deployment, tree, repository = REPOSITORY, siteBase = SITE_BASE, error}) {
  const date = live.date;
  if (!validBriefingDate(date)) throw Error('invalid_date');
  const files = Array.isArray(live.results) ? live.results : [];
  const prefix = 'data/' + date + '/';
  const images = files.filter(file => file.path.startsWith(prefix + 'images/'));
  const required = [
    '', 'index.html', 'news.html', 'data/news-index.json',
    prefix + 'content.json', prefix + 'output.html', prefix + 'cover.png',
    prefix + 'narration.json', prefix + 'narration.txt', prefix + 'narration.m4a',
    'scripts/briefing-audio.js', 'styles/briefing-audio.css',
    ...images.map(file => file.path)
  ];
  const byPath = new Map(files.map(file => [file.path, file]));
  const issues = [...(live.issues || [])];
  const complete = files.length === 29 && byPath.size === 29 && images.length === 17 &&
    required.every(path => {
      const file = byPath.get(path);
      return file?.status === 200 && file.bytes > 0 && isSha256(file.sha256) && isSha1(file.git_blob_sha1);
    });
  if (!complete || live.status !== 'published' || live.item_count !== 17 ||
      !isSha256(live.content_sha256) || !isSha256(live.audio_sha256)) issues.push('live_proof_incomplete');
  const deployed = deployment?.status === 'completed' && deployment.conclusion === 'success' &&
    deployment.head_branch === 'main' && deployment.path === WORKFLOW &&
    isSha1(deployment.head_sha) && Number.isSafeInteger(deployment.id) && deployment.id > 0;
  if (!deployed) issues.push('deployment_unconfirmed');
  const blobs = new Map((Array.isArray(tree?.tree) ? tree.tree : []).filter(file => file.type === 'blob').map(file => [file.path, file.sha]));
  if (!tree || tree.truncated || !Array.isArray(tree.tree)) issues.push('deployment_tree_unavailable');
  else {
    // The publisher adds brand markup to HTML. Data, media and player files are
    // copied byte for byte and must match the exact successful deployment tree.
    const transformed = new Set(['', 'index.html', 'news.html', prefix + 'output.html']);
    for (const file of files) {
      if (!transformed.has(file.path) && blobs.get(file.path) !== file.git_blob_sha1) issues.push('deployment_blob_mismatch:' + file.path);
    }
  }
  if (error) issues.push(error);
  const ok = live.ok === true && issues.length === 0;
  return {
    schema_version: 1, date, timezone: 'Asia/Taipei', repository, site_base: siteBase,
    checked_at: live.verified_at || new Date().toISOString(),
    ok, status: ok ? 'verified' : !live.ok ? 'needs_repair' : 'deployment_unconfirmed',
    next_action: ok ? 'none' : !live.ok ? live.repair : 'review_deployment',
    content_sha256: live.content_sha256, audio_sha256: live.audio_sha256,
    item_count: live.item_count, duration: live.duration,
    live_status: live.status,
    deployment: deployed ? {run_id: deployment.id, sha: deployment.head_sha, url: deployment.html_url, conclusion: deployment.conclusion} : null,
    issues: [...new Set(issues)],
    files: [...files].sort((a, b) => a.path.localeCompare(b.path))
  };
}

export async function finalizePublication({
  date, repository = REPOSITORY, siteBase = SITE_BASE, runId,
  token, fetcher = fetch, inspect = inspectLive
}) {
  if (!validBriefingDate(date)) throw Error('invalid_date');
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) throw Error('invalid_repository');
  let live;
  try { live = await inspect({date, base: siteBase, fetcher}); }
  catch { live = {date, ok: false, status: 'check_failed', repair: 'review_checker', issues: ['inspection_failed'], results: [], verified_at: new Date().toISOString()}; }
  if (!live.ok) return {live, receipt: buildReceipt({live, repository, siteBase})};
  const apiBase = 'https://api.github.com/repos/' + repository + '/';
  async function api(path) {
    const headers = {'Accept': 'application/vnd.github+json', 'User-Agent': 'JanetPublicationReceipt/1.0'};
    if (token) headers.Authorization = 'Bearer ' + token;
    const response = await fetcher(apiBase + path, {headers, signal: AbortSignal.timeout(30000), cache: 'no-store'});
    if (!response.ok) throw Error('github_http_' + response.status);
    return response.json();
  }
  let deployment, tree, error;
  try {
    if (runId) {
      if (!/^\d+$/.test(String(runId))) throw Error('invalid_deployment_run');
      deployment = await api('actions/runs/' + runId);
    } else {
      const list = await api('actions/workflows/deploy-pages.yml/runs?status=success&branch=main&per_page=1');
      deployment = list.workflow_runs?.[0];
    }
    if (!deployment || !isSha1(deployment.head_sha) || deployment.conclusion !== 'success') throw Error('deployment_unconfirmed');
    // Resolve the tree independently instead of attributing the current branch
    // head (which may contain later checker-only commits) to the public site.
    const commit = await api('git/commits/' + deployment.head_sha);
    if (!isSha1(commit?.tree?.sha)) throw Error('invalid_deployment_tree');
    tree = await api('git/trees/' + commit.tree.sha + '?recursive=1');
  } catch (cause) {
    const message = cause?.message || '';
    error = /^(github_http_\d+|invalid_deployment_run|deployment_unconfirmed|invalid_deployment_tree)$/.test(message)
      ? message : 'deployment_metadata_unavailable';
  }
  return {live, receipt: buildReceipt({live, deployment, tree, repository, siteBase, error})};
}

export function saveReceipt(root, {live, receipt}) {
  if (!validBriefingDate(receipt.date)) throw Error('invalid_date');
  const run = resolve(root, 'runs', receipt.date);
  const history = resolve(run, 'receipts');
  fs.mkdirSync(history, {recursive: true});
  const suffix = new Date().toISOString().replace(/[:.]/g, '-') + '-' + randomUUID();
  const archive = resolve(history, suffix + '.json');
  const serialized = JSON.stringify(receipt, null, 2) + '\n';
  fs.writeFileSync(archive, serialized, {flag: 'wx'});
  for (const [name, value] of [
    ['publication-receipt.json', serialized],
    ['live-verification.json', JSON.stringify(live, null, 2) + '\n']
  ]) {
    const target = resolve(run, name), temporary = target + '.' + randomUUID() + '.tmp';
    fs.writeFileSync(temporary, value, {flag: 'wx'});
    fs.renameSync(temporary, target);
  }
  return {latest: resolve(run, 'publication-receipt.json'), archive};
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const date = process.argv.slice(2).find(value => /^\d{4}-\d\d-\d\d$/.test(value)) || dueBriefingDate();
  const result = await finalizePublication({
    date,
    token: process.env.GITHUB_TOKEN || process.env.GH_TOKEN,
    runId: process.env.BRIEFING_DEPLOYMENT_RUN_ID || undefined
  });
  const saved = saveReceipt(fileURLToPath(new URL('../', import.meta.url)), result);
  console.log(JSON.stringify({date, status: result.receipt.status, ok: result.receipt.ok,
    checks: result.receipt.files.length, issues: result.receipt.issues, receipt: saved.latest}));
  if (!result.receipt.ok) process.exitCode = 1;
}
