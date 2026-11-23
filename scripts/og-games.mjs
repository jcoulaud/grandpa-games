// Renders one link preview image per game: node scripts/og-games.mjs
// Each game page shows public/og/jeux/<id>.jpg, 1200 x 630: the felt of the game, its name, the line of its
// tile in the library and its icon. The games, their felts and their lines come from GAMES in public/index.html,
// so a new game gets its image by running this script again.
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';

const root = new URL('../public/', import.meta.url);
const library = readFileSync(new URL('index.html', root), 'utf8');
const games = [...library.matchAll(/\{ id: '([^']+)', family: '[^']+', title: '([^']+)', text: '([^']+)',\s*felt: \['([^']+)', '([^']+)'\]/g)]
  .map(([, id, title, text, top, bottom]) => ({ id, title, text, top, bottom }));
if (games.length < 10) throw new Error(`Only ${games.length} games found in public/index.html`);

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const page = (g) => `<!doctype html><html lang="fr"><head><meta charset="utf-8"><style>
@font-face { font-family: Lexend; src: url(${new URL('fonts/lexend.woff2', root).href}) format('woff2'); font-weight: 100 900; }
html, body { margin: 0; width: 1200px; height: 630px; overflow: hidden; }
body { position: relative; font-family: Lexend, sans-serif; color: #fff;
  background: radial-gradient(ellipse at 50% 35%, transparent 50%, rgb(0 0 0 / 28%) 100%), radial-gradient(120% 90% at 50% 0%, ${g.top}, ${g.bottom} 75%) ${g.bottom}; }
.text { position: absolute; left: 80px; top: 0; bottom: 120px; width: 600px; display: flex; flex-direction: column; justify-content: center; }
.kicker { font: 700 30px Lexend; color: rgb(255 244 214 / .92); letter-spacing: .01em; }
h1 { margin: 10px 0 0; font: 700 84px/1.04 Lexend; letter-spacing: -.02em; }
p { margin: 26px 0 0; font: 500 36px/1.3 Lexend; color: rgb(255 255 255 / .9); }
.brand { position: absolute; left: 80px; bottom: 50px; display: flex; align-items: center; gap: 16px; font: 700 32px Lexend; color: rgb(255 255 255 / .8); }
.brand img { width: 60px; height: 60px; border-radius: 50%; }
.art { position: absolute; right: 70px; top: 50%; width: 420px; height: 420px; margin-top: -210px; object-fit: contain;
  filter: drop-shadow(0 22px 30px rgb(0 0 0 / .38)); }
</style></head><body>
<div class="text"><div class="kicker">Jouer en ligne, gratuitement</div><h1>${esc(g.title)}</h1><p>${esc(g.text)}</p></div>
<div class="brand"><img src="${new URL('icons/logo.webp', root).href}" alt="">jeux-papi.fr</div>
<img class="art" src="${new URL(`${g.id}/icon.svg`, root).href}" alt="">
</body></html>`;

mkdirSync(new URL('og/jeux/', root), { recursive: true });
const tmp = new URL('og-game.tmp.html', import.meta.url);
const browser = await chromium.launch();
const p = await browser.newPage({ viewport: { width: 1200, height: 630 } });
try {
  for (const g of games) {
    writeFileSync(tmp, page(g));
    await p.goto(tmp.href, { waitUntil: 'load' });
    await p.evaluate(() => document.fonts.ready);
    await p.screenshot({ path: new URL(`og/jeux/${g.id}.jpg`, root).pathname, type: 'jpeg', quality: 86 });
    console.log(g.id);
  }
} finally {
  rmSync(tmp, { force: true });
  await browser.close();
}
