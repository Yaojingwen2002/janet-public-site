import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { webcrypto, createHash } from 'node:crypto';

const config = await readFile(new URL('./supabase-config.js', import.meta.url), 'utf8');
const auth = await readFile(new URL('./auth.js', import.meta.url), 'utf8');
const makeStorage = (values = new Map()) => ({
  getItem: key => values.get(key) ?? null,
  setItem: (key, value) => values.set(key, String(value)),
  removeItem: key => values.delete(key)
});

async function browser(localStorage = makeStorage(), sessionStorage = makeStorage()) {
  const requests = [];
  let options;
  const document = {
    currentScript: { src: 'https://example.test/scripts/auth.js' },
    addEventListener() {}, dispatchEvent() {}
  };
  const client = {
    auth: {
      getSession: async () => ({ data: { session: null } }),
      signInAnonymously: async () => ({ error: { message: 'Anonymous sign-ins are disabled' } })
    }
  };
  const window = {
    crypto: webcrypto, localStorage, sessionStorage,
    fetch: async (input, init) => { requests.push({ input, init }); return { ok: true }; },
    supabase: { createClient: (_url, _key, opts) => { options = opts; return client; } }
  };
  const context = vm.createContext({
    window, document, localStorage, sessionStorage, console: { warn() {} },
    TextEncoder, Uint8Array, Headers, URL, location: { href: 'https://example.test/' },
    CustomEvent: class { constructor(type, opts) { this.type = type; this.detail = opts?.detail; } }
  });
  vm.runInContext(config, context);
  await window.JanetSupabase.ready;
  vm.runInContext(auth, context);
  return { window, options, requests, localStorage };
}

const persistent = makeStorage(new Map([
  ['janet_guest_id', 'guest_LEGACY_PUBLIC_ID'], ['janet_guest_name', 'guest_existing']
]));
const first = await browser(persistent);
await first.window.JanetAuth.refreshSession();
const token = persistent.getItem('janet_guest_token_v1');
const id = first.window.JanetSupabase.getGuestId();
assert.match(token, /^[a-f0-9]{64}$/);
assert.equal(id, 'guest_' + createHash('sha256').update(token).digest('hex'));
assert.notEqual(id, token);
assert.equal(first.window.JanetAuth.getIdentity().guestId, id);
assert.equal(first.window.JanetAuth.getIdentity().displayName, 'guest_existing');
assert.equal(persistent.getItem('janet_guest_id'), id);

const reloaded = await browser(persistent);
assert.equal(reloaded.window.JanetSupabase.getGuestId(), id);
const other = await browser();
assert.notEqual(other.window.JanetSupabase.getGuestId(), id);
const guest = await other.window.JanetAuth.createGuest('guest_new');
assert.equal(guest.guestId, other.window.JanetSupabase.getGuestId());

await first.options.global.fetch('https://yydyiugejilizqyowrgn.supabase.co/rest/v1/comments', {
  headers: { authorization: 'Bearer preserved', 'x-test': 'kept' }
});
const sent = first.requests.at(-1).init.headers;
assert.equal(sent.get('x-janet-guest-token'), token);
assert.equal(sent.get('authorization'), 'Bearer preserved');
assert.equal(sent.get('x-test'), 'kept');
await first.options.global.fetch('https://example.test/rest/v1/comments', { headers: {} });
assert.equal(new Headers(first.requests.at(-1).init.headers).has('x-janet-guest-token'), false);
await first.options.global.fetch('https://yydyiugejilizqyowrgn.supabase.co/auth/v1/settings', { headers: {} });
assert.equal(new Headers(first.requests.at(-1).init.headers).has('x-janet-guest-token'), false);

const unavailable = {
  getItem() { throw new Error('storage disabled'); },
  setItem() { throw new Error('storage disabled'); },
  removeItem() { throw new Error('storage disabled'); }
};
const memoryOnly = await browser(unavailable, unavailable);
assert.match(memoryOnly.window.JanetSupabase.getGuestId(), /^guest_[a-f0-9]{64}$/);
console.log('PASS: secure guest IDs, reload persistence, legacy display name, independent browsers, credential-scoped fetch, unavailable storage');
