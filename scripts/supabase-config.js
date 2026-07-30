(function() {
  'use strict';

  const SUPABASE_URL = 'https://yydyiugejilizqyowrgn.supabase.co';
  const SUPABASE_ANON_KEY = 'sb_publishable_r58xVkLC-ZTlhDwiLPKp6w_vNwmOLaQ';
  const SUPABASE_CDN = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
  const AUTH_PERSISTENCE_KEY = 'janet_auth_persistence';
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

  createClient();
})();
