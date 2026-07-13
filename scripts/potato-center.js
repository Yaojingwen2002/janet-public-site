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
    ['影像参考实验室', 'gpt-image2-handbook.html'],
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
    const closingCenter = state.openCenter;
    const dropdown = qs('.potato-dropdown', closingCenter);
    if (dropdown) {
      dropdown.classList.add('is-closing');
      window.setTimeout(() => {
        if (!dropdown.isConnected) return;
        dropdown.classList.remove('is-closing');
        if (state.openCenter !== closingCenter) dropdown.hidden = true;
      }, 190);
    }
    const trigger = qs('[data-potato-user-trigger]', closingCenter);
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

    document.addEventListener('janet:site-menu-changed', (event) => {
      if (event.detail && event.detail.open) closeDropdown();
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
    open: function(tab) { return openDropdown(qs('[data-potato-center]'), tab || 'login'); },
    close: closeDropdown,
    refresh: updateLabels
  };

  document.addEventListener('DOMContentLoaded', bind);
})();
