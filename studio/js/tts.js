// Narration with Kokoro-82M running in the browser (ONNX Runtime WebAssembly). Fully offline after the first download.
import { KokoroTTS, env } from '../vendor/kokoro.js';

const MODEL_ID = 'onnx-community/Kokoro-82M-v1.0-ONNX';
let tts = null;
let loading = null;

export function configure() {
  env.allowLocalModels = false;
  env.useBrowserCache = true;
  env.backends.onnx.wasm.wasmPaths = new URL('../vendor/ort/', import.meta.url).href;
  // ?hub=<base url>: fetch model files from a local mirror laid out as <base>/<model id>/<file> (the video factory
  // serves one next to the studio, so the files stay same-origin and never cross the browser automation pipe).
  const hub = new URLSearchParams(location.search).get('hub');
  if (hub) { env.remoteHost = hub.endsWith('/') ? hub : hub + '/'; env.remotePathTemplate = '{model}/'; }
  // Threads need cross-origin isolation, which GitHub Pages cannot provide; single thread is reliable everywhere.
  env.backends.onnx.wasm.numThreads = 1;
  env.backends.onnx.wasm.proxy = false;
}

export async function loadTTS(onProgress) {
  if (tts) return tts;
  if (!loading) {
    configure();
    loading = KokoroTTS.from_pretrained(MODEL_ID, {
      dtype: 'q8', device: 'wasm',
      progress_callback: (p) => {
        if (p && p.status === 'progress' && onProgress) onProgress(p.progress / 100, p.file);
        if (p && p.status === 'done' && onProgress) onProgress(1, p.file);
      },
    }).then(t => { tts = t; return t; }).catch(e => { loading = null; throw e; });
  }
  return loading;
}

/** Returns { samples: Float32Array, sampleRate, duration } */
export async function synthesize(text, voice = 'af_heart', speed = 1.0) {
  const t = await loadTTS();
  const clean = text.replace(/\s+/g, ' ').trim();
  const audio = await t.generate(clean, { voice, speed });
  const samples = audio.audio instanceof Float32Array ? audio.audio : new Float32Array(audio.audio);
  const sampleRate = audio.sampling_rate || 24000;
  // Trim leading/trailing silence so timing is tight.
  const trimmed = trimSilence(samples, sampleRate);
  return { samples: trimmed, sampleRate, duration: trimmed.length / sampleRate };
}

function trimSilence(s, sr, threshold = 0.004, keep = 0.06) {
  let a = 0, b = s.length;
  while (a < b && Math.abs(s[a]) < threshold) a++;
  while (b > a && Math.abs(s[b - 1]) < threshold) b--;
  const pad = Math.floor(keep * sr);
  a = Math.max(0, a - pad); b = Math.min(s.length, b + pad);
  return s.slice(a, b);
}

export function isLoaded() { return !!tts; }
