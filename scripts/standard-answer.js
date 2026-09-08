(async function () {
  'use strict';
  const makeFigure = item => {
    const figure = document.createElement('figure');
    const img = new Image();
    img.src = item.src; img.alt = item.label; img.loading = 'lazy'; img.decoding = 'async';
    img.width = item.width || 1280; img.height = item.height || 720;
    const caption = document.createElement('figcaption'); caption.textContent = item.label;
    figure.append(img, caption); return figure;
  };
  const frames = document.querySelector('[data-answer-frames]');
  for (let i=1;i<=12;i++) frames.append(makeFigure({src:`assets/works/standard-answer/frames/frame-${String(i).padStart(2,'0')}.jpg`,label:`完成篇 · 画面 ${String(i).padStart(2,'0')}`}));
  try {
    const response = await fetch('data/works/standard-answer-gallery.json');
    if (!response.ok) throw new Error('archive unavailable');
    const data = await response.json();
    const gallery = document.querySelector('[data-answer-production]');
    const filterBar = document.querySelector('[data-answer-filters]');
    const groups = ['全部', ...new Set(data.production.map(item=>item.group))];
    function render(group) {
      gallery.replaceChildren(...data.production.filter(item=>group==='全部'||item.group===group).map(makeFigure));
      filterBar.querySelectorAll('button').forEach(button=>button.setAttribute('aria-pressed',String(button.textContent===group)));
    }
    for (const group of groups) {
      const button=document.createElement('button'); button.type='button'; button.textContent=group;
      button.addEventListener('click',()=>render(group)); filterBar.append(button);
    }
    render('全部');
    document.querySelector('[data-answer-covers]').replaceChildren(...data.covers.map(makeFigure));
    const script = document.querySelector('[data-answer-script]');
    script.addEventListener('toggle',()=>{
      const body=script.querySelector('[data-answer-script-body]');
      if (!script.open || body.childElementCount) return;
      body.replaceChildren(...data.screenplay.map(text=>{const p=document.createElement('p');p.textContent=text;return p;}));
    });
  } catch (error) {
    document.querySelector('[data-answer-production]').textContent='制作档案暂时未加载，请刷新重试；上方成片仍可播放。';
  }
})();
