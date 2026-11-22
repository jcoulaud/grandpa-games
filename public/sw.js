// Offline copy and quiet updates.
//
// Each deploy writes version.js (see scripts/stamp.mjs). When the app opens, a new version downloads
// all CORE files into a new cache in the background. The library page then asks it to start, and it
// starts if every open window of the app shows the library. A game window keeps its version until it
// is closed. So the files of one version are always served together, and nothing changes during a game.
try { importScripts('version.js'); } catch (e) { self.VERSION = 'dev'; }
const CACHE = 'grandpa-games-' + self.VERSION;
const CORE = [
  './', 'lib/store.js', 'lib/kit.js', 'lib/kit.css', 'lib/zoom.js', 'lib/cards.js', 'lib/cards.css', 'manifest.webmanifest',
  'icons/icon.svg', 'icons/logo.webp', 'icons/icon-192.png', 'icons/icon-512.png',
  'solitaire/', 'solitaire/icon.svg',
  'freecell/', 'freecell/solver.js', 'freecell/icon.svg',
  'dames/', 'dames/engine.js', 'dames/icon.svg',
  'dame-de-pique/', 'dame-de-pique/engine.js', 'dame-de-pique/icon.svg',
  'demineur/', 'demineur/engine.js', 'demineur/icon.svg',
  'yams/', 'yams/engine.js', 'yams/icon.svg',
  'bataille-navale/', 'bataille-navale/engine.js', 'bataille-navale/ships.js', 'bataille-navale/icon.svg',
  ...['vous', 'jeanne', 'louise', 'simone', 'odette', 'colette', 'yvonne', 'paul', 'marcel', 'rene', 'andre', 'henri', 'gaston'].map(id => `lib/avatars/${id}.webp`),
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE.map(u => new Request(u, { cache: 'reload' })))));
});
self.addEventListener('message', e => {
  if (e.data !== 'start') return;
  const home = new URL(self.registration.scope).pathname;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(all => {
    if (all.every(c => new URL(c.url).pathname === home)) return self.skipWaiting();
  }));
});
self.addEventListener('activate', e => e.waitUntil((async () => {
  for (const name of await caches.keys()) if (name !== CACHE) await caches.delete(name);
  await self.clients.claim();
})()));

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/') || url.pathname.startsWith('/admin')) return;
  e.respondWith(caches.open(CACHE).then(async cache => {
    const cached = await cache.match(e.request, { ignoreSearch: true });
    if (cached) return cached;
    const r = await fetch(e.request);
    if (r.ok) cache.put(e.request, r.clone());
    return r;
  }));
});
