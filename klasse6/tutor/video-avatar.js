// Lifelike video teacher: HeyGen LiveAvatar in LITE mode. The avatar does not think or talk on its own; it lip-syncs to
// the audio we send (Claude's sentence, voiced by Google Chirp 3 HD on the key server). Video and sound arrive over WebRTC
// (LiveKit) into one <video> element. Paid by the minute, so the session is stopped whenever nobody is talking.
import { LiveAvatarSession, SessionEvent, AgentEventsEnum } from './vendor/liveavatar-sdk.js';

const IDLE_STOP_MS = 4 * 60 * 1000;        // no conversation for 4 minutes: end the session (billing stops)
const HIDDEN_STOP_MS = 30 * 1000;          // page in the background for 30 seconds: end the session

export function createVideoAvatar({ video, getServer, getCode, onChange, log, Session = LiveAvatarSession }) {
  let session = null, state = 'off', idleTimer = 0, hiddenTimer = 0, waiters = [];
  const set = s => { state = s; onChange && onChange(s); };
  const touch = () => { clearTimeout(idleTimer); idleTimer = setTimeout(() => stop('idle'), IDLE_STOP_MS); };

  async function start() {
    if (state === 'starting' || state === 'live') return;
    try { video.muted = false; const p = video.play(); if (p && p.catch) p.catch(() => {}); } catch {}   // unlocks the element while still inside the tap
    set('starting');
    try {
      const res = await fetch(getServer() + '/session', { method: 'POST', headers: { 'x-lumi-code': getCode() } });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.session_token) throw new Error(data.error || ('session ' + res.status));
      session = new Session(data.session_token, { voiceChat: { defaultMuted: true }, autoKeepAlive: true });
      session.on(SessionEvent.SESSION_STREAM_READY, () => {
        session.attach(video);
        const p = video.play(); if (p && p.catch) p.catch(() => set('needs-tap'));
        set('live'); touch();
      });
      session.on(SessionEvent.SESSION_DISCONNECTED, reason => { log && log('avatar disconnected: ' + reason); end(); });
      session.on(AgentEventsEnum.AVATAR_SPEAK_ENDED, () => { const w = waiters.shift(); if (w) w(); });
      await session.start();
    } catch (e) {
      log && log('avatar unavailable: ' + (e.message || e));
      end(); set('failed');
    }
  }
  function end() {
    clearTimeout(idleTimer); clearTimeout(hiddenTimer);
    const w = waiters; waiters = []; w.forEach(f => f());
    session = null;
    try { video.srcObject = null; } catch {}
    if (state !== 'failed') set('off');
  }
  async function stop(why) {
    const s = session; if (!s) return;
    log && log('avatar stopped: ' + why);
    end();
    try { await s.stop(); } catch {}
  }
  /** Speak one sentence: base64 PCM (16-bit mono 24 kHz) goes over the session's socket in the documented chunk sizes. */
  async function speak(text, pcmPromise) {
    touch();
    let b64; try { b64 = await pcmPromise; } catch { return false; }
    const ws = session && session._sessionEventSocket;
    if (state !== 'live' || !ws || ws.readyState !== 1) return false;
    const bin = atob(b64), eventId = (crypto.randomUUID && crypto.randomUUID()) || String(Date.now() + Math.random());
    // 400 ms first (fast start), then 1-second chunks, as in HeyGen's own SDK; but Base64, as the API documents
    const first = 24000 * 2 * 0.4, rest = 24000 * 2;
    for (let i = 0; i < bin.length;) {
      const n = i === 0 ? first : rest;
      ws.send(JSON.stringify({ type: 'agent.speak', event_id: eventId, audio: btoa(bin.slice(i, i + n)) }));
      i += n;
    }
    ws.send(JSON.stringify({ type: 'agent.speak_end', event_id: eventId }));
    const seconds = bin.length / (24000 * 2);
    await new Promise(resolve => {
      const t = setTimeout(() => { waiters = waiters.filter(f => f !== done); resolve(); }, (seconds + 3) * 1000);
      const done = () => { clearTimeout(t); resolve(); };
      waiters.push(done);
    });
    touch();
    return true;
  }
  function interrupt() {
    if (state !== 'live' || !session) return;
    try { session.interrupt(); } catch {}
    const w = waiters; waiters = []; w.forEach(f => f());
  }
  document.addEventListener('visibilitychange', () => {
    clearTimeout(hiddenTimer);
    if (document.visibilityState === 'hidden' && session) hiddenTimer = setTimeout(() => stop('hidden'), HIDDEN_STOP_MS);
  });
  window.addEventListener('pagehide', () => { if (session) { try { session.stop(); } catch {} } });
  return {
    start, stop, speak, interrupt, touch,
    live: () => state === 'live' || state === 'needs-tap',
    state: () => state,
    resume: () => { const p = video.play(); if (p && p.then) p.then(() => set('live')).catch(() => {}); },
  };
}
