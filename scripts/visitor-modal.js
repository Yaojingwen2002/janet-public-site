(function() {
  'use strict';

  function modalTemplate() {
    return [
      '<div class="visitor-modal" id="visitor-modal" role="dialog" aria-modal="true" hidden>',
      '  <div class="vm-backdrop" data-vm-close></div>',
      '  <div class="vm-panel">',
      '    <button class="vm-close" type="button" data-vm-close aria-label="跳过">跳过，先看看 -></button>',
      '    <div class="vm-brand"><div class="vm-dot"></div>Janet</div>',
      '    <h2 class="vm-title">欢迎来到<br><em>Janet 的内容站</em></h2>',
      '    <p class="vm-desc">选择一种方式进入，游客也可以评论和点赞。</p>',
      '    <div class="vm-options">',
      '      <button class="vm-option vm-option--guest" type="button" id="vm-guest"><span class="vm-option-icon">J</span><span><strong>以游客身份浏览</strong><small>可以评论和点赞，显示为游客_XXXX</small></span><span class="vm-option-arr">-></span></button>',
      '      <button class="vm-option vm-option--email" type="button" id="vm-email-toggle"><span class="vm-option-icon">@</span><span><strong>邮箱注册 / 登陆</strong><small>有昵称，评论更有辨识度</small></span><span class="vm-option-arr">-></span></button>',
      '      <button class="vm-option vm-option--github" type="button" id="vm-github"><span class="vm-option-icon">GH</span><span><strong>GitHub 账号登陆</strong><small>一键授权，最快捷</small></span><span class="vm-option-arr">-></span></button>',
      '    </div>',
      '    <form class="vm-email-form" id="vm-email-form" hidden>',
      '      <input type="email" id="vm-email-input" placeholder="你的邮箱" required>',
      '      <input type="password" id="vm-password-input" placeholder="密码（至少8位）" required minlength="8">',
      '      <input type="text" id="vm-nickname-input" placeholder="昵称（显示在评论里）">',
      '      <button type="submit" class="btn btn-green">注册 / 登陆</button>',
      '      <p class="vm-email-hint">已有账号直接填写邮箱+密码即可登陆</p>',
      '    </form>',
      '    <p class="vm-note" id="vm-auth-message"></p>',
      '  </div>',
      '</div>'
    ].join('');
  }

  function qs(selector) {
    return document.querySelector(selector);
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

  function open() {
    const modal = getModal();
    modal.hidden = false;
    document.body.classList.add('visitor-modal-open');
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

  function bindModal(modal) {
    modal.querySelectorAll('[data-vm-close]').forEach((button) => {
      button.addEventListener('click', () => close(true));
    });

    qs('#vm-guest').addEventListener('click', () => {
      const identity = window.JanetAuth.createGuest();
      setMessage(identity.displayName + ' 已进入。', 'success');
      window.setTimeout(() => close(false), 260);
    });

    qs('#vm-email-toggle').addEventListener('click', () => {
      qs('#vm-email-form').hidden = !qs('#vm-email-form').hidden;
      setMessage(window.JanetAuth && window.JanetAuth.isConfigured()
        ? ''
        : 'Supabase 还没配置，邮箱/GitHub 暂不可用。', 'warn');
    });

    qs('#vm-github').addEventListener('click', async () => {
      try {
        setMessage('正在跳转 GitHub...', 'info');
        await window.JanetAuth.signInWithGithub();
      } catch (error) {
        setMessage(error.message || 'GitHub 登陆暂不可用。', 'warn');
      }
    });

    qs('#vm-email-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      const email = qs('#vm-email-input').value.trim();
      const password = qs('#vm-password-input').value;
      const nickname = qs('#vm-nickname-input').value.trim();
      try {
        setMessage('正在处理...', 'info');
        await window.JanetAuth.signInOrSignUp(email, password, nickname);
        setMessage('登陆成功。', 'success');
        window.setTimeout(() => close(false), 360);
      } catch (error) {
        setMessage(error.message || '邮箱登陆失败。', 'warn');
      }
    });
  }

  window.JanetVisitorModal = { open, close, ensure: getModal };

  document.addEventListener('DOMContentLoaded', () => {
    getModal();
    window.setTimeout(() => {
      const identity = window.JanetAuth && window.JanetAuth.getIdentity();
      const skipped = localStorage.getItem(window.JanetAuth && window.JanetAuth.storage.skipped);
      if (!identity && !skipped) open();
    }, 1500);
  });
})();
