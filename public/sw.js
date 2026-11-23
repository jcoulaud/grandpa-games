// Offline copy and quiet updates.
//
// Each deploy writes version.js (see scripts/stamp.mjs). When the app opens, a new version downloads
// all CORE files into a new cache in the background. The library page then asks it to start, and it
// starts when no window is playing a game. A game window keeps its version until it
// is closed. So the files of one version are always served together, and nothing changes during a game.
try { importScripts('version.js'); } catch (e) { self.VERSION = 'dev'; }
const CACHE = 'grandpa-games-' + self.VERSION;
const CORE = [
  './', 'lib/store.js', 'lib/kit.js', 'lib/kit.css', 'lib/zoom.js', 'lib/sound.js', 'lib/ph.js', 'lib/cards.js', 'lib/cards.css', 'lib/solver-worker.js', 'manifest.webmanifest', 'fonts/lexend.woff2',
  'icons/icon.svg', 'icons/logo.webp', 'icons/julien.webp', 'icons/icon-192.png', 'icons/icon-512.png',
  'solitaire/', 'solitaire/solver.js', 'solitaire/icon.svg',
  'lib/site-nav.css', 'lib/site-nav.js', 'lib/rules.css', 'belote/regles/', 'belote/regles/regles.css', 'dames/regles/', 'solitaire/regles/',
  'belote/regles/hero-cards.webp', 'dames/regles/hero-pieces.webp', 'solitaire/regles/hero-cards.webp',
  'demineur/regles/', 'demineur/regles/hero.webp', 'yams/regles/', 'yams/regles/hero.webp',
  'huit-americain/regles/', 'huit-americain/regles/hero.webp', 'blog/', 'blog/blog.css', 'blog/game-night.webp',
  'blog/illectronisme-par-age.png', 'blog/jeux-pour-seniors/',
  'freecell/regles/', 'dame-de-pique/regles/', 'bataille-navale/regles/', 'paires/regles/',
  'sudoku/regles/', 'mots-meles/regles/', 'petits-chevaux/regles/', 'morpion/regles/',
  'golf/regles/', 'billard/regles/', 'bowling/regles/', 'rami/regles/', 'blog/agrandir-cartes-et-lettres/', 'blog/retrouver-une-partie/',
  'blog/jeux-de-cartes-a-jouer-seul/',
  'blog/agrandir-cartes-et-lettres/boutons-taille.webp', 'blog/agrandir-cartes-et-lettres/taille-80.webp',
  'blog/agrandir-cartes-et-lettres/taille-130.webp', 'blog/agrandir-cartes-et-lettres/mots-meles.webp',
  'blog/agrandir-cartes-et-lettres/telephone.webp', 'blog/jeux-de-cartes-a-jouer-seul/solitaire.webp',
  'blog/jeux-de-cartes-a-jouer-seul/freecell.webp', 'blog/retrouver-une-partie/reprendre.webp',
  'freecell/', 'freecell/solver.js', 'freecell/icon.svg',
  'dames/', 'dames/engine.js', 'dames/icon.svg',
  'dame-de-pique/', 'dame-de-pique/engine.js', 'dame-de-pique/icon.svg',
  'demineur/', 'demineur/engine.js', 'demineur/board.js', 'demineur/style.css', 'demineur/icon.svg',
  'yams/', 'yams/engine.js', 'yams/icon.svg',
  'bataille-navale/', 'bataille-navale/engine.js', 'bataille-navale/ships.js', 'bataille-navale/icon.svg',
  'bowling/', 'bowling/icon.svg', 'bowling/game.js', 'bowling/engine.js', 'bowling/scene.js',
  'billard/', 'billard/icon.svg', 'billard/game.js', 'billard/engine.js', 'billard/table.js', 'billard/frame.js', 'billard/guide.js',
  'golf/', 'golf/icon.svg', 'golf/game.js', 'golf/engine.js', 'golf/scene.js', 'lib/three/three.module.min.js',
  'paires/', 'paires/engine.js', 'paires/icon.svg',
  'sudoku/', 'sudoku/engine.js', 'sudoku/icon.svg',
  'mots-meles/', 'mots-meles/engine.js', 'mots-meles/words.js', 'mots-meles/icon.svg',
  'petits-chevaux/', 'petits-chevaux/engine.js', 'petits-chevaux/icon.svg',   'morpion/', 'morpion/engine.js', 'morpion/icon.svg',
  'belote/', 'belote/engine.js', 'belote/icon.svg',
  'huit-americain/', 'huit-americain/engine.js', 'huit-americain/icon.svg',
  'rami/', 'rami/engine.js', 'rami/icon.svg',
  ...['coq', 'vache', 'cochon', 'chat', 'chien', 'mouton', 'canard', 'lapin', 'tournesol', 'pomme', 'cerises', 'poire', 'carotte', 'tracteur', 'arrosoir'].map(id => `paires/img/${id}.webp`),
  ...['vous', 'jeanne', 'louise', 'simone', 'odette', 'colette', 'yvonne', 'paul', 'marcel', 'rene', 'andre', 'henri', 'gaston'].map(id => `lib/avatars/${id}.webp`),
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE.map(u => new Request(u, { cache: 'reload' })))));
});
self.addEventListener('message', e => {
  if (e.data !== 'start') return;
  const home = new URL(self.registration.scope).pathname;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(all => {
    const reading = client => {
      const path = new URL(client.url).pathname.slice(home.length);
      return path === '' || path === 'admin/' || path.startsWith('blog/') || /^[^/]+\/regles\/$/.test(path);
    };
    if (all.every(reading)) return self.skipWaiting();
  }));
});
self.addEventListener('activate', e => e.waitUntil((async () => {
  for (const name of await caches.keys()) if (name.startsWith('grandpa-games-') && name !== CACHE) await caches.delete(name);
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
