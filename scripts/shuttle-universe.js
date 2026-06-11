// shuttle-universe.js — YouTube Shorts hover preview for the dedicated project page.

(function() {
  'use strict';

  const DOC_DATA_URL = 'assets/works/shuttle-universe/documents/document-reader.json';

  let activeCard = null;
  let activeCover = null;
  let documentData = [];
  let activeDocIndex = -1;
  let activePageIndex = 0;

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function buildSrc(card, mode) {
    const videoId = card.dataset.videoId;
    const embed = card.dataset.embed;
    const params = mode === 'preview'
      ? {
          autoplay: '1',
          mute: '1',
          controls: '0',
          playsinline: '1',
          loop: '1',
          playlist: videoId,
          rel: '0',
          modestbranding: '1'
        }
      : {
          autoplay: '1',
          mute: '0',
          controls: '1',
          playsinline: '1',
          rel: '0',
          modestbranding: '1'
        };
    return embed + '?' + new URLSearchParams(params).toString();
  }

  function destroyPlayer(card) {
    if (!card) return;
    const player = card.querySelector('.shuttle-video-player');
    if (player) player.innerHTML = '';
    card.classList.remove('is-previewing', 'is-playing');
    if (activeCard === card) activeCard = null;
  }

  function mountPlayer(card, mode) {
    if (!card) return;
    if (activeCard && activeCard !== card) destroyPlayer(activeCard);
    const player = card.querySelector('.shuttle-video-player');
    if (!player) return;
    const title = card.querySelector('h3')?.textContent || '穿梭宇宙作品';
    player.innerHTML = `
      <iframe
        src="${escapeHtml(buildSrc(card, mode))}"
        title="${escapeHtml(title)}"
        loading="lazy"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen"
        allowfullscreen></iframe>
    `;
    card.classList.toggle('is-previewing', mode === 'preview');
    card.classList.toggle('is-playing', mode === 'play');
    activeCard = card;
  }

  function requestFullscreen(card) {
    const iframe = card?.querySelector('.shuttle-video-player iframe');
    const target = iframe || card?.querySelector('.shuttle-video-stage');
    if (target?.requestFullscreen) target.requestFullscreen().catch(() => {});
  }

  function bindCard(card) {
    const stage = card.querySelector('.shuttle-video-stage');
    const expand = card.querySelector('.shuttle-expand');
    const preview = card.querySelector('.shuttle-preview-trigger');
    const fullscreen = card.querySelector('.shuttle-fullscreen-btn');
    const canHover = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

    if (!stage || !expand || !preview || !fullscreen) return;

    if (canHover) {
      stage.addEventListener('mouseenter', () => mountPlayer(card, 'preview'));
      stage.addEventListener('mouseleave', () => {
        if (!card.classList.contains('is-playing')) destroyPlayer(card);
      });
    }

    stage.addEventListener('click', () => {
      if (canHover) {
        mountPlayer(card, 'play');
        return;
      }
      const step = Number(card.dataset.mobileStep || '0');
      if (step === 0) {
        mountPlayer(card, 'preview');
        card.dataset.mobileStep = '1';
      } else {
        mountPlayer(card, 'play');
        card.dataset.mobileStep = '2';
      }
    });

    stage.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        mountPlayer(card, 'play');
      }
    });

    stage.addEventListener('dblclick', () => requestFullscreen(card));
    fullscreen.addEventListener('click', (event) => {
      event.stopPropagation();
      requestFullscreen(card);
    });
    preview.addEventListener('click', () => mountPlayer(card, 'preview'));
    expand.addEventListener('click', () => {
      const expanded = card.classList.toggle('is-copy-expanded');
      expand.setAttribute('aria-expanded', String(expanded));
      expand.textContent = expanded ? '收起 ↑' : '展开 ↓';
    });
  }

  function buildYouTubeCoverSrc(cover) {
    const videoId = cover.dataset.youtubeId || '';
    return 'https://www.youtube.com/embed/' + encodeURIComponent(videoId) + '?' + new URLSearchParams({
      autoplay: '1',
      mute: '1',
      controls: '0',
      playsinline: '1',
      loop: '1',
      playlist: videoId,
      rel: '0',
      modestbranding: '1'
    }).toString();
  }

  function destroyYouTubeCover(cover) {
    if (!cover) return;
    const player = cover.querySelector('.youtube-hover-cover__player');
    if (player) player.innerHTML = '';
    cover.classList.remove('is-youtube-previewing');
    if (activeCover === cover) activeCover = null;
  }

  function mountYouTubeCover(cover) {
    if (!cover || !cover.dataset.youtubeId) return;
    if (activeCover && activeCover !== cover) destroyYouTubeCover(activeCover);
    const player = cover.querySelector('.youtube-hover-cover__player');
    const image = cover.querySelector('img');
    if (!player) return;
    player.innerHTML = `
      <iframe
        src="${escapeHtml(buildYouTubeCoverSrc(cover))}"
        title="${escapeHtml(image?.alt || 'YouTube video preview')}"
        loading="lazy"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowfullscreen></iframe>
    `;
    cover.classList.add('is-youtube-previewing');
    activeCover = cover;
  }

  function bindYouTubeCover(cover) {
    const hit = cover.querySelector('.youtube-hover-cover__hit');
    cover.addEventListener('mouseenter', () => mountYouTubeCover(cover));
    cover.addEventListener('mouseleave', () => destroyYouTubeCover(cover));
    if (hit) {
      hit.addEventListener('focus', () => mountYouTubeCover(cover));
      hit.addEventListener('blur', () => destroyYouTubeCover(cover));
    }
  }

  function getDocModalElements() {
    return {
      root: document.getElementById('shuttle-doc-modal'),
      title: document.getElementById('shuttle-doc-modal-title'),
      subtitle: document.getElementById('shuttle-doc-modal-subtitle'),
      count: document.getElementById('shuttle-doc-modal-count'),
      toc: document.getElementById('shuttle-doc-modal-toc'),
      reader: document.getElementById('shuttle-doc-modal-reader'),
      download: document.getElementById('shuttle-doc-modal-download')
    };
  }

  function activeDocument() {
    return documentData[activeDocIndex] || null;
  }

  function activePage() {
    const doc = activeDocument();
    return doc?.pages?.[activePageIndex] || null;
  }

  function renderDocToc(doc, toc) {
    if (!toc) return;
    toc.innerHTML = (doc.pages || []).map((page, index) => `
      <button class="${index === activePageIndex ? 'is-active' : ''}" type="button" data-shuttle-doc-page="${index}">
        ${escapeHtml(index + 1)}. ${escapeHtml(page.title || `第 ${index + 1} 页`)}
      </button>
    `).join('');
    toc.querySelectorAll('[data-shuttle-doc-page]').forEach((button) => {
      button.addEventListener('click', () => {
        activePageIndex = Number(button.dataset.shuttleDocPage || '0');
        renderDocModal();
      });
    });
  }

  function renderDocReader(page, reader) {
    if (!reader || !page) return;
    const paragraphs = page.paragraphs || [];
    reader.innerHTML = `
      <div class="shuttle-doc-page">
        <h3>${escapeHtml(page.title || '文档内容')}</h3>
        ${paragraphs.map(paragraph => `<p>${escapeHtml(paragraph)}</p>`).join('')}
      </div>
    `;
    reader.scrollTop = 0;
  }

  function renderDocModal() {
    const { root, title, subtitle, count, toc, reader, download } = getDocModalElements();
    const doc = activeDocument();
    const page = activePage();
    if (!root || !doc || !page) return;

    const docCount = documentData.length;
    const pageCount = doc.pages?.length || 0;
    if (title) title.textContent = doc.title || '穿梭宇宙文档';
    if (subtitle) subtitle.textContent = doc.label || '';
    if (count) count.textContent = `第 ${activeDocIndex + 1}/${docCount} 份 · 第 ${activePageIndex + 1}/${pageCount} 页`;
    if (download) download.href = doc.download_url || '#';

    renderDocToc(doc, toc);
    renderDocReader(page, reader);
  }

  function openDocModal(docId) {
    const { root } = getDocModalElements();
    if (!root) return;
    const index = documentData.findIndex(doc => doc.id === docId);
    if (index < 0) return;

    activeDocIndex = index;
    activePageIndex = 0;
    root.hidden = false;
    document.body.classList.add('shuttle-doc-modal-open');
    renderDocModal();

    const closeButton = root.querySelector('[data-shuttle-doc-close]');
    if (closeButton) closeButton.focus({ preventScroll: true });
  }

  function closeDocModal() {
    const { root } = getDocModalElements();
    if (!root) return;
    root.hidden = true;
    document.body.classList.remove('shuttle-doc-modal-open');
    activeDocIndex = -1;
    activePageIndex = 0;
  }

  function stepDocPage(direction) {
    if (!documentData.length || activeDocIndex < 0) return;
    const doc = activeDocument();
    const pageCount = doc?.pages?.length || 0;
    activePageIndex += direction;

    if (activePageIndex < 0) {
      activeDocIndex = (activeDocIndex - 1 + documentData.length) % documentData.length;
      activePageIndex = Math.max((activeDocument()?.pages?.length || 1) - 1, 0);
    } else if (activePageIndex >= pageCount) {
      activeDocIndex = (activeDocIndex + 1) % documentData.length;
      activePageIndex = 0;
    }

    renderDocModal();
  }

  function bindDocModalControls() {
    const { root } = getDocModalElements();
    if (!root) return;

    root.querySelectorAll('[data-shuttle-doc-close]').forEach((button) => {
      button.addEventListener('click', closeDocModal);
    });
    root.querySelector('[data-shuttle-doc-prev]')?.addEventListener('click', () => stepDocPage(-1));
    root.querySelector('[data-shuttle-doc-next]')?.addEventListener('click', () => stepDocPage(1));

    document.addEventListener('keydown', (event) => {
      if (root.hidden) return;
      if (event.key === 'Escape') closeDocModal();
      if (event.key === 'ArrowLeft') stepDocPage(-1);
      if (event.key === 'ArrowRight') stepDocPage(1);
    });
  }

  async function initDocReader() {
    const buttons = document.querySelectorAll('[data-shuttle-doc]');
    if (!buttons.length) return;

    bindDocModalControls();
    try {
      const response = await fetch(DOC_DATA_URL, { cache: 'no-cache' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      documentData = Array.isArray(payload.documents) ? payload.documents : [];
    } catch (error) {
      console.warn('[shuttle-universe] document reader failed:', error);
      buttons.forEach((button) => {
        button.disabled = true;
        const badge = button.querySelector('strong');
        if (badge) badge.textContent = '暂不可读';
      });
      return;
    }

    buttons.forEach((button) => {
      button.addEventListener('click', () => openDocModal(button.dataset.shuttleDoc));
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.shuttle-video-card').forEach(bindCard);
    document.querySelectorAll('.youtube-hover-cover').forEach(bindYouTubeCover);
    initDocReader();
  });
})();
