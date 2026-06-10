// project-detail.js — 作品制作流程详情页渲染

(function() {
  'use strict';

  function getQueryParam(name) {
    return new URLSearchParams(window.location.search).get(name);
  }

  async function loadJson(path) {
    const response = await fetch(path, { cache: 'no-cache' });
    if (!response.ok) throw new Error('Cannot load ' + path);
    return response.json();
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  async function loadWorksManifest() {
    return loadJson('data/works/works-manifest.json');
  }

  async function loadWorkById(workId) {
    const manifest = await loadWorksManifest();
    const ids = new Set(manifest.featured_works || []);
    for (const project of manifest.projects || []) {
      if (Array.isArray(project.works)) {
        project.works.forEach(work => ids.add(typeof work === 'string' ? work : work.id));
      }
    }
    ids.add(workId);
    if (!ids.has(workId)) return null;
    return loadJson('data/works/works/' + encodeURIComponent(workId) + '.json');
  }

  async function loadWorkDocumentContent(work) {
    if (!work || !work.document_content_json) return null;
    try {
      return await loadJson(work.document_content_json);
    } catch (error) {
      console.warn('[work-doc-content] failed:', error);
      return null;
    }
  }

  function getProjectLabel(projectId) {
    if (projectId === 'shuttle-universe') return '穿梭宇宙';
    if (projectId === 'misaligned-scenes') return '错位名场面';
    if (projectId === 'igpt-image2-handbook') return '图像生成手册';
    return projectId || '项目';
  }

  function getProjectTypeLabel(projectId) {
    if (projectId === 'shuttle-universe') return '世界观型 AI 短视频';
    if (projectId === 'misaligned-scenes') return '剧情型 AI 短片';
    if (projectId === 'igpt-image2-handbook') return '图像生成手册';
    return 'AI 创作项目';
  }

  function showError() {
    const error = document.getElementById('detail-error');
    const loading = document.getElementById('detail-loading');
    const root = document.getElementById('work-detail-root');
    if (error) error.style.display = 'block';
    if (loading) loading.style.display = 'none';
    if (root) root.style.display = 'none';
  }

  function showLoading() {
    const error = document.getElementById('detail-error');
    const loading = document.getElementById('detail-loading');
    const root = document.getElementById('work-detail-root');
    if (error) error.style.display = 'none';
    if (loading) loading.style.display = 'flex';
    if (root) root.style.display = 'none';
  }

  function showWorkDetail() {
    const error = document.getElementById('detail-error');
    const loading = document.getElementById('detail-loading');
    const root = document.getElementById('work-detail-root');
    if (error) error.style.display = 'none';
    if (loading) loading.style.display = 'none';
    if (root) root.style.display = 'block';
  }

  function getProcessSteps(work) {
    if (work.project_id === 'shuttle-universe') {
      return ['角色气质', '骑乘方式', '场景设计', '首帧 / 尾帧', '视频提示词', '成片 / 发布'];
    }
    if (work.project_id === 'misaligned-scenes') {
      return ['经典困境', '外来能力 / 道具', '语言冲突', '角色一致性', '分镜提示词', '字幕 / 剪辑 / 发布'];
    }
    return ['Concept', 'Materials', 'Production', 'Publish'];
  }

  function renderStats(work) {
    const stats = work.stats || {};
    const items = [
      ['document_count', 'docs'],
      ['prompt_count', 'prompts'],
      ['subtitle_count', 'subtitles'],
      ['image_count', 'images'],
      ['video_count', 'videos']
    ];
    document.getElementById('work-stats-grid').innerHTML = items.map(([key, label]) =>
      '<span><strong>' + escapeHtml(stats[key] || 0) + '</strong>' + escapeHtml(label) + '</span>'
    ).join('');
  }

  function renderProcessFlow(work) {
    document.getElementById('work-process-flow').innerHTML = getProcessSteps(work).map((step, index) =>
      '<div class="work-process-step"><span>' + String(index + 1).padStart(2, '0') + '</span><strong>' + escapeHtml(step) + '</strong></div>'
    ).join('');
  }

  function normalizeGallery(work) {
    const entries = [];
    if (work.cover) entries.push({ src: work.cover, title: '项目封面' });
    if (work.thumbnail && work.thumbnail !== work.cover) entries.push({ src: work.thumbnail, title: '缩略图' });
    const gallery = Array.isArray(work.gallery) ? work.gallery : [];
    gallery.forEach((item) => {
      if (typeof item === 'string') entries.push({ src: item, title: '' });
      else if (item && item.src) entries.push(item);
    });
    (Array.isArray(work.images) ? work.images : []).forEach((src) => entries.push({ src, title: '' }));
    const seen = new Set();
    return entries.filter((item) => {
      const src = String(item.src || '').trim();
      if (!src || seen.has(src)) return false;
      seen.add(src);
      return true;
    });
  }

  function renderGallery(work) {
    const section = document.getElementById('work-gallery-section');
    const grid = document.getElementById('work-gallery-grid');
    if (!section || !grid) return;
    const items = normalizeGallery(work);
    if (!items.length) {
      section.hidden = true;
      grid.innerHTML = '';
      return;
    }
    section.hidden = false;
    grid.innerHTML = items.map((item) => (
      '<figure class="media-frame work-gallery-media">' +
        '<img src="' + escapeHtml(item.src) + '" alt="' + escapeHtml(item.title || work.title || '作品图片') + '" loading="lazy">' +
        (item.title || item.category ? '<figcaption>' + escapeHtml([item.title, item.category].filter(Boolean).join(' · ')) + '</figcaption>' : '') +
      '</figure>'
    )).join('');
  }

  function getNonEmptyGroups(work) {
    const groups = work.document_groups || {};
    return ['overview', 'prompts', 'subtitles', 'editing', 'cover', 'publish', 'references', 'other']
      .filter(key => Array.isArray(groups[key]) && groups[key].length > 0)
      .map(key => ({ key, docs: groups[key] }));
  }

  function safePathLabel(doc) {
    const raw = doc.path_label || doc.work_relative_path || doc.file_name || '';
    const localRootToken = '/' + 'Volumes';
    return String(raw)
      .replace(new RegExp('^' + localRootToken + '/[^/]+/'), '')
      .replaceAll(localRootToken + '/', '');
  }

  function renderDocumentContentCard(doc) {
    const meta = [
      doc.group,
      doc.relative_path,
      doc.extension,
      doc.truncated ? 'truncated' : ''
    ].filter(Boolean).join(' · ');

    return (
      '<article class="work-document-card work-document-card--content">' +
        '<div class="work-document-card__header">' +
          '<strong>' + escapeHtml(doc.title || doc.file_name || 'Untitled') + '</strong>' +
          '<small class="work-document-content-meta">' + escapeHtml(meta) + '</small>' +
        '</div>' +
        '<pre class="work-document-content">' + escapeHtml(doc.content || '') + '</pre>' +
      '</article>'
    );
  }

  function renderDocumentPanel(work, groupKey, documentContent) {
    const panel = document.getElementById('work-document-panel');
    const groups = documentContent && documentContent.groups ? documentContent.groups : (work.document_groups || {});
    const docs = (groups[groupKey]) || [];
    if (!docs.length) {
      panel.innerHTML = '<div class="work-document-empty">当前分组暂无可展示的制作文档。</div>';
      return;
    }

    if (documentContent) {
      panel.innerHTML = docs.map(renderDocumentContentCard).join('');
      return;
    }

    panel.innerHTML = docs.map(doc => (
      '<article class="work-document-card">' +
        '<strong>' + escapeHtml(doc.title || doc.file_name || 'Untitled') + '</strong>' +
        '<small>group: ' + escapeHtml(groupKey) + '</small>' +
        '<small>path: ' + escapeHtml(safePathLabel(doc)) + '</small>' +
        '<small>type: ' + escapeHtml(doc.extension || 'file') + '</small>' +
      '</article>'
    )).join('');
  }

  function renderDocumentTabs(work, documentContent) {
    const tabs = document.getElementById('work-document-tabs');
    const sourceGroups = documentContent && documentContent.groups ? documentContent.groups : (work.document_groups || {});
    const groups = ['overview', 'prompts', 'subtitles', 'editing', 'cover', 'publish', 'references', 'other']
      .filter(key => Array.isArray(sourceGroups[key]) && sourceGroups[key].length > 0)
      .map(key => ({ key, docs: sourceGroups[key] }));

    if (!groups.length) {
      tabs.innerHTML = '';
      document.getElementById('work-document-panel').innerHTML = '<div class="work-document-empty">当前作品已有索引，但还没有可展示的制作文档。</div>';
      return;
    }
    tabs.innerHTML = groups.map((group, index) =>
      '<button type="button" class="work-document-tab' + (index === 0 ? ' active' : '') + '" data-doc-group="' + escapeHtml(group.key) + '">' +
        escapeHtml(group.key) + ' · ' + escapeHtml(group.docs.length) +
      '</button>'
    ).join('');
    renderDocumentPanel(work, groups[0].key, documentContent);
    tabs.querySelectorAll('.work-document-tab').forEach(button => {
      button.addEventListener('click', () => {
        tabs.querySelectorAll('.work-document-tab').forEach(item => item.classList.remove('active'));
        button.classList.add('active');
        renderDocumentPanel(work, button.dataset.docGroup, documentContent);
      });
    });
  }

  function renderWorkDetail(work, documentContent) {
    document.title = (work.title || '作品制作流程档案') + ' · Janet';
    document.getElementById('work-detail-kicker').textContent = 'Work Process Archive';
    document.getElementById('work-detail-title').textContent = work.title || '未命名作品';
    document.getElementById('work-detail-summary').textContent = work.summary || '';
    const back = document.getElementById('work-back-link');
    back.href = work.project_id ? 'portfolio.html?project=' + encodeURIComponent(work.project_id) : 'portfolio.html';
    const tags = Array.isArray(work.tags) ? work.tags : [];
    document.getElementById('work-detail-meta').innerHTML = [
      getProjectLabel(work.project_id),
      getProjectTypeLabel(work.project_id),
      work.status || '制作中',
      ...(tags.slice(0, 5))
    ].map(item => '<span>' + escapeHtml(item) + '</span>').join('');
    renderStats(work);
    renderProcessFlow(work);
    renderGallery(work);
    renderDocumentTabs(work, documentContent);
    showWorkDetail();
    document.dispatchEvent(new CustomEvent('janet:content-rendered'));
  }

  function titleToSlug(title) {
    return String(title || '').toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-').replace(/^-+|-+$/g, '').substring(0, 32);
  }

  function resolveId(item, index) {
    if (item.id && typeof item.id === 'string' && item.id.trim() !== '') return item.id;
    if (item.title) return titleToSlug(item.title);
    return 'item-' + index;
  }

  function initLegacyFallback() {
    const id = getQueryParam('id');
    if (!id) { showError(); return; }
    loadJson('data/portfolio.json')
      .then(data => {
        const item = Array.isArray(data) ? data.find((entry, index) => resolveId(entry, index) === decodeURIComponent(id)) : null;
        if (!item) { showError(); return; }
        renderWorkDetail({
          id,
          project_id: 'legacy-portfolio',
          title: item.title || '未命名项目',
          summary: item.summary || item.subtitle || '',
          status: '旧作品档案',
          tags: item.tags || [],
          stats: { document_count: 0, prompt_count: item.promptStructure ? 1 : 0, subtitle_count: 0, image_count: item.thumbnail || item.videoThumb ? 1 : 0, video_count: item.videoUrl ? 1 : 0 },
          document_groups: item.promptStructure ? { prompts: [{ title: 'Prompt Structure', file_name: 'legacy-prompt', path_label: 'data/portfolio.json', extension: '.json' }] } : {}
        });
      })
      .catch(() => showError());
  }

  async function initWorkProcessDetailViewer() {
    if (!document.getElementById('work-detail-root')) return;
    showLoading();
    const workId = getQueryParam('work');
    if (!workId) {
      initLegacyFallback();
      return;
    }
    try {
      const work = await loadWorkById(decodeURIComponent(workId));
      if (!work) { showError(); return; }
      const documentContent = await loadWorkDocumentContent(work);
      renderWorkDetail(work, documentContent);
    } catch (error) {
      console.warn('[work-detail] failed:', error);
      showError();
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    initWorkProcessDetailViewer();
  });
})();
