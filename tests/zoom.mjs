// The size buttons, "Réduire" and "Agrandir" (lib/zoom.js): they change the size of every page, keep it, stop at what the window can
// hold, and the mouse still lands on the right card, piece or square at a larger size.
// Every click here is aimed at the element as the screen shows it, so a game that misreads the mouse
// at a larger size moves the wrong card or nothing.
import { launch, gameUrl, OUT } from './harness.mjs';

const browser = await launch({ zoom: false });
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

  // 1. The library: 80 % at first, "+" up to what a 1366 by 680 window holds, kept after a reload.
  await page.goto(gameUrl('.'));
  await g(() => localStorage.clear());
  await page.reload();
  ok(await zoomText() === '80 %', 'the library starts at the smallest size, 80 %');
  await g(() => localStorage.setItem('gg:zoom', '1.3'));
  await page.reload();
  ok(await zoomText() === '80 %', 'a size kept before the 80 % start is forgotten');
  const plus = page.locator('.zoom button', { hasText: 'Agrandir' }), minus = page.locator('.zoom button', { hasText: 'Réduire' });
  for (let n = 0; n < 8 && await plus.isEnabled(); n++) await plus.click();
  ok(await zoomText() === '130 %', 'on a 1366 by 680 window, "Agrandir" stops at 130 %: ' + await zoomText());
  ok(await g(() => document.documentElement.style.zoom) === '1.3', 'the page is drawn at 130 %');
  await g(() => dispatchEvent(new Event('beforeinstallprompt')));
  const footerFits = () => g(() => {
    const controls = [...document.querySelectorAll('footer button')].map(b => b.getBoundingClientRect());
    const mid = r => r.top + r.height / 2;
    return controls.every(r => r.width > 0 && r.left >= 0 && r.right <= innerWidth && Math.abs(mid(r) - mid(controls[0])) < 2);
  });
  ok(await footerFits(), 'the install and display buttons share one row at maximum laptop zoom');
  await page.setViewportSize({ width: 2400, height: 1200 });
  await page.waitForFunction(() => !document.querySelector('[data-dir="1"]').disabled);
  while (await plus.isEnabled()) await plus.click();
  ok(await zoomText() === '200 %' && await footerFits(), 'all footer buttons fit at 200 %');
  await page.setViewportSize({ width: 760, height: 680 });
  await page.waitForFunction(() => Zoom.z() === 1);
  ok(await g(() => [...document.querySelectorAll('footer a, footer button')].every(el => {
    const r = el.getBoundingClientRect();
    return r.left >= 0 && r.right <= innerWidth;
  })), 'the visible install, credit and display controls fit at tablet width');

  await page.setViewportSize({ width: 1366, height: 680 });
  await page.waitForFunction(() => Zoom.z() === 1.3);
  await page.screenshot({ path: `${OUT}/zoom-library-130.png` });
  await page.reload();
  ok(await zoomText() === '130 %', 'the size is kept after a reload');
  await minus.click(); await minus.click(); await minus.click(); await minus.click();
  ok(await zoomText() === '90 %', '"Réduire" makes the page smaller');
  const columns = () => g(() => getComputedStyle(document.querySelector('#games .grid')).gridTemplateColumns.split(' ').length);
  ok(await columns() === 4, 'reducing the library fits four games across the window');
  await plus.click();
  ok(await columns() === 3, 'enlarging the tiles returns the library to three columns');
  const full = page.getByRole('button', { name: 'Plein écran', exact: true });
  await full.click();
  await page.waitForFunction(() => document.fullscreenElement === document.documentElement);
  await page.getByRole('button', { name: 'Quitter le plein écran' }).click();
  await page.waitForFunction(() => !document.fullscreenElement);
  ok(await full.isVisible(), 'the footer enters and leaves full screen');
  await g(() => document.querySelector('main').scrollTo(0, 9999));
  ok(await g(() => Math.abs(document.querySelector('footer').getBoundingClientRect().bottom - innerHeight) <= 1),
    'the footer stays at the bottom when the games scroll');
  await plus.click(); await plus.click(); await plus.click();

  // 2. Solitaire at 130 %: a click and a drag move the right card.
  await page.goto(gameUrl('solitaire'));
  // The first visit starts a game at Facile at once.
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
  // The first visit starts a game at Facile at once.
  await page.waitForFunction(() => !busy);
  const fc = await g(() => { const p = S.tab.find(p => p.length); const r = E[p[p.length - 1]].getBoundingClientRect(); return [r.x + r.width / 2, r.y + 14]; });
  const fcBefore = await g(() => S.moves);
  await page.mouse.click(...fc); await page.mouse.move(5, 5); await wait(600);
  ok(await g(() => S.moves) === fcBefore + 1 || await g(() => sel) !== null, 'freecell at 130 %: a click takes the card under the mouse');

  // 4. Dames at 130 %: a piece and a square, clicked where they show.
  await page.goto(gameUrl('dames'));
  // The first visit starts a game at Facile at once.
  await wait(400);
  const mv = await g(() => legal()[0]);
  const sq = n => g(n => { const r = squares[n].getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; }, n);
  await page.mouse.click(...await sq(mv.from)); await page.mouse.move(5, 5); await wait(550);
  await page.mouse.click(...await sq(mv.to)); await page.mouse.move(5, 5); await wait(300);
  ok(await g(mv => G.b[mv.from] === 0 || phase !== 'player', mv), 'dames at 130 %: the piece clicked goes to the square clicked');
  await page.screenshot({ path: `${OUT}/zoom-dames-130.png` });

  // 5. Dame de pique at 130 %: the three cards clicked are the three chosen.
  await page.goto(gameUrl('dame-de-pique'));
  // The first visit starts a game at Facile at once.
  await wait(500);
  const cards = await g(() => [...document.querySelectorAll('.card.hand')].slice(0, 3).map(e => +e.dataset.c));
  for (const c of cards) {
    await page.mouse.click(...await g(c => { const r = document.querySelector(`.card.hand[data-c="${c}"]`).getBoundingClientRect(); return [r.x + 14, r.y + 18]; }, c));
    await page.mouse.move(5, 5); await wait(560);
  }
  ok(await g(cards => picks.length === 3 && cards.every(c => picks.includes(c)), cards), 'dame de pique at 130 %: the cards clicked are the cards chosen');

  // 6. Mots mêlés at 130 %: a click on the first letter and one on the last find the word, and a drag too.
  await page.goto(gameUrl('mots-meles'));
  await page.click('#newBtn');
  await page.locator('#overBtns button', { hasText: 'Difficile' }).click();
  await wait(300);
  const letter = i => g(i => { const r = document.querySelector(`.cell[data-i="${i}"]`).getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; }, i);
  const word = w => g(w => { const c = MotsMeles.cells(G, w); return [c[0], c[c.length - 1]]; }, w);
  for (const i of await word(0)) { await page.mouse.click(...await letter(i)); await page.mouse.move(5, 5); await wait(560); }
  ok(await g(() => G.found.includes(0)), 'mots mêlés at 130 %: the letters clicked find the word');
  const [ds, de] = await word(1);
  await page.mouse.move(...await letter(ds)); await page.mouse.down();
  await page.mouse.move(...await letter(de), { steps: 10 }); await page.mouse.up();
  ok(await g(() => G.found.includes(1)), 'mots mêlés at 130 %: a drag from the first letter to the last finds the word');
  // 6. Petits chevaux at 130 %: a click on a framed horse moves that horse, also beside a red one.
  await page.goto(gameUrl('petits-chevaux'));
  // The first visit starts a game at Facile at once.
  await wait(300);
  await g(() => {
    calm();
    const red = (PetitsChevaux.abs(0, 11) - PetitsChevaux.START[1] + 56) % 56;
    G = view = { ...PetitsChevaux.newGame('facile', 4), horses: [[10, -1], [red, -1], [-1, -1], [-1, -1]], die: 3 };
    render(); afterThrow();
    window.taps = [];
    const tap = tapHorse;
    tapHorse = (p, h) => { taps.push([p, h]); return tap(p, h); };
  });
  const pawn = await g(() => { const r = document.querySelector('.horse[data-p="0"][data-h="0"]').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; });
  await page.mouse.click(...pawn); await page.mouse.move(5, 5); await wait(300);
  ok(await g(() => JSON.stringify(taps) === '[[0,0]]' && G.horses[0][0] === 13), 'petits chevaux at 130 %: the click picks the horse under the mouse, which takes the red horse');
  await page.screenshot({ path: `${OUT}/zoom-petits-chevaux-130.png` });

  // 7. A smaller window lowers the size it can hold; a phone stays at 100 % and shows no buttons.
  // 5b. Morpion at 130 %: a click near the edge of a square of the big sheet plays that square.
  await page.goto(gameUrl('morpion'));
  await page.click('#newBtn');
  await page.locator('#overBtns button', { hasText: 'Moyen' }).click();
  await wait(400);
  const target = await g(() => G.n * G.n - 2);
  const box = await page.locator(`.cell[data-i="${target}"]`).boundingBox();
  await page.mouse.click(box.x + box.width - 3, box.y + 3); await page.mouse.move(5, 5); await wait(300);
  ok(await g(t => Morpion.board(G)[t] === Morpion.X && G.moves.length >= 1 && G.moves[0] === t, target), 'morpion at 130 %: the cross goes on the square clicked');

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
