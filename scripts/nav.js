// nav.js — 导航栏显隐 + 回到顶部 + 移动端菜单

(function() {
  const nav = document.getElementById('nav');
  const mobileToggle = document.querySelector('[data-potato-menu-trigger]') || document.getElementById('mobile-nav-toggle');
  const mobileMenu = document.getElementById('mobile-nav-menu');
  const navLinks = document.querySelector('.nav-links');
  let lastScrollY = 0;
  let ticking = false;
  let mobileOpen = false;
  const hideThreshold = 100;
  const revealDelta = 6;

  // ── 移动端菜单 ───────────────────────────────────────────
  if (mobileToggle) {
    if (mobileMenu && mobileMenu.id) {
      mobileToggle.setAttribute('aria-controls', mobileMenu.id);
    }
    mobileToggle.setAttribute('aria-expanded', 'false');
    if (mobileMenu) mobileMenu.setAttribute('aria-hidden', 'true');

    function setMobileMenuOpen(nextOpen) {
      mobileOpen = nextOpen;
      mobileToggle.classList.toggle('active', mobileOpen);
      mobileToggle.classList.toggle('is-open', mobileOpen);
      mobileToggle.setAttribute('aria-expanded', String(mobileOpen));
      mobileToggle.setAttribute('aria-label', mobileOpen ? '关闭站点菜单' : '打开站点菜单');

      if (mobileOpen) {
        if (mobileMenu) {
          mobileMenu.classList.add('open');
          mobileMenu.setAttribute('aria-hidden', 'false');
        }
      } else {
        if (mobileMenu) {
          mobileMenu.classList.remove('open');
          mobileMenu.setAttribute('aria-hidden', 'true');
        }
      }

      document.dispatchEvent(new CustomEvent('janet:site-menu-changed', {
        detail: { open: mobileOpen }
      }));
    }

    mobileToggle.addEventListener('click', () => {
      setMobileMenuOpen(!mobileOpen);
    });

    // 点击链接后关闭菜单
    if (mobileMenu) {
      mobileMenu.querySelectorAll('a').forEach(link => {
        link.addEventListener('click', () => {
          if (mobileOpen) setMobileMenuOpen(false);
        });
      });
    }

    window.addEventListener('resize', () => {
      if (window.innerWidth > 860 && mobileOpen) {
        setMobileMenuOpen(false);
      }
    });

    document.addEventListener('janet:close-site-menu', () => {
      if (mobileOpen) setMobileMenuOpen(false);
    });

    document.addEventListener('click', (event) => {
      if (!mobileOpen) return;
      if (mobileToggle.contains(event.target)) return;
      if (mobileMenu && mobileMenu.contains(event.target)) return;
      setMobileMenuOpen(false);
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && mobileOpen) setMobileMenuOpen(false);
    });

    window.JanetNav = {
      openSiteMenu: () => setMobileMenuOpen(true),
      closeSiteMenu: () => setMobileMenuOpen(false),
      toggleSiteMenu: () => setMobileMenuOpen(!mobileOpen)
    };
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
    backToTop.setAttribute('aria-label', '返回顶部');
    backToTop.setAttribute('title', '返回顶部');

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

    const darkBackToTopTargets = document.querySelectorAll('#contact, [data-theme="contact"]');
    if (darkBackToTopTargets.length && 'IntersectionObserver' in window) {
      const visibleDarkTargets = new Set();
      const darkObserver = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            visibleDarkTargets.add(entry.target);
          } else {
            visibleDarkTargets.delete(entry.target);
          }
        });
        backToTop.classList.toggle('is-on-dark', visibleDarkTargets.size > 0);
      }, { threshold: 0.18 });
      darkBackToTopTargets.forEach((target) => darkObserver.observe(target));
    }
  }

  // ── 邮箱反爬拼接 ─────────────────────────────────────────
  document.querySelectorAll('[data-email-user][data-email-domain]').forEach(link => {
    const email = link.dataset.emailUser + '@' + link.dataset.emailDomain;
    link.href = 'mailto:' + email;
    link.textContent = email;
    link.setAttribute('aria-label', '发送邮件给 Janet');
  });

})();
