(function() {
  'use strict';

  const INDEX_URL = 'data/works/documents/mirror-plan/index.json';
  const DATA_BASE_URL = 'data/works/documents/mirror-plan/';
  const DOCUMENT_BASE_URL = 'assets/works/mirror-plan/documents/';
  const DOCX_RELEASE_BASE_URL = 'https://github.com/Yaojingwen2002/janet-public-site/releases/download/mirror-plan-documents-v1/';

  const state = {
    catalog: [],
    activeId: '',
    cache: new Map(),
    fallbackFullscreen: false
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
      const base = new URL(DATA_BASE_URL, window.location.href);
      return target.protocol === base.protocol
        && target.host === base.host
        && target.pathname.startsWith(base.pathname)
        && target.pathname.endsWith('.json');
    } catch (_) {
      return false;
    }
  }

  function safePublicPdfUrl(value, id) {
    if (!/^\d{2,}$/.test(String(id || ''))) return false;
    try {
      const target = new URL(String(value || ''), window.location.href);
      const base = new URL(DOCUMENT_BASE_URL + id + '/', window.location.href);
      return target.protocol === base.protocol
        && target.host === base.host
        && target.pathname.startsWith(base.pathname)
        && target.pathname.toLowerCase().endsWith('.pdf');
    } catch (_) {
      return false;
    }
  }

  function safeReleaseDocxUrl(value) {
    try {
      const target = new URL(String(value || ''));
      const base = new URL(DOCX_RELEASE_BASE_URL);
      return target.protocol === 'https:'
        && target.origin === base.origin
        && target.pathname.startsWith(base.pathname)
        && target.pathname.toLowerCase().endsWith('.docx');
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
  }

  function renderCatalog() {
    const { list, total } = getElements();
    if (!list) return;
    const fragment = document.createDocumentFragment();

    state.catalog.forEach((item) => {
      const button = create('button', 'mirror-doc-button');
      button.type = 'button';
      button.dataset.docId = item.id;
      button.setAttribute('aria-current', item.id === state.activeId ? 'page' : 'false');
      button.setAttribute('aria-label', (item.code || item.id) + '，' + (item.objective || item.title || '实验文档'));
      if (item.id === state.activeId) button.classList.add('is-active');

      const number = create('span', 'mirror-doc-button__no', item.number || item.id);
      number.setAttribute('aria-hidden', 'true');
      const copy = create('span', 'mirror-doc-button__copy');
      copy.append(
        create('span', 'mirror-doc-button__code', item.code || ''),
        create('strong', 'mirror-doc-button__objective', item.objective || item.title || '未命名实验')
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

    if (code) code.textContent = doc.code || 'EXPERIMENT DOCUMENT';
    if (title) title.textContent = doc.title || '实验文档';

    const primary = doc.primary_document || {};
    const isPublicSource = primary.scope === 'public' && primary.source_mode === 'pdf-tracked-docx-release';
    const hasPdf = isPublicSource && safePublicPdfUrl(primary.pdf_url, doc.id);
    const hasDocx = isPublicSource && safeReleaseDocxUrl(primary.docx_url);

    if (!hasPdf) {
      setReaderState('DOCUMENT UNAVAILABLE', '完整 PDF 暂时无法读取。', false);
      return;
    }

    const documentPanel = create('div', 'mirror-reader__view mirror-reader__view--document');
    const frame = document.createElement('iframe');
    frame.src = primary.pdf_url + '#view=FitH&toolbar=1&navpanes=0';
    frame.title = (primary.title || doc.title || '实验文档') + ' PDF 阅读版';
    frame.loading = 'eager';
    documentPanel.append(frame);

    reader.replaceChildren(documentPanel);
    reader.setAttribute('aria-busy', 'false');
    reader.classList.add('is-document-view');
    reader.scrollTop = 0;

    if (filebar) filebar.hidden = false;
    if (openDocument) {
      openDocument.hidden = false;
      openDocument.href = primary.pdf_url;
    }
    if (downloadDocument) {
      downloadDocument.hidden = !hasDocx;
      if (hasDocx) {
        downloadDocument.href = primary.docx_url;
        downloadDocument.download = primary.download_name || '';
      } else {
        downloadDocument.removeAttribute('href');
      }
    }
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
      setReaderState('LOAD FAILED', '完整实验文档暂时无法读取，请刷新后重试。', false);
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
        // Safari/iOS or permission failure: use the same layout as a CSS fallback.
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
    const { minimize, fullscreen } = getElements();
    minimize?.addEventListener('click', () => toggleMinimize());
    fullscreen?.addEventListener('click', toggleFullscreen);
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
