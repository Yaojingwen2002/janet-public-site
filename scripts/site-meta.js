(function() {
  const BASE_URL = 'https://Yaojingwen2002.github.io/janet-public-site/';
  const META = {
    'index.html': {
      title: 'Janet · 作品库与 AI 晨报',
      description: 'Janet 的公开作品库、AI 短片项目记录与每日 AI 晨报。',
      image: 'assets/og/janet-og.svg'
    },
    'portfolio.html': {
      title: 'Janet 作品库',
      description: '查看 Janet 的项目合集、短片作品和制作文档。',
      image: 'assets/og/works-og.svg'
    },
    'project-detail.html': {
      title: 'Janet 作品详情',
      description: '查看 Janet 单个作品的制作流程和相关文档。',
      image: 'assets/og/works-og.svg'
    },
    'news.html': {
      title: 'Janet 快车箱 · 晨报归档',
      description: '自动抓取公开 AI 新闻源生成的 Janet 每日晨报归档。',
      image: 'assets/og/news-og.svg'
    },
    'news-detail.html': {
      title: 'Janet 快车箱 · 新闻详情',
      description: '查看单条 AI 新闻的来源、判断和后续观察。',
      image: 'assets/og/news-og.svg'
    },
    'news-status.html': {
      title: 'Janet 快车箱 · 自动化状态',
      description: '查看 Janet 每日 AI 晨报自动抓取、生成和部署状态。',
      image: 'assets/og/news-og.svg'
    },
    '404.html': {
      title: '这节车厢没接上 · Janet',
      description: '这个链接没有找到，可能是作品移动了，或者晨报已经换站台。',
      image: 'assets/og/janet-og.svg'
    }
  };

  window.JANET_SITE_META = { baseUrl: BASE_URL, pages: META };
})();

