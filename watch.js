// Phone side: open and watch. Remembers the key, connects on its own, retries until the
// home camera answers, and recovers from dropped connections.
(function () {
  const { params, peerOptions, normalizeKey, camPeerId, siblingUrl, store, load, keepAwake } = window.TVM;
  const $ = id => document.getElementById(id);
  const video = $('screen'), setup = $('setup'), keyInput = $('keyInput'), saveKey = $('saveKey'), camLink = $('camLink'),
    connecting = $('connecting'), connTitle = $('connTitle'), connText = $('connText'),
    topbar = $('topbar'), liveDot = $('liveDot'), liveText = $('liveText'), settingsBtn = $('settingsBtn'), soundBtn = $('soundBtn');

  const KEY_STORE = 'tvwatch.key';
  let key = normalizeKey(params.get('key')) || normalizeKey(load(KEY_STORE));
  if (params.get('key')) { store(KEY_STORE, key); history.replaceState(null, '', siblingUrl('watch.html')); }
  camLink.textContent = 'Camera page for the home device: ' + siblingUrl('camera.html').replace(/^https?:\/\//, '');

  let peer = null, conn = null, call = null, retryTimer = null, pingTimer = null, hideTimer = null, attempt = 0, gotVideo = false;
  const wake = { lock: null };

  function show(which) {
    setup.hidden = which !== 'setup'; connecting.hidden = which !== 'connecting';
    video.hidden = which !== 'video'; topbar.classList.toggle('hide', false);
    if (which !== 'video') soundBtn.hidden = true;
  }
  function live(kind, text) { liveDot.className = 'dot ' + kind; liveText.textContent = text; }

  function cleanup() {
    clearTimeout(retryTimer); clearInterval(pingTimer);
    if (call) { try { call.close(); } catch {} call = null; }
    if (conn) { try { conn.close(); } catch {} conn = null; }
    if (peer) { try { peer.destroy(); } catch {} peer = null; }
  }

  function scheduleRetry(reason) {
    clearTimeout(retryTimer);
    attempt++;
    const wait = Math.min(3000 * attempt, 15000);
    if (!gotVideo) { show('connecting'); connTitle.textContent = reason; connText.textContent = 'Trying again in ' + Math.round(wait / 1000) + ' s. Check that the camera page at home is open and online.'; }
    live('warn', 'Reconnecting…');
    retryTimer = setTimeout(connect, wait);
  }

  function connect() {
    if (!key) { show('setup'); return; }
    cleanup();
    if (!gotVideo) { show('connecting'); connTitle.textContent = 'Connecting to home…'; connText.textContent = 'Looking for the camera at home.'; }
    peer = new Peer(undefined, peerOptions());
    peer.on('open', () => {
      conn = peer.connect(camPeerId(key), { reliable: true });
      conn.on('open', () => { if (!gotVideo) connText.textContent = 'Found it. Waiting for video…'; pingTimer = setInterval(() => { try { conn.send({ type: 'ping' }); } catch {} }, 10000); });
      conn.on('data', d => { if (d && d.type === 'no-camera') { connTitle.textContent = 'Home device found, but its camera is off'; connText.textContent = 'Press "Start camera" on the camera page at home.'; } });
      conn.on('close', () => scheduleRetry('Home camera went offline'));
      conn.on('error', () => scheduleRetry('Connection problem'));
    });
    peer.on('call', c => {
      call = c;
      c.answer();
      c.on('stream', s => {
        if (video.srcObject === s) return;
        video.srcObject = s;
        gotVideo = true; attempt = 0;
        show('video'); live('ok', 'Live');
        video.muted = true;
        video.play().then(() => { soundBtn.hidden = false; tryUnmute(); }).catch(() => { soundBtn.hidden = false; });
        keepAwake(wake); autoHideBar();
      });
      c.on('iceStateChanged', st => {
        if (st === 'failed' || st === 'closed') { gotVideo = false; scheduleRetry('Video connection dropped'); }
        else if (st === 'disconnected') live('warn', 'Weak connection…');
        else if (st === 'connected' || st === 'completed') live('ok', 'Live');
      });
      c.on('close', () => { gotVideo = false; scheduleRetry('Home camera went offline'); });
    });
    peer.on('error', err => {
      if (err.type === 'peer-unavailable') scheduleRetry('Home camera is offline');
      else scheduleRetry('No connection (' + err.type + ')');
    });
    peer.on('disconnected', () => { if (peer && !peer.destroyed) peer.reconnect(); });
  }

  function tryUnmute() {
    video.muted = false;
    video.play().then(() => { soundBtn.hidden = true; }).catch(() => { video.muted = true; video.play().catch(() => {}); soundBtn.hidden = false; });
  }
  soundBtn.addEventListener('click', () => { tryUnmute(); goFullscreen(); });

  function goFullscreen() {
    const el = document.documentElement, fn = el.requestFullscreen || el.webkitRequestFullscreen;
    if (fn && !document.fullscreenElement) { try { fn.call(el).catch(() => {}); } catch {} }
    try { screen.orientation && screen.orientation.lock && screen.orientation.lock('landscape').catch(() => {}); } catch {}
  }
  function autoHideBar() { topbar.classList.remove('hide'); clearTimeout(hideTimer); hideTimer = setTimeout(() => topbar.classList.add('hide'), 3500); }
  video.addEventListener('click', () => { autoHideBar(); if (topbar.classList.contains('hide')) return; });
  video.addEventListener('dblclick', goFullscreen);

  settingsBtn.addEventListener('click', () => { keyInput.value = key || ''; show('setup'); });
  saveKey.addEventListener('click', () => {
    const k = normalizeKey(keyInput.value);
    if (k.length < 4) { keyInput.focus(); return; }
    key = k; store(KEY_STORE, k); gotVideo = false; attempt = 0; connect();
  });
  keyInput.addEventListener('keydown', e => { if (e.key === 'Enter') saveKey.click(); });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') { keepAwake(wake); if (!gotVideo || (call && call.peerConnection && call.peerConnection.iceConnectionState === 'failed')) { attempt = 0; connect(); } }
  });
  window.addEventListener('online', () => { attempt = 0; connect(); });

  connect();
})();
