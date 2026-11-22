// Plays the game with a real mouse: moves, drag, hints, undo, layout and the win.
import { launch, URL, OUT } from './harness.mjs';
const browser = await launch();
let fails = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };

const page = await browser.newPage({ viewport: { width: 1366, height: 680 } });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
await page.goto(URL);
await page.waitForTimeout(2200);
ok(await page.evaluate(() => help.classList.contains("on")), "rules open on the first visit");
await page.keyboard.press("Escape");
await page.getByRole('button', { name: 'Facile', exact: true }).click();
await page.waitForFunction(() => !busy);
ok(!(await page.evaluate(() => dialogOpen())), "Escape closes the rules");

const g = fn => page.evaluate(fn);
const L = await g(() => L);
// The message line and the bottom bar (lib/kit.css) take some height on a 680px window.
ok(L.w >= 86, `card width at 1366x680 is ${L.w}px, height ${L.h}px`);
const rankPx = await g(() => parseFloat(getComputedStyle(document.querySelector('.ix')).fontSize));
// The corner index is small, as on a real card: the rank over its suit.
ok(rankPx >= 16, `rank text is ${rankPx}px`);
const tablePos = () => g(() => { const r = table.getBoundingClientRect(); return [r.left, r.top]; });
const [tx, ty] = await tablePos();
const at = ([x, y]) => [tx + x, ty + y];
const cardPt = id => g(`[pos[${id}][0] + L.w/2, pos[${id}][1] + 12]`).then(at);
const pilePt = d => g(`(() => { const d = ${JSON.stringify(d)}; const q = d.a==='found'?S.found[d.i]:S.tab[d.i];
  const [x,y] = q.length ? pos[last(q).id] : d.a==='found' ? foundXY(d.i) : [colX(d.i), L.ty]; return [x + L.w/2, y + L.h/2]; })()`).then(at);

// Find a legal tableau or waste move, drawing until one exists. want: number of places the card must have (0 = any).
async function findMove(want = 0) {
  for (let n = 0; n < 60; n++) {
    const m = await g(`(() => { const want = ${want};
      const locs = [];
      if (S.waste.length) locs.push({ a: 'waste', k: S.waste.length - 1 });
      S.tab.forEach((p, i) => p.forEach((c, k) => { if (c.up) locs.push({ a: 'tab', i, k }); }));
      for (const loc of locs) { const d = destinations(loc); if (want ? d.length === want : d.length) return { id: pileOf(loc)[loc.k].id, d: d[0], loc }; }
      return null; })()`);
    if (m) return m;
    await page.mouse.click(...await g(() => [bankX(0) + L.w / 2, L.top + L.h / 2]).then(at));
    await page.waitForTimeout(600);
  }
}

const colsBefore = await g(() => [0, 1, 2, 3, 4, 5, 6].map(colX));
await page.screenshot({ path: `${OUT}/1-start-1366x680.png` });
ok(await g(() => document.getElementById('stockCount').textContent) === '24', 'the stock shows 24 cards left');

// 1. One click moves a card that has one legal place. A double-click counts as one click.
let m = await findMove(1);
const moves0 = await g(() => S.moves);
const p1 = await cardPt(m.id);
await page.mouse.click(...p1);
await page.mouse.click(...p1);
await page.waitForTimeout(100);
ok(await g(() => S.moves) === moves0 + 1 && await g(() => sel) === null, 'one click moves a card with a single place, and the double-click is ignored');
ok((await g(() => document.getElementById('msg').textContent)).startsWith('Vous avez '), 'the line says what moved: ' + await g(() => document.getElementById('msg').textContent));
ok(await g(`E[${m.id}].classList.contains('landed')`), 'the moved card is outlined where it landed');
await page.screenshot({ path: `${OUT}/2-one-click-landed.png` });
await page.waitForTimeout(1500);

// 2. Two places: the first click chooses, the second click moves. A wrong place explains and keeps the choice.
const real = await g(() => JSON.stringify(S));
await g(() => {
  const used = [6, 20, 33, 51, 36]; // 7 pique, 8 coeur, 8 carreau, roi de trefle, jack of diamonds
  const rest = [...Array(52).keys()].filter(i => !used.includes(i));
  S = { stock: rest.map(id => ({ id, up: false })), waste: [], found: [[], [], [], []], moves: 3, won: false, stuckShown: true, lostShown: true,
    tab: [[{ id: 6, up: true }], [{ id: 20, up: true }], [{ id: 33, up: true }], [{ id: 51, up: true }], [{ id: 36, up: true }], [], []] };
  render({ instant: true });
});
await page.waitForTimeout(600);
await page.mouse.click(...await cardPt(6));
ok(await g(() => sel) === 6, 'with two places, the first click chooses the card');
ok(await g(() => document.getElementById('ring').style.display) === 'block', 'yellow ring shows');
ok(await g(() => marks.length) === 2, `destination frames show (${await g(() => marks.length)})`);
await page.screenshot({ path: `${OUT}/3-chosen.png` });
await page.mouse.click(...await pilePt({ a: 'tab', i: 3 }));
ok(await g(() => sel) === 6, 'wrong target keeps the card chosen');
console.log('     message: ' + await g(() => document.getElementById('msg').textContent));
await page.keyboard.press('Escape');
ok(await g(() => sel) === null, 'Escape drops the choice');
await page.waitForTimeout(600);
await page.mouse.click(...await cardPt(6));
await page.mouse.click(...await pilePt({ a: 'tab', i: 2 }));
await page.waitForTimeout(300);
ok(await g(() => S.moves) === 4 && await g(() => S.tab[2].length) === 2, 'second click moves the card');
await g(`S = JSON.parse(${JSON.stringify(real)}); undo.pop(); render({ instant: true }); save();`);
await page.waitForTimeout(700);

// 3. Shaky stock click (10 px drift)
const w0 = await g(() => S.waste.length + S.stock.length * 1000);
const sp = await g(() => [bankX(0) + L.w / 2, L.top + L.h / 2]).then(at);
await page.mouse.move(...sp); await page.mouse.down(); await page.mouse.move(sp[0] + 7, sp[1] + 7, { steps: 4 }); await page.mouse.up();
await page.waitForTimeout(300);
ok(await g(() => S.waste.length + S.stock.length * 1000) !== w0, 'stock click with 10 px drift still draws');

// 4. Drag
await page.waitForTimeout(1200);
m = await findMove();
const moves1 = await g(() => S.moves);
const from = await cardPt(m.id), to = await pilePt(m.d);
await page.mouse.move(...from); await page.mouse.down(); await page.mouse.move(...to, { steps: 12 });
ok(await g(() => marks.some(x => x.classList.contains('over'))), 'drop target lights up during drag');
await page.mouse.up(); await page.waitForTimeout(300);
ok(await g(() => S.moves) === moves1 + 1, 'drag and drop moves the card');

// 5. Hint, then follow it with one click
await page.waitForTimeout(1500);
await page.click('#hintBtn');
const hint = await g(() => ({ sel, hintDst, hintStock, msg: document.getElementById('msg').textContent }));
console.log('     hint: ' + hint.msg);
ok(hint.msg.length > 10 && (hint.sel !== null || hint.hintStock), 'hint shows a sentence and a target');
await page.screenshot({ path: `${OUT}/4-hint.png` });
const moves2 = await g(() => S.moves);
if (hint.hintStock) await page.mouse.click(...sp); else await page.mouse.click(...await pilePt(hint.hintDst));
await page.waitForTimeout(300);
ok(await g(() => S.moves) === moves2 + 1, 'one click on the yellow place follows the hint');

// 6. Undo
await page.click('#undoBtn'); await page.waitForTimeout(200);
ok(await g(() => S.moves) === moves2, 'Annuler goes back one move');
ok(await g(() => document.getElementById('msg').textContent) === 'Coup annulé.', 'undo says so');
await page.keyboard.press('Control+z'); await page.waitForTimeout(200);
ok(await g(() => S.moves) < moves2, 'Ctrl+Z goes back one more move');
// A hint is also followed by a click on the ringed card.
await page.click('#hintBtn');
const h2 = await g(() => ({ sel, hintStock, moves: S.moves }));
if (h2.sel !== null) {
  await page.mouse.click(...await cardPt(h2.sel)); await page.waitForTimeout(300);
  ok(await g(() => S.moves) === h2.moves + 1, 'a click on the ringed card follows the hint');
} else { console.log('SKIP hint points at the stock'); await page.keyboard.press('Escape'); }

// 7. Columns never move
ok(JSON.stringify(await g(() => [0, 1, 2, 3, 4, 5, 6].map(colX))) === JSON.stringify(colsBefore), 'columns stayed at the same x');

// 8. Long column: 2 face-down + 11 face-up
await g(() => {
  const all = [...Array(52).keys()];
  const run = [12, 11 + 13 * 1, 10, 9 + 13, 8, 7 + 13, 6, 5 + 13, 4, 3 + 13, 2]; // R♠ D♥ V♠ 10♥ ... 3♠
  const rest = all.filter(i => !run.includes(i));
  S = { stock: [], waste: [], found: [[], [], [], []], tab: [[], [], [], [], [], [], []], moves: 1, won: false, stuckShown: true, lostShown: true };
  S.tab[3] = [{ id: rest.pop(), up: false }, { id: rest.pop(), up: false }, ...run.map(id => ({ id, up: true }))];
  rest.forEach((id, n) => S.tab[n % 7 === 3 ? 0 : n % 7].push({ id, up: true }));
  render({ instant: true });
});
await page.waitForTimeout(300);
const strip = await g(() => { const ys = colY(S.tab[3]); return ys[ys.length - 1] - ys[ys.length - 2]; });
// Squeezed, a covered card still shows its whole rank.
ok(strip >= 21, `face-up strip in a long column is ${Math.round(strip)}px`);
// The longest usual column, six face-down and seven face-up cards, still fits in the table.
const bottom = await g(() => {
  const col = [...Array(6).keys()].map(id => ({ id, up: false })).concat([...Array(7).keys()].map(i => ({ id: 20 + i, up: true })));
  return last(colY(col)) + L.h - L.H;
});
ok(bottom <= 0, `a column of 6 face-down and 7 face-up cards fits (${Math.round(bottom)}px past the table)`);
ok(JSON.stringify(await g(() => [0, 1, 2, 3, 4, 5, 6].map(colX))) === JSON.stringify(colsBefore), 'long column does not move the board');
await page.screenshot({ path: `${OUT}/5-long-column.png` });

// 9. New game dialog focuses "Continuer la partie"
await page.click('#newBtn');
ok(await g(() => document.activeElement.textContent) === 'Continuer la partie', 'restart dialog focuses Continuer la partie');
await page.keyboard.press('Escape');
ok(!(await g(() => dialogOpen())), 'Escape closes the dialog');

// 9b. An ace taken back from the foundation onto a 2 stays there: auto-play leaves it alone.
await g(() => {
  S = { stock: [{ id: 5, up: false }], waste: [], found: [[], [], [], [{ id: 39, up: true }]],
    tab: [[{ id: 0, up: false }, { id: 27, up: true }], [{ id: 12, up: true }], [], [], [], [], []], moves: 5, won: false, stuckShown: false };
  // Every card not placed goes to the stock, so no card of an older position stays on the table.
  S.stock = [...Array(52).keys()].filter(id => ![S.waste, ...S.found, ...S.tab].flat().some(c => c.id === id)).map(id => ({ id, up: false }));
  render({ instant: true });
  moveCards({ a: 'found', i: 3, k: 0 }, { a: 'tab', i: 0 });
});
await page.waitForTimeout(1500);
ok(await g(() => last(S.tab[0]).id === 39 && !S.found[3].length), 'an ace taken back onto a 2 stays there');
await g(() => { clearTimeout(autoT); if (dialogOpen()) Kit.closeDialog(); }); // this made-up deal cannot be won

// 9c. Dragging a card that has nowhere to go does not choose it: the game says so instead.
await g(() => {
  S = { stock: [{ id: 5, up: false }], waste: [], found: [[], [], [], []],
    tab: [[{ id: 7, up: false }, { id: 2, up: true }, { id: 27, up: true }], [{ id: 10, up: true }], [], [], [], [], []],
    moves: 5, won: false, stuckShown: true, lostShown: true };
  clearSel(); // an earlier step left a card chosen
  // Every card not placed goes to the stock, so no card of an older position stays on the table.
  S.stock = [...Array(52).keys()].filter(id => ![S.waste, ...S.found, ...S.tab].flat().some(c => c.id === id)).map(id => ({ id, up: false }));
  render({ instant: true });
});
await page.waitForTimeout(700); // the cards slide to their new places first
const box = await g(() => { const r = E[2].getBoundingClientRect(); return [r.left + r.width / 2, r.top + 12]; });
await page.mouse.move(...box); await page.mouse.down();
await page.mouse.move(box[0] + 60, box[1] + 60, { steps: 5 }); await page.mouse.up();
const dragged = await g(() => [sel, document.getElementById('msg').textContent]);
ok(dragged[0] === null && dragged[1].includes('nulle part'), 'a card with nowhere to go does not drag ' + JSON.stringify(dragged));
await page.waitForTimeout(600);

// 10. Win
await g(() => {
  S = { stock: [], waste: [], found: [0, 1, 2, 3].map(s => [...Array(12).keys()].map(r => ({ id: s * 13 + r, up: true }))), tab: [[{ id: 12, up: true }], [{ id: 25, up: true }], [{ id: 38, up: true }], [{ id: 51, up: true }], [], [], []], moves: 5, won: false, stuckShown: false };
  render({ instant: true }); autoStep();
});
await page.waitForTimeout(3500);
ok(await g(() => dialogOpen() && document.getElementById('overTitle').textContent.includes('Bravo')), 'win dialog shows');
await page.screenshot({ path: `${OUT}/6-win.png` });

// 10b. Fixes from the review. A position: f = foundation heights, cols = 'down ids / up ids', the other cards in the stock.
const deal = (f, cols, waste = []) => g(`(() => { clearTimeout(autoT); Kit.closeDialog(); clearSel(); plan = null; undo = [];
  const found = ${JSON.stringify(f)}.map((n, s) => [...Array(n).keys()].map(r => ({ id: s * 13 + r, up: true })));
  const tab = ${JSON.stringify(cols)}.map(c => { const [d, u] = (c.includes('/') ? c : c + '/').split('/').map(x => x === '–' || !x ? [] : x.split(',').map(Number));
    return d.map(id => ({ id, up: false })).concat(u.map(id => ({ id, up: true }))); });
  const waste = ${JSON.stringify(waste)}.map(id => ({ id, up: true }));
  const used = new Set([...found, ...tab, waste].flat().map(c => c.id));
  S = { stock: [...Array(52).keys()].filter(id => !used.has(id)).map(id => ({ id, up: false })), waste, found, tab,
    moves: 3, won: false, stuckShown: false, lostShown: true };
  render({ instant: true }); })()`);
// "No move left" is not said while the jack of diamonds can go on the queen of spades.
await deal([2, 0, 1, 0], ['–/25,50,36', '2/40', '31,20/47,33,6', '48,18,17/37', '21,13,49,39/43,16,41,14', '35,27,19,9,30/7,32,5', '10,28,23,15/11']);
await g(() => checkStuck());
ok(!(await g(() => dialogOpen())), 'no "Plus aucun coup possible" while a move exists');
// A search that runs out of time does not suggest the jack of diamonds onto the queen of clubs, which loses.
await deal([0, 0, 5, 1], ['–/3', '16/23', '44/8', '41/19,5,17,42', '0,15,4,38/2', '31,11,21,34/36', '9,22,40,48,13/50']);
await g(() => showHint());
ok(await g(() => sel !== 36), 'an unfinished search does not guess a move: ' + await g(() => document.getElementById('msg').textContent));
// The finish also turns the stock: the queen of spades under the king in the waste still goes home.
const won0 = await g(() => stats.won);
await g(() => { clearTimeout(autoT); Kit.closeDialog(); clearSel(); undo = [];
  S = { stock: [], waste: [{ id: 11, up: true }, { id: 12, up: true }], tab: [[], [], [], [], [], [], []],
    found: [0, 1, 2, 3].map(s => [...Array(s ? 13 : 11).keys()].map(r => ({ id: s * 13 + r, up: true }))), moves: 3, won: false, stuckShown: false, lostShown: true };
  render({ instant: true }); autoStep(); });
await page.waitForTimeout(2500);
ok(await g(() => isWon()), 'the finish turns the stock to reach the last cards');
// The win counts when the last card is home, before the celebration: an undo right after does not lose it.
ok(await g(() => stats.won) === won0 + 1, 'the win is counted once');
await g(() => { clearTimeout(winT); Kit.closeDialog(); });
// A king at the bottom of a column can go to an empty column.
await deal([0, 0, 0, 0], ['–/12', '–/25', '–', '–', '–', '–', '–']);
ok(await g(() => destinations({ a: 'tab', i: 0, k: 0 }).some(d => d.a === 'tab')), 'a king at the bottom of a column may go to an empty column');
// Going back with no undo steps, as after a restore from the backup, says so and offers a new game.
await g(() => { undo = []; backToWinnable(); });
ok(await g(() => dialogOpen() && document.getElementById('overTitle').textContent.startsWith('Impossible')), 'going back with no undo steps says so');
await page.keyboard.press('Escape');
// Undo forgets the last click: a click on the restored card right after an undo is not taken for a double-click.
await g(() => { lastTap = { t: performance.now(), x: 0, y: 0 }; undo = [JSON.stringify(S)]; doUndo(); });
ok(await g(() => lastTap === null), 'undo forgets the last click');

// 11. Big screen
const big = await browser.newPage({ viewport: { width: 1920, height: 1000 } });
big.on('pageerror', e => errors.push(e.message));
await big.goto(URL); await big.waitForTimeout(2200); await big.keyboard.press("Escape");
await big.getByRole('button', { name: 'Facile', exact: true }).click();
console.log('     1920x1000 card: ' + JSON.stringify(await big.evaluate(() => [L.w, L.h])));
await big.screenshot({ path: `${OUT}/7-start-1920x1000.png` });

// 12. A save from before the library shows its wins on the library tile.
const old = await browser.newPage({ viewport: { width: 1366, height: 680 } });
old.on('pageerror', e => errors.push(e.message));
await old.goto(URL); await old.click("#helpClose");
await old.getByRole('button', { name: 'Facile', exact: true }).click();
await old.evaluate(() => {
  const st = JSON.parse(JSON.stringify(S)); st.moves = 4;
  localStorage.clear();
  localStorage.setItem('solitaire-grand-pere-v2', JSON.stringify({ S: st, undo: [], stats: { won: 3 } }));
});
await old.reload(); await old.waitForTimeout(800);
ok(((await old.evaluate(() => GG.meta('solitaire'))) || {}).summary === 'Partie en cours · 3 victoires', 'an old save shows its wins on the library tile');

ok(errors.length === 0, 'no page errors ' + errors.join(' | '));
await browser.close();
console.log(fails ? `${fails} FAILED` : 'ALL PASSED');
process.exit(fails ? 1 : 0);
