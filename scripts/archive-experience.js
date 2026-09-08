(function () {
  'use strict';
  const dialog=document.createElement('dialog'); dialog.className='archive-lightbox'; dialog.setAttribute('aria-label','查看完整画面');
  const close=document.createElement('button'); close.type='button'; close.textContent='关闭 ×';
  const image=new Image(); const caption=document.createElement('p');
  dialog.append(close,caption); document.body.append(dialog);
  close.addEventListener('click',()=>dialog.close());
  dialog.addEventListener('click',event=>{if(event.target===dialog)dialog.close();});
  const decorate=()=>document.querySelectorAll('.qh-grid img:not([data-zoom-ready])').forEach(img=>{
    img.dataset.zoomReady='true'; img.tabIndex=0; img.setAttribute('role','button'); img.setAttribute('aria-label',`放大：${img.alt}`);
    const show=()=>{ image.src=img.src;image.alt=img.alt;caption.textContent=img.alt;dialog.insertBefore(image,caption);dialog.showModal(); };
    img.addEventListener('click',show);
    img.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();show();}});
  });
  new MutationObserver(decorate).observe(document.querySelector('main'),{childList:true,subtree:true});
  decorate();
  const quality = document.querySelector('[data-video-quality]');
  if (quality) quality.addEventListener('change', () => {
    const video=document.querySelector('video');
    const time=video.currentTime; const playing=!video.paused;
    video.src=quality.value; video.load();
    video.addEventListener('loadedmetadata',()=>{
      video.currentTime=Math.min(time,video.duration);
      if(playing) video.play().catch(()=>{});
    },{once:true});
  });
  document.addEventListener('play', event=>{
    if (!(event.target instanceof HTMLVideoElement)) return;
    document.querySelectorAll('video').forEach(video=>{if(video!==event.target)video.pause();});
    document.dispatchEvent(new CustomEvent('janet:media-playing'));
  },true);
})();
