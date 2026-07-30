(function () {
  'use strict';

  const policy = document.body?.dataset.audioPolicy || 'silent';
  const SESSION_KEY = 'janet:site-audio:v1';
  const OWNER_KEY = 'janet:site-audio-owner:v1';
  const CHANNEL_NAME = 'janet-site-audio-v1';
  const OWNER_TTL = 7000;
  const tabId = window.crypto?.randomUUID
    ? window.crypto.randomUUID()
    : `janet-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const defaultState = {
    track: 'digital-clouds',
    currentTime: 0,
    volume: .16,
    muted: false,
    shouldPlay: false,
    consent: false,
    blocked: false
  };

  let state = readSession();
  let channel = null;
  let root = null;
  let audio = null;
  let toggle = null;
  let heartbeatTimer = 0;
  let persistTimer = 0;
  let resumeTimer = 0;
  let gestureResumeArmed = false;
  let gestureResumeHandler = null;

  function safeJsonParse(value, fallback) {
    try {
      return value ? JSON.parse(value) : fallback;
    } catch (_error) {
      return fallback;
    }
  }

  function readSession() {
    try {
      return { ...defaultState, ...safeJsonParse(sessionStorage.getItem(SESSION_KEY), {}) };
    } catch (_error) {
      return { ...defaultState };
    }
  }

  function writeSession() {
    try {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(state));
    } catch (_error) {
      // Playback remains functional when storage is unavailable.
    }
  }

  function readOwner() {
    try {
      return safeJsonParse(localStorage.getItem(OWNER_KEY), null);
    } catch (_error) {
      return null;
    }
  }

  function ownerIsLive(owner) {
    return Boolean(owner && Date.now() - Number(owner.updatedAt || 0) < OWNER_TTL);
  }

  function writeOwner(type) {
    const owner = { id: tabId, type, updatedAt: Date.now() };
    try {
      localStorage.setItem(OWNER_KEY, JSON.stringify(owner));
    } catch (_error) {
      // BroadcastChannel still provides best-effort ownership.
    }
    return owner;
  }

  function clearOwner() {
    const owner = readOwner();
    if (owner?.id === tabId) {
      try {
        localStorage.removeItem(OWNER_KEY);
      } catch (_error) {
        // Nothing else is required for a storage-disabled browser.
      }
    }
  }

  function post(message) {
    try {
      channel?.postMessage({ ...message, id: tabId, at: Date.now() });
    } catch (_error) {
      // Cross-tab messaging is optional.
    }
  }

  function startHeartbeat(type) {
    window.clearInterval(heartbeatTimer);
    writeOwner(type);
    heartbeatTimer = window.setInterval(() => writeOwner(type), 2200);
  }

  function claim(type) {
    startHeartbeat(type);
    post({ action: 'claim', type });
  }

  function release() {
    window.clearInterval(heartbeatTimer);
    heartbeatTimer = 0;
    clearOwner();
    post({ action: 'release' });
  }

  function scriptAssetUrl() {
    const script = Array.from(document.scripts).find((item) => /\/site-audio\.js(?:[?#]|$)/.test(item.src));
    const base = script?.src || new URL('scripts/site-audio.js', location.href).href;
    return new URL('../assets/audio/digital-clouds.mp3', base).href;
  }

  function ensureAmbientUi() {
    root = document.querySelector('[data-background-audio]');
    if (!root) {
      root = document.createElement('div');
      root.className = 'background-audio';
      root.dataset.backgroundAudio = '';
      root.innerHTML = [
        '<audio id="background-audio-track" loop preload="metadata"></audio>',
        '<button class="background-audio-toggle" type="button" aria-label="播放背景音乐" aria-pressed="false" title="播放背景音乐" data-background-audio-toggle>',
        '  <span class="background-audio-bars" aria-hidden="true"><i></i><i></i><i></i></span>',
        '</button>'
      ].join('');
      document.body.appendChild(root);
    }

    audio = root.querySelector('audio');
    toggle = root.querySelector('[data-background-audio-toggle]');
    if (!audio || !toggle) return false;
    audio.volume = Math.min(1, Math.max(0, Number(state.volume) || defaultState.volume));
    audio.muted = Boolean(state.muted);
    return true;
  }

  function setUi(status) {
    if (!root || !toggle) return;
    const playing = status === 'playing';
    root.dataset.state = status;
    toggle.setAttribute('aria-pressed', String(playing));
    const label = playing
      ? '暂停背景音乐'
      : status === 'blocked'
        ? '恢复背景音乐'
        : status === 'error'
          ? '背景音乐暂不可用'
        : '播放背景音乐';
    toggle.setAttribute('aria-label', label);
    toggle.title = label;
  }

  function markAudioUnavailable() {
    state.shouldPlay = false;
    state.blocked = false;
    setUi('error');
    release();
    writeSession();
  }

  function syncCurrentTime() {
    if (!audio || !Number.isFinite(audio.currentTime)) return;
    state.currentTime = Math.max(0, audio.currentTime);
    state.volume = audio.volume;
    state.muted = audio.muted;
  }

  function persist() {
    syncCurrentTime();
    writeSession();
  }

  function pauseForExternalOwner() {
    if (!audio) return;
    audio.pause();
    setUi('external');
    window.clearInterval(heartbeatTimer);
    heartbeatTimer = 0;
  }

  function canClaimAudio() {
    const owner = readOwner();
    return !ownerIsLive(owner) || owner.id === tabId;
  }

  function disarmGestureResume() {
    if (!gestureResumeArmed || !gestureResumeHandler) return;
    window.removeEventListener('pointerdown', gestureResumeHandler, true);
    window.removeEventListener('keydown', gestureResumeHandler, true);
    gestureResumeArmed = false;
    gestureResumeHandler = null;
  }

  function armGestureResume() {
    if (
      gestureResumeArmed ||
      policy !== 'ambient' ||
      !state.shouldPlay ||
      !state.consent
    ) return;
    gestureResumeArmed = true;
    gestureResumeHandler = (event) => {
      if (event.target?.closest?.('[data-background-audio-toggle]')) return;
      disarmGestureResume();
      state.blocked = false;
      play();
    };
    window.addEventListener('pointerdown', gestureResumeHandler, true);
    window.addEventListener('keydown', gestureResumeHandler, true);
  }

  async function play(options) {
    if (!audio || policy !== 'ambient') return false;
    const settings = { userInitiated: false, ...options };
    if (!settings.userInitiated && !canClaimAudio()) {
      setUi('external');
      return false;
    }

    if (settings.userInitiated) {
      state.consent = true;
      state.shouldPlay = true;
      state.blocked = false;
    }
    claim('audio');

    try {
      if (Number.isFinite(state.currentTime) && Math.abs(audio.currentTime - state.currentTime) > .8) {
        audio.currentTime = state.currentTime;
      }
      await audio.play();
      state.shouldPlay = true;
      state.blocked = false;
      disarmGestureResume();
      setUi('playing');
      persist();
      return true;
    } catch (_error) {
      release();
      if (audio.error || audio.networkState === HTMLMediaElement.NETWORK_NO_SOURCE) {
        markAudioUnavailable();
        return false;
      }
      // A full-page navigation can revoke autoplay even after the visitor
      // previously pressed play. Keep the saved intent and resume from the
      // same timestamp on the next ordinary gesture instead of treating it
      // as a broken audio asset.
      state.blocked = Boolean(settings.userInitiated);
      setUi('blocked');
      if (!settings.userInitiated) armGestureResume();
      writeSession();
      return false;
    }
  }

  function pause(options) {
    if (!audio) return;
    const settings = { userInitiated: false, ...options };
    syncCurrentTime();
    audio.pause();
    if (settings.userInitiated) {
      state.shouldPlay = false;
      state.blocked = false;
    }
    disarmGestureResume();
    release();
    setUi('paused');
    writeSession();
  }

  function scheduleResume() {
    window.clearTimeout(resumeTimer);
    if (!state.shouldPlay || !state.consent || state.blocked || document.hidden) return;
    const delay = 90 + Array.from(tabId).reduce((sum, char) => sum + char.charCodeAt(0), 0) % 180;
    resumeTimer = window.setTimeout(() => {
      if (canClaimAudio()) play();
    }, delay);
  }

  function bindChannel() {
    if ('BroadcastChannel' in window) {
      try {
        channel = new BroadcastChannel(CHANNEL_NAME);
        channel.addEventListener('message', (event) => {
          const message = event.data || {};
          if (message.id === tabId) return;
          if (message.action === 'claim') pauseForExternalOwner();
          if (message.action === 'release') scheduleResume();
        });
      } catch (_error) {
        channel = null;
      }
    }

    window.addEventListener('storage', (event) => {
      if (event.key !== OWNER_KEY) return;
      const owner = safeJsonParse(event.newValue, null);
      if (ownerIsLive(owner) && owner.id !== tabId) pauseForExternalOwner();
      if (!owner) scheduleResume();
    });
  }

  function bindLifecycle() {
    window.addEventListener('pagehide', () => {
      persist();
      release();
      channel?.close();
    });
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) scheduleResume();
    });
  }

  function initAmbient() {
    if (!ensureAmbientUi()) return;
    setUi(state.blocked ? 'blocked' : 'paused');

    audio.addEventListener('loadedmetadata', () => {
      if (!Number.isFinite(state.currentTime) || !audio.duration) return;
      audio.currentTime = Math.min(state.currentTime, Math.max(0, audio.duration - .25));
    }, { once: true });
    audio.addEventListener('play', () => setUi('playing'));
    audio.addEventListener('pause', () => {
      if (root?.dataset.state === 'external') return;
      if (root?.dataset.state !== 'blocked' && root?.dataset.state !== 'error') setUi('paused');
    });
    audio.addEventListener('error', () => {
      markAudioUnavailable();
    });
    audio.addEventListener('timeupdate', () => {
      const now = Date.now();
      if (now - persistTimer < 1600) return;
      persistTimer = now;
      persist();
    });
    toggle.addEventListener('click', () => {
      if (audio.paused) play({ userInitiated: true });
      else pause({ userInitiated: true });
    });

    if (!audio.getAttribute('src')) audio.src = scriptAssetUrl();
    if (audio.error) markAudioUnavailable();

    if (state.shouldPlay && state.consent && !state.blocked) {
      window.setTimeout(() => play(), 80);
    } else if (state.shouldPlay && state.consent) {
      armGestureResume();
    }
  }

  function initMedia() {
    claim('media');
  }

  bindChannel();
  bindLifecycle();
  if (policy === 'ambient') initAmbient();
  if (policy === 'media') initMedia();

  window.JanetSiteAudio = {
    getState: () => ({ ...state, policy, owner: readOwner() }),
    play: () => play({ userInitiated: true }),
    pause: () => pause({ userInitiated: true })
  };
})();
