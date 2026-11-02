// Caches the app so it opens without a connection. Bump VERSION when the files change.
const VERSION = 'edh-life-19';
const ART = 'edh-life-art';  // commander art and the Radiation token, kept across versions
const FILES = ['./', 'index.html', 'style.css', 'app.js', 'manifest.webmanifest', 'icon.svg', 'icon-192.png', 'icon-512.png'];
// The app works without these, so a missing one must not stop the install.
const EXTRAS = ['fonts/Oswald-700.woff2', 'fonts/BarlowCondensed-600.woff2', 'fonts/BarlowCondensed-700.woff2'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION)
    .then(c => c.addAll(FILES).then(() => Promise.all(EXTRAS.map(f => c.add(f).catch(() => {})))))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== VERSION && k !== ART).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;

  // Card art never changes for a given URL: serve from cache, so art you've seen shows up offline too.
  if (url.hostname === 'cards.scryfall.io') {
    e.respondWith(caches.open(ART).then(c => c.match(e.request).then(hit => hit || fetch(e.request).then(res => {
      c.put(e.request, res.clone());
      return res;
    }))));
    return;
  }

  // App files: network first so updates show up, cache when offline. Everything else (sync, Scryfall API) goes straight through.
  if (url.origin !== location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then(res => { const copy = res.clone(); caches.open(VERSION).then(c => c.put(e.request, copy)); return res; })
      .catch(() => caches.match(e.request).then(r => r || caches.match('index.html')))
  );
});
