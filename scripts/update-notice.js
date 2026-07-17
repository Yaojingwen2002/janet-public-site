(function() {
  'use strict';

  const ACTIVE_FROM = Date.parse('2026-07-17T00:00:00+08:00');
  const ACTIVE_UNTIL = Date.parse('2026-07-27T00:00:00+08:00');

  if (Date.now() < ACTIVE_FROM || Date.now() >= ACTIVE_UNTIL) return;

  const template = document.createElement('template');
  template.innerHTML = `
    <aside class="release-notice" data-release-notice aria-label="网站更新公告">
      <div class="release-notice__panel" id="release-notice-panel">
        <header class="release-notice__head">
          <div>
            <span class="release-notice__eyebrow">Release 03 / What's new</span>
            <h2>第三次版式革新</h2>
          </div>
          <button class="release-notice__collapse" type="button" aria-label="收起更新公告" title="收起更新公告"></button>
        </header>
        <div class="release-notice__scroll" tabindex="0">
          <p class="release-notice__intro">这次不是换一层皮肤，而是把首页、晨报、归档和作品系统统一进同一套 Janet 视觉语言。</p>
          <section class="release-notice__item">
            <span>01</span>
            <div><h3>全球信号场上线</h3><p>首页加入可拖动、可缩放的实时信号地球，新闻源与当天晨报在同一画面里建立联系。</p></div>
          </section>
          <section class="release-notice__item">
            <span>02</span>
            <div><h3>全站阅读节奏重排</h3><p>晨报、归档与作品页统一为更开放的编辑版式，缩小无效边框，让内容和交互承担层级。</p></div>
          </section>
          <section class="release-notice__item">
            <span>03</span>
            <div><h3>镜场计划接入实验室</h3><p>Janet 影像参考实验室新增镜场计划入口，按实验编号读取公开安全版视觉研发记录。</p></div>
          </section>
          <section class="release-notice__item">
            <span>04</span>
            <div><h3>细节交互全面更新</h3><p>指针、惯性滚动、卡片响应、背景音乐和跨页面色彩关系同步升级。</p></div>
          </section>
        </div>
        <footer class="release-notice__foot">
          <span class="release-notice__date">2026.07.17 - 07.26</span>
          <a href="gpt-image2-handbook.html">进入影像参考实验室</a>
        </footer>
      </div>
      <button class="release-notice__handle" type="button" aria-controls="release-notice-panel" aria-expanded="false" aria-label="展开更新公告" title="展开更新公告">
        <span class="release-notice__handle-label">更新 03</span>
        <span class="release-notice__handle-icon" aria-hidden="true"></span>
      </button>
    </aside>`;

  const notice = template.content.firstElementChild;
  const handle = notice.querySelector('.release-notice__handle');
  const collapse = notice.querySelector('.release-notice__collapse');
  document.body.append(notice);

  function setOpen(open) {
    notice.classList.toggle('is-open', open);
    handle.setAttribute('aria-expanded', String(open));
    handle.setAttribute('aria-label', open ? '收起更新公告' : '展开更新公告');
    handle.title = open ? '收起更新公告' : '展开更新公告';
  }

  handle.addEventListener('click', () => setOpen(!notice.classList.contains('is-open')));
  collapse.addEventListener('click', () => {
    setOpen(false);
    handle.focus({ preventScroll: true });
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && notice.classList.contains('is-open')) setOpen(false);
  });

  const guide = document.getElementById('site-guide');
  window.setTimeout(() => {
    if (!guide || guide.hidden) {
      setOpen(true);
      return;
    }

    const observer = new MutationObserver(() => {
      if (!guide.hidden) return;
      observer.disconnect();
      window.setTimeout(() => setOpen(true), 180);
    });
    observer.observe(guide, { attributes: true, attributeFilter: ['hidden'] });
  }, 680);
})();
