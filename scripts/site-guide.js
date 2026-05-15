// site-guide.js — 初次进入网站指引公告

(function() {
  const guide = document.getElementById('site-guide');
  const closeBtn = document.getElementById('site-guide-close');
  const startBtn = document.getElementById('site-guide-start');
  const newsLink = document.getElementById('site-guide-news');
  const storageKey = 'janet_site_guide_seen_v1';

  if (!guide) return;

  function rememberSeen() {
    try {
      window.localStorage.setItem(storageKey, 'true');
    } catch (error) {
      // localStorage 可能在隐私模式下不可用，关闭公告仍然应该可用。
    }
  }

  function closeGuide() {
    rememberSeen();
    guide.hidden = true;
    document.body.classList.remove('site-guide-open');
  }

  function openGuide() {
    guide.hidden = false;
    document.body.classList.add('site-guide-open');
    if (closeBtn) closeBtn.focus({ preventScroll: true });
  }

  let hasSeen = false;
  try {
    hasSeen = window.localStorage.getItem(storageKey) === 'true';
  } catch (error) {
    hasSeen = false;
  }

  if (!hasSeen && !window.location.hash) {
    window.setTimeout(openGuide, 450);
  }

  if (closeBtn) closeBtn.addEventListener('click', closeGuide);
  if (startBtn) startBtn.addEventListener('click', closeGuide);
  if (newsLink) newsLink.addEventListener('click', closeGuide);

  guide.addEventListener('click', (event) => {
    if (event.target === guide) closeGuide();
  });

  window.addEventListener('keydown', (event) => {
    if (!guide.hidden && event.key === 'Escape') {
      closeGuide();
    }
  });
})();
