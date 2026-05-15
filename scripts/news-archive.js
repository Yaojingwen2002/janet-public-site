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

  function editionCard(edition, featured) {
    const sources = (edition.top_sources || []).slice(0, 4).map((source) => `<span>${escapeHtml(source)}</span>`).join('');
    const categories = (edition.top_categories || []).slice(0, 4).map((category) => `<span>${escapeHtml(category)}</span>`).join('');
    return `
      <article class="${featured ? 'news-edition-card news-edition-card--featured' : 'news-edition-card'}">
        <div class="news-edition-meta">
          <span>${escapeHtml(edition.date)}</span>
          <span>${escapeHtml(edition.edition_type || 'edition')}</span>
          <span>${escapeHtml(edition.signal_count || 0)} signals</span>
        </div>
        <h3>${escapeHtml(edition.title || 'Janet 快车箱')}</h3>
        <p>${escapeHtml(edition.summary || edition.lead_story?.title || '')}</p>
        <div class="news-chip-row">${sources}${categories}</div>
        <div class="news-edition-actions">
          <a href="${escapeHtml(edition.url)}">打开完整晨报</a>
          <a href="news-detail.html?edition=${encodeURIComponent(edition.edition_id)}">查看本期新闻列表</a>
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
      <a class="news-status-link" href="news-status.html">查看运行状态 →</a>
    `;
  }

  function renderList() {
    const list = document.getElementById('news-archive-list');
    const count = document.getElementById('news-result-count');
    if (!list || !state.index) return;
    const editions = state.index.editions.filter(editionMatches);
    if (count) count.textContent = `${editions.length} editions`;
    list.innerHTML = editions.length
      ? editions.map((edition) => editionCard(edition, false)).join('')
      : '<p class="news-empty">没有匹配的晨报。</p>';
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
