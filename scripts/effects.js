// effects.js — 微交互 & 滚动动画

(function() {
  const prefersReducedMotion = window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  // ── 鼠标跟随光晕 ───────────────────────────────────────────
  function initMouseGlow() {
    document.querySelectorAll('.news-card, .video-card, .portfolio-item').forEach(card => {
      card.addEventListener('mousemove', (e) => {
        const rect = card.getBoundingClientRect();
        const x = ((e.clientX - rect.left) / rect.width) * 100;
        const y = ((e.clientY - rect.top) / rect.height) * 100;
        card.style.setProperty('--mouse-x', x + '%');
        card.style.setProperty('--mouse-y', y + '%');
      });
    });
  }

  // ── 滚动进入动画 ───────────────────────────────────────────
  function initReveal() {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.1, rootMargin: '0px 0px -50px 0px' });

    document.querySelectorAll('.reveal').forEach(el => observer.observe(el));
  }

  // ── 平滑锚点滚动 ───────────────────────────────────────────
  function initSmoothScroll() {
    document.querySelectorAll('a[href^="#"]').forEach(link => {
      link.addEventListener('click', (e) => {
        const href = link.getAttribute('href');
        const target = document.querySelector(href);
        if (target) {
          e.preventDefault();
          target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      });
    });

    // 跨页锚点跳转补偿（sticky nav 会挡住锚点）
    const hash = window.location.hash;
    if (hash) {
      setTimeout(() => {
        const target = document.querySelector(hash);
        if (target) {
          const y = target.getBoundingClientRect().top + window.scrollY - 80;
          window.scrollTo({ top: y, behavior: 'smooth' });
        }
      }, 100);
    }
  }

  // ── 按钮涟漪效果 ───────────────────────────────────────────
  function initButtonRipple() {
    document.querySelectorAll('.btn-green').forEach(btn => {
      btn.addEventListener('click', function(e) {
        const ripple = document.createElement('span');
        const rect = this.getBoundingClientRect();
        const size = Math.max(rect.width, rect.height);
        const x = e.clientX - rect.left - size / 2;
        const y = e.clientY - rect.top - size / 2;

        ripple.style.cssText = `
          position: absolute;
          width: ${size}px;
          height: ${size}px;
          left: ${x}px;
          top: ${y}px;
          background: rgba(255,255,255,0.3);
          border-radius: 50%;
          transform: scale(0);
          animation: ripple 600ms ease-out forwards;
          pointer-events: none;
        `;

        this.appendChild(ripple);
        setTimeout(() => ripple.remove(), 600);
      });
    });

    // 注入涟漪动画
    if (!document.getElementById('ripple-style')) {
      const style = document.createElement('style');
      style.id = 'ripple-style';
      style.textContent = `
        @keyframes ripple {
          to { transform: scale(2.5); opacity: 0; }
        }
      `;
      document.head.appendChild(style);
    }
  }

  // ── Hero 渐变动画性能优化 ───────────────────────────────────
  function initGradientPause() {
    const accent = document.querySelector('.hero h1 .accent');
    if (!accent) return;
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          accent.style.animationPlayState = 'running';
        } else {
          accent.style.animationPlayState = 'paused';
        }
      });
    }, { threshold: 0.1 });
    observer.observe(accent);
  }

  // ── Hero 视差滚动 ───────────────────────────────────────────
  function initHeroParallax() {
    const hero = document.getElementById('hero');
    const bg = hero ? hero.querySelector('.hero-bg') : null;
    if (!hero || !bg) return;

    let ticking = false;
    function updateParallax() {
      const rect = hero.getBoundingClientRect();
      const heroH = hero.offsetHeight;
      const scrolled = -rect.top;
      const progress = Math.max(0, Math.min(1, scrolled / heroH));

      // 背景层以较慢速度移动（视差深度）
      bg.style.transform = `translateY(${scrolled * 0.35}px)`;
      bg.style.opacity = 0.4 * (1 - progress * 1.5);

      // 内容层以稍慢速度上移 + 淡出
      const content = hero.querySelector('.container');
      if (content) {
        content.style.transform = `translateY(${scrolled * 0.15}px)`;
        content.style.opacity = 1 - progress * 1.2;
      }

      ticking = false;
    }

    window.addEventListener('scroll', () => {
      if (!ticking) {
        requestAnimationFrame(updateParallax);
        ticking = true;
      }
    });
  }

  // ── 初始化 ─────────────────────────────────────────────────
  initSmoothScroll();

  if (prefersReducedMotion) {
    document.querySelectorAll('.reveal').forEach(el => el.classList.add('visible'));
    return;
  }

  initMouseGlow();
  initReveal();
  initButtonRipple();
  initGradientPause();
  initHeroParallax();
})();
