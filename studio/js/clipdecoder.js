// Frame access into a generated clip. Preferred: Mediabunny + WebCodecs (fast, sequential). Fallback: <video> seeking.
import { Input, ALL_FORMATS, BlobSource, CanvasSink } from '../vendor/mediabunny.js';

/** Opens a clip; frameAt(t) returns a CanvasImageSource for clip time t (seconds, monotonic within a scene). */
export async function openClip(blob, width, height) {
  try {
    const input = new Input({ formats: ALL_FORMATS, source: new BlobSource(blob) });
    const track = await input.getPrimaryVideoTrack();
    if (!track || !(await track.canDecode())) throw new Error('undecodable');
    const duration = await track.computeDuration();
    const first = await track.getFirstTimestamp();
    const sink = new CanvasSink(track, { width, height, fit: 'cover', poolSize: 3 });
    let iterator = null, current = null, next = null;
    const restart = async (t) => {
      if (iterator) { try { await iterator.return(); } catch {} }
      iterator = sink.canvases(t)[Symbol.asyncIterator]();
      current = (await iterator.next()).value || null;
      next = current ? (await iterator.next()).value || null : null;
    };
    await restart(first);
    return {
      duration: Math.max(0.1, duration),
      kind: 'webcodecs',
      async frameAt(t) {
        const target = Math.min(first + duration - 0.001, Math.max(first, t + first));
        if (current && target < current.timestamp - 0.5) await restart(target);
        while (next && next.timestamp <= target) { current = next; next = (await iterator.next()).value || null; }
        return current ? current.canvas : null;
      },
      close() { if (iterator) { try { iterator.return(); } catch {} } try { input.dispose(); } catch {} },
    };
  } catch (e) {
    return openClipWithVideoElement(blob, width, height);
  }
}

async function openClipWithVideoElement(blob, width, height) {
  const url = URL.createObjectURL(blob);
  const video = document.createElement('video');
  video.muted = true; video.playsInline = true; video.preload = 'auto'; video.src = url;
  await new Promise((resolve, reject) => { video.onloadeddata = resolve; video.onerror = () => reject(new Error('video load failed')); });
  const duration = isFinite(video.duration) && video.duration > 0 ? video.duration : 5;
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d');
  let lastSeek = -1;
  return {
    duration, kind: 'video',
    async frameAt(t) {
      const target = Math.min(duration - 0.05, Math.max(0, t));
      if (Math.abs(target - lastSeek) > 0.012) {
        await new Promise(resolve => { const done = () => { video.removeEventListener('seeked', done); resolve(); }; video.addEventListener('seeked', done); video.currentTime = target; setTimeout(done, 400); });
        lastSeek = target;
        // cover-fit
        const vw = video.videoWidth || width, vh = video.videoHeight || height;
        const scale = Math.max(width / vw, height / vh);
        const dw = vw * scale, dh = vh * scale;
        ctx.drawImage(video, (width - dw) / 2, (height - dh) / 2, dw, dh);
      }
      return canvas;
    },
    close() { URL.revokeObjectURL(url); video.src = ''; },
  };
}
