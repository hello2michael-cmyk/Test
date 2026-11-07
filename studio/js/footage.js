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

  const chain = provider === 'fal' ? ['fal', 'pexels', 'pixabay', 'pollinations'] : ['pexels', 'pixabay', 'pollinations'];
  for (const source of chain) {
    const todo = pending();
    if (!todo.length) break;
    try {
      if (source === 'pexels' && settings.pexelsKey) await fromPexels(todo, settings, results, errors, update, checkCancel, log);
      else if (source === 'pixabay' && settings.pixabayKey) await fromPixabay(todo, settings, results, errors, update, checkCancel, log);
      else if (source === 'pollinations' && settings.allowPollinations !== false) await fromPollinations(todo, settings, results, errors, update, checkCancel, log);
      else if (source === 'fal' && settings.falKey) await fromFal(todo, settings, results, errors, update, checkCancel, log);
    } catch (e) {
      if (e && e.message === 'Cancelled') throw e;
      errors.push(`${source}: ${e.message}`);
    }
  }
  for (const j of jobs) if (!(j.beatId in results)) results[j.beatId] = null;
  return { results, errors };
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
