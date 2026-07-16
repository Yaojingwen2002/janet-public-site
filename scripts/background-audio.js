(function () {
  'use strict';

  const root = document.querySelector('[data-background-audio]');
  const audio = document.getElementById('background-audio-track');
  const toggle = document.querySelector('[data-background-audio-toggle]');
  if (!root || !audio || !toggle) return;

  const preferenceKey = 'janet:background-audio';
  audio.volume = 0.16;

  function setState(playing) {
    root.dataset.state = playing ? 'playing' : 'paused';
    toggle.setAttribute('aria-pressed', String(playing));
    toggle.setAttribute('aria-label', playing ? '暂停背景音乐' : '播放背景音乐');
    toggle.title = playing ? '暂停背景音乐' : '播放背景音乐';
  }

  async function play() {
    try {
      await audio.play();
      localStorage.setItem(preferenceKey, 'on');
      setState(true);
    } catch (error) {
      console.warn('[background-audio] playback blocked:', error);
      setState(false);
    }
  }

  function pause() {
    audio.pause();
    localStorage.setItem(preferenceKey, 'off');
    setState(false);
  }

  toggle.addEventListener('click', () => {
    if (audio.paused) play();
    else pause();
  });

  audio.addEventListener('play', () => setState(true));
  audio.addEventListener('pause', () => setState(false));
  setState(false);
})();
