// Offline copy and quiet updates.
//
// Each deploy writes version.js (see scripts/stamp.mjs). A new version downloads all CORE files
// into a new cache in the background, and only starts once every window of the app is closed.
// So the files of one version are always served together, and nothing changes during a game.
try { importScripts('version.js'); } catch (e) { self.VERSION = 'dev'; }
const CACHE = 'grandpa-games-' + self.VERSION;
const CORE = [
  './', 'lib/store.js', 'lib/kit.js', 'lib/kit.css', 'lib/cards.js', 'lib/cards.css', 'manifest.webmanifest', 'message.json',
  'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png',
  'games/solitaire/', 'games/solitaire/icon.svg',
  'games/freecell/', 'games/freecell/solver.js', 'games/freecell/icon.svg',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE.map(u => new Request(u, { cache: 'reload' })))));
});
self.addEventListener('activate', e => e.waitUntil((async () => {
  for (const name of await caches.keys()) if (name !== CACHE) await caches.delete(name);
  await self.clients.claim();
})()));

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/') || url.pathname.startsWith('/admin')) return;
  e.respondWith(caches.open(CACHE).then(async cache => {
    // The note changes between versions: show the newest one when online.
    if (url.pathname.endsWith('/message.json')) {
      try { const r = await fetch(e.request); if (r.ok) cache.put(e.request, r.clone()); return r; }
      catch (err) { return (await cache.match(e.request)) || Response.error(); }
    }
    const cached = await cache.match(e.request, { ignoreSearch: true });
    if (cached) return cached;
    const r = await fetch(e.request);
    if (r.ok) cache.put(e.request, r.clone());
    return r;
  }));
});
