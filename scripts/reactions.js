(function() {
  'use strict';

  const TYPES = ['like'];
  const LABELS = {
    like: ['👍', '有用']
  };
  const warned = new Set();
  const stateCache = new Map();
  const STATE_CACHE_TTL = 30000;
  let refreshPromise = null;
  let refreshQueued = false;

  const qs = (selector, parent = document) => parent.querySelector(selector);
  const qsa = (selector, parent = document) => Array.from(parent.querySelectorAll(selector));
  const client = () => window.JanetSupabase && window.JanetSupabase.client;
  const configured = () => Boolean(window.JanetSupabase && window.JanetSupabase.isConfigured && client());

  function storageKey(editionId) {
    return 'janet_reactions_' + editionId;
  }

  function activeKey(editionId, identity) {
    return 'janet_reaction_active_' + editionId + '_' + (identity ? identity.mode + '_' + (identity.userId || identity.guestId) : 'anon');
  }

  function readLocal(editionId) {
    try {
      return JSON.parse(localStorage.getItem(storageKey(editionId)) || '{}');
    } catch (_error) {
      return {};
    }
  }

  function writeLocal(editionId, data) {
    localStorage.setItem(storageKey(editionId), JSON.stringify(data));
  }

  function warnOnce(scope, message) {
    const key = scope + ':' + message;
    if (warned.has(key)) return;
    warned.add(key);
    console.warn('[reactions] ' + scope + ' failed, using local fallback:', message);
  }

  function getIdentity() {
    return window.JanetAuth && window.JanetAuth.getIdentity();
  }

  function openIdentityMenu() {
    if (window.JanetPotatoCenter) {
      window.JanetPotatoCenter.open('guest');
      return;
    }
    document.dispatchEvent(new CustomEvent('janet:open-potato-center', {
      detail: { tab: 'guest' }
    }));
  }

  function reactionWrapFor(button) {
    return button.closest('.news-reactions') ||
      button.closest('.news-card-actions, .news-secondary-actions, .home-engagement, .bottom-interaction-bar')?.querySelector('.news-reactions');
  }

  function getEditionUrl(button) {
    const wrap = reactionWrapFor(button);
    const url = wrap && wrap.dataset.editionUrl ? wrap.dataset.editionUrl : window.location.href;
    return new URL(url, window.location.href).href;
  }

  function getEditionTitle(button) {
    const wrap = reactionWrapFor(button);
    return wrap && wrap.dataset.editionTitle ? wrap.dataset.editionTitle : 'Janet 快车箱';
  }

  function getCountsLocal(editionId) {
    const local = readLocal(editionId);
    return TYPES.reduce((acc, type) => {
      acc[type] = Number(local[type] || 0);
      return acc;
    }, {});
  }

  function getActiveLocal(editionId, identity) {
    if (!identity) return [];
    try {
      return JSON.parse(localStorage.getItem(activeKey(editionId, identity)) || '[]');
    } catch (_error) {
      return [];
    }
  }

  function setActiveLocal(editionId, identity, active) {
    if (!identity) return;
    localStorage.setItem(activeKey(editionId, identity), JSON.stringify(active));
  }

  function stateFromRows(editionId, rows) {
    const identity = getIdentity();
    const counts = getCountsLocal(editionId);
    let active = getActiveLocal(editionId, identity);
    if (!rows) return { counts, active };

    TYPES.forEach((type) => { counts[type] = 0; });
    active = [];
    rows.forEach((row) => {
      const type = row.reaction_type || 'like';
      if (TYPES.includes(type)) counts[type] += 1;
      if (identity && ((identity.mode === 'user' && row.user_id === identity.userId) || (identity.mode === 'guest' && row.guest_id === identity.guestId))) {
        active.push(type);
      }
    });
    setActiveLocal(editionId, identity, active);
    return { counts, active };
  }

  async function loadStates(editionIds) {
    const ids = [...new Set(editionIds.filter(Boolean))];
    const now = Date.now();
    const rowsByEdition = new Map();
    const missing = [];

    ids.forEach((editionId) => {
      const cached = stateCache.get(editionId);
      if (cached && now - cached.updatedAt < STATE_CACHE_TTL) {
        rowsByEdition.set(editionId, cached.rows);
      } else {
        rowsByEdition.set(editionId, null);
        missing.push(editionId);
      }
    });

    if (configured() && missing.length) {
      const { data, error } = await client()
        .from('reactions')
        .select('edition_id, reaction_type, user_id, guest_id')
        .in('edition_id', missing);

      if (!error) {
        const fetched = new Map(missing.map((editionId) => [editionId, []]));
        (data || []).forEach((row) => {
          if (fetched.has(row.edition_id)) fetched.get(row.edition_id).push(row);
        });
        fetched.forEach((rows, editionId) => {
          rowsByEdition.set(editionId, rows);
          stateCache.set(editionId, { rows, updatedAt: now });
        });
      } else {
        warnOnce('Supabase load', error.message);
      }
    }

    return new Map(ids.map((editionId) => [editionId, stateFromRows(editionId, rowsByEdition.get(editionId))]));
  }

  async function loadState(editionId) {
    return (await loadStates([editionId])).get(editionId) || { counts: getCountsLocal(editionId), active: [] };
  }

  async function toggleReaction(editionId, type) {
    const identity = getIdentity();
    if (!identity) {
      openIdentityMenu();
      return;
    }

    const local = getCountsLocal(editionId);
    const active = getActiveLocal(editionId, identity);
    const isActive = active.includes(type);

    if (configured()) {
      const payload = {
        edition_id: editionId,
        reaction_type: type,
        user_id: identity.mode === 'user' ? identity.userId : null,
        guest_id: identity.mode === 'guest' ? identity.guestId : null
      };
      let result;
      if (isActive) {
        let query = client().from('reactions').delete().eq('edition_id', editionId).eq('reaction_type', type);
        query = identity.mode === 'user' ? query.eq('user_id', identity.userId) : query.eq('guest_id', identity.guestId);
        result = await query;
      } else {
        result = await client().from('reactions').insert(payload);
      }
      if (result.error) {
        warnOnce('Supabase toggle', result.error.message);
      } else {
        stateCache.delete(editionId);
        return;
      }
    }

    if (isActive) {
      local[type] = Math.max(0, Number(local[type] || 0) - 1);
      setActiveLocal(editionId, identity, active.filter((item) => item !== type));
    } else {
      local[type] = Number(local[type] || 0) + 1;
      setActiveLocal(editionId, identity, [...active, type]);
    }
    writeLocal(editionId, local);
    stateCache.delete(editionId);
  }

  async function renderWrap(wrap, loadedState) {
    const editionId = wrap.dataset.editionId;
    if (!editionId) return;
    const { counts, active } = loadedState || await loadState(editionId);
    TYPES.forEach((type) => {
      const button = qs('[data-reaction-type="' + type + '"]', wrap);
      if (!button) return;
      button.classList.toggle('is-active', active.includes(type));
      const count = qs('[data-reaction-count]', button);
      if (count) count.textContent = String(counts[type] || 0);
    });
  }

  async function runRefreshAll() {
    const wraps = qsa('.news-reactions');
    const states = await loadStates(wraps.map((wrap) => wrap.dataset.editionId));
    await Promise.all(wraps.map((wrap) => renderWrap(wrap, states.get(wrap.dataset.editionId))));
  }

  async function refreshAll() {
    if (refreshPromise) {
      refreshQueued = true;
      return refreshPromise;
    }

    refreshPromise = (async () => {
      do {
        refreshQueued = false;
        await runRefreshAll();
      } while (refreshQueued);
    })();

    try {
      await refreshPromise;
    } finally {
      refreshPromise = null;
    }
  }

  async function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }
    const input = document.createElement('textarea');
    input.value = text;
    input.setAttribute('readonly', '');
    input.style.position = 'fixed';
    input.style.left = '-999px';
    document.body.appendChild(input);
    input.select();
    document.execCommand('copy');
    input.remove();
  }

  async function openShare(button, explicitAction) {
    const wrap = button.closest('.share-wrap');
    const menu = wrap ? qs('.share-menu', wrap) : null;
    const url = getEditionUrl(button);
    const title = getEditionTitle(button);
    if (explicitAction === 'copy') {
      await copyText(url);
      button.textContent = '已复制';
      window.setTimeout(() => { button.textContent = '复制链接'; }, 1200);
      return;
    }
    if (explicitAction === 'x') {
      window.open('https://twitter.com/intent/tweet?url=' + encodeURIComponent(url) + '&text=' + encodeURIComponent(title), '_blank', 'noopener,noreferrer');
      return;
    }
    if (explicitAction === 'weibo') {
      window.open('https://service.weibo.com/share/share.php?url=' + encodeURIComponent(url) + '&title=' + encodeURIComponent(title), '_blank', 'noopener,noreferrer');
      return;
    }
    if (navigator.share) {
      try {
        await navigator.share({ title, url });
        return;
      } catch (error) {
        if (error && error.name === 'AbortError') return;
      }
    }
    if (menu) {
      menu.hidden = !menu.hidden;
      const toggle = wrap && qs('[data-share-toggle]', wrap);
      if (toggle) toggle.setAttribute('aria-expanded', String(!menu.hidden));
    }
  }

  function bind() {
    document.addEventListener('click', async (event) => {
      const reactionBtn = event.target.closest('[data-reaction-type]');
      if (reactionBtn) {
        const wrap = reactionBtn.closest('.news-reactions');
        await toggleReaction(wrap.dataset.editionId, reactionBtn.dataset.reactionType);
        await renderWrap(wrap);
        return;
      }

      const shareBtn = event.target.closest('[data-share-toggle]');
      if (shareBtn) {
        event.preventDefault();
        await openShare(shareBtn);
        return;
      }

      const shareAction = event.target.closest('[data-share-action]');
      if (shareAction) {
        event.preventDefault();
        await openShare(shareAction, shareAction.dataset.shareAction);
      }
    });

    document.addEventListener('janet:content-rendered', refreshAll);
    document.addEventListener('janet:auth-changed', refreshAll);
    document.addEventListener('janet:supabase-ready', refreshAll);
  }

  window.JanetReactions = { refresh: refreshAll };

  document.addEventListener('DOMContentLoaded', () => {
    bind();
    refreshAll();
  });
})();
