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
    try {
      const response = await fetch(path, { cache: 'no-cache' });
      if (!response.ok) return null;
      return response.json();
    } catch {
      return null;
    }
  }

  function statusMessage(status) {
    if (status === 'published_full_edition') return '今日已发布 full edition';
    if (status === 'published_limited_edition') return '今日已发布 limited edition';
    if (status === 'blocked_insufficient_fresh_news') return '今天不是没跑，是窗口内有效新闻不足 5 条，所以系统没有硬凑旧闻。';
    return '状态文件暂时不可用，稍后刷新。';
  }

  function card(label, value) {
    return `<article class="news-status-card"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value ?? '—')}</strong></article>`;
  }

  async function init() {
    const [run, result, acceptance, editorial] = await Promise.all([
      loadJson('data/daily-news-run-status.json'),
      loadJson('data/daily-news-automation-result.json'),
      loadJson('data/daily-news-automation-acceptance.json'),
      loadJson('data/editorial-quality-check.json')
    ]);

    const message = document.getElementById('news-status-message');
    const grid = document.getElementById('news-status-grid');
    if (!grid || !message) return;

    if (!run) {
      message.textContent = statusMessage('');
      grid.innerHTML = '';
      return;
    }

    message.textContent = statusMessage(run.status);
    grid.innerHTML = [
      card('当前状态', run.status),
      card('最近运行', run.run_at),
      card('最近发布', run.published_edition_id || acceptance?.latest_published_edition_id || '—'),
      card('入选数量', run.included),
      card('来源成功', `${run.source_success_count || 0} / ${run.source_count || 0}`),
      card('来源失败', run.source_error_count || 0),
      card('Sample data', run.used_sample_data ? 'used' : 'not used'),
      card('发布时间窗口', run.published_at_window_enforced ? 'enforced' : 'not enforced'),
      card('付费 API', result?.requires_paid_api ? 'required' : 'not required'),
      card('Secret', result?.requires_secret ? 'required' : 'not required'),
      card('编辑 QA', editorial?.qa_passed ? 'passed' : '—'),
      card('下次自动运行', acceptance?.next_expected_auto_run || 'daily at 08:37 Asia/Shanghai')
    ].join('');
  }

  document.addEventListener('DOMContentLoaded', init);
})();
