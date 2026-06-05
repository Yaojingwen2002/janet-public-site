// project-showcase.js — 项目级作品页渲染

(function() {
  'use strict';

  const root = document.getElementById('project-showcase-root');
  const shell = document.querySelector('.project-showcase-shell');
  const projectId = shell && shell.dataset ? shell.dataset.projectId : '';

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  async function loadJson(path) {
    const response = await fetch(path, { cache: 'no-cache' });
    if (!response.ok) throw new Error('Cannot load ' + path);
    return response.json();
  }

  function imageAttrs(src, alt) {
    return 'src="' + escapeHtml(src || '') + '" alt="' + escapeHtml(alt || '') + '" loading="lazy"';
  }

  function getYouTubeUrl(work) {
    return work.youtube_url || work.video_url || work.videoUrl || '';
  }

  function getYouTubeId(url) {
    const raw = String(url || '').trim();
    if (!raw) return '';
    try {
      const parsed = new URL(raw);
      if (parsed.hostname.includes('youtu.be')) return parsed.pathname.split('/').filter(Boolean)[0] || '';
      if (parsed.pathname.includes('/shorts/')) return parsed.pathname.split('/shorts/')[1].split('/')[0] || '';
      if (parsed.pathname.includes('/embed/')) return parsed.pathname.split('/embed/')[1].split('/')[0] || '';
      return parsed.searchParams.get('v') || '';
    } catch (error) {
      const match = raw.match(/(?:shorts\/|youtu\.be\/|embed\/|v=)([A-Za-z0-9_-]{6,})/);
      return match ? match[1] : '';
    }
  }

  function renderTags(items, className) {
    const list = Array.isArray(items) ? items.filter(Boolean) : [];
    if (!list.length) return '';
    return '<div class="' + className + '">' + list.map(item => '<span>' + escapeHtml(item) + '</span>').join('') + '</div>';
  }

  function statItems(project) {
    return [
      [project.work_count || 0, 'works'],
      [project.document_count || 0, 'docs'],
      [(project.method || []).length || 0, 'steps']
    ];
  }

  function normalizeGallery(work) {
    const seen = new Set();
    const entries = [];
    if (work.cover) entries.push({ src: work.cover, title: '封面' });
    if (work.thumbnail && work.thumbnail !== work.cover) entries.push({ src: work.thumbnail, title: '缩略图' });
    (Array.isArray(work.gallery) ? work.gallery : []).forEach(item => {
      if (typeof item === 'string') entries.push({ src: item, title: '' });
      else if (item && item.src) entries.push(item);
    });
    (Array.isArray(work.images) ? work.images : []).forEach(src => entries.push({ src, title: '' }));
    return entries.filter(item => {
      const src = String(item.src || '').trim();
      if (!src || seen.has(src)) return false;
      seen.add(src);
      return true;
    });
  }

  function renderHero(project) {
    const showcase = project.showcase || {};
    const title = showcase.hero_title || project.title || 'Janet Project';
    const subtitle = showcase.hero_subtitle || project.description || '';
    const stats = statItems(project).map(([value, label]) =>
      '<span><strong>' + escapeHtml(value) + '</strong>' + escapeHtml(label) + '</span>'
    ).join('');

    return `
      <section class="project-showcase-hero">
        <img class="project-showcase-hero__image" ${imageAttrs(project.cover || project.thumbnail, title)}>
        <div class="project-showcase-hero__shade"></div>
        <div class="container project-showcase-hero__inner">
          <span class="project-showcase-kicker">${escapeHtml(showcase.eyebrow || project.type || 'Project Archive')}</span>
          <h1>${escapeHtml(title)}</h1>
          <p>${escapeHtml(subtitle)}</p>
          <div class="project-showcase-hero__meta">
            <span>${escapeHtml(project.type || '')}</span>
            <span>${escapeHtml(project.source_path_label || '')}</span>
          </div>
          <div class="project-showcase-stats">${stats}</div>
        </div>
      </section>
    `;
  }

  function renderIntro(project) {
    const showcase = project.showcase || {};
    const sections = Array.isArray(showcase.sections) ? showcase.sections : [];
    const highlights = Array.isArray(showcase.highlights) ? showcase.highlights : [];

    return `
      <section class="project-showcase-intro">
        <div class="container project-showcase-intro__grid">
          <div class="project-showcase-angle">
            <span class="section-kicker">Project Logic</span>
            <h2>${escapeHtml(project.title || '项目逻辑')}</h2>
            <p>${escapeHtml(showcase.angle || project.description || '')}</p>
            ${renderTags(project.tags, 'project-showcase-tags')}
          </div>
          <div class="project-showcase-method">
            <span class="section-kicker">Method</span>
            ${renderTags(project.method, 'project-showcase-method__list')}
          </div>
        </div>
        <div class="container">
          <div class="project-showcase-highlights">
            ${highlights.map((item, index) => `
              <article>
                <span>${String(index + 1).padStart(2, '0')}</span>
                <p>${escapeHtml(item)}</p>
              </article>
            `).join('')}
          </div>
          <div class="project-showcase-sections">
            ${sections.map(section => `
              <article>
                <h3>${escapeHtml(section.title || '')}</h3>
                <p>${escapeHtml(section.body || '')}</p>
              </article>
            `).join('')}
          </div>
        </div>
      </section>
    `;
  }

  function renderGalleryPreview(work) {
    const gallery = normalizeGallery(work).slice(0, 6);
    if (!gallery.length) return '';
    return `
      <div class="project-work-gallery" aria-label="${escapeHtml(work.title || '作品')} 图片预览">
        ${gallery.map(item => `
          <button class="project-gallery-thumb" type="button" data-preview-src="${escapeHtml(item.src)}" data-preview-title="${escapeHtml(item.title || item.caption || work.title || '')}">
            <img ${imageAttrs(item.src, item.title || item.caption || work.title || '作品图')}>
          </button>
        `).join('')}
      </div>
    `;
  }

  function renderWorkCover(work) {
    const src = work.cover || work.thumbnail || '';
    const title = work.title || '作品封面';
    const youtubeUrl = getYouTubeUrl(work);
    const youtubeId = getYouTubeId(youtubeUrl);
    if (youtubeUrl && youtubeId) {
      return `
        <div class="project-work-cover youtube-hover-cover" data-youtube-id="${escapeHtml(youtubeId)}" data-youtube-url="${escapeHtml(youtubeUrl)}">
          <img ${imageAttrs(src, title)}>
          <div class="youtube-hover-cover__player" aria-hidden="true"></div>
          <a class="youtube-hover-cover__hit" href="${escapeHtml(youtubeUrl)}" target="_blank" rel="noopener noreferrer" aria-label="在 YouTube 打开${escapeHtml(title)}"></a>
          <span class="youtube-hover-cover__label" aria-hidden="true">YouTube</span>
        </div>
      `;
    }
    return `
      <button class="project-work-cover" type="button" data-preview-src="${escapeHtml(src)}" data-preview-title="${escapeHtml(work.title || '')}">
        <img ${imageAttrs(src, title)}>
      </button>
    `;
  }

  function renderWorks(project) {
    const works = Array.isArray(project.works) ? project.works : [];
    if (!works.length) {
      return '<section class="project-showcase-works"><div class="container"><p class="project-showcase-empty">暂无作品条目。</p></div></section>';
    }

    return `
      <section class="project-showcase-works">
        <div class="container">
          <div class="project-showcase-section-head">
            <span class="section-kicker">Works</span>
            <h2>作品与制作档案</h2>
            <p>下面只放公开站可承载的代表图和制作索引，完整原始工程仍保留在 Janet 本地项目目录。</p>
          </div>
          <div class="project-work-list">
            ${works.map(work => {
              const stats = work.stats || {};
              const detailUrl = 'project-detail.html?work=' + encodeURIComponent(work.id || '');
              return `
                <article class="project-work-card">
                  <div class="project-work-card__media">
                    ${renderWorkCover(work)}
                  </div>
                  <div class="project-work-card__body">
                    <div class="project-work-card__meta">
                      <span>${escapeHtml(work.status || '制作中')}</span>
                      <span>${escapeHtml(work.source_path_label || '')}</span>
                    </div>
                    <h3>${escapeHtml(work.title || '未命名作品')}</h3>
                    <p>${escapeHtml(work.subtitle || work.summary || '')}</p>
                    <div class="project-work-stats">
                      <span><strong>${escapeHtml(stats.image_count || 0)}</strong>images</span>
                      <span><strong>${escapeHtml(stats.video_count || 0)}</strong>videos</span>
                      <span><strong>${escapeHtml(stats.document_count || 0)}</strong>docs</span>
                    </div>
                    ${renderTags(work.tags, 'project-work-tags')}
                    ${renderGalleryPreview(work)}
                    <a class="btn btn-outline btn-sm project-work-link" href="${escapeHtml(detailUrl)}">查看制作档案 →</a>
                  </div>
                </article>
              `;
            }).join('')}
          </div>
        </div>
      </section>
    `;
  }

  function renderPreviewDialog() {
    return `
      <div class="project-preview" id="project-preview" role="dialog" aria-modal="true" aria-label="图片预览" hidden>
        <button class="project-preview__backdrop" type="button" data-preview-close aria-label="关闭预览"></button>
        <figure class="project-preview__panel">
          <button class="project-preview__close" type="button" data-preview-close aria-label="关闭预览">×</button>
          <img id="project-preview-image" alt="">
          <figcaption id="project-preview-caption"></figcaption>
        </figure>
      </div>
    `;
  }

  function bindPreview() {
    const dialog = document.getElementById('project-preview');
    const image = document.getElementById('project-preview-image');
    const caption = document.getElementById('project-preview-caption');
    if (!dialog || !image || !caption) return;

    document.querySelectorAll('[data-preview-src]').forEach(button => {
      button.addEventListener('click', () => {
        const src = button.dataset.previewSrc || '';
        if (!src) return;
        image.src = src;
        image.alt = button.dataset.previewTitle || '作品图片';
        caption.textContent = button.dataset.previewTitle || '';
        dialog.hidden = false;
        document.body.classList.add('project-preview-open');
      });
    });

    dialog.querySelectorAll('[data-preview-close]').forEach(button => {
      button.addEventListener('click', () => {
        dialog.hidden = true;
        image.removeAttribute('src');
        document.body.classList.remove('project-preview-open');
      });
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
  }

  function mountYouTubeCover(cover) {
    if (!cover || !cover.dataset.youtubeId) return;
    const player = cover.querySelector('.youtube-hover-cover__player');
    const image = cover.querySelector('img');
    if (!player || player.querySelector('iframe')) return;
    player.innerHTML = `
      <iframe
        src="${escapeHtml(buildYouTubeCoverSrc(cover))}"
        title="${escapeHtml(image?.alt || 'YouTube video preview')}"
        loading="lazy"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowfullscreen></iframe>
    `;
    cover.classList.add('is-youtube-previewing');
  }

  function bindYouTubeCovers() {
    document.querySelectorAll('.youtube-hover-cover').forEach(cover => {
      const hit = cover.querySelector('.youtube-hover-cover__hit');
      cover.addEventListener('mouseenter', () => mountYouTubeCover(cover));
      cover.addEventListener('mouseleave', () => destroyYouTubeCover(cover));
      if (hit) {
        hit.addEventListener('focus', () => mountYouTubeCover(cover));
        hit.addEventListener('blur', () => destroyYouTubeCover(cover));
      }
    });
  }

  function renderProject(project) {
    document.title = (project.title || '项目') + ' · Janet 作品库';
    root.innerHTML = renderHero(project) + renderIntro(project) + renderWorks(project) + renderPreviewDialog();
    bindPreview();
    bindYouTubeCovers();
  }

  async function init() {
    if (!root || !projectId) return;
    try {
      const project = await loadJson('data/works/projects/' + encodeURIComponent(projectId) + '.json');
      renderProject(project);
    } catch (error) {
      console.warn('[project-showcase] failed:', error);
      root.innerHTML = `
        <section class="project-showcase-loading">
          <div class="container">
            <span class="section-kicker">Project Archive</span>
            <h1>项目档案读取失败</h1>
            <p>请返回作品库重新进入。</p>
            <a href="portfolio.html" class="btn btn-outline">← 返回作品库</a>
          </div>
        </section>
      `;
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
