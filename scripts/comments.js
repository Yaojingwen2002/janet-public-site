(function() {
  'use strict';

  const state = {
    editionId: '',
    editionTitle: '',
    editionUrl: '',
    replyTo: '',
    comments: []
  };
  const warned = new Set();
  let bound = false;

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

  function getCommentsContainer() {
    return qs('#daily-comments') || qs('#comments-section');
  }

  function getIdentity() {
    return window.JanetAuth && window.JanetAuth.getIdentity();
  }

  function displayName(name, guestId) {
    const clean = String(name || '').trim();
    if (/^游客_/i.test(clean)) return 'Janet 游客 ' + clean.replace(/^游客_/i, '').slice(0, 4).toUpperCase();
    if (clean && !clean.includes('@')) return clean;
    if (guestId) return 'Janet 游客 ' + String(guestId).replace(/^guest_/, '').slice(0, 4).toUpperCase();
    return '有读者';
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

  function visibleLocalComments(editionId) {
    return readLocal(editionId)
      .filter((item) => !item.is_deleted)
      .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  }

  async function loadComments(editionId) {
    if (!editionId) return [];
    if (configured()) {
      const query = (columns) => client()
        .from('comments')
        .select(columns)
        .eq('edition_id', editionId)
        .eq('is_deleted', false)
        .order('created_at', { ascending: false });

      let { data, error } = await query('id, edition_id, parent_comment_id, user_id, guest_id, display_name, content, created_at, is_deleted');
      if (error && /parent_comment_id/i.test(error.message || '')) {
        const fallback = await query('id, edition_id, user_id, guest_id, display_name, content, created_at, is_deleted');
        data = (fallback.data || []).map((item) => ({ ...item, parent_comment_id: null }));
        error = fallback.error;
      }
      if (!error) return data || [];
      warnOnce('Supabase load', error.message);
    }
    return visibleLocalComments(editionId);
  }

  async function saveComment(editionId, content, parentCommentId) {
    const identity = getIdentity();
    if (!identity) throw new Error('先选择游客或登录账号。');
    const payload = {
      edition_id: editionId,
      parent_comment_id: parentCommentId || null,
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
    const target = state.comments.find((item) => String(item.id) === String(commentId));
    const identity = getIdentity();
    if (!ownsComment(target, identity)) throw new Error('只能删除自己的评论。');

    if (configured() && !String(commentId).startsWith('local_')) {
      const { error } = await client().from('comments').update({ is_deleted: true }).eq('id', commentId);
      if (!error) return;
      warnOnce('Supabase delete', error.message);
    }

    const comments = readLocal(state.editionId).map((item) => String(item.id) === String(commentId) ? { ...item, is_deleted: true } : item);
    writeLocal(state.editionId, comments);
  }

  function updateCommentBadges(editionId, count) {
    qsa('[data-comment-count]').filter((el) => el.dataset.editionId === editionId).forEach((el) => {
      el.textContent = String(count);
    });
  }

  async function refreshCommentBadges() {
    const editionIds = new Set();
    qsa('[data-comment-count]').forEach((el) => {
      if (el.dataset.editionId) editionIds.add(el.dataset.editionId);
    });
    await Promise.all(Array.from(editionIds).map(async (editionId) => {
      const comments = await loadComments(editionId);
      updateCommentBadges(editionId, comments.length);
    }));
  }

  function timeLabel(value) {
    const date = value ? new Date(value) : new Date();
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  }

  function sortDesc(a, b) {
    return String(b.created_at).localeCompare(String(a.created_at));
  }

  function sortAsc(a, b) {
    return String(a.created_at).localeCompare(String(b.created_at));
  }

  function threadComments(comments) {
    const ids = new Set(comments.map((comment) => String(comment.id)));
    const roots = [];
    const replies = new Map();

    comments.forEach((comment) => {
      const parentId = comment.parent_comment_id ? String(comment.parent_comment_id) : '';
      if (parentId && ids.has(parentId)) {
        if (!replies.has(parentId)) replies.set(parentId, []);
        replies.get(parentId).push(comment);
      } else {
        roots.push(comment);
      }
    });

    roots.sort(sortDesc);
    replies.forEach((items) => items.sort(sortAsc));
    return { roots, replies };
  }

  function renderComment(comment, identity, replies, isReply) {
    const canDelete = ownsComment(comment, identity);
    const canReply = Boolean(identity) && !isReply;
    const name = displayName(comment.display_name, comment.guest_id);
    const initial = String(name || 'J').trim().slice(0, 1).toUpperCase();
    const id = escapeHtml(comment.id);
    const childReplies = replies.get(String(comment.id)) || [];
    const actions = [
      canReply ? '    <button class="comment-reply" type="button" data-comment-reply="' + id + '">回复</button>' : '',
      canDelete ? '    <button class="comment-delete" type="button" data-comment-delete="' + id + '">删除</button>' : ''
    ].filter(Boolean).join('');

    return [
      '<article class="comment-item' + (isReply ? ' comment-item--reply' : '') + '">',
      '  <div class="comment-avatar">' + escapeHtml(initial) + '</div>',
      '  <div class="comment-body">',
      '    <div class="comment-meta"><strong>' + escapeHtml(name) + '</strong><span>' + escapeHtml(timeLabel(comment.created_at)) + '</span></div>',
      '    <p>' + escapeHtml(comment.content || '') + '</p>',
      actions ? '    <div class="comment-actions">' + actions + '</div>' : '',
      childReplies.length ? '    <div class="comment-replies">' + childReplies.map((reply) => renderComment(reply, identity, replies, true)).join('') + '</div>' : '',
      '  </div>',
      '</article>'
    ].join('');
  }

  function render(container, message) {
    if (!container) return;
    const identity = getIdentity();
    const comments = state.comments;
    const { roots, replies } = threadComments(comments);
    const replyTarget = state.replyTo ? comments.find((item) => String(item.id) === String(state.replyTo)) : null;
    container.dataset.editionId = state.editionId || '';

    if (!state.editionId) {
      container.innerHTML = '<p class="comments-hint">点击上方某期快车箱，查看或发表评论。</p>';
      return;
    }

    const list = roots.length
      ? roots.map((comment) => renderComment(comment, identity, replies, false)).join('')
      : '<p class="comments-empty">还没人开口。第一条，留给你。</p>';

    const replyNotice = replyTarget
      ? '<div class="comment-replying"><span>正在回复 ' + escapeHtml(displayName(replyTarget.display_name, replyTarget.guest_id)) + '</span><button class="comment-reply-cancel" type="button" data-comment-reply-cancel>取消</button></div>'
      : '';

    const input = identity
      ? [
        '<form class="comment-form" data-comment-form>',
        replyNotice,
        '  <textarea name="content" minlength="10" maxlength="500" rows="4" placeholder="' + (replyTarget ? '回复这条评论，10-500 字。' : '写下你的判断，10-500 字。') + '" required></textarea>',
        '  <div class="comment-form-row">',
        '    <span>' + escapeHtml(identity.displayName) + '</span>',
        '    <button class="btn btn-green" type="submit">' + (replyTarget ? '发表回复' : '发表评论') + '</button>',
        '  </div>',
        '</form>'
      ].join('')
      : [
        '<div class="comments-login-prompt">',
        '  <p>登录或用游客身份后才能评论。</p>',
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

  function addCommentsHash(url) {
    if (!url || url === '#') return '#daily-comments';
    return String(url).split('#')[0] + '#daily-comments';
  }

  async function openComments(editionId, title, url) {
    const container = getCommentsContainer();
    if (!editionId) return;
    if (!container && url) {
      window.location.href = addCommentsHash(url);
      return;
    }
    state.editionId = editionId;
    state.editionTitle = title || editionId;
    state.editionUrl = url || window.location.href;
    state.replyTo = '';
    state.comments = await loadComments(editionId);
    updateCommentBadges(editionId, state.comments.length);
    render(container);
    if (container) container.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function refreshCurrent() {
    if (!state.editionId) {
      await refreshCommentBadges();
      return;
    }
    const container = getCommentsContainer();
    state.comments = await loadComments(state.editionId);
    updateCommentBadges(state.editionId, state.comments.length);
    render(container);
  }

  function initContainer() {
    const container = getCommentsContainer();
    if (!container) return;
    const editionId = container.dataset.editionId || '';
    state.editionId = editionId;
    state.editionTitle = container.dataset.editionTitle || document.title || editionId;
    state.editionUrl = window.location.href;
    if (editionId) {
      refreshCurrent();
    } else {
      render(container);
    }
  }

  function bind() {
    if (bound) return;
    bound = true;

    document.addEventListener('click', async (event) => {
      const toggle = event.target.closest('[data-comment-toggle]');
      if (toggle) {
        event.preventDefault();
        await openComments(toggle.dataset.editionId, toggle.dataset.editionTitle, toggle.dataset.editionUrl);
        return;
      }

      const login = event.target.closest('[data-comments-login]');
      if (login) {
        if (window.JanetVisitorModal) {
          window.JanetVisitorModal.open();
        } else if (window.JanetAuth) {
          window.JanetAuth.createGuest();
          await refreshCurrent();
        }
        return;
      }

      const replyBtn = event.target.closest('[data-comment-reply]');
      if (replyBtn) {
        state.replyTo = replyBtn.dataset.commentReply || '';
        render(getCommentsContainer());
        const form = qs('[data-comment-form]');
        if (form) form.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }

      const cancelReply = event.target.closest('[data-comment-reply-cancel]');
      if (cancelReply) {
        state.replyTo = '';
        render(getCommentsContainer());
        return;
      }

      const deleteBtn = event.target.closest('[data-comment-delete]');
      if (deleteBtn) {
        try {
          await deleteComment(deleteBtn.dataset.commentDelete);
          await refreshCurrent();
        } catch (error) {
          render(getCommentsContainer(), error.message);
        }
      }
    });

    document.addEventListener('submit', async (event) => {
      const form = event.target.closest('[data-comment-form]');
      if (!form) return;
      event.preventDefault();
      const content = String(new FormData(form).get('content') || '').trim();
      if (content.length < 10 || content.length > 500) {
        render(getCommentsContainer(), '评论需要 10-500 字。');
        return;
      }
      try {
        await saveComment(state.editionId, content, state.replyTo);
        state.replyTo = '';
        form.reset();
        await refreshCurrent();
      } catch (error) {
        render(getCommentsContainer(), error.message);
      }
    });

    document.addEventListener('janet:auth-changed', refreshCurrent);
    document.addEventListener('janet:content-rendered', refreshCommentBadges);
    document.addEventListener('janet:supabase-ready', refreshCurrent);
  }

  window.JanetComments = { open: openComments, refresh: refreshCurrent };

  document.addEventListener('DOMContentLoaded', () => {
    bind();
    refreshCommentBadges();
    initContainer();
  });
})();
