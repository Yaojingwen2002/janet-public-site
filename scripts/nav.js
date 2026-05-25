// nav.js — 导航栏显隐 + 回到顶部 + 移动端菜单

(function() {
  const nav = document.getElementById('nav');
  const mobileToggle = document.getElementById('mobile-nav-toggle');
  const mobileMenu = document.getElementById('mobile-nav-menu');
  const navLinks = document.querySelector('.nav-links');
  let lastScrollY = 0;
  let ticking = false;
  let mobileOpen = false;
  const hideThreshold = 100;
  const revealDelta = 6;

  // ── 移动端菜单 ───────────────────────────────────────────
  if (mobileToggle) {
    mobileToggle.addEventListener('click', () => {
      mobileOpen = !mobileOpen;
      mobileToggle.textContent = mobileOpen ? '✕' : '☰';
      mobileToggle.classList.toggle('active', mobileOpen);

      if (mobileOpen) {
        document.body.style.overflow = 'hidden';
        if (mobileMenu) mobileMenu.classList.add('open');
      } else {
        document.body.style.overflow = '';
        if (mobileMenu) mobileMenu.classList.remove('open');
      }
    });

    // 点击链接后关闭菜单
    if (mobileMenu) {
      mobileMenu.querySelectorAll('a').forEach(link => {
        link.addEventListener('click', () => {
          if (mobileOpen) mobileToggle.click();
        });
      });
    }
  }

  // ── 导航栏显隐 ───────────────────────────────────────────
  function updateNav() {
    const currentY = window.scrollY;

    if (!nav) { ticking = false; return; }
    if (mobileOpen) { ticking = false; return; }

    if (currentY < hideThreshold) {
      nav.classList.remove('hidden');
      nav.classList.add('visible');
      nav.classList.remove('scrolled');
      lastScrollY = currentY;
      ticking = false;
      return;
    }

    const delta = currentY - lastScrollY;

    if (delta > revealDelta) {
      nav.classList.add('hidden');
      nav.classList.remove('visible');
    } else if (delta < -revealDelta) {
      nav.classList.remove('hidden');
      nav.classList.add('visible');
    }

    if (currentY > 50) {
      nav.classList.add('scrolled');
    } else {
      nav.classList.remove('scrolled');
    }

    lastScrollY = currentY;
    ticking = false;
  }

  window.addEventListener('scroll', () => {
    if (!ticking) {
      window.requestAnimationFrame(updateNav);
      ticking = true;
    }
  });

  window.addEventListener('mousemove', (event) => {
    if (event.clientY <= 72 && nav) {
      nav.classList.remove('hidden');
      nav.classList.add('visible', 'scrolled');
    }
  });

  window.addEventListener('keydown', (event) => {
    if (event.key === 'Tab' && nav) {
      nav.classList.remove('hidden');
      nav.classList.add('visible', 'scrolled');
    }
  });

  // ── 回到顶部 ─────────────────────────────────────────────
  const backToTop = document.getElementById('back-to-top');
  if (backToTop) {
    function updateBackToTop() {
      if (window.scrollY > 300) {
        backToTop.classList.add('visible');
      } else {
        backToTop.classList.remove('visible');
      }
    }

    window.addEventListener('scroll', () => {
      requestAnimationFrame(updateBackToTop);
    });

    backToTop.addEventListener('click', () => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }
})();
