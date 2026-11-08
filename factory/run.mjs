// AI Video Studio "video factory": drives the web studio in a headless browser on a server (GitHub Actions),
// so the same pipeline runs without a phone. Usage: node factory/run.mjs  (configuration via environment variables)
//
//   PROMPT            the creator's prompt (required)
//   STYLE             auto | explainer | cinematic           (default auto)
//   ASPECT            16x9 | 9x16 | 1x1                      (default 16x9)
//   MAX_SECONDS       length cap                             (default 60)
//   FOOTAGE           free | hf | none                       (default free: LTX-2.3 Space, then stock/photos)
//   HF_TOKEN          Hugging Face token (writer model, free GPU priority, Inference Providers)
//   WRITER            hf-text:<model id> | mock              (default hf-text:Qwen/Qwen2.5-72B-Instruct)
//   HF_VIDEO_MODEL    model for FOOTAGE=hf                   (default Wan-AI/Wan2.2-T2V-A14B)
//   PEXELS_KEY        optional stock-footage key
//   VOICE, SPEED, CHANNEL, CTA, THEME, QUALITY (720|1080), FPS
//   STUDIO_URL        where the studio is served              (default http://127.0.0.1:8765/studio/index.html)
//   OUT_DIR           output folder                           (default ./out)
//   EXTRA_QUERY       extra URL params for tests (e.g. mock=1&footage=mock&tts=mock)
//   PHASE             all | plan | video                     (default all)
//                     plan: stop after the content plan and write out/plan.json + out/plan.md (nothing rendered)
//                     video: make the video from PLAN_FILE (a plan.json the creator approved)
//   PLAN_FILE         path to a plan.json (video phase; or the previous plan when FEEDBACK is given)
//   FEEDBACK          the creator's change requests: PHASE=plan re-plans from PLAN_FILE with this feedback
//   AI_CLIPS          long lessons: how many scenes get a generated AI clip (default 12)
//   MIN_SCENE_SECONDS hold every scene at least this long (default: renderer minimum; lessons: 10)
//   LESSON            a Klasse-6 topic id from klasse6/data/klasse6-bayern.json, e.g. M6-2.2: makes a German lesson
//                     for children from the verified Bavarian syllabus (style course, 3D maths scenes, German voice)
//   MINUTES           lesson length in minutes (default: the topic's videoMinutes)
//   TTS               piper:<voice>  e.g. piper:de_DE-thorsten-high (default for lessons): the voice is synthesised here
//                     with Piper and handed to the page; the voice files are fetched into .piper/ on first use
//   REVIEWER          hf-text:<model id> for a second, different reviewer model (lessons default to Llama 3.3 70B)
//   TIMEOUT_MIN, PATIENCE_MIN, PROFILE_DIR
//   CRASH_TEST=<s>    test hook: crash the page once after <s> seconds (exercises the relaunch path)
//                     (the studio has a matching hook: EXTRA_QUERY=failonce=1 stops its first attempt once)
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { execSync, execFileSync } from 'node:child_process';

const env = (k, d) => (process.env[k] && process.env[k].trim()) || d;
const phase = env('PHASE', 'all');
const feedback = env('FEEDBACK', '');
const planFile = env('PLAN_FILE', '');
let inputPlan = null;
if (planFile) {
  if (!fs.existsSync(planFile)) { console.error(`PLAN_FILE not found: ${planFile}`); process.exit(2); }
  inputPlan = JSON.parse(fs.readFileSync(planFile, 'utf8'));
  if (inputPlan.plan) inputPlan = inputPlan.plan;
}
let prompt = (inputPlan && inputPlan.prompt) || env('PROMPT', '');
// ---- Lesson mode: the topic comes from the verified syllabus, the prompt is built here in German ----
const lessonId = env('LESSON', '');
let lesson = null;
if (lessonId) {
  const data = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'klasse6/data/klasse6-bayern.json'), 'utf8'));
  for (const subject of data.subjects) for (const lb of subject.lernbereiche) for (const topic of lb.topics) if (topic.id.toLowerCase() === lessonId.toLowerCase()) lesson = { subject, lb, topic };
  if (!lesson) { console.error(`LESSON "${lessonId}" is not a topic id in klasse6/data/klasse6-bayern.json (see klasse6/LEKTIONEN.md)`); process.exit(2); }
  if (!prompt) prompt = lessonPrompt(lesson, parseFloat(env('MINUTES', String(lesson.topic.videoMinutes || 6))));
}
function lessonPrompt({ subject, lb, topic }, minutes) {
  const lines = [
    `Lektion für die 6. Klasse Gymnasium in Bayern (LehrplanPLUS G9). Fach ${subject.name}, Lernbereich ${lb.id.replace('-', ' ')} „${lb.title}“, Thema ${topic.id.replace('-', ' ')} „${topic.title}“${topic.hours ? ` (ca. ${topic.hours} Unterrichtsstunden im Lehrplan)` : ''}.`,
    `${minutes} Minuten, auf Deutsch, für Kinder von etwa 11 Jahren. Jede Szene mindestens zehn Sekunden.`,
  ];
  if (topic.kompetenzen && topic.kompetenzen.length) lines.push('Kompetenzerwartungen laut Lehrplan:', ...topic.kompetenzen.map(k => `- ${k}`));
  if (topic.inhalte && topic.inhalte.length) lines.push(`Inhalte: ${topic.inhalte.join('; ')}.`);
  if (topic.kidExplanation) lines.push(`Kindgerechte Grundidee: ${topic.kidExplanation}`);
  lines.push(`Quelle: ${subject.url}`);
  return lines.join('\n');
}
// Feedback without a previous plan (someone replied before any plan existed): fold it into the request.
if (feedback && !inputPlan && prompt) prompt += `\n\nCreator notes: ${feedback}`;
if (!prompt) { console.error('PROMPT is required'); process.exit(2); }
if (phase === 'video' && !inputPlan) { console.error('PHASE=video needs PLAN_FILE'); process.exit(2); }
const outDir = path.resolve(env('OUT_DIR', 'out'));
fs.mkdirSync(outDir, { recursive: true });
const studioUrl = env('STUDIO_URL', 'http://127.0.0.1:8765/studio/index.html');
const extra = env('EXTRA_QUERY', '');
const settings = {
  footageMigrated: 1, generatorMigrated: 1,
  videoStyle: env('STYLE', 'auto'),
  aspect: env('ASPECT', '16x9'),
  quality: env('QUALITY', '1080'),
  fps: parseInt(env('FPS', '30'), 10),
  theme: env('THEME', 'Midnight'),
  maxDuration: parseInt(env('MAX_SECONDS', '60'), 10),
  targetDuration: Math.max(15, parseInt(env('MAX_SECONDS', '60'), 10) - 8),
  voice: env('VOICE', 'af_heart'), speed: parseFloat(env('SPEED', '1.0')),
  channelName: env('CHANNEL', ''), cta: env('CTA', 'Subscribe for more'),
  footageProvider: env('FOOTAGE', 'free'),
  aiVideoEnabled: true, aiVideoSpace: env('VIDEO_SPACE', 'Lightricks/LTX-2-3'),
  hfToken: env('HF_TOKEN', ''), hfProviderModel: env('HF_VIDEO_MODEL', 'Wan-AI/Wan2.2-T2V-A14B'),
  pexelsKey: env('PEXELS_KEY', ''), pixabayKey: env('PIXABAY_KEY', ''), allowPollinations: env('POLLINATIONS', '1') !== '0',
  footagePatienceMin: parseInt(env('PATIENCE_MIN', String(Math.max(25, 4 * parseInt(env('AI_CLIPS', '12'), 10)))), 10),
  reviewShots: false, burnInCaptions: env('CAPTIONS', '1') !== '0', showProgressBar: true, filmLook: true, letterbox: env('LETTERBOX', '1') !== '0',
  musicVolume: 0.18, ambientBed: true,
  aiClipBudget: parseInt(env('AI_CLIPS', '12'), 10),
  minSceneSeconds: parseFloat(env('MIN_SCENE_SECONDS', lessonId ? '10' : '0')) || 0,
  modelId: env('WRITER', 'hf-text:Qwen/Qwen2.5-72B-Instruct'),
};
if (lesson) {
  const minutes = parseFloat(env('MINUTES', String(lesson.topic.videoMinutes || 6)));
  settings.videoStyle = 'course';
  settings.targetDuration = Math.round(minutes * 60); settings.maxDuration = Math.min(600, Math.round(minutes * 60 * 1.08));
  settings.lesson = { id: lesson.topic.id, title: lesson.topic.title, subject: lesson.subject.name, scene: lesson.subject.id === 'mathematik' && lesson.topic.scene ? lesson.topic.scene : null, minWords: 32 };
  settings.footageProvider = env('FOOTAGE', 'none');          // lessons are 3D scenes and graphics; no stock clips of offices
  settings.aiClipBudget = parseInt(env('AI_CLIPS', '0'), 10);
  settings.cta = env('CTA', 'Abonniere für die nächste Lektion');
  settings.reviewerModelId = env('REVIEWER', 'hf-text:meta-llama/Llama-3.3-70B-Instruct');
  console.log(`[factory] lesson ${lesson.topic.id} „${lesson.topic.title}“ (${lesson.subject.name}), ${minutes} min, min scene ${settings.minSceneSeconds} s, 3D scene ${settings.lesson.scene || 'none'}`);
}
const mock = /(^|&)mock=1/.test(extra);
if (mock) settings.modelId = 'mock';
// Without a Hugging Face token the only writer left is a tiny CPU model inside the browser, which takes the
// better part of an hour on a CI machine. Skip the writer instead (template script) and say so loudly.
let extraQuery = extra;
if (!mock && !settings.hfToken && !process.env.WRITER) {
  console.log('[factory] WARNING: no HF_TOKEN. Skipping the writer model; the script is built from the prompt lines. Add the HF_TOKEN secret for real scripts and GPU footage.');
  extraQuery = (extraQuery ? extraQuery + '&' : '') + 'nomodel=1';
}
if (process.env.WRITER === 'none') extraQuery = (extraQuery ? extraQuery + '&' : '') + 'nomodel=1';

console.log(`[factory] phase=${phase} style=${settings.videoStyle} aspect=${settings.aspect} cap=${settings.maxDuration}s footage=${settings.footageProvider} writer=${settings.modelId} token=${settings.hfToken ? 'yes' : 'no'}${inputPlan ? ' plan=' + planFile : ''}${feedback ? ' feedback=yes' : ''}`);
if (phase === 'video' && inputPlan && inputPlan.stage === 'plan' && !inputPlan.script) { console.error('The plan file has no script; it was probably not finished.'); process.exit(2); }
// The MP4 is streamed from the page to this file as it is encoded (so a ten-minute video never sits in page memory).
const rawPath = path.join(outDir, 'video-raw.mp4');
let sinkFd = null;

// A persistent profile keeps IndexedDB (run checkpoints, downloaded voice model) across a relaunch, so a browser
// crash resumes the run instead of starting over.
const profileDir = path.resolve(env('PROFILE_DIR', path.join(outDir, '.browser-profile')));
let context, page, crashed = false;
// Close the browser for real. After a renderer crash context.close() can hang or leave the browser process alive,
// and a surviving process keeps the profile's IndexedDB locked ("Internal error opening backing store"), which
// stalls the relaunched studio. So: polite close with a timeout, then kill anything still holding the profile,
// then remove the profile lock files.
async function hardClose() {
  await Promise.race([context?.close().catch(() => {}), new Promise(r => setTimeout(r, 10_000))]);
  try { execSync(`pkill -f -- "--user-data-dir=${profileDir}"`, { stdio: 'ignore' }); } catch {}
  await new Promise(r => setTimeout(r, 2000));
  for (const f of ['SingletonLock', 'SingletonSocket', 'SingletonCookie']) { try { fs.rmSync(path.join(profileDir, f), { force: true }); } catch {} }
}
// BROWSER_CHANNEL=chrome uses the machine's Google Chrome instead of the bundled test build of Chromium. The
// bundled build has no H.264 decoder, so AI clips (MP4/H.264) could not be decoded and scenes fell back to motion
// graphics; Chrome decodes and encodes them natively. Falls back to the bundled build if Chrome is missing.
const browserChannel = process.env.BROWSER_CHANNEL || '';
async function launch() {
  const opts = {
    headless: true, viewport: { width: 1280, height: 2200 },
    args: ['--autoplay-policy=no-user-gesture-required', '--disable-dev-shm-usage', '--no-sandbox', '--js-flags=--max-old-space-size=4096'],
  };
  if (browserChannel) {
    try { context = await chromium.launchPersistentContext(profileDir, { ...opts, channel: browserChannel }); console.log(`[factory] browser: ${browserChannel}`); }
    catch (e) { console.log(`[factory] could not start ${browserChannel} (${e.message.split('\n')[0]}); using the bundled Chromium`); context = null; }
  }
  if (!context) context = await chromium.launchPersistentContext(profileDir, opts);
  if (phase !== 'plan') {
    await context.exposeFunction('__factorySinkOpen', () => { if (sinkFd !== null) { try { fs.closeSync(sinkFd); } catch {} } sinkFd = fs.openSync(rawPath, 'w'); });
    await context.exposeFunction('__factoryWrite', (b64, position) => { if (sinkFd === null) sinkFd = fs.openSync(rawPath, 'w'); const buf = Buffer.from(b64, 'base64'); fs.writeSync(sinkFd, buf, 0, buf.length, position); });
    await context.exposeFunction('__factorySinkClose', () => { if (sinkFd !== null) { fs.closeSync(sinkFd); sinkFd = null; } });
    await context.addInitScript(() => {
      window.__factorySink = {
        open: () => window.__factorySinkOpen(),
        close: () => window.__factorySinkClose(),
        write: async (data, position) => { let s = ''; for (let i = 0; i < data.length; i += 0x8000) s += String.fromCharCode.apply(null, data.subarray(i, i + 0x8000)); await window.__factoryWrite(btoa(s), position); },
      };
    });
  }
  if (piper) await context.exposeFunction('__factoryTTS', (text, voice, speed) => { try { return synthPiper(text, speed); } catch (e) { return { error: e.message }; } });
  page = context.pages()[0] || await context.newPage();
  page.on('pageerror', e => console.log('[page error]', e.message));
  page.on('crash', () => { crashed = true; console.log('[factory] the page crashed'); });
  page.on('close', () => { if (!finished) { crashed = true; } });
  page.on('console', m => { if (m.type() === 'error' && !/ERR_|favicon/.test(m.text())) console.log('[console]', m.text().slice(0, 300)); });
  // Voice-model files come from huggingface.co; CI browsers have tripped over the Hub's redirect + CORS dance
  // (HTTP 405). The studio is told (?hub=) to load them from a same-origin mirror under .hubcache/; this route
  // fills the mirror from Node on first use and then lets the browser fetch the local file itself. The bytes never
  // cross the DevTools pipe, which closes the connection above ~100 MB (handing the 92 MB model straight to the
  // page looked exactly like a browser crash).
  // The voice files (about 0.5 MB each) are requested by the voice library from a hard-coded Hub URL, which the
  // runner's browser cannot fetch (HTTP 405). They are small, so fetch them from Node and hand them to the page.
  await page.route(/^https:\/\/huggingface\.co\/onnx-community\/Kokoro[^?]*\/resolve\/[^/]+\/voices\//, async (route) => {
    const req = route.request();
    try {
      const r = await fetch(req.url(), { redirect: 'follow' });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const body = Buffer.from(await r.arrayBuffer());
      console.log(`[factory] voice ${req.url().split('/').pop()} (${(body.length / 1e6).toFixed(2)} MB)`);
      await route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'content-type': 'application/octet-stream' }, body });
    } catch (e) { console.log('[factory] voice fetch failed', req.url().slice(0, 140), e.message); try { await route.fulfill({ status: 502, body: e.message }); } catch {} }
  });
  await page.route(/\/\.hubcache\//, async (route) => {
    const req = route.request();
    try {
      if (req.method() === 'GET') await cacheHubFile(req.url());
      await route.continue();
    } catch (e) { console.log('[factory] hub fetch failed', req.url().slice(0, 140), e.message); try { await route.fulfill({ status: 502, body: e.message }); } catch {} }
  });
}
// Download a Hub file once into .hubcache/<model id>/<file> (under the directory the studio is served from).
const hubCacheDir = path.join(process.cwd(), '.hubcache');
const hubDownloads = new Map();
async function cacheHubFile(localUrl) {
  const rel = decodeURIComponent(new URL(localUrl).pathname.split('/.hubcache/')[1] || '');
  if (!rel || rel.includes('..')) throw new Error('bad path');
  const file = path.join(hubCacheDir, rel);
  if (fs.existsSync(file) && fs.statSync(file).size > 0) return;
  const parts = rel.split('/');
  const remote = `https://huggingface.co/${parts.slice(0, 2).join('/')}/resolve/main/${parts.slice(2).join('/')}`;
  if (!hubDownloads.has(rel)) {
    hubDownloads.set(rel, (async () => {
      const r = await fetch(remote, { redirect: 'follow' });
      if (!r.ok) throw new Error(`HTTP ${r.status} for ${remote}`);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      const tmp = file + '.part';
      await fs.promises.writeFile(tmp, Buffer.from(await r.arrayBuffer()));
      fs.renameSync(tmp, file);
      console.log(`[factory] cached ${rel} (${(fs.statSync(file).size / 1e6).toFixed(1)} MB)`);
    })().finally(() => hubDownloads.delete(rel)));
  }
  await hubDownloads.get(rel);
}
// ---- External voice (Piper): German and other languages the in-browser Kokoro voice lacks ----
const ttsSpec = env('TTS', lessonId ? 'piper:de_DE-thorsten-high' : '');
let piper = null;
if (ttsSpec.startsWith('piper:') && phase !== 'plan') {
  const voice = ttsSpec.slice(6);
  const dir = path.resolve(env('PIPER_DIR', '.piper'));
  const model = path.join(dir, `${voice}.onnx`), config = model + '.json';
  try {
    execSync('piper --help', { stdio: 'ignore' });
    fs.mkdirSync(dir, { recursive: true });
    for (const [file, local] of [[`${voice}.onnx`, model], [`${voice}.onnx.json`, config]]) {
      if (fs.existsSync(local) && fs.statSync(local).size > 0) continue;
      // de_DE-thorsten-high → de/de_DE/thorsten/high/
      const m = voice.match(/^([a-z]{2})_([A-Z]{2})-([a-z0-9_]+)-([a-z_]+)$/);
      if (!m) throw new Error(`cannot derive the Hugging Face path for voice ${voice}`);
      const url = `https://huggingface.co/rhasspy/piper-voices/resolve/main/${m[1]}/${m[1]}_${m[2]}/${m[3]}/${m[4]}/${file}`;
      console.log(`[factory] fetching voice ${file}…`);
      try { const r = await fetch(url, { redirect: 'follow' }); if (!r.ok) throw new Error(`HTTP ${r.status}`); fs.writeFileSync(local, Buffer.from(await r.arrayBuffer())); }
      catch (e) { execFileSync('curl', ['-sSL', '--fail', '-o', local, url], { stdio: 'ignore' }); }   // curl honours HTTPS_PROXY where Node's fetch does not
      if (!fs.existsSync(local) || fs.statSync(local).size < 1000) throw new Error(`could not download ${url}`);
    }
    const sampleRate = JSON.parse(fs.readFileSync(config, 'utf8')).audio?.sample_rate || 22050;
    piper = { model, sampleRate, voice };
    console.log(`[factory] voice: Piper ${voice} (${sampleRate} Hz)`);
  } catch (e) { console.log(`[factory] WARNING: Piper voice unavailable (${e.message}); falling back to the in-browser Kokoro voice (English only). Install with: pip install piper-tts`); }
}
function synthPiper(text, speed) {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  if (!t) return { b64: '', sampleRate: piper.sampleRate };
  const out = execFileSync('piper', ['-m', piper.model, '--output-raw', '--length-scale', String(1 / Math.max(0.6, Math.min(1.6, speed || 1))), '--sentence-silence', '0.25'], { input: t, maxBuffer: 256 * 1024 * 1024, stdio: ['pipe', 'pipe', 'ignore'] });
  return { b64: out.toString('base64'), sampleRate: piper.sampleRate };
}
let finished = false;
await launch();

const hubBase = `${new URL(studioUrl).origin}/.hubcache/`;
const url = `${studioUrl}?factory=1&${phase === 'plan' ? 'planonly=1' : 'autoapprove=1'}&hub=${encodeURIComponent(hubBase)}${extraQuery ? '&' + extraQuery : ''}`;
async function openStudio(firstTime) {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#generate', { timeout: 60_000 });
  if (firstTime) {
    await page.evaluate((s) => localStorage.setItem('aivideostudio.settings.v1', JSON.stringify(s)), settings);
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#generate', { timeout: 60_000 });
  }
}
await openStudio(true);
// Say which codecs this browser has, so a build without H.264 is visible in the log rather than a mystery.
try {
  const codecs = await page.evaluate(async () => {
    const dec = await VideoDecoder.isConfigSupported({ codec: 'avc1.42E01E' }).catch(() => ({ supported: false }));
    const enc = await VideoEncoder.isConfigSupported({ codec: 'avc1.640028', width: 1920, height: 1080 }).catch(() => ({ supported: false }));
    const el = document.createElement('video');
    return { h264Decode: !!dec.supported, h264Encode: !!enc.supported, mp4Tag: el.canPlayType('video/mp4; codecs="avc1.42E01E"') || 'no', ua: navigator.userAgent.replace(/^.*?(Chrome\/[\d.]+).*$/, '$1') };
  });
  console.log(`[factory] codecs: H.264 decode=${codecs.h264Decode ? 'yes' : 'NO'} encode=${codecs.h264Encode ? 'yes' : 'NO'} <video> mp4=${codecs.mp4Tag} (${codecs.ua})`);
  if (!codecs.h264Decode) console.log('[factory] WARNING: this browser cannot decode H.264, so AI/stock clips will fall back to motion graphics. Set BROWSER_CHANNEL=chrome.');
} catch (e) { console.log('[factory] codec check failed', e.message); }
// A plan from an earlier run: either make the video from it (approved), or re-plan it with the creator's feedback.
async function injectPlan() {
  if (!inputPlan) return;
  const run = { ...inputPlan, id: 'current', prompt, attempts: 0, audios: {}, footage: {} };
  run.settings = { ...(run.settings || {}), ...settings, videoStyle: run.settings?.videoStyle || settings.videoStyle, maxDuration: run.settings?.maxDuration || settings.maxDuration, targetDuration: run.settings?.targetDuration || settings.targetDuration };
  if (feedback) {
    const chapters = (run.brief && run.brief.chapters) || [];
    const scenes = (run.script && run.script.scenes) || [];
    run.previousPlan = chapters.map(c => `Chapter ${c.id}: ${c.title} — ${c.goal}\n` + scenes.filter(x => x.chapterId === c.id).map((x, i) => `  ${i + 1}. ${x.narration}`).join('\n')).join('\n');
    run.previousBeats = Object.fromEntries(chapters.map(c => [c.id, { title: c.title, beats: (run.chapterBeats || {})[c.id] || [] }]));
    run.feedback = feedback;
    for (const k of ['brief', 'chapterBeats', 'script', 'review', 'storyboard', 'publish', 'heroBeats', 'planApproved']) delete run[k];
    run.stage = 'start';
    console.log('[factory] re-planning the lesson with the creator\'s feedback');
  } else {
    run.planApproved = true; run.stage = 'publish';
    console.log(`[factory] making the video from the approved plan: “${run.brief?.title}” (${(run.script?.scenes || []).length} scenes)`);
  }
  await page.evaluate((r) => window.__studio.store.putRun(r), run);
}
await injectPlan();
await page.fill('#prompt', prompt);
await page.selectOption('#style', settings.videoStyle).catch(() => {});

const started = Date.now();
let lastLog = 0, lastStage = '';
const seenLogs = [];
async function pollOnce() {
  try {
    const st = await page.evaluate(() => ({
      stage: document.getElementById('stageName').textContent, detail: document.getElementById('stageDetail').textContent,
      bar: document.getElementById('bar').style.width, logs: [...document.querySelectorAll('#log .e')].map(e => e.textContent.trim().replace(/\s+/g, ' ')),
    }));
    for (let i = lastLog; i < st.logs.length; i++) { console.log('  •', st.logs[i].slice(0, 300)); seenLogs.push(st.logs[i]); }
    lastLog = st.logs.length;
    const line = `${st.stage} ${st.bar} ${st.detail}`;
    console.log(`[${Math.round((Date.now() - started) / 1000)}s] ${line}`); lastStage = line;
    fs.writeFileSync(path.join(outDir, 'agent-room.log'), seenLogs.join('\n') + `\n\n${line}\n`);
  } catch {}
}
const poll = setInterval(pollOnce, 10_000);

// Click Generate and wait until the studio has actually taken the run (the button hides), so the end-of-run
// detection below cannot fire on the idle moment just after the click.
async function clickGenerate() {
  await page.click('#generate');
  await page.waitForSelector('#generate', { state: 'hidden', timeout: 30_000 }).catch(() => {});
}
await clickGenerate();
// Test hook: CRASH_TEST=<seconds> crashes the renderer once, that long after the start, to exercise the relaunch path.
if (process.env.CRASH_TEST) setTimeout(() => { console.log('[factory] test hook: crashing the page'); page.goto('chrome://crash').catch(() => {}); }, parseInt(process.env.CRASH_TEST, 10) * 1000);
const deadline = Date.now() + parseInt(env('TIMEOUT_MIN', '110'), 10) * 60_000;
let relaunches = 0, errorRetries = 0;
async function fail(msg) {
  clearInterval(poll);
  console.error(`[factory] ${msg}. Agent room:\n` + seenLogs.join('\n'));
  try { await page.screenshot({ path: path.join(outDir, 'failure.png'), fullPage: true }); } catch {}
  await hardClose();
  process.exit(1);
}
async function relaunchAndResume(why) {
  if (++relaunches > 3) await fail('the browser kept crashing; giving up');
  console.log(`[factory] ${why}; relaunching and resuming from the saved checkpoint (attempt ${relaunches})…`);
  crashed = false; lastLog = 0;
  await hardClose();
  await launch();
  await openStudio(false);
  // The studio offers to resume an interrupted run; take it. Otherwise start again with the same prompt
  // (the studio continues a saved run with the same prompt from its checkpoint).
  const resume = await page.waitForSelector('#resumeCard:not([hidden])', { timeout: 15_000 }).catch(() => null);
  if (resume) { await page.click('#resumeBtn'); await page.waitForSelector('#generate', { state: 'hidden', timeout: 30_000 }).catch(() => {}); }
  else { await page.fill('#prompt', prompt); await clickGenerate(); }
}
while (true) {
  try {
    // Wait until the run ends: either the result card appears, or the Generate button comes back without a
    // result (the studio stopped on an error and saved its checkpoint).
    await page.waitForFunction(() => {
      const done = !document.getElementById('resultCard').hidden || !document.getElementById('planCard').hidden;
      const idle = !document.getElementById('generate').hidden && document.getElementById('progressCard').hidden;
      const errored = !!document.querySelector('#log .e.error');
      return done || (idle && errored);
    }, null, { timeout: Math.max(10_000, deadline - Date.now()), polling: 2000 });
    await pollOnce();
    const done = await page.evaluate(() => !document.getElementById('resultCard').hidden || !document.getElementById('planCard').hidden);
    if (done) break;
    const err = await page.evaluate(() => { const e = [...document.querySelectorAll('#log .e.error')].pop(); return e ? e.textContent.trim().replace(/\s+/g, ' ') : ''; });
    if (/indexeddb|backing store|database/i.test(err)) { await relaunchAndResume('the studio could not open its storage'); continue; }
    if (++errorRetries > 3) await fail('the studio stopped with an error three times');
    console.log(`[factory] the studio stopped with an error; continuing from its checkpoint (retry ${errorRetries}): ${err.slice(0, 200)}`);
    lastLog = 0;
    await clickGenerate();
  } catch (e) {
    if (Date.now() >= deadline) await fail('FAILED or timed out');
    if (!crashed && page && !page.isClosed()) await fail('FAILED: ' + (e.message || e).toString().slice(0, 200));
    await relaunchAndResume('browser crashed');
  }
}
finished = true;
clearInterval(poll);
const planVisible = await page.evaluate(() => !document.getElementById('planCard').hidden);
if (phase === 'plan' && !planVisible) console.log('[factory] this video has no plan-review step (short explainer or cinematic piece): it was made directly.');
if (phase === 'plan' && planVisible) {
  const out = await page.evaluate(() => window.__studio.plan());
  fs.writeFileSync(path.join(outDir, 'plan.json'), JSON.stringify(out.plan));
  fs.writeFileSync(path.join(outDir, 'plan.md'), out.markdown);
  const b = out.plan.brief, sc = out.plan.script.scenes;
  const words = out.plan.script.totalWords || 0, est = Math.round(words / 3.1 + sc.length * 0.8);
  fs.writeFileSync(path.join(outDir, 'summary.json'), JSON.stringify({ phase: 'plan', title: b.title, chapters: b.chapters.length, scenes: sc.length, words, estimatedSeconds: est, aiClips: (out.plan.heroBeats || []).length, prompt }, null, 2));
  console.log(`[factory] plan ready in ${Math.round((Date.now() - started) / 1000)} s: “${b.title}”, ${b.chapters.length} chapters, ${sc.length} scenes, about ${Math.floor(est / 60)}:${String(est % 60).padStart(2, '0')}. Wrote plan.json and plan.md.`);
  await hardClose();
  process.exit(0);
}
console.log(`[factory] generation finished in ${Math.round((Date.now() - started) / 1000)} s; exporting…`);

const meta = await page.evaluate(async () => {
  const list = await window.__studio.store.listProjects();
  const p = await window.__studio.store.getProject(list[0].id);
  window.__factoryProject = p;
  return { id: p.id, title: p.title, duration: p.duration, type: p.videoType, size: p.videoBlob.size, external: !!p.external, srt: p.srt, youtubeText: p.youtubeText,
    plan: JSON.stringify(p.plan), footageSummary: p.plan.footageSummary || '' };
});
// Pull the video out in chunks to keep each message small (unless it was streamed to disk while encoding).
const CHUNK = 8 * 1024 * 1024;
const parts = [];
for (let offset = 0; !meta.external && offset < meta.size; offset += CHUNK) {
  const b64 = await page.evaluate(async ([o, n]) => {
    const blob = window.__factoryProject.videoBlob.slice(o, o + n);
    const buf = new Uint8Array(await blob.arrayBuffer());
    let s = ''; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
    return btoa(s);
  }, [offset, CHUNK]);
  parts.push(Buffer.from(b64, 'base64'));
}
const thumb = await page.evaluate(async () => { const b = window.__factoryProject.thumbBlob; const buf = new Uint8Array(await b.arrayBuffer()); let s = ''; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000)); return btoa(s); });
const ext = (meta.type || '').includes('webm') ? 'webm' : 'mp4';
if (!meta.external) fs.writeFileSync(path.join(outDir, `video-raw.${ext}`), Buffer.concat(parts));
else if (sinkFd !== null) { fs.closeSync(sinkFd); sinkFd = null; }
const fileSize = fs.statSync(path.join(outDir, `video-raw.${ext}`)).size;
fs.writeFileSync(path.join(outDir, 'thumbnail.jpg'), Buffer.from(thumb, 'base64'));
fs.writeFileSync(path.join(outDir, 'captions.srt'), meta.srt);
fs.writeFileSync(path.join(outDir, 'youtube.txt'), meta.youtubeText);
fs.writeFileSync(path.join(outDir, 'plan.json'), meta.plan);
const planObj = JSON.parse(meta.plan);
fs.writeFileSync(path.join(outDir, 'summary.json'), JSON.stringify({ title: meta.title, duration: meta.duration, footage: meta.footageSummary, prompt, chapters: (planObj.chapters || []).map(c => ({ title: c.title, start: Math.round(c.start) })) }, null, 2));
console.log(`[factory] wrote ${outDir}/video-raw.${ext} (${(fileSize / 1048576).toFixed(1)} MB), ${meta.duration.toFixed(1)} s. Footage: ${meta.footageSummary}`);
await context.close();
