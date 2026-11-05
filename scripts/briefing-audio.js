(function () {
  'use strict';
  const script = document.currentScript;
  const site = new URL('../', script.src);
  const mount = document.querySelector('[data-briefing-audio]');
  if (!mount) return;
  const escape = text => String(text ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const clock = seconds => `${Math.floor((seconds || 0) / 60)}:${String(Math.floor((seconds || 0) % 60)).padStart(2, '0')}`;
  const OWNER = 'janet:site-audio-owner:v1';
  const id = window.crypto?.randomUUID?.() || `briefing-${Date.now()}-${Math.random()}`;
  let audio, manifest, channel, timer, gesture, key, floating, saved = {}, userPaused = false, restored = false, hiddenStart = false;
  const read = (storage, name) => { try { return JSON.parse(storage.getItem(name) || 'null'); } catch { return null; } };
  const write = (storage, name, value) => { try { storage.setItem(name, JSON.stringify(value)); } catch {} };
  function save() {
    if (audio && key) write(sessionStorage, key, { time: audio.currentTime, rate: audio.playbackRate, paused: userPaused });
  }
  function owner() { const x = read(localStorage, OWNER); return x && Date.now() - x.updatedAt < 7000 ? x : null; }
  function claim() {
    window.JanetSiteAudio?.pause();
    document.querySelectorAll('audio,video').forEach(other => { if (other !== audio) other.pause(); });
    const beat = () => write(localStorage, OWNER, { id, type: 'briefing', updatedAt: Date.now() });
    beat(); clearInterval(timer); timer = setInterval(beat, 2200);
    channel?.postMessage({ id, action: 'claim', type: 'briefing' });
  }
  function release() {
    clearInterval(timer);
    if (read(localStorage, OWNER)?.id === id) {
      try { localStorage.removeItem(OWNER); } catch {}
      channel?.postMessage({ id, action: 'release' });
    }
  }
  function status(state, text) {
    mount.dataset.state = state;
    mount.querySelector('[data-voice-status]').textContent = text;
    const button = mount.querySelector('[data-voice-toggle]');
    button.textContent = state === 'playing' ? '暂停播报' : state === 'blocked' ? '点击收听' : state === 'ended' ? '重新收听' : '播放晨报';
    button.setAttribute('aria-pressed', String(state === 'playing'));
    if (floating) { floating.textContent = state === 'playing' ? 'Ⅱ 暂停晨报' : '▶ 收听晨报'; floating.setAttribute('aria-pressed', String(state === 'playing')); }
  }
  function disarm() {
    if (!gesture) return;
    document.removeEventListener('click', gesture, true);
    document.removeEventListener('keydown', gesture, true);
    gesture = null;
  }
  function arm() {
    if (gesture || userPaused) return;
    gesture = event => {
      if (event.type === 'keydown' && !['Enter', ' '].includes(event.key)) return;
      if (event.target.closest('a,button,input,select,textarea,[contenteditable]')) return;
      disarm(); play(true);
    };
    document.addEventListener('click', gesture, true);
    document.addEventListener('keydown', gesture, true);
  }
  async function play(manual = false) {
    if (!manual && owner() && owner().id !== id) { status('paused', '其他页面正在播放，点击可切换到本页'); return; }
    if (document.hidden && !manual) { hiddenStart = true; return; }
    if (manual) { userPaused = false; if (audio.error) audio.load(); }
    disarm();
    status('loading', '正在准备播报…');
    try { await audio.play(); }
    catch (error) {
      if (error.name === 'NotAllowedError') {
        status('blocked', '浏览器需要一次点击 · 点击收听完整晨报'); arm();
      } else if (error.name !== 'AbortError') status('error', '音频加载失败，请点击重试');
    }
  }
  function update() {
    const time = audio.currentTime || 0;
    const duration = Number.isFinite(audio.duration) ? audio.duration : manifest.duration;
    const seek = mount.querySelector('[data-voice-seek]');
    seek.max = duration; seek.value = time;
    seek.setAttribute('aria-valuetext', `${clock(time)}，共 ${clock(duration)}`);
    mount.querySelector('[data-voice-time]').textContent = `${clock(time)} / ${clock(duration)}`;
    const index = Math.max(0, manifest.chapters.findLastIndex(chapter => time >= chapter.start));
    mount.querySelector('[data-voice-chapter]').value = String(index);
    mount.querySelector('[data-voice-current]').textContent = manifest.chapters[index].title;
    save();
  }
  async function json(url) {
    const response = await fetch(url, { cache: 'no-cache' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  }
  async function init() {
    mount.innerHTML = '<p class="briefing-audio-loading">正在准备晨报播报…</p>';
    try {
      let contentUrl;
      if (mount.dataset.contentUrl) contentUrl = new URL(mount.dataset.contentUrl, location.href);
      else {
        const index = await json(new URL('data/news-index.json', site));
        const latest = index.editions.find(item => item.edition_id === index.latest_edition_id);
        if (!latest) throw new Error('Missing edition');
        contentUrl = new URL(latest.content_url, site);
      }
      const manifestUrl = new URL('narration.json', contentUrl);
      manifest = await json(manifestUrl);
      if (manifest.item_count !== 17 || !manifest.chapters?.length || !manifest.audio) throw new Error('Incomplete narration');
      key = `janet:briefing-audio:${manifest.date}`;
      saved = read(sessionStorage, key) || {}; userPaused = Boolean(saved.paused);
      mount.classList.add('briefing-audio');
      mount.setAttribute('aria-label', `${manifest.date}晨报语音播报`);
      mount.innerHTML = `
        <div class="briefing-audio-heading"><span class="briefing-audio-kicker">JANET ON AIR <i aria-hidden="true"></i></span><span>${escape(manifest.date)} · 完整 ${manifest.item_count} 条</span></div>
        <div class="briefing-audio-title"><h2>把今天的晨报，读给你听。</h2><span>普通话女声 · AI 播报 · 约 ${Math.ceil(manifest.duration / 60)} 分钟</span></div>
        <p class="briefing-audio-current" data-voice-current>${escape(manifest.title)}</p>
        <audio preload="metadata" playsinline></audio>
        <div class="briefing-audio-controls"><button type="button" class="briefing-audio-play" data-voice-toggle aria-pressed="false">播放晨报</button><button type="button" data-voice-back aria-label="后退15秒">−15秒</button><button type="button" data-voice-forward aria-label="前进15秒">+15秒</button><label class="briefing-audio-speed">倍速<select data-voice-rate aria-label="播报速度"><option value="0.85">0.85×</option><option value="1" selected>1×</option><option value="1.25">1.25×</option><option value="1.5">1.5×</option><option value="2">2×</option></select></label></div>
        <div class="briefing-audio-progress"><input type="range" min="0" max="${manifest.duration}" step="0.1" value="0" aria-label="播报进度" data-voice-seek><span data-voice-time>0:00 / ${clock(manifest.duration)}</span></div>
        <div class="briefing-audio-bottom"><label>跳到<select data-voice-chapter aria-label="选择新闻章节">${manifest.chapters.map((chapter, index) => `<option value="${index}">${escape(chapter.title)}</option>`).join('')}</select></label><a href="${escape(new URL(manifest.transcript, manifestUrl).href)}" target="_blank" rel="noopener">完整口播稿 ↗</a></div>
        <p class="briefing-audio-status" role="status" data-voice-status>新闻全文播报，每条新闻后紧接 Janet 锐评。</p>`;
      audio = mount.querySelector('audio');
      floating = document.createElement('button');
      floating.type = 'button'; floating.className = 'briefing-audio-floating'; floating.textContent = '▶ 收听晨报';
      floating.setAttribute('aria-label', `${manifest.date}晨报，播放或暂停`);
      floating.addEventListener('click', () => mount.querySelector('[data-voice-toggle]').click());
      document.body.appendChild(floating);
      if ('IntersectionObserver' in window) new IntersectionObserver(entries => { floating.hidden = entries[0].isIntersecting; }, { threshold: .05 }).observe(mount);
      audio.src = new URL(manifest.audio, manifestUrl).href;
      const rate = [0.85, 1, 1.25, 1.5, 2].includes(saved.rate) ? saved.rate : 1;
      audio.playbackRate = rate; mount.querySelector('[data-voice-rate]').value = String(rate);
      audio.addEventListener('loadedmetadata', () => {
        if (!restored) { restored = true; const time = Number(saved.time) || 0; audio.currentTime = time >= audio.duration - 1 ? 0 : Math.max(0, time); } update();
      });
      audio.addEventListener('playing', () => { claim(); status('playing', '正在播报 · 新闻之后紧接 Janet 锐评'); });
      audio.addEventListener('waiting', () => { if (!audio.paused) status('loading', '正在缓冲…'); });
      audio.addEventListener('pause', () => { release(); if (!audio.ended && mount.dataset.state !== 'error') status('paused', '已暂停，点击继续收听'); save(); });
      audio.addEventListener('ended', () => { release(); userPaused = true; saved.time = 0; status('ended', '本期已播报完毕，感谢收听。'); write(sessionStorage, key, { time: 0, rate: audio.playbackRate, paused: true }); });
      audio.addEventListener('error', () => { release(); status('error', '音频加载失败，请点击重试'); });
      audio.addEventListener('timeupdate', update);
      mount.querySelector('[data-voice-toggle]').addEventListener('click', () => {
        if (!audio.paused) { userPaused = true; disarm(); audio.pause(); }
        else { if (audio.ended) audio.currentTime = 0; play(true); }
      });
      mount.querySelector('[data-voice-back]').addEventListener('click', () => { audio.currentTime = Math.max(0, audio.currentTime - 15); update(); });
      mount.querySelector('[data-voice-forward]').addEventListener('click', () => { audio.currentTime = Math.min(manifest.duration, audio.currentTime + 15); update(); });
      mount.querySelector('[data-voice-seek]').addEventListener('input', event => { audio.currentTime = Number(event.target.value); update(); });
      mount.querySelector('[data-voice-rate]').addEventListener('change', event => { audio.playbackRate = Number(event.target.value); save(); });
      mount.querySelector('[data-voice-chapter]').addEventListener('change', event => { audio.currentTime = manifest.chapters[Number(event.target.value)].start; update(); });
      const external = () => { const other = owner(); if (other && other.id !== id && !audio.paused) { audio.pause(); status('paused', '播放已切换到其他页面，点击可继续本页'); } };
      try { channel = new BroadcastChannel('janet-site-audio-v1'); channel.onmessage = event => { if (event.data.id !== id && event.data.action === 'claim') { audio.pause(); status('paused', '播放已切换到其他页面，点击可继续本页'); } }; } catch {}
      window.addEventListener('storage', event => { if (event.key === OWNER) external(); });
      document.addEventListener('visibilitychange', () => { if (!document.hidden && hiddenStart && !userPaused) { hiddenStart = false; play(); } });
      window.addEventListener('pagehide', () => { save(); disarm(); release(); channel?.close(); });
      window.addEventListener('pageshow', event => { if (event.persisted) location.reload(); });
      if (userPaused) status('paused', '已保留上次收听位置，点击继续'); else play();
    } catch (_error) {
      mount.innerHTML = '<p class="briefing-audio-loading">本期语音暂未就绪，您可继续阅读正文。<button type="button" data-voice-retry>重试加载</button></p>';
      mount.querySelector('[data-voice-retry]').addEventListener('click', init);
    }
  }
  init();
})();
