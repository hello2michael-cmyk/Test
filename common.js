// Shared helpers for the phone (sender) and TV (receiver) pages.
(function () {
  const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no 0/O, 1/I/L to avoid confusion
  const PREFIX = 'tvmirror-';
  const params = new URLSearchParams(location.search);

  // PeerJS options. By default the free public PeerJS signaling server is used
  // (only used to find each other; the video itself travels directly over Wi-Fi).
  // For a self-hosted signaling server add ?host=192.168.1.10&port=9000&path=/ to the URL.
  // STUN finds the direct route on the same Wi-Fi or across the internet. The public
  // Open Relay TURN servers (no sign-up, no key) are a fallback for strict mobile networks.
  function iceServers() {
    return [
      { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
      { urls: 'stun:openrelay.metered.ca:80' },
      { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
      { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
      { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' }
    ];
  }

  function peerOptions() {
    const o = { debug: 1, config: { iceServers: iceServers(), sdpSemantics: 'unified-plan' } };
    if (params.get('host')) {
      o.host = params.get('host');
      o.port = Number(params.get('port') || 9000);
      o.path = params.get('path') || '/';
      o.secure = params.get('secure') === '1';
    }
    return o;
  }

  function randomCode(len = 4) {
    const bytes = new Uint8Array(len);
    crypto.getRandomValues(bytes);
    let s = '';
    for (const b of bytes) s += ALPHABET[b % ALPHABET.length];
    return s;
  }

  function normalizeCode(s) {
    return String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
  }

  function peerIdFor(code) { return PREFIX + normalizeCode(code); }

  // Home-camera keys: longer random strings, remembered on the device.
  const CAM_PREFIX = 'tvcam-';
  function normalizeKey(s) { return String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 16); }
  function camPeerId(key) { return CAM_PREFIX + normalizeKey(key); }
  function store(k, v) { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch {} }
  function load(k) { try { return localStorage.getItem(k); } catch { return null; } }
  async function keepAwake(state) {
    try {
      if ('wakeLock' in navigator && !state.lock) {
        state.lock = await navigator.wakeLock.request('screen');
        state.lock.addEventListener('release', () => { state.lock = null; });
      }
    } catch {}
  }

  // Keep the signaling-server overrides when building links between the pages.
  function siblingUrl(page, extra = {}) {
    const u = new URL(page, location.href);
    for (const k of ['host', 'port', 'path', 'secure']) if (params.get(k)) u.searchParams.set(k, params.get(k));
    for (const [k, v] of Object.entries(extra)) u.searchParams.set(k, v);
    return u.toString();
  }

  function setStatus(el, kind, text) {
    const dot = el.querySelector('.dot');
    const span = el.querySelector('span:not(.dot)');
    dot.className = 'dot ' + kind;
    span.textContent = text;
  }

  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }

  window.TVM = { params, peerOptions, iceServers, randomCode, normalizeCode, peerIdFor, siblingUrl, setStatus, ALPHABET,
    normalizeKey, camPeerId, store, load, keepAwake };
})();
