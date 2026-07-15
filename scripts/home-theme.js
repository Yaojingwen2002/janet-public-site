(function() {
  'use strict';

  const body = document.body;
  const hero = document.getElementById('hero');
  const contact = document.getElementById('contact');
  const worksGrid = document.getElementById('works-project-grid');
  const chapters = Array.from(document.querySelectorAll('section[data-theme]'));

  if (!body.classList.contains('home-experiment') || !hero) return;

  const root = document.documentElement;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const observedCards = new WeakSet();
  let framePending = false;

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function syncScrollState() {
    framePending = false;
    const scrollY = window.scrollY;
    const transitionStart = 140;
    const transitionEnd = Math.max(520, hero.offsetHeight - 100);
    const progress = clamp((scrollY - transitionStart) / (transitionEnd - transitionStart), 0, 1);
    const contactVisible = contact && contact.getBoundingClientRect().top < window.innerHeight * .72;
    const chapterProbe = window.innerHeight * .36;
    const activeChapter = chapters.find((chapter) => {
      const bounds = chapter.getBoundingClientRect();
      return bounds.top <= chapterProbe && bounds.bottom > chapterProbe;
    });

    root.style.setProperty('--home-field-progress', progress.toFixed(3));
    if (activeChapter?.dataset.theme) body.dataset.theme = activeChapter.dataset.theme;
    body.classList.toggle('is-past-globe', scrollY > 300);
    body.classList.toggle('is-contact-field', Boolean(contactVisible));
  }

  function requestScrollSync() {
    if (framePending) return;
    framePending = true;
    window.requestAnimationFrame(syncScrollState);
  }

  function observeWorksCards() {
    if (!worksGrid || !('IntersectionObserver' in window)) return;
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-in-view');
        observer.unobserve(entry.target);
      });
    }, { threshold: .18, rootMargin: '0px 0px -48px 0px' });

    worksGrid.querySelectorAll('[data-works-card]').forEach((card) => {
      if (observedCards.has(card)) return;
      observedCards.add(card);
      observer.observe(card);
    });
  }

  function updatePointerSurface(event) {
    if (reducedMotion.matches || event.pointerType === 'touch') return;
    const surface = event.target.closest('.btn, .contact-item, [data-works-card]');
    if (!surface) return;
    const bounds = surface.getBoundingClientRect();
    const x = clamp((event.clientX - bounds.left) / bounds.width, 0, 1);
    const y = clamp((event.clientY - bounds.top) / bounds.height, 0, 1);
    surface.style.setProperty('--pointer-x', `${(x * 100).toFixed(1)}%`);
    surface.style.setProperty('--pointer-y', `${(y * 100).toFixed(1)}%`);

    if (surface.matches('[data-works-card]')) {
      surface.style.setProperty('--works-tilt-x', `${((.5 - y) * 2.2).toFixed(2)}deg`);
      surface.style.setProperty('--works-tilt-y', `${((x - .5) * 2.8).toFixed(2)}deg`);
    }
  }

  function resetPointerSurface(event) {
    const surface = event.target.closest('[data-works-card]');
    if (!surface || surface.contains(event.relatedTarget)) return;
    surface.style.setProperty('--works-tilt-x', '0deg');
    surface.style.setProperty('--works-tilt-y', '0deg');
  }

  window.addEventListener('scroll', requestScrollSync, { passive: true });
  window.addEventListener('resize', requestScrollSync, { passive: true });
  document.addEventListener('pointermove', updatePointerSurface, { passive: true });
  document.addEventListener('pointerout', resetPointerSurface, { passive: true });
  document.addEventListener('janet:content-rendered', observeWorksCards);

  if (worksGrid) {
    new MutationObserver(observeWorksCards).observe(worksGrid, { childList: true });
  }

  syncScrollState();
  observeWorksCards();
  body.classList.add('home-theme-ready');
})();
