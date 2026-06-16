(function() {
  'use strict';

  const STORAGE = {
    guestId: 'janet_guest_id',
    guestName: 'janet_guest_name',
    skipped: 'janet_visit_skipped'
  };

  const RESERVED_NAMES = ['janet', 'admin', 'administrator', 'system', 'root', '官方', '管理员'];
  const listeners = new Set();
  let currentSession = null;
  let currentUser = null;
  let currentProfile = null;
  let authListenerBound = false;
  let ready = false;

  const supabaseClient = () => window.JanetSupabase && window.JanetSupabase.client;
  const isConfigured = () => Boolean(window.JanetSupabase && window.JanetSupabase.isConfigured && supabaseClient());

  function normalizeEmail(email) {
    return String(email || '').trim().toLowerCase();
  }

  function usernameFromEmail(email) {
    return normalizeEmail(email).split('@')[0] || 'Janet 用户';
  }

  function randomGuestName() {
    return 'guest_' + Math.random().toString(36).slice(2, 8).toUpperCase();
  }

  function normalizeUsername(value) {
    return String(value || '').trim();
  }

  function validateUsername(value) {
    const username = normalizeUsername(value);
    if (!/^[A-Za-z0-9_]{3,20}$/.test(username)) return '只能使用字母、数字、下划线，3-20 位';
    if (RESERVED_NAMES.includes(username.toLowerCase())) return '这个用户名不能使用';
    return '';
  }

  function profileName(profile, user) {
    const meta = user && user.user_metadata ? user.user_metadata : {};
    return normalizeUsername(profile && (profile.username || profile.display_name)) ||
      normalizeUsername(meta.username || meta.display_name || meta.full_name || meta.name) ||
      '';
  }

  function isGuestUser(user, profile) {
    const meta = user && user.user_metadata ? user.user_metadata : {};
    return Boolean((profile && profile.is_guest) || meta.is_guest || (user && user.is_anonymous));
  }

  function identityFromSession(session, profile) {
    const user = session && session.user ? session.user : null;
    if (!user) return null;

    const guest = isGuestUser(user, profile);
    const name = profileName(profile, user);
    if (guest) {
      return {
        mode: 'guest',
        user,
        userId: null,
        guestId: user.id,
        email: '',
        displayName: name || randomGuestName(),
        avatar: '游',
        profile: profile || null
      };
    }

    const displayName = name || user.email || 'Janet 用户';
    return {
      mode: 'user',
      user,
      userId: user.id,
      guestId: null,
      email: user.email || '',
      displayName,
      avatar: getPotatoLabel(session, profile),
      profile: profile || null
    };
  }

  function getIdentity() {
    return identityFromSession(currentSession, currentProfile);
  }

  function getPotatoLabel(session, profile) {
    if (!session || !session.user) return '登';
    if (isGuestUser(session.user, profile)) return '游';

    const name = profileName(profile, session.user);
    if (name) {
      const first = Array.from(name)[0] || '';
      return /[\u4e00-\u9fa5]/.test(first) ? first : first.toUpperCase();
    }

    const email = session.user.email || '';
    return email ? email[0].toUpperCase() : '我';
  }

  function notify() {
    const identity = getIdentity();
    listeners.forEach((listener) => listener(identity));
    document.dispatchEvent(new CustomEvent('janet:auth-changed', {
      detail: {
        identity,
        session: currentSession,
        profile: currentProfile,
        ready
      }
    }));
  }

  async function waitForSupabaseClient() {
    if (window.JanetSupabase && window.JanetSupabase.ready && !supabaseClient()) {
      await window.JanetSupabase.ready;
    }
    if (!isConfigured()) throw new Error('登录服务还没连上，请稍后再试');
    return supabaseClient();
  }

  async function fetchProfile(userId) {
    if (!userId || !isConfigured()) return null;
    const { data, error } = await supabaseClient()
      .from('profiles')
      .select('id, username, display_name, email, is_guest, newsletter_opt_in, created_at, updated_at')
      .eq('id', userId)
      .maybeSingle();
    if (error) {
      console.warn('[auth] profile fetch failed:', error.message);
      return null;
    }
    return data || null;
  }

  async function refreshSession() {
    if (!isConfigured()) {
      currentSession = null;
      currentUser = null;
      currentProfile = null;
      ready = true;
      notify();
      return null;
    }

    const client = supabaseClient();
    const { data } = await client.auth.getSession();
    currentSession = data && data.session ? data.session : null;
    currentUser = currentSession ? currentSession.user : null;
    currentProfile = currentUser ? await fetchProfile(currentUser.id) : null;
    localStorage.removeItem(STORAGE.guestId);
    localStorage.removeItem(STORAGE.guestName);
    ready = true;
    notify();
    return currentSession;
  }

  function bindSupabaseAuthListener() {
    if (!isConfigured() || authListenerBound) return;
    authListenerBound = true;
    supabaseClient().auth.onAuthStateChange(async (_event, session) => {
      currentSession = session || null;
      currentUser = session && session.user ? session.user : null;
      currentProfile = currentUser ? await fetchProfile(currentUser.id) : null;
      localStorage.removeItem(STORAGE.guestId);
      localStorage.removeItem(STORAGE.guestName);
      ready = true;
      notify();
    });
  }

  function getBaseUrl() {
    const isLocal = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
    return isLocal ? location.origin : 'https://yaojingwen2002.github.io/janet-public-site';
  }

  function getResetPasswordRedirectUrl() {
    return getBaseUrl().replace(/\/$/, '') + '/auth/reset-password.html';
  }

  function friendlyAuthError(error) {
    const raw = String(error && error.message ? error.message : error || '');
    const message = raw.toLowerCase();
    if (/invalid login credentials/.test(message)) return '邮箱或密码不正确';
    if (/already registered|user already registered|already exists|duplicate/.test(message)) return '该邮箱已注册，请直接登录';
    if (/password should be at least 6 characters|password.*6/.test(message)) return '密码至少 6 位';
    if (/network|failed to fetch|load failed/.test(message)) return '网络异常，请稍后再试';
    if (/not configured|supabase|登录服务/.test(message)) return '登录服务还没连上，请稍后再试';
    if (/captcha|turnstile|hcaptcha/.test(message)) return '安全校验失败，请稍后再试';
    if (/current password|invalid credentials|incorrect/.test(message)) return '当前密码不正确或更新失败';
    return '操作失败，请稍后重试';
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
      display_name: normalizeUsername(displayName) || null,
      subscribed: Boolean(subscribed),
      source: 'signup',
      updated_at: new Date().toISOString()
    };
    const { error } = await client.from('newsletter_subscribers').upsert(payload, { onConflict: 'email' });
    if (error) return { ok: false, reason: error.message };
    return { ok: true };
  }

  async function signInWithPassword(email, password) {
    const client = await waitForSupabaseClient();
    const cleanEmail = normalizeEmail(email);
    const { error } = await client.auth.signInWithPassword({ email: cleanEmail, password });
    if (error) throw new Error(friendlyAuthError(error));
    await refreshSession();
    return getIdentity();
  }

  async function signUp(options) {
    const client = await waitForSupabaseClient();
    const username = normalizeUsername(options && options.username);
    const usernameError = validateUsername(username);
    if (usernameError) throw new Error(usernameError);

    const cleanEmail = normalizeEmail(options && options.email);
    const password = String(options && options.password ? options.password : '');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) throw new Error('请填写正确的邮箱地址');
    if (password.length < 6) throw new Error('密码至少 6 位');

    if (getIdentity() && getIdentity().mode === 'guest') {
      await client.auth.signOut();
      currentSession = null;
      currentUser = null;
      currentProfile = null;
    }

    const newsletterOptIn = Boolean(options && options.newsletterOptIn);
    const { data, error } = await client.auth.signUp({
      email: cleanEmail,
      password,
      options: {
        data: {
          username,
          display_name: username,
          newsletter_opt_in: newsletterOptIn,
          is_guest: false
        }
      }
    });
    if (error) throw new Error(friendlyAuthError(error));

    if (data && data.user && data.user.id) {
      const profileUpdate = await client.from('profiles').update({
        username,
        display_name: username,
        email: cleanEmail,
        is_guest: false,
        newsletter_opt_in: newsletterOptIn,
        updated_at: new Date().toISOString()
      }).eq('id', data.user.id);
      if (profileUpdate.error) console.warn('[auth] profile update after signup failed:', profileUpdate.error.message);
    }
    await saveNewsletterPreference(cleanEmail, username, newsletterOptIn);

    const { data: sessionData } = await client.auth.getSession();
    if (!sessionData || !sessionData.session) {
      const login = await client.auth.signInWithPassword({ email: cleanEmail, password });
      if (login.error) throw new Error(friendlyAuthError(login.error));
    }

    await refreshSession();
    return getIdentity();
  }

  async function signInAnonymously(options) {
    const client = await waitForSupabaseClient();
    if (getIdentity()) throw new Error('你已经登录了，请先退出再使用游客身份');

    const username = normalizeUsername(options && options.username) || randomGuestName();
    const usernameError = validateUsername(username);
    if (usernameError) throw new Error(usernameError);

    const { error } = await client.auth.signInAnonymously({
      options: {
        data: {
          username,
          display_name: username,
          is_guest: true
        }
      }
    });
    if (error) throw new Error('游客登录失败，请稍后再试');
    await refreshSession();
    return getIdentity();
  }

  async function updateUsername(username) {
    const client = await waitForSupabaseClient();
    const identity = getIdentity();
    if (!identity || !identity.user) throw new Error('请先登录');

    const clean = normalizeUsername(username);
    const usernameError = validateUsername(clean);
    if (usernameError) throw new Error(usernameError);

    const { error: authError } = await client.auth.updateUser({
      data: {
        username: clean,
        display_name: clean,
        is_guest: identity.mode === 'guest'
      }
    });
    if (authError) throw new Error(friendlyAuthError(authError));

    const { error } = await client.from('profiles').update({
      username: clean,
      display_name: clean,
      updated_at: new Date().toISOString()
    }).eq('id', identity.user.id);
    if (error) throw new Error(friendlyAuthError(error));

    await refreshSession();
    return getIdentity();
  }

  async function updatePassword(oldPassword, newPassword) {
    const client = await waitForSupabaseClient();
    const identity = getIdentity();
    if (!identity || identity.mode !== 'user' || !identity.email) throw new Error('请先登录正式账号');
    if (String(newPassword || '').length < 6) throw new Error('密码至少 6 位');

    const direct = await client.auth.updateUser({
      password: newPassword,
      currentPassword: oldPassword
    });
    if (!direct.error) {
      await refreshSession();
      return true;
    }

    const verify = await client.auth.signInWithPassword({
      email: identity.email,
      password: oldPassword
    });
    if (verify.error) throw new Error('当前密码不正确');

    const update = await client.auth.updateUser({ password: newPassword });
    if (update.error) throw new Error(friendlyAuthError(update.error));
    await refreshSession();
    return true;
  }

  async function sendPasswordReset(email) {
    const client = await waitForSupabaseClient();
    const cleanEmail = normalizeEmail(email);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) throw new Error('请填写正确的邮箱地址');
    const { error } = await client.auth.resetPasswordForEmail(cleanEmail, {
      redirectTo: getResetPasswordRedirectUrl()
    });
    if (error) throw new Error(friendlyAuthError(error));
    return cleanEmail;
  }

  async function updateNewsletterPreference(subscribed) {
    const identity = getIdentity();
    if (!identity || identity.mode !== 'user' || !identity.email) throw new Error('请先登录正式账号');
    const client = await waitForSupabaseClient();
    await saveNewsletterPreference(identity.email, identity.displayName, subscribed);
    const { error } = await client.from('profiles').update({
      newsletter_opt_in: Boolean(subscribed),
      updated_at: new Date().toISOString()
    }).eq('id', identity.user.id);
    if (error) throw new Error(friendlyAuthError(error));
    await refreshSession();
    return getIdentity();
  }

  async function logout() {
    if (isConfigured()) {
      await supabaseClient().auth.signOut();
    }
    currentSession = null;
    currentUser = null;
    currentProfile = null;
    localStorage.removeItem(STORAGE.guestId);
    localStorage.removeItem(STORAGE.guestName);
    notify();
  }

  function skipForNow() {
    localStorage.setItem(STORAGE.skipped, '1');
    notify();
  }

  async function createGuest(name) {
    return signInAnonymously({ username: name || randomGuestName() });
  }

  function onChange(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  window.JanetAuth = {
    storage: STORAGE,
    getIdentity,
    getSession: () => currentSession,
    getProfile: () => currentProfile,
    getPotatoLabel: () => getPotatoLabel(currentSession, currentProfile),
    randomGuestName,
    validateUsername,
    createGuest,
    skipForNow,
    signInWithPassword,
    signUp,
    signInAnonymously,
    updateUsername,
    updatePassword,
    sendPasswordReset,
    updateNewsletterPreference,
    saveNewsletterPreference,
    friendlyAuthError,
    logout,
    onChange,
    refreshSession,
    isConfigured,
    isReady: () => ready
  };

  document.addEventListener('DOMContentLoaded', () => {
    refreshSession().catch(() => {
      ready = true;
      notify();
    });
    bindSupabaseAuthListener();
    document.addEventListener('janet:supabase-ready', () => {
      refreshSession().catch(() => {
        ready = true;
        notify();
      });
      bindSupabaseAuthListener();
    });
  });
})();
