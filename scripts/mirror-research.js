(function() {
  'use strict';

  const STATUS_URL = 'data/mirror-plan-status.json';
  const PROJECT_URL = 'data/works/projects/mirror-plan.json';
  const DOCUMENT_INDEX_URL = 'data/works/documents/mirror-plan/index.json';

  const statusSelectors = {
    phase: '[data-mirror-phase]',
    phaseLabel: '[data-mirror-phase-label]',
    current: '[data-mirror-current]',
    completed: '[data-mirror-completed]',
    active: '[data-mirror-active]',
    scheduled: '[data-mirror-scheduled]',
    planned: '[data-mirror-planned]',
    publicFrames: '[data-mirror-public-frames]',
    generated: '[data-mirror-generated]',
    documents: '[data-mirror-documents]',
    updated: '[data-mirror-updated]',
    next: '[data-mirror-next]',
    boundary: '[data-mirror-boundary]'
  };

  const state = {
    status: null,
    project: null,
    documentIndex: null,
    experimentIndex: null,
    experiments: [],
    selectedId: '',
    filters: {
      scene: '',
      shot_scale: '',
      status: ''
    },
    drawerTrigger: null,
    syncView: {
      scale: 1,
      x: 0,
      y: 0,
      pointerId: null,
      startX: 0,
      startY: 0,
      originX: 0,
      originY: 0
    }
  };

  function create(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (typeof text === 'string') element.textContent = text;
    return element;
  }

  function setText(selector, value) {
    document.querySelectorAll(selector).forEach((element) => {
      element.textContent = String(value);
    });
  }

  function setImage(element, source, alt, loading = 'lazy') {
    if (!element || !source) return;
    element.src = source;
    element.alt = alt || '';
    element.loading = loading;
    element.decoding = 'async';
  }

  function formatDate(value) {
    const parts = String(value || '').split('-');
    if (parts.length !== 3) return value || '尚未记录';
    return `${parts[0]}.${parts[1]}.${parts[2]}`;
  }

  async function fetchJson(url) {
    const response = await fetch(url, { cache: 'no-cache' });
    if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
    return response.json();
  }

  function hydrateStatus(status) {
    setText(statusSelectors.phase, status.phase_id);
    setText(statusSelectors.phaseLabel, status.phase_label);
    setText(statusSelectors.current, status.current_experiment);
    setText(statusSelectors.completed, status.completed_experiments);
    setText(statusSelectors.active, status.active_experiments);
    setText(statusSelectors.scheduled, status.scheduled_experiments);
    setText(statusSelectors.planned, status.planned_atlas_frames);
    setText(statusSelectors.publicFrames, status.public_atlas_frames);
    setText(statusSelectors.generated, status.generated_images);
    setText(statusSelectors.documents, status.documents);
    setText(statusSelectors.updated, formatDate(status.last_research_update));
    setText(statusSelectors.next, status.next_step);
    setText(statusSelectors.boundary, status.public_boundary);
    document.querySelectorAll('[data-mirror-status-root]').forEach((root) => {
      root.dataset.status = 'ready';
    });
  }

  function activatePreview(image, activeImage, controls, button) {
    setImage(activeImage, image.src, image.alt, 'eager');
    controls.querySelectorAll('button').forEach((control) => {
      const current = control === button;
      control.classList.toggle('is-active', current);
      control.setAttribute('aria-pressed', String(current));
    });
  }

  function renderCurrentPreview(status) {
    const images = Array.isArray(status.preview_images) ? status.preview_images : [];
    const activeImage = document.querySelector('[data-mirror-preview-main]');
    const controls = document.querySelector('[data-mirror-preview-controls]');
    if (!activeImage || !controls || !images.length || document.querySelector('[data-mirror-detail]')) return;

    const fragment = document.createDocumentFragment();
    images.forEach((image, index) => {
      const button = create('button', 'mirror-preview-tab', image.label);
      button.type = 'button';
      button.setAttribute('aria-pressed', String(index === 1 || (images.length === 1 && index === 0)));
      button.addEventListener('click', () => activatePreview(image, activeImage, controls, button));
      if (index === 1 || (images.length === 1 && index === 0)) button.classList.add('is-active');
      fragment.append(button);
    });
    controls.replaceChildren(fragment);
    const initial = images[1] || images[0];
    setImage(activeImage, initial.src, initial.alt, 'eager');
  }

  function renderTriptych(status) {
    const images = Array.isArray(status.preview_images) ? status.preview_images : [];
    document.querySelectorAll('[data-mirror-triptych]').forEach((triptych) => {
      if (!images.length) return;
      const tiles = images.slice(0, 3).map((image) => {
        const figure = document.createElement('figure');
        const picture = document.createElement('img');
        const caption = document.createElement('figcaption');
        setImage(picture, image.src, image.alt, 'eager');
        caption.textContent = image.label;
        figure.append(picture, caption);
        return figure;
      });
      triptych.replaceChildren(...tiles);
    });
  }

  function renderFeaturedPreviews(status) {
    const items = Array.isArray(status.featured_previews) ? status.featured_previews : [];
    document.querySelectorAll('[data-mirror-featured-previews]').forEach((track) => {
      const fragment = document.createDocumentFragment();
      items.forEach((item) => {
        const link = create('a', 'mirror-featured-preview');
        link.href = `mirror-plan.html?experiment=${encodeURIComponent(item.id)}`;
        const image = document.createElement('img');
        setImage(image, item.src, item.alt);
        const label = create('span', '', item.label);
        link.append(image, label);
        fragment.append(link);
      });
      track.replaceChildren(fragment);
    });
  }

  function workForDocument(documentItem) {
    return state.project.works.find((work) =>
      String(work.display_number) === String(documentItem.number || documentItem.id)
    );
  }

  function renderRecords() {
    document.querySelectorAll('[data-mirror-records]').forEach((records) => {
      const fragment = document.createDocumentFragment();
      state.documentIndex.documents.forEach((documentItem) => {
        const work = workForDocument(documentItem);
        const link = create('a', 'mirror-record-link');
        link.href = `mirror-plan.html?doc=${encodeURIComponent(documentItem.id)}#mirror-record-reader`;

        const number = create('span', '', documentItem.number || documentItem.id);
        const copy = create('span');
        const code = create('small', '', documentItem.code || '');
        const title = create('strong', '', documentItem.title || '实验记录');
        const summary = create('em', '', work?.summary || documentItem.objective || '');
        copy.append(code, title, summary);
        link.append(number, copy);
        fragment.append(link);
      });
      records.replaceChildren(fragment);
    });
  }

  function fillFilterOptions(name) {
    const select = document.querySelector(`[data-mirror-filter="${name}"]`);
    if (!select) return;
    const values = new Map();
    state.experiments.forEach((experiment) => {
      const value = experiment[name];
      if (!value) return;
      values.set(value, name === 'status' ? experiment.status_label : value);
    });
    [...values.entries()]
      .sort((a, b) => a[1].localeCompare(b[1], 'zh-CN'))
      .forEach(([value, label]) => {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = label;
        select.append(option);
      });
  }

  function filteredExperiments() {
    return state.experiments.filter((experiment) =>
      Object.entries(state.filters).every(([name, value]) => !value || experiment[name] === value)
    );
  }

  function statusClass(value) {
    if (value === 'active') return 'is-active';
    if (value === 'scheduled') return 'is-scheduled';
    if (value === 'stage_closed') return 'is-stage-closed';
    return 'is-complete';
  }

  function renderAtlas() {
    const filtered = filteredExperiments();
    setText('[data-mirror-filter-count]', `${filtered.length} / ${state.experiments.length}`);
    document.querySelectorAll('[data-mirror-atlas]').forEach((atlas) => {
      const fragment = document.createDocumentFragment();
      filtered.forEach((experiment) => {
        const button = create('button', `mirror-atlas-item ${statusClass(experiment.status)}`);
        button.type = 'button';
        button.dataset.experimentId = experiment.id;
        button.setAttribute('aria-label', `${experiment.id}，${experiment.title}，${experiment.status_label}`);
        button.setAttribute('aria-pressed', String(experiment.id === state.selectedId));

        const media = create('span', 'mirror-atlas-item__media');
        const image = document.createElement('img');
        setImage(image, experiment.images.source, `${experiment.id} ${experiment.title}母图研究衍生图`);
        media.append(image);

        const meta = create('span', 'mirror-atlas-item__meta');
        const line = create('span', 'mirror-atlas-item__line');
        line.append(
          create('span', '', experiment.id.replace('JW-LTBF-', 'S0-')),
          create('span', `mirror-atlas-status ${statusClass(experiment.status)}`, experiment.status_label)
        );
        meta.append(
          line,
          create('strong', '', experiment.title),
          create('small', '', `${experiment.scene} / ${experiment.shot_scale}`)
        );
        button.append(media, meta);
        button.addEventListener('click', () => selectExperiment(experiment.id, {
          updateUrl: true,
          openDrawer: true,
          trigger: button
        }));
        fragment.append(button);
      });
      if (!filtered.length) {
        fragment.append(create('p', 'mirror-atlas-empty', '当前筛选没有实验。'));
      }
      atlas.replaceChildren(fragment);
    });
  }

  function bindFilters() {
    Object.keys(state.filters).forEach((name) => {
      const select = document.querySelector(`[data-mirror-filter="${name}"]`);
      if (!select) return;
      select.addEventListener('change', () => {
        state.filters[name] = select.value;
        renderAtlas();
      });
    });
  }

  function replaceList(selector, values, emptyLabel) {
    document.querySelectorAll(selector).forEach((list) => {
      const items = values.length ? values : [emptyLabel];
      list.replaceChildren(...items.map((value) => create('li', '', value)));
      list.classList.toggle('is-empty', !values.length);
    });
  }

  function applySyncView() {
    const detail = document.querySelector('[data-mirror-detail]');
    if (!detail) return;
    detail.style.setProperty('--mirror-sync-scale', String(state.syncView.scale));
    detail.style.setProperty('--mirror-sync-x', `${state.syncView.x}px`);
    detail.style.setProperty('--mirror-sync-y', `${state.syncView.y}px`);
    const zoom = document.querySelector('[data-mirror-sync-zoom]');
    if (zoom) {
      zoom.value = String(Math.round(state.syncView.scale * 100));
      zoom.setAttribute('aria-valuetext', `${Math.round(state.syncView.scale * 100)}%`);
    }
  }

  function resetSyncView() {
    state.syncView.scale = 1;
    state.syncView.x = 0;
    state.syncView.y = 0;
    applySyncView();
  }

  function renderMethodGrid(experiment) {
    document.querySelectorAll('[data-mirror-method-grid]').forEach((grid) => {
      const fragment = document.createDocumentFragment();
      experiment.methods.forEach((method) => {
        const variant = experiment.images.variants.find((item) => item.id === method.id);
        const figure = create('figure', `mirror-method-card${variant ? '' : ' is-pending'}`);
        if (variant) {
          const frame = create('div', 'mirror-sync-frame');
          frame.tabIndex = 0;
          frame.setAttribute('aria-label', `${experiment.id} ${variant.id} 版，可同步缩放和拖动`);
          const image = document.createElement('img');
          image.dataset.mirrorSyncImage = '';
          setImage(image, variant.src, `${experiment.title} ${variant.id} 版结果`);
          frame.append(image);
          figure.append(frame);
        } else {
          const pending = create('div', 'mirror-method-pending');
          pending.append(
            create('span', '', method.id),
            create('strong', '', '尚未生成')
          );
          figure.append(pending);
        }
        const caption = document.createElement('figcaption');
        caption.append(
          create('span', '', `${method.id} / ${method.label}`),
          create('strong', '', variant ? variant.outcome : method.intent)
        );
        figure.append(caption);
        fragment.append(figure);
      });
      grid.replaceChildren(fragment);
    });
    resetSyncView();
  }

  function activateEvolution(experiment, item, button) {
    const image = document.querySelector('[data-mirror-preview-main]');
    const controls = document.querySelector('[data-mirror-preview-controls]');
    if (!image || !controls) return;
    setImage(image, item.src, item.alt, 'eager');
    controls.querySelectorAll('button').forEach((control) => {
      const active = control === button;
      control.classList.toggle('is-active', active);
      control.setAttribute('aria-pressed', String(active));
    });
    const change = item.id === 'SOURCE'
      ? experiment.source.summary
      : experiment.prompt_changes[Math.max(0, experiment.images.variants.findIndex((variant) => variant.id === item.id))] ||
        item.outcome ||
        '本轮变量已记录。';
    setText('[data-mirror-prompt-change]', change);
  }

  function renderEvolution(experiment) {
    const image = document.querySelector('[data-mirror-preview-main]');
    const controls = document.querySelector('[data-mirror-preview-controls]');
    if (!image || !controls) return;

    const items = [
      {
        id: 'SOURCE',
        label: '母图',
        src: experiment.images.source,
        alt: `${experiment.title}母图研究衍生图`
      },
      ...experiment.images.variants.map((variant) => ({
        ...variant,
        alt: `${experiment.title} ${variant.id} 版结果`
      }))
    ];
    const fragment = document.createDocumentFragment();
    items.forEach((item, index) => {
      const button = create('button', 'mirror-preview-tab', item.id === 'SOURCE' ? item.label : `${item.id} / ${item.label}`);
      button.type = 'button';
      button.setAttribute('aria-pressed', String(index === (items.length > 2 ? 2 : 0)));
      button.addEventListener('click', () => activateEvolution(experiment, item, button));
      if (index === (items.length > 2 ? 2 : 0)) button.classList.add('is-active');
      fragment.append(button);
    });
    controls.replaceChildren(fragment);
    const initialIndex = items.length > 2 ? 2 : 0;
    activateEvolution(experiment, items[initialIndex], controls.children[initialIndex]);
  }

  function renderComparison(experiment) {
    const before = document.querySelector('[data-mirror-compare-before]');
    const after = document.querySelector('[data-mirror-compare-after]');
    const preferred = experiment.images.variants.find((variant) => variant.id === 'B') ||
      experiment.images.variants[0];
    setImage(before, experiment.images.source, `${experiment.title}母图研究衍生图`, 'eager');
    if (preferred) {
      setImage(after, preferred.src, `${experiment.title} ${preferred.id} 版结果`, 'eager');
      after.hidden = false;
    } else if (after) {
      after.hidden = true;
    }
    const range = document.querySelector('[data-mirror-compare-range]');
    if (range) {
      range.disabled = !preferred;
      range.value = '50';
      range.dispatchEvent(new Event('input'));
    }
  }

  function renderDetail(experiment) {
    setText('[data-mirror-detail-code]', `${experiment.id} / ${experiment.scene} / ${experiment.shot_scale}`);
    setText('[data-mirror-detail-title]', experiment.title);
    setText('[data-mirror-detail-status]', experiment.status_label);
    setText('[data-mirror-detail-result]', experiment.result_summary);
    setText('[data-mirror-detail-hypothesis]', experiment.hypothesis);
    setText('[data-mirror-detail-next]', experiment.next_step);
    replaceList('[data-mirror-prompt-changes]', experiment.prompt_changes, '尚未建立 Prompt 变更记录。');
    replaceList('[data-mirror-findings]', experiment.findings, '尚未形成实验发现。');
    replaceList('[data-mirror-failures]', experiment.failures, '尚无失败样本。');

    const record = document.querySelector('[data-mirror-detail-record]');
    if (record) {
      record.hidden = !experiment.document_id;
      if (experiment.document_id) {
        record.href = `mirror-plan.html?doc=${encodeURIComponent(experiment.document_id)}#mirror-record-reader`;
      }
    }

    renderEvolution(experiment);
    renderComparison(experiment);
    renderMethodGrid(experiment);
  }

  function updateExperimentUrl(id) {
    const url = new URL(window.location.href);
    url.searchParams.set('experiment', id);
    url.searchParams.delete('doc');
    window.history.replaceState({ mirrorExperiment: id }, '', url);
  }

  function openDrawer(experiment, trigger) {
    const drawer = document.querySelector('[data-mirror-drawer]');
    if (!drawer) return;
    state.drawerTrigger = trigger || document.activeElement;
    setText('[data-mirror-drawer-code]', experiment.id);
    setText('[data-mirror-drawer-status]', experiment.status_label);
    setText('[data-mirror-drawer-title]', experiment.title);
    setText('[data-mirror-drawer-hypothesis]', experiment.hypothesis);
    setText('[data-mirror-drawer-result]', experiment.result_summary);
    setText('[data-mirror-drawer-next]', experiment.next_step);
    setImage(
      drawer.querySelector('[data-mirror-drawer-image]'),
      experiment.images.source,
      `${experiment.id} ${experiment.title}母图研究衍生图`,
      'eager'
    );
    if (typeof drawer.showModal === 'function') drawer.showModal();
    else drawer.setAttribute('open', '');
    drawer.querySelector('[data-mirror-drawer-close]')?.focus();
  }

  function selectExperiment(id, options = {}) {
    const experiment = state.experiments.find((item) => item.id === id);
    if (!experiment) return;
    state.selectedId = id;
    renderDetail(experiment);
    document.querySelectorAll('[data-experiment-id]').forEach((button) => {
      const active = button.dataset.experimentId === id;
      button.classList.toggle('is-selected', active);
      button.setAttribute('aria-pressed', String(active));
    });
    if (options.updateUrl) updateExperimentUrl(id);
    if (options.openDrawer) openDrawer(experiment, options.trigger);
  }

  function bindDrawer() {
    const drawer = document.querySelector('[data-mirror-drawer]');
    if (!drawer) return;
    const close = () => {
      if (typeof drawer.close === 'function' && drawer.open) drawer.close();
      else drawer.removeAttribute('open');
    };
    drawer.querySelector('[data-mirror-drawer-close]')?.addEventListener('click', close);
    drawer.querySelector('[data-mirror-drawer-open]')?.addEventListener('click', () => {
      close();
      const detail = document.querySelector('[data-mirror-detail]');
      detail?.setAttribute('tabindex', '-1');
      requestAnimationFrame(() => detail?.focus({ preventScroll: true }));
    });
    drawer.addEventListener('click', (event) => {
      const bounds = drawer.getBoundingClientRect();
      const inside = event.clientX >= bounds.left &&
        event.clientX <= bounds.right &&
        event.clientY >= bounds.top &&
        event.clientY <= bounds.bottom;
      if (!inside) close();
    });
    drawer.addEventListener('close', () => {
      if (state.drawerTrigger instanceof HTMLElement) state.drawerTrigger.focus();
      state.drawerTrigger = null;
    });
  }

  function bindCompareRange() {
    document.querySelectorAll('[data-mirror-compare-range]').forEach((range) => {
      const stage = range.closest('[data-mirror-compare]');
      if (!stage) return;
      const update = () => {
        const value = Number(range.value);
        stage.style.setProperty('--mirror-compare-position', `${value}%`);
        range.setAttribute('aria-valuetext', `显示实验结果 ${value}%`);
      };
      range.addEventListener('input', update);
      update();
    });
  }

  function bindSyncView() {
    const zoom = document.querySelector('[data-mirror-sync-zoom]');
    zoom?.addEventListener('input', () => {
      state.syncView.scale = Number(zoom.value) / 100;
      if (state.syncView.scale === 1) {
        state.syncView.x = 0;
        state.syncView.y = 0;
      }
      applySyncView();
    });
    document.querySelector('[data-mirror-sync-reset]')?.addEventListener('click', resetSyncView);

    document.addEventListener('pointerdown', (event) => {
      const frame = event.target.closest('.mirror-sync-frame');
      if (!frame || state.syncView.scale <= 1) return;
      state.syncView.pointerId = event.pointerId;
      state.syncView.startX = event.clientX;
      state.syncView.startY = event.clientY;
      state.syncView.originX = state.syncView.x;
      state.syncView.originY = state.syncView.y;
      frame.setPointerCapture(event.pointerId);
      frame.classList.add('is-dragging');
    });
    document.addEventListener('pointermove', (event) => {
      if (state.syncView.pointerId !== event.pointerId) return;
      const limit = 160 * (state.syncView.scale - 1);
      state.syncView.x = Math.max(-limit, Math.min(limit, state.syncView.originX + event.clientX - state.syncView.startX));
      state.syncView.y = Math.max(-limit, Math.min(limit, state.syncView.originY + event.clientY - state.syncView.startY));
      applySyncView();
    });
    const finish = (event) => {
      if (state.syncView.pointerId !== event.pointerId) return;
      document.querySelectorAll('.mirror-sync-frame.is-dragging').forEach((frame) => {
        if (frame.hasPointerCapture(event.pointerId)) frame.releasePointerCapture(event.pointerId);
        frame.classList.remove('is-dragging');
      });
      state.syncView.pointerId = null;
    };
    document.addEventListener('pointerup', finish);
    document.addEventListener('pointercancel', finish);
  }

  function showFailure(error) {
    document.querySelectorAll('[data-mirror-status-root]').forEach((root) => {
      root.dataset.status = 'error';
    });
    document.querySelectorAll('[data-mirror-status-error]').forEach((message) => {
      message.hidden = false;
    });
    console.warn('[mirror-research] shared research data unavailable:', error);
  }

  async function init() {
    if (!document.querySelector('[data-mirror-status-root]')) return;
    bindCompareRange();
    bindSyncView();
    bindDrawer();
    bindFilters();
    try {
      const [status, project, documentIndex] = await Promise.all([
        fetchJson(STATUS_URL),
        fetchJson(PROJECT_URL),
        fetchJson(DOCUMENT_INDEX_URL)
      ]);
      const experimentIndex = await fetchJson(status.atlas_index);
      const experiments = await Promise.all(
        experimentIndex.experiments.map((item) => fetchJson(item.data_url))
      );
      state.status = status;
      state.project = project;
      state.documentIndex = documentIndex;
      state.experimentIndex = experimentIndex;
      state.experiments = experiments.sort((a, b) => a.sequence - b.sequence);

      hydrateStatus(status);
      renderTriptych(status);
      renderFeaturedPreviews(status);
      renderCurrentPreview(status);
      renderRecords();
      Object.keys(state.filters).forEach(fillFilterOptions);

      const requested = new URL(window.location.href).searchParams.get('experiment');
      const initial = state.experiments.some((item) => item.id === requested)
        ? requested
        : status.current_experiment;
      state.selectedId = initial;
      renderAtlas();
      selectExperiment(initial);
    } catch (error) {
      showFailure(error);
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
