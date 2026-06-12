(function() {
  'use strict';

  const state = {
    mode: 'login',
    countdown: { login: 0, create: 0 },
    timers: { login: null, create: null }
  };

  function modalTemplate() {
    return [
      '<div class="visitor-modal" id="visitor-modal" role="dialog" aria-modal="true" aria-labelledby="vm-title" hidden>',
      '  <div class="vm-backdrop" data-vm-close></div>',
      '  <div class="vm-panel">',
      '    <button class="vm-close" type="button" data-vm-close aria-label="关闭">×</button>',
      '    <div class="vm-brand"><div class="vm-dot"></div>Janet</div>',
      '    <h2 class="vm-title" id="vm-title">登录 Janet</h2>',
      '    <p class="vm-desc">用邮箱进入 Janet。游客也可以评论和点赞，身份只保存在本地。</p>',
      '    <div class="vm-tabs" role="tablist" aria-label="账户方式">',
      '      <button class="vm-tab is-active" type="button" data-vm-mode="login">登录 Janet</button>',
      '      <button class="vm-tab" type="button" data-vm-mode="create">创建 Janet 账户</button>',
      '    </div>',
      '    <form class="vm-card" id="vm-login-card" data-vm-card="login">',
      '      <label class="vm-field"><span>邮箱</span><input type="email" id="vm-login-email" name="email" autocomplete="email" placeholder="you@example.com" required></label>',
      '      <label class="vm-checkbox"><input type="checkbox" id="vm-login-terms"><span>我已阅读并同意 <button class="vm-link" type="button" data-vm-terms>隐私条款</button></span></label>',
      '      <button class="btn btn-green vm-submit" type="submit" data-vm-submit="login" disabled>发送登录邮件</button>',
      '      <button class="vm-switch" type="button" data-vm-mode="create">没有账号？创建账户</button>',
      '    </form>',
      '    <form class="vm-card" id="vm-create-card" data-vm-card="create" hidden>',
      '      <label class="vm-field"><span>邮箱</span><input type="email" id="vm-create-email" name="email" autocomplete="email" placeholder="you@example.com" required></label>',
      '      <label class="vm-field"><span>用户名</span><input type="text" id="vm-create-name" name="display_name" autocomplete="nickname" maxlength="32" placeholder="显示在评论里的名字" required></label>',
      '      <label class="vm-checkbox vm-newsletter"><input type="checkbox" id="vm-create-newsletter" checked><span><strong>是否订阅每日晨报？</strong><small>每天早上收到 Janet 快车箱晨报，包含今日 AI 信号和主站链接。</small></span></label>',
      '      <label class="vm-checkbox"><input type="checkbox" id="vm-create-terms"><span>我已阅读并同意 <button class="vm-link" type="button" data-vm-terms>隐私条款</button></span></label>',
      '      <button class="btn btn-green vm-submit" type="submit" data-vm-submit="create" disabled>创建账户</button>',
      '      <button class="vm-switch" type="button" data-vm-mode="login">已有账号？登录</button>',
      '    </form>',
      '    <div class="vm-guest-row">',
      '      <button class="vm-guest" type="button" id="vm-guest">以游客身份继续</button>',
      '    </div>',
      '    <section class="vm-terms-panel" id="vm-terms-panel" aria-label="隐私条款" hidden>',
      '      <button class="vm-terms-close" type="button" data-vm-terms-close aria-label="关闭隐私条款">×</button>',
      '      <h3>隐私条款</h3>',
      '      <p>本站会保存你的邮箱、用户名、订阅选择、评论、点赞和转发记录，用来显示互动状态和后续扩展账户体验。</p>',
      '      <p>邮箱只用于登录验证、账户识别和你主动勾选的每日晨报订阅，不会出售给第三方。</p>',
      '      <p>评论内容会公开显示；游客身份只保存在本机浏览器里。需要退订、删除或修改资料时，可以联系 Janet 处理。</p>',
      '    </section>',
      '    <p class="vm-note" id="vm-auth-message" aria-live="polite"></p>',
      '  </div>',
      '</div>'
    ].join('');
  }

  function qs(selector, parent = document) {
    return parent.querySelector(selector);
  }

  function qsa(selector, parent = document) {
    return Array.from(parent.querySelectorAll(selector));
  }

  function getModal() {
    let modal = qs('#visitor-modal');
    if (!modal) {
      document.body.insertAdjacentHTML('beforeend', modalTemplate());
      modal = qs('#visitor-modal');
      bindModal(modal);
    }
    return modal;
  }

  function open(mode) {
    const modal = getModal();
    setMode(mode || 'login');
    modal.hidden = false;
    document.body.classList.add('visitor-modal-open');
    window.setTimeout(() => {
      const input = qs(state.mode === 'login' ? '#vm-login-email' : '#vm-create-email');
      if (input) input.focus();
    }, 60);
  }

  function close(skip) {
    const modal = getModal();
    modal.hidden = true;
    document.body.classList.remove('visitor-modal-open');
    if (skip && window.JanetAuth) window.JanetAuth.skipForNow();
  }

  function setMessage(message, tone) {
    const el = qs('#vm-auth-message');
    if (!el) return;
    el.textContent = message || '';
    el.dataset.tone = tone || '';
  }

  function setMode(mode) {
    state.mode = mode === 'create' ? 'create' : 'login';
    const modal = getModal();
    qs('#vm-title', modal).textContent = state.mode === 'create' ? '创建 Janet 账户' : '登录 Janet';
    qsa('[data-vm-card]', modal).forEach((card) => {
      card.hidden = card.dataset.vmCard !== state.mode;
    });
    qsa('[data-vm-mode]', modal).forEach((button) => {
      const active = button.dataset.vmMode === state.mode;
      button.classList.toggle('is-active', active);
      if (button.classList.contains('vm-tab')) button.setAttribute('aria-selected', String(active));
    });
    syncEmailInputs();
    updateSubmitState();
    setMessage('', '');
  }

  function syncEmailInputs(source) {
    const loginEmail = qs('#vm-login-email');
    const createEmail = qs('#vm-create-email');
    if (!loginEmail || !createEmail) return;
    if (source === loginEmail) createEmail.value = loginEmail.value;
    else if (source === createEmail) loginEmail.value = createEmail.value;
    else if (loginEmail.value && !createEmail.value) createEmail.value = loginEmail.value;
    else if (createEmail.value && !loginEmail.value) loginEmail.value = createEmail.value;
  }

  function updateSubmitState() {
    const loginReady = Boolean(qs('#vm-login-terms') && qs('#vm-login-terms').checked) && state.countdown.login <= 0;
    const createReady = Boolean(qs('#vm-create-terms') && qs('#vm-create-terms').checked) && state.countdown.create <= 0;
    const loginButton = qs('[data-vm-submit="login"]');
    const createButton = qs('[data-vm-submit="create"]');
    if (loginButton) {
      loginButton.disabled = !loginReady;
      if (state.countdown.login > 0) loginButton.textContent = '重新发送 ' + state.countdown.login + 's';
      else loginButton.textContent = '发送登录邮件';
    }
    if (createButton) {
      createButton.disabled = !createReady;
      if (state.countdown.create > 0) createButton.textContent = '重新发送 ' + state.countdown.create + 's';
      else createButton.textContent = '创建账户';
    }
  }

  function startCountdown(mode) {
    window.clearInterval(state.timers[mode]);
    state.countdown[mode] = 60;
    updateSubmitState();
    state.timers[mode] = window.setInterval(() => {
      state.countdown[mode] -= 1;
      if (state.countdown[mode] <= 0) {
        state.countdown[mode] = 0;
        window.clearInterval(state.timers[mode]);
      }
      updateSubmitState();
    }, 1000);
  }

  function setLoading(mode, isLoading) {
    const button = qs('[data-vm-submit="' + mode + '"]');
    if (!button) return;
    button.classList.toggle('is-loading', Boolean(isLoading));
    if (isLoading) {
      button.disabled = true;
      button.textContent = mode === 'create' ? '正在创建...' : '正在发送...';
    } else {
      updateSubmitState();
    }
  }

  async function submitLogin(form) {
    const email = String(new FormData(form).get('email') || '').trim();
    if (!qs('#vm-login-terms').checked) {
      setMessage('请先阅读并同意隐私条款。', 'warn');
      return;
    }
    try {
      setLoading('login', true);
      await window.JanetAuth.sendLoginEmail(email);
      setMessage('登录邮件已发送，请去邮箱点击链接。', 'success');
      startCountdown('login');
    } catch (error) {
      setMessage(error.message || '邮件发送失败，请稍后再试。', 'warn');
    } finally {
      setLoading('login', false);
    }
  }

  async function submitCreate(form) {
    const data = new FormData(form);
    const email = String(data.get('email') || '').trim();
    const displayName = String(data.get('display_name') || '').trim();
    const subscribed = Boolean(qs('#vm-create-newsletter') && qs('#vm-create-newsletter').checked);
    if (!qs('#vm-create-terms').checked) {
      setMessage('请先阅读并同意隐私条款。', 'warn');
      return;
    }
    try {
      setLoading('create', true);
      await window.JanetAuth.createAccount({ email, displayName, subscribed });
      setMessage('验证邮件已发送，请去邮箱点击链接完成创建。', 'success');
      startCountdown('create');
    } catch (error) {
      setMessage(error.message || '创建账户失败，请稍后再试。', 'warn');
    } finally {
      setLoading('create', false);
    }
  }

  function bindModal(modal) {
    modal.querySelectorAll('[data-vm-close]').forEach((button) => {
      button.addEventListener('click', () => close(true));
    });

    qsa('[data-vm-mode]', modal).forEach((button) => {
      button.addEventListener('click', () => setMode(button.dataset.vmMode));
    });

    qsa('#vm-login-email, #vm-create-email', modal).forEach((input) => {
      input.addEventListener('input', () => syncEmailInputs(input));
    });

    qsa('#vm-login-terms, #vm-create-terms', modal).forEach((input) => {
      input.addEventListener('change', updateSubmitState);
    });

    qsa('[data-vm-terms]', modal).forEach((button) => {
      button.addEventListener('click', () => {
        qs('#vm-terms-panel', modal).hidden = false;
      });
    });

    qsa('[data-vm-terms-close]', modal).forEach((button) => {
      button.addEventListener('click', () => {
        qs('#vm-terms-panel', modal).hidden = true;
      });
    });

    qs('#vm-guest', modal).addEventListener('click', () => {
      const identity = window.JanetAuth.createGuest();
      setMessage(identity.displayName + ' 已进入。', 'success');
      window.setTimeout(() => close(false), 260);
    });

    qs('#vm-login-card', modal).addEventListener('submit', (event) => {
      event.preventDefault();
      submitLogin(event.currentTarget);
    });

    qs('#vm-create-card', modal).addEventListener('submit', (event) => {
      event.preventDefault();
      submitCreate(event.currentTarget);
    });
  }

  window.JanetVisitorModal = { open, close, ensure: getModal };

  document.addEventListener('DOMContentLoaded', () => {
    getModal();
    window.setTimeout(() => {
      const identity = window.JanetAuth && window.JanetAuth.getIdentity();
      const skippedKey = window.JanetAuth && window.JanetAuth.storage && window.JanetAuth.storage.skipped;
      const skipped = skippedKey ? localStorage.getItem(skippedKey) : '';
      if (!identity && !skipped) open('login');
    }, 1500);
  });
})();
