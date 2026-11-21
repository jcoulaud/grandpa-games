// The size buttons, "Réduire" and "Agrandir" (lib/zoom.js): they change the size of every page, keep it, stop at what the window can
// hold, and the mouse still lands on the right card, piece or square at a larger size.
// Every click here is aimed at the element as the screen shows it, so a game that misreads the mouse
// at a larger size moves the wrong card or nothing.
import { launch, gameUrl, OUT } from './harness.mjs';

const browser = await launch();
let fails = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const errors = [];

try {
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 680 }, reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push(e.message));
  const g = (fn, arg) => page.evaluate(fn, arg);
  const wait = ms => page.waitForTimeout(ms);
  const center = r => [r.x + r.width / 2, r.y + r.height / 2];
  const zoomText = () => g(() => Math.round(Zoom.z() * 100) + ' %');

  // 1. The library: 100 % at first, "+" up to what a 1366 by 680 window holds, kept after a reload.
  await page.goto(gameUrl('.'));
  await g(() => localStorage.clear());
  await page.reload();
  ok(await zoomText() === '100 %', 'the library starts at 100 %');
  const plus = page.locator('.zoom button', { hasText: 'Agrandir' }), minus = page.locator('.zoom button', { hasText: 'Réduire' });
  for (let n = 0; n < 8 && await plus.isEnabled(); n++) await plus.click();
  ok(await zoomText() === '130 %', 'on a 1366 by 680 window, "Agrandir" stops at 130 %: ' + await zoomText());
  ok(await g(() => document.documentElement.style.zoom) === '1.3', 'the page is drawn at 130 %');
  await page.screenshot({ path: `${OUT}/zoom-library-130.png` });
  await page.reload();
  ok(await zoomText() === '130 %', 'the size is kept after a reload');
  await minus.click(); await minus.click(); await minus.click(); await minus.click();
  ok(await zoomText() === '90 %', '"Réduire" makes the page smaller');
  await plus.click(); await plus.click(); await plus.click(); await plus.click();

  // 2. Solitaire at 130 %: a click and a drag move the right card.
  await page.goto(gameUrl('solitaire'));
  await page.click('#helpClose');
  await page.locator('#overBtns button', { hasText: 'Facile' }).click();
  await page.waitForFunction(() => !busy);
  ok(await zoomText() === '130 %', 'a game opens at the size chosen in the library');
  const findMove = want => g(want => {
    const locs = [];
    if (S.waste.length) locs.push({ a: 'waste', k: S.waste.length - 1 });
    S.tab.forEach((p, i) => p.forEach((c, k) => { if (c.up) locs.push({ a: 'tab', i, k }); }));
    for (const loc of locs) {
      const d = destinations(loc);
      if (d.length === want && (d[0].a !== 'tab' || S.tab[d[0].i].length)) {
        const r = E[pileOf(loc)[loc.k].id].getBoundingClientRect();
        const q = d[0].a === 'found' ? S.found[d[0].i] : S.tab[d[0].i];
        const t = q.length ? E[q[q.length - 1].id].getBoundingClientRect() : null;
        return { id: pileOf(loc)[loc.k].id, card: [r.x + r.width / 2, r.y + 14], to: t && [t.x + t.width / 2, t.y + t.height / 2] };
      }
    }
    return null;
  }, want);
  let m = null;
  for (let n = 0; n < 40 && !(m = await findMove(1)); n++) { await g(() => clickStock()); await wait(400); }
  if (m) {
    const before = await g(() => S.moves);
    await page.mouse.click(...m.card); await page.mouse.move(5, 5); await wait(600);
    ok(await g(() => S.moves) === before + 1, 'solitaire at 130 %: one click moves the card under the mouse');
  } else console.log('SKIP no solitaire card with one place');
  m = null;
  for (let n = 0; n < 40 && !((m = await findMove(1)) && m.to); n++) { await g(() => clickStock()); await wait(400); }
  if (m && m.to) {
    const before = await g(() => S.moves);
    await page.mouse.move(...m.card); await page.mouse.down();
    for (let k = 1; k <= 8; k++) await page.mouse.move(m.card[0] + (m.to[0] - m.card[0]) * k / 8, m.card[1] + (m.to[1] - m.card[1]) * k / 8);
    const follows = await g(id => { const r = E[id].getBoundingClientRect(); return [r.x + r.width / 2, r.y + 14]; }, m.id);
    await page.mouse.up(); await wait(600);
    ok(Math.hypot(follows[0] - m.to[0], follows[1] - m.to[1]) < 30, 'solitaire at 130 %: the dragged card stays under the mouse');
    ok(await g(() => S.moves) === before + 1, 'solitaire at 130 %: a drag drops the card where the mouse lets go');
  } else console.log('SKIP no solitaire drag');
  await page.screenshot({ path: `${OUT}/zoom-solitaire-130.png` });

  // 3. FreeCell at 130 %: a click on the last card of a column moves it.
  await page.goto(gameUrl('freecell'));
  await page.click('#helpClose');
  await page.locator('#overBtns button', { hasText: 'Facile' }).click();
  await page.waitForFunction(() => !busy);
  const fc = await g(() => { const p = S.tab.find(p => p.length); const r = E[p[p.length - 1]].getBoundingClientRect(); return [r.x + r.width / 2, r.y + 14]; });
  const fcBefore = await g(() => S.moves);
  await page.mouse.click(...fc); await page.mouse.move(5, 5); await wait(600);
  ok(await g(() => S.moves) === fcBefore + 1 || await g(() => sel) !== null, 'freecell at 130 %: a click takes the card under the mouse');

  // 4. Dames at 130 %: a piece and a square, clicked where they show.
  await page.goto(gameUrl('dames'));
  await page.click('#helpClose');
  await page.locator('#overBtns button', { hasText: 'Facile' }).click();
  await wait(400);
  const mv = await g(() => legal()[0]);
  const sq = n => g(n => { const r = squares[n].getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; }, n);
  await page.mouse.click(...await sq(mv.from)); await page.mouse.move(5, 5); await wait(550);
  await page.mouse.click(...await sq(mv.to)); await page.mouse.move(5, 5); await wait(300);
  ok(await g(mv => G.b[mv.from] === 0 || phase !== 'player', mv), 'dames at 130 %: the piece clicked goes to the square clicked');
  await page.screenshot({ path: `${OUT}/zoom-dames-130.png` });

  // 5. Dame de pique at 130 %: the three cards clicked are the three chosen.
  await page.goto(gameUrl('dame-de-pique'));
  await page.click('#helpClose');
  await page.locator('#overBtns button', { hasText: 'Facile' }).click();
  await wait(500);
  const cards = await g(() => [...document.querySelectorAll('.card.hand')].slice(0, 3).map(e => +e.dataset.c));
  for (const c of cards) {
    await page.mouse.click(...await g(c => { const r = document.querySelector(`.card.hand[data-c="${c}"]`).getBoundingClientRect(); return [r.x + 14, r.y + 18]; }, c));
    await page.mouse.move(5, 5); await wait(560);
  }
  ok(await g(cards => picks.length === 3 && cards.every(c => picks.includes(c)), cards), 'dame de pique at 130 %: the cards clicked are the cards chosen');

  // 6. A smaller window lowers the size it can hold; a phone stays at 100 % and shows no buttons.
  await page.setViewportSize({ width: 1093, height: 530 }); await wait(200);
  ok(await zoomText() === '100 %', 'a 1093 by 530 window holds 100 % at most: ' + await zoomText());
  await page.setViewportSize({ width: 390, height: 760 }); await wait(200);
  ok(await g(() => Zoom.z()) === 1 && !(await page.locator('.zoom').isVisible()), 'a phone stays at 100 %, without the buttons');
  await page.setViewportSize({ width: 1366, height: 680 }); await wait(200);
  ok(await zoomText() === '130 %', 'back in the laptop window, the size chosen comes back');
  await ctx.close();
} finally {
  await browser.close();
}
ok(!errors.length, 'no page errors ' + errors.join(' | '));
console.log(fails ? `${fails} FAILED` : 'ALL PASSED');
process.exit(fails ? 1 : 0);
