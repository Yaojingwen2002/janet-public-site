(function() {
  'use strict';

  const DEFAULT_READER_NAME = '读者';
  const STATIC_GREETING_RE = /^\s*Janet\s*早[。.!！]?\s*/i;

  function cleanStaticGreeting(container) {
    const scope = container.querySelector('.intro-copy') || container;
    const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
    let node = walker.nextNode();
    while (node) {
      if (String(node.nodeValue || '').trim()) {
        node.nodeValue = String(node.nodeValue || '').replace(STATIC_GREETING_RE, '');
        return;
      }
      node = walker.nextNode();
    }
  }

  function ensureGreeting(container) {
    let name = container.querySelector('[data-reader-greeting]');
    if (name) return name;

    const line = document.createElement('p');
    line.className = 'reader-greeting-line';
    name = document.createElement('strong');
    name.dataset.readerGreeting = '';
    name.textContent = DEFAULT_READER_NAME;
    line.append(name, document.createTextNode('，早。'));
    container.insertBefore(line, container.firstChild);
    return name;
  }

  function readerName(identity) {
    const value = identity && identity.displayName ? String(identity.displayName).trim() : '';
    return value || DEFAULT_READER_NAME;
  }

  function render(identity) {
    document.querySelectorAll('.intro-box').forEach((container) => {
      cleanStaticGreeting(container);
      const name = ensureGreeting(container);
      name.textContent = readerName(identity);
      container.dataset.readerMode = identity && identity.mode ? identity.mode : 'reader';
    });
  }

  function init() {
    const auth = window.JanetAuth;
    render(auth && auth.getIdentity ? auth.getIdentity() : null);

    document.addEventListener('janet:auth-changed', (event) => {
      render(event.detail && event.detail.identity ? event.detail.identity : null);
    });

    if (auth && auth.onChange) auth.onChange(render);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
