// Lumi key server (Cloudflare Worker). Holds every secret so the tutor page never sees an API key.
//   POST /session        → short-lived LiveAvatar session token (LITE mode: the avatar lip-syncs to our own audio)
//   POST /tts            → Google Cloud Text-to-Speech: {text, voice, rate, format:'pcm'|'mp3'} → {audio: base64}
//                          pcm = raw 16-bit mono 24 kHz (what the avatar expects), mp3 = for the drawn teacher
//   POST /v1/messages    → relays a Claude request (streaming passes straight through)
// Every request needs the header X-Lumi-Code = ACCESS_CODE. Secrets (wrangler secret put …): ACCESS_CODE,
// ANTHROPIC_API_KEY, GOOGLE_TTS_KEY, LIVEAVATAR_API_KEY. Variables (wrangler.toml): ALLOWED_ORIGIN, LIVEAVATAR_AVATAR_ID,
// LIVEAVATAR_SANDBOX ("true" while testing: free, watermark, 2-minute sessions).

const json = (body, status, cors) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...cors } });

function corsFor(req, env) {
  const origin = req.headers.get('origin') || '';
  const allowed = (env.ALLOWED_ORIGIN || '').split(',').map(s => s.trim()).filter(Boolean);
  const ok = allowed.includes(origin) || allowed.includes('*');
  return {
    ok,
    headers: ok ? {
      'access-control-allow-origin': origin || '*',
      'access-control-allow-methods': 'POST, OPTIONS',
      // echo what the browser announces (the Claude SDK adds headers such as x-stainless-helper-method); safe because every
      // request still needs the access code and only the listed origins get CORS at all
      'access-control-allow-headers': req.headers.get('access-control-request-headers') || 'content-type, x-lumi-code',
      'access-control-max-age': '86400',
      vary: 'origin',
    } : { vary: 'origin' },
  };
}

/** Constant-time comparison so the access code cannot be guessed byte by byte from response times. */
function sameSecret(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || !b) return false;
  const x = new TextEncoder().encode(a), y = new TextEncoder().encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] || 0) ^ (y[i] || 0);
  return diff === 0;
}

async function session(env, cors) {
  if (!env.LIVEAVATAR_API_KEY || !env.LIVEAVATAR_AVATAR_ID) return json({ error: 'video avatar not configured' }, 501, cors);
  const res = await fetch('https://api.liveavatar.com/v1/sessions/token', {
    method: 'POST',
    headers: { 'X-API-KEY': env.LIVEAVATAR_API_KEY, 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ mode: 'LITE', avatar_id: env.LIVEAVATAR_AVATAR_ID, is_sandbox: String(env.LIVEAVATAR_SANDBOX) === 'true' }),
  });
  const text = await res.text(); let data = {}; try { data = JSON.parse(text); } catch {}
  const token = data?.data?.session_token || data?.session_token;
  // pass LiveAvatar's whole reply (it carries the validation details), never our key
  if (!res.ok || !token) return json({ error: 'LiveAvatar token request failed', status: res.status, detail: text.slice(0, 800), sent: { mode: 'LITE', avatar_id: env.LIVEAVATAR_AVATAR_ID, is_sandbox: String(env.LIVEAVATAR_SANDBOX) === 'true' } }, 502, cors);
  return json({ session_token: token, session_id: data?.data?.session_id || data?.session_id || null }, 200, cors);
}

async function tts(req, env, cors) {
  if (!env.GOOGLE_TTS_KEY) return json({ error: 'voice not configured' }, 501, cors);
  const { text, voice, rate, format } = await req.json().catch(() => ({}));
  if (typeof text !== 'string' || !text.trim() || text.length > 1200) return json({ error: 'text missing or too long' }, 400, cors);
  const name = /^[a-z]{2}-[A-Z]{2}-[A-Za-z0-9-]+$/.test(voice || '') ? voice : 'de-DE-Chirp3-HD-Leda';
  const pcm = format === 'pcm';
  const res = await fetch(`https://texttospeech.googleapis.com/v1/text:synthesize?key=${encodeURIComponent(env.GOOGLE_TTS_KEY)}`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ input: { text }, voice: { languageCode: name.slice(0, 5), name },
      audioConfig: pcm ? { audioEncoding: 'LINEAR16', sampleRateHertz: 24000, speakingRate: Math.min(1.3, Math.max(0.7, Number(rate) || 1)) }
                       : { audioEncoding: 'MP3', speakingRate: Math.min(1.3, Math.max(0.7, Number(rate) || 1)) } }),
  });
  if (!res.ok) return json({ error: 'Google TTS failed', status: res.status }, 502, cors);
  let { audioContent } = await res.json();
  if (pcm) {
    // LINEAR16 comes as a WAV file: drop the RIFF header so only the raw samples remain
    const bytes = Uint8Array.from(atob(audioContent), c => c.charCodeAt(0));
    let off = 12;
    while (off + 8 <= bytes.length) {
      const id = String.fromCharCode(...bytes.slice(off, off + 4)), size = bytes[off + 4] | (bytes[off + 5] << 8) | (bytes[off + 6] << 16) | (bytes[off + 7] << 24);
      if (id === 'data') { off += 8; break; }
      off += 8 + size + (size & 1);
    }
    let bin = ''; const raw = bytes.subarray(off);
    for (let i = 0; i < raw.length; i += 0x8000) bin += String.fromCharCode(...raw.subarray(i, i + 0x8000));
    audioContent = btoa(bin);
  }
  return json({ audio: audioContent, format: pcm ? 'pcm16-24k' : 'mp3' }, 200, cors);
}

async function claude(req, env, cors) {
  if (!env.ANTHROPIC_API_KEY) return json({ error: 'model not configured' }, 501, cors);
  const headers = new Headers({ 'content-type': 'application/json', 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': req.headers.get('anthropic-version') || '2023-06-01' });
  const beta = req.headers.get('anthropic-beta'); if (beta) headers.set('anthropic-beta', beta);
  const url = new URL(req.url);
  const upstream = await fetch('https://api.anthropic.com' + url.pathname + url.search, { method: 'POST', headers, body: req.body });
  const out = new Headers(cors);
  for (const h of ['content-type', 'request-id', 'retry-after', 'anthropic-ratelimit-requests-remaining']) { const v = upstream.headers.get(h); if (v) out.set(h, v); }
  return new Response(upstream.body, { status: upstream.status, headers: out });
}

export default {
  async fetch(req, env) {
    const cors = corsFor(req, env);
    if (req.method === 'OPTIONS') return new Response(null, { status: cors.ok ? 204 : 403, headers: cors.headers });
    if (!cors.ok) return json({ error: 'origin not allowed' }, 403, cors.headers);
    if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405, cors.headers);
    if (!sameSecret(req.headers.get('x-lumi-code') || '', env.ACCESS_CODE)) return json({ error: 'access code required' }, 401, cors.headers);
    const path = new URL(req.url).pathname;
    try {
      if (path === '/session') return await session(env, cors.headers);
      if (path === '/tts') return await tts(req, env, cors.headers);
      if (path === '/v1/messages') return await claude(req, env, cors.headers);
      return json({ error: 'not found' }, 404, cors.headers);
    } catch (e) {
      return json({ error: 'server error' }, 500, cors.headers);
    }
  },
};
