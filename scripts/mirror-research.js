(function() {
  'use strict';

  const STATUS_URL = 'data/mirror-plan-status.json';
  const PROJECT_URL = 'data/works/projects/mirror-plan.json';
  const INDEX_URL = 'data/works/documents/mirror-plan/index.json';

  const selectors = {
    phase: '[data-mirror-phase]',
    phaseLabel: '[data-mirror-phase-label]',
    current: '[data-mirror-current]',
    completed: '[data-mirror-completed]',
    planned: '[data-mirror-planned]',
    publicFrames: '[data-mirror-public-frames]',
    generated: '[data-mirror-generated]',
    documents: '[data-mirror-documents]',
    updated: '[data-mirror-updated]',
    next: '[data-mirror-next]',
    boundary: '[data-mirror-boundary]'
  };

  function setText(selector, value) {
    document.querySelectorAll(selector).forEach((element) => {
      element.textContent = String(value);
    });
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
    setText(selectors.phase, status.phase_id);
    setText(selectors.phaseLabel, status.phase_label);
    setText(selectors.current, status.current_experiment);
    setText(selectors.completed, status.completed_experiments);
    setText(selectors.planned, status.planned_atlas_frames);
    setText(selectors.publicFrames, status.public_atlas_frames);
    setText(selectors.generated, status.generated_images);
    setText(selectors.documents, status.documents);
    setText(selectors.updated, formatDate(status.last_research_update));
    setText(selectors.next, status.next_step);
    setText(selectors.boundary, status.public_boundary);
    document.querySelectorAll('[data-mirror-status-root]').forEach((root) => {
      root.dataset.status = 'ready';
    });
  }

  function renderPreview(status) {
    const images = Array.isArray(status.preview_images) ? status.preview_images : [];
    const activeImage = document.querySelector('[data-mirror-preview-main]');
    const controls = document.querySelector('[data-mirror-preview-controls]');
    if (!activeImage || !controls || !images.length) return;

    const activate = (image, button) => {
      activeImage.src = image.src;
      activeImage.alt = image.alt;
      controls.querySelectorAll('button').forEach((control) => {
        const current = control === button;
        control.classList.toggle('is-active', current);
        control.setAttribute('aria-pressed', String(current));
      });
    };

    const fragment = document.createDocumentFragment();
    images.forEach((image, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'mirror-preview-tab';
      button.textContent = image.label;
      button.setAttribute('aria-pressed', String(index === 1 || (images.length === 1 && index === 0)));
      button.addEventListener('click', () => activate(image, button));
      if (index === 1 || (images.length === 1 && index === 0)) button.classList.add('is-active');
      fragment.append(button);
    });
    controls.replaceChildren(fragment);
    const initialIndex = images[1] ? 1 : 0;
    activeImage.src = images[initialIndex].src;
    activeImage.alt = images[initialIndex].alt;

    document.querySelectorAll('[data-mirror-triptych]').forEach((triptych) => {
      const tiles = images.map((image) => {
        const figure = document.createElement('figure');
        const picture = document.createElement('img');
        const caption = document.createElement('figcaption');
        picture.src = image.src;
        picture.alt = image.alt;
        picture.loading = 'eager';
        caption.textContent = image.label;
        figure.append(picture, caption);
        return figure;
      });
      triptych.replaceChildren(...tiles);
    });

    const compareBefore = document.querySelector('[data-mirror-compare-before]');
    const compareAfter = document.querySelector('[data-mirror-compare-after]');
    if (compareBefore && images[0]) {
      compareBefore.src = images[0].src;
      compareBefore.alt = images[0].alt;
    }
    if (compareAfter && images[1]) {
      compareAfter.src = images[1].src;
      compareAfter.alt = images[1].alt;
    }
  }

  function renderAtlas(project) {
    document.querySelectorAll('[data-mirror-atlas]').forEach((atlas) => {
      const works = Array.isArray(project.works) ? project.works : [];
      const fragment = document.createDocumentFragment();
      works.forEach((work) => {
        const link = document.createElement('a');
        link.className = 'mirror-atlas-item';
        link.href = work.url || 'mirror-plan.html';

        const media = document.createElement('span');
        media.className = 'mirror-atlas-item__media';
        if (work.thumbnail) {
          const image = document.createElement('img');
          image.src = work.thumbnail;
          image.alt = '';
          image.loading = 'lazy';
          media.append(image);
        } else {
          const number = document.createElement('span');
          number.textContent = work.display_number || '—';
          number.setAttribute('aria-hidden', 'true');
          media.append(number);
        }

        const meta = document.createElement('span');
        meta.className = 'mirror-atlas-item__meta';
        const code = document.createElement('span');
        code.textContent = work.title?.split(' ')[0] || work.id;
        const title = document.createElement('strong');
        title.textContent = work.title?.replace(/^[^ ]+ /, '') || '未命名实验';
        const summary = document.createElement('small');
        summary.textContent = work.summary || '';
        meta.append(code, title, summary);
        link.append(media, meta);
        fragment.append(link);
      });
      atlas.replaceChildren(fragment);
    });
  }

  function renderRecords(index, project) {
    const worksBySequence = new Map(
      (Array.isArray(project.works) ? project.works : []).map((work) => [String(work.display_number), work])
    );
    document.querySelectorAll('[data-mirror-records]').forEach((records) => {
      const fragment = document.createDocumentFragment();
      (Array.isArray(index.documents) ? index.documents : []).forEach((documentItem) => {
        const work = worksBySequence.get(String(documentItem.number || documentItem.id));
        const link = document.createElement('a');
        link.className = 'mirror-record-link';
        link.href = `mirror-plan.html?doc=${encodeURIComponent(documentItem.id)}`;

        const number = document.createElement('span');
        number.textContent = documentItem.number || documentItem.id;
        const copy = document.createElement('span');
        const code = document.createElement('small');
        const title = document.createElement('strong');
        const summary = document.createElement('em');
        code.textContent = documentItem.code || '';
        title.textContent = documentItem.title || '实验记录';
        summary.textContent = work?.summary || documentItem.objective || '';
        copy.append(code, title, summary);
        link.append(number, copy);
        fragment.append(link);
      });
      records.replaceChildren(fragment);
    });
  }

  function bindCompareRange() {
    document.querySelectorAll('[data-mirror-compare-range]').forEach((range) => {
      const stage = range.closest('[data-mirror-compare]');
      if (!stage) return;
      const update = () => {
        const value = Number(range.value);
        stage.style.setProperty('--mirror-compare-position', `${value}%`);
        range.setAttribute('aria-valuetext', `显示 B 版 ${value}%`);
      };
      range.addEventListener('input', update);
      update();
    });
  }

  function showFailure(error) {
    document.querySelectorAll('[data-mirror-status-root]').forEach((root) => {
      root.dataset.status = 'error';
    });
    document.querySelectorAll('[data-mirror-status-error]').forEach((message) => {
      message.hidden = false;
    });
    console.warn('[mirror-research] shared status unavailable:', error);
  }

  async function init() {
    if (!document.querySelector('[data-mirror-status-root]')) return;
    bindCompareRange();
    try {
      const [status, project, index] = await Promise.all([
        fetchJson(STATUS_URL),
        fetchJson(PROJECT_URL),
        fetchJson(INDEX_URL)
      ]);
      hydrateStatus(status);
      renderPreview(status);
      renderAtlas(project);
      renderRecords(index, project);
    } catch (error) {
      showFailure(error);
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
