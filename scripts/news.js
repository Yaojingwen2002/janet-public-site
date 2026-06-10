// news.js - Homepage Janet briefing renderer.
// Source of truth: data/news-index.json -> data/YYYY-MM-DD/content.json.

(function() {
  'use strict';

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function safeUrl(url) {
    if (!url || typeof url !== 'string') return '#';
    try {
      const parsed = new URL(url, window.location.href);
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') return parsed.href;
      if (parsed.origin === window.location.origin) return parsed.href;
    } catch (error) {}
    return '#';
  }

  async function loadJson(path) {
    const response = await fetch(path, { cache: 'no-cache' });
    if (!response.ok) throw new Error('Cannot load ' + path);
    return response.json();
  }

  function renderSkeleton(container) {
    if (!container) return;
    container.innerHTML =
      '<div class="news-loading-skeleton" aria-label="Janet 快车箱正在加载">' +
        '<div class="news-skeleton-cover"><span></span><span></span><span></span></div>' +
        '<div class="news-skeleton-grid"><span></span><span></span><span></span></div>' +
      '</div>';
  }

  function splitTrend(trend) {
    return String(trend || '')
      .split(/\n{2,}/)
      .map((part) => part.trim())
      .filter(Boolean);
  }

  function sectionItems(content, section) {
    return content.sections && content.sections[section] && Array.isArray(content.sections[section].items)
      ? content.sections[section].items
      : [];
  }

  function countItems(content) {
    return Object.values(content.sections || {}).reduce((sum, section) => {
      return sum + (Array.isArray(section.items) ? section.items.length : 0);
    }, 0);
  }

  function baseFromContentUrl(contentUrl) {
    return String(contentUrl || '').replace(/content\.json(?:\?.*)?$/, '');
  }

  function resolveAsset(contentUrl, value, fallbackFile) {
    const raw = String(value || '').trim();
    const base = baseFromContentUrl(contentUrl);
    if (!raw) return base + fallbackFile;
    if (/^(https?:|data:)/i.test(raw)) return raw;
    const clean = raw.replace(/^\.?\//, '').replace(/\\/g, '/');
    if (clean.startsWith('data/')) return clean;
    if (clean.startsWith('runs/')) {
      const parts = clean.split('/');
      const imageIndex = parts.indexOf('images');
      if (imageIndex >= 0) return base + parts.slice(imageIndex).join('/');
      if (clean.endsWith('/cover.png')) return base + 'cover.png';
    }
    if (clean.startsWith('images/')) return base + clean;
    return base + clean;
  }

  function renderTrend(content) {
    const parts = splitTrend(content.trend || content.intro_text || '');
    const title = parts.shift() || '今日趋势';
    return '<section class="codex-trend-card rv-fade">' +
      '<h3>今日趋势：' + escapeHtml(title) + '</h3>' +
      parts.map((part) => '<p>' + escapeHtml(part) + '</p>').join('') +
    '</section>';
  }

  function renderPlaceholder(index, isLead) {
    return '<div class="' + (isLead ? 'codex-news-placeholder codex-news-placeholder--lead' : 'codex-news-placeholder') + '" aria-hidden="true">' +
      '<span>' + String(index).padStart(2, '0') + '</span>' +
    '</div>';
  }

  function renderVisual(contentUrl, item, index, isLead) {
    const src = resolveAsset(contentUrl, item.image, '');
    if (!src) return renderPlaceholder(index + 1, isLead);
    const credit = String(item.image_credit || item.source || '').trim();
    return '<figure class="' + (isLead ? 'codex-news-image codex-news-image--lead' : 'codex-news-image') + '">' +
      '<img src="' + escapeHtml(src) + '" alt="' + escapeHtml(item.title || '今日新闻') + '" loading="' + (isLead ? 'eager' : 'lazy') + '" decoding="async">' +
      (credit ? '<figcaption>' + escapeHtml(credit) + '</figcaption>' : '') +
    '</figure>';
  }

  function itemUrl(item) {
    return safeUrl(item && item.url);
  }

  function isSamePageAnchor(url) {
    if (!url || url === '#') return false;
    try {
      const parsed = new URL(url, window.location.href);
      return parsed.origin === window.location.origin &&
        parsed.pathname === window.location.pathname &&
        parsed.hash.length > 1;
    } catch (error) {
      return false;
    }
  }

  function pulseAnchorTarget(target) {
    if (!target) return;
    target.classList.remove('janet-anchor-pulse');
    void target.offsetWidth;
    target.classList.add('janet-anchor-pulse');
    window.setTimeout(() => target.classList.remove('janet-anchor-pulse'), 1400);
  }

  function followNewsLink(url) {
    if (!url || url === '#') return;
    if (isSamePageAnchor(url)) {
      const parsed = new URL(url, window.location.href);
      const target = document.getElementById(decodeURIComponent(parsed.hash.slice(1)));
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'center' });
        pulseAnchorTarget(target);
        return;
      }
    }
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  function renderCarouselCard(contentUrl, item, index) {
    const url = itemUrl(item);
    const isActive = index === 0;
    return '<a class="codex-carousel-card janet-clickable-card' + (isActive ? ' is-active' : '') + '" ' +
      'href="' + escapeHtml(url) + '" ' +
      'target="' + (url !== '#' && !isSamePageAnchor(url) ? '_blank' : '_self') + '" ' +
      'rel="noopener noreferrer" ' +
      'data-carousel-card="' + index + '" ' +
      'aria-label="查看新闻：' + escapeHtml(item.title || '今日新闻') + '">' +
        renderVisual(contentUrl, item, index, true) +
        '<div class="codex-news-copy">' +
          '<div class="codex-news-meta">' +
            '<span>' + escapeHtml(item.source || 'Janet') + '</span>' +
            (url !== '#' ? '<span class="codex-news-dot"></span><span>原文</span>' : '') +
          '</div>' +
          '<h3>' + escapeHtml(item.title || '今日新闻') + '</h3>' +
          '<p class="codex-news-body">' + escapeHtml(item.body || '') + '</p>' +
          '<div class="codex-janet-take"><b>Janet 锐评：</b><span>' + escapeHtml(item.janet_take || '') + '</span></div>' +
        '</div>' +
      '</a>';
  }

  function renderNewsCarousel(contentUrl, items) {
    if (!items.length) return '';
    const controls = items.map((item, index) => {
      return '<button class="codex-carousel-progress' + (index === 0 ? ' is-active' : '') + '" ' +
        'type="button" data-carousel-progress="' + index + '" ' +
        'aria-label="切到第 ' + (index + 1) + ' 条新闻：' + escapeHtml(item.title || '今日新闻') + '">' +
          '<span></span>' +
        '</button>';
    }).join('');

    return '<section class="codex-global-news codex-news-carousel rv-fade" data-news-carousel aria-roledescription="carousel">' +
      '<div class="codex-carousel-stage">' +
        items.map((item, index) => renderCarouselCard(contentUrl, item, index)).join('') +
      '</div>' +
      '<div class="codex-carousel-progress-row" aria-label="新闻轮播进度">' + controls + '</div>' +
    '</section>';
  }

  function initNewsCarousel(root) {
    const carousel = root.querySelector('[data-news-carousel]');
    if (!carousel) return;

    const cards = Array.from(carousel.querySelectorAll('[data-carousel-card]'));
    const controls = Array.from(carousel.querySelectorAll('[data-carousel-progress]'));
    if (!cards.length || !controls.length) return;

    const duration = 10000;
    let active = 0;
    let timer = null;

    function setActive(index) {
      active = (index + cards.length) % cards.length;
      cards.forEach((card, cardIndex) => {
        const isActive = cardIndex === active;
        card.classList.toggle('is-active', isActive);
        card.setAttribute('aria-hidden', String(!isActive));
        card.tabIndex = isActive ? 0 : -1;
      });
      controls.forEach((control, controlIndex) => {
        const isActive = controlIndex === active;
        control.classList.toggle('is-active', isActive);
        control.setAttribute('aria-current', isActive ? 'true' : 'false');
      });
    }

    function scheduleNext() {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        setActive(active + 1);
        scheduleNext();
      }, duration);
    }

    function previewFromControl(index) {
        setActive(index);
        scheduleNext();
    }

    controls.forEach((control, index) => {
      control.addEventListener('pointerenter', () => previewFromControl(index));
      control.addEventListener('mouseenter', () => previewFromControl(index));
      control.addEventListener('mouseover', () => previewFromControl(index));
      control.addEventListener('focus', () => {
        previewFromControl(index);
      });
      control.addEventListener('click', (event) => {
        event.preventDefault();
        setActive(index);
        scheduleNext();
        const link = cards[index].getAttribute('href');
        followNewsLink(link);
      });
    });

    cards.forEach((card) => {
      card.addEventListener('click', (event) => {
        const href = card.getAttribute('href');
        if (!isSamePageAnchor(href)) return;
        event.preventDefault();
        followNewsLink(href);
      });
    });

    setActive(0);
    scheduleNext();
  }

  function renderNewsItem(contentUrl, item, index, isLead) {
    const url = safeUrl(item.url);
    const body =
      renderVisual(contentUrl, item, index, isLead) +
      '<div class="codex-news-copy">' +
        '<div class="codex-news-meta">' +
          '<span>' + escapeHtml(item.source || 'Janet') + '</span>' +
          (url !== '#' ? '<span class="codex-news-dot"></span><span>原文</span>' : '') +
        '</div>' +
        '<h3>' + escapeHtml(item.title || '今日新闻') + '</h3>' +
        '<p class="codex-news-body">' + escapeHtml(item.body || '') + '</p>' +
        '<div class="codex-janet-take"><b>Janet 锐评：</b><span>' + escapeHtml(item.janet_take || '') + '</span></div>' +
      '</div>';

    const className = isLead ? 'codex-news-card codex-news-card--lead janet-clickable-card rv-fade' : 'codex-news-card janet-clickable-card rv-fade';
    if (url === '#') return '<article class="' + className + '">' + body + '</article>';
    return '<a class="' + className + '" href="' + escapeHtml(url) + '" target="_blank" rel="noopener noreferrer" aria-label="查看新闻源：' + escapeHtml(item.title || '今日新闻') + '">' + body + '</a>';
  }

  function renderHomepage(index, content, contentUrl, edition) {
    const container = document.getElementById('news-editorial');
    const countEl = document.getElementById('news-count');
    if (!container) return;

    const cover = content.cover || {};
    const coverSrc = resolveAsset(contentUrl, cover.image_path, 'cover.png');
    const outputUrl = safeUrl(edition.url || String(contentUrl).replace(/content\.json(?:\?.*)?$/, 'output.html'));
    const news = sectionItems(content, 'news').slice(0, 5);
    const issue = [content.date || edition.date || index.latest_edition_id, content.vol ? 'Vol.' + content.vol : ''].filter(Boolean).join(' · ');

    container.innerHTML =
      '<article class="codex-briefing-home">' +
        '<div class="codex-briefing-kicker rv-fade">' +
          '<span>中国创作者视角 · 全球 AI 前沿 · 每日晨报</span>' +
          '<span>' + escapeHtml(issue) + '</span>' +
        '</div>' +
        '<section class="codex-cover-panel rv-scale">' +
          '<img src="' + escapeHtml(coverSrc) + '" alt="' + escapeHtml(cover.title || 'Janet 快车箱封面') + '" loading="eager" decoding="async">' +
          '<div class="codex-cover-overlay">' +
            '<span>Janet Express Box</span>' +
            '<h3>' + escapeHtml(cover.title || edition.title || '今日晨报') + '</h3>' +
            (cover.subtitle ? '<p>' + escapeHtml(cover.subtitle) + '</p>' : '') +
          '</div>' +
        '</section>' +
        renderTrend(content) +
        renderNewsCarousel(contentUrl, news) +
        '<div class="news-actions codex-news-actions rv-fade">' +
          '<a class="btn btn-green" href="' + escapeHtml(outputUrl) + '" target="_blank" rel="noopener noreferrer">浏览当天完整晨报</a>' +
          '<a class="btn btn-outline" href="news.html">进入新闻归档</a>' +
        '</div>' +
      '</article>';

    if (countEl) countEl.textContent = countItems(content) + ' 条信号';
    initNewsCarousel(container);
    document.dispatchEvent(new CustomEvent('janet:content-rendered'));
  }

  async function init() {
    const container = document.getElementById('news-editorial');
    const countEl = document.getElementById('news-count');
    if (!container) return;
    renderSkeleton(container);

    try {
      const index = await loadJson('data/news-index.json');
      const latest = (index.editions || []).find((edition) => edition.edition_id === index.latest_edition_id) || (index.editions || [])[0];
      if (!latest || !latest.content_url) throw new Error('Latest edition missing content_url');
      const content = await loadJson(latest.content_url);
      renderHomepage(index, content, latest.content_url, latest);
    } catch (error) {
      container.innerHTML = '<p class="news-empty">快车箱数据暂时不可用，稍后刷新。</p>';
      if (countEl) countEl.textContent = '0 条信号';
      console.error('[news-home] failed:', error);
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
