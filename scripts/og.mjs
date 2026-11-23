// Renders the link preview images: node scripts/og.mjs
// public/og.jpg, for the library, shows four drawings of the library tiles on its green felt with the promise
// of the site, in the words of the library page.
// Each game page shows public/og/jeux/<id>.jpg, 1200 x 630: the felt of the game, its name, the line of its
// tile and the drawing of its tile, taken from the library page itself at twice its size, without its felt. The games, their
// felts and their lines come from GAMES in public/index.html, so a new game gets its image by running this
// script again.
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';

const root = new URL('../public/', import.meta.url);
const library = readFileSync(new URL('index.html', root), 'utf8');
// The heading of each family in the library, such as « Jeux de cartes ».
const families = Object.fromEntries([...library.matchAll(/\['(\w+)', '([^']+)'\]/g)].map(([, key, name]) => [key, name]));
const games = [...library.matchAll(/\{ id: '([^']+)', family: '([^']+)', title: '([^']+)', text: '([^']+)',\s*felt: \['([^']+)', '([^']+)'\]/g)]
  .map(([, id, family, title, text, top, bottom]) => ({ id, family: families[family], title, text, top, bottom }));
if (games.length < 10) throw new Error(`Only ${games.length} games found in public/index.html`);

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const page = (g, art) => `<!doctype html><html lang="fr"><head><meta charset="utf-8"><style>
@font-face { font-family: Lexend; src: url(${new URL('fonts/lexend.woff2', root).href}) format('woff2'); font-weight: 100 900; }
html, body { margin: 0; width: 1200px; height: 630px; overflow: hidden; }
body { position: relative; font-family: Lexend, sans-serif; color: #fff;
  background: radial-gradient(ellipse at 50% 35%, transparent 50%, rgb(0 0 0 / 28%) 100%), radial-gradient(120% 90% at 50% 0%, ${g.top}, ${g.bottom} 75%) ${g.bottom}; }
.text { position: absolute; left: 70px; top: 0; bottom: 120px; width: 490px; display: flex; flex-direction: column; justify-content: center; }
.kicker { font: 700 30px Lexend; color: rgb(255 244 214 / .92); letter-spacing: .01em; }
h1 { margin: 10px 0 0; font: 700 72px/1.04 Lexend; letter-spacing: -.02em; }
p { margin: 26px 0 0; font: 500 33px/1.3 Lexend; color: rgb(255 255 255 / .9); }
.brand { position: absolute; left: 80px; bottom: 50px; display: flex; align-items: center; gap: 16px; font: 700 32px Lexend; color: rgb(255 255 255 / .8); }
.brand img { width: 60px; height: 60px; border-radius: 50%; }
.art { position: absolute; right: 50px; top: 50%; width: 520px; height: 300px; margin-top: -150px; }
</style></head><body>
<div class="text"><div class="kicker">${esc(g.family)}</div><h1>${esc(g.title)}</h1><p>${esc(g.text)}</p></div>
<div class="brand"><img src="${new URL('icons/logo.webp', root).href}" alt="">jeux-papi.fr</div>
<img class="art" src="${art}" alt="">
</body></html>`;

// The library's preview: the name and the promise of the site on the left, four games on the right.
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
p { margin: 22px 0 auto; max-width: 500px; padding-bottom: 40px; font: 500 30px/1.33 Lexend; color: rgb(255 255 255 / .9); }
.site { position: absolute; right: 50px; bottom: 44px; font: 700 28px Lexend; color: rgb(255 244 214 / .85); }
.games { position: absolute; right: 40px; top: 50%; translate: 0 -50%; display: grid; grid-template-columns: repeat(2, 270px); gap: 26px 10px; }
.games img { width: 270px; height: 156px; }
</style></head><body>
<div class="text"><div class="brand"><img src="${new URL('icons/logo.webp', root).href}" alt="">Jeux de Papi</div>
<h1>Des jeux classiques <em>à votre rythme</em></h1>
<p>Belote, solitaire, dames, billard et bien d’autres. Simples et sans publicité.</p>
</div>
<div class="site">jeux-papi.fr</div>
<div class="games">${['billard', 'belote', 'dames', 'yams'].map((id) => `<img src="${art[id]}" alt="">`).join('')}</div>
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
const p = await browser.newPage({ viewport: { width: 1200, height: 630 } });
const drawing = async (id) =>
  'data:image/png;base64,' + (await shelf.locator(`.tile[data-id="${id}"] .art`).screenshot({ omitBackground: true })).toString('base64');
try {
  writeFileSync(tmp, library_page(Object.fromEntries(await Promise.all(['billard', 'belote', 'dames', 'yams'].map(async (id) => [id, await drawing(id)])))));
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
