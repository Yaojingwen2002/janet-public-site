import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {liveFixture} from './testing/live-fixture.mjs';
import {inspectLive} from './inspect-live-briefing.mjs';
import {buildReceipt, finalizePublication, saveReceipt} from './finalize-publication.mjs';

async function fixture() {
  const f = liveFixture();
  const live = await inspectLive({date: f.date, base: 'https://example.org/', fetcher: f.fetcher});
  const deployment = {id: 123, head_sha: 'a'.repeat(40), status: 'completed', conclusion: 'success',
    head_branch: 'main', path: '.github/workflows/deploy-pages.yml', html_url: 'https://github.com/owner/repo/actions/runs/123'};
  const tree = {truncated: false, tree: live.results.filter(file => file.path).map(file => ({path: file.path, type: 'blob', sha: file.git_blob_sha1}))};
  return {...f, live, deployment, tree};
}

test('a receipt ties all 29 live files to the successful deployment, not the later branch head', async () => {
  const f = await fixture(), receipt = buildReceipt(f);
  assert.equal(receipt.ok, true); assert.equal(receipt.status, 'verified');
  assert.equal(receipt.files.length, 29); assert.equal(receipt.deployment.sha, 'a'.repeat(40));
  assert(receipt.files.every(file => /^[a-f0-9]{64}$/.test(file.sha256)));
});
test('HTTP 200 alone cannot produce a verified receipt', async () => {
  const f = await fixture(); delete f.live.results[0].sha256;
  assert.equal(buildReceipt(f).ok, false);
});
test('the wrong deployed image cannot be attributed to a successful deployment', async () => {
  const f = await fixture();
  f.tree.tree.find(file => file.path.endsWith('/images/news-0.png')).sha = 'b'.repeat(40);
  const r = buildReceipt(f); assert.equal(r.ok, false);
  assert(r.issues.some(issue => issue.startsWith('deployment_blob_mismatch:')));
});
for (const mutate of [
 f => {f.tree.truncated = true;},
 f => {f.deployment.conclusion = 'failure';},
 f => {f.deployment.head_branch = 'other';},
 f => {f.deployment.path = '.github/workflows/unrelated.yml';}
]) test('incomplete or unrelated deployment evidence stays unconfirmed', async () => {
  const f = await fixture(); mutate(f);
  assert.equal(buildReceipt(f).status, 'deployment_unconfirmed');
});
test('metadata access failures preserve live evidence and never leak credentials into the receipt', async () => {
  const f = await fixture();
  const result = await finalizePublication({date: f.date, inspect: async () => f.live, token: 'SECRET_TEST_VALUE',
    fetcher: async () => {throw Error('SECRET_TEST_VALUE');}});
  assert.equal(result.receipt.status, 'deployment_unconfirmed');
  assert(!JSON.stringify(result.receipt).includes('SECRET_TEST_VALUE'));
});
test('an unexpected checker failure still produces a failure receipt', async () => {
  const result = await finalizePublication({date: '2026-11-10', inspect: async () => {throw Error('internal failure');}});
  assert.equal(result.receipt.ok, false); assert.equal(result.receipt.next_action, 'review_checker');
});
test('GitHub deployment metadata is resolved with read-only requests', async () => {
  const f = await fixture(), calls = [];
  const result = await finalizePublication({date: f.date, token: 'test-token', inspect: async () => f.live,
    fetcher: async (url, options) => {
      calls.push({url, method: options.method || 'GET', authorization: options.headers.Authorization});
      const data = url.includes('/actions/workflows/') ? {workflow_runs: [f.deployment]} :
        url.includes('/git/commits/') ? {tree: {sha: 'c'.repeat(40)}} : f.tree;
      return new Response(JSON.stringify(data));
    }});
  assert.equal(result.receipt.ok, true);
  assert.equal(calls.length, 3);
  assert(calls.every(call => call.url.startsWith('https://api.github.com/') && call.method === 'GET'));
});
test('failed checks do not query GitHub or erase the previous verified receipt', async t => {
  const f = await fixture(), root = fs.mkdtempSync(join(tmpdir(), 'janet-receipts-'));
  t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  const good = {live: f.live, receipt: buildReceipt(f)};
  const first = saveReceipt(root, good);
  const failed = await finalizePublication({date: f.date, inspect: async () => ({...f.live, ok: false, status: 'check_failed', repair: 'review_connectivity'}),
    fetcher: async () => {throw Error('must not query metadata');}});
  const second = saveReceipt(root, failed);
  assert.notEqual(first.archive, second.archive);
  assert.equal(JSON.parse(fs.readFileSync(first.archive)).ok, true);
  assert.equal(JSON.parse(fs.readFileSync(second.latest)).ok, false);
  assert.equal(fs.readdirSync(join(root, 'runs', f.date, 'receipts')).length, 2);
});
