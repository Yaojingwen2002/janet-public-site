(function() {
  'use strict';

  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');
  if (!finePointer.matches) return;

  function init() {
    if (!document.body || document.querySelector('.janet-cursor')) return;

    const cursor = document.createElement('div');
    cursor.className = 'janet-cursor';
    cursor.setAttribute('aria-hidden', 'true');
    cursor.innerHTML = '<span class="janet-cursor__ring"></span><span class="janet-cursor__core"></span><span class="janet-cursor__mark">+</span>';
    document.body.appendChild(cursor);
    document.body.classList.add('signal-cursor-enabled');

    const mark = cursor.querySelector('.janet-cursor__mark');
    const nativeSelector = 'input, textarea, select, [contenteditable="true"]';
    const linkSelector = 'a, button, summary, label, [role="button"], [data-cursor="link"]';
    const dragSelector = '.signal-globe-stage, #signal-globe-canvas, [data-cursor="drag"]';
    let targetX = -80;
    let targetY = -80;
    let currentX = -80;
    let currentY = -80;
    let hasPosition = false;
    let dragging = false;

    function isBusy(target) {
      return document.body.classList.contains('is-busy') ||
        document.body.getAttribute('aria-busy') === 'true' ||
        Boolean(target && target.closest('[aria-busy="true"], button:disabled, [data-loading="true"]'));
    }

    function setState(target) {
      const nativeTarget = target && target.closest(nativeSelector);
      const linkTarget = target && target.closest(linkSelector);
      const dragTarget = target && target.closest(dragSelector);
      const waiting = isBusy(target);

      cursor.classList.toggle('is-native', Boolean(nativeTarget));
      cursor.classList.toggle('is-wait', waiting);
      cursor.classList.toggle('is-link', !waiting && !nativeTarget && Boolean(linkTarget));
      cursor.classList.toggle('is-drag', !waiting && !nativeTarget && !linkTarget && Boolean(dragTarget));
      cursor.classList.toggle('is-dragging', dragging);

      if (waiting) mark.textContent = '';
      else if (dragging || (dragTarget && !linkTarget)) mark.textContent = '<>';
      else if (linkTarget) mark.textContent = '+';
      else mark.textContent = '';
    }

    function move(event) {
      if (event.pointerType && event.pointerType !== 'mouse' && event.pointerType !== 'pen') return;
      targetX = event.clientX;
      targetY = event.clientY;
      if (!hasPosition) {
        currentX = targetX;
        currentY = targetY;
        hasPosition = true;
      }
      cursor.classList.add('is-visible');
      setState(event.target);
    }

    function render() {
      currentX += (targetX - currentX) * .34;
      currentY += (targetY - currentY) * .34;
      cursor.style.transform = 'translate3d(' + currentX + 'px,' + currentY + 'px,0) translate(-50%,-50%)';
      window.requestAnimationFrame(render);
    }

    document.addEventListener('pointermove', move, { passive: true });
    document.addEventListener('pointerover', (event) => setState(event.target), { passive: true });
    document.addEventListener('pointerdown', (event) => {
      if (event.pointerType && event.pointerType !== 'mouse' && event.pointerType !== 'pen') return;
      cursor.classList.add('is-pressed');
      dragging = Boolean(event.target.closest(dragSelector) && !event.target.closest(linkSelector));
      setState(event.target);
    }, { passive: true });
    document.addEventListener('pointerup', (event) => {
      cursor.classList.remove('is-pressed');
      dragging = false;
      setState(event.target);
    }, { passive: true });
    document.addEventListener('pointercancel', () => {
      cursor.classList.remove('is-pressed', 'is-dragging');
      dragging = false;
    }, { passive: true });
    document.documentElement.addEventListener('mouseleave', () => cursor.classList.remove('is-visible'));
    window.addEventListener('blur', () => cursor.classList.remove('is-visible'));
    window.addEventListener('focus', () => cursor.classList.add('is-visible'));

    new MutationObserver(() => setState(document.elementFromPoint(targetX, targetY))).observe(document.body, {
      attributes: true,
      subtree: true,
      attributeFilter: ['aria-busy', 'disabled', 'data-loading', 'class']
    });

    window.requestAnimationFrame(render);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
