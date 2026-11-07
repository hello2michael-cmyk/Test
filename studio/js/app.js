// UI + production run. Everything happens in this browser tab.
import { Team } from './agents.js';
import * as T from './timing.js';
import { MODELS, hasWebGPU, defaultModelId, describeModel, createEngine } from './llm.js';
import { loadTTS, synthesize, isLoaded as ttsLoaded } from './tts.js';
import { mix, decodeMusic } from './mixer.js';
import { Renderer } from './renderer.js';
import { encodeSupport, encodeWebCodecs, encodeMediaRecorder } from './encoder.js';
import { srt, youtubeText, download, shareFiles, safeName, chapterStamp } from './exporter.js';
import { store, requestPersistentStorage } from './store.js';
import { THEMES, VOICES, loadSettings, saveSettings, canvasSize } from './settings.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const MOCK = params.get('mock') === '1';
const STAGES = ['Planning', 'Writing', 'Reviewing', 'Designing', 'Metadata', 'Narrating', 'Mixing', 'Rendering', 'Packaging'];
const SAMPLES = [
  'Explain what a transformer attention head does, for curious beginners',
  'Why do large language models hallucinate? Three causes and one fix',
  'Retrieval-augmented generation in one minute',
  'What is a token, and why does it change the price of an API call?',
  'Fine-tuning vs prompting: when to use which',
];

let settings = loadSettings();
if (!settings.modelId) settings.modelId = defaultModelId();
let engine = null, engineModelId = null;
let running = false, cancelled = false;
let customModels = JSON.parse(localStorage.getItem('aivideostudio.customModels') || '[]');
let currentProject = null;

// ---------- boot ----------
if ('serviceWorker' in navigator && !MOCK) navigator.serviceWorker.register('sw.js').catch(() => {});
requestPersistentStorage();
const standalone = window.navigator.standalone || matchMedia('(display-mode: standalone)').matches;
if (standalone || localStorage.getItem('aivideostudio.hideInstall')) $('installCard').hidden = true;
$('hideInstall').onclick = () => { $('installCard').hidden = true; localStorage.setItem('aivideostudio.hideInstall', '1'); };
$('deviceBadge').textContent = hasWebGPU() ? 'WebGPU ready' : 'No WebGPU · CPU mode';
$('deviceNote').textContent = hasWebGPU()
  ? 'WebGPU is available: GPU models run fast. Models download once over Wi-Fi and stay cached.'
  : 'WebGPU is not available in this browser (iPhone needs iOS 26 or newer). CPU models still work, just slower.';

document.querySelectorAll('.tabs button').forEach(b => b.onclick = () => showTab(b.dataset.tab));
function showTab(name) {
  document.querySelectorAll('.tabs button').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
  document.querySelectorAll('.panel').forEach(p => p.classList.toggle('active', p.id === 'panel-' + name));
  if (name === 'videos') renderProjects();
  if (name === 'models') { renderModels(); updateStorage(); }
  if (name === 'studio') renderSettings();
  window.scrollTo(0, 0);
}

// ---------- create tab ----------
for (const s of SAMPLES) { const b = document.createElement('button'); b.textContent = s; b.onclick = () => { $('prompt').value = s; }; $('chips').appendChild(b); }
$('generate').onclick = () => start();
$('cancel').onclick = () => { cancelled = true; log('Studio', 'warning', 'Cancelling…'); };
renderSummary();

function renderSummary() {
  const m = describeModel(settings.modelId);
  const [w, h] = canvasSize(settings);
  $('summary').innerHTML = `Model: <b>${esc(m.name)}</b> · ${esc(aspectLabel())} · ${w}×${h} · ${settings.fps} fps · ${esc(settings.theme)}<br>` +
    `Up to ${settings.maxDuration} s, aiming for ${settings.targetDuration} s · voice: ${esc((VOICES.find(v => v[0] === settings.voice) || [0, settings.voice])[1])}` +
    (m.engine === 'webllm' && !hasWebGPU() ? `<br><span class="warn">This browser has no WebGPU; pick a CPU model in the Models tab.</span>` : '');
}
function aspectLabel() { return ({ '16x9': '16:9', '9x16': '9:16 Shorts', '1x1': '1:1' })[settings.aspect]; }

function log(agent, level, message) {
  if (level === 'token') {
    const el = $('stream'); el.hidden = false;
    el.textContent = (el.textContent + message).slice(-700);
    return;
  }
  $('stream').textContent = '';
  $('logCard').hidden = false;
  const e = document.createElement('div');
  e.className = 'e ' + level;
  e.innerHTML = `<span class="ic"></span><div><b>${esc(agent)}</b>${esc(message)}</div>`;
  $('log').appendChild(e);
  e.scrollIntoView({ block: 'nearest' });
}

function progress(stage, fraction, detail = '') {
  $('progressCard').hidden = false;
  $('stageName').textContent = stage;
  $('stageDetail').textContent = detail;
  const weights = { Planning: .10, Writing: .16, Reviewing: .08, Designing: .10, Metadata: .05, Narrating: .15, Mixing: .02, Rendering: .32, Packaging: .02 };
  let total = 0;
  for (const s of STAGES) { if (s === stage) { total += weights[s] * fraction; break; } total += weights[s]; }
  $('bar').style.width = Math.round(Math.min(1, total) * 100) + '%';
  $('stages').innerHTML = STAGES.map(s => `<i class="${STAGES.indexOf(s) <= STAGES.indexOf(stage) ? 'on' : ''}"></i>`).join('');
}

async function ensureEngine() {
  const model = MOCK ? { id: 'mock', engine: 'mock', name: 'Mock writer (demo)' } : describeModel(settings.modelId);
  if (engine && engineModelId === model.id) return engine;
  if (engine) { await engine.unload(); engine = null; }
  $('engineStatus').textContent = `Loading ${model.name}…`;
  engine = await createEngine(model, (f, text) => {
    progress('Planning', 0, `Loading model ${Math.round(f * 100)}%`);
    $('engineStatus').textContent = `${model.name}: ${text || Math.round(f * 100) + '%'}`;
    $('modelProgress').hidden = false; $('modelProgress').firstElementChild.style.width = Math.round(f * 100) + '%';
  });
  engineModelId = model.id;
  $('engineStatus').innerHTML = `<span class="ok">${esc(model.name)} ready</span>`;
  $('modelProgress').hidden = true;
  localStorage.setItem('aivideostudio.downloaded.' + model.id, '1');
  return engine;
}

async function start() {
  const prompt = $('prompt').value.trim();
  if (!prompt || running) return;
  running = true; cancelled = false;
  $('generate').hidden = true; $('cancel').hidden = false;
  $('log').innerHTML = ''; $('logCard').hidden = true; $('resultCard').hidden = true; $('stream').hidden = true; $('canvas').hidden = true;
  let wakeLock = null;
  try { wakeLock = await navigator.wakeLock?.request('screen'); } catch {}
  const t0 = Date.now();
  try {
    const project = await produce(prompt);
    currentProject = project;
    const secs = Math.round((Date.now() - t0) / 1000);
    log('Studio', 'success', `Done in ${Math.floor(secs / 60)} min ${secs % 60} s. Open the Videos tab to watch, share and copy the YouTube text.`);
    showResult(project);
  } catch (e) {
    console.error(e);
    log('Studio', cancelled ? 'warning' : 'error', cancelled ? 'Cancelled.' : (e && e.message) || String(e));
  } finally {
    running = false;
    $('generate').hidden = false; $('cancel').hidden = true;
    $('progressCard').hidden = true;
    try { wakeLock && wakeLock.release(); } catch {}
  }
}

function checkCancel() { if (cancelled) throw new Error('Cancelled'); }

async function produce(prompt) {
  const s = { ...settings };
  const [width, height] = canvasSize(s);
  progress('Planning', 0, 'Loading model');
  // Start the voice download in parallel with the writing.
  const ttsPromise = MOCK && params.get('tts') === 'mock' ? null : loadTTS((f, file) => { $('ttsStatus').textContent = `Downloading voice: ${Math.round(f * 100)}% ${file || ''}`; }).catch(e => { throw new Error('Voice model failed to load: ' + e.message); });
  const eng = await ensureEngine();
  log('Studio', 'info', `Model “${eng.name}” is ready. Everything runs in this browser.`);
  const team = new Team(eng, s, (ev) => log(ev.agent, ev.level, ev.message));

  progress('Planning', 0.2);
  const sceneCount = T.sceneCountFor(s.targetDuration);
  const brief = await team.director(prompt, sceneCount); checkCancel();

  progress('Writing', 0.2);
  const budget = T.wordBudget(s.targetDuration, brief.outline.length);
  let script = await team.scriptwriter(brief, budget);
  for (let i = 0; i < 2 && script.totalWords > budget * 1.08; i++) {
    checkCancel();
    const cut = script.totalWords - budget;
    script = await team.scriptwriter(brief, budget, script, `The draft is ${cut} words too long. Cut filler and keep every beat under ${Math.floor(budget / brief.outline.length)} words.`);
  }
  checkCancel();
  progress('Reviewing', 0.2);
  const review = await team.reviewer(brief, script, budget);
  for (const sc of script.scenes) if (review.revisedNarration[sc.beatId]) sc.narration = review.revisedNarration[sc.beatId];
  checkCancel();
  progress('Designing', 0.2);
  const storyboard = await team.designer(brief, script);
  checkCancel();
  progress('Metadata', 0.2);
  const publish = await team.publisher(brief, script);
  checkCancel();

  // Narration + timing (guaranteed ≤ cap)
  progress('Narrating', 0, 'Loading voice');
  if (ttsPromise) await ttsPromise;
  let { scenes, total } = await narrate(script, storyboard, s, 1.0);
  let mult = T.speedToFit(total, s.maxDuration);
  if (mult) {
    log('Producer', 'warning', `Cut is ${total.toFixed(1)} s, over the ${s.maxDuration} s cap. Re-recording narration ${Math.round((mult - 1) * 100)}% faster.`);
    ({ scenes, total } = await narrate(script, storyboard, s, mult));
  }
  if (total > s.maxDuration) {
    const excess = Math.round((total - s.maxDuration) * T.WORDS_PER_SECOND) + 8;
    log('Producer', 'warning', `Still ${(total - s.maxDuration).toFixed(1)} s over. Asking the scriptwriter to cut ${excess} words.`);
    script = await team.scriptwriter(brief, Math.max(40, script.totalWords - excess), script, `Remove ${excess} words. Shorten every beat; drop the least important sentence.`);
    ({ scenes, total } = await narrate(script, storyboard, s, 1.0));
    mult = T.speedToFit(total, s.maxDuration);
    if (mult) ({ scenes, total } = await narrate(script, storyboard, s, mult));
  }
  if (total > s.maxDuration) { total = T.hardTrim(scenes, s.maxDuration); log('Producer', 'warning', 'Trimmed the end of the final scene to respect the cap.'); }
  log('Producer', 'success', `Final cut: ${total.toFixed(1)} s across ${scenes.length} scenes.`);
  checkCancel();

  // Free the language model before the memory-heavy render.
  if (!MOCK) { await eng.unload(); engine = null; engineModelId = null; $('engineStatus').textContent = 'Model unloaded to free memory; it reloads from cache on the next run.'; }

  const plan = { prompt, brief, review, publish, scenes, totalDuration: total, claimsToVerify: review.claimsToVerify, width, height, fps: s.fps, createdAt: Date.now() };

  // Mix
  progress('Mixing', 0.3);
  let music = null;
  if (s.musicName) { const blob = await store.getMusic(s.musicName); if (blob) { try { music = await decodeMusic(blob); } catch { log('Audio', 'warning', 'Could not decode the music file; continuing without it.'); } } }
  const audioBuffer = await mix(scenes, total, music, { musicVolume: s.musicVolume, ambientBed: s.ambientBed });
  log('Audio', 'success', 'Narration mixed' + (music ? ' with music under ducking.' : '.'));
  checkCancel();

  // Render + encode
  progress('Rendering', 0);
  const canvas = $('canvas');
  canvas.width = width; canvas.height = height; canvas.hidden = false;
  const renderer = new Renderer(canvas, s);
  const drawFrame = (t) => renderer.draw(plan, t);
  const support = await encodeSupport(width, height);
  const onProgress = (f) => progress('Rendering', f, Math.round(f * 100) + '%');
  let videoBlob;
  if (support) {
    log('Render', 'info', `Encoding with WebCodecs (${support.codec.toUpperCase()} + ${support.audio.toUpperCase()}), ${width}×${height} at ${s.fps} fps.`);
    videoBlob = await encodeWebCodecs({ canvas, fps: s.fps, duration: total, drawFrame, audioBuffer, support, onProgress, shouldCancel: () => cancelled });
  } else {
    log('Render', 'warning', 'WebCodecs is not available here; recording in real time instead (takes as long as the video).');
    videoBlob = await encodeMediaRecorder({ canvas, fps: s.fps, duration: total, drawFrame, audioBuffer, onProgress, shouldCancel: () => cancelled });
  }
  log('Render', 'success', `Encoded ${(videoBlob.size / 1048576).toFixed(1)} MB.`);

  // Package
  progress('Packaging', 0.5);
  drawFrame((scenes[0]?.start || 0) + 1.8);
  const thumbBlob = await new Promise(r => canvas.toBlob(r, 'image/jpeg', 0.9));
  canvas.hidden = true;
  const project = {
    id: (crypto.randomUUID ? crypto.randomUUID() : String(Date.now())), createdAt: Date.now(), prompt, title: publish.title,
    duration: total, aspect: s.aspect, width, height, videoType: videoBlob.type || 'video/mp4',
    videoBlob, thumbBlob, srt: srt(plan), youtubeText: youtubeText(plan, s),
    plan: { ...plan, scenes: scenes.map(({ audio, ...rest }) => rest) },
  };
  await store.putProject(project);
  progress('Packaging', 1);
  return project;
}

async function narrate(script, storyboard, s, speedMult) {
  const inputs = [];
  const audios = {};
  for (let i = 0; i < script.scenes.length; i++) {
    checkCancel();
    const sc = script.scenes[i];
    const audio = (MOCK && params.get('tts') === 'mock') ? mockAudio(sc.narration) : await synthesize(sc.narration, s.voice, s.speed * speedMult);
    audios[sc.beatId] = audio;
    const kind = (storyboard.scenes.find(v => v.beatId === sc.beatId) || {}).kind || 'bullets';
    inputs.push({ beatId: sc.beatId, kind, narrationDuration: audio.duration });
    progress('Narrating', (i + 1) / script.scenes.length, `${i + 1}/${script.scenes.length}`);
  }
  const { placements, total } = T.layout(inputs);
  const scenes = placements.map(p => {
    const sc = script.scenes.find(x => x.beatId === p.beatId);
    const visual = storyboard.scenes.find(v => v.beatId === p.beatId);
    const a = audios[p.beatId];
    return { beatId: p.beatId, script: sc, visual, start: p.start, duration: p.duration, narrationStart: p.narrationStart,
      narrationDuration: a.duration, audio: a, captions: T.captions(sc.narration, p.narrationStart, a.duration) };
  });
  return { scenes, total };
}

function mockAudio(text) {
  const sampleRate = 24000, duration = Math.max(0.8, T.wordCount(text) / 2.7);
  const n = Math.floor(duration * sampleRate), samples = new Float32Array(n);
  for (let i = 0; i < n; i++) samples[i] = Math.sin(2 * Math.PI * 220 * i / sampleRate) * 0.2 * (0.5 + 0.5 * Math.sin(2 * Math.PI * 3 * i / sampleRate));
  return { samples, sampleRate, duration };
}

function showResult(p) {
  $('resultCard').hidden = false;
  const url = URL.createObjectURL(p.thumbBlob);
  $('resultItem').innerHTML = `<img src="${url}" alt=""><div><div class="t">${esc(p.title)}</div><div class="c">${p.duration.toFixed(1)} s · tap to watch, share, and copy the YouTube text</div></div>`;
  $('resultItem').onclick = () => { showTab('videos'); openProject(p.id); };
}

// ---------- videos tab ----------
async function renderProjects() {
  const list = await store.listProjects();
  $('projects').innerHTML = '';
  $('projectsEmpty').hidden = list.length > 0;
  for (const p of list) {
    const b = document.createElement('button'); b.className = 'item' + (currentProject && currentProject.id === p.id ? ' sel' : '');
    const url = p.thumbBlob ? URL.createObjectURL(p.thumbBlob) : '';
    b.innerHTML = `${url ? `<img src="${url}" alt="">` : '<div class="ph"></div>'}<div><div class="t">${esc(p.title)}</div><div class="c">${p.duration.toFixed(0)} s · ${esc(p.aspect)} · ${new Date(p.createdAt).toLocaleString()}</div></div>`;
    b.onclick = () => openProject(p.id);
    $('projects').appendChild(b);
  }
}

async function openProject(id) {
  const p = await store.getProject(id);
  if (!p) return;
  currentProject = p;
  const card = $('detailCard'); card.hidden = false;
  const player = $('player');
  if (player.src) URL.revokeObjectURL(player.src);
  player.src = URL.createObjectURL(p.videoBlob);
  const ext = (p.videoType || '').includes('webm') ? 'webm' : 'mp4';
  const name = safeName(p.title);
  $('shareBtn').onclick = async () => {
    const files = [new File([p.videoBlob], `${name}.${ext}`, { type: p.videoType || 'video/mp4' })];
    const ok = await shareFiles(files, p.title);
    if (!ok) { download(p.videoBlob, `${name}.${ext}`); alert('Sharing is not available here; the video was downloaded instead. On iPhone, open it from Files and use Share → Save Video.'); }
  };
  $('dlVideo').onclick = () => download(p.videoBlob, `${name}.${ext}`);
  $('dlSrt').onclick = () => download(new Blob([p.srt], { type: 'text/plain' }), `${name}.srt`);
  $('dlText').onclick = () => download(new Blob([p.youtubeText], { type: 'text/plain' }), `${name}-youtube.txt`);
  $('deleteBtn').onclick = async () => { if (!confirm('Delete this video?')) return; await store.deleteProject(p.id); card.hidden = true; currentProject = null; renderProjects(); };
  const pub = p.plan.publish;
  const copyable = (label, text, lines = 6) => `<h3>${esc(label)}</h3><div class="copy"><span style="display:-webkit-box;-webkit-line-clamp:${lines};-webkit-box-orient:vertical;overflow:hidden">${esc(text)}</span><button class="secondary" data-copy="${esc(text)}">Copy</button></div>`;
  $('detailMeta').innerHTML =
    copyable('YouTube title', pub.title) + copyable('Description', pub.description, 10) + copyable('Tags', pub.tags.join(', ')) +
    (p.plan.claimsToVerify.length ? `<h3>Verify before publishing</h3>${p.plan.claimsToVerify.map(c => `<div class="copy"><span>☐ ${esc(c)}</span></div>`).join('')}` : '') +
    `<h3>Script</h3>` + p.plan.scenes.map(sc => `<div class="copy"><span><b style="color:var(--muted);font-size:.78rem">${chapterStamp(sc.start)} · ${esc(sc.visual.title)} · ${sc.visual.kind}</b>\n${esc(sc.script.narration)}</span></div>`).join('') +
    copyable('Everything for YouTube Studio', p.youtubeText, 14);
  $('detailMeta').querySelectorAll('[data-copy]').forEach(b => b.onclick = () => navigator.clipboard.writeText(b.dataset.copy).then(() => { b.textContent = 'Copied'; setTimeout(() => b.textContent = 'Copy', 1200); }));
  card.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ---------- models tab ----------
function allModels() { return [...MODELS, ...customModels.map(id => describeModel(id))]; }
function renderModels() {
  const gpu = hasWebGPU();
  $('modelList').innerHTML = allModels().map(m => {
    const downloaded = localStorage.getItem('aivideostudio.downloaded.' + m.id);
    const usable = m.engine !== 'webllm' || gpu;
    return `<label class="model"><input type="radio" name="model" value="${esc(m.id)}" ${settings.modelId === m.id ? 'checked' : ''} ${usable ? '' : 'disabled'}>
      <div><div class="n">${esc(m.name)} ${downloaded ? '<span class="ok">· downloaded</span>' : ''}</div><div class="d">${esc(m.note)}</div>
      <div class="d">${m.sizeMB ? m.sizeMB + ' MB · ' : ''}${m.engine === 'webllm' ? (gpu ? 'GPU (WebGPU)' : '<span class="bad">needs WebGPU</span>') : 'CPU (WebAssembly)'}</div></div>
      ${settings.modelId === m.id && !downloaded ? `<button class="secondary" data-load="${esc(m.id)}">Download</button>` : ''}</label>`;
  }).join('');
  $('modelList').querySelectorAll('input[name=model]').forEach(r => r.onchange = () => { settings.modelId = r.value; saveSettings(settings); renderModels(); renderSummary(); });
  $('modelList').querySelectorAll('[data-load]').forEach(b => b.onclick = async () => { b.disabled = true; try { await ensureEngine(); renderModels(); } catch (e) { $('engineStatus').innerHTML = `<span class="bad">${esc(e.message)}</span>`; } });
}
$('addModel').onclick = () => { const id = $('customModel').value.trim(); if (!id || allModels().some(m => m.id === id)) return; customModels.push(id); localStorage.setItem('aivideostudio.customModels', JSON.stringify(customModels)); $('customModel').value = ''; renderModels(); };
$('preloadTts').onclick = async () => { try { await loadTTS((f, file) => { $('ttsStatus').textContent = `Downloading voice: ${Math.round(f * 100)}% ${file || ''}`; }); $('ttsStatus').innerHTML = '<span class="ok">Voice model ready.</span>'; } catch (e) { $('ttsStatus').innerHTML = `<span class="bad">${esc(e.message)}</span>`; } };
$('previewVoice').onclick = async () => {
  try {
    $('ttsStatus').textContent = ttsLoaded() ? 'Speaking…' : 'Downloading the voice first…';
    const a = await synthesize('Attention lets a model decide which words matter most for the word it is writing next.', settings.voice, settings.speed);
    const ctx = new AudioContext(); const buf = ctx.createBuffer(1, a.samples.length, a.sampleRate); buf.copyToChannel(a.samples, 0);
    const src = ctx.createBufferSource(); src.buffer = buf; src.connect(ctx.destination); src.start();
    $('ttsStatus').innerHTML = '<span class="ok">Voice model ready.</span>';
  } catch (e) { $('ttsStatus').innerHTML = `<span class="bad">${esc(e.message)}</span>`; }
};
async function updateStorage() {
  try {
    const est = await navigator.storage.estimate();
    $('storageNote').textContent = `Using ${(est.usage / 1048576).toFixed(0)} MB of ${(est.quota / 1073741824).toFixed(1)} GB available to this app.`;
  } catch { $('storageNote').textContent = ''; }
}
$('clearCaches').onclick = async () => {
  if (!confirm('Delete all downloaded models and voices? Your videos are kept.')) return;
  if (engine) { await engine.unload(); engine = null; engineModelId = null; }
  const keys = await caches.keys();
  for (const k of keys) if (!k.startsWith('ai-video-studio')) await caches.delete(k);
  for (const k of Object.keys(localStorage)) if (k.startsWith('aivideostudio.downloaded.')) localStorage.removeItem(k);
  $('engineStatus').textContent = 'Downloads deleted.'; renderModels(); updateStorage();
};

// ---------- settings tab ----------
function renderSettings() {
  const bind = (id, key, parse = v => v, fmt = null) => {
    const el = $(id);
    if (el.type === 'checkbox') el.checked = !!settings[key]; else el.value = settings[key];
    if (fmt) fmt();
    el.oninput = () => { settings[key] = el.type === 'checkbox' ? el.checked : parse(el.value); saveSettings(settings); if (fmt) fmt(); renderSummary(); };
  };
  $('s-theme').innerHTML = Object.keys(THEMES).map(t => `<option>${t}</option>`).join('');
  $('s-voice').innerHTML = VOICES.map(([id, label]) => `<option value="${id}">${esc(label)}</option>`).join('');
  bind('s-aspect', 'aspect'); bind('s-quality', 'quality'); bind('s-fps', 'fps', v => parseInt(v, 10)); bind('s-theme', 'theme');
  bind('s-max', 'maxDuration', v => parseInt(v, 10), () => { $('s-max-v').textContent = settings.maxDuration; if (settings.targetDuration > settings.maxDuration - 5) { settings.targetDuration = settings.maxDuration - 5; $('s-target').value = settings.targetDuration; $('s-target-v').textContent = settings.targetDuration; } $('s-target').max = settings.maxDuration - 5; });
  bind('s-target', 'targetDuration', v => parseInt(v, 10), () => { $('s-target-v').textContent = settings.targetDuration; });
  bind('s-captions', 'burnInCaptions'); bind('s-progressbar', 'showProgressBar'); bind('s-channel', 'channelName'); bind('s-cta', 'cta');
  bind('s-voice', 'voice'); bind('s-speed', 'speed', parseFloat, () => { $('s-speed-v').textContent = settings.speed < 0.95 ? 'calm' : settings.speed > 1.05 ? 'brisk' : 'natural'; });
  bind('s-musicvol', 'musicVolume', v => parseInt(v, 10) / 100, () => { $('s-musicvol').value = Math.round(settings.musicVolume * 100); $('s-musicvol-v').textContent = Math.round(settings.musicVolume * 100); });
  bind('s-ambient', 'ambientBed');
  store.listMusic().then(names => { $('s-music').innerHTML = '<option value="">None</option>' + names.map(n => `<option value="${esc(n)}">${esc(n)}</option>`).join(''); $('s-music').value = settings.musicName || ''; });
  $('s-music').onchange = () => { settings.musicName = $('s-music').value; saveSettings(settings); };
}
$('importMusic').onclick = () => $('musicFile').click();
$('musicFile').onchange = async () => {
  const f = $('musicFile').files[0]; if (!f) return;
  await store.putMusic(f.name, f); settings.musicName = f.name; saveSettings(settings); renderSettings();
};

function esc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]); }

// Expose for tests
window.__studio = { start, produce, store, settings: () => settings };
