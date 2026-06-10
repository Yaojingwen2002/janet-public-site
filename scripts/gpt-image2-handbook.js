// iGPT-Image2 handbook renderer
(function() {
  'use strict';

  const DATA_URL = 'data/gpt-image2-handbook/handbook-cases.json';
  const CATEGORY_ORDER = [
    '全部',
    'UI & 界面',
    '海报与排版',
    '产品与电商',
    '摄影与写实',
    '插画与艺术',
    '角色与人物',
    '场景与叙事',
    '图表与信息可视化',
    '文档与出版物'
  ];

  let cases = [];
  let activeFilter = 'all';
  let currentItems = [];
  let activePreviewIndex = -1;

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function slug(value) {
    return String(value || '')
      .toLowerCase()
      .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  function getCategories(items) {
    const categories = Array.from(new Set(items.map(item => item.category).filter(Boolean)));
    return CATEGORY_ORDER.filter(item => item === '全部' || categories.includes(item))
      .concat(categories.filter(item => !CATEGORY_ORDER.includes(item)));
  }

  function renderFilters() {
    const container = document.getElementById('handbook-filter-list');
    if (!container) return;

    const filters = getCategories(cases);
    container.innerHTML = filters.map((category) => {
      const value = category === '全部' ? 'all' : category;
      return `
        <button class="handbook-filter ${value === activeFilter ? 'is-active' : ''}"
          type="button"
          data-filter="${escapeHtml(value)}">
          ${escapeHtml(category)}
        </button>
      `;
    }).join('');

    container.querySelectorAll('[data-filter]').forEach((button) => {
      button.addEventListener('click', () => {
        activeFilter = button.dataset.filter || 'all';
        renderFilters();
        renderCards();
      });
    });
  }

  function renderField(label, value) {
    if (!value) return '';
    return `
      <div class="handbook-field">
        <dt>${escapeHtml(label)}</dt>
        <dd>${escapeHtml(value)}</dd>
      </div>
    `;
  }

  function renderScenarioTags(item) {
    const tags = Array.isArray(item.applicable_scenarios) ? item.applicable_scenarios : [];
    if (!tags.length) return '';
    return `<div class="handbook-scenarios">${tags.map(tag => `<span>${escapeHtml(tag)}</span>`).join('')}</div>`;
  }

  function renderCard(item) {
    const promptId = `${item.id}-prompt`;
    const fields = [
      ['主题', item.theme],
      ['主体', item.subject],
      ['构图', item.composition],
      ['镜头', item.camera],
      ['材质', item.material],
      ['文字约束', item.text_constraints],
      ['负面约束', item.negative_constraints],
      ['输出规格', item.output_spec]
    ].map(([label, value]) => renderField(label, value)).join('');

    return `
      <article class="handbook-card" data-category="${escapeHtml(item.category)}">
        <figure class="handbook-card__visual">
          <button class="handbook-card__preview" type="button" data-preview-case="${escapeHtml(item.id)}" aria-label="预览 ${escapeHtml(item.title)}">
            <img src="${escapeHtml(item.image)}"
              alt="${escapeHtml(item.title)} 案例图"
              width="1200"
              height="800"
              loading="lazy">
          </button>
          <figcaption>${escapeHtml(item.title)} · ${escapeHtml(item.category)} 案例图</figcaption>
        </figure>

        <div class="handbook-card__body">
          <div class="handbook-card__topline">
            <span>案例 ${String(item.case_number).padStart(2, '0')}</span>
            <span>${escapeHtml(item.category)}</span>
          </div>
          <h3>${escapeHtml(item.title)}</h3>
          <p class="handbook-card__summary">${escapeHtml(item.summary)}</p>

          <div class="handbook-card__meta">
            <span>作者：${escapeHtml(item.source_author)}</span>
            <span>原始来源：${escapeHtml(item.original_creator || '未提供')}</span>
            <span>License：${escapeHtml(item.license)}</span>
          </div>

          ${renderScenarioTags(item)}

          <dl class="handbook-fields">
            ${fields}
          </dl>

          <details class="handbook-prompt" id="${escapeHtml(promptId)}">
            <summary>查看完整提示词</summary>
            <pre>${escapeHtml(item.prompt_full)}</pre>
          </details>

          <p class="handbook-janet-note">${escapeHtml(item.janet_note || '')}</p>

          <div class="handbook-card__actions">
            <button class="btn btn-green btn-sm" type="button" data-copy-prompt="${escapeHtml(item.id)}">复制提示词</button>
            <a class="btn btn-outline btn-sm" href="${escapeHtml(item.source_url)}" target="_blank" rel="noopener noreferrer">
              查看原始来源
            </a>
          </div>
        </div>
      </article>
    `;
  }

  function getLightboxElements() {
    return {
      root: document.getElementById('handbook-lightbox'),
      image: document.getElementById('handbook-lightbox-image'),
      title: document.getElementById('handbook-lightbox-title'),
      count: document.getElementById('handbook-lightbox-count'),
      caption: document.getElementById('handbook-lightbox-caption')
    };
  }

  function renderLightbox() {
    const { root, image, title, count, caption } = getLightboxElements();
    const item = currentItems[activePreviewIndex];
    if (!root || !image || !title || !count || !caption || !item) return;

    image.src = item.image;
    image.alt = `${item.title} 案例图`;
    title.textContent = item.title || '';
    count.textContent = `${activePreviewIndex + 1} / ${currentItems.length}`;
    caption.textContent = `${item.category || '未分类'} · ${item.summary || ''}`;
  }

  function openLightbox(itemId) {
    const { root } = getLightboxElements();
    if (!root) return;

    const index = currentItems.findIndex(item => item.id === itemId);
    if (index < 0) return;

    activePreviewIndex = index;
    root.hidden = false;
    document.body.classList.add('handbook-lightbox-open');
    renderLightbox();

    const closeButton = root.querySelector('[data-lightbox-close]');
    if (closeButton) closeButton.focus({ preventScroll: true });
  }

  function closeLightbox() {
    const { root, image } = getLightboxElements();
    if (!root) return;

    root.hidden = true;
    document.body.classList.remove('handbook-lightbox-open');
    activePreviewIndex = -1;
    if (image) {
      image.removeAttribute('src');
      image.alt = '';
    }
  }

  function stepLightbox(direction) {
    if (activePreviewIndex < 0 || !currentItems.length) return;
    activePreviewIndex = (activePreviewIndex + direction + currentItems.length) % currentItems.length;
    renderLightbox();
  }

  function renderCards() {
    const grid = document.getElementById('handbook-grid');
    const count = document.getElementById('handbook-count');
    if (!grid) return;

    const filtered = activeFilter === 'all'
      ? cases
      : cases.filter(item => item.category === activeFilter);
    currentItems = filtered;

    if (count) {
      count.textContent = `${filtered.length} cases`;
    }

    if (!filtered.length) {
      grid.innerHTML = '<p class="handbook-empty">当前筛选下暂无案例。</p>';
      return;
    }

    grid.innerHTML = filtered.map(renderCard).join('');
    document.dispatchEvent(new CustomEvent('janet:content-rendered'));

    grid.querySelectorAll('[data-preview-case]').forEach((button) => {
      button.addEventListener('click', () => {
        openLightbox(button.dataset.previewCase);
      });
    });

    grid.querySelectorAll('[data-copy-prompt]').forEach((button) => {
      button.addEventListener('click', async () => {
        const item = cases.find(entry => entry.id === button.dataset.copyPrompt);
        if (!item) return;

        try {
          await navigator.clipboard.writeText(item.prompt_full || '');
          button.textContent = '已复制';
          setTimeout(() => {
            button.textContent = '复制提示词';
          }, 1400);
        } catch (error) {
          console.warn('[handbook] copy failed:', error);
          button.textContent = '复制失败';
          setTimeout(() => {
            button.textContent = '复制提示词';
          }, 1400);
        }
      });
    });
  }

  function bindLightboxControls() {
    const { root } = getLightboxElements();
    if (!root) return;

    root.querySelectorAll('[data-lightbox-close]').forEach((button) => {
      button.addEventListener('click', closeLightbox);
    });

    const prev = root.querySelector('[data-lightbox-prev]');
    const next = root.querySelector('[data-lightbox-next]');
    if (prev) prev.addEventListener('click', () => stepLightbox(-1));
    if (next) next.addEventListener('click', () => stepLightbox(1));

    document.addEventListener('keydown', (event) => {
      if (root.hidden) return;
      if (event.key === 'Escape') closeLightbox();
      if (event.key === 'ArrowLeft') stepLightbox(-1);
      if (event.key === 'ArrowRight') stepLightbox(1);
    });
  }

  async function init() {
    const grid = document.getElementById('handbook-grid');
    try {
      const response = await fetch(DATA_URL, { cache: 'no-cache' });
      if (!response.ok) throw new Error('HTTP ' + response.status);
      const data = await response.json();
      if (!Array.isArray(data)) throw new Error('handbook-cases.json must be an array');
      cases = data;
      renderFilters();
      renderCards();
    } catch (error) {
      console.error('[handbook] failed:', error);
      if (grid) {
        grid.innerHTML = '<p class="handbook-empty">提示词手册数据暂时无法读取。</p>';
      }
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    bindLightboxControls();
    init();
  });
})();
