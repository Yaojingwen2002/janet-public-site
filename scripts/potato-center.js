(function() {
  'use strict';

  const qs = (selector, parent = document) => parent.querySelector(selector);
  const qsa = (selector, parent = document) => Array.from(parent.querySelectorAll(selector));

  const state = {
    openCenter: null,
    tab: 'login',
    busy: false,
    message: '',
    error: ''
  };

  const menuLinks = [
    ['首页', 'index.html'],
    ['Janet 快车箱', 'news.html'],
    ['作品库', 'portfolio.html'],
    ['iGPT-Image2 手册', 'gpt-image2-handbook.html'],
    ['穿梭宇宙', 'shuttle-universe.html'],
    ['错位名场面', 'misaligned-scenes.html'],
    ['关于 Janet', 'index.html#about'],
    ['联系', 'index.html#contact']
  ];

  function auth() {
    return window.JanetAuth;
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function rootPrefix() {
    const path = location.pathname;
    if (/\/auth\/[^/]+\.html$/.test(path)) return '../';
    if (/\/data\/[^/]+\/[^/]+\.html$/.test(path)) return '../../';
    return '';
  }

  function linkHref(href) {
    if (/^(https?:|mailto:|#)/.test(href)) return href;
    if (location.pathname.endsWith('/index.html') && href.startsWith('index.html#')) return href.replace('index.html', '');
    return rootPrefix() + href;
  }

  function ensureMenu() {
    if (qs('#mobile-nav-menu')) return;
    const menu = document.createElement('div');
    menu.className = 'mobile-nav-menu';
    menu.id = 'mobile-nav-menu';
    menu.innerHTML = menuLinks.map(([label, href]) => '<a href="' + escapeHtml(linkHref(href)) + '">' + escapeHtml(label) + '</a>').join('');
    document.body.appendChild(menu);
  }

  function getIdentity() {
    return auth() && auth().getIdentity();
  }

  function isReady() {
    return Boolean(auth() && auth().isReady && auth().isReady());
  }

  function defaultGuestName() {
    return auth() && auth().randomGuestName ? auth().randomGuestName() : '游客-' + Math.random().toString(36).slice(2, 6).toUpperCase();
  }

  function setMessage(message, isError) {
    state.message = isError ? '' : String(message || '');
    state.error = isError ? String(message || '') : '';
  }

  function clearMessage() {
    state.message = '';
    state.error = '';
  }

  function updateLabels() {
    qsa('[data-potato-center]').forEach((center) => {
      const label = qs('[data-potato-user-label]', center);
      const trigger = qs('[data-potato-user-trigger]', center);
      if (!label) return;
      const loading = !isReady();
      label.textContent = auth() && auth().getPotatoLabel ? auth().getPotatoLabel() : '登';
      label.dataset.loading = loading ? 'true' : 'false';
      if (trigger) {
        trigger.disabled = loading;
        trigger.setAttribute('aria-expanded', String(center === state.openCenter));
      }
    });
  }

  function closeDropdown() {
    if (!state.openCenter) return;
    const dropdown = qs('.potato-dropdown', state.openCenter);
    if (dropdown) dropdown.hidden = true;
    const trigger = qs('[data-potato-user-trigger]', state.openCenter);
    if (trigger) trigger.setAttribute('aria-expanded', 'false');
    state.openCenter = null;
    state.busy = false;
    clearMessage();
    updateLabels();
  }

  function openDropdown(center, tab) {
    if (!center || !isReady()) return;
    ensureMenu();
    document.dispatchEvent(new CustomEvent('janet:close-site-menu'));
    state.openCenter = center;
    state.tab = tab || state.tab || 'login';
    clearMessage();
    renderDropdown();
    updateLabels();
  }

  function toggleDropdown(center) {
    if (state.openCenter === center) {
      closeDropdown();
      return;
    }
    const identity = getIdentity();
    openDropdown(center, identity ? 'account' : 'login');
  }

  function messageHtml() {
    if (state.error) return '<div class="potato-error" data-potato-error>' + escapeHtml(state.error) + '</div>';
    if (state.message) return '<div class="potato-status">' + escapeHtml(state.message) + '</div>';
    return '<div class="potato-error" data-potato-error hidden></div>';
  }

  function tabsHtml(active) {
    const tabs = [
      ['login', '邮箱登录'],
      ['create', '创建账号'],
      ['guest', '游客进入']
    ];
    return [
      '<div class="potato-tabs" role="tablist">',
      tabs.map(([id, label]) => '<button class="potato-tab' + (active === id ? ' is-active' : '') + '" type="button" data-potato-tab="' + id + '">' + label + '</button>').join(''),
      '</div>'
    ].join('');
  }

  function loginHtml() {
    return [
      tabsHtml('login'),
      '<div class="potato-panel">',
      messageHtml(),
      '<form class="potato-form" data-potato-form="login">',
      '  <label class="potato-field"><span>邮箱</span><input type="email" name="email" autocomplete="email" placeholder="you@example.com" required></label>',
      '  <label class="potato-field"><span>密码</span><input type="password" name="password" autocomplete="current-password" minlength="6" required></label>',
      '  <button class="potato-btn" type="submit">登录</button>',
      '  <button class="potato-link-btn" type="button" data-potato-tab="reset">忘记密码？</button>',
      '</form>',
      '</div>'
    ].join('');
  }

  function createHtml() {
    const identity = getIdentity();
    const guestWarning = identity && identity.mode === 'guest'
      ? '<p class="potato-warning">注册正式账号后，游客身份将退出，历史点赞和评论不会自动迁移。</p>'
      : '';
    return [
      tabsHtml('create'),
      '<div class="potato-panel">',
      messageHtml(),
      guestWarning,
      '<form class="potato-form" data-potato-form="create">',
      '  <label class="potato-field"><span>用户名</span><input type="text" name="username" autocomplete="nickname" minlength="2" maxlength="20" placeholder="2-20 字，中文/英文/数字/下划线" required></label>',
      '  <label class="potato-field"><span>邮箱</span><input type="email" name="email" autocomplete="email" placeholder="you@example.com" required></label>',
      '  <label class="potato-field"><span>密码</span><input type="password" name="password" autocomplete="new-password" minlength="6" required></label>',
      '  <label class="potato-field"><span>确认密码</span><input type="password" name="confirm" autocomplete="new-password" minlength="6" required></label>',
      '  <label class="potato-check"><input type="checkbox" name="newsletter"><span>订阅每日晨报</span></label>',
      '  <label class="potato-check"><input type="checkbox" name="terms" required><span>我同意隐私条款</span></label>',
      '  <button class="potato-btn" type="submit">创建账号</button>',
      '</form>',
      '</div>'
    ].join('');
  }

  function guestHtml() {
    return [
      tabsHtml('guest'),
      '<div class="potato-panel">',
      messageHtml(),
      '<form class="potato-form" data-potato-form="guest">',
      '  <label class="potato-field"><span>游客昵称</span><input type="text" name="username" value="' + escapeHtml(defaultGuestName()) + '" minlength="2" maxlength="20" required></label>',
      '  <p class="potato-warning">游客身份可评论和点赞。退出登录、清除浏览器数据或更换设备后，游客记录将无法找回，也无法迁移到新账号。如需保留记录，请注册正式账号。</p>',
      '  <button class="potato-btn" type="submit">游客进入</button>',
      '</form>',
      '</div>'
    ].join('');
  }

  function resetHtml() {
    return [
      '<div class="potato-head">',
      '  <p class="potato-kicker">Password Reset</p>',
      '  <h2 class="potato-title">找回密码</h2>',
      '  <p class="potato-sub">重置邮件会跳到正式 reset 页。</p>',
      '</div>',
      '<div class="potato-panel">',
      messageHtml(),
      '<form class="potato-form" data-potato-form="reset">',
      '  <label class="potato-field"><span>邮箱</span><input type="email" name="email" autocomplete="email" placeholder="you@example.com" required></label>',
      '  <button class="potato-btn" type="submit">发送重置邮件</button>',
      '  <button class="potato-link-btn" type="button" data-potato-tab="login">返回登录</button>',
      '</form>',
      '</div>'
    ].join('');
  }

  function accountHtml(identity) {
    const isGuest = identity.mode === 'guest';
    const profile = identity.profile || {};
    const newsletterChecked = profile.newsletter_opt_in ? ' checked' : '';
    const title = isGuest ? '当前身份：游客' : '@' + (identity.displayName || 'Janet 用户');
    const subtitle = isGuest ? '游客昵称：' + identity.displayName : (identity.email || '');
    const guestActions = [
      '<button class="potato-action" type="button" data-potato-tab="create"><span>升级为正式账号</span><span>→</span></button>',
      '<p class="potato-warning">注册正式账号后，游客身份将退出，历史点赞和评论不会自动迁移。</p>',
      '<button class="potato-action" type="button" data-potato-tab="username"><span>修改昵称</span><span>→</span></button>',
      '<button class="potato-action" type="button" data-potato-action="logout"><span>退出登录</span><span>→</span></button>'
    ].join('');
    const userActions = [
      '<button class="potato-action" type="button" data-potato-tab="username"><span>修改用户名</span><span>→</span></button>',
      '<button class="potato-action" type="button" data-potato-tab="password"><span>修改密码</span><span>→</span></button>',
      '<div class="potato-sep"></div>',
      '<label class="potato-toggle-row"><span>订阅每日晨报</span><input type="checkbox" data-potato-newsletter' + newsletterChecked + '></label>',
      '<div class="potato-sep"></div>',
      '<button class="potato-action" type="button" data-potato-action="logout"><span>退出登录</span><span>→</span></button>'
    ].join('');

    return [
      '<div class="potato-head">',
      '  <p class="potato-kicker">Potato Center</p>',
      '  <h2 class="potato-title">' + escapeHtml(title) + '</h2>',
      '  <p class="potato-sub">' + escapeHtml(subtitle) + '</p>',
      '</div>',
      '<div class="potato-panel potato-stack">',
      messageHtml(),
      '<div class="potato-actions">',
      isGuest ? guestActions : userActions,
      '</div>',
      '</div>'
    ].join('');
  }

  function usernameHtml(identity) {
    const label = identity && identity.mode === 'guest' ? '修改昵称' : '修改用户名';
    const current = identity ? identity.displayName : '';
    return [
      '<div class="potato-head">',
      '  <p class="potato-kicker">Profile</p>',
      '  <h2 class="potato-title">' + label + '</h2>',
      '</div>',
      '<div class="potato-panel">',
      messageHtml(),
      '<form class="potato-form" data-potato-form="username">',
      '  <label class="potato-field"><span>用户名</span><input type="text" name="username" value="' + escapeHtml(current) + '" minlength="2" maxlength="20" required></label>',
      '  <button class="potato-btn" type="submit">保存</button>',
      '  <button class="potato-btn potato-btn--ghost" type="button" data-potato-tab="account">返回</button>',
      '</form>',
      '</div>'
    ].join('');
  }

  function passwordHtml() {
    return [
      '<div class="potato-head">',
      '  <p class="potato-kicker">Security</p>',
      '  <h2 class="potato-title">修改密码</h2>',
      '</div>',
      '<div class="potato-panel">',
      messageHtml(),
      '<form class="potato-form" data-potato-form="password">',
      '  <label class="potato-field"><span>当前密码</span><input type="password" name="oldPassword" autocomplete="current-password" required></label>',
      '  <label class="potato-field"><span>新密码</span><input type="password" name="newPassword" autocomplete="new-password" minlength="6" required></label>',
      '  <label class="potato-field"><span>确认新密码</span><input type="password" name="confirm" autocomplete="new-password" minlength="6" required></label>',
      '  <button class="potato-btn" type="submit">更新密码</button>',
      '  <button class="potato-btn potato-btn--ghost" type="button" data-potato-tab="account">返回</button>',
      '</form>',
      '</div>'
    ].join('');
  }

  function renderDropdown() {
    if (!state.openCenter) return;
    let dropdown = qs('.potato-dropdown', state.openCenter);
    if (!dropdown) {
      dropdown = document.createElement('div');
      dropdown.className = 'potato-dropdown';
      dropdown.setAttribute('role', 'dialog');
      dropdown.setAttribute('aria-label', '土豆中心');
      state.openCenter.appendChild(dropdown);
    }

    const identity = getIdentity();
    let tab = identity && ['login', 'guest'].includes(state.tab) ? 'account' : state.tab;
    if (!identity && ['account', 'username', 'password'].includes(tab)) tab = 'login';
    if (identity && identity.mode === 'guest' && tab === 'password') tab = 'account';
    const html = {
      login: loginHtml,
      create: createHtml,
      guest: guestHtml,
      reset: resetHtml,
      account: () => accountHtml(identity),
      username: () => usernameHtml(identity),
      password: passwordHtml
    }[tab] || loginHtml;

    state.tab = tab;
    dropdown.innerHTML = html();
    dropdown.hidden = false;
    const trigger = qs('[data-potato-user-trigger]', state.openCenter);
    if (trigger) trigger.setAttribute('aria-expanded', 'true');
  }

  function formData(form) {
    return Object.fromEntries(new FormData(form).entries());
  }

  function setFormBusy(form, busy) {
    state.busy = busy;
    qsa('button, input', form).forEach((el) => {
      if (el.type !== 'checkbox') el.disabled = busy;
    });
  }

  async function runForm(form) {
    if (!auth() || state.busy) return;
    const type = form.dataset.potatoForm;
    const data = formData(form);
    setFormBusy(form, true);
    clearMessage();

    try {
      if (type === 'login') {
        await auth().signInWithPassword(data.email, data.password);
        setMessage('登录成功', false);
        state.tab = 'account';
      }
      if (type === 'create') {
        if (data.password !== data.confirm) throw new Error('两次密码不一致');
        if (!data.terms) throw new Error('请先同意隐私条款');
        await auth().signUp({
          username: data.username,
          email: data.email,
          password: data.password,
          newsletterOptIn: Boolean(data.newsletter)
        });
        setMessage('账号已创建', false);
        state.tab = 'account';
      }
      if (type === 'guest') {
        await auth().signInAnonymously({ username: data.username });
        setMessage('已进入游客身份', false);
        state.tab = 'account';
      }
      if (type === 'reset') {
        await auth().sendPasswordReset(data.email);
        setMessage('重置邮件已发送，请查收邮箱', false);
      }
      if (type === 'username') {
        await auth().updateUsername(data.username);
        setMessage('用户名已更新', false);
        state.tab = 'account';
      }
      if (type === 'password') {
        if (data.newPassword !== data.confirm) throw new Error('两次密码不一致');
        await auth().updatePassword(data.oldPassword, data.newPassword);
        setMessage('密码已更新', false);
        state.tab = 'account';
      }
    } catch (error) {
      setMessage(error.message || (auth().friendlyAuthError && auth().friendlyAuthError(error)) || '操作失败，请稍后重试', true);
    } finally {
      setFormBusy(form, false);
      updateLabels();
      renderDropdown();
    }
  }

  async function handleAction(action) {
    if (!auth()) return;
    if (action === 'logout') {
      await auth().logout();
      state.tab = 'login';
      setMessage('已退出登录', false);
      renderDropdown();
      updateLabels();
    }
  }

  function bind() {
    ensureMenu();
    updateLabels();

    document.addEventListener('click', async (event) => {
      const userTrigger = event.target.closest('[data-potato-user-trigger]');
      if (userTrigger) {
        event.preventDefault();
        toggleDropdown(userTrigger.closest('[data-potato-center]'));
        return;
      }

      const tab = event.target.closest('[data-potato-tab]');
      if (tab && state.openCenter && state.openCenter.contains(tab)) {
        event.preventDefault();
        state.tab = tab.dataset.potatoTab;
        clearMessage();
        renderDropdown();
        return;
      }

      const action = event.target.closest('[data-potato-action]');
      if (action && state.openCenter && state.openCenter.contains(action)) {
        event.preventDefault();
        await handleAction(action.dataset.potatoAction);
        return;
      }

      if (state.openCenter && !event.target.closest('[data-potato-center]')) {
        closeDropdown();
      }
    });

    document.addEventListener('submit', async (event) => {
      const form = event.target.closest('[data-potato-form]');
      if (!form) return;
      event.preventDefault();
      await runForm(form);
    });

    document.addEventListener('change', async (event) => {
      const toggle = event.target.closest('[data-potato-newsletter]');
      if (!toggle || !auth()) return;
      try {
        await auth().updateNewsletterPreference(toggle.checked);
        setMessage(toggle.checked ? '已订阅每日晨报' : '已取消订阅', false);
      } catch (error) {
        setMessage(error.message || '操作失败，请稍后重试', true);
        toggle.checked = !toggle.checked;
      }
      renderDropdown();
    });

    document.addEventListener('janet:auth-changed', () => {
      updateLabels();
      if (state.openCenter) renderDropdown();
    });

    document.addEventListener('janet:open-potato-center', (event) => {
      const center = qs('[data-potato-center]');
      openDropdown(center, event.detail && event.detail.tab ? event.detail.tab : 'login');
    });

    document.addEventListener('janet:site-menu-changed', (event) => {
      if (event.detail && event.detail.open) closeDropdown();
    });
  }

  window.JanetPotatoCenter = {
    open: (tab) => openDropdown(qs('[data-potato-center]'), tab || 'login'),
    close: closeDropdown,
    refresh: updateLabels
  };

  document.addEventListener('DOMContentLoaded', bind);
})();
