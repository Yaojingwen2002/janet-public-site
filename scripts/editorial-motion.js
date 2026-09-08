(function () {
  'use strict';

  const selector = [
    '[data-works-card]',
    '.works-overview-card',
    '.codex-cover-panel',
    '.codex-carousel-card',
    '.news-edition-card',
    '.briefing-output-page .card',
    '.briefing-output-page .mini-card',
    '.briefing-output-page .tool-card',
    '.project-work-card',
    '.work-document-card',
    '.work-gallery-media',
    '.lab-zone-card',
    '.handbook-card',
    '.shuttle-work-card'
  ].join(',');

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');
  const states = new WeakMap();
  const movingStates = new Set();
  let frame = 0;
  let lastTime = 0;

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function stateFor(element) {
    if (states.has(element)) return states.get(element);
    const state = {
      element,
      currentX: 0,
      currentY: 0,
      targetX: 0,
      targetY: 0,
      currentLift: 0,
      targetLift: 0,
      active: false
    };
    states.set(element, state);
    element.classList.add('editorial-motion');
    return state;
  }

  function render(time) {
    frame = 0;
    const delta = lastTime ? Math.min(time - lastTime, 48) : 16.667;
    lastTime = time;
    const follow = 1 - Math.pow(.82, delta / 16.667);

    movingStates.forEach((state) => {
      const element = state.element;
      if (!element.isConnected) { movingStates.delete(state); return; }

      state.currentX += (state.targetX - state.currentX) * follow;
      state.currentY += (state.targetY - state.currentY) * follow;
      state.currentLift += (state.targetLift - state.currentLift) * follow;

      element.style.setProperty('--editorial-tilt-x', `${state.currentY.toFixed(3)}deg`);
      element.style.setProperty('--editorial-tilt-y', `${state.currentX.toFixed(3)}deg`);
      element.style.setProperty('--editorial-lift', `${state.currentLift.toFixed(3)}px`);

      if (Math.abs(state.targetX - state.currentX) < .01 &&
          Math.abs(state.targetY - state.currentY) < .01 &&
          Math.abs(state.targetLift - state.currentLift) < .01) movingStates.delete(state);
    });

    if (movingStates.size && !document.hidden) frame = window.requestAnimationFrame(render);
    else lastTime = 0;
  }

  function requestRender() {
    if (!frame && !document.hidden) frame = window.requestAnimationFrame(render);
  }

  function eligible(event) {
    return finePointer.matches && !reducedMotion.matches && event.pointerType !== 'touch';
  }

  document.addEventListener('pointermove', (event) => {
    if (!eligible(event)) return;
    const element = event.target.closest(selector);
    if (!element) return;

    const bounds = element.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    const x = clamp((event.clientX - bounds.left) / bounds.width, 0, 1);
    const y = clamp((event.clientY - bounds.top) / bounds.height, 0, 1);
    const state = stateFor(element);

    state.targetX = (x - 0.5) * 5.8;
    state.targetY = (0.5 - y) * 4.6;
    state.targetLift = -7;
    state.active = true;
    movingStates.add(state);
    element.classList.add('is-editorial-hover');
    element.style.setProperty('--editorial-pointer-x', `${(x * 100).toFixed(2)}%`);
    element.style.setProperty('--editorial-pointer-y', `${(y * 100).toFixed(2)}%`);
    requestRender();
  }, { passive: true });

  document.addEventListener('pointerout', (event) => {
    const element = event.target.closest(selector);
    if (!element || element.contains(event.relatedTarget)) return;
    const state = stateFor(element);
    state.targetX = 0;
    state.targetY = 0;
    state.targetLift = 0;
    state.active = false;
    movingStates.add(state);
    element.classList.remove('is-editorial-hover');
    requestRender();
  }, { passive: true });

  function register() {
    if (!finePointer.matches || reducedMotion.matches) return;
    document.querySelectorAll(selector).forEach(stateFor);
  }

  function resetMotion() {
    cancelAnimationFrame(frame);
    frame = 0;
    lastTime = 0;
    document.querySelectorAll('.editorial-motion').forEach(element => {
      const state = states.get(element);
      if (state) Object.assign(state, { currentX: 0, currentY: 0, targetX: 0, targetY: 0, currentLift: 0, targetLift: 0, active: false });
      element.classList.remove('is-editorial-hover');
      ['--editorial-tilt-x', '--editorial-tilt-y', '--editorial-lift'].forEach(key => element.style.removeProperty(key));
    });
    movingStates.clear();
  }
  document.addEventListener('visibilitychange', () => { if (document.hidden) resetMotion(); });
  reducedMotion.addEventListener('change', resetMotion);

  document.addEventListener('janet:content-rendered', register);
  document.addEventListener('DOMContentLoaded', register);
  register();
})();
