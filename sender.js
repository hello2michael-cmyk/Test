// Phone side: play a video here and send the same picture + sound to the TV.
(function () {
  const { params, peerOptions, normalizeCode, peerIdFor, siblingUrl, setStatus } = window.TVM;
  const $ = id => document.getElementById(id);

  const video = $('video');
  const fileInput = $('file');
  const urlInput = $('url');
  const loadUrlBtn = $('loadUrl');
  const codeInput = $('code');
  const sendBtn = $('send');
  const stopBtn = $('stop');
  const status = $('status');
  const castStatus = $('castStatus');
  const castBtn = $('castBtn');
  const tvLink = $('tvLink');
  const sourceName = $('sourceName');

  tvLink.href = siblingUrl('tv.html');
  tvLink.textContent = tvLink.href.replace(/^https?:\/\//, '');

  // ---------- Source handling ----------
  let currentObjectUrl = null;
  let sourceKind = null; // 'file' | 'url'

  function setSource(src, kind, name) {
    if (currentObjectUrl) { URL.revokeObjectURL(currentObjectUrl); currentObjectUrl = null; }
    if (kind === 'file') currentObjectUrl = src;
    sourceKind = kind;
    video.crossOrigin = kind === 'url' ? 'anonymous' : null;
    video.src = src;
    video.load();
    sourceName.textContent = name;
    video.play().catch(() => {});
    updateCastAvailability();
    if (call) connect(); // already mirroring: restart with the new source
  }

  fileInput.addEventListener('change', () => {
    const f = fileInput.files && fileInput.files[0];
    if (!f) return;
    setSource(URL.createObjectURL(f), 'file', f.name);
  });

  loadUrlBtn.addEventListener('click', () => {
    const u = urlInput.value.trim();
    if (!u) return;
    setSource(u, 'url', u);
  });
  urlInput.addEventListener('keydown', e => { if (e.key === 'Enter') loadUrlBtn.click(); });

  // ---------- Capturing the playing video as a stream ----------
  let canvasLoop = null;
  let audioGraph = null;

  function captureVideo() {
    if (video.captureStream) return video.captureStream();
    if (video.mozCaptureStream) return video.mozCaptureStream();
    // Fallback (iOS Safari): draw frames onto a canvas and capture that, plus audio via Web Audio.
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const fit = () => { canvas.width = video.videoWidth || 1280; canvas.height = video.videoHeight || 720; };
    fit();
    video.addEventListener('loadedmetadata', fit);
    if (canvasLoop) cancelAnimationFrame(canvasLoop);
    const draw = () => { ctx.drawImage(video, 0, 0, canvas.width, canvas.height); canvasLoop = requestAnimationFrame(draw); };
    draw();
    const stream = canvas.captureStream(30);
    try {
      if (!audioGraph) {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        const ac = new Ctx();
        const src = ac.createMediaElementSource(video);
        const dest = ac.createMediaStreamDestination();
        src.connect(dest);
        src.connect(ac.destination);
        audioGraph = { ac, dest };
      }
      audioGraph.ac.resume();
      audioGraph.dest.stream.getAudioTracks().forEach(t => stream.addTrack(t));
    } catch (e) { console.warn('No audio capture available', e); }
    return stream;
  }

  // ---------- Mirroring over WebRTC (PeerJS) ----------
  let peer = null;
  let call = null;
  let wakeLock = null;

  function ensurePeer() {
    return new Promise((resolve, reject) => {
      if (peer && !peer.destroyed && !peer.disconnected) return resolve(peer);
      if (peer) peer.destroy();
      peer = new Peer(undefined, peerOptions());
      peer.on('open', () => resolve(peer));
      peer.on('error', err => {
        if (err.type === 'peer-unavailable') {
          setStatus(status, 'err', 'No TV found with that code. Check the code on the TV screen.');
          sendBtn.disabled = false;
        } else if (err.type === 'network' || err.type === 'server-error' || err.type === 'socket-error') {
          setStatus(status, 'err', 'Could not reach the signaling server. Check your internet connection.');
          sendBtn.disabled = false;
        } else {
          setStatus(status, 'err', 'Error: ' + (err.message || err.type));
          sendBtn.disabled = false;
        }
        reject(err);
      });
      peer.on('disconnected', () => { if (!peer.destroyed) peer.reconnect(); });
    });
  }

  async function connect() {
    const code = normalizeCode(codeInput.value);
    codeInput.value = code;
    if (code.length !== 4) { setStatus(status, 'warn', 'Type the 4-character code shown on the TV.'); codeInput.focus(); return; }
    if (!video.currentSrc && !video.src) { setStatus(status, 'warn', 'Pick a video first.'); return; }

    sendBtn.disabled = true;
    setStatus(status, 'busy', 'Connecting to TV ' + code + '…');
    try {
      await ensurePeer();
    } catch { return; }

    if (call) { try { call.close(); } catch {} call = null; }
    if (video.paused) { try { await video.play(); } catch {} }
    const stream = captureVideo();
    if (!stream.getTracks().length) {
      setStatus(status, 'err', 'Nothing to send yet. Press play on the video and try again.');
      sendBtn.disabled = false; return;
    }
    const c = peer.call(peerIdFor(code), stream, { metadata: { name: sourceName.textContent } });
    call = c;
    if (!c) { setStatus(status, 'err', 'Could not start the call.'); sendBtn.disabled = false; return; }
    const mine = () => call === c; // ignore events from a call we already replaced
    let opened = false;
    c.on('stream', () => {}); // receiver sends nothing back
    c.on('iceStateChanged', st => {
      if (!mine()) return;
      if (st === 'connected' || st === 'completed') {
        opened = true;
        setStatus(status, 'ok', 'Playing on TV ' + code + '. Keep this page open.');
        stopBtn.hidden = false; sendBtn.textContent = 'Reconnect'; sendBtn.disabled = false;
        requestWakeLock();
      } else if (st === 'failed') {
        setStatus(status, 'err', 'Connection failed. Make sure phone and TV are on the same Wi-Fi.');
        sendBtn.disabled = false;
      } else if (st === 'disconnected' && opened) {
        setStatus(status, 'warn', 'Connection lost, trying to recover…');
      }
    });
    c.on('close', () => {
      if (!mine()) return;
      call = null; setStatus(status, 'warn', 'TV disconnected.');
      stopBtn.hidden = true; sendBtn.textContent = 'Send to TV'; sendBtn.disabled = false;
    });
    c.on('error', e => { if (!mine()) return; setStatus(status, 'err', 'Error: ' + (e.message || e)); sendBtn.disabled = false; });
    // Fallback so the button is never stuck if no ICE event arrives.
    setTimeout(() => { if (!opened && mine()) { setStatus(status, 'warn', 'Still connecting… if this takes long, check that both devices share the same Wi-Fi.'); sendBtn.disabled = false; } }, 12000);
  }

  function disconnect() {
    const c = call; call = null;
    if (c) try { c.close(); } catch {}
    if (canvasLoop) { cancelAnimationFrame(canvasLoop); canvasLoop = null; }
    stopBtn.hidden = true; sendBtn.textContent = 'Send to TV'; sendBtn.disabled = false;
    setStatus(status, '', 'Stopped.');
    if (wakeLock) { wakeLock.release().catch(() => {}); wakeLock = null; }
  }

  async function requestWakeLock() {
    try { if ('wakeLock' in navigator && !wakeLock) { wakeLock = await navigator.wakeLock.request('screen'); wakeLock.addEventListener('release', () => { wakeLock = null; }); } } catch {}
  }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && call) requestWakeLock(); });

  sendBtn.addEventListener('click', connect);
  stopBtn.addEventListener('click', disconnect);
  codeInput.addEventListener('input', () => { codeInput.value = normalizeCode(codeInput.value); });
  codeInput.addEventListener('keydown', e => { if (e.key === 'Enter') connect(); });
  if (params.get('room')) { codeInput.value = normalizeCode(params.get('room')); }

  // ---------- Tabs ----------
  document.querySelectorAll('.tabs button').forEach(btn => btn.addEventListener('click', () => {
    document.querySelectorAll('.tabs button').forEach(b => b.setAttribute('aria-selected', b === btn));
    document.querySelectorAll('.panel').forEach(p => p.hidden = p.id !== btn.dataset.panel);
  }));

  // ---------- Google Cast (Chromecast built-in on TCL Google TV / Android TV) ----------
  let castReady = false;
  function updateCastAvailability() {
    if (!castReady) return;
    const ok = sourceKind === 'url';
    castBtn.disabled = !ok;
    castStatus.textContent = ok ? 'Ready to cast this link to the TV.'
      : (sourceKind === 'file' ? 'Casting only works with a video link, not a file on the phone. Use "Mirror" for files.' : 'Load a video link first.');
  }
  window['__onGCastApiAvailable'] = function (isAvailable) {
    if (!isAvailable) { castStatus.textContent = 'Google Cast is not available in this browser. It needs Chrome on Android. On iPhone use AirPlay from the video player, or use "Mirror".'; return; }
    try {
      cast.framework.CastContext.getInstance().setOptions({
        receiverApplicationId: chrome.cast.media.DEFAULT_MEDIA_RECEIVER_APP_ID,
        autoJoinPolicy: chrome.cast.AutoJoinPolicy.ORIGIN_SCOPED
      });
      castReady = true;
      updateCastAvailability();
      cast.framework.CastContext.getInstance().addEventListener(
        cast.framework.CastContextEventType.SESSION_STATE_CHANGED, async e => {
          if (e.sessionState === cast.framework.SessionState.SESSION_STARTED || e.sessionState === cast.framework.SessionState.SESSION_RESUMED) {
            await castCurrent();
          }
        });
    } catch (e) { castStatus.textContent = 'Cast setup failed: ' + e.message; }
  };
  async function castCurrent() {
    const session = cast.framework.CastContext.getInstance().getCurrentSession();
    if (!session || sourceKind !== 'url') return;
    const url = video.currentSrc || video.src;
    const info = new chrome.cast.media.MediaInfo(url, guessMime(url));
    info.metadata = new chrome.cast.media.GenericMediaMetadata();
    info.metadata.title = sourceName.textContent;
    const req = new chrome.cast.media.LoadRequest(info);
    req.currentTime = video.currentTime || 0;
    try {
      await session.loadMedia(req);
      castStatus.textContent = 'Playing on ' + session.getCastDevice().friendlyName + '.';
      video.pause();
    } catch (e) { castStatus.textContent = 'The TV could not play this link (' + e + ').'; }
  }
  function guessMime(u) {
    const ext = (u.split('?')[0].split('.').pop() || '').toLowerCase();
    return { mp4: 'video/mp4', m4v: 'video/mp4', webm: 'video/webm', m3u8: 'application/x-mpegURL', mpd: 'application/dash+xml', mov: 'video/mp4', mkv: 'video/x-matroska' }[ext] || 'video/mp4';
  }
  castBtn.addEventListener('click', async () => {
    try {
      const ctx = cast.framework.CastContext.getInstance();
      if (ctx.getCurrentSession()) await castCurrent(); else await ctx.requestSession();
    } catch (e) { if (e !== 'cancel') castStatus.textContent = 'Cast failed: ' + e; }
  });
  // Load the Cast SDK; it reports itself unavailable in browsers that cannot cast.
  (function loadCastSdk() {
    const s = document.createElement('script');
    s.src = 'https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1';
    s.onerror = () => { castStatus.textContent = 'Could not load Google Cast. Check your internet connection, or use "Mirror".'; };
    document.head.appendChild(s);
  })();
})();
