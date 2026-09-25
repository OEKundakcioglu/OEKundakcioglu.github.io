(() => {
  'use strict';

  const AUDIO = ['mp3', 'm4a', 'aac', 'wav', 'flac', 'ogg', 'oga', 'opus'];
  const VIDEO = ['mp4', 'm4v', 'mov', 'webm', 'ogv'];
  const PREFIX = '/music/';
  const STORE_KEY = 'music-player';
  const REPEAT_MODES = ['off', 'all', 'one'];

  const root = document.getElementById('music-player');
  const data = document.getElementById('music-files');
  if (!root || !data) return;

  const q = (selector) => root.querySelector(selector);
  const titleEl = q('.mp-title');
  const subEl = q('.mp-sub');
  const statusEl = q('.mp-status');
  const countEl = q('.mp-count');
  const screenEl = q('.mp-screen');
  const video = q('.mp-video');
  const audio = q('.mp-audio');
  const shuffleBtn = q('[data-action="shuffle"]');
  const repeatBtn = q('[data-action="repeat"]');

  const collate = (a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });

  function parseTrack(path) {
    if (typeof path !== 'string' || path.indexOf(PREFIX) !== 0) return null;
    const rel = path.slice(PREFIX.length);
    const parts = rel.split('/');
    const file = parts.pop();
    const dot = file.lastIndexOf('.');
    if (dot < 0 || file.startsWith('.')) return null;
    const ext = file.slice(dot + 1).toLowerCase();
    const kind = AUDIO.includes(ext) ? 'audio' : VIDEO.includes(ext) ? 'video' : null;
    if (!kind) return null;
    return {
      rel,
      src: path.split('/').map(encodeURIComponent).join('/'),
      folder: parts.join(' / '),
      title: file.slice(0, dot).replace(/_/g, ' ').trim() || file,
      ext,
      kind,
    };
  }

  let paths = [];
  try {
    paths = JSON.parse(data.textContent) || [];
  } catch (e) {
    paths = [];
  }

  const tracks = paths
    .map(parseTrack)
    .filter(Boolean)
    .sort((a, b) => collate(a.folder, b.folder) || collate(a.rel, b.rel));

  if (!tracks.length) {
    q('.mp-empty').hidden = false;
    return;
  }
  q('.mp-now').hidden = false;

  const settings = { volume: 1, muted: false, shuffle: false, repeat: 'off' };
  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY)) || {};
    if (typeof saved.volume === 'number' && saved.volume >= 0 && saved.volume <= 1) settings.volume = saved.volume;
    if (typeof saved.muted === 'boolean') settings.muted = saved.muted;
    if (typeof saved.shuffle === 'boolean') settings.shuffle = saved.shuffle;
    if (REPEAT_MODES.includes(saved.repeat)) settings.repeat = saved.repeat;
  } catch (e) {
    /* storage unavailable: keep defaults */
  }

  const save = () => {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(settings));
    } catch (e) {
      /* storage unavailable */
    }
  };

  function span(className, text) {
    const el = document.createElement('span');
    el.className = className;
    if (text) el.textContent = text;
    return el;
  }

  const items = [];
  const listEl = q('.mp-playlist');
  const hasFolders = tracks.some((t) => t.folder);
  let list = null;
  let group = null;
  let number = 0;

  tracks.forEach((t, i) => {
    if (!list || t.folder !== group) {
      group = t.folder;
      number = 0;
      if (hasFolders && t.folder) {
        const heading = document.createElement('div');
        heading.className = 'mp-group';
        heading.setAttribute('role', 'heading');
        heading.setAttribute('aria-level', '2');
        heading.textContent = t.folder;
        listEl.appendChild(heading);
      }
      list = document.createElement('ol');
      list.className = 'mp-list';
      listEl.appendChild(list);
    }
    number += 1;

    const bars = span('mp-bars');
    bars.setAttribute('aria-hidden', 'true');
    bars.append(span(''), span(''), span(''));

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = t.kind === 'video' ? 'mp-item is-video' : 'mp-item';
    btn.dataset.index = String(i);
    btn.setAttribute('aria-label', t.kind === 'video' ? `${t.title} (video)` : t.title);
    btn.append(span('mp-num', String(number)), bars, span('mp-name', t.title), span('mp-ext', t.ext.toUpperCase()));

    const li = document.createElement('li');
    li.appendChild(btn);
    list.appendChild(li);
    items.push(btn);
  });

  let order = [];
  let pos = -1;
  let current = -1;
  let media = null;

  function buildOrder() {
    order = tracks.map((_, i) => i);
    if (settings.shuffle) {
      for (let i = order.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [order[i], order[j]] = [order[j], order[i]];
      }
      if (current >= 0) {
        order.splice(order.indexOf(current), 1);
        order.unshift(current);
      }
    }
    pos = order.indexOf(current);
  }

  function setStatus(text, isError) {
    statusEl.textContent = text;
    statusEl.classList.toggle('is-error', Boolean(isError));
  }

  function render() {
    items.forEach((btn, i) => {
      const active = i === current;
      btn.classList.toggle('is-active', active);
      if (active) btn.setAttribute('aria-current', 'true');
      else btn.removeAttribute('aria-current');
    });
    const t = tracks[current];
    titleEl.textContent = t ? t.title : '';
    subEl.textContent = t ? t.folder : '';
    countEl.textContent = t ? `${current + 1} / ${tracks.length}` : '';

    shuffleBtn.setAttribute('aria-pressed', String(settings.shuffle));
    const label = `Repeat: ${settings.repeat}`;
    repeatBtn.setAttribute('aria-pressed', String(settings.repeat !== 'off'));
    repeatBtn.setAttribute('aria-label', label);
    repeatBtn.title = label;
    repeatBtn.dataset.mode = settings.repeat;
  }

  const session = 'mediaSession' in navigator ? navigator.mediaSession : null;
  const artwork = [{ src: new URL('/apple-touch-icon.png', location.href).href, sizes: '180x180', type: 'image/png' }];

  function updateSession(t) {
    if (!session || typeof window.MediaMetadata !== 'function') return;
    try {
      session.metadata = new window.MediaMetadata({ title: t.title, artist: t.folder || 'erhun.me', artwork });
    } catch (e) {
      /* metadata not supported */
    }
  }

  function setHash(t) {
    const hash = `#${encodeURIComponent(t.rel).replace(/%2F/g, '/')}`;
    if (location.hash === hash) return;
    try {
      history.replaceState(null, '', hash);
    } catch (e) {
      /* history not available */
    }
  }

  function indexFromHash() {
    if (location.hash.length < 2) return -1;
    let rel;
    try {
      rel = decodeURIComponent(location.hash.slice(1));
    } catch (e) {
      return -1;
    }
    return tracks.findIndex((t) => t.rel === rel);
  }

  function play() {
    if (!media) return;
    const promise = media.play();
    if (promise && promise.catch) {
      promise.catch((err) => {
        if (err && err.name === 'NotAllowedError') setStatus('Press play to start.');
      });
    }
  }

  /* iOS keeps <audio> playing with the screen locked but pauses <video>, so each kind gets its own element. */
  function load(index, { autoplay = false, updateHash = true } = {}) {
    const t = tracks[index];
    if (!t) return;
    const next = t.kind === 'video' ? video : audio;
    const other = next === video ? audio : video;
    if (other.getAttribute('src')) {
      other.pause();
      other.removeAttribute('src');
      other.load();
    }

    media = next;
    current = index;
    pos = order.indexOf(index);
    media.volume = settings.volume;
    media.muted = settings.muted;
    media.src = t.src;
    root.classList.remove('is-playing');
    screenEl.hidden = t.kind !== 'video';
    audio.hidden = t.kind !== 'audio';
    items[index].classList.remove('is-error');

    setStatus('');
    render();
    updateSession(t);
    if (updateHash) setHash(t);
    if (autoplay) play();
  }

  function step(direction, automatic) {
    let target = pos + direction;
    if (target < 0 || target >= order.length) {
      if (automatic && settings.repeat === 'off') return;
      target = (target + order.length) % order.length;
    }
    load(order[target], { autoplay: true });
  }

  function previous() {
    if (media && media.currentTime > 3) {
      media.currentTime = 0;
      play();
      return;
    }
    step(-1, false);
  }

  function next() {
    step(1, false);
  }

  [audio, video].forEach((el) => {
    el.addEventListener('play', () => {
      if (el === media) root.classList.add('is-playing');
    });
    el.addEventListener('pause', () => {
      if (el === media) root.classList.remove('is-playing');
    });
    el.addEventListener('playing', () => {
      if (el === media) setStatus('');
    });
    el.addEventListener('ended', () => {
      if (el !== media) return;
      if (settings.repeat === 'one') {
        el.currentTime = 0;
        play();
      } else {
        step(1, true);
      }
    });
    el.addEventListener('error', () => {
      if (el !== media || !el.getAttribute('src')) return;
      items[current].classList.add('is-error');
      root.classList.remove('is-playing');
      setStatus('This file cannot be played in this browser.', true);
    });
    el.addEventListener('volumechange', () => {
      if (el !== media) return;
      settings.volume = el.volume;
      settings.muted = el.muted;
      save();
    });
  });

  root.addEventListener('click', (event) => {
    const btn = event.target.closest('button');
    if (!btn || !root.contains(btn)) return;

    if (btn.classList.contains('mp-item')) {
      const index = Number(btn.dataset.index);
      if (index === current) {
        if (media.paused) play();
        else media.pause();
      } else {
        load(index, { autoplay: true });
      }
      return;
    }

    switch (btn.dataset.action) {
      case 'prev':
        previous();
        break;
      case 'next':
        next();
        break;
      case 'shuffle':
        settings.shuffle = !settings.shuffle;
        buildOrder();
        save();
        render();
        break;
      case 'repeat':
        settings.repeat = REPEAT_MODES[(REPEAT_MODES.indexOf(settings.repeat) + 1) % REPEAT_MODES.length];
        save();
        render();
        break;
      default:
        break;
    }
  });

  window.addEventListener('hashchange', () => {
    const index = indexFromHash();
    if (index >= 0 && index !== current) load(index, { autoplay: true, updateHash: false });
  });

  if (session) {
    const actions = {
      play: () => play(),
      pause: () => media && media.pause(),
      previoustrack: previous,
      nexttrack: next,
    };
    Object.keys(actions).forEach((action) => {
      try {
        session.setActionHandler(action, actions[action]);
      } catch (e) {
        /* action not supported */
      }
    });
  }

  current = indexFromHash();
  buildOrder();
  load(current >= 0 ? current : order[0], { updateHash: false });
})();
