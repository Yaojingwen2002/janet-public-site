(function() {
  const state = {
    index: null,
    query: '',
    date: 'all',
    source: 'all',
    category: 'all'
  };

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  async function loadJson(path) {
    const response = await fetch(path, { cache: 'no-cache' });
    if (!response.ok) throw new Error(`Cannot load ${path}`);
    return response.json();
  }

  function option(value, label) {
    return `<option value="${escapeHtml(value)}">${escapeHtml(label)}</option>`;
  }

  function fillFilters(index) {
    const dateEl = document.getElementById('news-date-filter');
    const sourceEl = document.getElementById('news-source-filter');
    const categoryEl = document.getElementById('news-category-filter');
    if (dateEl) dateEl.innerHTML = option('all', '全部日期') + index.editions.map((edition) => option(edition.date, edition.date)).join('');
    if (sourceEl) sourceEl.innerHTML = option('all', '全部来源') + index.sources.map((source) => option(source, source)).join('');
    if (categoryEl) categoryEl.innerHTML = option('all', '全部分类') + index.categories.map((category) => option(category, category)).join('');
  }

  function editionMatches(edition) {
    const q = state.query.trim().toLowerCase();
    if (state.date !== 'all' && edition.date !== state.date) return false;
    if (state.source !== 'all' && !(edition.top_sources || []).includes(state.source)) return false;
    if (state.category !== 'all' && !(edition.top_categories || []).includes(state.category)) return false;
    if (!q) return true;
    return [
      edition.title,
      edition.summary,
      edition.date,
      ...(edition.top_sources || []),
      ...(edition.top_categories || [])
    ].join(' ').toLowerCase().includes(q);
  }

  function editionEngagement(edition, compact) {
    const editionId = edition.edition_id || edition.date || '';
    const title = edition.title || 'Janet 快车箱';
    const url = edition.url || '#';
    const actionClass = compact ? 'news-secondary-actions' : 'news-card-actions';
    const safeEditionId = escapeHtml(editionId);
    const safeTitle = escapeHtml(title);
    const safeUrl = escapeHtml(url);

    return `
      <div class="${actionClass}">
        <div class="news-reactions" data-edition-id="${safeEditionId}" data-edition-title="${safeTitle}" data-edition-url="${safeUrl}" aria-label="本期反馈">
          <button class="reaction-btn" type="button" data-reaction-type="like" aria-label="觉得有用">
            <span aria-hidden="true">👍</span><span>有用</span><span class="reaction-count" data-reaction-count>0</span>
          </button>
          <button class="reaction-btn" type="button" data-reaction-type="insightful" aria-label="有洞察">
            <span aria-hidden="true">💡</span><span>洞察</span><span class="reaction-count" data-reaction-count>0</span>
          </button>
          <button class="reaction-btn" type="button" data-reaction-type="trending" aria-label="值得追踪">
            <span aria-hidden="true">🔥</span><span>追踪</span><span class="reaction-count" data-reaction-count>0</span>
          </button>
        </div>
        <button class="comment-toggle-btn" type="button" data-comment-toggle data-edition-id="${safeEditionId}" data-edition-title="${safeTitle}" data-edition-url="${safeUrl}">
          评论 <span class="comment-count" data-comment-count data-edition-id="${safeEditionId}">0</span>
        </button>
        <div class="share-wrap">
          <button class="share-btn" type="button" data-share-toggle aria-haspopup="menu" aria-expanded="false">转发</button>
          <div class="share-menu" role="menu" hidden>
            <button class="share-item" type="button" data-share-action="copy">复制链接</button>
            <button class="share-item" type="button" data-share-action="x">转发到 X</button>
            <button class="share-item" type="button" data-share-action="weibo">转发到微博</button>
          </div>
        </div>
      </div>
    `;
  }

  function editionCard(edition, featured) {
    const sources = (edition.top_sources || []).slice(0, 4).map((source) => `<span>${escapeHtml(source)}</span>`).join('');
    const categories = (edition.top_categories || []).slice(0, 4).map((category) => `<span>${escapeHtml(category)}</span>`).join('');
    const date = new Date(`${edition.date}T00:00:00+08:00`);
    const month = Number.isNaN(date.getTime()) ? edition.date.slice(5, 7) : date.toLocaleString('en-US', { month: 'short' });
    const day = edition.date ? edition.date.slice(8, 10) : '--';
    const year = edition.date ? edition.date.slice(0, 4) : '----';
    const signalCount = edition.edition_items_count || edition.signal_count || 0;
    const sourceCount = (edition.top_sources || []).length;
    const summary = edition.summary || edition.lead_story?.title || '';
    const url = edition.url || '#';

    if (featured) {
      return `
        <article class="le-card news-edition-card news-edition-card--featured rv-scale">
          <div class="le-body">
            <div class="le-meta">
              <span class="le-issue">${escapeHtml(edition.date)}</span>
              <span>${escapeHtml(edition.edition_type || 'codex_briefing')}</span>
            </div>
            <h3 class="le-title">${escapeHtml(edition.title || 'Janet 快车箱')}</h3>
            <p class="le-thesis">${escapeHtml(summary)}</p>
            <div class="news-chip-row">${sources}${categories}</div>
            <div class="le-stats">
              <div class="le-stat"><strong>${escapeHtml(signalCount)}</strong>条信号</div>
              <div class="le-stat"><strong>${escapeHtml(sourceCount)}</strong>个来源</div>
            </div>
            <div class="news-edition-actions">
              <a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">打开本期 ↗</a>
            </div>
            ${editionEngagement(edition, false)}
          </div>
          <div class="le-panel" data-issue="${escapeHtml(edition.date)}">
            <div class="le-panel-tag">Latest</div>
            <div class="le-panel-num">${escapeHtml(signalCount)}<span>条精选</span></div>
          </div>
        </article>
      `;
    }

    return `
      <article class="edition-card news-edition-card rv-fade">
        <div class="ec-date-panel">
          <div class="ec-month">${escapeHtml(month)}</div>
          <div class="ec-day">${escapeHtml(day)}</div>
          <div class="ec-year">${escapeHtml(year)}</div>
        </div>
        <div class="ec-body">
          <div class="ec-title">${escapeHtml(edition.title || 'Janet 快车箱')}</div>
          <p class="ec-thesis">${escapeHtml(summary)}</p>
          <div class="ec-tags news-chip-row">${sources}${categories}</div>
        </div>
        <div class="ec-action">
          <div class="ec-stats">
            <div class="ec-stat"><strong>${escapeHtml(signalCount)}</strong> 条信号</div>
            <div class="ec-stat"><strong>${escapeHtml(sourceCount)}</strong> 个来源</div>
          </div>
          <a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" class="ec-open">打开本期 →</a>
          ${editionEngagement(edition, true)}
        </div>
      </article>
    `;
  }

  function renderLatest(index) {
    const latest = index.editions.find((edition) => edition.edition_id === index.latest_edition_id) || index.editions[0];
    const container = document.getElementById('latest-edition');
    if (!container || !latest) return;
    container.innerHTML = `
      <span class="section-kicker">Latest</span>
      ${editionCard(latest, true)}
    `;
    document.dispatchEvent(new CustomEvent('janet:content-rendered'));
  }

  function renderList() {
    const list = document.getElementById('news-archive-list');
    const count = document.getElementById('news-result-count');
    if (!list || !state.index) return;
    const editions = state.index.editions.filter(editionMatches);
    if (count) count.textContent = `${editions.length} editions`;
    const count2 = document.getElementById('news-result-count-2');
    if (count2) count2.textContent = `${editions.length} 期`;
    list.innerHTML = editions.length
      ? editions.map((edition) => editionCard(edition, false)).join('')
      : '<p class="news-empty">没有匹配的晨报。</p>';
    document.dispatchEvent(new CustomEvent('janet:content-rendered'));
  }

  function bindFilters() {
    const search = document.getElementById('news-search');
    const date = document.getElementById('news-date-filter');
    const source = document.getElementById('news-source-filter');
    const category = document.getElementById('news-category-filter');
    if (search) search.addEventListener('input', () => { state.query = search.value; renderList(); });
    if (date) date.addEventListener('change', () => { state.date = date.value; renderList(); });
    if (source) source.addEventListener('change', () => { state.source = source.value; renderList(); });
    if (category) category.addEventListener('change', () => { state.category = category.value; renderList(); });
  }

  async function init() {
    try {
      state.index = await loadJson('data/news-index.json');
      fillFilters(state.index);
      renderLatest(state.index);
      bindFilters();
      renderList();
    } catch (error) {
      const list = document.getElementById('news-archive-list');
      if (list) list.innerHTML = '<p class="news-empty">晨报索引暂时不可用，稍后刷新。</p>';
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
