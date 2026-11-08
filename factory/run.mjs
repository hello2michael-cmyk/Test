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
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const env = (k, d) => (process.env[k] && process.env[k].trim()) || d;
const prompt = env('PROMPT', '');
if (!prompt) { console.error('PROMPT is required'); process.exit(2); }
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
  footagePatienceMin: parseInt(env('PATIENCE_MIN', '25'), 10),
  reviewShots: false, burnInCaptions: env('CAPTIONS', '1') !== '0', showProgressBar: true, filmLook: true, letterbox: env('LETTERBOX', '1') !== '0',
  musicVolume: 0.18, ambientBed: true,
  modelId: env('WRITER', 'hf-text:Qwen/Qwen2.5-72B-Instruct'),
};
const mock = /(^|&)mock=1/.test(extra);
if (mock) settings.modelId = 'mock';

console.log(`[factory] style=${settings.videoStyle} aspect=${settings.aspect} cap=${settings.maxDuration}s footage=${settings.footageProvider} writer=${settings.modelId} token=${settings.hfToken ? 'yes' : 'no'}`);

const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required', '--disable-dev-shm-usage'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 2200 } });
page.on('pageerror', e => console.log('[page error]', e.message));
page.on('console', m => { if (m.type() === 'error' && !/ERR_|favicon/.test(m.text())) console.log('[console]', m.text().slice(0, 300)); });

const url = `${studioUrl}?factory=1&autoapprove=1${extra ? '&' + extra : ''}`;
await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#generate', { timeout: 60_000 });
await page.evaluate((s) => localStorage.setItem('aivideostudio.settings.v1', JSON.stringify(s)), settings);
await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#generate', { timeout: 60_000 });
await page.fill('#prompt', prompt);
await page.selectOption('#style', settings.videoStyle).catch(() => {});

const started = Date.now();
let lastLog = 0, lastStage = '';
const poll = setInterval(async () => {
  try {
    const st = await page.evaluate(() => ({
      stage: document.getElementById('stageName').textContent, detail: document.getElementById('stageDetail').textContent,
      bar: document.getElementById('bar').style.width, logs: [...document.querySelectorAll('#log .e')].map(e => e.textContent.trim().replace(/\s+/g, ' ')),
    }));
    for (let i = lastLog; i < st.logs.length; i++) console.log('  •', st.logs[i].slice(0, 300));
    lastLog = st.logs.length;
    const line = `${st.stage} ${st.bar} ${st.detail}`;
    if (line !== lastStage) { console.log(`[${Math.round((Date.now() - started) / 1000)}s] ${line}`); lastStage = line; }
  } catch {}
}, 10_000);

await page.click('#generate');
try {
  await page.waitForSelector('#resultCard:not([hidden])', { timeout: parseInt(env('TIMEOUT_MIN', '110'), 10) * 60_000 });
} catch (e) {
  clearInterval(poll);
  const logs = await page.$$eval('#log .e', els => els.map(e => e.textContent.trim().replace(/\s+/g, ' ')));
  console.error('[factory] FAILED or timed out. Agent room:\n' + logs.join('\n'));
  await page.screenshot({ path: path.join(outDir, 'failure.png'), fullPage: true });
  await browser.close();
  process.exit(1);
}
clearInterval(poll);
console.log(`[factory] generation finished in ${Math.round((Date.now() - started) / 1000)} s; exporting…`);

const meta = await page.evaluate(async () => {
  const list = await window.__studio.store.listProjects();
  const p = await window.__studio.store.getProject(list[0].id);
  window.__factoryProject = p;
  return { id: p.id, title: p.title, duration: p.duration, type: p.videoType, size: p.videoBlob.size, srt: p.srt, youtubeText: p.youtubeText,
    plan: JSON.stringify(p.plan), footageSummary: p.plan.footageSummary || '' };
});
// Pull the video out in chunks to keep each message small.
const CHUNK = 8 * 1024 * 1024;
const parts = [];
for (let offset = 0; offset < meta.size; offset += CHUNK) {
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
fs.writeFileSync(path.join(outDir, `video-raw.${ext}`), Buffer.concat(parts));
fs.writeFileSync(path.join(outDir, 'thumbnail.jpg'), Buffer.from(thumb, 'base64'));
fs.writeFileSync(path.join(outDir, 'captions.srt'), meta.srt);
fs.writeFileSync(path.join(outDir, 'youtube.txt'), meta.youtubeText);
fs.writeFileSync(path.join(outDir, 'plan.json'), meta.plan);
fs.writeFileSync(path.join(outDir, 'summary.json'), JSON.stringify({ title: meta.title, duration: meta.duration, footage: meta.footageSummary, prompt }, null, 2));
console.log(`[factory] wrote ${outDir}/video-raw.${ext} (${(meta.size / 1048576).toFixed(1)} MB), ${meta.duration.toFixed(1)} s. Footage: ${meta.footageSummary}`);
await browser.close();
