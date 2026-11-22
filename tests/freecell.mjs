// Plays FreeCell with a real mouse: the solver, one-click moves, free cells, refusals, hints, undo and the win.
import { createRequire } from 'node:module';
import { launch, gameUrl, OUT } from './harness.mjs';
const require = createRequire(import.meta.url);
let fails = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };

// 1. The solver's plans follow the rules, on 40 random deals.
require('../public/freecell/solver.js');
const { solve, sApply } = globalThis.Solver;
const rk = id => id % 13 + 1, st = id => (id / 13) | 0, rd = id => st(id) === 1 || st(id) === 2;
const fits = (a, b) => rd(a) !== rd(b) && rk(b) === rk(a) + 1;
let won = 0, bad = 0;
for (let n = 0; n < 40; n++) {
  // The game's shuffle. Sorting with a random comparison would leave the cards near their first order.
  const d = [...Array(52).keys()], c = [[], [], [], [], [], [], [], []];
  for (let i = 51; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [d[i], d[j]] = [d[j], d[i]]; }
  d.forEach((id, k) => c[k % 8].push(id));
  let x = { c, l: [], f: [0, 0, 0, 0] };
  const r = solve(x, 30000);
  if (!r.win) continue;
  won++;
  for (const m of r.path) {
    let legal = true;
    if (m.k === 'cc') {
      const run = x.c[m.src].slice(m.n), dst = x.c[m.dst];
      for (let i = 1; i < run.length; i++) if (!fits(run[i], run[i - 1])) legal = false;
      if (dst.length && !fits(run[0], dst.at(-1))) legal = false;
      const empty = x.c.filter(q => !q.length).length - (dst.length ? 0 : 1);
      if (run.length > (5 - x.l.length) * 2 ** empty) legal = false;
    }
    if ((m.k === 'cf' || m.k === 'lf') && x.f[st(m.id)] !== rk(m.id) - 1) legal = false;
    if (m.k === 'cl' && x.l.length >= 4) legal = false;
    if (m.k === 'lc' && x.c[m.dst].length && !fits(m.id, x.c[m.dst].at(-1))) legal = false;
    if (!legal) { bad++; break; }
    x = sApply(x, m);
  }
  if (!x.f.every(v => v === 13)) bad++;
}
ok(won >= 35, `the solver wins ${won} of 40 random deals`);
ok(bad === 0, 'every move of its plans is legal, and each plan wins');

const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1366, height: 680 } });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
await page.goto(gameUrl('freecell'));
await page.waitForTimeout(2600);
ok(await page.evaluate(() => help.classList.contains('on')), 'rules open on the first visit');
await page.keyboard.press('Escape');
await page.getByRole('button', { name: 'Facile', exact: true }).click();

const g = fn => page.evaluate(fn);
const L = await g(() => L);
// The space above and below the board (row-gap in lib/kit.css) takes some height on a 680px window.
ok(L.w >= 85, `card width at 1366x680 is ${L.w}px, height ${L.h}px`);
ok(await g(() => S.tab.flat().length === 52 && S.tab.map(p => p.length).join() === '7,7,7,7,6,6,6,6'), 'the deal has 8 columns of 7 and 6 cards');
const deepest = await g(() => Math.max(...S.tab.map(p => last(colY(p)) + L.h)) - L.H);
ok(deepest <= 0, `the dealt columns fit in the table (${deepest}px past it)`);
const strip = await g(() => { const ys = colY([0, 1, 2, 3, 4, 5, 6]); return ys[1] - ys[0]; });
ok(strip >= 24, `a dealt column of seven shows ${Math.round(strip)}px of each covered card`);
const [tx, ty] = await g(() => { const r = table.getBoundingClientRect(); return [r.left, r.top]; });
const at = ([x, y]) => [tx + x, ty + y];
const cardPt = id => g(`[pos[${id}][0] + L.w/2, pos[${id}][1] + 12]`).then(at);
const pilePt = d => g(`(() => { const d = ${JSON.stringify(d)};
  const [x, y] = d.a === 'cell' ? cellXY(d.i) : d.a === 'found' ? foundXY(d.i)
    : S.tab[d.i].length ? pos[last(S.tab[d.i])] : [colX(d.i), L.ty]; return [x + L.w/2, y + L.h/2]; })()`).then(at);
await page.screenshot({ path: `${OUT}/freecell-1-start.png` });

await page.waitForFunction(() => !busy);

// A made-up position. found[s] lowest cards of suit s are home. The other cards not in tab go to
// the last column. With full, they also fill the free cells and the empty columns 4 to 6.
const setup = (tab, found, full) => g(`(() => { const tab = ${JSON.stringify(tab)}, found = ${JSON.stringify(found)}, full = ${!!full};
  S = { tab, cells: [null, null, null, null], found: found.map((n, s) => [...Array(n).keys()].map(r => s * 13 + r)),
    moves: 3, won: false, stuckShown: true, lostShown: true };
  const used = new Set([...tab.flat(), ...S.found.flat()]);
  const rest = [...Array(52).keys()].filter(id => !used.has(id));
  if (full) { for (let i = 4; i < 7; i++) if (!tab[i].length) tab[i].push(rest.pop()); S.cells = [rest.pop(), rest.pop(), rest.pop(), rest.pop()]; }
  tab[7].push(...rest);
  clearSel(); clearTimeout(autoT); render({ instant: true });
})()`);
const below = i => g(`[colX(${i}) + L.w/2, pos[last(S.tab[${i}])][1] + L.h + 30]`).then(at);
const msg = () => g(() => document.getElementById('msg').textContent);

// 2. One click: a card with one place goes there. The 7 of spades (6) goes on the 8 of hearts (20).
await setup([[12, 6], [25, 20], [38], [51], [], [], [], []], [4, 7, 12, 12], true);
await page.waitForTimeout(500);
await page.mouse.click(...await cardPt(6));
await page.waitForTimeout(100);
ok(await g(() => last(S.tab[1]) === 6), 'one click moves a card with one place: ' + await msg());
await g(() => clearTimeout(autoT));

// 3. Several places: two columns, the free cells and the empty columns. The first click chooses, a wrong place explains.
await setup([[12, 6], [25, 20], [38, 33], [51], [], [], [], []], [4, 7, 7, 12]);
await page.waitForTimeout(500);
await page.mouse.click(...await cardPt(6));
ok(await g(() => sel) === 6, 'with several places, the first click chooses the card');
ok(await g(() => marks.length) === 4, `one frame per kind of place: two columns, one free cell, one empty column (${await g(() => marks.length)})`);
await page.screenshot({ path: `${OUT}/freecell-2-chosen.png` });
await page.mouse.click(...await below(3));
ok(await g(() => sel) === 6 && (await msg()).includes('Alternez'), 'a wrong place keeps the card and says why: ' + await msg());
await page.mouse.click(...await pilePt({ a: 'cell', i: 2 }));
await page.waitForTimeout(100);
ok(await g(() => S.cells[2] === 6), 'the card goes to the free cell that was clicked');
await page.waitForTimeout(600); // a second click at the same spot within 500 ms is a double-click
await page.mouse.click(...await cardPt(6));
ok(await g(() => sel) === 6, 'a card in a free cell can be chosen again');
await page.keyboard.press('Escape');
await g(() => clearTimeout(autoT));

// 4. Capacity: with no free cell and no empty column, only one card moves at a time.
// The 9 of spades (8), the 8 of hearts (20) and the 7 of spades (6) cannot go on the 10 of diamonds (35).
await setup([[12, 8, 20, 6], [25, 35], [38], [51], [], [], [], []], [5, 7, 7, 12], true);
await page.waitForTimeout(500);
await page.mouse.click(...await cardPt(8));
ok(await g(() => sel) === null && (await msg()).includes('une seule carte à la fois'), 'three cards with room for one cannot move: ' + await msg());
ok(await g(() => !E[8].classList.contains('can') && E.every((el, id) => el.classList.contains('can') === (selectable(id) && destinations(locate(id)).length > 0))), 'only a card with a place to go is outlined under the mouse');
await page.waitForTimeout(600);
// A card under cards out of order cannot be taken, and the line says why.
await setup([[12, 8, 7], [25], [38], [51], [], [], [], []], [0, 0, 0, 0]);
await page.waitForTimeout(500);
await page.mouse.click(...await cardPt(8));
ok((await msg()).includes('ne se suivent pas'), 'cards out of order are explained');
await g(() => clearTimeout(autoT));

// 5. A run of three moves in one go when there is room: 9♠ 8♥ 7♠ onto the 10♦.
await setup([[12, 8, 20, 6], [25, 35], [38], [51], [], [], [], []], [5, 7, 7, 12]);
await page.waitForTimeout(500);
const from = await cardPt(8), to = await pilePt({ a: 'tab', i: 1 });
await page.mouse.move(...from); await page.mouse.down(); await page.mouse.move(...to, { steps: 12 });
ok(await g(() => marks.some(x => x.classList.contains('over'))), 'the place under a dragged run lights up');
await page.mouse.up(); await page.waitForTimeout(300);
ok(await g(() => S.tab[1].join() === '25,35,8,20,6'), 'a dragged run of three cards lands on the 10');
await g(() => clearTimeout(autoT));

// 6. A real deal: the hint, followed by one click, then undo.
await g(() => newGame());
await page.waitForTimeout(2000);
ok(await g(() => !document.querySelector('.landed')), 'a new deal has no card outlined from the last move');
await page.waitForTimeout(600);
await page.click('#hintBtn');
const hint = await g(() => ({ sel, hintDst, msg: document.getElementById('msg').textContent, moves: S.moves }));
console.log('     hint: ' + hint.msg);
ok(hint.sel !== null && hint.msg.length > 10, 'the hint shows a sentence and a target');
await page.screenshot({ path: `${OUT}/freecell-3-hint.png` });
await page.mouse.click(...await pilePt(hint.hintDst));
await page.waitForTimeout(300);
ok(await g(() => S.moves) === hint.moves + 1, 'one click on the yellow place follows the hint');
// Reopening the game brings back the same position, once the automatic cards are home.
await page.waitForTimeout(3000);
const before = await g(() => JSON.stringify([S.tab, S.cells, S.found]));
await page.reload(); await page.waitForTimeout(800);
ok(await g(() => JSON.stringify([S.tab, S.cells, S.found])) === before && !(await g(() => help.classList.contains('on'))), 'the game reopens where it was, without the rules');
// Following the hints wins the game.
for (let n = 0; n < 200 && !(await g(() => isWon())); n++) {
  await g(() => { clearTimeout(autoT); const r = hintMove(); if (!r.move) return;
    const m = r.move, loc = locate(m.id);
    const dst = m.k === 'cf' || m.k === 'lf' ? { a: 'found', i: st(m.id) } : m.k === 'cl' ? { a: 'cell', i: S.cells.indexOf(null) } : { a: 'tab', i: m.dst };
    moveCards(loc, dst); clearTimeout(autoT); });
}
ok(await g(() => isWon()), 'following the hints wins the deal');
await g(() => { autoStep(); });
await page.waitForTimeout(2200);
ok(await g(() => dialogOpen() && document.getElementById('overTitle').textContent.includes('Bravo')), 'the win dialog shows');
await page.screenshot({ path: `${OUT}/freecell-4-win.png` });
await page.keyboard.press('Escape');
await page.click('#undoBtn'); await page.waitForTimeout(200);
ok(await g(() => !isWon() && document.getElementById('msg').textContent === 'Coup annulé.'), 'Annuler goes back one move');
ok(await g(() => stats.won) === 1, 'the win stays counted after undo');

// 7. Fixes from the logic review.
// A position where the solver runs out of time: two hints in a row must not send a card back and forth.
const loopStart = await g(() => {
  clearTimeout(autoT); Kit.closeDialog(); plan = null; undo = [];
  S = { tab: [[10,13,25,39,51], [38,23,15,19], [40,1,37,3,28], [2,12,0,42,30,21,46,32,5], [7,22,16,14,47,20,45,18,43,29],
    [36,44,9,17,24,49], [34], [41,27,48,11,35,8,33,6,31,4]], cells: [50, null, null, null], found: [[], [], [26], []],
    moves: 1, won: false, stuckShown: true, lostShown: true };
  render({ instant: true });
  return JSON.stringify([S.tab, S.cells]);
});
const follow = () => g(() => { clearTimeout(autoT); showHint(); if (sel === null) return false; moveCards(locate(sel), hintDst); clearTimeout(autoT); return true; });
const moved = [await follow(), await follow()];
const back = await g(() => JSON.stringify([S.tab, S.cells])) === loopStart;
ok(!(moved[0] && moved[1] && back), 'two hints in a row do not send a card back and forth: ' + await msg());
// The last card home counts the win at once: an undo right after it does not lose it.
const wins0 = await g(() => stats.won);
await g(() => {
  clearTimeout(autoT); Kit.closeDialog(); clearSel();
  S = { tab: [[51], [], [], [], [], [], [], []], cells: [null, null, null, null],
    found: [0, 1, 2, 3].map(s => [...Array(s === 3 ? 12 : 13).keys()].map(r => s * 13 + r)), moves: 9, won: false, stuckShown: true, lostShown: true };
  render({ instant: true });
  moveCards({ a: 'tab', i: 0, k: 0 }, { a: 'found', i: 3 });
  doUndo();
});
ok(await g(() => stats.won) === wins0 + 1, 'a win followed at once by an undo is still counted');
// Going back with no undo steps, as after a restore from the backup, offers a new game and says nothing false.
await g(() => { clearTimeout(autoT); undo = []; backToWinnable(); });
ok(await g(() => dialogOpen() && document.getElementById('overTitle').textContent.startsWith('Impossible')), 'going back with no undo steps says so');
await page.keyboard.press('Escape');

// Fixes from the second review.
const put = (tab, cells, f) => g(`(() => { clearTimeout(autoT); Kit.closeDialog(); clearSel(); plan = null; undo = [];
  S = { tab: ${JSON.stringify(tab)}, cells: ${JSON.stringify(cells)}, found: ${JSON.stringify(f)}.map((n, s) => [...Array(n).keys()].map(r => s * 13 + r)),
    moves: 1, won: false, stuckShown: true, lostShown: true };
  render({ instant: true }); })()`);
// A search that runs out of time does not send the 4 of hearts home too early: here that move loses a winnable game.
await put([[39,51,19,22,1,7,32,44],[17,42,18,25,11,23],[9,5,40],[48,37,16],[4],[20,36,21,24,47,33],[6,29,0,50,12,41,49,35,8],[10,3,30,45,31,43]],
  [2,34,38,46], [0,3,3,0]);
await g(() => showHint());
ok(await g(() => sel !== 16), 'an unfinished search does not suggest a card going home: ' + await msg());
// Going back from a lost position finds a winning one that needs a longer search, and keeps the undo steps it skips.
await put([[23,40,15,46,32,6,34,7],[9,33],[50,47,49,42,18],[17,29,22,28,41,24,10,35],[45,39,36,48,21],[8,2,12,5],[26,51,38,27,20,19,44],[16,43,1,37,30,25,11]],
  [3,4,31,null], [1,2,0,0]);
await g(() => { moveCards({ a: 'tab', i: 2, k: 4 }, { a: 'cell', i: 3 }); clearTimeout(autoT); backToWinnable(); });
ok(await g(() => !dialogOpen() && S.cells[3] === null && last(S.tab[2]) === 18), 'going back finds the winning position: ' + await msg());
// A king alone in its column can go to an empty column: with a free cell too, the click chooses it.
await setup([[12], [25], [38], [51], [], [], [], []], [0, 0, 0, 0]);
await page.waitForTimeout(500);
await page.mouse.click(...await cardPt(12));
ok(await g(() => sel === 12 && destinations(locate(12)).some(d => d.a === 'tab')), 'a lone king is chosen, and an empty column is one of its places');
await page.keyboard.press('Escape');

// 8. Big screen
const big = await browser.newPage({ viewport: { width: 1920, height: 1000 } });
big.on('pageerror', e => errors.push(e.message));
await big.goto(gameUrl('freecell')); await big.waitForTimeout(2600); await big.keyboard.press('Escape');
await big.getByRole('button', { name: 'Facile', exact: true }).click();
console.log('     1920x1000 card: ' + JSON.stringify(await big.evaluate(() => [L.w, L.h])));
await big.screenshot({ path: `${OUT}/freecell-5-1920x1000.png` });

ok(errors.length === 0, 'no page errors ' + errors.join(' | '));
await browser.close();
console.log(fails ? `${fails} FAILED` : 'ALL PASSED');
process.exit(fails ? 1 : 0);
