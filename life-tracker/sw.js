// Caches the app so it opens without a connection. Bump VERSION when the files change.
const VERSION = 'edh-life-25';
const ART = 'edh-life-art';  // commander art and the Radiation token, kept across versions
const ART_MAX = 180;
const FILES = ['./', 'index.html', 'style.css', 'app.js', 'manifest.webmanifest', 'icon.svg', 'icon-192.png', 'icon-512.png'];
// Scryfall's mana symbols, fetched once at install so the mana sheet is whole offline; a miss must not stop the install.
const SYMBOLS = ['W', 'U', 'B', 'R', 'G', 'C'].map(c => new Request(`https://svgs.scryfall.io/card-symbols/${c}.svg`, { mode: 'cors' }));
// The app works without these, so a missing one must not stop the install.
const EXTRAS = ['fonts/Oswald-700.woff2', 'fonts/BarlowCondensed-600.woff2', 'fonts/BarlowCondensed-700.woff2'];

async function cacheArt(c, req, res) {
  if (!res || (!res.ok && res.type !== 'opaque')) return;
  await c.put(req, res);
  const keys = await c.keys();
  if (keys.length > ART_MAX) {
    // Keep the mana symbols and evict the oldest commander art entries.
    const removable = keys.filter(k => new URL(k.url).hostname !== 'svgs.scryfall.io');
    await Promise.all(removable.slice(0, keys.length - ART_MAX).map(k => c.delete(k)));
  }
}

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION)
    .then(c => c.addAll(FILES).then(() => Promise.all(EXTRAS.map(f => c.add(f).catch(() => {})))))
    .then(() => caches.open(ART)).then(c => Promise.all(SYMBOLS.map(r => fetch(r).then(res => cacheArt(c, r, res)).catch(() => {}))))
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

  // Card art and mana symbols never change for a given URL: serve from cache, so art you've seen shows up offline too.
  if (url.hostname === 'cards.scryfall.io' || url.hostname === 'svgs.scryfall.io') {
    e.respondWith(caches.open(ART).then(c => c.match(e.request).then(hit => hit || fetch(e.request).then(res => {
      if (res.ok || res.type === 'opaque') cacheArt(c, e.request, res.clone());
      return res;
    }))));
    return;
  }

  // App files: network first so updates show up, cache when offline. Everything else (sync, Scryfall API) goes straight through.
  if (url.origin !== location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then(res => {
        if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(e.request, copy)); }
        return res;
      })
      .catch(() => caches.match(e.request).then(r => r || (e.request.mode === 'navigate' ? caches.match('index.html') : Response.error())))
  );
});
