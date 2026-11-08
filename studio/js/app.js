// UI + production run. Everything happens in this browser tab.
import { Team, promptTopic, detectMode, parseDurationSeconds, wantsVoice, parseCinematicPrompt } from './agents.js';
import * as T from './timing.js';
import { MODELS, hasWebGPU, defaultModelId, describeModel, createEngine } from './llm.js';
import { loadTTS, synthesize, isLoaded as ttsLoaded } from './tts.js';
import { mix, decodeMusic } from './mixer.js';
import { Renderer } from './renderer.js';
import { encodeSupport, encodeWebCodecs, encodeMediaRecorder } from './encoder.js';
import { srt, youtubeText, download, shareFiles, safeName, chapterStamp } from './exporter.js';
import { store, requestPersistentStorage } from './store.js';
import { generateFootage, shotPrompt, testAIVideo, FOOTAGE_MODELS, FOOTAGE_COST, FREE_VIDEO_SPACES } from './footage.js';
import { openAsset } from './clipdecoder.js';
import { THEMES, VOICES, loadSettings, saveSettings, canvasSize } from './settings.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const MOCK = params.get('mock') === '1';
const STAGES = ['Planning', 'Writing', 'Reviewing', 'Designing', 'Metadata', 'Footage', 'Narrating', 'Mixing', 'Rendering', 'Packaging'];
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
// Offline support + self-update: the service worker serves the cached app instantly and fetches updates in
// the background; when a new version has taken over, reload once so the user never sees a stale build.
if ('serviceWorker' in navigator && !MOCK) {
  let hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hadController && !running && !sessionStorage.getItem('aivideostudio.reloaded')) { sessionStorage.setItem('aivideostudio.reloaded', '1'); location.reload(); }
    hadController = true;
  });
  navigator.serviceWorker.register('sw.js').then(reg => {
    // Check for a new version each time the app is opened or comes back to the foreground.
    const check = () => reg.update().catch(() => {});
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check(); });
    setTimeout(check, 3000);
  }).catch(() => {});
  sessionStorage.removeItem('aivideostudio.reloaded');
}
requestPersistentStorage();
const standalone = window.navigator.standalone || matchMedia('(display-mode: standalone)').matches;
if (standalone || localStorage.getItem('aivideostudio.hideInstall')) $('installCard').hidden = true;
$('hideInstall').onclick = () => { $('installCard').hidden = true; localStorage.setItem('aivideostudio.hideInstall', '1'); };
$('tokenGo').onclick = () => { showTab('studio'); setTimeout(() => { const el = $('s-hftoken'); el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.focus(); }, 150); };
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
$('style').value = settings.videoStyle || 'auto';
$('style').onchange = () => { settings.videoStyle = $('style').value; saveSettings(settings); renderSummary(); };
$('prompt').addEventListener('input', () => renderSummary());
$('cancel').onclick = () => { cancelled = true; log('Studio', 'warning', 'Cancelling…'); };
renderSummary();

function renderSummary() {
  const needsToken = settings.footageProvider === 'free' && settings.aiVideoEnabled !== false && !(settings.hfToken || '').trim();
  $('tokenBanner').hidden = !needsToken;
  const m = describeModel(settings.modelId);
  const [w, h] = canvasSize(settings);
  const mode = detectMode($('prompt').value, settings.videoStyle || 'auto');
  const asked = parseDurationSeconds($('prompt').value);
  $('styleHint').textContent = ($('prompt').value.trim() ? (mode === 'cinematic' ? 'Reads as a cinematic piece: one consistent world, full-frame shots, ' + (wantsVoice($('prompt').value) ? 'short voice-over.' : 'music only, no narration.') : 'Reads as an explainer: narrated lesson with titles and captions.') : '') + (asked ? ` Length from your prompt: ${asked} s.` : '');
  $('summary').innerHTML = `Model: <b>${esc(m.name)}</b> · ${esc(aspectLabel())} · ${w}×${h} · ${settings.fps} fps · ${esc(settings.theme)}<br>` +
    `Up to ${settings.maxDuration} s, aiming for ${settings.targetDuration} s · voice: ${esc((VOICES.find(v => v[0] === settings.voice) || [0, settings.voice])[1])}<br>` +
    `Footage: <b>${settings.footageProvider === 'fal' ? esc((FOOTAGE_MODELS.find(m => m.id === settings.falModel) || FOOTAGE_MODELS[0]).name) + (settings.falKey ? '' : ' · <span class="warn">no API key yet</span>')
      : settings.footageProvider === 'free' ? 'free ' + [settings.aiVideoEnabled !== false && settings.aiVideoSpace ? 'AI video (LTX on a free GPU)' : null, settings.pexelsKey ? 'Pexels video' : null, settings.pixabayKey ? 'Pixabay video' : null, settings.allowPollinations !== false ? 'AI photos with motion' : null].filter(Boolean).join(' → ') + (!settings.hfToken ? ' · <span class="warn">add a free Hugging Face token for more daily GPU time</span>' : '')
      : 'motion graphics only'}</b>` +
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
  const weights = { Planning: .10, Writing: .14, Reviewing: .07, Designing: .09, Metadata: .04, Footage: .12, Narrating: .12, Mixing: .02, Rendering: .28, Packaging: .02 };
  let total = 0;
  for (const s of STAGES) { if (s === stage) { total += weights[s] * fraction; break; } total += weights[s]; }
  $('bar').style.width = Math.round(Math.min(1, total) * 100) + '%';
  $('stages').innerHTML = STAGES.map(s => `<i class="${STAGES.indexOf(s) <= STAGES.indexOf(stage) ? 'on' : ''}"></i>`).join('');
}

async function loadModel(model) {
  if (engine && engineModelId === model.id) return engine;
  if (engine) { await engine.unload(); engine = null; engineModelId = null; }
  $('engineStatus').textContent = `Loading ${model.name}…`;
  let lastProgressAt = Date.now();
  const loading = createEngine(model, (f, text) => {
    lastProgressAt = Date.now();
    progress('Planning', 0, `Loading model ${Math.round(f * 100)}%`);
    $('engineStatus').textContent = `${model.name}: ${text || Math.round(f * 100) + '%'}`;
    $('modelProgress').hidden = false; $('modelProgress').firstElementChild.style.width = Math.round(f * 100) + '%';
  });
  // Watchdog: Safari sometimes stalls a download or a WebAssembly start forever; give up after 150 s of silence.
  const watchdog = new Promise((_, reject) => {
    const t = setInterval(() => { if (Date.now() - lastProgressAt > 150_000) { clearInterval(t); reject(new Error('no progress for 150 s (stalled download or start-up)')); } }, 5000);
    loading.finally(() => clearInterval(t));
  });
  engine = await Promise.race([loading, watchdog]);
  engineModelId = model.id;
  $('engineStatus').innerHTML = `<span class="ok">${esc(model.name)} ready</span>`;
  $('modelProgress').hidden = true;
  localStorage.setItem('aivideostudio.downloaded.' + model.id, '1');
  return engine;
}

/** Loads the selected model; if that fails, falls back to a CPU model; if that fails too, returns null
 *  (the studio then builds the script from the lines of the prompt). Never throws. */
async function ensureEngine(allowFallback = true) {
  const model = MOCK ? { id: 'mock', engine: 'mock', name: 'Mock writer (demo)', broken: params.get('broken') === '1', sizeMB: params.get('small') === '1' ? 300 : 900 } : describeModel(settings.modelId);
  const chain = [model];
  if (allowFallback && !MOCK) {
    const cpu = MODELS.find(m => m.engine === 'wllama');
    if (model.engine === 'webllm' && cpu) chain.push(cpu);
  }
  for (const m of chain) {
    try { return await loadModel(m); }
    catch (e) {
      console.error(e);
      log('Studio', 'warning', `Could not load ${m.name}: ${(e && e.message) || e}`);
      $('engineStatus').innerHTML = `<span class="bad">${esc(m.name)}: ${esc((e && e.message) || String(e))}</span>`;
      engine = null; engineModelId = null;
    }
  }
  if (!MOCK || params.get('nomodel') === '1') {
    log('Studio', 'warning', 'No language model could run here. The script will be built from the lines of your prompt: write one line per scene for best results.');
    return null;
  }
  return null;
}

function isSmallModel(model) { return !model || model.engine === 'wllama' || (model.sizeMB && model.sizeMB <= 700); }

async function start(resume = null) {
  const prompt = resume ? resume.prompt : $('prompt').value.trim();
  if (!prompt || running) return;
  if (!resume) {
    // Same prompt as a saved, interrupted run: continue it instead of starting over.
    try { const saved = await store.getRun(); if (saved && saved.prompt === prompt) resume = saved; else if (saved) await store.deleteRun(); } catch {}
  }
  running = true; cancelled = false;
  $('generate').hidden = true; $('cancel').hidden = false; $('resumeCard').hidden = true;
  $('log').innerHTML = ''; $('logCard').hidden = true; $('resultCard').hidden = true; $('stream').hidden = true; $('canvas').hidden = true;
  let wakeLock = null;
  try { wakeLock = await navigator.wakeLock?.request('screen'); } catch {}
  const t0 = Date.now();
  try {
    const project = await produce(prompt, resume);
    currentProject = project;
    const secs = Math.round((Date.now() - t0) / 1000);
    log('Studio', 'success', `Done in ${Math.floor(secs / 60)} min ${secs % 60} s. Open the Videos tab to watch, share and copy the YouTube text.`);
    showResult(project);
  } catch (e) {
    console.error(e);
    if (cancelled) { await store.deleteRun(); log('Studio', 'warning', 'Cancelled.'); }
    else log('Studio', 'error', ((e && e.message) || String(e)) + ' — your progress is saved; tap Generate again to continue from where it stopped.');
  } finally {
    running = false;
    $('generate').hidden = false; $('cancel').hidden = true;
    $('progressCard').hidden = true;
    try { wakeLock && wakeLock.release(); } catch {}
  }
}

function checkCancel() { if (cancelled) throw new Error('Cancelled'); }

// Every step saves a checkpoint. If Safari reloads the page (memory pressure), the run resumes from the
// last saved step instead of starting over, and the heavy parts are sequenced so they never coexist in memory:
// language model → (unload) → voice model → mix → render.
async function produce(prompt, resume) {
  const cp = resume || { id: 'current', prompt, settings: { ...settings }, attempts: 0, createdAt: Date.now() };
  const s = cp.settings;
  // The creator's words decide the kind of video and its length cap.
  cp.mode = cp.mode || detectMode(prompt, s.videoStyle || 'auto');
  const askedSeconds = parseDurationSeconds(prompt);
  if (askedSeconds && !cp.durationApplied) { s.maxDuration = Math.min(s.maxDuration, askedSeconds); s.targetDuration = Math.min(s.targetDuration, s.maxDuration - 4); cp.durationApplied = true; }
  const cinematic = cp.mode === 'cinematic';
  if (cinematic) { s.burnInCaptions = false; s.showProgressBar = false; if (!cp.cineConfigured) { s.footageScope = 'all'; s.footageDuration = Math.min(8.5, Math.max(7, s.footageDuration || 6)); cp.cineConfigured = true; } }
  if (params.get('footage') === 'mock' || params.get('footage') === 'mockimage') s.footageProvider = params.get('footage');
  if (params.get('space')) { s.footageProvider = 'free'; s.aiVideoSpace = params.get('space'); s.aiVideoEnabled = true; s.pexelsKey = ''; s.pixabayKey = ''; s.allowPollinations = params.get('nopoll') !== '1'; }
  const [width, height] = canvasSize(s);
  const save = async (stage) => { cp.stage = stage; cp.updatedAt = Date.now(); await store.putRun(cp); };
  const kindOf = (id) => ((cp.storyboard && cp.storyboard.scenes.find(v => v.beatId === id)) || cp.brief.outline.find(b => b.id === id) || {}).kind
    || ((cp.brief.outline.find(b => b.id === id) || {}).suggestedVisual) || 'bullets';
  if (resume) log('Studio', 'info', `Resuming from “${cp.stage}” (attempt ${cp.attempts + 1}).`);
  cp.attempts = (cp.attempts || 0) + 1;
  await save(cp.stage || 'start');

  // ---------- Language-model phase ----------
  const needsLLM = !(cp.brief && cp.script && cp.review && cp.storyboard && cp.publish);
  if (needsLLM) {
    progress('Planning', 0, 'Loading model');
    const explicitCinematic = cinematic && !!parseCinematicPrompt(prompt);
    if (explicitCinematic) log('Studio', 'info', 'Your prompt already describes the world and every shot, so no writer model is needed for this video.');
    const eng = (params.get('nomodel') === '1' || explicitCinematic) ? null : await ensureEngine();
    const model = eng ? (MOCK ? { engine: 'mock', sizeMB: params.get('small') === '1' ? 300 : 900 } : describeModel(engineModelId || s.modelId)) : null;
    if (eng) log('Studio', 'info', `Model “${eng.name}” is ready. Everything runs in this browser. Keep this screen open.`);
    const team = new Team(eng, s, (ev) => log(ev.agent, ev.level, ev.message), { small: isSmallModel(model) });
    if (eng && isSmallModel(model)) log('Studio', 'info', 'Small model: the agents will work one question at a time.');
    const sceneCount = T.sceneCountFor(s.targetDuration);
    const budget = () => T.wordBudget(s.targetDuration, cp.brief.outline.length);

    if (cinematic) {
      // ---- Cinematic pipeline: world bible + shot list, music-first, optional voice-over ----
      const shotSeconds = s.footageDuration;   // 7-second shots by default: 8 clips for a 60-second piece
      const shotCount = Math.max(3, Math.min(10, Math.floor(s.maxDuration / shotSeconds)));
      if (!cp.brief) { progress('Planning', 0.2); log('Studio', 'info', `This reads as a cinematic brief, not a lesson: planning ${shotCount} shots with one consistent world, ${wantsVoice(prompt) ? 'a short voice-over' : 'music only'}.`); cp.brief = await team.directorCinematic(prompt, shotCount, shotSeconds); await save('brief'); }
      checkCancel();
      if (!cp.script) { progress('Writing', 0.3); cp.script = await team.scriptwriterCinematic(cp.brief, wantsVoice(prompt)); await save('script'); }
      checkCancel();
      if (!cp.review) { cp.review = { approved: true, issues: [], claimsToVerify: [], revisedNarration: {} }; await save('review'); }
      if (!cp.storyboard) { progress('Designing', 0.3); cp.storyboard = team.designerCinematic(cp.brief); await save('storyboard'); }
      checkCancel();
      if (!cp.publish) {
        progress('Metadata', 0.2);
        const b = cp.brief;
        const words = `${b.title} ${b.logline}`.toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/).filter(w => w.length > 3);
        cp.publish = {
          title: b.title.slice(0, 100),
          description: `${b.logline}\n\n${[b.bible.character, b.bible.props, b.bible.setting].filter(Boolean).join(' ')}\n\nA cinematic short made with AI Video Studio.`,
          tags: [...new Set([...words.slice(0, 8), 'cinematic', 'ai video', 'short film', 'aesthetic'])].slice(0, 15),
          chapters: [], thumbnailText: clipWords(b.title, 3).toUpperCase(), pinnedComment: 'Which shot was your favourite?',
        };
        log('Publisher', 'success', `Title: “${cp.publish.title}”`);
        await save('publish');
      }
      if (!MOCK && eng) { await eng.unload(); engine = null; engineModelId = null; $('engineStatus').textContent = 'Model unloaded to free memory; it reloads from cache on the next run.'; await new Promise(r => setTimeout(r, 400)); }
    } else {
    if (!cp.brief) { progress('Planning', 0.2); cp.brief = await team.director(prompt, sceneCount); await save('brief'); }
    checkCancel();
    if (!cp.script) {
      progress('Writing', 0.2);
      let script = await team.scriptwriter(cp.brief, budget());
      for (let i = 0; i < 2 && script.totalWords > budget() * 1.08; i++) {
        checkCancel();
        script = await team.scriptwriter(cp.brief, budget(), script, `The draft is ${script.totalWords - budget()} words too long. Cut filler and keep every beat under ${Math.floor(budget() / cp.brief.outline.length)} words.`);
      }
      cp.script = script; await save('script');
    }
    checkCancel();
    if (!cp.review) {
      progress('Reviewing', 0.2);
      cp.review = await team.reviewer(cp.brief, cp.script, budget());
      for (const sc of cp.script.scenes) if (cp.review.revisedNarration[sc.beatId]) sc.narration = cp.review.revisedNarration[sc.beatId];
      cp.script.totalWords = cp.script.scenes.reduce((n, x) => n + T.wordCount(x.narration), 0);
      await save('review');
    }
    checkCancel();
    if (!cp.storyboard) { progress('Designing', 0.2); cp.storyboard = await team.designer(cp.brief, cp.script); await save('storyboard'); }
    checkCancel();
    if (!cp.publish) { progress('Metadata', 0.2); cp.publish = await team.publisher(cp.brief, cp.script); await save('publish'); }
    checkCancel();
    // Fit the cap from word counts while the writer is still here; the voice is measured later.
    const removed = T.tighten(cp.script, kindOf, s.maxDuration, s.speed);
    if (removed) { log('Producer', 'warning', `Script estimated over the ${s.maxDuration} s cap; dropped ${removed} sentence(s) from the wordiest beats.`); await save('publish'); }
    // Free the language model before anything else heavy is loaded.
    if (!MOCK && eng) { await eng.unload(); engine = null; engineModelId = null; $('engineStatus').textContent = 'Model unloaded to free memory; it reloads from cache on the next run.'; await new Promise(r => setTimeout(r, 400)); }
    }
  } else {
    log('Studio', 'info', 'Script, storyboard and metadata restored from the saved run.');
  }

  // ---------- Shot review: the creator reads and edits every shot prompt before any GPU time is spent ----------
  const footageWanted = s.footageProvider && s.footageProvider !== 'none';
  if (footageWanted && s.reviewShots !== false && !cp.shotsApproved && !params.get('autoapprove')) {
    progress('Designing', 1, 'waiting for your approval');
    await save('shots');
    const edited = await reviewShots(cp);
    for (const v of cp.storyboard.scenes) if (edited[v.beatId] !== undefined) v.shot = edited[v.beatId];
    cp.shotsApproved = true; await save('shots');
    log('Studio', 'success', 'Shot list approved.');
  }

  // ---------- Footage phase (cloud video model, optional) ----------
  const footageOn = s.footageProvider && s.footageProvider !== 'none' ? s.footageProvider : null;
  cp.footage = cp.footage || {};
  if (footageOn) {
    const fs = { ...s, footageProvider: footageOn };
    const topic = promptTopic(cp.brief.title);
    const wanted = cp.storyboard.scenes.filter((v, i) => fs.footageScope !== 'hero' || i === 0 || i === cp.storyboard.scenes.length - 1);
    const jobs = wanted.map(v => ({ beatId: v.beatId, prompt: shotPrompt(v.shot, topic), query: v.stockQuery || topic }));
    const missing = jobs.filter(j => !(j.beatId in cp.footage));
    if (missing.length) {
      progress('Footage', 0, `${missing.length} clip(s)`);
      const sourceName = footageOn === 'fal' ? (FOOTAGE_MODELS.find(m => m.id === fs.falModel) || FOOTAGE_MODELS[0]).name + ' (then free sources)'
        : footageOn.startsWith('mock') ? 'the test asset'
        : [fs.aiVideoEnabled !== false && fs.aiVideoSpace ? `free AI video (${(FREE_VIDEO_SPACES.find(x => x.id === fs.aiVideoSpace) || { name: fs.aiVideoSpace }).name.split(' (')[0]})` : null, fs.pexelsKey ? 'Pexels stock video' : null, fs.pixabayKey ? 'Pixabay stock video' : null, fs.allowPollinations !== false ? 'free AI images (Pollinations)' : null].filter(Boolean).join(' → ') || 'nothing (no free source enabled)';
      log('Footage', 'info', `Finding footage for ${missing.length} scene(s): ${sourceName}. Searches: ${wanted.map(v => `[${v.beatId}] ${v.stockQuery || ''}`).join(' · ').slice(0, 300)}`);
      const { results, errors } = await generateFootage(jobs, fs, {
        log, checkCancel, existing: cp.footage,
        onUpdate: (done, total, note) => progress('Footage', total ? done / total : 0, `${done}/${total} ${note || ''}`),
      });
      cp.footage = results;
      for (const e of errors) log('Footage', 'warning', e);
      const entries = Object.values(cp.footage).filter(Boolean);
      const ai = entries.filter(e => e.source === 'ai-video').length;
      const vids = entries.filter(e => e.kind === 'video').length - ai, imgs = entries.filter(e => e.kind === 'image').length;
      const summary = `${ai} AI-generated video clip(s), ${vids} stock clip(s), ${imgs} photo(s) with motion for ${jobs.length} scene(s); the rest use motion graphics.`;
      cp.footageSummary = summary + (errors.length ? ` Reasons: ${errors.slice(0, 2).join(' ')}` : '');
      if (ai === jobs.length) log('Footage', 'success', summary);
      else if (entries.length) log('Footage', 'warning', summary + (ai < jobs.length && fs.aiVideoEnabled !== false ? ' Real AI video was not available for every scene; see the reasons above.' : ''));
      else log('Footage', 'warning', 'No footage could be fetched; the video uses motion graphics for every scene.');
      await save('footage');
    }
  }

  // ---------- Voice phase ----------
  cp.audios = cp.audios || {};
  cp.speedMult = cp.speedMult || 1;
  const useMockTTS = MOCK && params.get('tts') === 'mock';
  let voiceOK = !useMockTTS;
  if (!useMockTTS && cp.script.scenes.some(sc => !cp.audios[sc.beatId])) {
    progress('Narrating', 0, 'Loading voice');
    try {
      await loadTTS((f, file) => { progress('Narrating', 0, `Downloading voice ${Math.round(f * 100)}%`); $('ttsStatus').textContent = `Downloading voice: ${Math.round(f * 100)}% ${file || ''}`; });
    } catch (e) {
      voiceOK = false;
      log('Narrator', 'warning', `The voice model could not load (${(e && e.message) || e}). Producing the video with captions and no voice; tap "Download voice now" in Models and generate again later.`);
    }
  }
  cp.silent = !voiceOK && !useMockTTS;
  let timeline = await narrate(cp, s, useMockTTS, save);
  let mult = T.speedToFit(timeline.total, s.maxDuration);
  if (mult && cp.speedMult === 1) {
    log('Producer', 'warning', `Cut is ${timeline.total.toFixed(1)} s, over the ${s.maxDuration} s cap. Re-recording narration ${Math.round((mult - 1) * 100)}% faster.`);
    cp.speedMult = mult; cp.audios = {}; await save('narration');
    timeline = await narrate(cp, s, useMockTTS, save);
  }
  let { scenes, total } = timeline;
  if (total > s.maxDuration) { total = T.hardTrim(scenes, s.maxDuration); log('Producer', 'warning', 'Trimmed the end of the final scene to respect the cap.'); }
  log('Producer', 'success', `Final cut: ${total.toFixed(1)} s across ${scenes.length} scenes.`);
  await save('render');
  checkCancel();

  const footageCredits = [...new Set(Object.values(cp.footage || {}).filter(Boolean).map(e => e.credit).filter(Boolean))];
  const footageBySceneLabel = Object.fromEntries(scenes.map(sc => { const e = cp.footage && cp.footage[sc.beatId]; return [sc.beatId, !e ? 'motion graphics' : e.source === 'ai-video' ? 'AI-generated video' : e.kind === 'video' ? 'stock video' : 'AI photo with motion']; }));
  const plan = { prompt, brief: cp.brief, review: cp.review, publish: cp.publish, scenes, totalDuration: total, claimsToVerify: cp.review.claimsToVerify, width, height, fps: s.fps, footageCredits, footageBySceneLabel, footageSummary: cp.footageSummary || '', createdAt: Date.now() };

  // ---------- Mix ----------
  progress('Mixing', 0.3);
  let music = null;
  if (s.musicName) { const blob = await store.getMusic(s.musicName); if (blob) { try { music = await decodeMusic(blob); } catch { log('Audio', 'warning', 'Could not decode the music file; continuing without it.'); } } }
  const spoken = scenes.some(sc => sc.script.narration && sc.script.narration.trim());
  const audioBuffer = await mix(scenes, total, music, { musicVolume: spoken ? s.musicVolume : Math.max(s.musicVolume, 0.6), ambientBed: s.ambientBed || !spoken });
  if (!spoken) log('Audio', 'info', music ? 'Music-only soundtrack.' : 'No music file set: using the generated ambient bed. Import a track in Studio → Music for a real soundtrack.');
  log('Audio', 'success', 'Narration mixed' + (music ? ' with music under ducking.' : '.'));
  checkCancel();

  // ---------- Render + encode ----------
  progress('Rendering', 0);
  const canvas = $('canvas');
  canvas.width = width; canvas.height = height; canvas.hidden = false;
  const renderer = new Renderer(canvas, s);
  // Footage frames: open one clip at a time as the timeline enters each scene. Clip time is stretched to the
  // scene length (gentle slow motion) so there is never a hard cut inside a scene.
  const clips = {};
  let openScene = null, openClipHandle = null;
  const footageFrameAt = async (t) => {
    const idx = plan.scenes.findIndex(sc => t >= sc.start && t < sc.start + sc.duration);
    if (idx < 0) return null;
    const sc = plan.scenes[idx];
    let entry = cp.footage && cp.footage[sc.beatId];
    if (!entry && cinematic) {
      // A cinematic piece never drops to text slides: borrow the nearest scene's clip.
      const order = plan.scenes.map((x, i) => [Math.abs(i - idx) + (i > idx ? 0.5 : 0), x.beatId]).sort((a, b) => a[0] - b[0]);
      for (const [, id] of order) if (cp.footage && cp.footage[id]) { entry = cp.footage[id]; break; }
      if (!entry) return null;
    }
    if (openScene !== sc.beatId) {
      if (openClipHandle) { try { openClipHandle.close(); } catch {} }
      openClipHandle = null; openScene = sc.beatId;
      try { openClipHandle = await openAsset(entry, width, height, idx); } catch (e) { log('Footage', 'warning', `Scene ${sc.beatId}: could not decode the footage (${e.message}); using motion graphics.`); }
    }
    if (!openClipHandle) return null;
    const local = t - sc.start;
    if (openClipHandle.isImage) { try { return await openClipHandle.frameAt(local, local, sc.duration); } catch { return null; } }
    const clipT = openClipHandle.duration >= sc.duration ? local : local * (openClipHandle.duration / sc.duration);
    try { return await openClipHandle.frameAt(clipT); } catch { return null; }
  };
  const hasFootage = Object.values(cp.footage || {}).some(Boolean);
  const drawFrame = (t) => renderer.draw(plan, t, renderer._pendingFrame || null);
  const prepareFrame = hasFootage ? async (t) => { renderer._pendingFrame = await footageFrameAt(t); } : null;
  const support = await encodeSupport(width, height);
  const onProgress = (f) => progress('Rendering', f, Math.round(f * 100) + '%');
  let videoBlob;
  if (support) {
    log('Render', 'info', `Encoding with WebCodecs (${support.codec.toUpperCase()} + ${support.audio.toUpperCase()}), ${width}×${height} at ${s.fps} fps.`);
    videoBlob = await encodeWebCodecs({ canvas, fps: s.fps, duration: total, drawFrame, prepareFrame, audioBuffer, support, onProgress, shouldCancel: () => cancelled });
  } else {
    log('Render', 'warning', 'WebCodecs is not available here; recording in real time instead (takes as long as the video).');
    videoBlob = await encodeMediaRecorder({ canvas, fps: s.fps, duration: total, drawFrame, prepareFrame, audioBuffer, onProgress, shouldCancel: () => cancelled });
  }
  if (openClipHandle) { try { openClipHandle.close(); } catch {} }
  renderer._pendingFrame = null;
  log('Render', 'success', `Encoded ${(videoBlob.size / 1048576).toFixed(1)} MB.`);

  // ---------- Package ----------
  progress('Packaging', 0.5);
  if (prepareFrame) { try { await prepareFrame((scenes[0]?.start || 0) + 1.8); } catch {} }
  drawFrame((scenes[0]?.start || 0) + 1.8);
  if (openClipHandle) { try { openClipHandle.close(); } catch {} openClipHandle = null; }
  renderer._pendingFrame = null;
  const thumbBlob = await new Promise(r => canvas.toBlob(r, 'image/jpeg', 0.9));
  canvas.hidden = true;
  const project = {
    id: (crypto.randomUUID ? crypto.randomUUID() : String(Date.now())), createdAt: Date.now(), prompt, title: cp.publish.title,
    duration: total, aspect: s.aspect, width, height, videoType: videoBlob.type || 'video/mp4',
    videoBlob, thumbBlob, srt: srt(plan), youtubeText: youtubeText(plan, s),
    plan: { ...plan, scenes: scenes.map(({ audio, ...rest }) => rest) },
  };
  await store.putProject(project);
  await store.deleteRun();
  progress('Packaging', 1);
  return project;
}

/** Synthesises any scene that has no audio yet (saving after each), then lays the timeline out. */
async function narrate(cp, s, useMockTTS, save) {
  const script = cp.script, storyboard = cp.storyboard;
  const n = script.scenes.length;
  for (let i = 0; i < n; i++) {
    const sc = script.scenes[i];
    if (cp.audios[sc.beatId]) continue;
    checkCancel();
    progress('Narrating', i / n, `${i + 1}/${n}`);
    let a;
    if (!sc.narration || !sc.narration.trim()) a = silentSeconds(Math.max(T.MIN_SCENE, s.footageDuration || 6) - T.LEAD_IN - T.TAIL);
    else if (useMockTTS) a = mockAudio(sc.narration);
    else if (cp.silent) a = silentAudio(sc.narration, s.speed * cp.speedMult);
    else {
      try { a = await synthesize(sc.narration, s.voice, s.speed * cp.speedMult); }
      catch (e) { log('Narrator', 'warning', `Could not voice scene ${sc.beatId} (${(e && e.message) || e}); leaving it silent.`); a = silentAudio(sc.narration, s.speed * cp.speedMult); }
    }
    cp.audios[sc.beatId] = { samples: a.samples, sampleRate: a.sampleRate, duration: a.duration };
    await save('narration');
  }
  progress('Narrating', 1, `${n}/${n}`);
  const inputs = script.scenes.map(sc => ({ beatId: sc.beatId, kind: (storyboard.scenes.find(v => v.beatId === sc.beatId) || {}).kind || 'bullets', narrationDuration: cp.audios[sc.beatId].duration }));
  const { placements, total } = T.layout(inputs);
  const scenes = placements.map(p => {
    const sc = script.scenes.find(x => x.beatId === p.beatId);
    const visual = storyboard.scenes.find(v => v.beatId === p.beatId);
    const a = cp.audios[p.beatId];
    return { beatId: p.beatId, script: sc, visual, start: p.start, duration: p.duration, narrationStart: p.narrationStart,
      narrationDuration: a.duration, audio: a, captions: T.captions(sc.narration, p.narrationStart, a.duration) };
  });
  return { scenes, total };
}

function silentSeconds(seconds) {
  const sampleRate = 24000, duration = Math.max(0.5, seconds);
  return { samples: new Float32Array(Math.floor(duration * sampleRate)), sampleRate, duration };
}

function silentAudio(text, speed = 1) {
  const sampleRate = 24000, duration = Math.max(1.2, T.wordCount(text) / (T.WORDS_PER_SECOND * speed));
  return { samples: new Float32Array(Math.floor(duration * sampleRate)), sampleRate, duration };
}

function mockAudio(text) {
  const sampleRate = 24000, duration = Math.max(0.8, T.wordCount(text) / T.WORDS_PER_SECOND);
  const n = Math.floor(duration * sampleRate), samples = new Float32Array(n);
  for (let i = 0; i < n; i++) samples[i] = Math.sin(2 * Math.PI * 220 * i / sampleRate) * 0.2 * (0.5 + 0.5 * Math.sin(2 * Math.PI * 3 * i / sampleRate));
  return { samples, sampleRate, duration };
}

// ---------- shot review UI ----------
function reviewShots(cp) {
  return new Promise((resolve) => {
    const card = $('reviewCard'); card.hidden = false;
    const b = cp.brief.bible;
    $('reviewWorld').innerHTML = b ? `<b>World (used in every shot):</b> ${esc([b.character, b.props, b.setting, b.palette].filter(Boolean).join(' '))}` : '';
    $('reviewList').innerHTML = cp.storyboard.scenes.map(v => `<div class="field"><label>Shot ${v.beatId}${v.title ? ' · ' + esc(v.title) : ''}</label><textarea data-beat="${v.beatId}" style="min-height:70px">${esc(v.shot || '')}</textarea></div>`).join('');
    card.scrollIntoView({ behavior: 'smooth', block: 'start' });
    const finish = () => {
      const edited = {};
      card.querySelectorAll('textarea[data-beat]').forEach(t => { edited[parseInt(t.dataset.beat, 10)] = t.value.trim(); });
      card.hidden = true; resolve(edited);
    };
    $('reviewGo').onclick = finish;
    $('reviewSkip').onclick = () => { settings.reviewShots = false; saveSettings(settings); finish(); };
  });
}
function clipWords(s, n) { return String(s || '').split(/\s+/).slice(0, n).join(' '); }

// ---------- resume after an interrupted run ----------
async function checkInterruptedRun() {
  let run = null;
  try { run = await store.getRun(); } catch {}
  if (!run || !run.stage) return;
  const card = $('resumeCard'); card.hidden = false;
  const stageLabel = { start: 'the start', brief: 'the plan', script: 'the script', review: 'the review', storyboard: 'the storyboard', publish: 'the YouTube text', shots: 'the shot review', footage: 'the footage', narration: 'the narration', render: 'the render' }[run.stage] || run.stage;
  $('resumeText').textContent = `A previous run (“${run.prompt.slice(0, 60)}”) was interrupted after ${stageLabel}. This usually means Safari reloaded the page to free memory. Your progress is saved.`;
  const lighter = run.attempts >= 2;
  $('resumeLighter').hidden = !lighter;
  $('resumeBtn').onclick = () => { $('prompt').value = run.prompt; start(run); };
  $('resumeLighter').onclick = () => {
    run.settings.quality = '720';
    if (!MOCK) { const m = describeModel(run.settings.modelId); if (m.engine === 'webllm' && m.sizeMB > 400) { run.settings.modelId = 'SmolLM2-360M-Instruct-q4f16_1-MLC'; settings.modelId = run.settings.modelId; saveSettings(settings); } }
    delete run.brief; delete run.script; delete run.review; delete run.storyboard; delete run.publish; run.audios = {};
    $('prompt').value = run.prompt; start(run);
  };
  $('resumeDiscard').onclick = async () => { await store.deleteRun(); card.hidden = true; };
  if (!lighter && !params.has('noauto')) {
    let left = 5;
    $('resumeBtn').textContent = `Resume (${left})`;
    const timer = setInterval(() => { left--; if (left <= 0) { clearInterval(timer); if (!card.hidden && !running) $('resumeBtn').click(); } else $('resumeBtn').textContent = `Resume (${left})`; }, 1000);
    card.dataset.timer = String(timer);
    $('resumeDiscard').addEventListener('click', () => clearInterval(timer));
  }
}
checkInterruptedRun();

function showResult(p) {
  $('resultCard').hidden = false;
  const url = URL.createObjectURL(p.thumbBlob);
  $('resultItem').innerHTML = `<img src="${url}" alt=""><div><div class="t">${esc(p.title)}</div><div class="c">${p.duration.toFixed(1)} s · ${esc((p.plan && p.plan.footageSummary) || '')} · tap to watch, share, and copy the YouTube text</div></div>`;
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
    (p.plan.footageSummary ? `<h3>Footage</h3><div class="copy"><span>${esc(p.plan.footageSummary)}</span></div>` : '') +
    `<h3>Script</h3>` + p.plan.scenes.map(sc => `<div class="copy"><span><b style="color:var(--muted);font-size:.78rem">${chapterStamp(sc.start)} · ${esc(sc.visual.title)} · ${sc.visual.kind}${p.plan.footageBySceneLabel ? ' · ' + esc(p.plan.footageBySceneLabel[sc.beatId] || '') : ''}</b>\n${esc(sc.script.narration)}</span></div>`).join('') +
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
  $('modelList').querySelectorAll('[data-load]').forEach(b => b.onclick = async () => { b.disabled = true; try { await loadModel(MOCK ? { id: 'mock', engine: 'mock', name: 'Mock writer (demo)' } : describeModel(settings.modelId)); renderModels(); } catch (e) { $('engineStatus').innerHTML = `<span class="bad">${esc(e.message)}</span>`; } });
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
  $('s-falmodel').innerHTML = FOOTAGE_MODELS.map(m => `<option value="${m.id}">${esc(m.name)}${FOOTAGE_COST[m.id] != null ? ` · ~$${FOOTAGE_COST[m.id].toFixed(2)}/clip` : ''}</option>`).join('');
  bind('s-footage', 'footageProvider', v => v, () => { $('falFields').hidden = settings.footageProvider !== 'fal'; $('freeFields').hidden = settings.footageProvider === 'none'; });
  bind('s-pexels', 'pexelsKey'); bind('s-pixabay', 'pixabayKey'); bind('s-pollinations', 'allowPollinations');
  $('s-space').innerHTML = FREE_VIDEO_SPACES.map(x => `<option value="${esc(x.id)}">${esc(x.name)}</option>`).join('');
  const knownSpace = FREE_VIDEO_SPACES.some(x => x.id === settings.aiVideoSpace);
  $('s-space').value = knownSpace ? settings.aiVideoSpace : 'custom';
  $('s-spacecustom').hidden = knownSpace; $('s-spacecustom').value = knownSpace ? '' : (settings.aiVideoSpace || '');
  $('s-space').onchange = () => { const v = $('s-space').value; $('s-spacecustom').hidden = v !== 'custom'; if (v !== 'custom') { settings.aiVideoSpace = v; saveSettings(settings); renderSummary(); } };
  $('s-spacecustom').oninput = () => { settings.aiVideoSpace = $('s-spacecustom').value.trim(); saveSettings(settings); renderSummary(); };
  bind('s-aivideo', 'aiVideoEnabled'); bind('s-hftoken', 'hfToken'); bind('s-patience', 'footagePatienceMin', v => parseInt(v, 10));
  bind('s-review', 'reviewShots'); bind('s-filmlook', 'filmLook'); bind('s-letterbox', 'letterbox');
  $('testAI').onclick = async () => {
    const btn = $('testAI'); btn.disabled = true; $('testAIStatus').textContent = 'Starting…';
    try {
      const r = await testAIVideo(settings, (m) => { $('testAIStatus').textContent = m; });
      $('testAIStatus').innerHTML = r.ok ? `<span class="ok">${esc(r.message)}</span>` : `<span class="bad">${esc(r.message)}</span>`;
      if (r.ok && r.blob) { const v = $('testAIVideo'); v.hidden = false; v.src = URL.createObjectURL(r.blob); }
    } finally { btn.disabled = false; }
  };
  bind('s-falkey', 'falKey'); bind('s-falmodel', 'falModel', v => v, () => { $('falCustom').hidden = settings.falModel !== 'custom'; });
  bind('s-falendpoint', 'falEndpoint'); bind('s-falextra', 'falExtra');
  bind('s-footagedur', 'footageDuration', v => parseInt(v, 10)); bind('s-footagescope', 'footageScope');
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
