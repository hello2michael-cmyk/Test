// Soundtrack: normalised narration, music under automatic ducking, limiter. Rendered offline at 48 kHz stereo.
export const SAMPLE_RATE = 48000;

/**
 * scenes: [{narrationStart, narrationDuration, audio: {samples: Float32Array, sampleRate}}]
 * music: AudioBuffer|null, opts: {musicVolume, ambientBed}
 * returns AudioBuffer (2 ch, 48 kHz)
 */
export async function mix(scenes, total, music, opts) {
  const frames = Math.ceil((total + 0.05) * SAMPLE_RATE);
  const ctx = new OfflineAudioContext(2, frames, SAMPLE_RATE);
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -6; limiter.knee.value = 4; limiter.ratio.value = 12; limiter.attack.value = 0.003; limiter.release.value = 0.15;
  limiter.connect(ctx.destination);
  const master = ctx.createGain(); master.gain.value = 1; master.connect(limiter);

  // Narration
  const spans = [];
  for (const s of scenes) {
    if (!s.audio || !s.audio.samples.length) continue;
    const src = s.audio;
    const buf = ctx.createBuffer(1, src.samples.length, src.sampleRate);
    const data = new Float32Array(src.samples);
    normalise(data, 0.11, 0.85); edgeFades(data, Math.floor(0.01 * src.sampleRate));
    buf.copyToChannel(data, 0);
    const node = ctx.createBufferSource(); node.buffer = buf; node.connect(master); node.start(s.narrationStart);
    spans.push([s.narrationStart, s.narrationStart + s.narrationDuration]);
  }

  // Music bed: pre-trimmed to a known level, then ducked under speech, faded in and out.
  let bed = music;
  if (!bed && opts.ambientBed) bed = ambientBed(ctx, total);
  if (bed) {
    const trim = ctx.createGain();
    trim.gain.value = Math.min(4, 0.08 / Math.max(bufferRMS(bed), 1e-5));
    const g = ctx.createGain();
    const base = opts.musicVolume;
    g.gain.setValueAtTime(0, 0);
    g.gain.linearRampToValueAtTime(base, 1.0);
    for (const [a, b] of spans) {
      g.gain.setTargetAtTime(base * 0.3, Math.max(0, a - 0.12), 0.08);
      g.gain.setTargetAtTime(base, b + 0.1, 0.35);
    }
    g.gain.setValueAtTime(base, Math.max(1.0, total - 2.5));
    g.gain.linearRampToValueAtTime(0, total);
    const node = ctx.createBufferSource(); node.buffer = bed; node.loop = true;
    node.connect(trim); trim.connect(g); g.connect(master); node.start(0);
  }
  return ctx.startRendering();
}

function normalise(d, targetRMS, ceiling) {
  let sum = 0, peak = 0;
  for (const x of d) { sum += x * x; if (Math.abs(x) > peak) peak = Math.abs(x); }
  const rms = Math.sqrt(sum / d.length);
  if (rms < 1e-6 || peak < 1e-6) return;
  const g = Math.min(targetRMS / rms, ceiling / peak);
  for (let i = 0; i < d.length; i++) d[i] *= g;
}
function edgeFades(d, n) {
  n = Math.min(n, d.length >> 1);
  for (let i = 0; i < n; i++) { const g = i / n; d[i] *= g; d[d.length - 1 - i] *= g; }
}
function bufferRMS(b) {
  const d = b.getChannelData(0); let sum = 0;
  const step = Math.max(1, Math.floor(d.length / 200000));
  let n = 0; for (let i = 0; i < d.length; i += step) { sum += d[i] * d[i]; n++; }
  return Math.sqrt(sum / Math.max(1, n));
}

/** A quiet synthesised pad: two slowly alternating chords, royalty-free by construction. */
function ambientBed(ctx, total) {
  const sr = ctx.sampleRate, frames = Math.ceil(total * sr);
  const buf = ctx.createBuffer(2, frames, sr);
  const L = buf.getChannelData(0), R = buf.getChannelData(1);
  const chords = [[110, 164.81, 220, 277.18], [98, 146.83, 196, 246.94]];
  const period = 8;
  for (let i = 0; i < frames; i++) {
    const t = i / sr;
    const phase = (t % (period * 2)) / period;
    const idx = Math.floor(phase) % 2;
    const blend = 0.5 - 0.5 * Math.cos(Math.PI * (phase - Math.floor(phase)));
    let s = 0;
    chords[idx].forEach((f, k) => { const vib = 1 + 0.002 * Math.sin(2 * Math.PI * (0.1 + k * 0.07) * t); s += Math.sin(2 * Math.PI * f * vib * t) * 0.07 / (k + 1); });
    const slow = 0.7 + 0.3 * Math.sin(2 * Math.PI * 0.05 * t);
    const v = s * slow * (0.6 + 0.4 * blend);
    const pan = 0.1 * Math.sin(2 * Math.PI * 0.03 * t);
    L[i] = v * (0.9 + pan); R[i] = v * (0.9 - pan);
  }
  return buf;
}

export async function decodeMusic(blob) {
  const ctx = new OfflineAudioContext(2, 1, SAMPLE_RATE);
  return ctx.decodeAudioData(await blob.arrayBuffer());
}
