(function() {
  'use strict';

  const qs = (selector, parent = document) => parent.querySelector(selector);
  const qsa = (selector, parent = document) => Array.from(parent.querySelectorAll(selector));
  const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function initScrollChapters() {
    const sections = qsa('[data-theme]');
    if (!sections.length) return;

    document.body.dataset.theme = sections[0].dataset.theme || 'hero';

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting && entry.target.dataset.theme) {
          document.body.dataset.theme = entry.target.dataset.theme;
        }
      });
    }, { threshold: 0.32, rootMargin: '-8% 0px -48% 0px' });

    sections.forEach((section) => observer.observe(section));
  }

  function wrapTextNode(node, counter) {
    const parts = String(node.nodeValue || '').split(/(\s+)/);
    const fragment = document.createDocumentFragment();

    parts.forEach((part) => {
      if (!part) return;
      if (/^\s+$/.test(part)) {
        fragment.appendChild(document.createTextNode(part));
        return;
      }
      const span = document.createElement('span');
      span.className = 'word';
      span.style.setProperty('--i', counter.value);
      span.textContent = part;
      counter.value += 1;
      fragment.appendChild(span);
    });

    node.parentNode.replaceChild(fragment, node);
  }

  function wrapWords(element) {
    const counter = { value: 0 };
    const walk = (node) => {
      Array.from(node.childNodes).forEach((child) => {
        if (child.nodeType === Node.TEXT_NODE) {
          if (child.nodeValue && child.nodeValue.trim()) wrapTextNode(child, counter);
          return;
        }
        if (child.nodeType === Node.ELEMENT_NODE && !child.classList.contains('word')) {
          walk(child);
        }
      });
    };
    walk(element);
  }

  function initWordReveal() {
    const targets = qsa('[data-reveal="words"]');
    if (!targets.length) return;
    if (reduceMotion()) {
      targets.forEach((target) => target.classList.add('on'));
      return;
    }

    targets.forEach(wrapWords);

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        qsa('.word', entry.target).forEach((word) => word.classList.add('on'));
        observer.unobserve(entry.target);
      });
    }, { threshold: 0.18 });

    targets.forEach((target) => observer.observe(target));
  }

  function initReveal() {
    const targets = qsa('.rv-fade, .rv-scale, .rv-left, .rv-right, .reveal');
    if (!targets.length) return;
    if (reduceMotion()) {
      targets.forEach((target) => target.classList.add('on'));
      return;
    }

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('on');
        observer.unobserve(entry.target);
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -48px 0px' });

    targets.forEach((target) => observer.observe(target));
  }

  function initNavHighlight() {
    const sections = qsa('section[id]');
    const links = qsa('.nav-links a[href^="#"], .mobile-nav-menu a[href^="#"]');
    if (!sections.length || !links.length) return;

    const byId = new Map();
    links.forEach((link) => {
      const id = link.getAttribute('href').slice(1);
      if (!byId.has(id)) byId.set(id, []);
      byId.get(id).push(link);
    });

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        links.forEach((link) => link.classList.remove('nav-active'));
        (byId.get(entry.target.id) || []).forEach((link) => link.classList.add('nav-active'));
      });
    }, { threshold: 0.38 });

    sections.forEach((section) => observer.observe(section));
  }

  function init() {
    initScrollChapters();
    initWordReveal();
    initReveal();
    initNavHighlight();
  }

  window.JanetMotionRefresh = function() {
    initWordReveal();
    initReveal();
  };

  document.addEventListener('janet:content-rendered', window.JanetMotionRefresh);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
