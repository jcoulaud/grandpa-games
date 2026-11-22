// A window that is behind (the game was saved in another window since) cannot save. It must not
// count a game started, nor a win, in the statistics either.
import { gameUrl, launch } from './harness.mjs';
const browser = await launch();
let fails = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
// Each window records what it would send to the statistics.
const spy = page => page.evaluate(() => { window.sent = []; GG.track = (game, kind) => sent.push(kind); });

for (const game of ['solitaire', 'freecell', 'dames', 'dame-de-pique', 'demineur', 'yams', 'bataille-navale', 'paires']) {
  const ctx = await browser.newContext({ reducedMotion: 'reduce' });
  const a = await ctx.newPage(), b = await ctx.newPage();
  await a.goto(gameUrl(game));
  await a.click('#helpClose');
  await a.getByRole('button', { name: 'Facile', exact: true }).click();
  await b.goto(gameUrl(game));
  await b.evaluate(() => newGame('facile'));
  await spy(a);
  await a.evaluate(() => newGame('facile'));
  await a.waitForTimeout(100);
  ok(await a.evaluate(() => !sent.includes('start')), `${game}: a stale window does not count a game started`);
  ok(await a.evaluate(() => document.getElementById('overTitle').textContent === 'Le jeu a changé ailleurs'), `${game}: it asks to reload`);
  await spy(b);
  await b.evaluate(() => newGame('facile'));
  ok(await b.evaluate(() => sent.includes('start')), `${game}: the window that is up to date counts it`);

  // The solitaire and FreeCell count a win in save(): a stale window does not count it.
  if (game === 'solitaire' || game === 'freecell') {
    const won = await a.evaluate(() => {
      const all = [...Array(52).keys()];
      S.found = [0, 1, 2, 3].map(s => all.filter(c => Cards.st(c) === s).sort((x, y) => Cards.rk(x) - Cards.rk(y)));
      S.stock = []; S.waste = []; S.tab = S.tab.map(() => []); if (S.cells) S.cells = S.cells.map(() => null);
      S.won = false;
      const before = stats.won;
      const saved = save();
      return { saved, counted: stats.won - before, flag: S.won, sent: sent.includes('won') };
    });
    ok(!won.saved && !won.counted && !won.flag && !won.sent, `${game}: a stale window does not count a win`);
  }
  await ctx.close();
}

await browser.close();
console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
process.exit(fails ? 1 : 0);
