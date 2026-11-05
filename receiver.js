// TV side: show a code, wait for the phone, then play whatever it sends full screen.
(function () {
  const { peerOptions, randomCode, peerIdFor, siblingUrl } = window.TVM;
  const $ = id => document.getElementById(id);
  const lobby = $('lobby'), codeEl = $('code'), qrEl = $('qr'), urlEl = $('url'), video = $('screen'),
    overlay = $('overlay'), toast = $('toast'), status = $('status');

  let peer = null, code = null, activeCall = null, toastTimer = null;

  function showToast(msg, ms = 4000) {
    toast.textContent = msg; toast.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => toast.classList.remove('show'), ms);
  }

  function renderCode() {
    codeEl.textContent = code;
    const link = siblingUrl('index.html', { room: code });
    urlEl.textContent = link.replace(/^https?:\/\//, '');
    try {
      const qr = qrcode(0, 'M'); qr.addData(link); qr.make();
      qrEl.innerHTML = qr.createSvgTag({ cellSize: 4, margin: 0, scalable: true });
    } catch { qrEl.hidden = true; }
  }

  function start() {
    code = randomCode(4);
    renderCode();
    if (peer) peer.destroy();
    status.textContent = 'Connecting…';
    peer = new Peer(peerIdFor(code), peerOptions());
    peer.on('open', () => { status.textContent = 'Waiting for your phone'; });
    peer.on('error', err => {
      if (err.type === 'unavailable-id') { start(); return; } // code taken, pick another
      status.textContent = 'Cannot reach the signaling server (' + err.type + '). Check the TV internet connection; retrying…';
      setTimeout(() => { if (!activeCall) start(); }, 5000);
    });
    peer.on('disconnected', () => { if (!peer.destroyed) peer.reconnect(); });
    peer.on('call', onCall);
  }

  function onCall(call) {
    if (activeCall) { try { activeCall.close(); } catch {} }
    activeCall = call;
    call.answer(); // we only receive
    call.on('stream', stream => {
      if (video.srcObject === stream) return; // PeerJS fires this once per track
      video.srcObject = stream;
      lobby.hidden = true; video.hidden = false;
      const name = call.metadata && call.metadata.name;
      if (name) showToast('Now playing: ' + name);
      tryPlay();
      stream.getVideoTracks().forEach(t => t.addEventListener('ended', () => { if (activeCall === call) backToLobby(); }));
    });
    call.on('close', () => { if (activeCall === call) backToLobby(); });
    call.on('error', e => { if (activeCall !== call) return; showToast('Error: ' + (e.message || e)); backToLobby(); });
  }

  function tryPlay() {
    video.muted = false;
    video.play().then(() => { overlay.hidden = true; }).catch(err => {
      if (err && err.name === 'AbortError') return; // superseded by a newer play(), not a real block
      // Autoplay with sound was blocked; ask for one press of OK / a click.
      overlay.hidden = false;
      video.muted = true; video.play().catch(() => {});
    });
  }

  function backToLobby() {
    if (!activeCall) return;
    activeCall = null;
    video.srcObject = null; video.hidden = true; overlay.hidden = true; lobby.hidden = false;
    showToast('Phone disconnected');
  }

  function goFullscreen() {
    const el = document.documentElement;
    const fn = el.requestFullscreen || el.webkitRequestFullscreen;
    if (fn && !document.fullscreenElement) fn.call(el).catch(() => {});
  }
  overlay.addEventListener('click', () => { video.muted = false; video.play().then(() => overlay.hidden = true).catch(() => {}); goFullscreen(); });
  document.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') { if (!overlay.hidden) overlay.click(); else goFullscreen(); }
  });
  document.addEventListener('dblclick', goFullscreen);

  start();
})();
