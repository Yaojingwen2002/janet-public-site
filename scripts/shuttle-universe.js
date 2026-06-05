// shuttle-universe.js — YouTube Shorts hover preview for the dedicated project page.

(function() {
  'use strict';

  let activeCard = null;
  let activeCover = null;

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

  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.shuttle-video-card').forEach(bindCard);
    document.querySelectorAll('.youtube-hover-cover').forEach(bindYouTubeCover);
  });
})();
