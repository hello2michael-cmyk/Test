// MP4 export. Preferred path: WebCodecs through Mediabunny (exact timing, YouTube bitrates, no realtime wait).
// Fallback: MediaRecorder on a canvas stream (records in real time).
import { Output, Mp4OutputFormat, BufferTarget, CanvasSource, AudioBufferSource, Quality, getFirstEncodableVideoCodec, canEncodeAudio } from '../vendor/mediabunny.js';

export async function encodeSupport(width, height) {
  if (typeof VideoEncoder === 'undefined' || typeof AudioEncoder === 'undefined') return null;
  try {
    const codec = await getFirstEncodableVideoCodec(['avc', 'hevc', 'vp9', 'av1'], { width, height });
    if (!codec) return null;
    const audio = (await canEncodeAudio('aac')) ? 'aac' : ((await canEncodeAudio('opus')) ? 'opus' : null);
    if (!audio) return null;
    return { codec, audio };
  } catch { return null; }
}

/**
 * drawFrame(time) paints the frame on `canvas`. audioBuffer is the mixed soundtrack.
 * Returns a Blob (video/mp4).
 */
export async function encodeWebCodecs({ canvas, fps, duration, drawFrame, audioBuffer, support, onProgress, shouldCancel }) {
  const { width, height } = canvas;
  const bitrate = Math.round(width * height * fps * 0.19);
  const output = new Output({ format: new Mp4OutputFormat({ fastStart: 'in-memory' }), target: new BufferTarget() });
  const video = new CanvasSource(canvas, { codec: support.codec, quality: new Quality({ bitrate }), keyFrameInterval: 2 });
  output.addVideoTrack(video, { frameRate: fps });
  const audio = new AudioBufferSource({ codec: support.audio, quality: new Quality({ bitrate: 192e3 }) });
  output.addAudioTrack(audio);
  await output.start();
  await audio.add(audioBuffer);
  audio.close();
  const totalFrames = Math.ceil(duration * fps);
  const frameDuration = 1 / fps;
  for (let i = 0; i < totalFrames; i++) {
    if (shouldCancel && shouldCancel()) { try { await output.cancel(); } catch {} throw new Error('Cancelled'); }
    const t = i / fps;
    drawFrame(t);
    await video.add(t, frameDuration);
    if (i % fps === 0) { onProgress && onProgress(i / totalFrames); await new Promise(r => setTimeout(r, 0)); }
  }
  video.close();
  await output.finalize();
  onProgress && onProgress(1);
  const buf = output.target.buffer;
  return new Blob([buf], { type: 'video/mp4' });
}

/** Real-time fallback: plays the soundtrack into a MediaStream while repainting the canvas. */
export async function encodeMediaRecorder({ canvas, fps, duration, drawFrame, audioBuffer, onProgress, shouldCancel }) {
  const stream = canvas.captureStream(fps);
  const ac = new AudioContext({ sampleRate: audioBuffer.sampleRate });
  await ac.resume();
  const dest = ac.createMediaStreamDestination();
  const src = ac.createBufferSource(); src.buffer = audioBuffer; src.connect(dest);
  for (const t of dest.stream.getAudioTracks()) stream.addTrack(t);
  const mime = ['video/mp4;codecs=avc1,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm'].find(m => MediaRecorder.isTypeSupported(m)) || '';
  const rec = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: Math.round(canvas.width * canvas.height * fps * 0.19) } : undefined);
  const chunks = [];
  rec.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
  const done = new Promise(r => { rec.onstop = r; });
  drawFrame(0);
  rec.start(500);
  const start = ac.currentTime + 0.1;
  src.start(start);
  const t0 = performance.now() + 100;
  await new Promise((resolve, reject) => {
    const tick = () => {
      const t = (performance.now() - t0) / 1000;
      if (shouldCancel && shouldCancel()) { rec.stop(); reject(new Error('Cancelled')); return; }
      if (t >= duration) { resolve(); return; }
      if (t >= 0) { drawFrame(t); onProgress && onProgress(t / duration); }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  drawFrame(duration - 0.01);
  await new Promise(r => setTimeout(r, 300));
  rec.stop();
  await done;
  try { src.stop(); } catch {}
  await ac.close();
  onProgress && onProgress(1);
  const type = (rec.mimeType || mime || 'video/mp4').split(';')[0];
  return new Blob(chunks, { type });
}
