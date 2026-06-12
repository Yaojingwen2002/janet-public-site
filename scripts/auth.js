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
    return 'Janet 游客 ' + (suffix || '0000');
  }

  function normalizeEmail(email) {
    return String(email || '').trim().toLowerCase();
  }

  function displayNameFromUser(user) {
    const meta = user && user.user_metadata ? user.user_metadata : {};
    return meta.display_name || meta.username || meta.full_name || meta.name || user.email || 'Janet 用户';
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
      const displayName = displayNameFromUser(currentUser);
      return {
        mode: 'user',
        user: currentUser,
        userId: currentUser.id,
        guestId: null,
        email: currentUser.email || '',
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

  function identityNavLabel(identity) {
    if (!identity) return '登录';
    if (identity.mode === 'user') return '已登录：' + (identity.email || identity.displayName);
    return '游客身份：' + identity.displayName;
  }

  function updateNav() {
    qsa('.nav-inner').forEach((navInner) => {
      let authSlot = qs('.nav-auth-slot', navInner);
      if (!authSlot) {
        authSlot = document.createElement('div');
        authSlot.className = 'nav-auth-slot';
        authSlot.innerHTML = [
          '<button class="nav-auth-btn" type="button" data-janet-login>登录</button>',
          '<div class="nav-user" data-janet-user hidden>',
          '  <span class="nav-user-avatar" data-janet-user-avatar>J</span>',
          '  <span class="nav-user-name" data-janet-user-name>登录</span>',
          '  <button class="nav-logout-btn" type="button" data-janet-logout>退出</button>',
          '</div>'
        ].join('');
        navInner.appendChild(authSlot);
      }
    });

    const identity = getIdentity();
    qsa('[data-janet-login]').forEach((button) => {
      button.hidden = Boolean(identity);
      button.textContent = '登录';
      if (!button.dataset.boundAuth) {
        button.dataset.boundAuth = 'true';
        button.addEventListener('click', () => window.JanetVisitorModal && window.JanetVisitorModal.open('login'));
      }
    });
    qsa('[data-janet-user]').forEach((userEl) => {
      userEl.hidden = !identity;
    });
    qsa('[data-janet-user-avatar]').forEach((avatar) => {
      avatar.textContent = identity ? identity.avatar : 'J';
    });
    qsa('[data-janet-user-name]').forEach((name) => {
      name.textContent = identityNavLabel(identity);
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
    if (currentUser) {
      localStorage.removeItem(STORAGE.guestId);
      localStorage.removeItem(STORAGE.guestName);
      localStorage.removeItem(STORAGE.skipped);
    }
    updateNav();
    notify();
    return currentUser;
  }

  function bindSupabaseAuthListener() {
    if (!isConfigured() || authListenerBound) return;
    authListenerBound = true;
    supabaseClient().auth.onAuthStateChange((_event, session) => {
      currentUser = session && session.user ? session.user : null;
      if (currentUser) {
        localStorage.removeItem(STORAGE.guestId);
        localStorage.removeItem(STORAGE.guestName);
        localStorage.removeItem(STORAGE.skipped);
      }
      updateNav();
      notify();
    });
  }

  function authRedirectUrl() {
    return window.location.href.split('#')[0];
  }

  async function waitForSupabaseClient() {
    if (window.JanetSupabase && window.JanetSupabase.ready && !supabaseClient()) {
      await window.JanetSupabase.ready;
    }
    if (!isConfigured()) throw new Error('Supabase not configured');
    return supabaseClient();
  }

  function friendlyAuthError(error, mode) {
    const message = String(error && error.message ? error.message : error || '').toLowerCase();
    if (/rate|limit|too many|over request|security purposes/.test(message)) {
      return '邮件已发送或请求过快，请稍后再试。';
    }
    if (/already|registered|exists|duplicate/.test(message)) {
      return mode === 'create' ? '这个邮箱可能已经注册，请切换到登录。' : '这个邮箱可以登录，请查收登录邮件。';
    }
    if (/invalid|email/.test(message)) return '请填写正确的邮箱地址。';
    if (/not configured|supabase/.test(message)) return '登录服务还没连上，请先用游客身份浏览。';
    return mode === 'create' ? '创建账户失败，请稍后再试。' : '邮件发送失败，请稍后再试。';
  }

  async function sendAuthEmail(email, options) {
    const client = await waitForSupabaseClient();
    const cleanEmail = normalizeEmail(email);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) throw new Error('invalid email');

    const { error } = await client.auth.signInWithOtp({
      email: cleanEmail,
      options: {
        emailRedirectTo: authRedirectUrl(),
        shouldCreateUser: options.mode === 'create',
        data: options.data || {}
      }
    });
    if (error) throw error;
    return cleanEmail;
  }

  async function sendLoginEmail(email) {
    try {
      return await sendAuthEmail(email, { mode: 'login' });
    } catch (error) {
      throw new Error(friendlyAuthError(error, 'login'));
    }
  }

  async function saveNewsletterPreference(email, displayName, subscribed) {
    let client;
    try {
      client = await waitForSupabaseClient();
    } catch (_error) {
      return { ok: false, reason: 'not_configured' };
    }
    const cleanEmail = normalizeEmail(email);
    if (!cleanEmail) return { ok: false, reason: 'missing_email' };

    const payload = {
      email: cleanEmail,
      display_name: String(displayName || '').trim() || null,
      subscribed: Boolean(subscribed),
      source: 'signup',
      updated_at: new Date().toISOString()
    };
    const { error } = await client
      .from('newsletter_subscribers')
      .upsert(payload, { onConflict: 'email' });
    if (error) return { ok: false, reason: error.message };
    return { ok: true };
  }

  async function createAccount(options) {
    const email = normalizeEmail(options && options.email);
    const displayName = String(options && options.displayName ? options.displayName : '').trim();
    const subscribed = Boolean(options && options.subscribed);
    try {
      const cleanEmail = await sendAuthEmail(email, {
        mode: 'create',
        data: {
          display_name: displayName || email.split('@')[0],
          username: displayName || email.split('@')[0],
          newsletter_subscribed: subscribed
        }
      });
      await saveNewsletterPreference(cleanEmail, displayName, subscribed);
      return cleanEmail;
    } catch (error) {
      throw new Error(friendlyAuthError(error, 'create'));
    }
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
    sendLoginEmail,
    createAccount,
    saveNewsletterPreference,
    friendlyAuthError,
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
