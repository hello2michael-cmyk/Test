// Generated footage per scene. The language model, voice and editing stay on the phone; the moving pictures
// come from a text-to-video model in the cloud (fal.ai) with the creator's own API key, or from a local test clip.
// Every failure is per scene: a scene without footage falls back to motion graphics. Nothing here aborts a run.

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

const STYLE = 'Cinematic, photorealistic, natural lighting, shallow depth of field, smooth slow camera movement, high detail, 4k. No text, no captions, no subtitles, no logos, no watermarks.';

/** Turns a designer's shot description into a full prompt for the video model. */
export function shotPrompt(shot, topic) {
  const base = (shot || '').trim() || `B-roll that illustrates ${topic}`;
  return `${base}. ${STYLE}`;
}

export function aspectString(aspect) { return { '16x9': '16:9', '9x16': '9:16', '1x1': '1:1' }[aspect] || '16:9'; }

/**
 * jobs: [{beatId, prompt}]. Returns { results: {beatId: Blob|null}, errors: [string] }.
 * Submits everything at once (fal queues it), polls, downloads. Calls onUpdate(doneCount, total, note).
 */
export async function generateFootage(jobs, settings, { log, onUpdate, checkCancel, existing = {} } = {}) {
  const results = { ...existing };
  const pending = jobs.filter(j => !results[j.beatId]);
  if (!pending.length) return { results, errors: [] };
  const provider = settings.footageProvider;
  if (provider === 'mock') {
    for (const j of pending) {
      checkCancel && checkCancel();
      try { results[j.beatId] = await (await fetch(new URL('../test-clip.mp4', import.meta.url))).blob(); } catch (e) { results[j.beatId] = null; }
      onUpdate && onUpdate(Object.keys(results).length, jobs.length, 'test clip');
    }
    return { results, errors: [] };
  }
  const model = FOOTAGE_MODELS.find(m => m.id === settings.falModel) || FOOTAGE_MODELS[0];
  const endpoint = (model.endpoint || settings.falEndpoint || '').trim().replace(/^https?:\/\/[^/]+\//, '').replace(/^\/+|\/+$/g, '');
  const key = (settings.falKey || '').trim();
  const errors = [];
  if (!key || !endpoint) { errors.push('No fal.ai API key or endpoint set in Studio → Footage.'); return { results, errors }; }
  const aspect = aspectString(settings.aspect);
  const duration = settings.footageDuration || 6;

  // 1. Submit all
  const submitted = [];
  for (const j of pending) {
    checkCancel && checkCancel();
    let input = model.input(j.prompt, aspect, duration, settings);
    let res = await falSubmit(endpoint, key, input);
    if (res.status === 422) {
      // Unknown or invalid fields for this endpoint: retry with the bare minimum.
      log && log('Footage', 'warning', `The endpoint rejected some options (${res.error}); retrying with prompt only.`);
      res = await falSubmit(endpoint, key, { prompt: j.prompt });
    }
    if (!res.ok) {
      errors.push(`Scene ${j.beatId}: ${res.error}`);
      results[j.beatId] = null;
      if (res.status === 401 || res.status === 403) { errors.push('The fal.ai key was refused; check it in Studio → Footage.'); break; }
      continue;
    }
    submitted.push({ beatId: j.beatId, ...res.data });
  }
  for (const j of pending) if (!(j.beatId in results) && !submitted.find(s => s.beatId === j.beatId)) results[j.beatId] = null;

  // 2. Poll until each is done (the whole batch runs in parallel on fal's side)
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
          results[s.beatId] = await downloadClip(url);
          open.delete(s.beatId);
          onUpdate && onUpdate(submitted.length - open.size, jobs.length, `scene ${s.beatId} ready`);
        } else if (st.status === 'FAILED' || st.status === 'CANCELLED' || st.status === 'ERROR') {
          throw new Error(`generation ${st.status.toLowerCase()}`);
        } else {
          onUpdate && onUpdate(submitted.length - open.size, jobs.length, st.queue_position != null ? `queue position ${st.queue_position}` : 'generating…');
        }
      } catch (e) {
        errors.push(`Scene ${s.beatId}: ${e.message}`);
        results[s.beatId] = null;
        open.delete(s.beatId);
      }
    }
  }
  for (const id of open) { results[id] = null; errors.push(`Scene ${id}: timed out waiting for the video model.`); }
  return { results, errors };
}

async function falSubmit(endpoint, key, input) {
  try {
    const r = await fetch(`https://queue.fal.run/${endpoint}`, {
      method: 'POST', headers: { Authorization: `Key ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify(input),
    });
    const text = await r.text();
    let data = {}; try { data = JSON.parse(text); } catch {}
    if (!r.ok) return { ok: false, status: r.status, error: summariseError(r.status, data, text) };
    if (!data.status_url || !data.response_url) {
      const base = `https://queue.fal.run/${endpoint.split('/').slice(0, 2).join('/')}/requests/${data.request_id}`;
      data.status_url = data.status_url || base + '/status'; data.response_url = data.response_url || base;
    }
    return { ok: true, status: r.status, data };
  } catch (e) {
    return { ok: false, status: 0, error: `network error (${e.message}). If this persists the browser blocked the request.` };
  }
}

async function falGet(url, key) {
  const r = await fetch(url, { headers: { Authorization: `Key ${key}` } });
  const text = await r.text();
  let data = {}; try { data = JSON.parse(text); } catch {}
  if (!r.ok) throw new Error(summariseError(r.status, data, text));
  return data;
}

function summariseError(status, data, text) {
  const detail = data && (data.detail || data.error || data.message);
  const msg = Array.isArray(detail) ? detail.map(d => d.msg || d.message || JSON.stringify(d)).join('; ') : (typeof detail === 'string' ? detail : (detail ? JSON.stringify(detail) : text.slice(0, 160)));
  return `HTTP ${status}: ${msg}`;
}

async function downloadClip(url) {
  const r = await fetch(url, { mode: 'cors' });
  if (!r.ok) throw new Error(`download failed (HTTP ${r.status})`);
  return r.blob();
}

/** Rough cost guidance shown in the settings (USD per clip, public list prices, may change). */
export const FOOTAGE_COST = { 'ltx2-fast': 0.04, ltx2: 0.12, wan22: 0.08, kling25: 0.35, veo31fast: 0.80, hailuo02: 0.28, custom: null };
