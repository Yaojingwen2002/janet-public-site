// news.js — Janet 快车箱首页晨报渲染
// Step 27.3-C: 支持 v4 news-summary.json + 兼容 legacy content.json

(function() {
  const today = new Date();
  const dateStr = today.toISOString().split('T')[0];
  let cachedManifest = null;

  const LEGACY_SECTIONS = [
    { key: 'models', label: '模型动态', icon: '🤖', cssClass: 'news-grid--models', number: 2 },
    { key: 'insights', label: '技术深度', icon: '💡', cssClass: 'news-grid--insights', number: 3 },
    { key: 'investment', label: '投资视角', icon: '🎯', cssClass: 'news-grid--investment', number: 4 },
    { key: 'tools', label: '创作者工具箱', icon: '🔧', cssClass: 'news-grid--tools', number: 5 }
  ];

  const V4_SECTION_LABELS = {
    lead_story: '封面',
    models: '模型与产品',
    agents: 'Agent 与工具',
    open_source: '开源与论文',
    business: '商业与资本',
    china_perspective: '中国视角',
    creator_opportunity: '创作者机会'
  };

  function formatIssueLabel(summary, entry) {
    const date = summary.date || entry || '';
    if (!date) return '今日晨报';
    return date.replace(/-/g, '.');
  }

  function todayShanghai() {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(new Date());
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

  function safeLocalPath(path) {
    if (!path || typeof path !== 'string') return '#';
    if (/^data\/[-A-Za-z0-9_./]+$/.test(path)) return path;
    if (/^assets\/[-A-Za-z0-9_./]+$/.test(path)) return path;
    return '#';
  }

  function visualSrc(visual) {
    if (!visual) return '';
    if (typeof visual === 'string') return visual;
    return visual.src || visual.local_path || '';
  }

  function visualAlt(visual, fallback) {
    if (!visual || typeof visual === 'string') return fallback || 'Janet 快车箱新闻视觉';
    return visual.alt || fallback || 'Janet 快车箱新闻视觉';
  }

  function visualCaption(visual) {
    if (!visual || typeof visual === 'string') return '';
    const bits = [visual.caption, visual.credit].filter(Boolean);
    return bits.join(' · ');
  }

  function storyExternalUrl(item) {
    return safeExternalUrl(item && (item.url || item.source_url || item.external_url));
  }

  function renderExternalCard(className, url, innerHtml, ariaLabel) {
    const href = safeExternalUrl(url);
    if (href === '#') return '<article class="' + className + '">' + innerHtml + '</article>';
    return '<a class="' + className + ' janet-clickable-card" href="' + escapeHtml(href) + '" target="_blank" rel="noopener noreferrer" aria-label="' + escapeHtml(ariaLabel || '打开新闻源站') + '">' + innerHtml + '</a>';
  }

  function sourceBadge(source) {
    return '<span class="news-source-badge">' + escapeHtml(source || 'Janet') + '</span>';
  }

  function externalHint(label) {
    return '<span class="news-external-hint">' + escapeHtml(label || '原文') + ' ↗</span>';
  }

  function getItemText(item) {
    return item.content || item.summary || item.critique || '';
  }

  function stripCritique(text) {
    return String(text || '').replace(/Janet 锐评：.*$/s, '').trim();
  }

  function getNewsImageHtml(item, usedDate, className) {
    if (!item || !item.image) return '';
    const src = 'data/' + usedDate + '/' + item.image;
    const alt = item.image_alt || item.title || 'Janet 快车箱新闻配图';
    const credit = item.image_credit || item.source || '';

    return '<div class="' + className + '"><img src="' + escapeHtml(src) + '" alt="' + escapeHtml(alt) + '" width="1200" height="675" loading="lazy" decoding="async"></div>' +
      (credit ? '<span class="news-image-credit">' + escapeHtml(credit) + '</span>' : '');
  }

  async function loadJson(path) {
    try {
      const resp = await fetch(path, { cache: 'no-cache' });
      if (!resp.ok) return null;
      return await resp.json();
    } catch (e) {
      return null;
    }
  }

  async function getManifest() {
    if (cachedManifest) return cachedManifest;

    const manifest = await loadJson('data/MANIFEST.json');
    if (Array.isArray(manifest) && manifest.length > 0) {
      cachedManifest = manifest;
      return cachedManifest;
    }

    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    cachedManifest = [dateStr, yesterday.toISOString().split('T')[0]];
    return cachedManifest;
  }

  async function loadDailyBundle(entry) {
    const isV4Entry = /-v4$/.test(entry);
    let summary = null;
    let content = null;

    if (isV4Entry) {
      summary = await loadJson('data/' + entry + '/news-summary.json');
      content = await loadJson('data/' + entry + '/content.json');
    } else {
      content = await loadJson('data/' + entry + '/content.json');
    }

    if (!summary && !content) return null;
    return { entry: entry, summary: summary, content: content };
  }

  function isV4Bundle(bundle) {
    if (!bundle) return false;
    if (bundle.summary && bundle.summary.lead_story) return true;
    if (bundle.content && bundle.content.sections && bundle.content.sections.lead_story) return true;
    return false;
  }

  function buildV4SummaryFromContent(content, entry) {
    const sections = content.sections || {};
    const lead = sections.lead_story && sections.lead_story.items ? sections.lead_story.items[0] : null;
    const sectionCounts = {};

    Object.keys(sections).forEach(function(key) {
      sectionCounts[key] = sections[key].items ? sections[key].items.length : 0;
    });

    const itemCount = Object.keys(sectionCounts).reduce(function(total, key) {
      return total + sectionCounts[key];
    }, 0);

    return {
      date: content.date || entry,
      vol: content.vol || '',
      brand: content.brand || 'Janet 快车箱',
      theme: content.theme || '今日 AI 快车箱',
      daily_editorial_summary: content.daily_editorial_summary || null,
      intro_text: content.intro_text || '',
      daily_thesis: content.daily_thesis || '',
      lead_story: lead ? {
        id: lead.id,
        title: lead.title,
        summary: lead.summary,
        url: lead.url,
        source: lead.source,
        source_rank: lead.source_rank
      } : null,
      section_counts: sectionCounts,
      item_count: itemCount,
      output_url: 'data/' + entry + '/output.html'
    };
  }

  function normalizeV4Summary(bundle) {
    if (bundle.summary) return bundle.summary;
    return buildV4SummaryFromContent(bundle.content || {}, bundle.entry);
  }

  function isEngineeringCopy(text) {
    return /本期从公开 RSS|Atom \/ official feeds|窗口内新闻|Janet 已改写|筛出|published_at|raw_items|included|source_success_count|source_error_count/i.test(String(text || ''));
  }

  function readerIntro(summary, lead) {
    const intro = summary.intro_text || summary.daily_thesis || '';
    if (intro && !isEngineeringCopy(intro)) return intro;
    const source = lead.source || '今天的几个关键来源';
    const title = lead.title || 'AI 新闻';
    return source + ' 把 "' + title + '" 放到首页。先看这条新闻里的对象、动作和限制条件。';
  }

  function renderV4HomepageNews(bundle) {
    const container = document.getElementById('news-editorial');
    const countEl = document.getElementById('news-count');
    const btnFull = document.getElementById('btn-full-briefing');
    if (!container) return;

    const summary = normalizeV4Summary(bundle);
    const lead = summary.lead_story || {};
    const sectionCounts = summary.section_counts || {};
    const signalMap = Array.isArray(summary.signal_map) ? summary.signal_map.slice(0, 3) : [];
    const compactNews = Array.isArray(summary.compact_news)
      ? summary.compact_news.slice(0, 6)
      : Array.isArray(summary.homepage_items)
        ? summary.homepage_items.filter(function(item) { return item.role === 'compact'; }).slice(0, 6)
        : [];
    const outputUrl = safeLocalPath(summary.output_url || ('data/' + bundle.entry + '/output.html'));
    const leadUrl = safeExternalUrl(lead.url);
    const issueLabel = formatIssueLabel(summary, bundle.entry);
    const freshnessLabel = summary.date === todayShanghai() ? '今日精选' : '最近一期';
    const editorialSummary = summary.daily_editorial_summary || (bundle.content && bundle.content.daily_editorial_summary) || null;
    const topTitle = editorialSummary && editorialSummary.title ? editorialSummary.title : (summary.theme || '今日 AI 快车箱');
    const topIntro = editorialSummary && editorialSummary.body ? editorialSummary.body : readerIntro(summary, lead);

    if (btnFull) btnFull.href = outputUrl;

    const count = summary.item_count || Object.keys(sectionCounts).reduce(function(total, key) {
      return total + Number(sectionCounts[key] || 0);
    }, 0);

    const signalCards = signalMap.map(function(signal, index) {
      const visual = safeLocalPath(visualSrc(signal.visual));
      const caption = visualCaption(signal.visual);
      const signalInner =
        (visual !== '#' ? '<figure class="news-visual-frame"><img src="' + escapeHtml(visual) + '" alt="' + escapeHtml(visualAlt(signal.visual, signal.label || signal.signal || '今日信号')) + '" loading="lazy" decoding="async">' + (caption ? '<figcaption>' + escapeHtml(caption) + '</figcaption>' : '') + '</figure>' : '') +
        '<div class="news-signal-card__copy">' +
          '<div class="news-card-meta">' + sourceBadge(signal.source) + '<span class="news-card-index">0' + (index + 1) + '</span>' + externalHint('原文') + '</div>' +
          '<strong>' + escapeHtml(signal.label || signal.signal || '今日信号') + '</strong>' +
          '<p>' + escapeHtml(signal.summary || signal.janet_view || '') + '</p>' +
          (signal.story_title ? '<em>' + escapeHtml(signal.story_title) + '</em>' : '') +
        '</div>';
      return renderExternalCard('news-signal-card janet-card', storyExternalUrl(signal), signalInner, '查看新闻源：' + (signal.story_title || signal.label || signal.signal || '今日信号'));
    }).join('');

    const compactCards = compactNews.map(function(item) {
      const visual = safeLocalPath(visualSrc(item.visual));
      const caption = visualCaption(item.visual);
      const compactInner =
        (visual !== '#' ? '<figure class="news-compact-visual"><img src="' + escapeHtml(visual) + '" alt="' + escapeHtml(visualAlt(item.visual, item.title || '今日新闻')) + '" loading="lazy" decoding="async">' + (caption ? '<figcaption>' + escapeHtml(caption) + '</figcaption>' : '') + '</figure>' : '<div class="news-compact-card__icon">' + escapeHtml((item.category || 'AI').slice(0, 2).toUpperCase()) + '</div>') +
        '<div class="news-compact-card__copy">' +
          '<div class="news-card-meta">' + sourceBadge(item.source) + externalHint('原文') + '</div>' +
          '<strong>' + escapeHtml(item.title || '今日新闻') + '</strong>' +
          '<p>' + escapeHtml(item.summary || '') + '</p>' +
        '</div>';
      return renderExternalCard('news-compact-card janet-card', storyExternalUrl(item), compactInner, '查看新闻源：' + (item.title || '今日新闻'));
    }).join('');

    container.innerHTML =
      '<article class="news-v4-card">' +
        '<div class="news-v4-card-bg"></div>' +
        '<div class="news-v4-kicker">' +
          '<span>Janet 快车箱 v4</span>' +
          '<span>' + escapeHtml(issueLabel) + '</span>' +
          '<span>' + escapeHtml(freshnessLabel) + '</span>' +
        '</div>' +
        '<div class="news-v4-main">' +
          '<div class="news-v4-copy">' +
            '<h3 class="news-v4-theme">' + escapeHtml(topTitle) + '</h3>' +
            '<p class="news-v4-intro">' + escapeHtml(topIntro) + '</p>' +
            (lead.title ? (
              (leadUrl !== '#' ? '<a class="news-v4-lead janet-clickable-card" href="' + escapeHtml(leadUrl) + '" target="_blank" rel="noopener noreferrer" aria-label="查看新闻源：' + escapeHtml(lead.title) + '">' : '<div class="news-v4-lead">') +
                '<span class="news-v4-lead-label">头条新闻</span>' +
                '<strong>' + escapeHtml(lead.title) + '</strong>' +
                (lead.original_title ? '<small class="news-v4-original-title">原文：' + escapeHtml(lead.original_title) + '</small>' : '') +
                '<em>' + escapeHtml(lead.summary || '') + '</em>' +
                (leadUrl !== '#' ? '<span class="news-v4-lead-source">查看头条源站 ↗</span></a>' : '</div>')
            ) : '') +
            '<div class="news-v4-actions">' +
              '<a class="news-v4-open" href="' + escapeHtml(outputUrl) + '" target="_blank" rel="noopener noreferrer">打开完整晨报 →</a>' +
              '<a class="news-v4-source" href="news.html">浏览晨报归档</a>' +
            '</div>' +
          '</div>' +
          '<div class="news-v4-panel news-v4-visual-panel">' +
            (visualSrc(lead.visual) ? (leadUrl !== '#' ? '<a class="news-v4-lead-figure-link janet-clickable-card" href="' + escapeHtml(leadUrl) + '" target="_blank" rel="noopener noreferrer" aria-label="查看新闻源：' + escapeHtml(lead.title || '头条新闻') + '">' : '') + '<figure class="news-v4-lead-figure"><img class="news-v4-lead-visual" src="' + escapeHtml(safeLocalPath(visualSrc(lead.visual))) + '" alt="' + escapeHtml(visualAlt(lead.visual, lead.title || '头条新闻')) + '" loading="lazy" decoding="async">' + (visualCaption(lead.visual) ? '<figcaption>' + escapeHtml(visualCaption(lead.visual)) + '</figcaption>' : '') + '</figure>' + (leadUrl !== '#' ? '</a>' : '') : '') +
            '<span class="news-v4-panel-note">今日 ' + escapeHtml(count || 0) + ' 条有效新闻</span>' +
          '</div>' +
        '</div>' +
        (signalCards ? '<div class="news-signal-map">' + signalCards + '</div>' : '') +
        (compactCards ? '<div class="news-more-strip"><div class="news-more-strip__head"><span>今日更多</span><small>不是所有新闻都适合当头条，但这些也值得看一眼。</small></div><div class="news-compact-grid">' + compactCards + '</div></div>' : '') +
      '</article>';

    if (countEl) countEl.textContent = '今日 ' + String(count || 0) + ' 条';
  }

  function renderLegacyEditorialNews(data, usedDate) {
    const container = document.getElementById('news-editorial');
    const countEl = document.getElementById('news-count');
    if (!container) return;

    let html = '';
    const coverNews = data.sections && data.sections.news && data.sections.news.items ? data.sections.news.items[0] : null;

    if (coverNews) {
      const coverUrl = safeExternalUrl(coverNews.url);
      const coverText = stripCritique(getItemText(coverNews)).substring(0, 140);
      const coverImageHtml = getNewsImageHtml(coverNews, usedDate, 'news-cover-image');

      html += '<a class="news-cover news-cover-link news-cover-with-image" href="' + escapeHtml(coverUrl) + '" target="_blank" rel="noopener noreferrer" aria-label="查看新闻源：' + escapeHtml(coverNews.title) + '">' +
        coverImageHtml +
        '<div class="news-cover-content">' +
          '<div class="news-cover-date">' + escapeHtml(usedDate) + ' · Janet 快车箱</div>' +
          '<div class="news-cover-title">' + escapeHtml(coverNews.title) + '</div>' +
          '<div class="news-cover-summary">' + escapeHtml(coverText) + '...</div>' +
          '<div class="news-cover-source">查看新闻源 →</div>' +
        '</div>' +
      '</a>';
    }

    html += '<div class="news-divider"></div><div class="news-grid">';

    LEGACY_SECTIONS.forEach(function(section) {
      const items = data.sections && data.sections[section.key] ? data.sections[section.key].items || [] : [];
      if (items.length === 0) return;

      const item = items[0];
      const content = stripCritique(getItemText(item));
      const summary = content.substring(0, 150);
      const source = item.source || 'Source';
      const itemUrl = safeExternalUrl(item.url);

      html += '<a class="news-grid-item news-grid-link ' + section.cssClass + '" href="' + escapeHtml(itemUrl) + '" target="_blank" rel="noopener noreferrer" aria-label="查看新闻源：' + escapeHtml(item.title) + '">' +
        '<span class="news-grid-number">' + String(section.number).padStart(2, '0') + '</span>' +
        '<div class="news-grid-content">' +
          getNewsImageHtml(item, usedDate, 'news-grid-image') +
          '<div class="news-grid-topline">' +
            '<span class="news-grid-icon">' + section.icon + '</span>' +
            '<span class="news-grid-label">' + escapeHtml(section.label) + '</span>' +
          '</div>' +
          '<h3 class="news-grid-headline">' + escapeHtml(item.title) + '</h3>' +
          '<p class="news-grid-summary">' + escapeHtml(summary) + '...</p>' +
          '<div class="news-grid-meta">' +
            '<span class="source">' + escapeHtml(source) + '</span>' +
            '<span class="dot"></span>' +
            '<span>' + escapeHtml(usedDate) + '</span>' +
            '<span class="news-grid-open">打开源站 ↗</span>' +
          '</div>' +
        '</div>' +
      '</a>';
    });

    html += '</div>';
    if (!html) html = '<p style="text-align:center; color:var(--text-3); padding:60px 0;">暂无晨报数据 · 明天见 🌙</p>';

    container.innerHTML = html;
    if (countEl) countEl.textContent = 'Cover + 4 modules';
  }

  async function renderHomepageNews() {
    const btnFull = document.getElementById('btn-full-briefing');
    const manifest = await getManifest();
    const candidates = (manifest || []).concat([dateStr]);
    const seen = new Set();
    let selected = null;

    for (const entry of candidates) {
      if (!entry || seen.has(entry)) continue;
      seen.add(entry);
      const bundle = await loadDailyBundle(entry);
      if (bundle) {
        selected = bundle;
        break;
      }
    }

    if (!selected) {
      const container = document.getElementById('news-editorial');
      if (container) container.innerHTML = '<p style="text-align:center; color:var(--text-3); padding:60px 0;">暂无晨报数据 · 明天见 🌙</p>';
      const countEl = document.getElementById('news-count');
      if (countEl) countEl.textContent = '0 articles';
      return;
    }

    if (btnFull) btnFull.href = 'data/' + selected.entry + '/output.html';
    if (isV4Bundle(selected)) renderV4HomepageNews(selected);
    else renderLegacyEditorialNews(selected.content, selected.entry);
  }

  function countLegacyItems(data) {
    const sections = data.sections || {};
    return Object.keys(sections).reduce(function(total, key) {
      const items = sections[key] && sections[key].items ? sections[key].items : [];
      return total + items.length;
    }, 0);
  }

  function getArchivePreview(bundle) {
    if (!bundle) return { title: '数据暂未更新', summary: '', count: 0, isV4: false };

    if (isV4Bundle(bundle)) {
      const summary = normalizeV4Summary(bundle);
      return {
        title: summary.theme || 'Janet 快车箱 v4',
        summary: summary.lead_story && summary.lead_story.summary ? summary.lead_story.summary : summary.intro_text || '',
        count: summary.item_count || 0,
        theme: summary.theme || '',
        date: summary.date || bundle.entry,
        isV4: true
      };
    }

    const data = bundle.content || {};
    const newsItems = data.sections && data.sections.news ? data.sections.news.items || [] : [];
    return {
      title: newsItems.length > 0 ? newsItems[0].title : 'No headline',
      summary: data.intro_text || '',
      count: countLegacyItems(data),
      theme: data.theme || '',
      date: data.date || bundle.entry,
      isV4: false
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
          '<a href="data/' + escapeHtml(date) + '/output.html" target="_blank" rel="noopener noreferrer" class="archive-view-btn">打开晨报 →</a>' +
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

      if (bundle.summary && bundle.summary.section_counts) totalModels += Number(bundle.summary.section_counts.models || 0);
      else if (bundle.content && bundle.content.sections && bundle.content.sections.models) totalModels += (bundle.content.sections.models.items || []).length;

      if (skeleton) skeleton.style.display = 'none';
      if (summaryEl) {
        summaryEl.style.display = 'block';
        summaryEl.innerHTML =
          '<strong style="font-size: var(--body); color: var(--text); margin-bottom: 8px; display: block;">' +
          escapeHtml(preview.title) + (preview.isV4 ? ' <span style="color:var(--green);font-size:var(--body-xs);">v4</span>' : '') +
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
