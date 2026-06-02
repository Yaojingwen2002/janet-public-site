// news.js — Janet 快车箱首页晨报渲染
// Homepage uses Codex briefing runs as the daily source.

(function() {
  const today = new Date();
  let cachedManifest = null;
  const CODEX_RUNS_ABSOLUTE_PATH = '/Volumes/Janet/codex-briefing-system/runs';
  const CODEX_LOOKBACK_DAYS = 45;

  function todayShanghai() {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(new Date());
  }

  function formatShanghaiDate(date) {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(date);
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function safeExternalUrl(url) {
    if (!url || typeof url !== 'string') return '#';
    try {
      const parsed = new URL(url, window.location.href);
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') return parsed.href;
    } catch (e) {}
    return '#';
  }

  function renderNewsSkeleton(container) {
    if (!container) return;
    container.innerHTML =
      '<div class="news-loading-skeleton" aria-label="Janet 快车箱正在加载">' +
        '<div class="news-skeleton-cover">' +
          '<span></span><span></span><span></span>' +
        '</div>' +
        '<div class="news-skeleton-grid">' +
          '<span></span><span></span><span></span>' +
        '</div>' +
      '</div>';
  }

  async function loadJsonWithResolvedUrl(path) {
    try {
      const resp = await fetch(path, { cache: 'no-cache' });
      if (!resp.ok) return null;
      return {
        data: await resp.json(),
        resolvedUrl: resp.url || path,
        requestUrl: path
      };
    } catch (e) {
      return null;
    }
  }

  function uniq(values) {
    const seen = new Set();
    return values.filter(function(value) {
      if (!value || seen.has(value)) return false;
      seen.add(value);
      return true;
    });
  }

  function codexRunsBaseCandidates() {
    return uniq([
      window.JANET_CODEX_RUNS_BASE_URL,
      'data',
      CODEX_RUNS_ABSOLUTE_PATH,
      '/codex-briefing-system/runs',
      '../codex-briefing-system/runs',
      'file://' + CODEX_RUNS_ABSOLUTE_PATH
    ]);
  }

  function codexDateCandidates() {
    const dates = [];
    for (let i = 0; i < CODEX_LOOKBACK_DAYS; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      dates.push(formatShanghaiDate(d));
    }
    return dates;
  }

  async function loadCodexDailyBundle(entry) {
    for (const baseUrl of codexRunsBaseCandidates()) {
      const cleanBase = String(baseUrl).replace(/\/+$/, '');
      const requestPath = cleanBase + '/' + entry + '/content.json';
      const result = await loadJsonWithResolvedUrl(requestPath);
      if (result && result.data) {
        return {
          entry: entry,
          content: result.data,
          runBaseUrl: cleanBase,
          contentUrl: result.resolvedUrl || requestPath
        };
      }
    }
    return null;
  }

  function resolveCodexCoverSrc(bundle) {
    const content = bundle.content || {};
    const imagePath = content.cover && content.cover.image_path ? String(content.cover.image_path) : '';
    const date = content.date || bundle.entry;
    if (/^https?:\/\//.test(imagePath) || /^file:\/\//.test(imagePath)) return imagePath;
    if (imagePath === 'cover.png') return bundle.runBaseUrl + '/' + date + '/cover.png';
    if (imagePath === 'runs/' + date + '/cover.png') return bundle.runBaseUrl + '/' + date + '/cover.png';
    return bundle.contentUrl.replace(/content\.json(?:\?.*)?$/, 'cover.png');
  }

  function resolveCodexOutputUrl(bundle) {
    if (!bundle || !bundle.contentUrl) return '#';
    return bundle.contentUrl.replace(/content\.json(?:\?.*)?$/, 'output.html');
  }

  function splitTrend(trend) {
    return String(trend || '')
      .split(/\n{2,}/)
      .map(function(part) { return part.trim(); })
      .filter(Boolean);
  }

  function renderCodexTrend(trend) {
    const parts = splitTrend(trend);
    const title = parts.shift() || '今日趋势';
    return '<section class="codex-trend-card">' +
      '<h3>📌 今日趋势：' + escapeHtml(title) + '</h3>' +
      parts.map(function(part) { return '<p>' + escapeHtml(part) + '</p>'; }).join('') +
    '</section>';
  }

  function renderNewsPlaceholder(index, isLead) {
    return '<div class="' + (isLead ? 'codex-news-placeholder codex-news-placeholder--lead' : 'codex-news-placeholder') + '" aria-hidden="true">' +
      '<span>' + String(index).padStart(2, '0') + '</span>' +
    '</div>';
  }

  function renderCodexNewsItem(item, index, isLead) {
    const url = safeExternalUrl(item && item.url);
    const inner =
      renderNewsPlaceholder(index + 1, isLead) +
      '<div class="codex-news-copy">' +
        '<div class="codex-news-meta">' +
          '<span>' + escapeHtml(item.source || 'Janet') + '</span>' +
          (url !== '#' ? '<span class="codex-news-dot"></span><span>原文 ↗</span>' : '') +
        '</div>' +
        '<h3>' + escapeHtml(item.title || '今日新闻') + '</h3>' +
        '<p class="codex-news-body">' + escapeHtml(item.body || '') + '</p>' +
        '<div class="codex-janet-take"><b>Janet 锐评：</b><span>' + escapeHtml(item.janet_take || '') + '</span></div>' +
      '</div>';
    if (url === '#') {
      return '<article class="' + (isLead ? 'codex-news-card codex-news-card--lead' : 'codex-news-card') + '">' + inner + '</article>';
    }
    return '<a class="' + (isLead ? 'codex-news-card codex-news-card--lead janet-clickable-card' : 'codex-news-card janet-clickable-card') + '" href="' + escapeHtml(url) + '" target="_blank" rel="noopener noreferrer" aria-label="查看新闻源：' + escapeHtml(item.title || '今日新闻') + '">' + inner + '</a>';
  }

  function renderCodexHomepageNews(bundle) {
    const container = document.getElementById('news-editorial');
    const countEl = document.getElementById('news-count');
    if (!container) return;

    const content = bundle.content || {};
    const cover = content.cover || {};
    const news = content.sections && content.sections.news && Array.isArray(content.sections.news.items)
      ? content.sections.news.items.slice(0, 5)
      : [];
    const lead = news[0] || {};
    const rest = news.slice(1, 5);
    const coverSrc = resolveCodexCoverSrc(bundle);
    const outputUrl = resolveCodexOutputUrl(bundle);
    const issue = [content.date || bundle.entry, content.vol || ''].filter(Boolean).join(' · ');

    container.innerHTML =
      '<article class="codex-briefing-home">' +
        '<div class="codex-briefing-kicker">' +
          '<span>中国创作者视角 • 全球AI前沿 • 每日晨报</span>' +
          '<span>' + escapeHtml(issue) + '</span>' +
        '</div>' +
        '<section class="codex-cover-panel">' +
          '<img src="' + escapeHtml(coverSrc) + '" alt="' + escapeHtml(cover.title || 'Janet 快车箱封面') + '" loading="eager" decoding="async">' +
          '<div class="codex-cover-overlay">' +
            '<span>Janet&apos;s Express Box</span>' +
            '<h3>' + escapeHtml(cover.title || '今日晨报') + '</h3>' +
            (cover.subtitle ? '<p>' + escapeHtml(cover.subtitle) + '</p>' : '') +
          '</div>' +
        '</section>' +
        renderCodexTrend(content.trend || '') +
        '<section class="codex-global-news">' +
          (lead.title ? renderCodexNewsItem(lead, 0, true) : '') +
          '<div class="codex-news-grid">' + rest.map(function(item, index) { return renderCodexNewsItem(item, index + 1, false); }).join('') + '</div>' +
        '</section>' +
        '<div class="news-actions codex-news-actions">' +
          '<a class="btn btn-green" href="' + escapeHtml(outputUrl) + '" target="_blank" rel="noopener noreferrer">浏览当天完整晨报</a>' +
          '<a class="btn btn-outline" href="news.html">进入新闻归档</a>' +
        '</div>' +
      '</article>';

    if (countEl) countEl.textContent = '全球要闻 5 条';
  }

  async function getManifest() {
    if (cachedManifest) return cachedManifest;

    const entries = [];
    for (const entry of codexDateCandidates()) {
      const bundle = await loadCodexDailyBundle(entry);
      if (bundle) entries.push(entry);
    }
    cachedManifest = entries;
    return cachedManifest;
  }

  async function loadDailyBundle(entry) {
    return loadCodexDailyBundle(entry);
  }

  async function renderHomepageNews() {
    renderNewsSkeleton(document.getElementById('news-editorial'));
    let selected = null;

    for (const entry of codexDateCandidates()) {
      const bundle = await loadCodexDailyBundle(entry);
      if (bundle) {
        selected = bundle;
        break;
      }
    }

    if (!selected) {
      const container = document.getElementById('news-editorial');
      if (container) container.innerHTML = '<p style="text-align:center; color:var(--text-3); padding:60px 0;">Codex 晨报数据未找到。请先生成 /Volumes/Janet/codex-briefing-system/runs/YYYY-MM-DD/content.json。</p>';
      const countEl = document.getElementById('news-count');
      if (countEl) countEl.textContent = '0 articles';
      return;
    }

    renderCodexHomepageNews(selected);
  }

  function countLegacyItems(data) {
    const sections = data.sections || {};
    return Object.keys(sections).reduce(function(total, key) {
      const items = sections[key] && sections[key].items ? sections[key].items : [];
      return total + items.length;
    }, 0);
  }

  function getArchivePreview(bundle) {
    if (!bundle) return { title: '数据暂未更新', summary: '', count: 0 };

    const data = bundle.content || {};
    const newsItems = data.sections && data.sections.news ? data.sections.news.items || [] : [];
    return {
      title: data.cover?.title || (newsItems.length > 0 ? newsItems[0].title : 'No headline'),
      summary: splitTrend(data.trend || data.intro_text || '').join(' ').substring(0, 180),
      count: countLegacyItems(data),
      theme: data.cover?.subtitle || '',
      date: data.date || bundle.entry
    };
  }

  async function renderArchiveNews() {
    const container = document.getElementById('archive-content');
    const statDays = document.getElementById('stat-days');
    const statArticles = document.getElementById('stat-articles');
    const statModels = document.getElementById('stat-models');
    if (!container) return;

    const dates = await getManifest();
    if (!dates || dates.length === 0) {
      container.innerHTML = '<p style="text-align:center; color:var(--text-3); padding:40px;">暂无归档数据</p>';
      return;
    }

    let currentMonth = '';
    let html = '';

    dates.forEach(function(date) {
      const month = date.substring(0, 7);
      if (month !== currentMonth) {
        if (currentMonth) html += '</div></div>';
        currentMonth = month;
        const monthName = date.substring(0, 4) + '年' + date.substring(5, 7) + '月';
        html += '<div class="archive-month" data-month="' + escapeHtml(month) + '"><h3 class="month-label">' + monthName + '</h3><div class="archive-date-group archive-timeline">';
      }

      html += '<div class="archive-item archive-timeline-item" data-date="' + escapeHtml(date) + '">' +
        '<div class="archive-item-header">' +
          '<span class="archive-date">' + escapeHtml(date.replace(/-v4$/, ' · v4')) + '</span>' +
          '<a href="#" target="_blank" rel="noopener noreferrer" class="archive-view-btn">打开晨报 →</a>' +
        '</div>' +
        '<div class="archive-item-content">' +
          '<div class="skeleton-loader">' +
            '<div class="skeleton-line skeleton-title"></div>' +
            '<div class="skeleton-line skeleton-text"></div>' +
            '<div class="skeleton-line skeleton-text-short"></div>' +
          '</div>' +
          '<p class="archive-summary" style="display:none;"></p>' +
        '</div>' +
      '</div>';
    });

    html += '</div></div>';
    container.innerHTML = html;

    let totalArticles = 0;
    let totalModels = 0;
    let validDays = 0;
    const archiveItems = Array.from(container.querySelectorAll('.archive-item'));

    for (const date of dates) {
      const bundle = await loadDailyBundle(date);
      const item = archiveItems.find(function(el) { return el.dataset.date === date; });
      if (!item) continue;

      const skeleton = item.querySelector('.skeleton-loader');
      const summaryEl = item.querySelector('.archive-summary');
      const linkEl = item.querySelector('.archive-view-btn');
      const preview = getArchivePreview(bundle);

      if (!bundle) {
        if (skeleton) skeleton.style.display = 'none';
        if (summaryEl) {
          summaryEl.style.display = 'block';
          summaryEl.innerHTML = '<span style="color:var(--text-3);font-size:var(--body-xs);">数据暂未更新</span>';
        }
        continue;
      }

      validDays++;
      totalArticles += preview.count || 0;

      if (bundle.content && bundle.content.sections && bundle.content.sections.models) totalModels += (bundle.content.sections.models.items || []).length;
      if (linkEl && bundle.contentUrl) linkEl.href = bundle.contentUrl.replace(/content\.json(?:\?.*)?$/, 'output.html');

      if (skeleton) skeleton.style.display = 'none';
      if (summaryEl) {
        summaryEl.style.display = 'block';
        summaryEl.innerHTML =
          '<strong style="font-size: var(--body); color: var(--text); margin-bottom: 8px; display: block;">' +
          escapeHtml(preview.title) +
          '</strong>' +
          '<span style="color: var(--text-2); font-size: var(--body-sm);">' + escapeHtml((preview.summary || '').substring(0, 150)) + '...</span>';
      }
    }

    if (statDays) statDays.textContent = validDays;
    if (statArticles) statArticles.textContent = totalArticles;
    if (statModels) statModels.textContent = totalModels;

    initArchiveSearch(container, dates);
  }

  function initArchiveSearch(container, allDates) {
    const searchInput = document.getElementById('archive-search');
    const clearBtn = document.getElementById('search-clear');
    const monthFilters = document.getElementById('month-filters');
    if (!searchInput || !container) return;

    const months = Array.from(new Set(allDates.map(function(d) { return d.substring(0, 7); }))).sort().reverse();
    if (monthFilters && months.length > 0) {
      monthFilters.innerHTML = months.map(function(m) {
        const label = m.substring(0, 4) + '/' + m.substring(5, 7);
        return '<button class="month-filter-btn active" data-month="' + escapeHtml(m) + '">' + escapeHtml(label) + '</button>';
      }).join('');

      monthFilters.addEventListener('click', function(e) {
        const btn = e.target.closest('.month-filter-btn');
        if (!btn) return;
        btn.classList.toggle('active');
        applyArchiveFilters();
      });
    }

    let searchTimeout;
    searchInput.addEventListener('input', function(e) {
      clearTimeout(searchTimeout);
      const value = e.target.value.trim();
      if (clearBtn) clearBtn.style.display = value ? 'block' : 'none';
      searchTimeout = setTimeout(applyArchiveFilters, 200);
    });

    if (clearBtn) {
      clearBtn.addEventListener('click', function() {
        searchInput.value = '';
        clearBtn.style.display = 'none';
        document.querySelectorAll('.month-filter-btn').forEach(function(btn) { btn.classList.add('active'); });
        applyArchiveFilters();
      });
    }

    function applyArchiveFilters() {
      const searchTerm = searchInput.value.trim().toLowerCase();
      const activeMonths = new Set(Array.from(document.querySelectorAll('.month-filter-btn.active')).map(function(btn) { return btn.dataset.month; }));
      let visibleCount = 0;

      container.querySelectorAll('.archive-item').forEach(function(item) {
        const date = item.dataset.date;
        const month = date.substring(0, 7);
        const text = item.textContent.toLowerCase();
        const visible = (!searchTerm || text.includes(searchTerm)) && activeMonths.has(month);
        item.style.display = visible ? 'block' : 'none';
        if (visible) visibleCount++;
      });

      container.querySelectorAll('.archive-month').forEach(function(monthEl) {
        const anyVisible = Array.from(monthEl.querySelectorAll('.archive-item')).some(function(item) {
          return item.style.display !== 'none';
        });
        monthEl.style.display = anyVisible ? 'block' : 'none';
      });

      let noResults = container.querySelector('.no-results');
      if (visibleCount === 0 && !noResults) {
        noResults = document.createElement('div');
        noResults.className = 'no-results';
        noResults.style.cssText = 'text-align:center;padding:60px 20px;color:var(--text-3);font-size:var(--body);';
        noResults.textContent = '没有找到匹配的内容';
        container.appendChild(noResults);
      } else if (visibleCount > 0 && noResults) {
        noResults.remove();
      }
    }
  }

  if (document.getElementById('archive-content')) renderArchiveNews();
  else renderHomepageNews();
})();
