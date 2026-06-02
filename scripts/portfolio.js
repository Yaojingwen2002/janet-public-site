// portfolio.js — 作品集数据加载与渲染
// 目标：把作品集从"视频列表"升级为"项目案例库"
// 结构：卡片主体进入项目详情页，播放按钮单独跳转视频外链

(function() {
  'use strict';

  // ── 工具函数 ────────────────────────────────────────────────

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function titleToSlug(title) {
    return String(title || '')
      .toLowerCase()
      .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .substring(0, 32);
  }

  function getField(item, field, fallback) {
    if (item && item[field] !== undefined && item[field] !== null && item[field] !== '') {
      return item[field];
    }
    return fallback !== undefined ? fallback : '';
  }

  function resolveId(item, index) {
    if (item.id && typeof item.id === 'string' && item.id.trim() !== '') {
      return item.id.trim();
    }

    if (item.id && typeof item.id === 'number') {
      return 'item-' + item.id;
    }

    if (item.title) {
      const slug = titleToSlug(item.title);
      if (slug) return slug;
    }

    return 'item-' + index;
  }

  function resolveDetailUrl(item, id) {
    if (item.detailUrl && typeof item.detailUrl === 'string' && item.detailUrl.trim() !== '') {
      return item.detailUrl;
    }

    return 'project-detail.html?id=' + encodeURIComponent(id);
  }

  function resolveVideoUrl(item) {
    if (item.videoUrl && typeof item.videoUrl === 'string' && item.videoUrl.trim() !== '') {
      return item.videoUrl;
    }

    // 兼容旧字段 url
    if (item.url && typeof item.url === 'string' && item.url.trim() !== '' && item.url !== '#') {
      return item.url;
    }

    return '#';
  }

  function parseTags(tags) {
    if (!tags) return [];

    if (Array.isArray(tags)) {
      return tags.filter(Boolean);
    }

    if (typeof tags === 'string') {
      return tags
        .split(/[,，/\/]+/)
        .map(t => t.trim())
        .filter(Boolean);
    }

    return [];
  }

  function getThumbSrc(item) {
    const thumbnail = getField(item, 'thumbnail', '');
    const videoThumb = getField(item, 'videoThumb', '');

    return videoThumb || thumbnail || '';
  }

  function getCoverSrc(item) {
    const thumbnail = getField(item, 'thumbnail', '');
    const videoThumb = getField(item, 'videoThumb', '');

    return thumbnail || videoThumb || getField(item, 'cover', '');
  }

  function renderMediaFrame(src, alt, className) {
    const frameClass = className ? 'media-frame ' + className : 'media-frame';
    if (!src) {
      return '<div class="' + frameClass + ' media-frame--empty" data-media-fallback="missing-image"><span>暂无图片</span></div>';
    }
    return `
      <figure class="${frameClass}">
        <img src="${escapeHtml(src)}"
             alt="${escapeHtml(alt)}"
             width="1200"
             height="800"
             loading="lazy"
             onerror="this.closest('.media-frame').classList.add('media-frame--empty'); this.closest('.media-frame').innerHTML='<span>暂无图片</span>';">
      </figure>
    `;
  }

  function renderTagList(tags, className) {
    const arr = parseTags(tags);
    if (!arr.length) return '';

    return `
      <div class="${className}">
        ${arr.map(tag => `<span class="tag tag-outline">${escapeHtml(tag)}</span>`).join('')}
      </div>
    `;
  }

  function getSeriesInfo(value) {
    const text = String(value || '').toLowerCase();
    if (/shuttle|穿梭|宇宙/.test(text)) {
      return { label: '穿梭宇宙', className: 'work-series-band--shuttle' };
    }
    if (/misaligned|错位|名场面/.test(text)) {
      return { label: '错位名场面', className: 'work-series-band--misaligned' };
    }
    if (/igpt|gpt-image|prompt|handbook|提示词|手册/.test(text)) {
      return { label: '图像生成手册', className: 'work-series-band--default' };
    }
    return { label: 'Janet Works', className: 'work-series-band--default' };
  }

  function renderSeriesBand(value) {
    const series = getSeriesInfo(value);
    return '<div class="work-series-band ' + series.className + '"><span>' + escapeHtml(series.label) + '</span></div>';
  }

  function renderVideoButton(videoUrl, buttonClass, label) {
    const safeUrl = escapeHtml(videoUrl || '#');

    if (!videoUrl || videoUrl === '#') {
      return `<span class="${buttonClass} is-disabled" aria-disabled="true">${escapeHtml(label)}</span>`;
    }

    return `
      <a href="${safeUrl}" class="${buttonClass}" target="_blank" rel="noopener noreferrer">
        ${escapeHtml(label)}
      </a>
    `;
  }

  // ── 数据加载 ────────────────────────────────────────────────

  function loadPortfolioData() {
    return fetch('data/portfolio.json')
      .then(response => {
        if (!response.ok) {
          throw new Error('HTTP ' + response.status);
        }
        return response.json();
      })
      .then(data => {
        if (!Array.isArray(data)) {
          throw new Error('portfolio.json 必须是数组');
        }
        return data;
      });
  }

  // ── 首页 Recent Videos 渲染 ────────────────────────────────

  function renderVideos() {
    const videoContainer = document.getElementById('video-container');
    if (!videoContainer) return;

    loadPortfolioData()
      .then(data => {
        const recent = data.slice(0, 10);

        if (!recent.length) {
          videoContainer.innerHTML = '<p style="color:var(--text-3);padding:40px 0;">暂无作品数据</p>';
          return;
        }

        videoContainer.innerHTML = recent.map((item, index) => {
          const id = resolveId(item, index);
          const title = getField(item, 'title', '未命名项目');
          const subtitle = getField(item, 'subtitle', '');
          const type = getField(item, 'type', 'AI 创作');
          const date = getField(item, 'date', '—');
          const videoUrl = resolveVideoUrl(item);
          const detailUrl = resolveDetailUrl(item, id);
          const thumbSrc = getThumbSrc(item);

          return `
            <article class="card video-card">
              <a href="${escapeHtml(detailUrl)}" class="video-card-main" aria-label="查看完整项目：${escapeHtml(title)}">
                <div class="thumbnail video-card-thumb">
                  ${renderMediaFrame(thumbSrc, title, 'video-card-media')}
                  <div class="video-card-overlay">
                    <div class="play-btn-small" aria-hidden="true">
                      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                        <path d="M6 4L16 10L6 16V4Z" fill="white"/>
                      </svg>
                    </div>
                  </div>
                </div>

                <div class="video-card-meta">
                  <h4 class="truncate">${escapeHtml(title)}</h4>
                  ${subtitle ? `<span class="video-subtitle">${escapeHtml(subtitle)}</span>` : ''}
                  <span class="date">${escapeHtml(date)} · ${escapeHtml(type)}</span>
                </div>
              </a>

              <div class="video-card-actions">
                <a href="${escapeHtml(detailUrl)}" class="btn btn-outline btn-sm">查看完整项目</a>
                ${renderVideoButton(videoUrl, 'btn btn-green btn-sm', '播放视频')}
              </div>
            </article>
          `;
        }).join('');
      })
      .catch(error => {
        console.warn('作品数据加载失败', error);
        videoContainer.innerHTML = `
          <p style="text-align:center;color:var(--text-3);padding:40px;">
            作品数据加载失败
          </p>
        `;
      });
  }

  // ── 首页 Selected Work 渲染 ────────────────────────────────

  function renderPortfolio() {
    const portfolioContainer = document.getElementById('portfolio-container');
    if (!portfolioContainer) return;

    loadPortfolioData()
      .then(data => {
        const featured = data.slice(0, 4);

        if (!featured.length) {
          portfolioContainer.innerHTML = '<p style="color:var(--text-3);padding:40px 0;">暂无精选作品</p>';
          return;
        }

        portfolioContainer.innerHTML = featured.map((item, index) => {
          const id = resolveId(item, index);
          const title = getField(item, 'title', '未命名项目');
          const subtitle = getField(item, 'subtitle', '');
          const type = getField(item, 'type', 'AI 创作');
          const date = getField(item, 'date', '—');
          const summary = getField(item, 'summary', '');
          const videoUrl = resolveVideoUrl(item);
          const detailUrl = resolveDetailUrl(item, id);
          const thumbSrc = getCoverSrc(item);
          const tags = parseTags(item.tags);
          const seriesHint = [title, subtitle, type, tags.join(' ')].join(' ');

          return `
            <article class="card portfolio-item">
              ${renderSeriesBand(seriesHint)}
              <a href="${escapeHtml(detailUrl)}" class="portfolio-item-main" aria-label="查看完整项目：${escapeHtml(title)}">
                <div class="thumbnail portfolio-item-thumb">
                  ${renderMediaFrame(thumbSrc, title, 'portfolio-item-media')}
                  <div class="portfolio-item-overlay">
                    <span class="portfolio-item-type">${escapeHtml(type)}</span>
                  </div>
                </div>

                <div class="portfolio-item-meta">
                  <h4 class="truncate">${escapeHtml(title)}</h4>
                  ${subtitle ? `<span class="portfolio-item-subtitle">${escapeHtml(subtitle)}</span>` : ''}
                  <span class="date">${escapeHtml(date)} · ${escapeHtml(type)}</span>
                </div>
              </a>

              ${summary ? `
                <p class="portfolio-item-summary">
                  ${escapeHtml(summary.substring(0, 90))}${summary.length > 90 ? '...' : ''}
                </p>
              ` : ''}

              ${tags.length ? renderTagList(tags, 'portfolio-item-tags') : ''}

              <div class="portfolio-item-actions">
                <a href="${escapeHtml(detailUrl)}" class="btn btn-outline btn-sm">查看完整项目</a>
                ${renderVideoButton(videoUrl, 'btn btn-green btn-sm', '播放视频')}
              </div>
            </article>
          `;
        }).join('');
      })
      .catch(error => {
        console.warn('作品数据加载失败', error);
        portfolioContainer.innerHTML = `
          <p style="text-align:center;color:var(--text-3);padding:40px;">
            作品数据加载失败
          </p>
        `;
      });
  }

  // ── portfolio.html 全量作品渲染 ───────────────────────────

  function renderPortfolioFull() {
    const container = document.getElementById('portfolio-full');
    if (!container) return;

    loadPortfolioData()
      .then(data => {
        if (!data.length) {
          container.innerHTML = '<p style="color:var(--text-3);padding:40px 0;text-align:center;">暂无项目案例</p>';
          return;
        }

        container.innerHTML = data.map((item, index) => {
          const id = resolveId(item, index);
          const title = getField(item, 'title', '未命名项目');
          const subtitle = getField(item, 'subtitle', '');
          const type = getField(item, 'type', 'AI 创作');
          const category = getField(item, 'category', type);
          const date = getField(item, 'date', '—');
          const summary = getField(item, 'summary', '');
          const videoUrl = resolveVideoUrl(item);
          const detailUrl = resolveDetailUrl(item, id);
          const thumbSrc = getCoverSrc(item);
          const tags = parseTags(item.tags);
          const seriesHint = [title, subtitle, type, category, tags.join(' ')].join(' ');

          return `
            <article class="portfolio-full-card">
              ${renderSeriesBand(seriesHint)}
              <a href="${escapeHtml(detailUrl)}" class="portfolio-full-card-main" aria-label="查看完整项目：${escapeHtml(title)}">
                <div class="portfolio-full-thumb">
                  ${renderMediaFrame(thumbSrc, title, 'portfolio-full-media')}
                  <div class="portfolio-full-overlay">
                    <span class="portfolio-full-date">${escapeHtml(date)}</span>
                    <span class="portfolio-full-type">${escapeHtml(category)}</span>
                  </div>
                </div>

                <div class="portfolio-full-info">
                  <h4>${escapeHtml(title)}</h4>
                  ${subtitle ? `<span class="portfolio-full-subtitle">${escapeHtml(subtitle)}</span>` : ''}
                  ${summary ? `
                    <p class="portfolio-full-summary">
                      ${escapeHtml(summary.substring(0, 100))}${summary.length > 100 ? '...' : ''}
                    </p>
                  ` : ''}
                  ${tags.length ? renderTagList(tags, 'portfolio-full-tags') : ''}
                </div>
              </a>

              <div class="portfolio-full-actions">
                <a href="${escapeHtml(detailUrl)}" class="btn btn-outline btn-sm">查看完整项目</a>
                ${renderVideoButton(videoUrl, 'btn btn-green btn-sm', '播放视频')}
              </div>
            </article>
          `;
        }).join('');
      })
      .catch(error => {
        container.innerHTML = `
          <div style="text-align:center; padding:60px 20px;">
            <div style="font-size:48px; margin-bottom:16px;">⚠️</div>
            <p style="color:var(--text-2); font-size:var(--body); margin-bottom:8px;">作品数据加载失败</p>
            <p style="color:var(--text-3); font-size:var(--body-xs); font-family:var(--font-mono); margin-bottom:20px;">
              ${escapeHtml(error.message || '未知错误')}
            </p>
            <button onclick="location.reload()"
              style="padding:12px 28px; background:var(--green); color:#000; border:none; border-radius:8px; font-size:var(--body-sm); font-weight:600; cursor:pointer;">
              重试 ↻
            </button>
          </div>
        `;
      });
  }


// JANET_WORKS_LIBRARY_ENTRY_START

  async function loadWorksManifest() {
    const response = await fetch('data/works/works-manifest.json', { cache: 'no-cache' });
    if (!response.ok) throw new Error('Cannot load works manifest');
    return response.json();
  }

  function renderHomepageWorksLibrary(manifest) {
    const grid = document.getElementById('works-project-grid');
    if (!grid) return;

    const projects = manifest.projects || [];

    if (!projects.length) {
      grid.innerHTML = '<p class="works-library-empty">作品库数据暂时为空。</p>';
      return;
    }

    grid.innerHTML = projects.map((project) => {
      const tags = (project.tags || []).slice(0, 5).map(tag => '<span>' + escapeHtml(tag) + '</span>').join('');
      const method = (project.method || []).slice(0, 5).map(item => '<span>' + escapeHtml(item) + '</span>').join('');

      return `
        <article class="works-project-card works-project-card--${escapeHtml(project.id)}">
          ${renderSeriesBand(project.id || project.title)}
          ${renderMediaFrame(project.thumbnail || project.cover || '', project.title || '作品项目封面', 'works-project-media')}
          <div class="works-project-card__meta">
            <span>${escapeHtml(project.type || '')}</span>
            <span>${escapeHtml(project.work_count || 0)} works</span>
          </div>
          <h3>${escapeHtml(project.title)}</h3>
          <p>${escapeHtml(project.description || '')}</p>
          <div class="works-project-card__tags">${tags}</div>
          <div class="works-project-card__method">${method}</div>
          <a href="${escapeHtml(project.url || ('portfolio.html?project=' + encodeURIComponent(project.id)))}" class="works-project-card__link">
            ${project.url ? '打开项目页面 →' : '查看项目作品 →'}
          </a>
        </article>
      `;
    }).join('');
  }

  async function initHomepageWorksLibrary() {
    const grid = document.getElementById('works-project-grid');
    if (!grid) return;

    try {
      const manifest = await loadWorksManifest();
      renderHomepageWorksLibrary(manifest);
    } catch (error) {
      console.error('[works-library] failed:', error);
      grid.innerHTML = '<p class="works-library-empty">作品库数据暂时无法读取。</p>';
    }
  }

// JANET_WORKS_LIBRARY_ENTRY_END


// JANET_WORKS_LIBRARY_LISTING_START

  function getInitialProjectFilter() {
    const params = new URLSearchParams(window.location.search);
    const project = params.get('project');
    if (project === 'shuttle-universe' || project === 'misaligned-scenes' || project === 'igpt-image2-handbook') return project;
    return 'all';
  }

  function renderWorksProjectOverview(manifest, activeProject) {
    const container = document.getElementById('works-project-overview');
    if (!container) return;

    const projects = manifest.projects || [];
    const filtered = activeProject === 'all'
      ? projects
      : projects.filter(project => project.id === activeProject);

    if (!filtered.length) {
      container.innerHTML = '<p class="works-library-empty">当前分类下暂无项目。</p>';
      return;
    }

    container.innerHTML = filtered.map((project) => {
      const tags = (project.tags || []).slice(0, 5).map(tag => '<span>' + escapeHtml(tag) + '</span>').join('');
      const method = (project.method || []).slice(0, 5).map(item => '<span>' + escapeHtml(item) + '</span>').join('');
      const cardFilter = activeProject === 'all' ? project.id : 'all';
      const cardFilterLabel = activeProject === 'all' ? '只看这个类别 →' : '返回全部类别 →';
      const action = project.url
        ? '<a class="works-overview-link" href="' + escapeHtml(project.url) + '">打开项目页面 →</a>'
        : '<button class="works-overview-link works-overview-filter" type="button" data-card-filter="' + escapeHtml(cardFilter) + '">' + escapeHtml(cardFilterLabel) + '</button>';

      return `
        <article class="works-overview-card" data-project-id="${escapeHtml(project.id)}">
          ${renderSeriesBand(project.id || project.title)}
          ${renderMediaFrame(project.thumbnail || project.cover || '', project.title || '作品项目封面', 'works-overview-media')}
          <div class="works-overview-meta">
            <span>${escapeHtml(project.type || '')}</span>
          </div>
          <h3>${escapeHtml(project.title)}</h3>
          <p>${escapeHtml(project.description || '')}</p>
          <div class="works-overview-stats" aria-label="${escapeHtml(project.title)} 统计">
            <span><strong>${escapeHtml(project.work_count || 0)}</strong>works</span>
            <span><strong>${escapeHtml(project.document_count || 0)}</strong>docs</span>
            <span><strong>${escapeHtml((project.method || []).length || 0)}</strong>steps</span>
          </div>
          <div class="works-overview-tags">${tags}</div>
          <div class="works-project-card__method">${method}</div>
          ${action}
        </article>
      `;
    }).join('');
  }

  function setActiveFilter(project) {
    document.querySelectorAll('.works-filter-btn').forEach((button) => {
      const isActive = button.dataset.projectFilter === project;
      button.classList.toggle('active', isActive);
      button.setAttribute('aria-pressed', String(isActive));
    });
  }

  async function initWorksListingPage() {
    const overview = document.getElementById('works-project-overview');
    if (!overview) return;

    try {
      const manifest = await loadWorksManifest();
      let activeProject = getInitialProjectFilter();

      function updateProjectView(project) {
        activeProject = project;
        setActiveFilter(activeProject);
        renderWorksProjectOverview(manifest, activeProject);
        overview.querySelectorAll('[data-card-filter]').forEach((button) => {
          button.addEventListener('click', () => {
            updateProjectView(button.dataset.cardFilter || 'all');
          });
        });
        const nextUrl = activeProject === 'all'
          ? 'portfolio.html'
          : 'portfolio.html?project=' + encodeURIComponent(activeProject);
        history.replaceState(null, '', nextUrl);
      }

      updateProjectView(activeProject);

      document.querySelectorAll('.works-filter-btn').forEach((button) => {
        button.addEventListener('click', () => {
          updateProjectView(button.dataset.projectFilter || 'all');
        });
      });
    } catch (error) {
      console.error('[works-library] listing failed:', error);
      overview.innerHTML = '<p class="works-library-empty">作品库数据暂时无法读取。</p>';
    }
  }

// JANET_WORKS_LIBRARY_LISTING_END

  // ── 初始化 ────────────────────────────────────────────────

  document.addEventListener('DOMContentLoaded', () => {
    renderVideos();
    renderPortfolio();
    renderPortfolioFull();
    initHomepageWorksLibrary();
    initWorksListingPage();
  });

})();
