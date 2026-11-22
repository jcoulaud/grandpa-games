// Plays the sudoku with a real mouse and keyboard: the rules, choosing a cell, writing, a digit that
// breaks a rule, refusals, undo, the hint, a reload, a digit complete, the win, a broken save,
// the levels, and the layout at every window size of docs/design.md.
import { launch, gameUrl, OUT } from './harness.mjs';
const browser = await launch();
let fails = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const URL = gameUrl('sudoku');

const page = await browser.newPage({ viewport: { width: 1366, height: 680 } });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
const g = (fn, arg) => page.evaluate(fn, arg);
const wait = ms => page.waitForTimeout(ms);
const msg = () => g(() => document.getElementById('msg').textContent);
const cell = i => page.locator(`.cell[data-i="${i}"]`);
const key = d => page.locator(`.key[data-d="${d}"]`);
const cls = i => cell(i).getAttribute('class');
const sol = i => g(i => +G.solution[i], i);
const emptyCells = () => g(() => [...Array(81).keys()].filter(i => Sudoku.board(G)[i] === 0));
// Fills a Facile grid but its first empty cell, which it returns. skip: one more cell to leave empty.
const nearWin = (p, skip = -1) => p.evaluate(skip => {
  let g2 = G;
  const first = [...g2.givens].indexOf('0');
  for (let k = first + 1; k < 81; k++) if (g2.givens[k] === '0' && k !== skip) g2 = Sudoku.write(g2, k, +g2.solution[k]).G;
  G = g2; undo = []; save(); render();
  return first;
}, skip);
const start = async (p, label) => {
  await p.locator('#overBtns button', { hasText: label }).click();
  await p.waitForFunction(() => G && !making);
};

// 1. The first visit: the rules open, each page fits without scrolling, then the level.
await page.goto(URL);
await wait(300);
ok(await g(() => Kit.isOpen()), 'the rules open on the first visit');
for (let n = 0; n < 5; n++) {
  ok(await g(() => { const t = document.getElementById('helpText'); return t.scrollHeight <= t.clientHeight + 1; }), `rules page ${n + 1} fits without scrolling`);
  await page.screenshot({ path: `${OUT}/sudoku-rules-${n + 1}.png` });
  await page.click('#helpNext');
}
await start(page, 'Facile');
ok(await page.locator('.cell').count() === 81 && await g(() => G.level === 'facile'), 'Facile makes a grid of 81 cells');
// A fixed seed, so the steps below meet the same grid each time.
await g(() => { G = Sudoku.newGame('facile', 4242); undo = []; save(); render(); });
const givens = await g(() => G.givens);
const empty = [...givens].findIndex(c => c === '0');
const given = [...givens].findIndex(c => c !== '0');
const size = await cell(0).boundingBox();
const font = await g(() => parseFloat(getComputedStyle(document.querySelector('.cell.given')).fontSize));
ok(size.width >= 44 && font >= 30, `the cells are ${Math.round(size.width)} px and the digits ${font} px on his laptop`);
await page.screenshot({ path: `${OUT}/sudoku-start.png` });

// 2. A digit without a cell is refused; a cell, then a digit, writes it in yellow.
await key(5).click();
ok(/Cliquez d'abord sur une case vide/.test(await msg()), 'a digit before a cell says to choose a cell');
await cell(empty).click();
ok(/sel/.test(await cls(empty)) && /Choisissez le chiffre de cette case à droite/.test(await msg()), 'a click chooses an empty cell and says what to do');
const house = await g(i => [...document.querySelectorAll('.cell.house')].map(e => +e.dataset.i).every(j => Sudoku.PEERS[i].includes(j)), empty);
ok(house && await page.locator('.cell.house').count() > 10, 'its row, column and block are lit softly');
const right = await sol(empty);
await key(right).click();
ok(/mine/.test(await cls(empty)) && await cell(empty).textContent() === String(right) && /Vous avez écrit un/.test(await msg()), 'a digit key writes his digit in the cell');
ok(await page.locator('.cell.same').count() >= 1, 'the cells with the same digit are lit');
ok(await g(d => document.querySelector(`.key[data-d="${d}"] .left`).textContent === String(9 - Sudoku.board(G).filter(x => x === d).length), right),
  'its key says how many of the digit are still to place');
ok(await g(() => document.getElementById('count').textContent === `Encore ${Sudoku.board(G).filter(x => !x).length} cases` && !!document.getElementById('count').closest('#table')
  && !document.querySelector('#rail #count, #rail #wins')), 'the cells left show on a slate above the pad, not in the bottom bar');
ok(!(await page.locator('#undoBtn').isDisabled()), 'undo is ready');

// 3. A given cannot change.
await cell(given).click();
ok(/chiffre du départ/.test(await msg()), 'a click on a given says it is part of the start');
await key(givens[given] === '1' ? 2 : 1).click();
ok(/ne peut pas changer/.test(await msg()) && await g(i => G.cells[i] === '0', given), 'a digit on a given is refused, with the reason');

// 4. A digit that breaks a rule: red, with the reason, and the digit it meets has a red ring.
const e2 = [...givens].findIndex((c, i) => c === '0' && i !== empty && Math.floor(i / 9) !== Math.floor(empty / 9));
const inRow = await g(i => Sudoku.UNITS[Sudoku.ROW(i)].map(j => +G.givens[j]).find(d => d && !Sudoku.UNITS[9 + Sudoku.COL(i)].some(k => +G.givens[k] === d)), e2);
await cell(e2).click();
await key(inRow).click();
ok(/bad/.test(await cls(e2)) && (await msg()) === `Il y a déjà un ${inRow} dans cette ligne.`, `a digit already in the row turns red and says so: ${await msg()}`);
ok(await page.locator('.cell.blame').count() === 1, 'the digit it meets has a red ring');
await page.screenshot({ path: `${OUT}/sudoku-clash.png` });

// 5. Undo takes it back.
await page.click('#undoBtn');
ok(await g(i => G.cells[i] === '0', e2) && !/bad/.test(await cls(e2)) && /annulé/.test(await msg()), 'undo takes the red digit back');

// 6. The keyboard: arrows move, a digit writes, Backspace erases, Ctrl+Z undoes.
await cell(e2).click();
const e3 = e2 % 9 === 8 ? e2 - 1 : e2 + 1;
await page.keyboard.press(e2 % 9 === 8 ? 'ArrowLeft' : 'ArrowRight');
ok(await g(() => sel) === e3, 'an arrow key moves the chosen cell');
const free = await g(i => [1, 2, 3, 4, 5, 6, 7, 8, 9].find(d => !Sudoku.PEERS[i].some(j => Sudoku.board(G)[j] === d)), e3);
if (givens[e3] === '0') {
  await page.keyboard.press(String(free));
  ok(await g(i => +G.cells[i], e3) === free, 'a digit key of the keyboard writes it');
  await page.keyboard.press('Backspace');
  ok(await g(i => G.cells[i] === '0', e3) && /effacé/.test(await msg()), 'Backspace erases it');
  await page.keyboard.press('Control+z');
  ok(await g(i => +G.cells[i], e3) === free, 'Ctrl+Z brings it back');
  await page.keyboard.press('Control+z');
}
// The keypad without Num Lock sends an arrow on the code of its 4: it moves, it does not write a 4.
{
  const before = await g(() => ({ sel, cells: G.cells }));
  await g(() => dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', code: 'Numpad4' })));
  const after = await g(() => ({ sel, cells: G.cells }));
  ok(after.sel === (before.sel % 9 ? before.sel - 1 : before.sel + 8) && after.cells === before.cells, 'the keypad 4 without Num Lock moves the cell and writes nothing');
}

// 7. A double-click on a key, a key held down and a double-click on undo each count once.
await cell(e2).click();
{
  const n = await g(() => undo.length);
  await key(3).dblclick();
  ok(await g(() => undo.length) === n + 1 && await g(i => G.cells[i], e2) === '3', 'a double-click on a key writes once');
  await wait(550);
  await page.keyboard.down('5'); await page.keyboard.down('5'); await page.keyboard.down('5'); await page.keyboard.up('5');
  ok(await g(() => undo.length) === n + 2 && await g(i => G.cells[i], e2) === '5', 'a digit held down on the keyboard writes once');
  await page.locator('#undoBtn').dblclick();
  ok(await g(() => undo.length) === n + 1 && await g(i => G.cells[i], e2) === '3', 'a double-click on undo takes one move back');
  await wait(550);
}
await page.keyboard.press('Backspace');
ok(await g(i => G.cells[i], e2) === '0' && (await msg()) === 'Le 3 est effacé.', 'Backspace erases the 3 and says so');
ok(await page.locator('#notesBtn').count() === 0 && !/notes/i.test(await page.locator('#help').textContent()), 'the game has no notes, and the rules do not speak of them');
await wait(550);

// 8. The hint fills a cell and says why.
await page.click('#hintBtn');
const h = await g(() => ({ sel, d: Sudoku.board(G)[sel], right: +G.solution[sel], ring: !!document.querySelector('.cell.hint') }));
ok(h.d === h.right && h.ring && /(seul le \d est possible|ne peut aller que dans cette case)/.test(await msg()), `the hint fills a right digit and says why: ${await msg()}`);
await page.screenshot({ path: `${OUT}/sudoku-hint.png` });
// A legal digit that is not the solution is shown only when he asks.
const e4 = (await emptyCells()).find(i => i !== e2);
const legal = await g(i => [1, 2, 3, 4, 5, 6, 7, 8, 9].find(d => d !== +G.solution[i] && !Sudoku.PEERS[i].some(j => Sudoku.board(G)[j] === d)), e4);
if (legal) {
  await cell(e4).click(); await key(legal).click();
  ok(!/bad/.test(await cls(e4)) && /Vous avez écrit/.test(await msg()), 'a legal digit that is not the solution is not shown as wrong');
  await wait(550);
  await page.click('#hintBtn');
  ok(await g(i => G.cells[i] === '0', e4) && /n'est pas le bon chiffre/.test(await msg()), 'the hint erases it and says so');
}

// 9. A reload keeps the grid and the undo.
await g(() => GG.flush());
const before = await g(() => ({ cells: G.cells, undo: undo.length }));
await page.reload();
await wait(300);
const after = await g(() => ({ cells: G.cells, undo: undo.length }));
ok(JSON.stringify(before) === JSON.stringify(after) && !(await g(() => Kit.isOpen())), 'a reload keeps the digits and the undo');
ok(await g(() => GG.meta('sudoku').summary === 'Partie en cours'), 'the tile says a game is in progress');
await page.click('#eraseBtn');
ok((await msg()) === "Cliquez d'abord sur la case à effacer.", 'Effacer before a cell asks for the cell to erase, not an empty one');
await cell(given).click(); await wait(550);
await page.click('#eraseBtn');
ok(/ne peut pas être effacé/.test(await msg()), 'Effacer on a given says it cannot be erased');

// 10. A digit complete gets a check, and the last cell wins once, after the wave of the blocks.
await g(() => {
  let g2 = G;
  const left = [...Array(81).keys()].filter(i => Sudoku.board(g2)[i] !== +g2.solution[i]);
  for (const i of left.slice(2)) { if (g2.cells[i] !== '0') g2 = Sudoku.erase(g2, i).G; g2 = Sudoku.write(g2, i, +g2.solution[i]).G; }
  for (const i of left.slice(0, 2)) if (g2.cells[i] !== '0') g2 = Sudoku.erase(g2, i).G;
  G = g2; save(); render();
});
const last = await emptyCells();
ok(last.length === 2 && await page.locator('.key.done').count() >= 7, `two cells left, and ${await page.locator('.key.done').count()} keys have their check`);
const stats = { won: 0 };
await page.exposeFunction('sent', kind => { if (kind === 'won') stats.won++; });
await g(() => { GG.track = (game, kind) => window.sent(kind); });
await cell(last[0]).click(); await key(await sol(last[0])).click();
ok(/done/.test(await key(await sol(last[0])).getAttribute('class')) || await page.locator('.key.done').count() >= 8, 'a digit complete shows its check');
await cell(last[1]).click(); await key(await sol(last[1])).click();
await page.waitForFunction(() => document.getElementById('grid').dataset.board === 'win', null, { timeout: 2000 }).catch(() => {});
ok(await g(() => G.result === 'won' && document.getElementById('grid').dataset.board === 'win'), 'the last digit wins and the blocks light up');
ok(!(await g(() => Kit.isOpen())), 'the win sheet waits for the wave');
await page.screenshot({ path: `${OUT}/sudoku-wave.png` });
await page.waitForSelector('#over.on', { timeout: 4000 });
ok(/Bravo, vous avez gagné/.test(await g(() => document.getElementById('overTitle').textContent)), 'the win sheet opens');
await page.screenshot({ path: `${OUT}/sudoku-won.png` });
ok(stats.won === 1 && await g(() => stats.won === 1 && GG.meta('sudoku').summary === '1 victoire'), 'the win is counted once, and the tile says so');
await page.keyboard.press('Escape');
await cell(last[0]).click();
ok(/Cette grille est terminée/.test(await msg()) && await page.locator('#undoBtn').isDisabled(), 'after the win, a click says to start a new game');
await page.reload();
ok(await g(() => G.result === 'won' && !Kit.isOpen()) && /Bravo/.test(await msg()), 'a reload after the win shows it without the dialog');

// 11. A broken save starts again with the rules.
await g(() => { const v = GG.load('sudoku'); v.G.solution = '1'.repeat(81); return GG.save('sudoku', v); });
await page.reload();
await wait(300);
ok(await g(() => Kit.isOpen() && !G), 'a broken save is not loaded');
await page.click('#helpClose');

// 12. Moyen and Difficile come from the worker, with the reasoning of their level.
await start(page, 'Moyen');
ok(await g(() => G.level === 'moyen' && Sudoku.grade(G.givens).level === 2 && worker !== null), 'Moyen is made by the worker and needs pairs or pointing');
const m0 = (await emptyCells())[0];
await cell(m0).click(); await key(await sol(m0)).click();
await page.click('#newBtn');
ok(/Attention/.test(await g(() => document.getElementById('overText').textContent)), 'a new game during a game warns first');
await start(page, 'Difficile');
ok(await g(() => G.level === 'fort' && Sudoku.grade(G.givens).level === 3) && /Niveau difficile/.test(await g(() => document.getElementById('level').textContent)), 'Difficile needs the hardest reasoning, and the bar says the level');
await page.screenshot({ path: `${OUT}/sudoku-difficile.png` });

// 13. With reduced motion the win sheet opens at once.
{
  const p = await browser.newPage({ viewport: { width: 1366, height: 680 }, reducedMotion: 'reduce' });
  await p.goto(URL);
  await p.evaluate(() => Kit.closeHelp());
  await start(p, 'Facile');
  const pmsg = () => p.evaluate(() => document.getElementById('msg').textContent);
  const play = async (i, d) => {
    await p.locator(`.cell[data-i="${i}"]`).click();
    await p.locator(`.key[data-d="${d ?? await p.evaluate(i => +G.solution[i], i)}"]`).click();
    await p.waitForTimeout(250);
  };
  // A full grid with a red digit says to correct it, also after a reload. A fixed seed, and a red digit
  // that is not the last one's: the last digit then breaks no rule, so the message is about the red one.
  await p.evaluate(() => { G = Sudoku.newGame('facile', 4242); undo = []; save(); render(); });
  const first0 = await p.evaluate(() => [...G.givens].indexOf('0'));
  const j = await p.evaluate(f => [...G.givens].findIndex((c, k) => c === '0' && k > f + 9), first0);
  const i = await nearWin(p, j);
  const red = await p.evaluate(({ i, j }) => Sudoku.PEERS[j].map(k => +G.givens[k]).find(d => d && d !== +G.solution[i]), { i, j });
  await play(j, red);
  await p.waitForTimeout(550);
  await play(i);
  const full = 'La grille est pleine, mais des chiffres sont en rouge : corrigez-les.';
  ok(await p.evaluate(() => G.result === '' && Sudoku.filled(G)) && await pmsg() === full, 'a full grid with a red digit says to correct the red digits');
  await p.evaluate(() => GG.flush());
  await p.reload();
  await p.waitForTimeout(300);
  ok(await pmsg() === full, 'a reload of that grid says the same');
  // A win whose save is refused shows no win sheet and no win in the count.
  await p.evaluate(() => { GG.save = async () => false; });
  await play(j);
  ok(await p.evaluate(() => G.result === 'won' && !Kit.isOpen() && stats.won === 0 && document.getElementById('wins').textContent === ''),
    'a win that cannot be saved opens no win sheet and counts nothing on the screen');
  await p.close();
}
{
  const p = await browser.newPage({ viewport: { width: 1366, height: 680 }, reducedMotion: 'reduce' });
  await p.goto(URL);
  await p.evaluate(() => Kit.closeHelp());
  await start(p, 'Facile');
  const i = await nearWin(p);
  await p.locator(`.cell[data-i="${i}"]`).click();
  await p.locator(`.key[data-d="${await p.evaluate(i => +G.solution[i], i)}"]`).click();
  await p.waitForTimeout(250);
  ok(await p.evaluate(() => Kit.isOpen() && G.result === 'won'), 'with reduced motion, the win sheet opens at once');
  // Two requests for a new grid: the first one is made, the second waits for it.
  await p.evaluate(() => Kit.closeDialog());
  await p.evaluate(() => Promise.all([newGame('fort'), newGame('facile')]));
  ok(await p.evaluate(() => G.level === 'fort' && workerOk && worker !== null), 'a second request during a new grid leaves the first one and its worker alone');
  // A longer reasoning lights its cells and says what they rule out.
  const deep = await p.evaluate(async () => {
    G = Sudoku.newGame('moyen', 3917403667); undo = []; render();
    for (let k = 0; k < 81 && !G.result; k++) {
      lastTap = null;
      await showHint();
      const text = document.getElementById('msg').textContent;
      if (/^À cause des cases en jaune/.test(text)) return { text, lit: document.querySelectorAll('.cell.why').length };
    }
    return null;
  });
  ok(deep && deep.lit > 0 && /(ne (va|vont) pas dans cette case : il n'y reste que le \d|ne va dans aucune autre case)/.test(deep.text), `a longer hint gives its reason: ${deep && deep.text}`);
  // Moyen seed 1, hint 13: the pair needs an earlier step. Each click tells one step, with its cells in
  // yellow and the cells it rules digits out of ringed. The grid changes only at the last step.
  const steps = await p.evaluate(async () => {
    G = Sudoku.newGame('moyen', 1); undo = []; render();
    for (let k = 0; k < 12; k++) { lastTap = null; await showHint(); }
    const out = [];
    for (let k = 0; k < 3; k++) {
      lastTap = null;
      const cells = G.cells;
      await showHint();
      out.push({ text: document.getElementById('msg').textContent, same: G.cells === cells,
        why: [...document.querySelectorAll('.cell.why')].map(e => +e.dataset.i), rings: [...document.querySelectorAll('.cell.hint')].map(e => +e.dataset.i) });
    }
    return out;
  });
  ok(steps[0].same && /^Étape 1 sur 3 : à cause des cases en jaune, le 3 ne va pas dans la case entourée\.$/.test(steps[0].text) && steps[0].rings.join() === '1' && steps[0].why.length > 0,
    `a longer hint first says the step its pair needs: ${steps[0].text}`);
  ok(steps[1].same && /^Étape 2 sur 3 : à cause des cases en jaune, le 1 et le 8 ne vont pas dans la case entourée\.$/.test(steps[1].text) && steps[1].rings.join() === '5' && steps[1].why.join() === '1,2',
    `then the pair: ${steps[1].text}`);
  ok(!steps[2].same && steps[2].text === 'Étape 3 sur 3 : dans cette case, il ne reste que le 4.' && await p.evaluate(() => G.cells[5] === '4'),
    `then it writes the digit: ${steps[2].text}`);
  await p.close();
}
// 13b. A menu opened during the gold wave opens the win sheet.
{
  const p = await browser.newPage({ viewport: { width: 1366, height: 680 } });
  await p.goto(URL);
  await p.evaluate(() => Kit.closeHelp());
  await start(p, 'Facile');
  const i = await nearWin(p);
  await p.locator(`.cell[data-i="${i}"]`).click();
  await p.locator(`.key[data-d="${await p.evaluate(i => +G.solution[i], i)}"]`).click();
  await p.waitForFunction(() => document.getElementById('grid').dataset.board === 'win', null, { timeout: 2000 });
  await p.click('#helpBtn');
  await p.waitForSelector('#over.on', { timeout: 1000 }).catch(() => {});
  ok(/Bravo, vous avez gagné/.test(await p.evaluate(() => document.getElementById('overTitle').textContent)) && await p.evaluate(() => Kit.isOpen()),
    '"Règles" during the wave opens the win sheet instead of losing it');
  await p.close();
}
// 13c. A win whose save waits, for example for another window: a double-click on "Nouvelle partie" keeps
// the win sheet, and no new grid can save a win the win save then refuses.
for (const saves of [true, false]) {
  const p = await browser.newPage({ viewport: { width: 1366, height: 680 } });
  await p.goto(URL);
  await p.evaluate(() => Kit.closeHelp());
  await start(p, 'Facile');
  await p.evaluate(() => { G = Sudoku.newGame('facile', 4242); undo = []; save(); render(); });
  const i = await nearWin(p);
  await p.evaluate(() => GG.flush());
  await p.evaluate(() => { const real = GG.save; GG.save = (...a) => new Promise(r => { window.release = ok => r(ok && real(...a)); }); });
  await p.locator(`.cell[data-i="${i}"]`).click();
  await p.locator(`.key[data-d="${await p.evaluate(i => +G.solution[i], i)}"]`).click();
  await p.locator('#newBtn').dblclick();
  await p.waitForTimeout(100);
  const waiting = await p.evaluate(() => !Kit.isOpen());
  await p.evaluate(ok => window.release(ok), saves);
  await p.waitForTimeout(300);
  const title = await p.evaluate(() => Kit.isOpen() && document.getElementById('overTitle').textContent);
  if (saves) ok(waiting && /Bravo, vous avez gagné/.test(title), 'a double-click on "Nouvelle partie" while the win saves opens the win sheet, not the levels');
  else {
    const n = await p.evaluate(() => stats.won);
    await p.click('#newBtn');
    await p.waitForTimeout(100);
    ok(waiting && !title && n === 0 && await p.evaluate(() => Kit.isOpen() && !/Bravo/.test(document.getElementById('overTitle').textContent)),
      'a win whose save fails counts nothing, and only then can a new grid start');
  }
  await p.close();
}

// 14. Every window of docs/design.md: nothing goes past the window, the grid is whole, the buttons are
// 44 px or more, the text 20 px or more (13 on a phone), the digits 30 px, the longest message fits,
// and the rules pages fit without scrolling from 620 px high.
const WINDOWS = [[1366, 680], [1093, 530], [1920, 1000], [1280, 620], [390, 760], [1366, 680, 1.3], [1920, 1000, 1.75]];
// A longer hint can name seven digits that a cell cannot take.
const LONGEST = "À cause des cases en jaune, le 1, le 2, le 3, le 4, le 5, le 6 et le 7 ne vont pas dans cette case : il n'y reste que le 8.";
// A step of a longer hint: a quad of a column that rules five digits out.
const LONGEST_STEP = "Étape 12 sur 14 : dans cette colonne, le 1, le 2, le 3 et le 4 ne vont que dans les cases en jaune, donc le 5, le 6, le 7, le 8 et le 9 n'y vont pas.";
for (const [w, h, z] of WINDOWS) {
  const name = `${w}x${h}` + (z ? ` at ${z * 100} %` : '');
  const phone = w < 700;
  const p = await browser.newPage(phone ? { viewport: { width: w, height: h }, isMobile: true, hasTouch: true } : { viewport: { width: w, height: h } });
  p.on('pageerror', e => errors.push(e.message));
  if (z) await p.addInitScript(z => localStorage.setItem('gg:zoom', String(z)), z);
  await p.goto(URL);
  await p.waitForTimeout(200);
  let rulesFit = true;
  for (let n = 0; n < 5; n++) {
    const r = await p.evaluate(() => { const t = document.getElementById('helpText'), b = document.getElementById('helpBox').getBoundingClientRect();
      return { fit: t.scrollHeight <= t.clientHeight + 1, inside: b.left >= 0 && b.top >= 0 && b.right <= innerWidth + 1 && b.bottom <= innerHeight + 1, wide: t.scrollWidth <= t.clientWidth + 1 }; });
    if (!r.inside || !r.wide || (h >= 620 && !phone && !r.fit)) rulesFit = false;
    await p.click('#helpNext');
  }
  ok(rulesFit, `${name}: the rules pages fit the window${h >= 620 && !phone ? ', without scrolling' : ''}`);
  await start(p, 'Facile');
  await p.evaluate(() => { G = Sudoku.newGame('facile', 4242); let g2 = G; const e = [...G.givens].findIndex(c => c === '0'); g2 = Sudoku.write(g2, e, +g2.solution[e]).G; G = g2; sel = e; save(); render(); });
  await p.evaluate(t => Kit.say(t), LONGEST);
  await p.waitForTimeout(100);
  const m = await p.evaluate(({ phone }) => {
    const vis = e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden'; };
    const t = document.getElementById('table'), f = document.getElementById('frame').getBoundingClientRect(), pad = document.getElementById('pad').getBoundingClientRect();
    const tr = t.getBoundingClientRect();
    const buttons = [...document.querySelectorAll('button:not(.cell)')].filter(vis).filter(b => !b.closest('#over, #help'));
    const small = buttons.filter(b => b.getBoundingClientRect().height < 44 * Zoom.z() - .5).map(b => b.textContent.trim() || b.id);
    const texts = [...document.querySelectorAll('body *')].filter(e => !e.closest('svg, #help, #over') && [...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()) && vis(e));
    const tiny = texts.filter(e => parseFloat(getComputedStyle(e).fontSize) < (phone ? 13 : 20)).map(e => e.textContent.trim().slice(0, 20));
    const msg = document.getElementById('msg');
    const cell = document.querySelector('.cell').getBoundingClientRect().width / Zoom.z();
    return {
      wide: document.scrollingElement.scrollWidth <= document.scrollingElement.clientWidth,
      whole: phone ? f.left >= tr.left - 1 && f.right <= tr.right + 1 : t.scrollHeight <= t.clientHeight + 1 && t.scrollWidth <= t.clientWidth + 1,
      padIn: pad.right <= tr.right + 1 && pad.left >= tr.left - 1,
      // Beside the grid: level with its top, about as tall, about one cell away.
      under: document.getElementById('stage').classList.contains('under'),
      beside: (Math.abs(pad.top - document.getElementById('grid').getBoundingClientRect().top) <= 2
        && pad.height >= f.height * .9 && pad.height <= f.height + 2 && pad.left - f.right <= 1.6 * document.querySelector('.cell').getBoundingClientRect().width),
      small, tiny, cell: Math.round(cell),
      digit: parseFloat(getComputedStyle(document.querySelector('.cell .d')).fontSize),
      key: parseFloat(getComputedStyle(document.querySelector('.key')).fontSize),
      msgFit: msg.scrollWidth <= msg.clientWidth + 1 && msg.scrollHeight <= msg.clientHeight + 1,
    };
  }, { phone });
  ok(m.wide && m.whole && m.padIn, `${name}: the grid and the pad fit without scrolling${phone ? ' sideways' : ''}`);
  ok(phone ? m.under : !m.under && m.beside, `${name}: ` + (phone ? 'the pad stands under the grid' : 'the pad stands beside the grid, level with its top and about as tall'));
  ok(!m.small.length, `${name}: every button is 44 px or more` + (m.small.length ? ': ' + m.small.join(', ') : ''));
  ok(!m.tiny.length, `${name}: every text is ${phone ? 13 : 20} px or more` + (m.tiny.length ? ': ' + m.tiny.join(', ') : ''));
  ok(m.digit >= 30 && m.key >= 26 && m.cell >= 32, `${name}: cells of ${m.cell} px with digits of ${m.digit} px`);
  ok(m.msgFit, `${name}: the longest message fits the message line`);
  await p.evaluate(t => Kit.say(t), LONGEST_STEP);
  await p.waitForTimeout(100);
  ok(await p.evaluate(() => { const msg = document.getElementById('msg'); return msg.scrollWidth <= msg.clientWidth + 1 && msg.scrollHeight <= msg.clientHeight + 1; }),
    `${name}: the longest step of a hint fits the message line`);
  await p.screenshot({ path: `${OUT}/sudoku-${w}x${h}${z ? '-' + z : ''}.png` });
  await p.close();
}

ok(!errors.length, 'no page error' + (errors.length ? ': ' + errors.join(' | ') : ''));
await browser.close();
console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
process.exit(fails ? 1 : 0);
