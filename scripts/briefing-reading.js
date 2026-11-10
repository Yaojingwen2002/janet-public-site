(()=>{'use strict';
 const tags=[...document.querySelectorAll('.section-tag')];if(!tags.length)return;
 const bar=document.createElement('nav');bar.className='briefing-reading-nav';bar.setAttribute('aria-label','本期栏目目录');
 tags.forEach((tag,i)=>{tag.id=tag.id||`briefing-section-${i+1}`;tag.tabIndex=-1;const a=document.createElement('a');a.href='#'+tag.id;a.textContent=tag.querySelector('.st-zh')?.textContent||`栏目${i+1}`;bar.append(a);});
 const b=document.createElement('button');b.type='button';b.textContent='舒适阅读';b.setAttribute('aria-pressed','false');bar.append(b);
 const apply=on=>{document.body.classList.toggle('reader-single-column',on);b.setAttribute('aria-pressed',String(on));};
 try{apply(localStorage.getItem('janet-reading-layout')==='single');}catch{}
 b.addEventListener('click',()=>{const on=!document.body.classList.contains('reader-single-column');apply(on);try{localStorage.setItem('janet-reading-layout',on?'single':'default');}catch{}});
 const intro=document.querySelector('.intro-box');if(intro)intro.before(bar);else tags[0].before(bar);
 const progress=document.createElement('progress');progress.className='briefing-reading-progress';progress.max=100;progress.value=0;progress.setAttribute('aria-label','全文阅读进度');document.body.prepend(progress);
 let pending=false;const update=()=>{const max=document.documentElement.scrollHeight-innerHeight;progress.value=max>0?Math.min(100,Math.max(0,scrollY/max*100)):100;pending=false;};addEventListener('scroll',()=>{if(!pending){pending=true;requestAnimationFrame(update);}},{passive:true});addEventListener('resize',update);update();
 if('IntersectionObserver'in window){const obs=new IntersectionObserver(entries=>{for(const entry of entries)if(entry.isIntersecting){for(const a of bar.querySelectorAll('a'))a.removeAttribute('aria-current');bar.querySelector(`a[href="#${entry.target.id}"]`)?.setAttribute('aria-current','location');}},{rootMargin:'-8% 0px -70% 0px'});tags.forEach(x=>obs.observe(x));}
})();
