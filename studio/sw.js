// App shell + libraries are cached so the studio opens offline. Model weights are cached by
// WebLLM / Transformers.js themselves (Cache API), so cross-origin requests are left alone.
const CACHE = 'ai-video-studio-v1';
const SHELL = ['./', './index.html', './studio.css', './studio.webmanifest', './icon-192.png', './icon-512.png',
  './js/app.js', './js/agents.js', './js/encoder.js', './js/exporter.js', './js/llm.js', './js/mixer.js', './js/renderer.js',
  './js/settings.js', './js/store.js', './js/timing.js', './js/tts.js',
  './vendor/mediabunny.js', './vendor/kokoro.js'];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin || !url.pathname.includes('/studio/')) return;
  // Big runtimes (WebLLM, wasm): cache-first, they never change within a version.
  const heavy = /\/vendor\/(webllm\.js|wllama\/|ort\/)/.test(url.pathname);
  e.respondWith(caches.open(CACHE).then(async cache => {
    const cached = await cache.match(e.request);
    if (heavy && cached) return cached;
    const network = fetch(e.request).then(r => { if (r.ok) cache.put(e.request, r.clone()); return r; }).catch(() => null);
    if (cached) { network.catch(() => {}); return cached; }
    const r = await network;
    return r || new Response('Offline', { status: 503 });
  }));
});
