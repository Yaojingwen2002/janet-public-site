(function() {
  'use strict';

  const SUPABASE_URL = 'https://yydyiugejilizqyowrgn.supabase.co';
  const SUPABASE_ANON_KEY = 'sb_publishable_r58xVkLC-ZTlhDwiLPKp6w_vNwmOLaQ';
  const SUPABASE_CDN = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
  const AUTH_PERSISTENCE_KEY = 'janet_auth_persistence';
  const GUEST_TOKEN_KEY = 'janet_guest_token_v1';
  let guestToken = '';
  let guestId = null;
  const isConfigured = /^https:\/\/.+\.supabase\.co$/i.test(SUPABASE_URL) &&
    SUPABASE_ANON_KEY &&
    SUPABASE_ANON_KEY !== 'YOUR_ANON_KEY';

  let client = null;
  let readyResolve;
  const ready = new Promise((resolve) => {
    readyResolve = resolve;
  });

  function safeStorage(name) {
    try {
      return window[name] || null;
    } catch (_error) {
      return null;
    }
  }

  const localStore = safeStorage('localStorage');
  const sessionStore = safeStorage('sessionStorage');

  async function prepareGuestIdentity() {
    // Only the hash is public. The random bearer credential stays in this browser.
    if (!window.crypto || !window.crypto.subtle) return;
    let token = storageGet(localStore, GUEST_TOKEN_KEY) || storageGet(sessionStore, GUEST_TOKEN_KEY);
    if (!/^[a-f0-9]{64}$/.test(token || '')) {
      token = Array.from(window.crypto.getRandomValues(new Uint8Array(32)),
        (byte) => byte.toString(16).padStart(2, '0')).join('');
      if (!storageSet(localStore, GUEST_TOKEN_KEY, token)) storageSet(sessionStore, GUEST_TOKEN_KEY, token);
    }
    const digest = await window.crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
    guestToken = token;
    guestId = 'guest_' + Array.from(new Uint8Array(digest),
      (byte) => byte.toString(16).padStart(2, '0')).join('');
  }

  function guestFetch(input, init) {
    const target = new URL(typeof input === 'string' ? input : input.url);
    if (guestToken && target.origin === SUPABASE_URL && target.pathname.startsWith('/rest/v1/')) {
      const headers = new Headers((init && init.headers) || (typeof input !== 'string' && input.headers) || {});
      headers.set('x-janet-guest-token', guestToken);
      return window.fetch(input, { ...init, headers });
    }
    return window.fetch(input, init);
  }

  function storageGet(storage, key) {
    if (!storage) return null;
    try {
      return storage.getItem(key);
    } catch (_error) {
      return null;
    }
  }

  function storageSet(storage, key, value) {
    if (!storage) return false;
    try {
      storage.setItem(key, value);
      return true;
    } catch (_error) {
      return false;
    }
  }

  function storageRemove(storage, key) {
    if (!storage) return;
    try {
      storage.removeItem(key);
    } catch (_error) {
      // Storage may be disabled in privacy mode. Supabase will keep the
      // in-memory session for the current page in that case.
    }
  }

  function getPersistence() {
    const value = storageGet(sessionStore, AUTH_PERSISTENCE_KEY) ||
      storageGet(localStore, AUTH_PERSISTENCE_KEY);
    return value === 'session' ? 'session' : 'local';
  }

  function setPersistence(mode) {
    const next = mode === 'session' ? 'session' : 'local';
    storageSet(sessionStore, AUTH_PERSISTENCE_KEY, next);
    storageSet(localStore, AUTH_PERSISTENCE_KEY, next);
    if (window.JanetSupabase) window.JanetSupabase.persistence = next;
    return next;
  }

  const authStorage = {
    getItem(key) {
      const preferred = getPersistence() === 'session' ? sessionStore : localStore;
      const fallback = preferred === sessionStore ? localStore : sessionStore;
      return storageGet(preferred, key) ?? storageGet(fallback, key);
    },
    setItem(key, value) {
      const preferred = getPersistence() === 'session' ? sessionStore : localStore;
      const fallback = preferred === sessionStore ? localStore : sessionStore;
      storageSet(preferred, key, value);
      storageRemove(fallback, key);
    },
    removeItem(key) {
      storageRemove(sessionStore, key);
      storageRemove(localStore, key);
    }
  };

  window.JanetSupabase = {
    url: SUPABASE_URL,
    anonKey: SUPABASE_ANON_KEY,
    isConfigured,
    isReady: false,
    client: null,
    ready,
    persistence: getPersistence(),
    getPersistence,
    setPersistence
  };
  window.JanetSupabase.getGuestId = () => guestId;

  function finish(nextClient, error) {
    client = nextClient || null;
    window.JanetSupabase.client = client;
    window.JanetSupabase.isReady = Boolean(client);
    window.JanetSupabase.error = error || null;
    readyResolve(client);
    document.dispatchEvent(new CustomEvent('janet:supabase-ready', {
      detail: { client, error: error || null }
    }));
  }

  function createClient() {
    if (!isConfigured) {
      finish(null);
      return;
    }
    if (window.supabase && typeof window.supabase.createClient === 'function') {
      finish(window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        global: { fetch: guestFetch },
        auth: {
          storage: authStorage,
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true
        }
      }));
      return;
    }

    const script = document.createElement('script');
    script.src = SUPABASE_CDN;
    script.async = true;
    script.onload = () => {
      if (window.supabase && typeof window.supabase.createClient === 'function') {
        finish(window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
          global: { fetch: guestFetch },
          auth: {
            storage: authStorage,
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: true
          }
        }));
      } else {
        finish(null, new Error('Supabase SDK loaded without createClient'));
      }
    };
    script.onerror = () => finish(null, new Error('Supabase SDK load failed'));
    document.head.appendChild(script);
  }

  prepareGuestIdentity().catch(() => {
    // Auth and public reads still work; guest writes fail closed without a credential.
    guestToken = '';
    guestId = null;
  }).then(createClient);
})();
