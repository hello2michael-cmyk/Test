// Home side: a spare phone / tablet / laptop pointed at the TV. Streams its camera to any
// phone that knows the key. Reconnects on its own; nothing to do after the first setup.
(function () {
  const { peerOptions, normalizeKey, camPeerId, siblingUrl, setStatus, store, load, keepAwake, ALPHABET } = window.TVM;
  const $ = id => document.getElementById(id);
  const preview = $('preview'), select = $('cameraSelect'), startBtn = $('startBtn'), camStatus = $('camStatus'),
    peerStatus = $('peerStatus'), keyEl = $('key'), qrEl = $('qr'), watchUrlEl = $('watchUrl'), viewersEl = $('viewers'),
    dimBtn = $('dimBtn'), dim = $('dim'), newKeyBtn = $('newKeyBtn');

  const KEY_STORE = 'tvcam.key', DEV_STORE = 'tvcam.device';
  let key = normalizeKey(load(KEY_STORE));
  let stream = null, peer = null, retryTimer = null;
  const calls = new Set();
  const wake = { lock: null };

  function randomKey(len = 10) {
    const b = new Uint8Array(len); crypto.getRandomValues(b);
    let s = ''; for (const x of b) s += ALPHABET[x % ALPHABET.length]; return s;
  }
  function setKey(k) {
    key = normalizeKey(k); store(KEY_STORE, key);
    keyEl.textContent = key.replace(/(.{5})/g, '$1 ').trim();
    const link = siblingUrl('watch.html', { key });
    watchUrlEl.textContent = link.replace(/^https?:\/\//, '');
    try { const qr = qrcode(0, 'M'); qr.addData(link); qr.make(); qrEl.innerHTML = qr.createSvgTag({ cellSize: 4, margin: 0, scalable: true }); } catch {}
  }
  if (!key) key = randomKey();
  setKey(key);

  // ---------- Camera ----------
  async function listCameras() {
    try {
      const devs = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'videoinput');
      const saved = load(DEV_STORE);
      select.innerHTML = '';
      devs.forEach((d, i) => {
        const o = document.createElement('option');
        o.value = d.deviceId; o.textContent = d.label || ('Camera ' + (i + 1));
        if (d.deviceId === saved) o.selected = true;
        select.appendChild(o);
      });
      if (!devs.length) { const o = document.createElement('option'); o.textContent = 'No camera found'; select.appendChild(o); }
    } catch {}
  }

  async function startCamera() {
    setStatus(camStatus, 'busy', 'Starting camera…');
    const deviceId = select.value || load(DEV_STORE) || undefined;
    const video = deviceId ? { deviceId: { exact: deviceId }, width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } }
                           : { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } };
    let s;
    try { s = await navigator.mediaDevices.getUserMedia({ video, audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: true } }); }
    catch (e1) {
      try { s = await navigator.mediaDevices.getUserMedia({ video, audio: false }); }
      catch (e2) {
        try { s = await navigator.mediaDevices.getUserMedia({ video: true, audio: false }); }
        catch (e3) { setStatus(camStatus, 'err', 'Camera blocked: ' + (e3.message || e3.name) + '. Allow camera access and press Start.'); startBtn.hidden = false; return false; }
      }
    }
    if (stream) stream.getTracks().forEach(t => t.stop());
    stream = s;
    preview.srcObject = s;
    const vt = s.getVideoTracks()[0];
    if (vt) { const id = vt.getSettings().deviceId; if (id) store(DEV_STORE, id); vt.addEventListener('ended', () => { setStatus(camStatus, 'err', 'Camera stopped. Press Start.'); startBtn.hidden = false; }); }
    setStatus(camStatus, 'ok', 'Camera on' + (s.getAudioTracks().length ? ' with sound.' : ' (no microphone).'));
    startBtn.hidden = true;
    await listCameras();
    keepAwake(wake);
    // Replace tracks in live calls so viewers get the new camera without reconnecting.
    for (const c of calls) replaceTracks(c, s);
    return true;
  }

  function replaceTracks(call, s) {
    try {
      const pc = call.peerConnection; if (!pc) return;
      for (const sender of pc.getSenders()) {
        const t = s.getTracks().find(t => t.kind === (sender.track && sender.track.kind));
        if (t) sender.replaceTrack(t);
      }
    } catch {}
  }

  startBtn.addEventListener('click', startCamera);
  select.addEventListener('change', () => { store(DEV_STORE, select.value); if (stream) startCamera(); });

  // ---------- Peer (stays registered under the key, reconnects forever) ----------
  function goOnline() {
    clearTimeout(retryTimer);
    if (peer) { try { peer.destroy(); } catch {} }
    setStatus(peerStatus, 'busy', 'Going online…');
    peer = new Peer(camPeerId(key), peerOptions());
    peer.on('open', () => setStatus(peerStatus, 'ok', 'Online. Your phone can connect now.'));
    peer.on('connection', conn => {
      conn.on('open', () => {
        if (!stream) { conn.send({ type: 'no-camera' }); return; }
        const call = peer.call(conn.peer, stream, { metadata: { kind: 'tvcam' } });
        if (!call) return;
        calls.add(call); updateViewers();
        const drop = () => { calls.delete(call); updateViewers(); };
        call.on('close', drop); call.on('error', drop);
        conn.on('close', () => { try { call.close(); } catch {} drop(); });
        conn.on('data', d => { if (d && d.type === 'ping') conn.send({ type: 'pong' }); });
      });
    });
    peer.on('disconnected', () => { setStatus(peerStatus, 'warn', 'Signal lost, reconnecting…'); if (!peer.destroyed) peer.reconnect(); });
    peer.on('error', err => {
      if (err.type === 'unavailable-id') setStatus(peerStatus, 'err', 'Another device is already using this key. Press "New key" or close the other camera page.');
      else setStatus(peerStatus, 'err', 'Offline (' + err.type + '). Retrying…');
      retryTimer = setTimeout(goOnline, 6000);
    });
  }
  function updateViewers() { viewersEl.textContent = calls.size; }

  newKeyBtn.addEventListener('click', () => { if (confirm('Make a new key? Phones paired with the old key will stop working.')) { setKey(randomKey()); goOnline(); } });

  dimBtn.addEventListener('click', () => { dim.hidden = false; });
  dim.addEventListener('click', () => { dim.hidden = true; });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { keepAwake(wake); if (stream && !stream.active) startCamera(); } });

  // Start everything. Camera may need one tap the first time (permission prompt).
  listCameras().then(() => startCamera()).then(ok => { if (!ok) startBtn.hidden = false; });
  goOnline();
})();
