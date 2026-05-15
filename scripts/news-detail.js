(function() {
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

  function params() {
    const search = new URLSearchParams(window.location.search);
    return {
      edition: search.get('edition') || '',
      story: search.get('story') || ''
    };
  }

  function allStories(content) {
    return Object.values(content?.sections || {}).flatMap((section) => (section.items || []).map((story) => ({
      ...story,
      section_title: section.title || ''
    })));
  }

  function chip(value) {
    return value ? `<span>${escapeHtml(value)}</span>` : '';
  }

  function renderStoryList(edition, content, stories) {
    document.getElementById('news-detail-title').textContent = `${content.date || edition} 新闻列表`;
    document.getElementById('news-detail-summary').textContent = content.daily_thesis || content.intro_text || '';
    document.getElementById('news-detail-meta').innerHTML = [
      chip(content.theme),
      chip(`${stories.length} signals`)
    ].join('');
    document.getElementById('news-detail-content').innerHTML = `
      <div class="news-story-list">
        ${stories.map((story) => `
          <article class="news-story-row">
            <span>${escapeHtml(story.source || '')} · ${escapeHtml(story.category || story.section_title || '')}</span>
            <h2>${escapeHtml(story.title || '')}</h2>
            <p>${escapeHtml(story.summary || '')}</p>
            <a href="news-detail.html?edition=${encodeURIComponent(edition)}&story=${encodeURIComponent(story.id)}">查看新闻详情 →</a>
          </article>
        `).join('')}
      </div>
    `;
  }

  function renderStory(edition, content, story) {
    document.title = `${story.title} · Janet 快车箱`;
    document.getElementById('news-detail-title').textContent = story.title || '新闻详情';
    document.getElementById('news-detail-summary').textContent = story.summary || '';
    document.getElementById('news-detail-meta').innerHTML = [
      chip(story.source),
      chip(story.published_at ? new Date(story.published_at).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }) : ''),
      chip(story.category),
      chip(story.source_rank)
    ].join('');
    document.getElementById('news-detail-content').innerHTML = `
      <article class="news-story-detail">
        ${story.why_it_matters ? `<section><span class="section-kicker">Why it matters</span><p>${escapeHtml(story.why_it_matters)}</p></section>` : ''}
        ${story.janet_take ? `<section><span class="section-kicker">Janet Take</span><p>${escapeHtml(story.janet_take)}</p></section>` : ''}
        ${story.watch_next ? `<section><span class="section-kicker">Watch Next</span><p>${escapeHtml(story.watch_next)}</p></section>` : ''}
        ${Array.isArray(story.evidence_ids) && story.evidence_ids.length ? `<section><span class="section-kicker">Evidence</span><p>${story.evidence_ids.map(escapeHtml).join(' · ')}</p></section>` : ''}
        <div class="news-detail-actions">
          ${story.url ? `<a href="${escapeHtml(story.url)}" target="_blank" rel="noopener noreferrer">打开原文 ↗</a>` : ''}
          <a href="data/${encodeURIComponent(edition)}/output.html">返回本期晨报</a>
          <a href="news.html">返回归档页</a>
        </div>
      </article>
    `;
  }

  async function init() {
    const query = params();
    try {
      let edition = query.edition;
      if (!edition) {
        const index = await loadJson('data/news-index.json');
        edition = index.latest_edition_id;
      }
      const content = await loadJson(`data/${edition}/content.json`);
      const stories = allStories(content);
      const back = document.getElementById('news-detail-back-archive');
      if (back) back.href = 'news.html';
      if (!query.story) {
        renderStoryList(edition, content, stories);
        return;
      }
      const story = stories.find((item) => item.id === query.story);
      if (!story) {
        document.getElementById('news-detail-title').textContent = '这条新闻没找到';
        document.getElementById('news-detail-summary').textContent = '请返回晨报归档重新选择。';
        document.getElementById('news-detail-content').innerHTML = '<a class="news-back-link" href="news.html">返回晨报归档</a>';
        return;
      }
      renderStory(edition, content, story);
    } catch (error) {
      document.getElementById('news-detail-title').textContent = '新闻内容暂时不可用';
      document.getElementById('news-detail-summary').textContent = '状态文件读取失败，稍后刷新。';
      document.getElementById('news-detail-content').innerHTML = '<a class="news-back-link" href="news.html">返回晨报归档</a>';
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
