(function() {
  const links = [
    { href: 'index.html', label: '首页', key: 'home' },
    { href: 'portfolio.html', label: '作品库', key: 'works' },
    { href: 'news.html', label: '晨报归档', key: 'news' },
    { href: 'news-status.html', label: '自动化状态', key: 'status' }
  ];

  function currentKey() {
    const name = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
    if (name === '' || name === 'index.html') return 'home';
    if (name === 'portfolio.html' || name === 'project-detail.html') return 'works';
    if (name === 'news.html' || name === 'news-detail.html') return 'news';
    if (name === 'news-status.html') return 'status';
    return '';
  }

  function buildNav() {
    if (document.querySelector('.janet-site-nav')) return;
    const active = currentKey();
    const nav = document.createElement('nav');
    nav.className = 'janet-site-nav';
    nav.setAttribute('aria-label', 'Janet 全站导航');
    nav.innerHTML = '<a class="janet-site-brand" href="index.html" aria-label="Janet 首页">' +
      '<img src="assets/icons/logo-mark.svg" alt="" width="24" height="24">' +
      '<span>Janet</span></a>' +
      '<div class="janet-site-links">' + links.map((link) => {
        const selected = link.key === active;
        return '<a href="' + link.href + '" class="' + (selected ? 'active' : '') + '" ' +
          (selected ? 'aria-current="page"' : '') + '>' + link.label + '</a>';
      }).join('') + '</div>';
    document.body.insertBefore(nav, document.body.firstChild);
    document.body.classList.add('has-janet-site-nav');
  }

  function buildFooter() {
    if (document.querySelector('.janet-site-footer')) return;
    const footer = document.createElement('footer');
    footer.className = 'janet-site-footer';
    footer.innerHTML = '<div><strong>Janet</strong><span>作品库、AI 晨报与创作档案</span></div>' +
      '<div class="janet-site-footer-links">' +
      '<a href="portfolio.html">作品库</a>' +
      '<a href="news.html">晨报归档</a>' +
      '<a href="news-status.html">运行状态</a>' +
      '</div>';
    document.body.appendChild(footer);
  }

  document.addEventListener('DOMContentLoaded', function() {
    buildNav();
    buildFooter();
  });
})();

