// Plays the morpion with a real mouse: the rules, a cross and the computer's answer, refusals, a
// double-click, undo, the hint, a reload, the win, the loss and its undo, a draw, the series and who
// starts, the big sheet and its warnings, broken and old saves, and the layout at every window size.
import { launch, gameUrl, OUT } from './harness.mjs';
const browser = await launch();
let fails = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const URL = gameUrl('morpion');

const page = await browser.newPage({ viewport: { width: 1366, height: 680 } });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
const g = (fn, arg) => page.evaluate(fn, arg);
const wait = ms => page.waitForTimeout(ms);
const msg = () => g(() => document.getElementById('msg').textContent);
const cell = i => page.locator(`.cell[data-i="${i}"]`);
// A click, then the mouse moves away and waits half a second, so the next click is not a double-click.
const click = async i => { await cell(i).click(); await page.mouse.move(5, 5); await wait(520); };
const ready = () => page.waitForFunction(() => phase === 'player' || phase === 'over', null, { timeout: 8000 });
// Puts a position on the board, as if it had been played.
const setGame = (level, first, moves) => g(([level, first, moves]) => {
  cancelAll(); G = Morpion.restore({ level, first, moves }); counted = false; hint = null; lastCpu = -1; phase = 'player'; render(); save();
}, [level, first, moves]);
const marks = () => g(() => Morpion.board(G).join(''));
// The score of the series as the window shows it, on the cards or on the strip above the sheet:
// "Vous 1 · Ordinateur 0 · Nuls 0", or '' when a part of it is not in view.
const shownScore = () => {
  const seen = id => { const e = document.getElementById(id), b = e.getBoundingClientRect(); return e.checkVisibility() && b.width > 0 && b.top >= 0 && b.bottom <= innerHeight ? e.textContent.replace(/\D/g, '') : null; };
  const strip = document.getElementById('strip').checkVisibility();
  const n = strip ? ['stripYou', 'stripCpu', 'stripDraws'].map(seen) : ['youTally', 'cpuTally', 'draws'].map(seen);
  return n.includes(null) || n.includes('') ? '' : `Vous ${n[0]} · Ordinateur ${n[1]} · Nuls ${n[2]}`;
};
const score = () => g(shownScore);

// 1. The first visit: the rules open, each page fits without scrolling, "Fermer" works, then the level.
await page.goto(URL);
await wait(400);
ok(await g(() => Kit.isOpen()), 'the rules open on the first visit');
for (let n = 0; n < 4; n++) {
  ok(await g(() => { const t = document.getElementById('helpText'); return t.scrollHeight <= t.clientHeight + 1; }), `rules page ${n + 1} fits without scrolling`);
  await page.screenshot({ path: `${OUT}/morpion-rules-${n + 1}.png` });
  if (n < 3) await page.click('#helpNext');
}
await page.click('#helpClose');
ok(/Choisissez le niveau/.test(await g(() => document.getElementById('overText').textContent)), '"Fermer" closes the rules and asks for the level');
await page.getByRole('button', { name: 'Facile', exact: true }).click();
ok(await page.locator('.cell').count() === 9, 'Facile is a grid of 3 by 3');
ok(await g(() => G.first === Morpion.X) && /vous commencez/.test(await msg()), 'he starts the first game, and the line says so');
ok(/Vous 0 · Ordinateur 0 · Nuls 0/.test(await score()), 'the game shows the score of the series');
const big3 = await cell(4).boundingBox();
ok(big3.width >= 100, `the squares of the little grid are large: ${Math.round(big3.width)} px`);

// 2. A cross, drawn with the pen, then the computer's ring.
const sent = { start: 0, won: 0 };
await page.exposeFunction('sent', kind => { sent[kind]++; });
await g(() => { GG.track = (game, kind) => window.sent(kind); });
await cell(4).click();
ok(await page.locator('.cell[data-i="4"] .mark.x.ink').count() === 1, 'his cross is drawn with a pen stroke');
ok(/réfléchit/.test(await msg()) || await g(() => phase === 'thinking' || phase === 'anim'), 'the computer thinks after his cross');
await page.mouse.move(5, 5);
await ready();
ok((await marks()).split('').filter(v => v === '2').length === 1 && await g(() => lastCpu >= 0), 'the computer answers with one ring');
ok(await page.locator('.cell.last .mark.o').count() === 1, 'the computer\'s last ring is marked');
ok(/L'ordinateur|Attention/.test(await msg()), 'the line says what the computer did: ' + await msg());
await page.screenshot({ path: `${OUT}/morpion-facile.png` });

// 3. Refusals: a square with a cross, a square with a ring, and a click while the computer plays.
await wait(520);
await click(4);
ok(/déjà votre croix/.test(await msg()), 'a click on his cross is refused, with the reason');
const ringAt = await g(() => lastCpu);
await click(ringAt);
ok(/déjà un rond/.test(await msg()), 'a click on a ring is refused, with the reason');
ok(await g(() => G.moves.length === 2), 'a refused click plays nothing');

// 4. A double-click places one cross only.
const free = await g(() => [...Morpion.board(G).keys()].find(i => !Morpion.board(G)[i]));
await cell(free).dblclick();
await page.mouse.move(5, 5);
ok(!/déjà/.test(await msg()), 'a double-click counts as one click, without a refusal');
await ready();
ok(await g(() => G.moves.length === 4 || !!G.result), 'a double-click puts one cross, and the computer answers once');

// 5. Undo takes back his cross and the computer's answer, back to the start.
await setGame('facile', 1, [4, 0, 8, 2, 5, 3]);
await page.locator('#undoBtn').dblclick();
ok((await g(() => G.moves.join())) === '4,0,8,2', 'a double-click on undo takes back one cross and answer');
await page.keyboard.down('Control');
await page.keyboard.down('z');
await page.keyboard.down('z');
await page.keyboard.up('z');
await page.keyboard.up('Control');
ok((await g(() => G.moves.join())) === '4,0', 'holding Ctrl+Z undoes once');
await page.keyboard.press('Control+z');
ok(await g(() => G.moves.length === 0) && await page.locator('#undoBtn').isDisabled(), 'Ctrl+Z undoes too, back to an empty grid, and the button turns off');

// 6. The hint frames a good square and says why.
await setGame('facile', 1, [0, 4, 8, 2]);
await page.click('#hintBtn');
await page.waitForSelector('.cell.hint');
ok(await g(() => document.querySelector('.cell.hint').dataset.i === '6') && /bloquez deux ronds/.test(await msg()), 'the hint frames the square that blocks two rings, and says why');
await page.screenshot({ path: `${OUT}/morpion-hint.png` });
await click(6);
ok(!(await page.locator('.cell.hint').count()), 'the frame goes once he plays');
await ready();

// 7. A reload keeps the game.
const before = await g(() => G.moves.join());
await page.reload();
await wait(400);
ok(await g(() => G.moves.join()) === before && !(await g(() => Kit.isOpen())), 'a reload keeps the moves, without the rules');
ok(await page.locator('.cell .mark').count() === before.split(',').length, 'the marks come back on the grid');
await g(() => { GG.track = (game, kind) => window.sent(kind); });

// 8. The win: the line is crossed out, the score counts it once, and the tile says so.
await setGame('facile', 1, [0, 4, 1, 8]);
await click(2);
ok(await page.locator('#strike path').count() === 1, 'the winning line is crossed out with a pen line');
await page.click('#helpBtn');
await page.waitForFunction(() => !!pendingResult);
ok(await page.locator('#help.on').count() === 1 && !await page.locator('#over.on').count(), 'the rules stay open while the win dialog waits');
await page.click('#helpClose');
await page.waitForSelector('#over.on', { timeout: 4000 });
ok(/Bravo, vous avez gagné/.test(await g(() => document.getElementById('overTitle').textContent)), 'the win sheet opens after the line');
ok(/Vous 1 · Ordinateur 0 · Nuls 0/.test(await g(() => document.getElementById('overText').textContent)), 'the win sheet gives the score of the series');
await page.screenshot({ path: `${OUT}/morpion-won.png` });
ok(sent.won === 1 && await g(() => GG.meta('morpion').summary === '1 victoire'), 'the win is counted once, and the tile says so');
ok(await g(() => document.getElementById('level').textContent === 'Niveau facile1 victoire' && !document.querySelector('#rail #wins')), 'the level line shows the win, the bottom bar does not');

// 9. The next game: the computer starts.
await page.getByRole('button', { name: 'Partie suivante' }).click();
ok(/l'ordinateur commence/.test(await msg()) || await g(() => phase === 'thinking'), 'in the next game the computer starts');
await ready();
ok(await g(() => G.first === Morpion.O && G.moves.length === 1), 'the computer has put its first ring');
ok(/Vous 1 · Ordinateur 0 · Nuls 0/.test(await score()), 'the series goes on');
ok(await page.locator('#undoBtn').isDisabled(), 'nothing to undo before his first cross');

// 10. A loss, then its undo takes it out of the score.
// The computer has two rings on a diagonal; its answer completes it.
await setGame('facile', 1, [0, 4, 1, 2, 7]);
await g(() => computerPlays(6));
await page.waitForSelector('#over.on', { timeout: 8000 });
ok(/L'ordinateur a gagné/.test(await g(() => document.getElementById('overTitle').textContent)), 'the computer wins and the sheet says so');
ok(await g(() => document.querySelector('#overBtns button').textContent === 'Annuler le dernier coup'), 'after a loss, undo comes first');
ok(/Ordinateur 1/.test(await score()), 'the loss is in the score');
await page.click('#overBtns button');
ok(await g(() => !G.result && G.moves.length === 4) && /Ordinateur 0/.test(await score()), 'undo takes back the loss, and the score with it');

// 11. A draw.
await setGame('facile', 1, [4, 0, 8, 2, 1, 7, 6, 3]);
await click(5);
await page.waitForSelector('#over.on', { timeout: 4000 });
ok(await g(() => document.getElementById('overTitle').textContent === 'Match nul') && /Nuls 1/.test(await score()), 'a full grid is a draw, counted in the score');
await page.keyboard.press('Escape');
await click(0);
ok(/partie est finie/.test(await msg()), 'a click after the end says to start a new game');

// 12. The big sheet: 11 by 11, squares of 34 px or more on his laptop, a new series.
await page.click('#newBtn');
await page.getByRole('button', { name: 'Moyen', exact: true }).click();
ok(await page.locator('.cell').count() === 121, 'Moyen is a sheet of 11 by 11');
const sq = await cell(60).boundingBox();
ok(sq.width >= 34, `the squares of the big sheet are ${sq.width.toFixed(1)} px on his laptop`);
ok(/Vous 0 · Ordinateur 0 · Nuls 0/.test(await score()) && await g(() => G.first === Morpion.X), 'a new level starts a new series, and he starts');
await click(60);
await ready();
ok(await g(() => G.moves.length === 2), 'the computer answers on the big sheet');
// Three rings in a row: the line warns him, and the hint blocks them.
await setGame('moyen', 1, [0, 59, 2, 60, 120, 61]);
await g(() => { say(computerSaid(61)); });
ok(/trois ronds alignés/.test(await msg()), 'the line warns of three rings in a row');
await page.click('#hintBtn');
await page.waitForSelector('.cell.hint', { timeout: 8000 });
ok(await msg() === 'Ici, vous bloquez trois ronds alignés.' && [58, 62].includes(+(await g(() => document.querySelector('.cell.hint').dataset.i))), 'the hint frames a square at an end of the three rings and says why');
await page.screenshot({ path: `${OUT}/morpion-moyen-hint.png` });
// Five crosses win the big sheet.
await setGame('moyen', 1, [55, 0, 56, 2, 57, 4, 58, 6]);
await click(59);
await page.click('#newBtn');
await page.waitForFunction(() => !!pendingResult);
await page.getByRole('button', { name: 'Continuer la partie' }).click();
await page.waitForSelector('#over.on', { timeout: 5000 });
ok(/aligné 5 croix/.test(await g(() => document.getElementById('overText').textContent)), 'five crosses in a row win the big sheet');
await page.screenshot({ path: `${OUT}/morpion-moyen-won.png` });
await page.keyboard.press('Escape');

// 13. Difficile answers through its worker, and the page does not freeze.
await page.click('#newBtn');
await page.getByRole('button', { name: 'Difficile', exact: true }).click();
await click(60);
const t0 = Date.now();
await ready();
ok(await g(() => G.moves.length === 2 && worker !== null), `Difficile answers from its worker in ${Date.now() - t0} ms`);

// 14. Saves: an old save without a level loads as Facile; a broken save starts again with the rules.
await g(() => GG.save('morpion', { moves: [4, 0] }));
await page.reload();
await wait(400);
ok(await g(() => level === 'facile' && G.moves.join() === '4,0' && !Kit.isOpen()), 'an old save without a level loads as Facile');
await g(() => GG.save('morpion', { level: 'moyen', first: 1, moves: [84, 84], series: { you: 2, cpu: 'x' }, total: { won: 3 } }));
await page.reload();
await wait(400);
ok(await g(() => Kit.isOpen()), 'a broken save is not loaded and the game starts again');
await page.click('#helpClose');
await page.getByRole('button', { name: 'Moyen', exact: true }).click();
ok(await g(() => total.won === 3 && series.you === 2 && series.cpu === 0), 'the wins and the score of a broken save are kept, a bad count reads as 0');

// 14b. Fixes found in review.
// A position at a level, saved, as if it had been played.
const setLevelGame = (lv, first, moves) => g(([lv, first, moves]) => {
  cancelAll(); level = lv; series = freshSeries(lv); G = Morpion.restore({ level: lv, first, moves });
  counted = false; wonNow = false; hint = null; lastCpu = -1; phase = 'player'; Kit.showLevel(lv); render(); return save();
}, [lv, first, moves]);
const centre = async i => { const b = await cell(i).boundingBox(); return [b.x + b.width / 2, b.y + b.height / 2]; };
{
  // The yellow frame of the hint spills over the next square, but a click there goes to that square.
  await setLevelGame('moyen', 1, [0, 120]);
  await g(() => { hint = 60; render(); });
  const b = await cell(61).boundingBox();
  await page.mouse.click(b.x + 1.5, b.y + b.height / 2);
  await page.mouse.move(5, 5);
  ok(await g(() => Morpion.board(G)[61] === Morpion.X && !Morpion.board(G)[60]), 'a click at the edge of the square next to the hint frame plays that square');
  await ready(); await wait(520);

  // A press held while the computer plays its ring plays nothing when it is let go.
  await setLevelGame('moyen', 1, []);
  await cell(60).click();
  await page.mouse.move(...await centre(100));
  await page.mouse.down();
  await ready();
  await page.mouse.up();
  await page.mouse.move(5, 5);
  ok(await g(() => G.moves.length === 2 && !Morpion.board(G)[100]), 'a press held through the computer\'s turn plays nothing');
  await wait(520);

  // A click, undo, then the same square again at once: the second click plays.
  await setLevelGame('moyen', 1, []);
  await cell(30).click();
  await page.keyboard.press('Control+z');
  await cell(30).click();
  ok(await g(() => G.moves[0] === 30), 'after an undo, a click on the same square plays at once');
  await page.mouse.move(5, 5);
  await ready(); await wait(520);

  // A reload keeps the warning and the mark on the computer's last ring.
  await setLevelGame('moyen', 1, [0, 59, 2, 60, 120, 61]);
  await g(() => GG.flush());
  await page.reload(); await wait(400);
  ok(/trois ronds alignés/.test(await msg()) && await g(() => document.querySelector('.cell.last')?.dataset.i === '61'), 'a reload keeps the warning and the mark on the last ring');
  await page.keyboard.press('Control+z');
  await g(() => { G = Morpion.restore({ level: 'moyen', first: 1, moves: [0, 59, 2, 60, 120, 61, 4] }); render(); });
  await g(() => doUndo());
  ok(/Coup annulé. Attention : l'ordinateur a trois ronds alignés/.test(await msg()), 'an undo back to a threat warns of it');

  // A reload between the last mark and the end sheet still opens the end sheet, and counts once.
  await setLevelGame('facile', 1, [0, 4, 1, 8]);
  await g(() => { tap(2); });
  await g(() => GG.flush());
  await page.reload(); await wait(400);
  await page.waitForSelector('#over.on', { timeout: 3000 });
  ok(/Bravo/.test(await g(() => document.getElementById('overTitle').textContent)) && await g(() => series.you === 1), 'a reload during the finish opens the end sheet, and the win counts once');
  await page.keyboard.press('Escape');

  // Six crosses in a row: the line says six.
  await setLevelGame('moyen', 1, [56, 0, 57, 2, 59, 4, 60, 6, 61, 8]);
  await click(58);
  ok(/aligné 6 croix/.test(await msg()), 'six crosses in a row are called six: ' + await msg());
  await page.waitForSelector('#over.on', { timeout: 5000 });
  await page.keyboard.press('Escape');

  // A save that cannot be written keeps its message after the computer's ring.
  await setLevelGame('moyen', 1, []);
  await g(() => { window.realSave = GG.save; GG.save = async () => false; });
  await click(60);
  await ready();
  ok(/n'a pas pu être enregistrée/.test(await msg()), 'a failed save keeps its message after the computer plays');
  await g(() => { GG.save = window.realSave; });

  // An older save of the 13 by 13 sheet goes on with it; the next game is 11 by 11.
  await g(() => GG.save('morpion', { v: 1, level: 'moyen', first: 1, moves: [84, 85], series: { level: 'moyen', you: 1, cpu: 0, draws: 0, games: 1 } }));
  await page.reload(); await wait(400);
  ok(await g(() => G.n === 13 && G.moves.join() === '84,85') && await page.locator('.cell').count() === 169, 'an older save of 13 by 13 goes on with its sheet');
  await g(() => nextGame());
  ok(await page.locator('.cell').count() === 121 && await g(() => series.you === 1), 'the next game is on the sheet of 11 by 11, in the same series');

  // A broken level and a score of another level.
  const before = errors.length;
  await g(() => GG.save('morpion', { level: { toString: null }, moves: [] }));
  await page.reload(); await wait(400);
  ok(errors.length === before && await g(() => level === 'facile' && !!G), 'a level that is not a word opens as Facile, without an error');
  await g(() => GG.save('morpion', { level: 'moyen', first: 1, moves: [], series: { level: 'fort', you: 7, cpu: 0, draws: 0, games: 3 } }));
  await page.reload(); await wait(400);
  ok(await g(() => level === 'moyen' && series.you === 0), 'the score of another level is not carried over');
  await g(() => GG.save('morpion', { level: 'facile', first: 1, moves: [0, 3, 1, 4, 2], counted: true }));
  await page.reload(); await wait(400);
  await page.keyboard.press('Escape');
  await g(() => doUndo());
  ok(await g(() => series.you === 0), 'an undo of a game counted in a lost score does not go below 0');
  await g(() => GG.save('morpion', { moves: [4, 0] }));
  await page.reload(); await wait(400);
  await g(() => nextGame());
  ok(await g(() => G.first === Morpion.O), 'after an old save that he started, the computer starts the next game');

  // Round 2 of the review.
  // A click refused while the computer draws its ring does not swallow the next click on that square.
  await setLevelGame('moyen', 1, [60, 61]);
  await g(() => { phase = 'anim'; });
  await cell(100).click();
  const refused = await msg();
  await g(() => { phase = 'player'; });
  await cell(100).click();
  await page.mouse.move(5, 5);
  ok(/Attendez/.test(refused) && await g(() => Morpion.board(G)[100] === Morpion.X), 'a click refused during the computer\'s turn does not make the next click a double-click');
  await ready(); await wait(520);

  // A result that cannot be saved is not in the end sheet's score.
  await setLevelGame('facile', 1, [0, 4, 1, 8]);
  await g(() => { window.realSave = GG.save; GG.save = async () => false; });
  await g(() => { tap(2); });
  await page.waitForSelector('#over.on', { timeout: 5000 });
  ok(/Vous 0 ·/.test(await g(() => document.getElementById('overText').textContent)) && await g(() => series.you === 0 && !counted), 'a win that cannot be saved shows a score without it');
  await g(() => { GG.save = window.realSave; Kit.closeDialog(); });

  // An undo while the result is being written waits for it, so a lost win never comes back.
  await setLevelGame('facile', 1, [0, 4, 1, 8]);
  const wonBefore = await g(() => total.won);
  await g(() => {
    const real = window.realSave;
    GG.save = () => { GG.save = real; return new Promise(r => { window.release = () => r(false); }); };
    tap(2);
    doUndo();
  });
  ok(await g(() => G.result && G.moves.length === 5), 'an undo waits while the result is being written');
  await g(() => window.release());
  await page.waitForFunction(() => G.moves.length === 4, null, { timeout: 3000 });
  await g(() => GG.flush());
  await page.reload(); await wait(400);
  ok(await g(w => total.won === w && series.you === 0 && G.moves.join() === '0,4,1,8', wonBefore), 'after the undo, a win that was not saved is not in the total or the score');

  // A save with part of a score: a counted result is in it, and this game is in the count of games.
  await g(() => GG.save('morpion', { level: 'facile', first: 1, moves: [0, 3, 1, 4, 2], counted: true, series: { games: 1 } }));
  await page.reload(); await wait(400);
  await page.keyboard.press('Escape');
  await g(() => doUndo());
  await g(() => GG.flush());
  ok(await g(() => series.you === 0 && GG.load('morpion').series.you === 0), 'an undo of a counted win missing from the score saves 0, not -1');
  await g(() => GG.save('morpion', { level: 'facile', first: 1, moves: [4, 0], series: { you: 1 } }));
  await page.reload(); await wait(400);
  await g(() => nextGame());
  ok(await g(() => G.first === Morpion.O && series.you === 1), 'a score without a count of games: the computer starts after a game he started');

  // The warnings describe the real position: a gap in the three rings, and two squares that make five.
  await setLevelGame('moyen', 1, [32, 54, 0, 76, 27, 87]);
  const gapWarn = await g(() => warning());
  ok(/case vide entre eux/.test(gapWarn) && !/alignés/.test(gapWarn), 'three rings with a gap are not called three in a row: ' + gapWarn);
  await setLevelGame('moyen', 1, [32, 54, 0, 76, 27, 87, 17, 65]);
  const twoWarn = await g(() => warning());
  ok(/plusieurs endroits, et une croix n'en bloque qu'un/.test(twoWarn) && !/Bloquez/.test(twoWarn), 'two squares that make five: the warning does not ask him to block one: ' + twoWarn);
}

// 15. A window that is behind (another window saved since) counts no game started and asks to reload.
{
  const ctx = await browser.newContext({ reducedMotion: 'reduce' });
  const a = await ctx.newPage(), b = await ctx.newPage();
  const spy = p => p.evaluate(() => { window.sentKinds = []; GG.track = (game, kind) => sentKinds.push(kind); });
  await a.goto(URL);
  await a.click('#helpClose');
  await a.getByRole('button', { name: 'Facile', exact: true }).click();
  await b.goto(URL);
  await b.evaluate(() => newGame('facile'));
  await spy(a);
  await a.evaluate(() => newGame('facile'));
  await a.waitForTimeout(100);
  ok(await a.evaluate(() => !sentKinds.includes('start') && document.getElementById('overTitle').textContent === 'Le jeu a changé ailleurs'), 'a stale window counts no game started and asks to reload');
  await spy(b);
  await b.evaluate(() => newGame('facile'));
  ok(await b.evaluate(() => sentKinds.includes('start')), 'the window that is up to date counts it');
  // With reduced motion, the mark is drawn at once and the win sheet opens without waiting.
  await b.evaluate(() => { G = Morpion.restore({ level: 'facile', first: 1, moves: [0, 4, 1, 8] }); render(); });
  await b.locator('.cell[data-i="2"]').click();
  await b.waitForTimeout(250);
  ok(await b.evaluate(() => document.getElementById('over').classList.contains('on') && !document.querySelector('.mark.ink')), 'with reduced motion, the win sheet opens at once and nothing is animated');
  // A finished game opened in a second window does not stop the first one from going on.
  await b.evaluate(() => { Kit.closeDialog(); counted = false; wonNow = false; G = Morpion.restore({ level: 'facile', first: 1, moves: [0, 4, 1, 8] }); render(); tap(2); });
  await b.waitForSelector('#over.on');
  await b.evaluate(() => GG.flush());
  const c = await ctx.newPage();
  await c.goto(URL);
  await c.waitForTimeout(400);
  await b.getByRole('button', { name: 'Partie suivante' }).click();
  ok(await b.evaluate(() => document.getElementById('overTitle').textContent !== 'Le jeu a changé ailleurs' && !G.result), 'a finished game opened in another window lets the first go on');
  await c.close();
  await ctx.close();
}

// 16. The layout at every window: nothing goes past the window, text 20 px or more (13 on a phone),
// buttons 44 px or more, the message is not cut, the rules fit without scrolling from 620 px high.
async function check(p, label) {
  const r = await p.evaluate(() => {
    const bad = [], z = Zoom.z(), phone = innerWidth < 700, min = phone ? 13 : 20;
    const shown = e => { const s = getComputedStyle(e), b = e.getBoundingClientRect(); return s.display !== 'none' && s.visibility !== 'hidden' && b.width > 0 && b.height > 0; };
    for (const e of document.querySelectorAll('body *')) {
      if (!shown(e) || e.closest('svg, .sr') || e.closest('#over:not(.on), #help:not(.on)')) continue;
      const b = e.getBoundingClientRect(), name = e.id || e.className || e.tagName;
      if (b.right > innerWidth + 1 || b.left < -1) bad.push('past the side: ' + name);
      const text = [...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
      if (text && parseFloat(getComputedStyle(e).fontSize) < min) bad.push('small text: ' + name);
      if (e.tagName === 'BUTTON' && !phone && b.height / z < 43.5) bad.push('small button: ' + name);
    }
    for (const id of ['sheet', 'side']) {
      const e = document.getElementById(id), t = document.getElementById('table').getBoundingClientRect();
      if (e && shown(e)) { const b = e.getBoundingClientRect(); if (b.bottom > t.bottom + 1 || b.top < t.top - 1) bad.push('cut: ' + id); }
    }
    const m = document.getElementById('msg');
    if (m.scrollWidth > m.clientWidth + 1 || m.scrollHeight > m.clientHeight + 1) bad.push('message cut');
    if (document.documentElement.scrollWidth > innerWidth) bad.push('page scrolls sideways');
    return bad;
  });
  ok(!r.length, `${label}: nothing cut or too small${r.length ? ': ' + [...new Set(r)].slice(0, 6).join(', ') : ''}`);
}
const WINDOWS = [[1366, 680, 1], [1093, 530, 1], [1920, 1000, 1], [1280, 620, 1], [390, 760, 1], [1366, 680, 1.3], [1920, 1000, 1.75]];
const LONG = "Ici, vous alignez quatre croix libres aux deux bouts : l’ordinateur ne pourra pas tout bloquer.";
for (const [w, h, z] of WINDOWS) {
  const p = await browser.newPage({ viewport: { width: w, height: h }, ...(w < 700 ? { isMobile: true, hasTouch: true } : {}) });
  p.on('pageerror', e => errors.push(e.message));
  await p.addInitScript(z => localStorage.setItem('gg:zoom', JSON.stringify(z)), z);
  await p.goto(URL);
  await p.waitForTimeout(300);
  const label = `${w}x${h}${z !== 1 ? ' at ' + z * 100 + ' %' : ''}`;
  if (h / z >= 620 || z === 1) {
    let fit = true;
    for (let n = 0; n < 4; n++) {
      if (h >= 620 && !(await p.evaluate(() => { const t = document.getElementById('helpText'); return t.scrollHeight <= t.clientHeight + 1; }))) fit = false;
      await check(p, `${label} rules page ${n + 1}`);
      if (n < 3) await p.click('#helpNext');
    }
    if (h >= 620) ok(fit, `${label}: every rules page fits without scrolling`);
  }
  await p.evaluate(() => Kit.closeHelp());
  await check(p, `${label} level dialog`);
  for (const [lv, moves] of [['Facile', [4, 0, 8]], ['Moyen', [60, 61, 49, 50, 72, 73]]]) {
    await p.getByRole('button', { name: lv, exact: true }).click();
    // The message first, then the layout, as the game does: the sheet fits under the line as it is.
    await p.evaluate(([moves, long]) => { cancelAll(); G = Morpion.restore({ level: G.level, first: 1, moves }); phase = 'player'; hint = moves[0] + 2; Kit.say(long); render(); }, [moves, LONG]);
    await p.waitForTimeout(500);
    await check(p, `${label} ${lv}`);
    const sc = await p.evaluate(shownScore);
    ok(/^Vous 0 · Ordinateur 0 · Nuls 0$/.test(sc), `${label} ${lv}: the score of the series is in view`);
    ok(await p.evaluate(() => [...document.getElementById('rail').children].every(e => e.matches('.credit, .zoom')) && /victoire/.test(document.getElementById('level').textContent) === (total.won > 0)), `${label} ${lv}: nothing of the game in the bottom bar`);
    if (lv === 'Moyen' && w === 1366 && z === 1) {
      const c = await p.locator('.cell').first().boundingBox();
      ok(c.width >= 34, `${label}: squares of ${c.width.toFixed(1)} px`);
    }
    await p.screenshot({ path: `${OUT}/morpion-${lv.toLowerCase()}-${w}x${h}${z !== 1 ? '-' + z : ''}.png` });
    await p.click('#newBtn');
  }
  await p.close();
}

ok(!errors.length, 'no page error' + (errors.length ? ': ' + errors.join(' | ') : ''));
await browser.close();
console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
process.exit(fails ? 1 : 0);
