// Plays the dominos with a real mouse: the first visit, the rules guide, a domino that fits one end, a
// domino that fits both ends and its two yellow places, refusals, the pioche, a pass, the computer players,
// the hint, undo, a double-click, saves across a reload (also during the computer players' turn), the end of
// a manche and its sheet, the end of the game, broken saves, the marks of Facile, the arrows of the way of
// play, and the size of the line at every window size of docs/design.md, with a long line.
import { launch, gameUrl, OUT } from './harness.mjs';
const browser = await launch();
let fails = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const URL = gameUrl('dominos');

const page = await browser.newPage({ viewport: { width: 1366, height: 680 }, reducedMotion: 'reduce' });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
const g = (fn, arg) => page.evaluate(fn, arg);
const wait = ms => page.waitForTimeout(ms);
const msg = () => g(() => document.getElementById('msg').textContent.replace(/\u00a0/g, ' '));
const tile = (a, b) => page.locator(`#hand .dom[data-t="${[0, 1, 2, 3, 4, 5, 6].flatMap(x => [0, 1, 2, 3, 4, 5, 6].filter(y => y >= x).map(y => [x, y])).findIndex(([x, y]) => x === Math.min(a, b) && y === Math.max(a, b))}"]`);
// A click, then the mouse moves away and waits, so the next click on the same thing is not a double-click.
const click = async (loc, opts) => { await loc.click(opts); await page.mouse.move(5, 5); await wait(520); };
const myTurn = () => page.waitForFunction(() => !showing && (G.turn === 0 || !!G.end), null, { timeout: 20000 });

// A game in progress on the page: the three hands, the line, the top of the pioche (drawn first last);
// every other tile goes under the pioche, or to player 2 with stock null.
async function setGame(hands, line, { stock = [], turn = 0, scores = [0, 0, 0], level = 'facile' } = {}) {
  await g(({ hands, line, stock, turn, scores, level: lv }) => {
    const id = ([a, b]) => Dominos.TILES.findIndex(([x, y]) => x === Math.min(a, b) && y === Math.max(a, b));
    const hs = hands.map(h => h.map(id)), ln = line.map(([a, b]) => ({ t: id([a, b]), l: a, r: b })), st = (stock || []).map(id);
    const used = new Set([...hs.flat(), ...ln.map(x => x.t), ...st]);
    const rest = Dominos.TILES.map((x, i) => i).filter(t => !used.has(t));
    if (stock === null) hs[2].push(...rest);
    calm();
    G = view = { ...Dominos.newGame(lv, 7), hands: hs, line: ln, first: 0, stock: stock === null ? [] : [...rest, ...st], opening: null, turn, scores, voids: [[], [], []], last: null, end: null, result: null };
    level = G.level; Kit.showLevel(level);
    if (!Dominos.valid(G)) throw new Error('bad test game');
    undo = []; pick = null; hint = null; lineU = Infinity; Kit.closeDialog();
    save(); render(); Kit.say(turnText());
  }, { hands, line, stock, turn, scores, level });
}

// 1. The first visit: a game starts at Facile at once, with no dialog, and the coach shows the way.
await page.goto(URL);
await wait(500);
ok(await g(() => !Kit.isOpen() && G.level === 'facile' && G.manche === 1 && !G.line.length && G.hands.every(h => h.length === 7) && G.stock.length === 7),
  'the first visit deals a game at Facile, seven dominoes each and seven in the pioche, with no dialog');
ok(/Vous jouez contre/.test(await msg()), 'the line names the two other players: ' + await msg());
await wait(1800);
await page.waitForFunction(() => G.turn === 0 && !showing, null, { timeout: 20000 });
ok(await g(() => Kit.coaching() && !!document.querySelector('.coach')), 'the coach rings the next thing to click');
ok(await g(() => document.getElementById('undoBtn').dataset.why.length > 10), 'the grey undo button says why');

// 2. The rules guide: five pages that fit, at his laptop size.
await page.click('#helpBtn');
for (let n = 0; n < 5; n++) {
  ok(await g(() => { const t = document.getElementById('helpText'); return t.scrollHeight <= t.clientHeight + 1; }), `rules page ${n + 1} fits without scrolling`);
  await page.screenshot({ path: `${OUT}/dominos-rules-${n + 1}.png` });
  if (n < 4) await page.click('#helpNext');
}
await page.click('#helpClose');
ok(await g(() => !Kit.isOpen()), 'the rules close back to the game');

// 3. One end: a click lays it. No end: a refusal that says why. The computer players then play.
await setGame([[[6, 2], [6, 4], [3, 3], [5, 0]], [[1, 0], [2, 2], [5, 5]], [[0, 0]]], [[4, 1], [1, 6]]);
ok(await page.locator('#hand .dom.can').count() === 2, 'at Facile, the two dominoes that fit are framed before any click');
await click(tile(3, 3));
ok(/Le double trois ne se pose pas : les bouts montrent le 4 et le 6\. Cliquez sur un domino encadré\./.test(await msg()), 'a domino that fits nowhere is refused, with the reason: ' + await msg());
ok(await g(() => G.line.length === 2), 'nothing is laid');
await tile(6, 2).click();
ok(await g(() => G.turn === 1 && document.querySelector('#way path.on') === document.querySelectorAll('#way path')[0]), 'the arrow to the player on his right lights up');
ok(await g(() => G.line.length >= 3 && G.line[2].l === 6 && G.line[2].r === 2 && G.hands[0].length === 3), 'a domino that fits one end goes there with one click');
await page.mouse.move(5, 5); await wait(100);
// The others play fast without motion: the click and the line are read in one go.
const during = await g(() => { document.querySelector('#hand .dom').click(); return showing + ' ' + document.getElementById('msg').textContent.replace(/\u00a0/g, ' '); });
ok(/^true Attendez : c'est à .* de jouer\./.test(during), 'a click during the others\' turn says who plays: ' + during);
await myTurn();
ok(await g(() => G.turn === 0 && G.last && G.last.p === 2), 'the two computer players played their turn');
ok(await g(() => document.querySelectorAll('#way path.on').length === 1 && document.querySelector('#way path.on') === document.querySelectorAll('#way path')[2]), 'then the arrow back to him lights up');
await page.screenshot({ path: `${OUT}/dominos-after.png` });

// 4. Both ends: the two places are framed, he clicks one. A double-click on a domino counts once.
await setGame([[[6, 4], [3, 3], [5, 0]], [[1, 0], [2, 2], [5, 5]], [[0, 0]]], [[4, 1], [1, 6]]);
await tile(6, 4).dblclick();
await page.mouse.move(5, 5); await wait(520);
ok(await g(() => pick !== null && G.line.length === 2), 'a domino that fits both ends is chosen, and a double-click counts as one click');
ok(await page.locator('#line .ghost.on').count() === 2 && /se pose aux deux bouts/.test(await msg()), 'the two ends are framed in yellow: ' + await msg());
ok(await g(() => document.getElementById('hintBtn').dataset.auto === 'no'), 'the automatic hint waits while he chooses');
await page.screenshot({ path: `${OUT}/dominos-two-ends.png` });
await click(page.locator('#ghostL'));
ok(await g(() => G.line.length === 3 && G.line[0].l === 6 && G.line[0].r === 4 && pick === null), 'a click on the left place lays it there, the 4 on the 4');
await myTurn();
// Undo takes back his domino and what the others did.
const before = await g(() => JSON.stringify(JSON.parse(undo[undo.length - 1]).line));
await click(page.locator('#undoBtn'));
ok(await g(b => JSON.stringify(G.line) === b && G.hands[0].length === 3 && G.turn === 0, before), 'undo takes back his domino and the others\' turn');
ok(/Coup annulé/.test(await msg()), 'undo says so');

// 5. The pioche: nothing fits, he draws until one fits.
await setGame([[[3, 3], [5, 0]], [[1, 0], [2, 2], [5, 5]], [[0, 0]]], [[4, 1], [1, 6]], { stock: [[6, 5], [2, 0]] });
ok(await page.locator('#hand .dom.can').count() === 0 && await g(() => !document.getElementById('drawBtn').disabled && document.getElementById('drawBtn').hasAttribute('data-nudge')),
  'nothing fits: « Piocher » is the next step');
ok(/Aucun domino ne se pose, les bouts montrent le 4 et le 6 : cliquez sur « Piocher »\./.test(await msg()), 'the line says to draw: ' + await msg());
await click(page.locator('#drawBtn'));
ok(await g(() => G.hands[0].length === 3 && G.turn === 0) && /Vous piochez le deux-blanc : il ne se pose pas\. Cliquez encore sur « Piocher »\./.test(await msg()), 'a domino that does not fit: draw again: ' + await msg());
await click(page.locator('#drawBtn'));
ok(/Vous piochez le six-cinq : il se pose\. Cliquez dessus\./.test(await msg()) && await page.locator('#hand .dom.can').count() === 1, 'the six-cinq fits, framed: ' + await msg());
ok(await g(() => document.getElementById('drawBtn').disabled), '« Piocher » is grey once a domino fits');
await click(page.locator('#drawBtn'), { force: true });
ok(/Un de vos dominos se pose/.test(await msg()), 'a click on the grey key says why: ' + await msg());
await click(tile(6, 5));
ok(await g(() => G.line.some(x => x.t === Dominos.TILES.findIndex(([a, b]) => a === 5 && b === 6))), 'the drawn domino is laid');
await myTurn();

// 6. The pioche empty and nothing fits: « Passer mon tour ».
await setGame([[[3, 3], [5, 0]], [[1, 0], [2, 2]], []], [[4, 1], [1, 6]], { stock: null });
ok(await page.locator('#drawBtn').textContent() === 'Passer mon tour', 'the key says « Passer mon tour » when the pioche is empty');
await click(page.locator('#drawBtn'));
ok(await g(() => G.last && (G.last.p !== 0 || G.last.kind === 'pass') && G.hands[0].length === 2), 'he passes');
await page.waitForFunction(() => (G.turn === 0 && !showing) || !!G.end, null, { timeout: 20000 });

// 7. The hint: it rings the domino to lay.
await setGame([[[6, 2], [3, 3], [5, 0]], [[1, 0], [2, 2], [5, 5]], [[0, 0]]], [[4, 1], [1, 6]]);
await click(page.locator('#hintBtn'));
ok(await page.locator('#hand .dom.hint').count() === 1 && /Posez le six-deux : cliquez sur le domino entouré\./.test(await msg()), 'the hint rings the six-deux: ' + await msg());

// 8. At Moyen, no marks: he finds the dominoes himself.
await setGame([[[6, 2], [3, 3], [5, 0]], [[1, 0], [2, 2], [5, 5]], [[0, 0]]], [[4, 1], [1, 6]], { level: 'moyen' });
ok(await page.locator('#hand .dom.can').count() === 0 && /cliquez sur un domino à poser/.test(await msg()), 'at Moyen the dominoes carry no mark');
await setGame([[[6, 2], [3, 3], [5, 0]], [[1, 0], [2, 2], [5, 5]], [[0, 0]]], [[4, 1], [1, 6]]);

// 9. A reload keeps the game; a reload during the others' turn plays the same turn.
const saved = await g(() => JSON.stringify(G));
await page.reload(); await wait(400);
ok(await g(s => JSON.stringify(G) === s, saved), 'a reload brings back the same game');
await click(tile(6, 2));
ok(await g(() => showing), 'the others are playing');
const expect = await g(() => { let x = G; while (x.turn !== 0 && !x.end) { const s = Dominos.computerTurn(x); x = s[s.length - 1].G; } return JSON.stringify(x.line); });
await page.reload();
await myTurn();
ok(await g(e => JSON.stringify(G.line) === e, expect), 'a reload during their turn plays the same turn again');

// 10. The end of a manche: his last domino. The sheet on the table, then « Manche suivante ».
await setGame([[[6, 2]], [[1, 0], [5, 5]], [[0, 0]]], [[4, 1], [1, 6]]);
await click(tile(6, 2));
await page.waitForFunction(() => !document.getElementById('sheet').hidden && /Domino/.test(document.getElementById('msg').textContent), null, { timeout: 5000 });
const pts = await g(() => G.end.points);
ok(await g(() => G.end.winner === 0 && G.scores[0] === G.end.points && /Domino ! Vous avez posé tous vos dominos : vous marquez/.test(document.getElementById('msg').textContent.replace(/\u00a0/g, ' '))), `« Domino ! », he marks ${pts} points`);
ok(await g(() => document.getElementById('nextBtn').hasAttribute('data-nudge') && document.getElementById('hintBtn').disabled), '« Manche suivante » is the next step');
const sheetFits = () => g(() => { const r = document.getElementById('sheet').getBoundingClientRect(), b = document.getElementById('nextBtn') || document.getElementById('againBtn');
  const br = b.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight && br.bottom <= r.bottom + 1 && br.height >= 44; });
ok(await sheetFits(), 'the sheet and its button fit the window');
await page.screenshot({ path: `${OUT}/dominos-sheet.png` });
await click(page.locator('#nextBtn'));
ok(await g(() => G.manche === 2 && G.scores[0] > 0 && G.hands.flat().length + G.stock.length + G.line.length === 28 && G.line.length <= 3 && document.getElementById('sheet').hidden), 'the next manche is dealt');
await page.waitForFunction(() => G.turn === 0 && !showing, null, { timeout: 20000 });

// 11. The end of the game: he passes 100 points.
await setGame([[[6, 2]], [[1, 0], [5, 5]], [[0, 0]]], [[4, 1], [1, 6]], { scores: [95, 40, 20] });
await click(tile(6, 2));
await page.waitForFunction(() => document.getElementById('over').classList.contains('on'), null, { timeout: 8000 });
ok(await g(() => G.result === 'won' && stats.won === 1 && GG.meta('dominos').summary === '1 victoire'), 'the win is counted once and the tile says so');
ok((await page.locator('#overTitle').textContent()).replace(/\u00a0/g, ' ') === 'Bravo, vous avez gagné !', 'the win says bravo');
ok(await g(() => document.getElementById('newBtn').hasAttribute('data-nudge')), '« Nouvelle partie » is the next step');
await page.screenshot({ path: `${OUT}/dominos-won.png` });
await page.keyboard.press('Escape');
await click(page.locator('#undoBtn'));
await click(tile(6, 2));
await page.waitForFunction(() => !!G.result, null, { timeout: 8000 });
ok(await g(() => stats.won === 1), 'winning again after an undo counts no second win');
await page.keyboard.press('Escape');

// 12. Broken saves.
await g(() => { const v = GG.load('dominos'); v.G.hands[0].push(v.G.hands[1][0]); localStorage.setItem('gg:save:dominos', JSON.stringify({ updatedAt: Date.now(), data: v })); });
await page.reload(); await wait(400);
ok(await g(() => !Kit.isOpen() && G.manche === 1 && G.level === 'facile' && Dominos.valid(G)), 'a save with a domino twice starts a new game');
await g(() => { const v = GG.load('dominos'); delete v.G.level; localStorage.setItem('gg:save:dominos', JSON.stringify({ updatedAt: Date.now(), data: v })); });
await page.reload(); await wait(400);
ok(await g(() => G.level === 'facile' && level === 'facile'), 'a save without a level loads at Facile');

// 13. He opens the manche at once: with seed 0 he holds the double six. The opening must not wait for the
// names to leave the message line, and no late call may name a domino already played.
await g(() => { crypto.getRandomValues = a => { a[0] = 0; return a; }; });
await g(() => newGame('facile'));
ok(await g(() => G.turn === 0 && !G.line.length && G.opening === Dominos.TILES.length - 1), 'with seed 0 he starts with the double six');
ok(/Vous jouez contre .*\n.*double six/.test(await msg()), 'the line names the players, then says to lay the double six: ' + await msg());
await click(page.locator(`#hand .dom[data-t="${27}"]`));
await wait(1800);
await myTurn();
ok(await g(() => G.line.some(x => x.t === 27) && G.line.length >= 2 && !showing), 'he lays it within 1.6 s, and the others play after it');
ok(!errors.length, 'no error from a late opening call' + (errors.length ? ': ' + errors.join(' | ') : ''));

// 14. A memory that is full or blocked never stops the game: the move, the others' turn, a pass and the
// next manche all go on, and the line says the game could not be saved.
await page.reload(); await wait(400);
await g(() => { Storage.prototype.setItem = function () { throw new DOMException('full', 'QuotaExceededError'); }; });
await setGame([[[6, 2], [3, 3], [5, 0]], [[1, 0], [2, 2], [5, 5]], [[0, 0]]], [[4, 1], [1, 6]]);
await click(tile(6, 2));
await myTurn();
ok(await g(() => G.line.length >= 3 && G.last && G.last.p !== 0), 'with no room to save, his move still hands over to the others, who play');
ok(/n'a pas pu être enregistrée.*Le jeu continue/s.test(await msg()), 'the line says the game could not be saved, and goes on: ' + await msg());
await setGame([[[3, 3], [5, 0]], [[1, 0], [2, 2]], []], [[4, 1], [1, 6]], { stock: null });
await click(page.locator('#drawBtn'));
await page.waitForFunction(() => !showing && (G.turn === 0 || !!G.end), null, { timeout: 20000 });
ok(await g(() => G.last && G.last.p !== 0 || !!G.end), 'a pass with no room to save still lets the others play');
await setGame([[[6, 2]], [[1, 0], [5, 5]], [[0, 0]]], [[4, 1], [1, 6]]);
await click(tile(6, 2));
await page.waitForFunction(() => !document.getElementById('sheet').hidden, null, { timeout: 5000 });
await click(page.locator('#nextBtn'));
await page.waitForFunction(() => G.manche === 2 && !showing && G.turn === 0 && G.line.length > 0 || (G.manche === 2 && G.turn === 0 && !showing), null, { timeout: 20000 });
ok(await g(() => G.manche === 2 && G.hands.flat().length + G.stock.length + G.line.length === 28), 'with no room to save, the next manche is dealt and the others open it');
ok(!errors.length, 'no page error with the memory full' + (errors.length ? ': ' + errors.join(' | ') : ''));

// 15. A window that is behind (another window saved a newer game) stops: the kit asks to reload, and the
// others never start their turn there, after a domino or after a pass. Only a full or blocked memory lets
// the game go on.
await page.reload(); await wait(400);
const other = await page.context().newPage();
other.on('pageerror', e => errors.push(e.message));
const behind = async (setup, act, what) => {
  await setup();
  await other.goto(URL); await other.waitForTimeout(400);
  await setGame([[[6, 2], [3, 3], [5, 0]], [[1, 0], [2, 2], [5, 5]], [[0, 0]]], [[4, 1], [1, 6]]);
  await g(() => GG.flush());
  await act();
  await other.waitForTimeout(2500);
  const r = await other.evaluate(() => ({ asked: document.getElementById('overTitle').textContent === 'Le jeu a changé ailleurs' && Kit.isOpen(),
    still: !showing && G.turn !== 0 && G.last && G.last.p === 0 }));
  ok(r.asked && r.still, `${what} in a window that is behind: it asks to reload and the others do not play`);
};
await behind(() => setGame([[[6, 2], [3, 3], [5, 0]], [[1, 0], [2, 2], [5, 5]], [[0, 0]]], [[4, 1], [1, 6]]),
  async () => { await other.locator(`#hand .dom[data-t="${await other.evaluate(() => Dominos.TILES.findIndex(([x, y]) => x === 2 && y === 6))}"]`).click(); }, 'a domino');
await behind(() => setGame([[[3, 3], [5, 0]], [[1, 0], [2, 2]], []], [[4, 1], [1, 6]], { stock: null }),
  () => other.locator('#drawBtn').click(), 'a pass');
await other.close();

// 16. The sizes. A long line of 23 dominoes and a full hand, at every window of docs/design.md.
const LONG = [[0, 0], [0, 1], [1, 1], [1, 2], [2, 2], [2, 3], [3, 3], [3, 4], [4, 4], [4, 5], [5, 5], [5, 6], [6, 6], [6, 0], [0, 2], [2, 4], [4, 6], [6, 1], [1, 3], [3, 5], [5, 0], [0, 3], [3, 6]];
const longLine = async p => p.evaluate(LONG => {
  const id = ([a, b]) => Dominos.TILES.findIndex(([x, y]) => x === Math.min(a, b) && y === Math.max(a, b));
  const line = LONG.map(([a, b]) => ({ t: id([a, b]), l: a, r: b }));
  const used = new Set(line.map(x => x.t)), rest = Dominos.TILES.map((x, i) => i).filter(t => !used.has(t));
  calm();
  G = view = { ...Dominos.newGame('facile', 3), hands: [rest.slice(0, 2), rest.slice(2, 4), rest.slice(4)], stock: [], line, first: 8, opening: null, turn: 0, voids: [[], [], []], last: null, end: null, result: null };
  lineU = Infinity; render();
}, LONG);
const measure = p => p.evaluate(() => {
  const box = document.getElementById('line').getBoundingClientRect(), mat = document.getElementById('mat').getBoundingClientRect();
  const tiles = [...document.querySelectorAll('#line .lt')].map(e => e.getBoundingClientRect());
  let overlap = 0;
  for (let a = 0; a < tiles.length; a++) for (let b = a + 1; b < tiles.length; b++) {
    const A = tiles[a], B = tiles[b];
    if (Math.min(A.right, B.right) - Math.max(A.left, B.left) > 1 && Math.min(A.bottom, B.bottom) - Math.max(A.top, B.top) > 1) overlap++;
  }
  const inside = tiles.every(r => r.left >= box.left - 1 && r.right <= box.right + 1 && r.top >= box.top - 1 && r.bottom <= box.bottom + 1);
  const hand = [...document.querySelectorAll('#hand .dom')].map(e => e.getBoundingClientRect());
  const z = window.Zoom ? Zoom.z() : 1;
  const unit = Math.min(...tiles.map(r => Math.min(r.width, r.height))) / z;
  const handIn = hand.every(r => r.left >= 0 && r.right <= innerWidth && r.top >= mat.bottom - 2);
  const scroll = document.getElementById('table').scrollHeight > document.getElementById('table').clientHeight + 1;
  const btns = [...document.querySelectorAll('#drawBtn, #bar button')].filter(b => b.offsetParent).every(b => b.getBoundingClientRect().height / z >= 44);
  const small = [...document.querySelectorAll('.seat b, .seat .pts, #count, #plaque, #drawBtn')].filter(e => e.offsetParent && getComputedStyle(e).display !== 'none')
    .map(e => parseFloat(getComputedStyle(e).fontSize)).filter(f => f < (innerWidth < 700 ? 13 : 20));
  return { n: tiles.length, overlap, inside, matIn: mat.left >= 0 && mat.right <= innerWidth + 1 && mat.bottom <= innerHeight + 1, unit: Math.round(unit), handIn, scroll, btns, small: small.length,
    wide: document.scrollingElement.scrollWidth <= innerWidth };
});
const sizes = [[1366, 680, 1], [1093, 530, 1], [1920, 1000, 1], [1280, 620, 1], [1366, 680, 1.3], [1920, 1000, 1.75], [390, 760, 1]];
for (const [w, h, z] of sizes) {
  const phone = w < 700;
  const p = await browser.newPage({ viewport: { width: w, height: h }, reducedMotion: 'reduce', ...(phone ? { isMobile: true, hasTouch: true } : {}) });
  await p.addInitScript(z => localStorage.setItem('gg:size', String(z)), z);
  await p.goto(URL); await p.waitForTimeout(400);
  await longLine(p); await p.waitForTimeout(200);
  const m = await measure(p);
  const label = `${w}x${h}${z !== 1 ? ' at ' + z * 100 + ' %' : ''}`;
  ok(m.n === 23 && !m.overlap && m.inside && m.matIn && m.wide, `${label}: the 23 dominoes of the line stay on the mat, inside the window, without overlap`);
  ok(m.unit >= (phone ? 12 : 22), `${label}: the dominoes of the line are ${m.unit * 2} by ${m.unit} px`);
  ok(m.handIn && m.btns && !m.small, `${label}: his dominoes fit, the keys are 44 px or more and the text keeps its size`);
  if (!phone) ok(!m.scroll, `${label}: nothing scrolls`);
  // The longest messages fit the message line, on two lines at most.
  const long = await p.evaluate(() => [
    'Marcel pose le six-quatre.\nAucun domino ne se pose, les bouts montrent le 4 et le 6 : cliquez sur « Piocher ».',
    'Vous piochez le quatre-blanc : il ne se pose pas, et la pioche est vide. Cliquez sur « Passer mon tour ».',
    'Le quatre-blanc ne se pose pas : les bouts montrent le 5 et le 6. Aucun ne se pose : cliquez sur « Passer mon tour ».',
    'Domino ! Colette a posé tous ses dominos et marque 37 points. Cliquez sur « Manche suivante ».',
  ].every(t => { say(t); const m = document.getElementById('msg'); return m.scrollWidth <= m.clientWidth + 1 && m.scrollHeight <= m.clientHeight + 1 && m.getBoundingClientRect().right <= innerWidth; }));
  ok(long, `${label}: the longest messages fit the message line`);
  await p.screenshot({ path: `${OUT}/dominos-${w}x${h}${z !== 1 ? '-' + z : ''}.png` });
  // The sheet of a manche fits too.
  await p.evaluate(() => { G = view = { ...G, end: { winner: 1, blocked: false, pips: [12, 0, 25], points: 37 }, scores: [12, 37, 0] }; render(); });
  const sheet = await p.evaluate(() => { const r = document.getElementById('sheet').getBoundingClientRect(), b = document.getElementById('nextBtn').getBoundingClientRect();
    return !document.getElementById('sheet').hidden && r.top >= 0 && r.bottom <= innerHeight + 1 && r.left >= 0 && r.right <= innerWidth && b.bottom <= r.bottom + 1; });
  ok(sheet || phone, `${label}: the sheet of the manche fits with its button`);
  await p.close();
}

ok(!errors.length, 'no page error' + (errors.length ? ': ' + errors.join(' | ') : ''));
await browser.close();
console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
process.exit(fails ? 1 : 0);
