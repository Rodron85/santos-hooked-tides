const CACHE = 'santos-tides-v24';
const FILES = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png', './apple-touch-icon.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE && k !== 'santos-photos').map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.hostname === 'upload.wikimedia.org') { // fish photos: keep them for offline
    e.respondWith(caches.open('santos-photos').then(c => c.match(e.request).then(r => r || fetch(e.request).then(res => { c.put(e.request, res.clone()); return res; })))); return;
  }
  if (url.hostname.endsWith('wikipedia.org') || url.hostname.endsWith('wikimedia.org')) return;
  if (/tile\.openstreetmap\.org$|openseamap\.org$/.test(url.hostname) || url.pathname.startsWith("/.netlify/functions/") || url.hostname.endsWith("open-meteo.com") || url.hostname.endsWith("bigdatacloud.net")) return; // live data: the app keeps its own saved copy
  e.respondWith(
    fetch(e.request).then(res => { const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return res; })
      .catch(() => caches.match(e.request).then(r => r || caches.match('./index.html')))
  );
});
