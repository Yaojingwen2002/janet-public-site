(function () {
  'use strict';

  function pad(number) { return String(number).padStart(2, '0'); }

  function fillGallery(selector, options) {
    const root = document.querySelector(selector);
    if (!root) return;
    const items = [];
    for (let index = 1; index <= options.count; index += 1) {
      const label = options.labels && options.labels[index - 1]
        ? options.labels[index - 1]
        : options.label + ' ' + pad(index);
      items.push('<figure><img src="' + options.path + pad(index) + '.jpg" alt="' + label + '" loading="lazy" width="1000" height="563"><figcaption>' + label + '</figcaption></figure>');
    }
    root.innerHTML = items.join('');
  }

  document.addEventListener('DOMContentLoaded', function () {
    fillGallery('[data-qh-characters]', {
      count: 4,
      path: 'assets/works/quiet-heat/characters/character-',
      label: '角色',
      labels: ['BLACK / 主舞者', 'BLACK 2 / 黑色轮廓', 'GRAY UKULELE / 灰阶乐手', 'ORANGE MAIN / 橙色主角']
    });
    fillGallery('[data-qh-scenes]', { count: 8, path: 'assets/works/quiet-heat/scenes/scene-', label: '场景系统' });
    fillGallery('[data-qh-frames]', { count: 48, path: 'assets/works/quiet-heat/frames/frame-', label: '时间线画面' });
    fillGallery('[data-qh-references]', { count: 31, path: 'assets/works/quiet-heat/references/reference-', label: '参考 / 重构画面' });
  });
})();
