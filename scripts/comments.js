(function() {
  'use strict';

  const state = {
    editionId: '',
    editionTitle: '',
    editionUrl: '',
    comments: []
  };
  const warned = new Set();

  const qs = (selector, parent = document) => parent.querySelector(selector);
  const qsa = (selector, parent = document) => Array.from(parent.querySelectorAll(selector));
  const client = () => window.JanetSupabase && window.JanetSupabase.client;
  const configured = () => Boolean(window.JanetSupabase && window.JanetSupabase.isConfigured && client());

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function localKey(editionId) {
    return 'janet_comments_' + editionId;
  }

  function getIdentity() {
    return window.JanetAuth && window.JanetAuth.getIdentity();
  }

  function ownsComment(comment, identity) {
    if (!identity || !comment) return false;
    if (identity.mode === 'user') return comment.user_id === identity.userId;
    return comment.guest_id === identity.guestId;
  }

  function readLocal(editionId) {
    try {
      return JSON.parse(localStorage.getItem(localKey(editionId)) || '[]');
    } catch (_error) {
      return [];
    }
  }

  function writeLocal(editionId, comments) {
    localStorage.setItem(localKey(editionId), JSON.stringify(comments));
  }

  function warnOnce(scope, message) {
    const key = scope + ':' + message;
    if (warned.has(key)) return;
    warned.add(key);
    console.warn('[comments] ' + scope + ' failed, using local fallback:', message);
  }

  async function loadComments(editionId) {
    if (!editionId) return [];
    if (configured()) {
      const { data, error } = await client()
        .from('comments')
        .select('id, edition_id, user_id, guest_id, display_name, content, created_at, is_deleted')
        .eq('edition_id', editionId)
        .eq('is_deleted', false)
        .order('created_at', { ascending: false });
      if (!error) return data || [];
      warnOnce('Supabase load', error.message);
    }
    return readLocal(editionId).filter((item) => !item.is_deleted).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  }

  async function saveComment(editionId, content) {
    const identity = getIdentity();
    if (!identity) throw new Error('先选择游客或登陆账号。');
    const payload = {
      edition_id: editionId,
      user_id: identity.mode === 'user' ? identity.userId : null,
      guest_id: identity.mode === 'guest' ? identity.guestId : null,
      display_name: identity.displayName,
      content
    };

    if (configured()) {
      const { error } = await client().from('comments').insert(payload);
      if (!error) return;
      warnOnce('Supabase insert', error.message);
    }

    const comments = readLocal(editionId);
    comments.unshift({
      ...payload,
      id: 'local_' + Date.now().toString(36),
      created_at: new Date().toISOString(),
      is_deleted: false
    });
    writeLocal(editionId, comments);
  }

  async function deleteComment(commentId) {
    const target = state.comments.find((item) => item.id === commentId);
    const identity = getIdentity();
    if (!ownsComment(target, identity)) throw new Error('只能删除自己的评论。');

    if (configured() && !String(commentId).startsWith('local_')) {
      const { error } = await client().from('comments').update({ is_deleted: true }).eq('id', commentId);
      if (!error) return;
      warnOnce('Supabase delete', error.message);
    }

    const comments = readLocal(state.editionId).map((item) => item.id === commentId ? { ...item, is_deleted: true } : item);
    writeLocal(state.editionId, comments);
  }

  function updateCommentBadges(editionId, count) {
    qsa('[data-comment-count]').filter((el) => el.dataset.editionId === editionId).forEach((el) => {
      el.textContent = String(count);
    });
  }

  function refreshLocalBadges() {
    const seen = new Set();
    qsa('[data-comment-count]').forEach((el) => {
      const editionId = el.dataset.editionId;
      if (!editionId || seen.has(editionId)) return;
      seen.add(editionId);
      const count = readLocal(editionId).filter((item) => !item.is_deleted).length;
      updateCommentBadges(editionId, count);
    });
  }

  function timeLabel(value) {
    const date = value ? new Date(value) : new Date();
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  }

  function render(container, message) {
    const identity = getIdentity();
    const comments = state.comments;
    container.dataset.editionId = state.editionId || '';

    if (!state.editionId) {
      container.innerHTML = '<p class="comments-hint">点击上方某期快车箱，查看或发表评论。</p>';
      return;
    }

    const list = comments.length
      ? comments.map((comment) => {
        const canDelete = ownsComment(comment, identity);
        const initial = String(comment.display_name || 'J').trim().slice(0, 1).toUpperCase();
        return [
          '<article class="comment-item">',
          '  <div class="comment-avatar">' + escapeHtml(initial) + '</div>',
          '  <div class="comment-body">',
          '    <div class="comment-meta"><strong>' + escapeHtml(comment.display_name || '游客') + '</strong><span>' + escapeHtml(timeLabel(comment.created_at)) + '</span></div>',
          '    <p>' + escapeHtml(comment.content || '') + '</p>',
          canDelete ? '    <button class="comment-delete" type="button" data-comment-delete="' + escapeHtml(comment.id) + '">删除</button>' : '',
          '  </div>',
          '</article>'
        ].join('');
      }).join('')
      : '<p class="comments-empty">还没人开口。第一条，留给你。</p>';

    const input = identity
      ? [
        '<form class="comment-form" data-comment-form>',
        '  <textarea name="content" minlength="10" maxlength="500" rows="4" placeholder="写下你的判断，10-500 字。" required></textarea>',
        '  <div class="comment-form-row">',
        '    <span>' + escapeHtml(identity.displayName) + '</span>',
        '    <button class="btn btn-green" type="submit">发表评论</button>',
        '  </div>',
        '</form>'
      ].join('')
      : [
        '<div class="comments-login-prompt">',
        '  <p>登陆或用游客身份后才能评论。</p>',
        '  <button class="btn btn-outline" type="button" data-comments-login>选择身份</button>',
        '</div>'
      ].join('');

    container.innerHTML = [
      '<div class="comments-head">',
      '  <div><span class="section-kicker">Comments</span><h3>' + escapeHtml(state.editionTitle || state.editionId) + '</h3></div>',
      '  <span class="comments-count">' + comments.length + ' 条评论</span>',
      '</div>',
      input,
      message ? '<p class="comments-message">' + escapeHtml(message) + '</p>' : '',
      '<div class="comments-list">' + list + '</div>'
    ].join('');
  }

  async function openComments(editionId, title, url) {
    const container = qs('#comments-section');
    if (!container || !editionId) return;
    state.editionId = editionId;
    state.editionTitle = title || editionId;
    state.editionUrl = url || '';
    state.comments = await loadComments(editionId);
    updateCommentBadges(editionId, state.comments.length);
    render(container);
    container.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function refreshCurrent() {
    if (!state.editionId) return;
    state.comments = await loadComments(state.editionId);
    updateCommentBadges(state.editionId, state.comments.length);
    render(qs('#comments-section'));
  }

  function bind() {
    document.addEventListener('click', async (event) => {
      const toggle = event.target.closest('[data-comment-toggle]');
      if (toggle) {
        event.preventDefault();
        await openComments(toggle.dataset.editionId, toggle.dataset.editionTitle, toggle.dataset.editionUrl);
        return;
      }

      const login = event.target.closest('[data-comments-login]');
      if (login && window.JanetVisitorModal) {
        window.JanetVisitorModal.open();
        return;
      }

      const deleteBtn = event.target.closest('[data-comment-delete]');
      if (deleteBtn) {
        try {
          await deleteComment(deleteBtn.dataset.commentDelete);
          await refreshCurrent();
        } catch (error) {
          render(qs('#comments-section'), error.message);
        }
      }
    });

    document.addEventListener('submit', async (event) => {
      const form = event.target.closest('[data-comment-form]');
      if (!form) return;
      event.preventDefault();
      const content = String(new FormData(form).get('content') || '').trim();
      if (content.length < 10 || content.length > 500) {
        render(qs('#comments-section'), '评论需要 10-500 字。');
        return;
      }
      try {
        await saveComment(state.editionId, content);
        form.reset();
        await refreshCurrent();
      } catch (error) {
        render(qs('#comments-section'), error.message);
      }
    });

    document.addEventListener('janet:auth-changed', refreshCurrent);
    document.addEventListener('janet:content-rendered', refreshLocalBadges);
    document.addEventListener('janet:supabase-ready', refreshCurrent);
  }

  window.JanetComments = { open: openComments, refresh: refreshCurrent };

  document.addEventListener('DOMContentLoaded', () => {
    if (!qs('#comments-section')) return;
    bind();
    refreshLocalBadges();
    render(qs('#comments-section'));
  });
})();
