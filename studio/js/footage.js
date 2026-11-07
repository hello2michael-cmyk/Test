// Footage per scene. Chain of sources, each optional, each failing only for the scene it cannot serve:
//   free stock video (Pexels / Pixabay, free keys) → free AI stills with cinematic motion (Pollinations, no key)
//   → paid generated video (fal.ai, own key) → motion graphics.
// The language model, voice and editing always stay on the phone.

export const FOOTAGE_MODELS = [
  { id: 'ltx2-fast', name: 'LTX-2 Fast (1080p, fastest, cheapest)', endpoint: 'fal-ai/ltx-2-19b/text-to-video/fast',
    input: (p, a, d) => ({ prompt: p, aspect_ratio: a, resolution: '1080p', duration: d <= 6 ? 6 : d <= 8 ? 8 : 10, generate_audio: false }) },
  { id: 'ltx2', name: 'LTX-2 (1080p, higher quality)', endpoint: 'fal-ai/ltx-2-19b/text-to-video',
    input: (p, a, d) => ({ prompt: p, aspect_ratio: a, resolution: '1080p', duration: d <= 6 ? 6 : d <= 8 ? 8 : 10, generate_audio: false }) },
  { id: 'wan22', name: 'Wan 2.2 5B (720p, good motion)', endpoint: 'fal-ai/wan/v2.2-5b/text-to-video',
    input: (p, a) => ({ prompt: p, aspect_ratio: a, resolution: '720p', enable_prompt_expansion: true }) },
  { id: 'kling25', name: 'Kling 2.5 Turbo Pro (people look great)', endpoint: 'fal-ai/kling-video/v2.5-turbo/pro/text-to-video',
    input: (p, a, d) => ({ prompt: p, aspect_ratio: a, duration: d > 5 ? '10' : '5', negative_prompt: 'text, captions, subtitles, logos, watermark, blur, distortion' }) },
  { id: 'veo31fast', name: 'Veo 3.1 Fast (Google, premium)', endpoint: 'fal-ai/veo3.1/fast',
    input: (p, a) => ({ prompt: p, aspect_ratio: a, duration: '8s', resolution: '1080p', generate_audio: false }) },
  { id: 'hailuo02', name: 'Hailuo 02 Standard (MiniMax)', endpoint: 'fal-ai/minimax/hailuo-02/standard/text-to-video',
    input: (p, a, d) => ({ prompt: p, duration: d > 6 ? '10' : '6', prompt_optimizer: true }) },
  { id: 'custom', name: 'Custom fal.ai endpoint (advanced)', endpoint: null,
    input: (p, a, d, s) => { let extra = {}; try { extra = JSON.parse(s.falExtra || '{}'); } catch {} return { prompt: p, aspect_ratio: a, ...extra }; } },
];
/** Free text-to-video generators: public Hugging Face Spaces (free GPUs) or your own Gradio server (e.g. Colab). */
export const FREE_VIDEO_SPACES = [
  { id: 'Lightricks/ltx-video-distilled', name: 'LTX-Video 13B distilled (official Lightricks Space, free GPU)', api: 'text_to_video', preset: 'ltx' },
  { id: 'DeepRat/LTX-Video-ZeroGPU-Optimized', name: 'LTX-Video optimised (community Space)', api: null, preset: 'auto' },
  { id: 'custom', name: 'Custom Space id or Gradio URL (e.g. your Colab server)', api: null, preset: 'auto' },
];

export const FOOTAGE_COST = { 'ltx2-fast': 0.04, ltx2: 0.12, wan22: 0.08, kling25: 0.35, veo31fast: 0.80, hailuo02: 0.28, custom: null };

const STYLE = 'Cinematic, photorealistic, natural lighting, shallow depth of field, smooth slow camera movement, high detail, 4k. No text, no captions, no subtitles, no logos, no watermarks.';
const IMAGE_STYLE = 'cinematic photograph, photorealistic, natural light, shallow depth of field, 35mm, high detail, no text, no logos, no watermark';

export function shotPrompt(shot, topic) {
  const base = (shot || '').trim() || `B-roll that illustrates ${topic}`;
  return `${base}. ${STYLE}`;
}
export function aspectString(aspect) { return { '16x9': '16:9', '9x16': '9:16', '1x1': '1:1' }[aspect] || '16:9'; }

/**
 * jobs: [{beatId, prompt (shot), query (stock search)}]
 * Returns { results: {beatId: {kind:'video'|'image', blob, credit} | null}, errors: [string] }
 */
export async function generateFootage(jobs, settings, { log, onUpdate, checkCancel, existing = {} } = {}) {
  const results = { ...existing };
  const pending = () => jobs.filter(j => !results[j.beatId]);
  const errors = [];
  const total = jobs.length;
  const update = (note) => onUpdate && onUpdate(Object.values(results).filter(Boolean).length, total, note);
  const provider = settings.footageProvider;

  if (provider === 'mock' || provider === 'mockimage') {
    for (const j of pending()) {
      checkCancel && checkCancel();
      try {
        const file = provider === 'mock' ? '../test-clip.mp4' : '../test-image.jpg';
        results[j.beatId] = { kind: provider === 'mock' ? 'video' : 'image', blob: await (await fetch(new URL(file, import.meta.url))).blob(), credit: 'test asset' };
      } catch { results[j.beatId] = null; }
      update('test asset');
    }
    return { results, errors };
  }

  const chain = provider === 'fal' ? ['fal', 'gradio', 'pexels', 'pixabay', 'pollinations'] : ['gradio', 'pexels', 'pixabay', 'pollinations'];
  for (const source of chain) {
    const todo = pending();
    if (!todo.length) break;
    try {
      if (source === 'pexels' && settings.pexelsKey) await fromPexels(todo, settings, results, errors, update, checkCancel, log);
      else if (source === 'pixabay' && settings.pixabayKey) await fromPixabay(todo, settings, results, errors, update, checkCancel, log);
      else if (source === 'pollinations' && settings.allowPollinations !== false) await fromPollinations(todo, settings, results, errors, update, checkCancel, log);
      else if (source === 'fal' && settings.falKey) await fromFal(todo, settings, results, errors, update, checkCancel, log);
      else if (source === 'gradio' && settings.aiVideoEnabled !== false && (settings.aiVideoSpace || '').trim()) await fromGradio(todo, settings, results, errors, update, checkCancel, log);
    } catch (e) {
      if (e && e.message === 'Cancelled') throw e;
      errors.push(`${source}: ${e.message}`);
    }
  }
  for (const j of jobs) if (!(j.beatId in results)) results[j.beatId] = null;
  return { results, errors };
}

// ---------- Free AI video: Gradio API of a Hugging Face Space or your own server ----------
export function gradioRoot(spaceOrUrl) {
  const v = String(spaceOrUrl || '').trim().replace(/\/+$/, '');
  if (/^https?:\/\//i.test(v)) return v;
  if (/^[\w.-]+\/[\w.-]+$/.test(v)) return `https://${v.toLowerCase().replace(/[^a-z0-9/]+/g, '-').replace('/', '-')}.hf.space`;
  return null;
}

function ltxDims(aspect) { return aspect === '9x16' ? [768, 448] : aspect === '1x1' ? [576, 576] : [448, 768]; }  // [height, width], multiples of 32

async function fromGradio(jobs, s, results, errors, update, checkCancel, log) {
  const root = gradioRoot(s.aiVideoSpace);
  if (!root) { errors.push(`Unrecognised Space id or URL: ${s.aiVideoSpace}`); return; }
  const headers = { 'Content-Type': 'application/json' };
  if ((s.hfToken || '').trim()) headers.Authorization = `Bearer ${s.hfToken.trim()}`;
  const preset = FREE_VIDEO_SPACES.find(x => x.id === s.aiVideoSpace) || FREE_VIDEO_SPACES[2];
  const negative = 'text, captions, subtitles, logos, watermark, worst quality, inconsistent motion, blurry, jittery, distorted';
  const duration = Math.min(7, Math.max(3, s.footageDuration || 5));
  const [h, w] = ltxDims(s.aspect);

  // Discover the endpoint (works for any Gradio text-to-video app, including a Colab server).
  let plan = null;
  try { plan = await discoverGradio(root, headers, preset); }
  catch (e) {
    if (/HTTP 5\d\d|network/.test(e.message)) { errors.push(`The AI video Space is waking up or offline (${e.message}); trying the next source.`); return; }
    if (preset.preset !== 'ltx') { errors.push(`Could not read the Space API (${e.message}); trying the next source.`); return; }
  }
  if (!plan && preset.preset === 'ltx') plan = { api: 'text_to_video', build: (prompt) => [prompt, negative, null, null, h, w, 'text-to-video', duration, 9, 42, true, 1.0, true] };
  if (!plan) { errors.push('This Space has no text-to-video endpoint the studio can use.'); return; }

  let consecutiveFailures = 0;
  for (const j of jobs) {
    checkCancel && checkCancel();
    try {
      update(`asking the free GPU for scene ${j.beatId} (can take a few minutes)`);
      const data = plan.build(j.prompt, { negative, height: h, width: w, duration, aspect: s.aspect });
      const out = await gradioCall(root, plan.api, data, headers, 12 * 60_000, checkCancel, (msg) => update(`scene ${j.beatId}: ${msg}`));
      const file = findVideoFile(out);
      if (!file) throw new Error('the Space returned no video');
      const url = file.url || `${root}/gradio_api/file=${file.path}`;
      results[j.beatId] = { kind: 'video', blob: await downloadMedia(url, 180_000), credit: `AI video generated for free with ${preset.name.split(' (')[0]} on Hugging Face (${root})` };
      consecutiveFailures = 0;
      update(`AI video ready for scene ${j.beatId}`);
    } catch (e) {
      if (e && e.message === 'Cancelled') throw e;
      const m = String(e.message || e);
      errors.push(`Scene ${j.beatId}: free AI video failed (${m.slice(0, 200)})`);
      if (/quota|exceeded|rate limit|too many|sign ?in|login/i.test(m)) {
        errors.push((s.hfToken ? 'Your free GPU quota for today is used up; the remaining scenes use stock footage or AI photos. It resets daily.' : 'The free GPU quota for anonymous visitors is used up. Add a free Hugging Face token in Studio → Footage for a bigger daily quota; the remaining scenes use stock footage or AI photos.'));
        return;
      }
      if (++consecutiveFailures >= 2) { errors.push('The AI video Space keeps failing; the remaining scenes use the next source.'); return; }
    }
  }
}

/** Reads /gradio_api/info and picks a text-to-video endpoint, filling parameters from their defaults. */
async function discoverGradio(root, headers, preset) {
  const r = await fetch(`${root}/gradio_api/info`, { headers: headers.Authorization ? { Authorization: headers.Authorization } : {} }).catch(e => { throw new Error('network: ' + e.message); });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const info = await r.json();
  const named = info.named_endpoints || {};
  const candidates = Object.entries(named).map(([name, ep]) => ({ name: name.replace(/^\//, ''), ep }));
  const isVideoReturn = (ep) => (ep.returns || []).some(x => /video/i.test(x.component || '') || /video/i.test(JSON.stringify(x.type || '')));
  const hasPrompt = (ep) => (ep.parameters || []).some(p => /prompt/i.test(p.parameter_name || p.label || '') && !/negative/i.test(p.parameter_name || p.label || ''));
  let pick = preset.api ? candidates.find(c => c.name === preset.api) : null;
  if (!pick) pick = candidates.find(c => /text.?to.?video|t2v|generate/i.test(c.name) && isVideoReturn(c.ep) && hasPrompt(c.ep)) || candidates.find(c => isVideoReturn(c.ep) && hasPrompt(c.ep));
  if (!pick) throw new Error('no text-to-video endpoint');
  const params = pick.ep.parameters || [];
  return {
    api: pick.name,
    build: (prompt, ctx) => params.map(p => {
      const key = `${p.parameter_name || ''} ${p.label || ''}`.toLowerCase();
      const comp = (p.component || '').toLowerCase();
      const def = p.parameter_has_default ? p.parameter_default : (p.example_input !== undefined ? null : null);
      if (/negative/.test(key)) return ctx.negative;
      if (/prompt/.test(key) && /textbox|text/.test(comp || 'textbox')) return prompt;
      if (/^(image|video|audio|file|gallery|model3d)$/.test(comp)) return null;                       // media inputs: none for text-to-video
      if (/(^|_)(image|video)(_|$)|filepath/.test((p.parameter_name || '').toLowerCase()) && /textbox/.test(comp)) return null;  // hidden path textboxes
      if (/\bmode\b|task/.test(key) && typeof def === 'string') return /text/i.test(JSON.stringify(p.type || '')) && /text-to-video/.test(JSON.stringify(p.type)) ? 'text-to-video' : def;
      if (/height/.test(key) && typeof def === 'number') return ctx.height;
      if (/width/.test(key) && typeof def === 'number') return ctx.width;
      if (/duration|seconds/.test(key) && typeof def === 'number') return Math.min(ctx.duration, def > 20 ? def : 8.5);
      if (/randomi/.test(key)) return true;
      if (/seed/.test(key) && typeof def === 'number') return Math.floor(Math.random() * 1e9);
      if (/aspect/.test(key) && typeof def === 'string') return ({ '16x9': '16:9', '9x16': '9:16', '1x1': '1:1' })[ctx.aspect] || def;
      return def === undefined ? null : def;
    }),
  };
}

/** Gradio's simple HTTP API: POST .../call/{api} → event_id, then GET the SSE stream until "complete". */
async function gradioCall(root, api, data, headers, timeoutMs, checkCancel, onStatus) {
  let r;
  for (let attempt = 0; attempt < 3; attempt++) {
    r = await fetch(`${root}/gradio_api/call/${api}`, { method: 'POST', headers, body: JSON.stringify({ data }) }).catch(e => { throw new Error('network: ' + e.message); });
    if (r.status === 503 || r.status === 502) { onStatus && onStatus('Space is starting up, waiting…'); await new Promise(res => setTimeout(res, 20000)); continue; }
    break;
  }
  const text0 = await r.text();
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${text0.slice(0, 200)}`);
  let eventId; try { eventId = JSON.parse(text0).event_id; } catch {}
  if (!eventId) throw new Error('no event id from the Space');
  const started = Date.now();
  const res = await fetch(`${root}/gradio_api/call/${api}/${eventId}`, { headers: headers.Authorization ? { Authorization: headers.Authorization } : {} });
  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status} while waiting for the result`);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '', eventName = '';
  while (true) {
    if (checkCancel) checkCancel();
    if (Date.now() - started > timeoutMs) { try { reader.cancel(); } catch {} throw new Error('timed out waiting for the free GPU'); }
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx;
    while ((idx = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, idx).trim(); buffer = buffer.slice(idx + 1);
      if (line.startsWith('event:')) eventName = line.slice(6).trim();
      else if (line.startsWith('data:')) {
        const payload = line.slice(5).trim();
        if (eventName === 'complete') { try { return JSON.parse(payload); } catch { throw new Error('unreadable result'); } }
        if (eventName === 'error') { let msg = payload; try { const j = JSON.parse(payload); msg = (j && (j.message || j.error || j.title)) || payload; } catch {} throw new Error(msg || 'the Space reported an error'); }
        if (eventName === 'generating' || eventName === 'heartbeat') onStatus && onStatus('generating…');
      }
    }
  }
  throw new Error('the Space closed the connection before finishing');
}

function findVideoFile(out) {
  const items = Array.isArray(out) ? out : [out];
  for (const it of items) {
    if (!it) continue;
    if (typeof it === 'string' && /\.(mp4|webm|mov)(\?|$)/i.test(it)) return /^https?:/.test(it) ? { url: it } : { path: it };
    if (typeof it === 'object') {
      if (it.video && (it.video.url || it.video.path)) return it.video;
      if ((it.url || it.path) && /mp4|webm|mov|video/i.test(`${it.url || ''} ${it.path || ''} ${it.mime_type || ''}`)) return it;
    }
  }
  return null;
}

// ---------- Pexels (free key) ----------
async function fromPexels(jobs, s, results, errors, update, checkCancel, log) {
  const orientation = s.aspect === '9x16' ? 'portrait' : s.aspect === '1x1' ? 'square' : 'landscape';
  const used = new Set();
  for (const j of jobs) {
    checkCancel && checkCancel();
    try {
      const q = encodeURIComponent(j.query || j.prompt.split('.')[0]);
      const r = await fetch(`https://api.pexels.com/videos/search?query=${q}&per_page=8&orientation=${orientation}&size=medium`, { headers: { Authorization: s.pexelsKey.trim() } });
      if (r.status === 401) { errors.push('Pexels refused the API key (Studio → Footage).'); return; }
      if (r.status === 429) { errors.push('Pexels rate limit reached; trying the next source.'); return; }
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json();
      const videos = (data.videos || []).filter(v => !used.has(v.id) && v.duration >= 4);
      let picked = null;
      for (const v of videos) {
        const files = (v.video_files || []).filter(f => /mp4/.test(f.file_type || '') && f.width && f.height && f.height <= 1080 && f.width <= 1920);
        files.sort((a, b) => (b.width * b.height) - (a.width * a.height));
        const f = files.find(x => x.height >= 720) || files[0];
        if (f) { picked = { v, f }; break; }
      }
      if (!picked) { errors.push(`Scene ${j.beatId}: no Pexels clip for “${j.query}”.`); continue; }
      const blob = await downloadMedia(picked.f.link);
      used.add(picked.v.id);
      results[j.beatId] = { kind: 'video', blob, credit: `Video by ${picked.v.user?.name || 'Pexels contributor'} on Pexels (${picked.v.url})` };
      update(`Pexels clip for scene ${j.beatId}`);
    } catch (e) {
      if (e && e.message === 'Cancelled') throw e;
      errors.push(`Scene ${j.beatId}: Pexels ${e.message}`);
      if (/CORS|Failed to fetch|Load failed/i.test(e.message)) { errors.push('The browser blocked the Pexels download; trying the next source.'); return; }
    }
  }
}

// ---------- Pixabay (free key) ----------
async function fromPixabay(jobs, s, results, errors, update, checkCancel, log) {
  const orientation = s.aspect === '9x16' ? 'vertical' : 'horizontal';
  const used = new Set();
  for (const j of jobs) {
    checkCancel && checkCancel();
    try {
      const q = encodeURIComponent((j.query || j.prompt.split('.')[0]).slice(0, 100));
      const r = await fetch(`https://pixabay.com/api/videos/?key=${encodeURIComponent(s.pixabayKey.trim())}&q=${q}&per_page=8&orientation=${orientation}&safesearch=true`);
      if (r.status === 400 || r.status === 401) { errors.push('Pixabay refused the API key (Studio → Footage).'); return; }
      if (r.status === 429) { errors.push('Pixabay rate limit reached; trying the next source.'); return; }
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json();
      const hit = (data.hits || []).find(h => !used.has(h.id) && h.duration >= 4);
      if (!hit) { errors.push(`Scene ${j.beatId}: no Pixabay clip for “${j.query}”.`); continue; }
      const f = hit.videos.medium?.url ? hit.videos.medium : (hit.videos.large || hit.videos.small);
      const blob = await downloadMedia(f.url);
      used.add(hit.id);
      results[j.beatId] = { kind: 'video', blob, credit: `Video by ${hit.user || 'Pixabay contributor'} on Pixabay (${hit.pageURL})` };
      update(`Pixabay clip for scene ${j.beatId}`);
    } catch (e) {
      if (e && e.message === 'Cancelled') throw e;
      errors.push(`Scene ${j.beatId}: Pixabay ${e.message}`);
      if (/CORS|Failed to fetch|Load failed/i.test(e.message)) { errors.push('The browser blocked the Pixabay download; trying the next source.'); return; }
    }
  }
}

// ---------- Pollinations (free AI stills, no key) ----------
async function fromPollinations(jobs, s, results, errors, update, checkCancel, log) {
  const [w, h] = s.aspect === '9x16' ? [768, 1344] : s.aspect === '1x1' ? [1024, 1024] : [1344, 768];
  for (const j of jobs) {
    checkCancel && checkCancel();
    const prompt = `${(j.prompt || '').split('. Cinematic')[0]}, ${IMAGE_STYLE}`;
    const seed = Math.abs(hash(prompt + j.beatId)) % 1_000_000;
    const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt.slice(0, 600))}?width=${w}&height=${h}&nologo=true&seed=${seed}&model=flux&enhance=true`;
    let ok = false;
    for (let attempt = 0; attempt < 3 && !ok; attempt++) {
      try {
        if (attempt) await new Promise(r => setTimeout(r, 4000 * attempt));
        const blob = await downloadMedia(url, 90_000);
        if (!/^image\//.test(blob.type) && blob.size < 20_000) throw new Error('not an image');
        results[j.beatId] = { kind: 'image', blob, credit: 'AI image generated with Pollinations.ai (free)' };
        ok = true;
        update(`AI image for scene ${j.beatId}`);
      } catch (e) {
        if (e && e.message === 'Cancelled') throw e;
        if (attempt === 2) errors.push(`Scene ${j.beatId}: Pollinations ${e.message}`);
      }
    }
    await new Promise(r => setTimeout(r, 1500));   // be polite to the free service
  }
}

// ---------- fal.ai (paid, own key) ----------
async function fromFal(jobs, settings, results, errors, update, checkCancel, log) {
  const model = FOOTAGE_MODELS.find(m => m.id === settings.falModel) || FOOTAGE_MODELS[0];
  const endpoint = (model.endpoint || settings.falEndpoint || '').trim().replace(/^https?:\/\/[^/]+\//, '').replace(/^\/+|\/+$/g, '');
  const key = (settings.falKey || '').trim();
  if (!key || !endpoint) { errors.push('No fal.ai API key or endpoint set in Studio → Footage.'); return; }
  const aspect = aspectString(settings.aspect);
  const duration = settings.footageDuration || 6;
  const submitted = [];
  for (const j of jobs) {
    checkCancel && checkCancel();
    let res = await falSubmit(endpoint, key, model.input(j.prompt, aspect, duration, settings));
    if (res.status === 422) {
      log && log('Footage', 'warning', `The endpoint rejected some options (${res.error}); retrying with prompt only.`);
      res = await falSubmit(endpoint, key, { prompt: j.prompt });
    }
    if (!res.ok) {
      errors.push(`Scene ${j.beatId}: ${res.error}`);
      if (res.status === 401 || res.status === 403) { errors.push('The fal.ai key was refused; check it in Studio → Footage.'); break; }
      continue;
    }
    submitted.push({ beatId: j.beatId, ...res.data });
  }
  const started = Date.now();
  const open = new Set(submitted.map(s => s.beatId));
  while (open.size && Date.now() - started < 15 * 60_000) {
    checkCancel && checkCancel();
    await new Promise(r => setTimeout(r, 3000));
    for (const s of submitted) {
      if (!open.has(s.beatId)) continue;
      try {
        const st = await falGet(s.status_url, key);
        if (st.status === 'COMPLETED') {
          const out = await falGet(s.response_url, key);
          const url = out.video?.url || out.videos?.[0]?.url || out.output?.url || out.url;
          if (!url) throw new Error('no video url in result');
          results[s.beatId] = { kind: 'video', blob: await downloadMedia(url), credit: `Generated with ${model.name} on fal.ai` };
          open.delete(s.beatId);
          update(`scene ${s.beatId} ready`);
        } else if (['FAILED', 'CANCELLED', 'ERROR'].includes(st.status)) {
          throw new Error(`generation ${st.status.toLowerCase()}`);
        } else {
          update(st.queue_position != null ? `queue position ${st.queue_position}` : 'generating…');
        }
      } catch (e) {
        if (e && e.message === 'Cancelled') throw e;
        errors.push(`Scene ${s.beatId}: ${e.message}`);
        open.delete(s.beatId);
      }
    }
  }
  for (const id of open) errors.push(`Scene ${id}: timed out waiting for the video model.`);
}

async function falSubmit(endpoint, key, input) {
  try {
    const r = await fetch(`https://queue.fal.run/${endpoint}`, { method: 'POST', headers: { Authorization: `Key ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
    const text = await r.text();
    let data = {}; try { data = JSON.parse(text); } catch {}
    if (!r.ok) return { ok: false, status: r.status, error: summariseError(r.status, data, text) };
    if (!data.status_url || !data.response_url) {
      const base = `https://queue.fal.run/${endpoint.split('/').slice(0, 2).join('/')}/requests/${data.request_id}`;
      data.status_url = data.status_url || base + '/status'; data.response_url = data.response_url || base;
    }
    return { ok: true, status: r.status, data };
  } catch (e) { return { ok: false, status: 0, error: `network error (${e.message})` }; }
}
async function falGet(url, key) {
  const r = await fetch(url, { headers: { Authorization: `Key ${key}` } });
  const text = await r.text(); let data = {}; try { data = JSON.parse(text); } catch {}
  if (!r.ok) throw new Error(summariseError(r.status, data, text));
  return data;
}
function summariseError(status, data, text) {
  const detail = data && (data.detail || data.error || data.message);
  const msg = Array.isArray(detail) ? detail.map(d => d.msg || d.message || JSON.stringify(d)).join('; ') : (typeof detail === 'string' ? detail : (detail ? JSON.stringify(detail) : text.slice(0, 160)));
  return `HTTP ${status}: ${msg}`;
}

async function downloadMedia(url, timeoutMs = 120_000) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { mode: 'cors', signal: ctl.signal });
    if (!r.ok) throw new Error(`download failed (HTTP ${r.status})`);
    return await r.blob();
  } catch (e) {
    throw new Error(e.name === 'AbortError' ? 'download timed out' : (e.message || 'download failed'));
  } finally { clearTimeout(timer); }
}
function hash(s) { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) | 0; return h; }
