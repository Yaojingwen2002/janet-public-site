(function() {
  'use strict';

  const STORAGE = {
    guestId: 'janet_guest_id',
    guestName: 'janet_guest_name',
    skipped: 'janet_visit_skipped'
  };

  const RESERVED_NAMES = ['janet', 'admin', 'administrator', 'system', 'root', 'official', 'support', 'moderator'];
  const USERNAME_ALLOWED_CHARS = /^[A-Za-z0-9_]+$/;
  const USERNAME_PATTERN = /^[A-Za-z0-9_]{3,20}$/;
  const USERNAME_HELP = '可用 3-20 位英文字母、数字、下划线，例如 janet_ai、creator2026、guest_123。不能使用中文、空格、标点、emoji 或系统保留名。';
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

  function clearLocalGuest() {
    localStorage.removeItem(STORAGE.guestId);
    localStorage.removeItem(STORAGE.guestName);
  }

  function localGuestProfile(user) {
    const displayName = profileName(null, user);
    return {
      id: user.id,
      username: displayName,
      display_name: displayName,
      email: '',
      is_guest: true,
      newsletter_opt_in: false,
      local_guest: true
    };
  }

  function localGuestSession() {
    const guestId = localStorage.getItem(STORAGE.guestId);
    const guestName = localStorage.getItem(STORAGE.guestName);
    if (!guestId || !guestName || validateUsername(guestName)) return null;
    return {
      user: {
        id: guestId,
        email: '',
        is_anonymous: true,
        user_metadata: {
          username: guestName,
          display_name: guestName,
          is_guest: true,
          local_guest: true
        }
      }
    };
  }

  function isLocalGuestSession(session) {
    return Boolean(session && session.user && session.user.user_metadata && session.user.user_metadata.local_guest);
  }

  function createLocalGuestSession(username) {
    const guestName = normalizeUsername(username) || randomGuestName();
    const usernameError = validateUsername(guestName);
    if (usernameError) throw new Error(usernameError);
    const guestId = localStorage.getItem(STORAGE.guestId) || ('guest_' + Math.random().toString(36).slice(2, 12).toUpperCase());
    localStorage.setItem(STORAGE.guestId, guestId);
    localStorage.setItem(STORAGE.guestName, guestName);
    currentSession = {
      user: {
        id: guestId,
        email: '',
        is_anonymous: true,
        user_metadata: {
          username: guestName,
          display_name: guestName,
          is_guest: true,
          local_guest: true
        }
      }
    };
    currentUser = currentSession.user;
    currentProfile = localGuestProfile(currentUser);
    ready = true;
    notify();
    return getIdentity();
  }

  function normalizeUsername(value) {
    return String(value || '').trim();
  }

  function booleanValue(value) {
    if (value === true || value === false) return value;
    if (typeof value === 'string') {
      if (/^true$/i.test(value)) return true;
      if (/^false$/i.test(value)) return false;
    }
    return null;
  }

  function resolveNewsletterOptIn(profile, user) {
    if (isGuestUser(user, profile)) return false;
    const meta = user && user.user_metadata ? user.user_metadata : {};
    const metaValue = booleanValue(meta.newsletter_opt_in);
    if (metaValue !== null) return metaValue;
    if (profile && profile.newsletter_opt_in === true) return true;
    return Boolean(user && user.email);
  }

  function normalizeProfileForIdentity(profile, user) {
    const newsletterOptIn = resolveNewsletterOptIn(profile, user);
    if (profile) return { ...profile, newsletter_opt_in: newsletterOptIn };
    if (!isGuestUser(user, profile)) return { newsletter_opt_in: newsletterOptIn };
    return profile;
  }

  function isReservedUsername(username) {
    return RESERVED_NAMES.includes(normalizeUsername(username).toLowerCase());
  }

  function validateUsername(value) {
    const username = normalizeUsername(value);
    if (!username) return '请填写用户名。' + USERNAME_HELP;
    if (!USERNAME_ALLOWED_CHARS.test(username)) return '用户名只能使用英文字母、数字、下划线；不能使用中文、空格、标点或 emoji。';
    if (username.length < 3 || username.length > 20) return '用户名需要 3-20 位。' + USERNAME_HELP;
    if (!USERNAME_PATTERN.test(username)) return '用户名格式不正确。' + USERNAME_HELP;
    if (isReservedUsername(username)) return '“' + username + '” 是系统保留名，不能使用。请换成个人昵称，例如 janet_ai、creator2026、guest_123。';
    return '';
  }

  function getUsernameRules() {
    return {
      help: USERNAME_HELP,
      examples: ['janet_ai', 'creator2026', 'guest_123'],
      reservedNames: RESERVED_NAMES.slice()
    };
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

    const normalizedProfile = normalizeProfileForIdentity(profile, user);
    const guest = isGuestUser(user, normalizedProfile);
    const name = profileName(normalizedProfile, user);
    if (guest) {
      return {
        mode: 'guest',
        user,
        userId: null,
        guestId: user.id,
        email: '',
        displayName: name || randomGuestName(),
        avatar: '游',
        profile: normalizedProfile || null
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
      profile: normalizedProfile || null
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
      currentSession = localGuestSession();
      currentUser = currentSession ? currentSession.user : null;
      currentProfile = currentSession ? localGuestProfile(currentSession.user) : null;
      ready = true;
      notify();
      return currentSession;
    }

    const client = supabaseClient();
    const { data } = await client.auth.getSession();
    currentSession = data && data.session ? data.session : localGuestSession();
    currentUser = currentSession ? currentSession.user : null;
    currentProfile = currentUser ? (isLocalGuestSession(currentSession) ? localGuestProfile(currentUser) : await fetchProfile(currentUser.id)) : null;
    if (data && data.session) clearLocalGuest();
    ready = true;
    notify();
    return currentSession;
  }

  function bindSupabaseAuthListener() {
    if (!isConfigured() || authListenerBound) return;
    authListenerBound = true;
    supabaseClient().auth.onAuthStateChange(async (_event, session) => {
      currentSession = session || localGuestSession();
      currentUser = session && session.user ? session.user : null;
      if (session && session.user) {
        currentProfile = await fetchProfile(session.user.id);
        clearLocalGuest();
      } else {
        currentUser = currentSession ? currentSession.user : null;
        currentProfile = currentUser ? localGuestProfile(currentUser) : null;
      }
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
    if (/email not confirmed|not confirmed|confirm.*email|email.*confirm/.test(message)) return '账号已创建，但邮箱还没确认。请先点确认邮件，或在 Supabase 关闭 Confirm email。';
    if (/anonymous.*disabled|anonymous sign-?ins?.*disabled|signup.*anonymous|provider.*anonymous/.test(message)) return '游客登录未启用：请在 Supabase 打开 Anonymous Sign-Ins。';
    if (/profiles_username|username.*duplicate|duplicate key.*username|violates unique constraint.*username/.test(message)) return '这个用户名已被使用，请换一个。可用 3-20 位英文字母、数字、下划线。';
    if (/newsletter_opt_in|schema cache|could not find.*column/.test(message)) return 'Supabase 资料表缺少晨报订阅字段，请先执行后台修复 SQL。';
    if (/row-level security|rls|permission denied|policy/.test(message)) return 'Supabase 资料表权限还没开，请先执行后台修复 SQL。';
    if (/relation.*does not exist|table.*does not exist/.test(message)) return 'Supabase 订阅资料表还没建好，请先执行后台修复 SQL。';
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

  async function syncNewsletterPreference(email, displayName, subscribed) {
    const result = await saveNewsletterPreference(email, displayName, subscribed);
    if (!result.ok) {
      console.warn('[auth] newsletter_subscribers sync failed:', result.reason);
    }
    return result;
  }

  async function signInWithPassword(email, password) {
    const client = await waitForSupabaseClient();
    const cleanEmail = normalizeEmail(email);
    const { error } = await client.auth.signInWithPassword({ email: cleanEmail, password });
    if (error) throw new Error(friendlyAuthError(error));
    clearLocalGuest();
    await refreshSession();
    const identity = getIdentity();
    if (identity && identity.mode === 'user' && identity.email && identity.profile && identity.profile.newsletter_opt_in) {
      saveNewsletterPreference(identity.email, identity.displayName, true).catch((saveError) => {
        console.warn('[auth] newsletter sync after login failed:', saveError && saveError.message ? saveError.message : saveError);
      });
    }
    return identity;
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
      if (!isLocalGuestSession(currentSession)) await client.auth.signOut();
      clearLocalGuest();
      currentSession = null;
      currentUser = null;
      currentProfile = null;
    }

    const newsletterOptIn = !(options && options.newsletterOptIn === false);
    const newsletterUpdatedAt = new Date().toISOString();
    const { data, error } = await client.auth.signUp({
      email: cleanEmail,
      password,
      options: {
        data: {
          username,
          display_name: username,
          newsletter_opt_in: newsletterOptIn,
          newsletter_opt_in_updated_at: newsletterUpdatedAt,
          is_guest: false
        }
      }
    });
    if (error) throw new Error(friendlyAuthError(error));

    if (data && data.user && data.user.id) {
      const profileUpdate = await client.from('profiles').upsert({
        id: data.user.id,
        username,
        display_name: username,
        email: cleanEmail,
        is_guest: false,
        newsletter_opt_in: newsletterOptIn,
        updated_at: newsletterUpdatedAt
      }, { onConflict: 'id' });
      if (profileUpdate.error) console.warn('[auth] profile update after signup failed:', profileUpdate.error.message);
    }
    await syncNewsletterPreference(cleanEmail, username, newsletterOptIn);

    const { data: sessionData } = await client.auth.getSession();
    if (!sessionData || !sessionData.session) {
      const login = await client.auth.signInWithPassword({ email: cleanEmail, password });
      if (login.error) throw new Error(friendlyAuthError(login.error));
    }

    await refreshSession();
    return getIdentity();
  }

  async function signInAnonymously(options) {
    if (getIdentity()) throw new Error('你已经登录了，请先退出再使用游客身份');

    const username = normalizeUsername(options && options.username) || randomGuestName();
    const usernameError = validateUsername(username);
    if (usernameError) throw new Error(usernameError);

    let client;
    try {
      client = await waitForSupabaseClient();
    } catch (_error) {
      return createLocalGuestSession(username);
    }

    const { error } = await client.auth.signInAnonymously({
      options: {
        data: {
          username,
          display_name: username,
          is_guest: true
        }
      }
    });
    if (error) {
      const message = friendlyAuthError(error);
      if (/游客登录未启用/.test(message)) {
        console.warn('[auth] anonymous sign-in disabled, using local guest fallback');
        return createLocalGuestSession(username);
      }
      throw new Error(message);
    }
    await refreshSession();
    return getIdentity();
  }

  async function updateUsername(username) {
    const identity = getIdentity();
    if (!identity || !identity.user) throw new Error('请先登录');

    const clean = normalizeUsername(username);
    const usernameError = validateUsername(clean);
    if (usernameError) throw new Error(usernameError);

    if (identity.mode === 'guest' && isLocalGuestSession(currentSession)) {
      return createLocalGuestSession(clean);
    }

    const client = await waitForSupabaseClient();

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
    const newsletterOptIn = Boolean(subscribed);
    const updatedAt = new Date().toISOString();
    const metadata = identity.user && identity.user.user_metadata ? identity.user.user_metadata : {};
    const { data: authData, error: authError } = await client.auth.updateUser({
      data: {
        ...metadata,
        newsletter_opt_in: newsletterOptIn,
        newsletter_opt_in_updated_at: updatedAt
      }
    });
    if (authError) throw new Error(friendlyAuthError(authError));

    const { error } = await client.from('profiles').update({
      newsletter_opt_in: Boolean(subscribed),
      updated_at: updatedAt
    }).eq('id', identity.user.id);
    if (error) console.warn('[auth] profile newsletter update failed:', error.message);
    await syncNewsletterPreference(identity.email, identity.displayName, newsletterOptIn);

    if (authData && authData.user) currentUser = authData.user;
    if (currentProfile) {
      currentProfile = {
        ...currentProfile,
        newsletter_opt_in: newsletterOptIn,
        updated_at: updatedAt
      };
    }
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
    clearLocalGuest();
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
    getUsernameRules,
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
