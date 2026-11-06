// Minimal service worker: lets the app be installed to the home screen and
// keeps working from cache when the network is slow. Network first, cache fallback.
const CACHE = 'tv-mirror-v4';
const ASSETS = ['./', './index.html', './tv.html', './app.css', './common.js', './sender.js', './receiver.js', './watch.html', './tvapp.html', './watch.js', './camera.html', './camera.js', './manifest-watch.webmanifest', './tube.html', './tube.js', './manifest-tube.webmanifest', './icon-tube-192.png',
  './vendor/peerjs.min.js', './vendor/qrcode.js', './icon.svg', './manifest.webmanifest'];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(fetch(e.request).then(r => {
    const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return r;
  }).catch(() => caches.match(e.request)));
});
