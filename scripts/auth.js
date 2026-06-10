(function() {
  'use strict';

  const STORAGE = {
    guestId: 'janet_guest_id',
    guestName: 'janet_guest_name',
    skipped: 'janet_visit_skipped'
  };

  const listeners = new Set();
  let currentUser = null;
  let authListenerBound = false;

  const qs = (selector, parent = document) => parent.querySelector(selector);
  const qsa = (selector, parent = document) => Array.from(parent.querySelectorAll(selector));
  const supabaseClient = () => window.JanetSupabase && window.JanetSupabase.client;
  const isConfigured = () => Boolean(window.JanetSupabase && window.JanetSupabase.isConfigured && supabaseClient());

  function randomGuestId() {
    return 'guest_' + Math.random().toString(36).slice(2, 10);
  }

  function guestLabelFromId(guestId) {
    const suffix = String(guestId || '').replace(/^guest_/, '').slice(0, 4).toUpperCase();
    return '游客_' + (suffix || 'JANET');
  }

  function getGuest() {
    const guestId = localStorage.getItem(STORAGE.guestId);
    if (!guestId) return null;
    return {
      mode: 'guest',
      guestId,
      userId: null,
      displayName: localStorage.getItem(STORAGE.guestName) || guestLabelFromId(guestId),
      avatar: '游'
    };
  }

  function getIdentity() {
    if (currentUser) {
      const meta = currentUser.user_metadata || {};
      const displayName = meta.full_name || meta.name || meta.nickname || currentUser.email || 'Janet 用户';
      return {
        mode: 'user',
        user: currentUser,
        userId: currentUser.id,
        guestId: null,
        displayName,
        avatar: String(displayName || 'J').trim().slice(0, 1).toUpperCase()
      };
    }
    return getGuest();
  }

  function notify() {
    const identity = getIdentity();
    listeners.forEach((listener) => listener(identity));
    document.dispatchEvent(new CustomEvent('janet:auth-changed', { detail: { identity } }));
  }

  function updateNav() {
    qsa('.nav-inner').forEach((navInner) => {
      let authSlot = qs('.nav-auth-slot', navInner);
      if (!authSlot) {
        authSlot = document.createElement('div');
        authSlot.className = 'nav-auth-slot';
        authSlot.innerHTML = [
          '<button class="nav-auth-btn" type="button" data-janet-login>登陆</button>',
          '<div class="nav-user" data-janet-user hidden>',
          '  <span class="nav-user-avatar" data-janet-user-avatar>J</span>',
          '  <span class="nav-user-name" data-janet-user-name>游客</span>',
          '  <button class="nav-logout-btn" type="button" data-janet-logout>退出</button>',
          '</div>'
        ].join('');
        navInner.appendChild(authSlot);
      }
    });

    const identity = getIdentity();
    qsa('[data-janet-login]').forEach((button) => {
      button.hidden = Boolean(identity);
      if (!button.dataset.boundAuth) {
        button.dataset.boundAuth = 'true';
        button.addEventListener('click', () => window.JanetVisitorModal && window.JanetVisitorModal.open());
      }
    });
    qsa('[data-janet-user]').forEach((userEl) => {
      userEl.hidden = !identity;
    });
    qsa('[data-janet-user-avatar]').forEach((avatar) => {
      avatar.textContent = identity ? identity.avatar : 'J';
    });
    qsa('[data-janet-user-name]').forEach((name) => {
      name.textContent = identity ? identity.displayName : '游客';
    });
    qsa('[data-janet-logout]').forEach((button) => {
      if (!button.dataset.boundAuth) {
        button.dataset.boundAuth = 'true';
        button.addEventListener('click', logout);
      }
    });
  }

  function createGuest(name) {
    const guestId = localStorage.getItem(STORAGE.guestId) || randomGuestId();
    localStorage.setItem(STORAGE.guestId, guestId);
    localStorage.setItem(STORAGE.guestName, name && name.trim() ? name.trim() : guestLabelFromId(guestId));
    localStorage.removeItem(STORAGE.skipped);
    updateNav();
    notify();
    return getGuest();
  }

  function skipForNow() {
    localStorage.setItem(STORAGE.skipped, '1');
    notify();
  }

  async function refreshSession() {
    if (!isConfigured()) {
      updateNav();
      notify();
      return null;
    }

    const client = supabaseClient();
    const { data } = await client.auth.getUser();
    currentUser = data && data.user ? data.user : null;
    updateNav();
    notify();
    return currentUser;
  }

  function bindSupabaseAuthListener() {
    if (!isConfigured() || authListenerBound) return;
    authListenerBound = true;
    supabaseClient().auth.onAuthStateChange((_event, session) => {
      currentUser = session && session.user ? session.user : null;
      updateNav();
      notify();
    });
  }

  async function signInOrSignUp(email, password, nickname) {
    if (!isConfigured()) {
      throw new Error('Supabase 还没配置。先用游客身份，或填写 supabase-config.js。');
    }
    const client = supabaseClient();
    let result = await client.auth.signInWithPassword({ email, password });
    if (result.error) {
      result = await client.auth.signUp({
        email,
        password,
        options: { data: { nickname: nickname || email.split('@')[0] } }
      });
    }
    if (result.error) throw result.error;
    currentUser = result.data.user || null;
    localStorage.removeItem(STORAGE.guestId);
    localStorage.removeItem(STORAGE.guestName);
    localStorage.removeItem(STORAGE.skipped);
    await refreshSession();
    return getIdentity();
  }

  async function signInWithGithub() {
    if (!isConfigured()) {
      throw new Error('Supabase 还没配置。先用游客身份，或填写 supabase-config.js。');
    }
    const { error } = await supabaseClient().auth.signInWithOAuth({
      provider: 'github',
      options: { redirectTo: window.location.href }
    });
    if (error) throw error;
  }

  async function logout() {
    if (isConfigured()) {
      await supabaseClient().auth.signOut();
    }
    currentUser = null;
    localStorage.removeItem(STORAGE.guestId);
    localStorage.removeItem(STORAGE.guestName);
    updateNav();
    notify();
  }

  function onChange(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  window.JanetAuth = {
    storage: STORAGE,
    getIdentity,
    createGuest,
    skipForNow,
    signInOrSignUp,
    signInWithGithub,
    logout,
    onChange,
    refreshSession,
    isConfigured
  };

  document.addEventListener('DOMContentLoaded', () => {
    updateNav();
    refreshSession().catch(() => {
      updateNav();
      notify();
    });
    bindSupabaseAuthListener();
    document.addEventListener('janet:supabase-ready', () => {
      refreshSession().catch(() => {
        updateNav();
        notify();
      });
      bindSupabaseAuthListener();
    });
  });
})();
