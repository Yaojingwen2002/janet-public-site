(function() {
  'use strict';

  const SUPABASE_URL = 'https://yydyiugejilizqyowrgn.supabase.co';
  const SUPABASE_ANON_KEY = 'sb_publishable_r58xVkLC-ZTlhDwiLPKp6w_vNwmOLaQ';
  const SUPABASE_CDN = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
  const isConfigured = /^https:\/\/.+\.supabase\.co$/i.test(SUPABASE_URL) &&
    SUPABASE_ANON_KEY &&
    SUPABASE_ANON_KEY !== 'YOUR_ANON_KEY';

  let client = null;
  let readyResolve;
  const ready = new Promise((resolve) => {
    readyResolve = resolve;
  });

  window.JanetSupabase = {
    url: SUPABASE_URL,
    anonKey: SUPABASE_ANON_KEY,
    isConfigured,
    isReady: false,
    client: null,
    ready
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
      finish(window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY));
      return;
    }

    const script = document.createElement('script');
    script.src = SUPABASE_CDN;
    script.async = true;
    script.onload = () => {
      if (window.supabase && typeof window.supabase.createClient === 'function') {
        finish(window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY));
      } else {
        finish(null, new Error('Supabase SDK loaded without createClient'));
      }
    };
    script.onerror = () => finish(null, new Error('Supabase SDK load failed'));
    document.head.appendChild(script);
  }

  createClient();
})();
