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
  { id: 'Lightricks/LTX-2-3', name: 'LTX-2.3 22B distilled (official, newest, best quality, free GPU)', api: 'generate_video', preset: 'ltx23' },
  { id: 'linoyts/LTX-2-3-sync', name: 'LTX-2.3 mirror (same model, second queue)', api: 'generate_video', preset: 'ltx23' },
  { id: 'Lightricks/ltx-video-distilled', name: 'LTX-Video 0.9.8 13B distilled (older, smaller clips)', api: 'text_to_video', preset: 'ltx' },
  { id: 'DeepRat/LTX-Video-ZeroGPU-Optimized', name: 'LTX-Video 0.9.8 optimised (community Space)', api: null, preset: 'auto' },
  { id: 'custom', name: 'Custom Space id or Gradio URL (e.g. your Colab server)', api: null, preset: 'auto' },
];

/** Hugging Face Inference Providers (PRO includes monthly credits; beyond them each clip is billed at provider cost). */
export const HF_PROVIDER_MODELS = [
  { id: 'Wan-AI/Wan2.2-T2V-A14B', name: 'Wan 2.2 14B · 720p (highest quality, ≈ $0.40 per 5 s clip)', input: (p, a) => ({ prompt: p, aspect_ratio: a, resolution: '720p', enable_prompt_expansion: false }) },
  { id: 'Wan-AI/Wan2.2-TI2V-5B', name: 'Wan 2.2 5B · 720p (very good, ≈ $0.10 per clip)', input: (p, a) => ({ prompt: p, aspect_ratio: a, resolution: '720p', enable_prompt_expansion: false }) },
  { id: 'tencent/HunyuanVideo-1.5', name: 'HunyuanVideo 1.5 · 720p (≈ $0.20 per clip)', input: (p, a) => ({ prompt: p, aspect_ratio: a, resolution: '720p' }) },
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

  const chain = provider === 'fal' ? ['fal', 'gradio', 'pexels', 'pixabay', 'pollinations']
    : provider === 'hf' ? ['hf', 'gradio', 'pexels', 'pixabay', 'pollinations']
    : ['gradio', 'pexels', 'pixabay', 'pollinations'];
  for (const source of chain) {
    const todo = pending();
    if (!todo.length) break;
    try {
      if (source === 'pexels' && settings.pexelsKey) await fromPexels(todo, settings, results, errors, update, checkCancel, log);
      else if (source === 'pixabay' && settings.pixabayKey) await fromPixabay(todo, settings, results, errors, update, checkCancel, log);
      else if (source === 'pollinations' && settings.allowPollinations !== false) await fromPollinations(todo, settings, results, errors, update, checkCancel, log);
      else if (source === 'fal' && settings.falKey) await fromFal(todo, settings, results, errors, update, checkCancel, log);
      else if (source === 'gradio' && settings.aiVideoEnabled !== false && (settings.aiVideoSpace || '').trim()) await fromGradio(todo, settings, results, errors, update, checkCancel, log);
      else if (source === 'hf' && (settings.hfToken || '').trim()) await fromHFProviders(todo, settings, results, errors, update, checkCancel, log);
    } catch (e) {
      if (e && e.message === 'Cancelled') throw e;
      errors.push(`${source}: ${e.message}`);
    }
  }
  for (const j of jobs) if (!(j.beatId in results)) results[j.beatId] = null;
  return { results, errors };
}

// ---------- Free AI video: Gradio API of a Hugging Face Space or your own server ----------
/** For a Hugging Face Space id, ask the Hub what state it is in (building, running, sleeping, build error…). */
export async function spaceStatus(spaceOrUrl) {
  const v = String(spaceOrUrl || '').trim();
  if (!/^[\w.-]+\/[\w.-]+$/.test(v)) return null;
  try {
    const r = await fetch(`https://huggingface.co/api/spaces/${v}/runtime`);
    if (!r.ok) return { stage: r.status === 404 ? 'NOT_FOUND' : `HTTP_${r.status}` };
    const j = await r.json();
    return { stage: j.stage || 'UNKNOWN', hardware: j.hardware && (j.hardware.current || j.hardware.requested), error: j.errorMessage ? String(j.errorMessage).split('\n')[0].slice(0, 200) : null };
  } catch { return null; }
}

export function describeStage(st) {
  if (!st) return '';
  const s = st.stage;
  if (s === 'RUNNING') return 'The Space is running.';
  if (s === 'BUILDING' || s === 'RUNNING_BUILDING') return 'The Space is still building (first build takes 5–15 minutes).';
  if (s === 'SLEEPING' || s === 'PAUSED') return 'The Space is asleep or paused; opening its page on huggingface.co wakes it.';
  if (s === 'BUILD_ERROR') return `The Space failed to build${st.error ? ` (${st.error})` : ''}. Use “Factory rebuild” in the Space settings, or switch the generator back to the official Lightricks Space.`;
  if (s === 'RUNTIME_ERROR') return 'The Space crashed at start-up; restart it from its settings page.';
  if (s === 'NOT_FOUND') return 'No Space with this id exists (check the spelling, it is case-sensitive).';
  if (s === 'APP_STARTING') return 'The Space is starting; try again in a minute.';
  return `The Space reports state ${s}.`;
}

export function gradioRoot(spaceOrUrl) {
  const v = String(spaceOrUrl || '').trim().replace(/\/+$/, '');
  if (/^https?:\/\//i.test(v)) return v;
  if (/^[\w.-]+\/[\w.-]+$/.test(v)) return `https://${v.toLowerCase().replace(/[^a-z0-9/]+/g, '-').replace('/', '-')}.hf.space`;
  return null;
}

function ltxDims(aspect, w = 768, h = 448) { return aspect === '9x16' ? [w, h] : aspect === '1x1' ? [Math.round((h + w) / 64) * 32, Math.round((h + w) / 64) * 32] : [h, w]; }  // [height, width], multiples of 32

/** Request sizes for the free shared GPU, best first. A job that exceeds the GPU time window is killed silently,
 *  so the client steps down this ladder until clips come back, then stays there for the rest of the run. */
// Request ladders per Space, best first. A job that exceeds the Space's GPU window is killed silently, so the
// client steps down until clips come back and keeps that size for the session.
const TIERS = {
  // LTX-2.3 (75 s GPU window): the Space's own resolution table; "res" picks the high or low row for the aspect.
  ltx23: [
    { duration: 4, res: 'high', label: '4 s · high resolution' },
    { duration: 3, res: 'high', label: '3 s · high resolution (Space default)' },
    { duration: 5, res: 'low', label: '5 s · standard resolution' },
    { duration: 3, res: 'low', label: '3 s · standard resolution' },
  ],
  // LTX 0.9.8 (60 s window): always its two-pass path, which is the only one its UI exercises.
  ltx: [
    { duration: 4, w: 704, h: 416, texture: true, label: '4 s · 704×416' },
    { duration: 3, w: 704, h: 416, texture: true, label: '3 s · 704×416' },
    { duration: 3, w: 576, h: 320, texture: true, label: '3 s · 576×320' },
    { duration: 2, w: 704, h: 512, texture: true, label: '2 s · 704×512 (Space default)' },
  ],
  auto: [
    { duration: 5, w: 768, h: 448, texture: true, label: '5 s' },
    { duration: 4, w: 704, h: 416, texture: true, label: '4 s' },
    { duration: 3, w: 576, h: 320, texture: true, label: '3 s' },
  ],
};
const LTX23_RES = { high: { '16x9': [1536, 1024], '9x16': [1024, 1536], '1x1': [1024, 1024] }, low: { '16x9': [768, 512], '9x16': [512, 768], '1x1': [768, 768] } };
const tierIndex = { ltx23: 0, ltx: 0, auto: 0 };   // remembered for the session
function tierDims(preset, t, aspect) {
  if (preset === 'ltx23') { const [w, h] = (LTX23_RES[t.res] || LTX23_RES.low)[aspect] || LTX23_RES.low['16x9']; return [h, w]; }
  return ltxDims(aspect, t.w, t.h);
}
export function isSilentRejection(m) { return /^null$|the Space reported an error|unreadable result|returned no video|GPU task aborted|out of memory|CUDA/i.test(String(m || '')); }

export function isQuotaError(m) { return /quota|exceeded|rate limit|too many requests|sign ?in|log ?in|requires login|unauthorized/i.test(String(m || '')); }
function isTransient(m) { return /HTTP 5\d\d|network|timed out|starting up|closed the connection|queue is full|no event id|HTTP 429/i.test(String(m || '')); }

async function fromGradio(jobs, s, results, errors, update, checkCancel, log) {
  const chosen = String(s.aiVideoSpace || '').trim();
  const presetOf = (id) => FREE_VIDEO_SPACES.find(x => x.id === id) || FREE_VIDEO_SPACES[2];
  // Try the chosen generator first; if it is offline/busy, try the other known LTX Spaces (same free quota pool).
  const pool = [chosen, ...FREE_VIDEO_SPACES.filter(x => x.id !== 'custom' && x.id !== chosen).map(x => x.id)].filter(Boolean);
  const patienceMs = Math.max(2, Number(s.footagePatienceMin || 12)) * 60_000;
  const headers = { 'Content-Type': 'application/json' };
  if ((s.hfToken || '').trim()) headers.Authorization = `Bearer ${s.hfToken.trim()}`;
  const negative = 'text, captions, subtitles, logos, watermark, worst quality, inconsistent motion, blurry, jittery, distorted';
  const started = Date.now();
  let quotaHit = false, offline = false;
  const statusCache = new Map();
  const ladderOf = (preset) => TIERS[preset.preset] || TIERS.auto;
  const tierOf = (preset) => { const L = ladderOf(preset); return L[Math.min(tierIndex[preset.preset] ?? 0, L.length - 1)]; };

  for (const j of jobs) {
    checkCancel && checkCancel();
    if (quotaHit || offline) break;
    let done = false, lastError = '';
    let attempt = 0, networkRounds = 0;
    while (!done && Date.now() - started < patienceMs) {
      let networkFailures = 0, tried = 0;
      for (const spaceId of pool) {
        if (done || quotaHit) break;
        tried++;
        checkCancel && checkCancel();
        const root = gradioRoot(spaceId);
        if (!root) continue;
        const preset = presetOf(spaceId);
        if (!statusCache.has(spaceId)) statusCache.set(spaceId, await spaceStatus(spaceId));
        const st = statusCache.get(spaceId);
        if (st && st.stage && st.stage !== 'RUNNING' && st.stage !== 'UNKNOWN' && !/^HTTP_/.test(st.stage)) {
          if (!statusCache.get(spaceId + ':logged')) { log && log('Footage', 'warning', `${spaceId}: ${describeStage(st)}`); statusCache.set(spaceId + ':logged', true); }
          if (st.stage === 'BUILD_ERROR' || st.stage === 'NOT_FOUND' || st.stage === 'RUNTIME_ERROR') continue;   // hopeless for this run
        }
        let again = true;
        while (again && !done) {
        again = false;
        try {
          update(`scene ${j.beatId}: asking ${preset.name.split(' (')[0]} on the free GPU${attempt ? ` (retry ${attempt})` : ''}`);
          const t = tierOf(preset);
          const [h, w] = tierDims(preset.preset, t, s.aspect);
          update(`scene ${j.beatId}: asking ${preset.name.split(' (')[0]} on the free GPU (${t.label})${attempt ? ` · retry ${attempt}` : ''}`);
          let plan = null;
          try { plan = await discoverGradio(root, headers, preset); }
          catch (e) { if (preset.preset === 'auto') throw e; }
          if (!plan && preset.preset === 'ltx') plan = { api: 'text_to_video', build: (prompt) => [prompt, negative, null, null, h, w, 'text-to-video', t.duration, 9, 42, true, 1.0, true] };
          if (!plan && preset.preset === 'ltx23') plan = { api: 'generate_video', build: (prompt) => [null, prompt, t.duration, false, Math.floor(Math.random() * 2e9), true, h, w] };
          if (!plan) throw new Error('no text-to-video endpoint');
          const data = plan.build(j.prompt, { negative, height: h, width: w, duration: t.duration, texture: t.texture, aspect: s.aspect });
          const out = await gradioRun(root, plan.api, data, headers, Math.min(15 * 60_000, patienceMs), checkCancel, (msg) => update(`scene ${j.beatId}: ${msg}`));
          const file = findVideoFile(out);
          if (!file) throw new Error('the Space returned no video');
          const url = file.url || `${root}/gradio_api/file=${file.path}`;
          results[j.beatId] = { kind: 'video', blob: await downloadMedia(url, 180_000), credit: `AI video generated for free with ${preset.name.split(' (')[0]} on Hugging Face (${root})`, source: 'ai-video' };
          update(`AI video ready for scene ${j.beatId}`);
          done = true;
        } catch (e) {
          if (e && e.message === 'Cancelled') throw e;
          lastError = String(e.message || e);
          if (isSilentRejection(lastError) && (tierIndex[preset.preset] ?? 0) < ladderOf(preset).length - 1) {
            tierIndex[preset.preset] = (tierIndex[preset.preset] ?? 0) + 1;
            log && log('Footage', 'warning', `Scene ${j.beatId}: the free GPU dropped the job without details (usually the per-job time limit). Trying a smaller request on the same Space: ${tierOf(preset).label}.`);
            again = true;   // same Space, smaller job
            continue;
          }
          log && log('Footage', 'warning', `Scene ${j.beatId} on ${spaceId}: ${lastError === 'null' ? 'rejected without details' : lastError.slice(0, 220)}`);
          if (isQuotaError(lastError)) { quotaHit = true; break; }
          if (/network|Failed to fetch|Load failed/i.test(lastError)) networkFailures++;
          // otherwise try the next Space in the pool
        }
        }
      }
      if (quotaHit) break;
      if (!done) {
        if (networkFailures === tried && ++networkRounds >= 2) { offline = true; errors.push('The free GPU Spaces cannot be reached from this network right now; remaining scenes use the next source.'); break; }
        attempt++;
        if (!isTransient(lastError) && attempt >= 2) break;         // a real error twice in a row: stop retrying this scene
        const wait = Math.min(90_000, 15_000 * attempt);
        update(`scene ${j.beatId}: free GPUs are busy, retrying in ${Math.round(wait / 1000)} s (patience ${Math.round((patienceMs - (Date.now() - started)) / 60000)} min left)`);
        await sleepCancellable(wait, checkCancel);
      }
    }
    if (!done && !quotaHit) errors.push(`Scene ${j.beatId}: no AI video after retrying (${lastError.slice(0, 160)}).`);
  }
  if (quotaHit) {
    errors.push(headers.Authorization
      ? 'Your free Hugging Face GPU quota for today is used up. It resets daily. Remaining scenes use the next source.'
      : 'The free GPU refused anonymous use (quota). Add a FREE Hugging Face token in Studio → Footage; that is required for real AI video. Remaining scenes use the next source.');
  }
}

async function sleepCancellable(ms, checkCancel) {
  const end = Date.now() + ms;
  while (Date.now() < end) { checkCancel && checkCancel(); await new Promise(r => setTimeout(r, Math.min(1000, end - Date.now()))); }
}

/** One short test generation so the user can see exactly what the free GPU replies. */
export async function testAIVideo(s, onStatus) {
  const root = gradioRoot(s.aiVideoSpace);
  if (!root) return { ok: false, message: `Unrecognised Space id or URL: ${s.aiVideoSpace}` };
  const headers = { 'Content-Type': 'application/json' };
  if ((s.hfToken || '').trim()) headers.Authorization = `Bearer ${s.hfToken.trim()}`;
  const preset = FREE_VIDEO_SPACES.find(x => x.id === s.aiVideoSpace) || FREE_VIDEO_SPACES[2];
  const t0 = Date.now();
  try {
    onStatus && onStatus('Reading the Space API…');
    let plan = null;
    try { plan = await discoverGradio(root, headers, preset); } catch (e) { if (preset.preset !== 'ltx') throw e; }
    if (!plan && preset.preset === 'ltx23') plan = { api: 'generate_video', build: (prompt) => [null, prompt, 2, false, 10, true, 512, 768] };
    if (!plan) plan = { api: 'text_to_video', build: (prompt) => [prompt, 'blurry, distorted', null, null, 512, 704, 'text-to-video', 2, 9, 42, true, 1.0, true] };
    onStatus && onStatus(`Endpoint "${plan.api}" found. Generating a 2-second test clip with the Space's own settings (about a minute)…`);
    const [th, tw] = preset.preset === 'ltx23' ? [512, 768] : [512, 704];
    const data = plan.build('A woman walks through a sunlit park, slow cinematic dolly shot', { negative: 'blurry, distorted', height: th, width: tw, duration: 2, texture: true, aspect: '16x9' });
    const out = await gradioRun(root, plan.api, data, headers, 10 * 60_000, null, (m) => onStatus && onStatus(m));
    const file = findVideoFile(out);
    if (!file) return { ok: false, message: 'The Space answered but returned no video: ' + JSON.stringify(out).slice(0, 200) };
    const url = file.url || `${root}/gradio_api/file=${file.path}`;
    const blob = await downloadMedia(url, 120_000);
    return { ok: true, message: `Real AI video works: ${(blob.size / 1024).toFixed(0)} KB clip in ${Math.round((Date.now() - t0) / 1000)} s from ${root}.`, blob };
  } catch (e) {
    const m = String(e.message || e);
    if (/HTTP 50[23]|network|Failed to fetch|Load failed|config unavailable/i.test(m)) {
      const st = await spaceStatus(s.aiVideoSpace);
      if (st && st.stage !== 'RUNNING') return { ok: false, message: `Failed: ${m.slice(0, 80)}. ${describeStage(st)}` };
    }
    const hint = isQuotaError(m) ? (headers.Authorization ? ' Your daily free GPU quota is used up; it resets daily, or use the Colab server for unlimited clips.' : ' This is the free-GPU quota check: add a FREE Hugging Face token above and test again.')
      : /network|Failed to fetch|Load failed/i.test(m) ? ' The browser could not reach the Space (offline, blocked network, or the Space is restarting).'
      : m === 'null' ? ' The Space crashed on this job without giving a reason (it hides error details). Wait a minute and test again; if it keeps failing, the Space itself is unhealthy right now and the other LTX Space or the Colab server will be used.' : '';
    return { ok: false, message: `Failed: ${m.slice(0, 300)}.${hint}` };
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
      if (/texture|multi.?scale|two.?pass|upscale/.test(key) && typeof def === 'boolean') return ctx.texture === undefined ? def : !!ctx.texture;
      if (/enhance/.test(key) && typeof def === 'boolean') return false;   // our prompts are already elaborate; the enhancer costs GPU time
      if (/randomi/.test(key)) return true;
      if (/seed/.test(key) && typeof def === 'number') return Math.floor(Math.random() * 1e9);
      if (/aspect/.test(key) && typeof def === 'string') return ({ '16x9': '16:9', '9x16': '9:16', '1x1': '1:1' })[ctx.aspect] || def;
      return def === undefined ? null : def;
    }),
  };
}

/**
 * Gradio's full queue protocol, as used by its official clients. Required for ZeroGPU Spaces: while a job waits for
 * a free GPU the Space checks that the caller's event stream is still open and otherwise aborts with a hidden error.
 *  1. open  GET  {root}/gradio_api/queue/data?session_hash=…   (kept open for the whole job)
 *  2. join  POST {root}/gradio_api/queue/join  {data, fn_index, trigger_id, session_hash}
 *  3. read messages on the stream until process_completed for our event_id.
 */
async function gradioQueueCall(root, api, data, headers, timeoutMs, checkCancel, onStatus) {
  const cfg = await fetchGradioConfig(root, headers);
  const deps = Array.isArray(cfg.dependencies) ? cfg.dependencies : [];
  const depIndex = deps.findIndex(d => d && (d.api_name === api || d.api_name === '/' + api));
  if (depIndex < 0) throw new Error(`endpoint ${api} not in config`);
  const dep = deps[depIndex];
  const fn_index = typeof dep.id === 'number' ? dep.id : depIndex;
  const trigger_id = Array.isArray(dep.targets) && dep.targets[0] ? (Array.isArray(dep.targets[0]) ? dep.targets[0][0] : dep.targets[0]) : null;
  const session_hash = Math.random().toString(36).slice(2, 13);
  const started = Date.now();

  return await new Promise((resolve, reject) => {
    let done = false, eventId = null, pending = [];
    const es = new EventSource(`${root}/gradio_api/queue/data?session_hash=${session_hash}`);
    const finish = (fn, v) => { if (done) return; done = true; clearInterval(timer); try { es.close(); } catch {} fn(v); };
    const timer = setInterval(() => {
      if (checkCancel) { try { checkCancel(); } catch (e) { finish(reject, e); return; } }
      if (Date.now() - started > timeoutMs) finish(reject, new Error('timed out waiting for the free GPU'));
    }, 1000);
    const handle = (m) => {
      if (!m || typeof m !== 'object') return;
      if (m.msg === 'close_stream') { if (!done) finish(reject, new Error('the Space closed the connection before finishing')); return; }
      if (m.event_id && eventId && m.event_id !== eventId) return;
      switch (m.msg) {
        case 'estimation': onStatus && onStatus(m.rank != null ? `in the queue, position ${m.rank + 1}${m.rank_eta ? `, about ${Math.round(m.rank_eta)} s` : ''}` : 'in the queue'); break;
        case 'process_starts': onStatus && onStatus('GPU acquired, generating…'); break;
        case 'progress': case 'process_generating': onStatus && onStatus('generating…'); break;
        case 'log': if (m.log) onStatus && onStatus(String(m.log).slice(0, 80)); break;
        case 'process_completed':
          if (m.success && m.output && Array.isArray(m.output.data)) finish(resolve, m.output.data);
          else { const err = m.output && m.output.error; finish(reject, new Error(err == null ? 'null' : (typeof err === 'string' ? err : JSON.stringify(err)))); }
          break;
      }
    };
    es.onmessage = (ev) => { let m; try { m = JSON.parse(ev.data); } catch { return; } if (!eventId) { pending.push(m); return; } handle(m); };
    es.onerror = () => { if (!done && es.readyState === EventSource.CLOSED) finish(reject, new Error('network: the event stream closed')); };
    es.onopen = async () => {
      try {
        const r = await fetch(`${root}/gradio_api/queue/join`, { method: 'POST', headers, body: JSON.stringify({ data, event_data: null, fn_index, trigger_id, session_hash }) });
        const text = await r.text();
        if (r.status === 503) throw new Error('queue is full');
        if (!r.ok) throw new Error(`HTTP ${r.status}: ${text.slice(0, 200)}`);
        let j = {}; try { j = JSON.parse(text); } catch {}
        if (!j.event_id) throw new Error('no event id from the Space');
        eventId = j.event_id;
        onStatus && onStatus('queued on the free GPU…');
        for (const m of pending) handle(m); pending = [];
      } catch (e) { finish(reject, e); }
    };
  });
}

async function fetchGradioConfig(root, headers) {
  const h = headers.Authorization ? { Authorization: headers.Authorization } : {};
  for (const path of ['/gradio_api/config', '/config']) {
    try {
      const r = await fetch(`${root}${path}`, { headers: h });
      if (r.ok) return await r.json();
    } catch {}
  }
  throw new Error('config unavailable');
}

/** Runs a job: queue protocol first (ZeroGPU-safe), simple call API as a fallback. */
async function gradioRun(root, api, data, headers, timeoutMs, checkCancel, onStatus) {
  try {
    return await gradioQueueCall(root, api, data, headers, timeoutMs, checkCancel, onStatus);
  } catch (e) {
    const m = String(e.message || e);
    if (/not in config|config unavailable|no event id/.test(m)) { onStatus && onStatus('queue API unavailable, using the simple API'); return gradioCall(root, api, data, headers, timeoutMs, checkCancel, onStatus); }
    throw e;
  }
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
        if (eventName === 'error') { let msg = payload; try { const j = JSON.parse(payload); msg = (j && (j.message || j.error || j.title)) || (j === null ? 'null' : payload); } catch {} throw new Error(msg || 'the Space reported an error'); }
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

// ---------- Hugging Face Inference Providers (routed to fal.ai; billed to the HF account) ----------
export async function hfProviderMapping(modelId) {
  const r = await fetch(`https://huggingface.co/api/models/${modelId}?expand[]=inferenceProviderMapping`);
  if (!r.ok) throw new Error(`model lookup failed (HTTP ${r.status})`);
  const j = await r.json();
  const map = j.inferenceProviderMapping || {};
  const fal = Array.isArray(map) ? map.find(m => m.provider === 'fal-ai') : map['fal-ai'];
  if (!fal || fal.status !== 'live') throw new Error('this model is not served by the fal-ai provider right now');
  return fal.providerId;
}

async function fromHFProviders(jobs, s, results, errors, update, checkCancel, log) {
  const token = (s.hfToken || '').trim();
  const model = HF_PROVIDER_MODELS.find(m => m.id === s.hfProviderModel) || HF_PROVIDER_MODELS[0];
  let providerId;
  try { providerId = s.hfRouterBase ? 'fal-ai/mock/text-to-video' : await hfProviderMapping(model.id); } catch (e) { errors.push(`Inference Providers: ${e.message}`); return; }
  const base = (s.hfRouterBase || 'https://router.huggingface.co/fal-ai').replace(/\/+$/, '');
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  const aspect = aspectString(s.aspect);
  const submitted = [];
  for (const j of jobs) {
    checkCancel && checkCancel();
    let res = await routerSubmit(`${base}/${providerId}?_subdomain=queue`, headers, model.input(j.prompt, aspect));
    if (res.status === 422) res = await routerSubmit(`${base}/${providerId}?_subdomain=queue`, headers, { prompt: j.prompt });
    if (!res.ok) {
      errors.push(`Scene ${j.beatId}: ${res.error}`);
      if (res.status === 401) { errors.push('Hugging Face refused the token for Inference Providers.'); break; }
      if (res.status === 402 || res.status === 403) { errors.push('Inference Providers: no credits left or billing not enabled on your Hugging Face account (Settings → Billing). Remaining scenes use the next source.'); break; }
      continue;
    }
    submitted.push({ beatId: j.beatId, ...res.data });
    update(`scene ${j.beatId} submitted to ${model.name.split(' ·')[0]}`);
  }
  const started = Date.now();
  const open = new Set(submitted.map(x => x.beatId));
  while (open.size && Date.now() - started < 20 * 60_000) {
    checkCancel && checkCancel();
    await new Promise(r => setTimeout(r, 3000));
    for (const sub of submitted) {
      if (!open.has(sub.beatId)) continue;
      try {
        const modelPath = new URL(sub.response_url).pathname;
        const st = await routerGet(`${base}${modelPath}/status?_subdomain=queue`, headers);
        if (st.status === 'COMPLETED') {
          const out = await routerGet(`${base}${modelPath}?_subdomain=queue`, headers);
          const url = out.video?.url || out.videos?.[0]?.url || out.url;
          if (!url) throw new Error('no video url in result');
          results[sub.beatId] = { kind: 'video', blob: await downloadMedia(url, 180_000), credit: `Generated with ${model.name.split(' ·')[0]} via Hugging Face Inference Providers`, source: 'ai-video' };
          open.delete(sub.beatId);
          update(`AI video ready for scene ${sub.beatId}`);
        } else if (['FAILED', 'CANCELLED', 'ERROR'].includes(st.status)) throw new Error(`generation ${st.status.toLowerCase()}`);
        else update(st.queue_position != null ? `scene ${sub.beatId}: queue position ${st.queue_position}` : `scene ${sub.beatId}: generating…`);
      } catch (e) {
        if (e && e.message === 'Cancelled') throw e;
        errors.push(`Scene ${sub.beatId}: ${e.message}`); open.delete(sub.beatId);
      }
    }
  }
  for (const id of open) errors.push(`Scene ${id}: timed out waiting for the provider.`);
}
async function routerSubmit(url, headers, body) {
  try {
    const r = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
    const text = await r.text(); let data = {}; try { data = JSON.parse(text); } catch {}
    if (!r.ok) return { ok: false, status: r.status, error: summariseError(r.status, data, text) };
    if (!data.request_id || !data.response_url) return { ok: false, status: 500, error: 'unexpected response from the provider' };
    return { ok: true, status: r.status, data };
  } catch (e) { return { ok: false, status: 0, error: `network error (${e.message})` }; }
}
async function routerGet(url, headers) {
  const r = await fetch(url, { headers: { Authorization: headers.Authorization } });
  const text = await r.text(); let data = {}; try { data = JSON.parse(text); } catch {}
  if (!r.ok) throw new Error(summariseError(r.status, data, text));
  return data;
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
  const budgetEnd = Date.now() + 5 * 60_000;   // the free image service can be slow or refuse; never let it eat the run
  for (const j of jobs) {
    checkCancel && checkCancel();
    if (Date.now() > budgetEnd) { errors.push('Pollinations: time budget used up; remaining scenes use motion graphics.'); break; }
    const prompt = `${(j.prompt || '').split('. Cinematic')[0]}, ${IMAGE_STYLE}`;
    const seed = Math.abs(hash(prompt + j.beatId)) % 1_000_000;
    const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt.slice(0, 600))}?width=${w}&height=${h}&nologo=true&seed=${seed}&model=flux&enhance=true`;
    let ok = false;
    for (let attempt = 0; attempt < 2 && !ok; attempt++) {
      try {
        if (attempt) await new Promise(r => setTimeout(r, 8000));
        const blob = await downloadMedia(url, 60_000);
        if (!/^image\//.test(blob.type) && blob.size < 20_000) throw new Error('not an image');
        results[j.beatId] = { kind: 'image', blob, credit: 'AI image generated with Pollinations.ai (free)' };
        ok = true;
        update(`AI image for scene ${j.beatId}`);
      } catch (e) {
        if (e && e.message === 'Cancelled') throw e;
        if (attempt === 1) errors.push(`Scene ${j.beatId}: Pollinations ${e.message}`);
        if (/HTTP 402|HTTP 401|HTTP 403/.test(e.message)) { errors.push('Pollinations now requires payment for this request; skipping it for the remaining scenes.'); return; }
      }
    }
    await new Promise(r => setTimeout(r, 4000));   // the free service rate-limits; pace requests
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
