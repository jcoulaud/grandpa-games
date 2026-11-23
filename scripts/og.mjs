// Renders the link preview images: node scripts/og.mjs
// public/og.jpg, for the library, shows a tilted wall of library tiles, as the library draws them, beside the
// name and the words of the library page.
// Each game page shows public/og/jeux/<id>.jpg, 1200 x 630: the felt of the game, its name, the line of its
// tile and the drawing of its tile, taken from the library page itself at twice its size, without its felt. The games, their
// felts and their lines come from GAMES in public/index.html, so a new game gets its image by running this
// script again.
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';

const root = new URL('../public/', import.meta.url);
const library = readFileSync(new URL('index.html', root), 'utf8');
const games = [...library.matchAll(/\{ id: '([^']+)', family: '[^']+', title: '([^']+)', text: '([^']+)',\s*felt: \['([^']+)', '([^']+)'\]/g)]
  .map(([, id, title, text, top, bottom]) => ({ id, title, text, top, bottom }));
if (games.length < 10) throw new Error(`Only ${games.length} games found in public/index.html`);

// The space before « : » never breaks, as in French print.
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/ ([:;!?])/g, '\u00a0$1');
const page = (g, art) => `<!doctype html><html lang="fr"><head><meta charset="utf-8"><style>
@font-face { font-family: Lexend; src: url(${new URL('fonts/lexend.woff2', root).href}) format('woff2'); font-weight: 100 900; }
html, body { margin: 0; width: 1200px; height: 630px; overflow: hidden; }
body { position: relative; font-family: Lexend, sans-serif; color: #fff;
  background: radial-gradient(ellipse at 50% 35%, transparent 50%, rgb(0 0 0 / 28%) 100%), radial-gradient(120% 90% at 50% 0%, ${g.top}, ${g.bottom} 75%) ${g.bottom}; }
.text { position: absolute; left: 64px; top: 0; bottom: 110px; width: 590px; display: flex; flex-direction: column; justify-content: center; }
h1 { margin: 0; font: 700 96px/1.02 Lexend; letter-spacing: -.02em; }
p { margin: 24px 0 0; font: 500 42px/1.25 Lexend; color: rgb(255 255 255 / .9); }
.brand { position: absolute; left: 80px; bottom: 50px; display: flex; align-items: center; gap: 16px; font: 700 32px Lexend; color: rgb(255 255 255 / .8); }
.brand img { width: 60px; height: 60px; border-radius: 50%; }
.art { position: absolute; right: 30px; top: 50%; width: 460px; height: 265px; margin-top: -132px; }
</style></head><body>
<div class="text"><h1>${esc(g.title)}</h1><p>${esc(g.text)}</p></div>
<div class="brand"><img src="${new URL('icons/logo.webp', root).href}" alt="">jeux-papi.fr</div>
<img class="art" src="${art}" alt="">
</body></html>`;

// The library's preview: the name and the promise of the site on the left, a tilted wall of tiles on the right.
const library_page = (art) => `<!doctype html><html lang="fr"><head><meta charset="utf-8"><style>
@font-face { font-family: Lexend; src: url(${new URL('fonts/lexend.woff2', root).href}) format('woff2'); font-weight: 100 900; }
html, body { margin: 0; width: 1200px; height: 630px; overflow: hidden; }
body { position: relative; font-family: Lexend, sans-serif; color: #fff;
  background: radial-gradient(60% 70% at 0% 100%, rgb(255 200 61 / .14), transparent 70%),
    radial-gradient(ellipse at 50% 35%, transparent 50%, rgb(0 0 0 / 30%) 100%), radial-gradient(120% 90% at 50% 0%, #1F7A6C, #0F4F47 72%) #0F4F47; }
.text { position: absolute; left: 70px; top: 50px; bottom: 50px; width: 560px; display: flex; flex-direction: column; }
.brand { display: flex; align-items: center; gap: 18px; font: 700 36px Lexend; }
.brand img { width: 52px; height: 52px; border-radius: 50%; box-shadow: 0 4px 12px rgb(0 0 0 / .3); }
h1 { margin: auto 0 0; font: 700 66px/1.06 Lexend; letter-spacing: -.02em; text-wrap: balance; }
h1 em { font-style: normal; color: #FFC83D; }
p { margin: 24px 0 auto; max-width: 500px; font: 500 36px/1.3 Lexend; color: rgb(255 255 255 / .9); }
.site { font: 700 28px Lexend; color: rgb(255 244 214 / .85); }
.wall { position: absolute; left: 650px; top: 50%; display: grid; grid-template-columns: repeat(3, 176px); gap: 16px; translate: 0 -50%; rotate: -8deg; }
.wall img { width: 176px; border-radius: 16px; box-shadow: 0 2px 4px rgb(0 0 0 / .2), 0 12px 26px rgb(0 0 0 / .35); }
.wall img:nth-child(3n + 2) { translate: 0 46px; }
</style></head><body>
<div class="wall">${art.map((src) => `<img src="${src}" alt="">`).join('')}</div>
<div class="text"><div class="brand"><img src="${new URL('icons/logo.webp', root).href}" alt="">Jeux de Papi</div>
<h1>Des jeux classiques <em>à votre rythme</em></h1>
<p>Simples et sans publicité.</p>
<div class="site">jeux-papi.fr</div></div>
</body></html>`;

mkdirSync(new URL('og/jeux/', root), { recursive: true });
const tmp = new URL('og-game.tmp.html', import.meta.url);
const browser = await chromium.launch();
// The pictures of the library tiles, each 520 by 300: the scenes are drawn for 260 by 150, at twice the size.
const shelf = await browser.newPage({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: 2 });
await shelf.goto(new URL('index.html', root).href, { waitUntil: 'load' });
// Only the drawing: no felt, no tile and no page behind it, so it sits on the felt of the preview.
await shelf.addStyleTag({ content: 'html, body, .tile, .tile .art { background: none !important; box-shadow: none !important; } .family .grid { grid-template-columns: repeat(auto-fill, 520px) !important; } .tile .art { --k: 2; width: 520px; height: 300px; }' });
await shelf.evaluate(() => document.fonts.ready);
// Whole tiles for the library's preview, as the library shows them, without their line of text.
const wall = await browser.newPage({ viewport: { width: 1400, height: 1400 }, deviceScaleFactor: 2 });
await wall.goto(new URL('index.html', root).href, { waitUntil: 'load' });
await wall.addStyleTag({ content: 'html, body { background: none !important; } .family .grid { grid-template-columns: repeat(auto-fill, 320px) !important; } .tile .body p { display: none; } .tile { box-shadow: none !important; }' });
await wall.evaluate(() => document.fonts.ready);
const tile = async (id) =>
  'data:image/png;base64,' + (await wall.locator(`.tile[data-id="${id}"]`).screenshot({ omitBackground: true })).toString('base64');
const p = await browser.newPage({ viewport: { width: 1200, height: 630 } });
const drawing = async (id) =>
  'data:image/png;base64,' + (await shelf.locator(`.tile[data-id="${id}"] .art`).screenshot({ omitBackground: true })).toString('base64');
try {
  const shown = ['belote', 'billard', 'solitaire', 'dames', 'yams', 'mots-meles', 'bowling', 'sudoku', 'petits-chevaux'];
  const tiles = [];
  for (const id of shown) tiles.push(await tile(id));
  writeFileSync(tmp, library_page(tiles));
  await p.goto(tmp.href, { waitUntil: 'load' });
  await p.evaluate(() => document.fonts.ready);
  await p.screenshot({ path: new URL('og.jpg', root).pathname, type: 'jpeg', quality: 88 });
  console.log('og.jpg');
  for (const g of games) {
    const art = await drawing(g.id);
    writeFileSync(tmp, page(g, art));
    await p.goto(tmp.href, { waitUntil: 'load' });
    await p.evaluate(() => document.fonts.ready);
    await p.screenshot({ path: new URL(`og/jeux/${g.id}.jpg`, root).pathname, type: 'jpeg', quality: 86 });
    console.log(g.id);
  }
} finally {
  rmSync(tmp, { force: true });
  await browser.close();
}
