// Lifelike video teacher: HeyGen LiveAvatar in LITE mode. The avatar does not think or talk on its own; it lip-syncs to
// the audio we send (Claude's sentence, voiced by Google Chirp 3 HD on the key server). Video and sound arrive over WebRTC
// (LiveKit) into one <video> element. Paid by the minute, so the session is stopped whenever nobody is talking.
//
// Speech: all sentences of one answer go out as ONE continuous utterance (same event, no "speak_end" between sentences),
// each sentence with 8 ms fades at both ends, so there are no clicks or pauses at the joins. The answer is closed with
// "speak_end" when the tutor has nothing more to say (endTurn).
import { LiveAvatarSession, SessionEvent, AgentEventsEnum } from './vendor/liveavatar-sdk.js';

const IDLE_STOP_MS = 4 * 60 * 1000;        // no conversation for 4 minutes: end the session (billing stops)
const HIDDEN_STOP_MS = 30 * 1000;          // page in the background for 30 seconds: end the session
const RATE = 24000, BPS = RATE * 2;        // 16-bit mono 24 kHz
const LEAD_MS = 600;                       // hand over the next sentence this long before the current one ends

/** 8 ms fade-in and fade-out on raw 16-bit little-endian PCM given as a binary string; returns a binary string. */
function fadeEdges(bin) {
  const n = bin.length >> 1, ramp = Math.min(Math.round(RATE * 0.008), n >> 1);
  if (ramp < 2) return bin;
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const dv = new DataView(bytes.buffer);
  for (let i = 0; i < ramp; i++) {
    const g = i / ramp;
    dv.setInt16(i * 2, Math.round(dv.getInt16(i * 2, true) * g), true);
    const j = (n - 1 - i) * 2; dv.setInt16(j, Math.round(dv.getInt16(j, true) * g), true);
  }
  let out = '';
  for (let i = 0; i < bytes.length; i += 0x8000) out += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return out;
}

export function createVideoAvatar({ video, getServer, getCode, onChange, log, Session = LiveAvatarSession }) {
  let session = null, state = 'off', idleTimer = 0, hiddenTimer = 0, lastActive = 0, wake = null;
  let turnId = null, playUntil = 0, endWaiters = [];
  const set = s => { state = s; onChange && onChange(s); };
  const touch = () => { lastActive = Date.now(); clearTimeout(idleTimer); idleTimer = setTimeout(() => stop('idle'), IDLE_STOP_MS); };
  const newId = () => (crypto.randomUUID && crypto.randomUUID()) || String(Date.now() + Math.random());

  /** Keep the screen on while Judy is there (otherwise iOS locks the phone and AirPlay mirroring to the TV stops). */
  async function keepAwake(on) {
    try {
      if (on && !wake && navigator.wakeLock) { wake = await navigator.wakeLock.request('screen'); wake.addEventListener('release', () => { wake = null; }); }
      else if (!on && wake) { await wake.release(); wake = null; }
    } catch {}
  }

  async function start(why = 'start') {
    if (state === 'starting' || state === 'live') return;
    try { video.muted = false; const p = video.play(); if (p && p.catch) p.catch(() => {}); } catch {}   // unlocks the element while still inside a tap
    set(why === 'reconnect' ? 'reconnecting' : 'starting');
    try {
      const res = await fetch(getServer() + '/session', { method: 'POST', headers: { 'x-lumi-code': getCode() } });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.session_token) throw new Error([data.error || ('session ' + res.status), data.status && ('HTTP ' + data.status), data.detail].filter(Boolean).join(' · '));
      const s = session = new Session(data.session_token, { voiceChat: { defaultMuted: true }, autoKeepAlive: true });
      s.on(SessionEvent.SESSION_STREAM_READY, () => {
        if (session !== s) return;
        s.attach(video);
        const p = video.play(); if (p && p.catch) p.catch(() => set('needs-tap'));
        set('live'); touch(); keepAwake(true);
      });
      s.on(SessionEvent.SESSION_DISCONNECTED, reason => {
        if (session !== s) return;
        log && log('avatar disconnected: ' + reason);
        end();
        // the plan's session time is up while the conversation is still going: come back by ourselves
        if (Date.now() - lastActive < 90 * 1000 && document.visibilityState === 'visible') start('reconnect');
      });
      s.on(AgentEventsEnum.AVATAR_SPEAK_ENDED, () => { const w = endWaiters; endWaiters = []; w.forEach(f => f()); });
      await s.start();
    } catch (e) {
      log && log('avatar unavailable: ' + (e.message || e));
      end(); set('failed');
    }
  }
  function end() {
    clearTimeout(idleTimer); clearTimeout(hiddenTimer);
    const w = endWaiters; endWaiters = []; w.forEach(f => f());
    turnId = null; playUntil = 0; session = null;
    try { video.srcObject = null; } catch {}
    keepAwake(false);
    if (state !== 'failed') set('off');
  }
  async function stop(why) {
    const s = session; if (!s) return;
    log && log('avatar stopped: ' + why);
    lastActive = 0;   // a deliberate stop must not reconnect
    end();
    try { await s.stop(); } catch {}
  }
  const socket = () => { const ws = session && session._sessionEventSocket; return state === 'live' && ws && ws.readyState === 1 ? ws : null; };

  /** Add one sentence to the current answer; resolves shortly before it has been spoken, so the next one joins seamlessly. */
  async function speak(text, pcmPromise) {
    touch();
    let b64; try { b64 = await pcmPromise; } catch { return false; }
    const ws = socket(); if (!ws || !b64) return false;
    const bin = fadeEdges(atob(b64));
    if (!turnId) { turnId = newId(); playUntil = Date.now(); }
    // 400 ms first (fast start), then 1-second chunks, as in HeyGen's own SDK; Base64, as the API documents
    const first = BPS * 0.4;
    for (let i = 0; i < bin.length;) {
      const n = i === 0 ? first : BPS;
      ws.send(JSON.stringify({ type: 'agent.speak', event_id: turnId, audio: btoa(bin.slice(i, i + n)) }));
      i += n;
    }
    playUntil = Math.max(playUntil, Date.now()) + (bin.length / BPS) * 1000;
    await new Promise(r => setTimeout(r, Math.max(0, playUntil - Date.now() - LEAD_MS)));
    touch();
    return true;
  }
  /** The answer is complete: close the utterance and resolve when the avatar has finished speaking. */
  async function endTurn() {
    const ws = socket(), id = turnId;
    if (!ws || !id) { turnId = null; return; }
    ws.send(JSON.stringify({ type: 'agent.speak_end', event_id: id }));
    turnId = null;
    const remaining = Math.max(0, playUntil - Date.now());
    await new Promise(resolve => {
      const t = setTimeout(done, remaining + 2500);
      function done() { clearTimeout(t); endWaiters = endWaiters.filter(f => f !== done); resolve(); }
      endWaiters.push(done);
    });
    touch();
  }
  function interrupt() {
    if (!session || state !== 'live') return;
    try { session.interrupt(); } catch {}
    turnId = null; playUntil = 0;
    const w = endWaiters; endWaiters = []; w.forEach(f => f());
  }
  document.addEventListener('visibilitychange', () => {
    clearTimeout(hiddenTimer);
    if (document.visibilityState === 'hidden' && session) hiddenTimer = setTimeout(() => stop('hidden'), HIDDEN_STOP_MS);
    if (document.visibilityState === 'visible' && state === 'live') keepAwake(true);   // iOS drops the wake lock in the background
  });
  window.addEventListener('pagehide', () => { if (session) { lastActive = 0; try { session.stop(); } catch {} } });
  return {
    start, stop, speak, endTurn, interrupt, touch,
    live: () => state === 'live' || state === 'needs-tap',
    state: () => state,
    resume: () => { const p = video.play(); if (p && p.then) p.then(() => set('live')).catch(() => {}); },
  };
}
