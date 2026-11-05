// Shared helpers for the phone (sender) and TV (receiver) pages.
(function () {
  const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no 0/O, 1/I/L to avoid confusion
  const PREFIX = 'tvmirror-';
  const params = new URLSearchParams(location.search);

  // PeerJS options. By default the free public PeerJS signaling server is used
  // (only used to find each other; the video itself travels directly over Wi-Fi).
  // For a self-hosted signaling server add ?host=192.168.1.10&port=9000&path=/ to the URL.
  function peerOptions() {
    const o = { debug: 1 };
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

  window.TVM = { params, peerOptions, randomCode, normalizeCode, peerIdFor, siblingUrl, setStatus, ALPHABET };
})();
