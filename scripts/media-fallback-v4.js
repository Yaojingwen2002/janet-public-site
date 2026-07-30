(function () {
  'use strict';

  const observed = new WeakSet();
  const criticalSelectors = [
    '[fetchpriority="high"]',
    '[loading="eager"]',
    '.hero img',
    '.signal-globe-stage img',
    '.mirror-observatory-hero img',
    '.page-hero img',
    '.nav-brand img'
  ].join(',');

  function frameFor(image) {
    const picture = image.closest('picture');
    return picture ? picture.parentElement : image.parentElement;
  }

  function setState(image, state) {
    image.dataset.mediaState = state;
    const frame = frameFor(image);
    if (!frame) return;
    frame.classList.toggle('v4-media-loading', state === 'loading');
    frame.classList.toggle('v4-media-missing', state === 'error');
    if (state === 'error') {
      frame.dataset.mediaLabel = image.alt || '图片暂时无法加载';
    } else {
      delete frame.dataset.mediaLabel;
    }
  }

  function observe(image) {
    if (!(image instanceof HTMLImageElement) || observed.has(image)) return;
    const hasSource = Boolean(
      image.getAttribute('src')?.trim() ||
      image.getAttribute('srcset')?.trim()
    );
    if (!hasSource) return;
    observed.add(image);

    image.decoding = 'async';
    if (!image.matches(criticalSelectors) && !image.hasAttribute('loading')) {
      image.loading = 'lazy';
    }

    image.addEventListener('load', () => setState(image, 'ready'), { once: true });
    image.addEventListener('error', () => setState(image, 'error'), { once: true });

    if (image.complete) {
      setState(image, image.naturalWidth > 0 ? 'ready' : 'error');
    } else {
      setState(image, 'loading');
    }
  }

  function scan(root) {
    if (root instanceof HTMLImageElement) observe(root);
    root.querySelectorAll?.('img').forEach(observe);
  }

  scan(document);
  new MutationObserver((records) => {
    records.forEach((record) => {
      if (record.type === 'attributes') {
        observe(record.target);
        return;
      }
      record.addedNodes.forEach((node) => {
        if (node instanceof Element) scan(node);
      });
    });
  }).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['src', 'srcset'],
    childList: true,
    subtree: true
  });
})();
