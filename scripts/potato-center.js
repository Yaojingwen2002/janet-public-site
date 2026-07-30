(function() {
  'use strict';

  const qs = (selector, parent = document) => parent.querySelector(selector);
  const qsa = (selector, parent = document) => Array.from(parent.querySelectorAll(selector));

  const state = {
    openCenter: null,
    panel: 'closed',
    tab: 'login',
    busy: false,
    message: '',
    error: '',
    lastTrigger: null
  };

  const menuLinks = [
    ['首页', 'index.html'],
    ['AI 信号站', 'index.html#hero'],
    ['每日晨报', 'news.html'],
    ['作品库', 'portfolio.html'],
    ['镜场计划', 'mirror-plan.html'],
    ['关于 Janet', 'index.html#about']
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

  function currentPageMatches(href, label) {
    const target = new URL(linkHref(href), location.href);
    const currentPath = location.pathname.replace(/\/+$/, '/');
    const targetPath = target.pathname.replace(/\/+$/, '/');
    if (currentPath !== targetPath) return false;
    if (label === 'AI 信号站') return location.hash === '#hero';
    if (label === '关于 Janet') return location.hash === '#about';
    if (label === '首页') return !['#hero', '#about'].includes(location.hash);
    return true;
  }

  function ensureMenu(center) {
    let menu = qs('#mobile-nav-menu');
    if (!menu) {
      menu = document.createElement('div');
      menu.className = 'mobile-nav-menu';
      menu.id = 'mobile-nav-menu';
    }

    menu.setAttribute('role', 'menu');
    menu.setAttribute('aria-label', 'Janet 站点导航');
    menu.setAttribute('aria-hidden', 'true');
    menu.innerHTML = menuLinks.map(([label, href], index) => {
      const current = currentPageMatches(href, label) ? ' aria-current="page"' : '';
      return '<a role="menuitem" data-nav-index="' + String(index + 1).padStart(2, '0') + '" href="' +
        escapeHtml(linkHref(href)) + '"' + current + '>' + escapeHtml(label) + '</a>';
    }).join('');

    const targetCenter = center || qs('[data-potato-center]');
    if (targetCenter && menu.parentElement !== targetCenter) targetCenter.appendChild(menu);
    return menu;
  }

  function getIdentity() {
    return auth() && auth().getIdentity();
  }

  function isReady() {
    return Boolean(auth() && auth().isReady && auth().isReady());
  }

  function defaultGuestName() {
    return auth() && auth().randomGuestName ? auth().randomGuestName() : 'guest_' + Math.random().toString(36).slice(2, 8).toUpperCase();
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
      const userTrigger = qs('[data-potato-user-trigger]', center);
      const menuTrigger = qs('[data-potato-menu-trigger]', center);
      if (!label) return;
      const loading = !isReady();
      label.textContent = auth() && auth().getPotatoLabel ? auth().getPotatoLabel() : '登';
      label.dataset.loading = loading ? 'true' : 'false';
      if (userTrigger) {
        userTrigger.disabled = loading;
        userTrigger.setAttribute('aria-expanded', String(center === state.openCenter && state.panel === 'account'));
        const identity = getIdentity();
        userTrigger.setAttribute('aria-label', identity ? '打开账户中心' : '打开登录');
      }
      if (menuTrigger) {
        menuTrigger.setAttribute('aria-expanded', String(center === state.openCenter && state.panel === 'navigation'));
        menuTrigger.setAttribute('aria-label', state.panel === 'navigation' ? '关闭站点导航' : '打开站点导航');
      }
    });
  }

  function setPanelState(center, panel) {
    if (!center) return;
    if (panel === 'closed') center.removeAttribute('data-panel');
    else center.dataset.panel = panel;
  }

  function dispatchNavigationState(open) {
    document.dispatchEvent(new CustomEvent('janet:site-menu-changed', {
      detail: { open: Boolean(open), source: 'potato-center' }
    }));
  }

  function hideNavigation(center) {
    const menu = center && qs('#mobile-nav-menu', center);
    if (!menu) return;
    menu.classList.remove('open');
    menu.setAttribute('aria-hidden', 'true');
  }

  function hideAccount(center, animate) {
    const dropdown = center && qs('.potato-dropdown', center);
    if (!dropdown) return;
    if (!animate) {
      dropdown.classList.remove('is-closing');
      dropdown.hidden = true;
      return;
    }
    dropdown.classList.add('is-closing');
    window.setTimeout(() => {
      if (!dropdown.isConnected) return;
      dropdown.classList.remove('is-closing');
      if (state.openCenter !== center || state.panel !== 'account') dropdown.hidden = true;
    }, 190);
  }

  function closeDropdown(options) {
    if (!state.openCenter) return;
    const settings = Object.assign({ restoreFocus: true, animate: true }, options || {});
    const closingCenter = state.openCenter;
    const closingTrigger = state.lastTrigger;
    hideAccount(closingCenter, settings.animate);
    hideNavigation(closingCenter);
    setPanelState(closingCenter, 'closed');
    state.openCenter = null;
    state.panel = 'closed';
    state.busy = false;
    clearMessage();
    dispatchNavigationState(false);
    updateLabels();
    if (settings.restoreFocus && closingTrigger && closingTrigger.isConnected) {
      window.requestAnimationFrame(() => closingTrigger.focus({ preventScroll: true }));
    }
    state.lastTrigger = null;
  }

  function openDropdown(center, tab, trigger) {
    if (!center || !isReady()) return;
    ensureMenu(center);
    if (state.openCenter && state.openCenter !== center) closeDropdown({ restoreFocus: false, animate: false });
    hideNavigation(center);
    state.openCenter = center;
    state.panel = 'account';
    state.lastTrigger = trigger || qs('[data-potato-user-trigger]', center);
    state.tab = tab || state.tab || 'login';
    clearMessage();
    setPanelState(center, 'account');
    dispatchNavigationState(false);
    renderDropdown();
    updateLabels();
    const dropdown = qs('.potato-dropdown', center);
    if (dropdown) window.requestAnimationFrame(() => dropdown.focus({ preventScroll: true }));
  }

  function toggleDropdown(center, trigger) {
    if (state.openCenter === center && state.panel === 'account') {
      closeDropdown();
      return;
    }
    const identity = getIdentity();
    openDropdown(center, identity ? 'account' : 'login', trigger);
  }

  function openNavigation(center, trigger) {
    if (!center) return;
    const menu = ensureMenu(center);
    if (state.openCenter && state.openCenter !== center) closeDropdown({ restoreFocus: false, animate: false });
    hideAccount(center, false);
    state.openCenter = center;
    state.panel = 'navigation';
    state.lastTrigger = trigger || qs('[data-potato-menu-trigger]', center);
    setPanelState(center, 'navigation');
    menu.classList.add('open');
    menu.setAttribute('aria-hidden', 'false');
    dispatchNavigationState(true);
    updateLabels();
    const firstLink = qs('a', menu);
    if (firstLink) window.requestAnimationFrame(() => firstLink.focus({ preventScroll: true }));
  }

  function toggleNavigation(center, trigger) {
    if (state.openCenter === center && state.panel === 'navigation') {
      closeDropdown();
      return;
    }
    openNavigation(center, trigger);
  }

  function messageHtml() {
    if (state.error) return '<div class="potato-error" data-potato-error>' + escapeHtml(state.error) + '</div>';
    if (state.message) return '<div class="potato-status">' + escapeHtml(state.message) + '</div>';
    return '<div class="potato-error" data-potato-error hidden></div>';
  }

  function usernameHintHtml() {
    return '<small class="potato-hint">3-20 位英文字母、数字、下划线；不能用中文、空格、标点、emoji 或系统保留名。例：janet_ai / creator2026 / guest_123</small>';
  }

  function loginHtml() {
    return [
      '<div class="potato-panel">',
      messageHtml(),
      '<form class="potato-form" data-potato-form="login">',
      '  <label class="potato-field"><span>邮箱</span><input type="email" name="email" autocomplete="email" placeholder="you@example.com" required></label>',
      '  <label class="potato-field"><span>密码</span><input type="password" name="password" autocomplete="current-password" minlength="6" required></label>',
      '  <label class="potato-check"><input type="checkbox" name="remember" checked><span><strong>记住我</strong><small>取消后仅在当前浏览标签保留登录状态</small></span></label>',
      '  <button class="potato-btn" type="submit">登录</button>',
      '  <div class="potato-link-group">',
      '    <button class="potato-link-btn" type="button" data-potato-tab="reset">忘记密码？</button>',
      '    <button class="potato-link-btn" type="button" data-potato-tab="create">还没有账户？</button>',
      '    <button class="potato-link-btn" type="button" data-potato-tab="guest">游客进入 -></button>',
      '  </div>',
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
      '<div class="potato-panel">',
      messageHtml(),
      guestWarning,
      '<form class="potato-form" data-potato-form="create">',
      '  <label class="potato-field"><span>用户名</span><input type="text" name="username" autocomplete="nickname" maxlength="20" autocapitalize="none" spellcheck="false" title="只能使用 3-20 位英文字母、数字、下划线" placeholder="janet_ai">' + usernameHintHtml() + '</label>',
      '  <label class="potato-field"><span>邮箱</span><input type="email" name="email" autocomplete="email" placeholder="you@example.com" required></label>',
      '  <label class="potato-field"><span>密码</span><input type="password" name="password" autocomplete="new-password" minlength="6" required></label>',
      '  <label class="potato-field"><span>确认密码</span><input type="password" name="confirm" autocomplete="new-password" minlength="6" required></label>',
      '  <label class="potato-check potato-newsletter-option"><input type="checkbox" name="newsletter" checked><span><strong>订阅每日晨报</strong><small data-potato-newsletter-name>邮件将称呼你为“注册名称”，可随时取消</small></span></label>',
      '  <label class="potato-check"><input type="checkbox" name="terms" required><span>我同意隐私条款</span></label>',
      '  <button class="potato-btn" type="submit">创建账号</button>',
      '  <div class="potato-link-group">',
      '    <button class="potato-link-btn" type="button" data-potato-tab="login">已有账户？</button>',
      '    <button class="potato-link-btn" type="button" data-potato-tab="guest">游客进入</button>',
      '  </div>',
      '</form>',
      '</div>'
    ].join('');
  }

  function guestHtml() {
    return [
      '<div class="potato-panel">',
      messageHtml(),
      '<form class="potato-form" data-potato-form="guest">',
      '  <label class="potato-field"><span>游客昵称</span><input type="text" name="username" value="' + escapeHtml(defaultGuestName()) + '" maxlength="20" autocapitalize="none" spellcheck="false" title="只能使用 3-20 位英文字母、数字、下划线">' + usernameHintHtml() + '</label>',
      '  <p class="potato-warning">游客身份可评论和点赞。退出登录、清除浏览器数据或更换设备后，游客记录将无法找回，也无法迁移到新账号。如需保留记录，请注册正式账号。</p>',
      '  <button class="potato-btn" type="submit">游客进入</button>',
      '  <div class="potato-link-group">',
      '    <button class="potato-link-btn" type="button" data-potato-tab="login">账户登录</button>',
      '  </div>',
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
      '  <label class="potato-field"><span>用户名</span><input type="text" name="username" value="' + escapeHtml(current) + '" maxlength="20" autocapitalize="none" spellcheck="false" title="只能使用 3-20 位英文字母、数字、下划线">' + usernameHintHtml() + '</label>',
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
      dropdown.setAttribute('aria-modal', 'false');
      dropdown.setAttribute('tabindex', '-1');
      state.openCenter.appendChild(dropdown);
    }
    dropdown.classList.remove('is-closing');

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
    updateNewsletterNamePreview(dropdown);
    dropdown.hidden = false;
    setPanelState(state.openCenter, 'account');
    const trigger = qs('[data-potato-user-trigger]', state.openCenter);
    if (trigger) trigger.setAttribute('aria-expanded', 'true');
  }

  function updateNewsletterNamePreview(parent) {
    const scope = parent || document;
    const form = scope.matches && scope.matches('[data-potato-form="create"]')
      ? scope
      : qs('[data-potato-form="create"]', scope);
    if (!form) return;
    const input = qs('input[name="username"]', form);
    const preview = qs('[data-potato-newsletter-name]', form);
    if (!preview) return;
    const username = input && input.value ? input.value.trim() : '';
    preview.textContent = '邮件将称呼你为“' + (username || '注册名称') + '”，可随时取消';
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
        await auth().signInWithPassword(data.email, data.password, {
          remember: Boolean(data.remember)
        });
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
        if (Boolean(data.newsletter)) showSubscriptionSuccess(data.username || data.email);
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

  function panelFocusables(panel) {
    if (!panel) return [];
    return qsa('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])', panel)
      .filter((element) => !element.hidden && element.getAttribute('aria-hidden') !== 'true');
  }

  function trapPanelFocus(event) {
    if (event.key !== 'Tab' || !state.openCenter || state.panel === 'closed') return;
    const panel = state.panel === 'navigation'
      ? qs('#mobile-nav-menu', state.openCenter)
      : qs('.potato-dropdown', state.openCenter);
    const focusable = panelFocusables(panel);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
      return;
    }
    if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function bind() {
    qsa('[data-potato-center]').forEach((center) => {
      ensureMenu(center);
      setPanelState(center, 'closed');
    });
    updateLabels();

    document.addEventListener('click', async (event) => {
      const userTrigger = event.target.closest('[data-potato-user-trigger]');
      if (userTrigger) {
        event.preventDefault();
        toggleDropdown(userTrigger.closest('[data-potato-center]'), userTrigger);
        return;
      }

      const menuTrigger = event.target.closest('[data-potato-menu-trigger]');
      if (menuTrigger) {
        event.preventDefault();
        toggleNavigation(menuTrigger.closest('[data-potato-center]'), menuTrigger);
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

      const navigationLink = event.target.closest('#mobile-nav-menu a');
      if (navigationLink && state.openCenter && state.openCenter.contains(navigationLink)) {
        closeDropdown({ restoreFocus: false, animate: false });
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

    document.addEventListener('input', (event) => {
      if (!event.target.matches('[data-potato-form="create"] input[name="username"]')) return;
      updateNewsletterNamePreview(event.target.form);
    });

    document.addEventListener('janet:auth-changed', () => {
      updateLabels();
      if (state.openCenter) renderDropdown();
    });

    document.addEventListener('janet:open-potato-center', (event) => {
      const center = qs('[data-potato-center]');
      openDropdown(center, event.detail && event.detail.tab ? event.detail.tab : 'login');
    });

    document.addEventListener('janet:close-site-menu', () => {
      if (state.panel === 'navigation') closeDropdown({ restoreFocus: false });
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && state.openCenter) {
        event.preventDefault();
        closeDropdown();
        return;
      }
      trapPanelFocus(event);
    });
  }

  function showSubscriptionSuccess(name) {
    var displayName = name || 'Janet 读者';
    if (qs('.potato-celebration')) return;

    var overlay = document.createElement('div');
    overlay.className = 'potato-celebration';
    overlay.innerHTML = [
      '<div class="pc-backdrop"></div>',
      '<div class="pc-card">',
      '  <button class="pc-close" data-pc-close aria-label="关闭">✕</button>',
      '  <div class="pc-icon">🎉</div>',
      '  <h2 class="pc-title">订阅成功 ✦</h2>',
      '  <p class="pc-desc">' + escapeHtml(displayName) + '，你已进入 <strong>Janet 快车箱</strong> 邮件通道。</p>',
      '  <p class="pc-detail">每天 AI 晨报会自动送达你的邮箱。</p>',
      '  <button class="pc-btn" data-pc-close>知道了</button>',
      '</div>'
    ].join('');
    document.body.appendChild(overlay);

    // Confetti via canvas
    var canvas = document.createElement('canvas');
    canvas.className = 'pc-confetti';
    overlay.prepend(canvas);
    var ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    var pieces = [];
    var colors = ['#0ABAB5','#18E299','#C9A84C','#1A3A2A','#C17A2E','#ffffff'];
    for (var i = 0; i < 120; i++) {
      pieces.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height - canvas.height,
        w: 6 + Math.random() * 6,
        h: 6 + Math.random() * 6,
        color: colors[Math.floor(Math.random() * colors.length)],
        vx: (Math.random() - 0.5) * 4,
        vy: 2 + Math.random() * 4,
        rot: Math.random() * 360,
        rotSpeed: (Math.random() - 0.5) * 8,
        opacity: 0.8 + Math.random() * 0.2
      });
    }

    var frame;
    function animate() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      var allDone = true;
      for (var i = 0; i < pieces.length; i++) {
        var p = pieces[i];
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.08;
        p.rot += p.rotSpeed;
        if (p.y < canvas.height + 50) allDone = false;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot * Math.PI / 180);
        ctx.globalAlpha = p.opacity;
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.w/2, -p.h/2, p.w, p.h);
        ctx.restore();
      }
      if (!allDone) frame = requestAnimationFrame(animate);
    }
    frame = requestAnimationFrame(animate);

    function close() {
      if (frame) cancelAnimationFrame(frame);
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
    }

    overlay.addEventListener('click', function(e) {
      if (e.target.closest('[data-pc-close]') || e.target.closest('.pc-backdrop')) close();
    });

    document.addEventListener('keydown', function handler(e) {
      if (e.key === 'Escape') { close(); document.removeEventListener('keydown', handler); }
    });
  }

  window.JanetPotatoCenter = {
    ownsNavigation: true,
    open: function(tab) { return openDropdown(qs('[data-potato-center]'), tab || 'login'); },
    openNavigation: function() { return openNavigation(qs('[data-potato-center]')); },
    toggleNavigation: function() { return toggleNavigation(qs('[data-potato-center]')); },
    close: closeDropdown,
    refresh: updateLabels,
    getState: function() { return state.panel; }
  };

  document.addEventListener('DOMContentLoaded', bind);
})();
