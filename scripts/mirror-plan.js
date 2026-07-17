(function() {
  'use strict';

  const INDEX_URL = 'data/works/documents/mirror-plan/index.json';
  const DOC_BASE_URL = 'data/works/documents/mirror-plan/';
  const IMAGE_BASE_URL = 'assets/works/mirror-plan/';
  const LOCAL_DOCUMENT_BASE_URL = '镜场计划/tests/';

  const state = {
    catalog: [],
    activeId: '',
    cache: new Map(),
    fallbackFullscreen: false,
    currentView: 'summary',
    hasPrimaryDocument: false
  };

  function create(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (typeof text === 'string') node.textContent = text;
    return node;
  }

  function safeDataUrl(value) {
    try {
      const target = new URL(String(value || ''), window.location.href);
      const base = new URL(DOC_BASE_URL, window.location.href);
      return target.origin === base.origin && target.pathname.startsWith(base.pathname) && target.pathname.endsWith('.json');
    } catch (_) {
      return false;
    }
  }

  function safeImageUrl(value) {
    try {
      const target = new URL(String(value || ''), window.location.href);
      const base = new URL(IMAGE_BASE_URL, window.location.href);
      return target.origin === base.origin && target.pathname.startsWith(base.pathname);
    } catch (_) {
      return false;
    }
  }

  function isLocalWorkspace() {
    if (document.querySelector('meta[name="janet-public-artifact"][content="true"]')) return false;
    try {
      const current = new URL(window.location.href);
      return current.protocol === 'file:' || ['localhost', '127.0.0.1', '[::1]'].includes(current.hostname);
    } catch (_) {
      return false;
    }
  }

  function safeLocalDocumentUrl(value, extension, id) {
    if (!isLocalWorkspace() || !/^\d{2,}$/.test(String(id || ''))) return false;
    try {
      const target = new URL(String(value || ''), window.location.href);
      const base = new URL(LOCAL_DOCUMENT_BASE_URL + 'JW-LTBF-' + id + '/', window.location.href);
      return target.protocol === base.protocol
        && target.host === base.host
        && target.pathname.startsWith(base.pathname)
        && target.pathname.toLowerCase().endsWith('.' + extension);
    } catch (_) {
      return false;
    }
  }

  async function fetchJson(url) {
    const response = await fetch(url, { cache: 'no-cache' });
    if (!response.ok) throw new Error('HTTP ' + response.status);
    return response.json();
  }

  function getElements() {
    return {
      library: document.getElementById('mirror-library'),
      list: document.getElementById('mirror-doc-list'),
      total: document.getElementById('mirror-doc-total'),
      reader: document.getElementById('mirror-reader-body'),
      code: document.getElementById('mirror-reader-code'),
      title: document.getElementById('mirror-reader-title'),
      minimize: document.getElementById('mirror-reader-minimize'),
      fullscreen: document.getElementById('mirror-reader-fullscreen'),
      filebar: document.getElementById('mirror-reader-filebar'),
      documentView: document.getElementById('mirror-reader-document-view'),
      summaryView: document.getElementById('mirror-reader-summary-view'),
      openDocument: document.getElementById('mirror-reader-open'),
      downloadDocument: document.getElementById('mirror-reader-download')
    };
  }

  function setReaderState(label, message, busy) {
    const { reader, filebar, openDocument, downloadDocument } = getElements();
    if (!reader) return;
    const box = create('div', 'mirror-reader__state');
    box.append(create('span', '', label), create('p', '', message));
    reader.replaceChildren(box);
    reader.setAttribute('aria-busy', String(Boolean(busy)));
    reader.classList.remove('is-document-view');
    if (filebar) filebar.hidden = true;
    if (openDocument) openDocument.removeAttribute('href');
    if (downloadDocument) downloadDocument.removeAttribute('href');
    state.currentView = 'summary';
    state.hasPrimaryDocument = false;
  }

  function renderCatalog() {
    const { list, total } = getElements();
    if (!list) return;
    const fragment = document.createDocumentFragment();

    state.catalog.forEach((item) => {
      const button = create('button', 'mirror-doc-button');
      button.type = 'button';
      button.dataset.docId = item.id;
      button.dataset.status = item.status_code || '';
      button.setAttribute('aria-current', item.id === state.activeId ? 'page' : 'false');
      if (item.id === state.activeId) button.classList.add('is-active');

      const number = create('span', 'mirror-doc-button__no', item.number || item.id);
      number.setAttribute('aria-hidden', 'true');
      const copy = create('span', 'mirror-doc-button__copy');
      copy.append(
        create('strong', '', item.title || '未命名实验'),
        create('span', '', item.code || ''),
        create('em', '', item.status_label || '未标记')
      );
      button.append(number, copy);
      button.addEventListener('click', () => selectDocument(item.id, true));
      fragment.append(button);
    });

    list.replaceChildren(fragment);
    if (total) total.textContent = String(state.catalog.length).padStart(2, '0') + ' DOCUMENTS';
    requestAnimationFrame(keepActiveDocumentVisible);
  }

  function keepActiveDocumentVisible() {
    const { list } = getElements();
    if (!list || !window.matchMedia('(max-width: 900px)').matches) return;
    const active = list.querySelector('.mirror-doc-button.is-active');
    if (!active) return;
    const left = active.offsetLeft - Math.max((list.clientWidth - active.offsetWidth) / 2, 0);
    list.scrollTo({ left: Math.max(left, 0), behavior: 'smooth' });
  }

  function renderFacts(facts) {
    if (!Array.isArray(facts) || !facts.length) return null;
    const grid = create('div', 'mirror-doc-facts');
    facts.forEach((fact) => {
      const item = create('div', 'mirror-doc-fact');
      item.append(create('span', '', fact.label || ''), create('strong', '', fact.value || '—'));
      grid.append(item);
    });
    return grid;
  }

  function renderTable(table) {
    if (!table || !Array.isArray(table.headers) || !Array.isArray(table.rows)) return null;
    const wrap = create('div', 'mirror-doc-table-wrap');
    const node = create('table', 'mirror-doc-table');
    const head = document.createElement('thead');
    const headRow = document.createElement('tr');
    table.headers.forEach((header) => headRow.append(create('th', '', String(header))));
    head.append(headRow);
    const body = document.createElement('tbody');
    table.rows.forEach((row) => {
      const tr = document.createElement('tr');
      (Array.isArray(row) ? row : []).forEach((cell) => tr.append(create('td', '', String(cell))));
      body.append(tr);
    });
    node.append(head, body);
    wrap.append(node);
    return wrap;
  }

  function renderGallery(gallery) {
    if (!Array.isArray(gallery) || !gallery.length) return null;
    const grid = create('div', 'mirror-doc-gallery');
    gallery.forEach((item) => {
      if (!safeImageUrl(item.src)) return;
      const figure = document.createElement('figure');
      const image = document.createElement('img');
      image.src = item.src;
      image.alt = item.alt || item.label || '实验结果图';
      image.loading = 'lazy';
      image.decoding = 'async';
      if (Number(item.width) > 0) image.width = Number(item.width);
      if (Number(item.height) > 0) image.height = Number(item.height);
      const caption = document.createElement('figcaption');
      caption.append(create('strong', '', item.label || ''), create('span', '', item.caption || ''));
      figure.append(image, caption);
      grid.append(figure);
    });
    return grid.childElementCount ? grid : null;
  }

  function renderSection(section, index) {
    const root = create('section', 'mirror-doc-section');
    const number = create('span', 'mirror-doc-section__no', String(index + 1).padStart(2, '0'));
    const content = create('div', 'mirror-doc-section__content');
    content.append(create('h3', '', section.title || '未命名章节'));

    (Array.isArray(section.paragraphs) ? section.paragraphs : []).forEach((paragraph) => {
      content.append(create('p', '', String(paragraph)));
    });

    if (Array.isArray(section.bullets) && section.bullets.length) {
      const list = document.createElement('ul');
      section.bullets.forEach((item) => list.append(create('li', '', String(item))));
      content.append(list);
    }

    const table = renderTable(section.table);
    if (table) content.append(table);
    const gallery = renderGallery(section.gallery);
    if (gallery) content.append(gallery);
    if (section.note) content.append(create('div', 'mirror-doc-note', String(section.note)));

    root.append(number, content);
    return root;
  }

  function buildSummary(doc) {
    const article = create('div', 'mirror-doc');
    const cover = create('header', 'mirror-doc-cover');
    cover.dataset.number = doc.number || '';
    cover.append(
      create('span', 'mirror-doc-cover__eyebrow', doc.eyebrow || doc.code || 'EXPERIMENT DOCUMENT'),
      create('h2', '', doc.title || '未命名实验'),
      create('p', '', doc.summary || '')
    );

    const meta = create('div', 'mirror-doc-cover__meta');
    [doc.status_label, doc.code, doc.updated_at].filter(Boolean).forEach((item) => meta.append(create('span', '', String(item))));
    cover.append(meta);
    article.append(cover);

    const facts = renderFacts(doc.facts);
    if (facts) article.append(facts);
    (Array.isArray(doc.sections) ? doc.sections : []).forEach((section, index) => article.append(renderSection(section, index)));
    if (doc.public_note) article.append(create('div', 'mirror-doc-note', String(doc.public_note)));

    return article;
  }

  function updateReaderView(requestedView) {
    const { reader, documentView, summaryView } = getElements();
    if (!reader) return;
    const view = requestedView === 'document' && state.hasPrimaryDocument ? 'document' : 'summary';
    const documentPanel = reader.querySelector('[data-reader-view="document"]');
    const summaryPanel = reader.querySelector('[data-reader-view="summary"]');
    if (documentPanel) documentPanel.hidden = view !== 'document';
    if (summaryPanel) summaryPanel.hidden = view !== 'summary';
    reader.classList.toggle('is-document-view', view === 'document');
    documentView?.setAttribute('aria-pressed', String(view === 'document'));
    summaryView?.setAttribute('aria-pressed', String(view === 'summary'));
    state.currentView = view;
  }

  function renderDocument(doc) {
    const {
      reader,
      code,
      title,
      filebar,
      openDocument,
      downloadDocument
    } = getElements();
    if (!reader) return;

    const summaryPanel = create('div', 'mirror-reader__view mirror-reader__view--summary');
    summaryPanel.dataset.readerView = 'summary';
    summaryPanel.append(buildSummary(doc));

    const primary = doc.primary_document || {};
    const hasPdf = primary.scope === 'local-only' && safeLocalDocumentUrl(primary.pdf_url, 'pdf', doc.id);
    const hasDocx = primary.scope === 'local-only' && safeLocalDocumentUrl(primary.docx_url, 'docx', doc.id);
    const views = create('div', 'mirror-reader__views');

    state.hasPrimaryDocument = hasPdf;
    if (hasPdf) {
      const documentPanel = create('div', 'mirror-reader__view mirror-reader__view--document');
      documentPanel.dataset.readerView = 'document';
      const frame = document.createElement('iframe');
      frame.src = primary.pdf_url + '#view=FitH&toolbar=1&navpanes=0';
      frame.title = (primary.title || doc.title || '实验文档') + ' PDF 阅读版';
      frame.loading = 'eager';
      documentPanel.append(frame);
      views.append(documentPanel);
    }
    views.append(summaryPanel);

    reader.replaceChildren(views);
    reader.setAttribute('aria-busy', 'false');
    reader.scrollTop = 0;
    if (code) code.textContent = doc.code || 'EXPERIMENT DOCUMENT';
    if (title) title.textContent = doc.title || '实验文档';

    if (filebar) filebar.hidden = !hasPdf;
    if (openDocument) {
      openDocument.hidden = !hasPdf;
      if (hasPdf) openDocument.href = primary.pdf_url;
    }
    if (downloadDocument) {
      downloadDocument.hidden = !hasDocx;
      if (hasDocx) {
        downloadDocument.href = primary.docx_url;
        downloadDocument.download = primary.download_name || '';
      }
    }

    updateReaderView(hasPdf && doc.default_view !== 'summary' ? 'document' : 'summary');
  }

  function updateUrl(id) {
    const url = new URL(window.location.href);
    url.searchParams.set('doc', id);
    window.history.pushState({ mirrorDoc: id }, '', url);
  }

  async function selectDocument(id, pushHistory) {
    const item = state.catalog.find((entry) => entry.id === id);
    if (!item || !safeDataUrl(item.data_url)) return;
    state.activeId = id;
    renderCatalog();
    if (pushHistory) updateUrl(id);

    const { code, title } = getElements();
    if (code) code.textContent = item.code || 'EXPERIMENT DOCUMENT';
    if (title) title.textContent = item.title || '实验文档';

    try {
      if (!state.cache.has(id)) {
        setReaderState('LOADING', '正在读取 ' + (item.code || id) + '。', true);
        state.cache.set(id, await fetchJson(item.data_url));
      }
      if (state.activeId === id) renderDocument(state.cache.get(id));
    } catch (error) {
      state.cache.delete(id);
      setReaderState('LOAD FAILED', '文档暂时无法读取，请刷新后重试。', false);
      console.warn('[mirror-plan] document load failed:', error);
    }
  }

  function isFullscreen(library) {
    return document.fullscreenElement === library || library.classList.contains('is-maximized');
  }

  function updateFullscreenButton() {
    const { library, fullscreen } = getElements();
    if (!library || !fullscreen) return;
    const active = isFullscreen(library);
    fullscreen.setAttribute('aria-pressed', String(active));
    fullscreen.setAttribute('aria-label', active ? '退出全屏' : '全屏阅读');
    fullscreen.title = active ? '退出全屏' : '全屏阅读';
    const label = fullscreen.querySelector('em');
    const icon = fullscreen.querySelector('span');
    if (label) label.textContent = active ? '退出' : '全屏';
    if (icon) icon.textContent = active ? '×' : '□';
  }

  async function exitFullscreen() {
    const { library } = getElements();
    if (!library) return;
    if (document.fullscreenElement === library && document.exitFullscreen) {
      await document.exitFullscreen().catch(() => {});
    }
    library.classList.remove('is-maximized');
    document.body.classList.remove('mirror-reader-maximized');
    state.fallbackFullscreen = false;
    updateFullscreenButton();
  }

  async function toggleFullscreen() {
    const { library } = getElements();
    if (!library) return;
    if (library.classList.contains('is-collapsed')) toggleMinimize(false);
    if (isFullscreen(library)) {
      await exitFullscreen();
      return;
    }

    if (library.requestFullscreen) {
      try {
        await library.requestFullscreen();
        updateFullscreenButton();
        return;
      } catch (_) {
        // Safari/iOS or permission failure: use a same-layout CSS fallback.
      }
    }

    library.classList.add('is-maximized');
    document.body.classList.add('mirror-reader-maximized');
    state.fallbackFullscreen = true;
    updateFullscreenButton();
  }

  function toggleMinimize(forceCollapsed) {
    const { library, minimize } = getElements();
    if (!library || !minimize) return;
    if (isFullscreen(library)) exitFullscreen();
    const collapsed = typeof forceCollapsed === 'boolean'
      ? forceCollapsed
      : !library.classList.contains('is-collapsed');
    library.classList.toggle('is-collapsed', collapsed);
    minimize.setAttribute('aria-expanded', String(!collapsed));
    minimize.setAttribute('aria-label', collapsed ? '展开文档框' : '缩小文档框');
    minimize.title = collapsed ? '展开文档框' : '缩小文档框';
    const label = minimize.querySelector('em');
    const icon = minimize.querySelector('span');
    if (label) label.textContent = collapsed ? '展开' : '缩小';
    if (icon) icon.textContent = collapsed ? '+' : '—';
  }

  function bindControls() {
    const { minimize, fullscreen, documentView, summaryView } = getElements();
    minimize?.addEventListener('click', () => toggleMinimize());
    fullscreen?.addEventListener('click', toggleFullscreen);
    documentView?.addEventListener('click', () => updateReaderView('document'));
    summaryView?.addEventListener('click', () => updateReaderView('summary'));
    document.addEventListener('fullscreenchange', updateFullscreenButton);
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && state.fallbackFullscreen) exitFullscreen();
    });
    window.addEventListener('popstate', () => {
      const requested = new URL(window.location.href).searchParams.get('doc');
      if (requested && requested !== state.activeId) selectDocument(requested, false);
    });
    let resizeTimer = 0;
    window.addEventListener('resize', () => {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(keepActiveDocumentVisible, 120);
    });
  }

  async function init() {
    const { library, list } = getElements();
    if (!library || !list) return;
    bindControls();

    try {
      const payload = await fetchJson(INDEX_URL);
      state.catalog = (Array.isArray(payload.documents) ? payload.documents : [])
        .filter((item) => item && item.id && safeDataUrl(item.data_url));
      if (!state.catalog.length) throw new Error('empty document index');
      const requested = new URL(window.location.href).searchParams.get('doc');
      const fallback = state.catalog.find((item) => item.default) || state.catalog[0];
      const initial = state.catalog.some((item) => item.id === requested) ? requested : fallback.id;
      state.activeId = initial;
      renderCatalog();
      await selectDocument(initial, false);
    } catch (error) {
      list.replaceChildren(create('span', 'mirror-doc-list__loading', '实验目录暂时无法读取。'));
      setReaderState('INDEX FAILED', '实验文档目录加载失败，请刷新后重试。', false);
      console.warn('[mirror-plan] index load failed:', error);
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
