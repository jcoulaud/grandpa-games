// Plays the yams with a real mouse: the first visit, throws, keeping dice, refusals, writing a box,
// the computer's turn, double-clicks, the hint, undo, saves across a reload (also during the
// computer's turn), the end of a game, the sizes of the dice and rows, and a phone.
import { launch, gameUrl, OUT } from './harness.mjs';
const browser = await launch();
let fails = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const URL = gameUrl('yams');

const page = await browser.newPage({ viewport: { width: 1366, height: 680 }, reducedMotion: 'reduce' });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
const g = (fn, arg) => page.evaluate(fn, arg);
const wait = ms => page.waitForTimeout(ms);
const msg = () => g(() => document.getElementById('msg').textContent);
const die = i => page.locator(`.die[data-i="${i}"]`);
const box = (p, b) => page.locator(`#sheet td[data-p="${p}"][data-b="${b}"]`);
// A click, then the mouse moves away and waits, so the next click on the same thing is not a double-click.
const click = async loc => { await loc.click(); await page.mouse.move(5, 5); await wait(520); };
// Writes a box of his column: before the third throw, or for a box at 0, the first click only chooses it.
const write = async b => { await click(box(0, b)); if (await page.evaluate(b => G.sheets[0][b] === null && G.turn === 0 && !showing, b)) await click(box(0, b)); };
const myTurn = () => page.waitForFunction(() => G.turn === 0 && !showing && !G.result, null, { timeout: 15000 });

// 1. The first visit: a game starts at Facile at once, with the coach on the throw button.
await page.goto(URL);
await wait(400);
ok(await g(() => !Kit.isOpen() && G.level === 'facile' && G.dice === null && G.turn === 0 && /Vous jouez contre/.test(document.getElementById('msg').textContent)),
  'the first visit starts a game at Facile, with no dialog');
ok(await g(() => Kit.coaching() && document.getElementById('rollBtn').classList.contains('coach')), 'the coach rings the throw button');
ok(await g(() => document.getElementById('rollBtn').hasAttribute('data-nudge')), 'the throw button is the next step');
ok(await g(() => document.getElementById('undoBtn').dataset.why === "Il n'y a pas encore de coup à annuler."), 'the grey undo button says why');
await page.click('#helpBtn');
for (let n = 0; n < 5; n++) {
  ok(await g(() => { const t = document.getElementById('helpText'); return t.scrollHeight <= t.clientHeight + 1; }), `rules page ${n + 1} fits without scrolling`);
  await page.screenshot({ path: `${OUT}/yams-rules-${n + 1}.png` });
  if (n < 4) await page.click('#helpNext');
}
await page.click('#helpClose');
ok(await g(() => !Kit.isOpen()), 'the rules close back to the game');
// The coach: after the throw it points at a die the hint would keep.
await g(() => { G = view = { ...G, dice: [6, 6, 6, 1, 2], kept: [false, false, false, false, false], rolls: 1 }; render(); coach(); });
ok(await g(() => document.querySelector('.die.coach')?.dataset.i === '0'), 'the coach points at a die worth keeping');
await click(die(0));
ok(/Vous gardez le 6\. Cliquez sur « Relancer 4 dés », ou sur un autre dé à garder\./.test(await msg()), 'keeping a die says what to click next: ' + await msg());
ok(await g(() => document.getElementById('rollBtn').hasAttribute('data-nudge')), 'after keeping a die the throw button is the next step');
await g(() => { G = view = Yams.newGame('facile', 12345); pick = null; save(); render(); });

// 2. Before the throw: the piste shows the cup, and a box is refused, with the reason.
ok(await g(() => document.getElementById('piste').classList.contains('empty')), 'before the throw the piste shows five empty slots');
ok(await page.locator('.die.blank').count() === 5 && await page.locator('#tip.on').count() === 1, 'the empty slots have a tip that points to the button');
await click(box(0, 12));
ok(/Lancez d'abord les dés/.test(await msg()) && await g(() => G.sheets[0][12] === null), 'a box before the throw is refused');
await page.click('#hintBtn');
ok(/Lancer les dés/.test(await msg()), 'the hint before the throw says to throw');

// 3. A throw, then keeping dice; the button counts the dice it throws again.
await click(page.locator('#rollBtn'));
ok(await g(() => G.rolls === 1 && G.dice.every(d => d >= 1 && d <= 6)), 'the button throws the five dice');
ok(await page.locator('#tip').textContent() === 'Cliquez sur les dés à garder, puis relancez', 'after the throw the tip says to keep dice');
ok(await page.locator('#sheet td.can').count() === 13, 'his 13 boxes show what the dice would score');
await click(die(1));
ok(await g(() => G.kept[1]) && /Vous gardez le/.test(await msg()), 'a click keeps a die and says so');
ok(/Relancer 4 dés/.test(await page.locator('#rollBtn').textContent()), 'the button says it throws 4 dice');
ok(await g(() => document.getElementById('seat').textContent.startsWith('À vous de jouer')), 'the banner shows only him, who plays now');
await click(box(1, 0));
ok(/celle de/.test(await msg()), "a box in the computer's column is refused");
// « Marquer mes points » stops the throws: the sheet is framed with his column only, and « Revenir aux dés » undoes it.
await click(page.locator('#markBtn'));
ok(await g(() => document.getElementById('sheet').classList.contains('marking') && document.getElementById('rollBtn').hidden && !document.getElementById('toSheet').hidden),
  '« Marquer mes points » frames the sheet and hides the throw button');
ok(await page.locator('#sheet td.it').first().isHidden(), "while he marks, the computer's column is hidden");
await click(die(3));
ok(/Revenir aux dés/.test(await msg()), 'a die while he marks says to pick a box or go back: ' + await msg());
await click(page.locator('#backBtn'));
ok(await g(() => !document.getElementById('sheet').classList.contains('marking') && !document.getElementById('rollBtn').hidden), '« Revenir aux dés » brings the throw button back');
ok(await page.locator('#tags span.on').count() === 1, 'the kept die says "Gardé"');
await page.screenshot({ path: `${OUT}/yams-kept.png` });
// A double-click keeps the die: the second click is not counted.
await die(2).dblclick();
await page.mouse.move(5, 5); await wait(520);
ok(await g(() => G.kept[2]), 'a double-click on a die counts as one click');
const keptDice = await g(() => [G.dice[1], G.dice[2]]);
await click(page.locator('#rollBtn'));
ok(await g(k => G.rolls === 2 && G.dice[1] === k[0] && G.dice[2] === k[1], keptDice), 'the kept dice stay through the throw');
await click(die(2));
ok(await g(() => !G.kept[2]) && /sera relancé/.test(await msg()), 'a second click puts a kept die back');
await click(page.locator('#rollBtn'));
ok(await g(() => G.rolls === 3 && document.getElementById('rollBtn').hidden && document.getElementById('backBtn').hidden && document.getElementById('sheet').classList.contains('marking')),
  'after three throws the sheet is the only thing to fill');
await click(die(0));
ok(/lancé trois fois/.test(await msg()), 'a die after the third throw is refused, with the reason');

// 4. Writing a box, then the computer plays its turn and gives the hand back.
const chance = await g(() => G.dice.reduce((a, b) => a + b));
await click(box(0, 12));
ok(await g(c => G.sheets[0][12] === c && G.turn === 1, chance), 'a click on a box writes the dice');
await myTurn();
ok(await g(c => G.sheets[0][12] === c && G.sheets[1].filter(v => v !== null).length === 1 && G.dice === null, chance), 'the computer writes one box, then it is his turn');
ok(/À vous : cliquez sur « Lancer les dés »/.test(await msg()), 'the message line gives him the hand back');
await page.screenshot({ path: `${OUT}/yams-after-computer.png` });

// 5. Before the third throw a box needs a second click; a full box is refused; undo takes back his box and the computer's.
await click(page.locator('#rollBtn'));
await click(box(0, 11));
ok(await g(() => G.sheets[0][11] === null && G.turn === 0 && pick === 11) && /^Cliquez encore sur Yams pour (la barrer|marquer)/.test(await msg()),
  'before the third throw a first click on a box only chooses it: ' + await msg());
ok(await g(() => document.querySelector('#sheet td.pick[data-b="11"]') && document.getElementById('hintBtn').dataset.auto === 'no'), 'the chosen box shows, and the automatic hint waits');
await click(box(0, 12));
ok(/déjà remplie/.test(await msg()), 'a full box is refused, with the reason');
// The game without his stream of numbers, which an undo draws again.
const state = () => g(() => JSON.stringify({ ...G, rng: G.rng[1] }));
const before = await state(), hisRng = await g(() => G.rng[0]);
await write(11);
await myTurn();
await page.click('#undoBtn');
ok(await state() === before, 'undo takes back his box and the computer\'s turn');
ok(await g(r => G.rng[0] !== r, hisRng), 'undo draws his next throws again');
// A double-click on undo takes back one box only.
await write(11);
await myTurn();
await click(page.locator('#rollBtn'));
await write(9);
await myTurn();
await page.locator('#undoBtn').dblclick();
await page.mouse.move(5, 5); await wait(520);
ok(await g(() => G.sheets[0][11] !== null && G.sheets[0][9] === null), 'a double-click on undo takes back one box');
await page.click('#undoBtn');
await write(11);
await myTurn();
const again = await g(() => JSON.stringify(G.sheets[1]));
await page.click('#undoBtn');
await write(11);
await myTurn();
ok(await g(a => JSON.stringify(G.sheets[1]) === a, again), 'the same box after an undo gives the computer the same turn');

// 6. The hint: it frames the dice to keep or the box to write, and following it plays a sensible turn.
await click(page.locator('#rollBtn'));
await g(() => { G = view = { ...G, dice: [6, 6, 6, 1, 2], kept: [false, false, false, false, false], rolls: 1 }; render(); });
await page.click('#hintBtn');
ok(await g(() => [...document.querySelectorAll('.die.hint')].map(e => +e.dataset.i).join()) === '0,1,2' && /les trois 6/.test(await msg()),
  'the hint rings the three 6 to keep: ' + await msg());
await g(() => { G = view = { ...G, dice: [2, 3, 4, 5, 6] }; render(); });
await page.click('#hintBtn');
ok(await page.locator('#sheet td.hint[data-b="10"]').count() === 1 && /40 points en Grande suite/.test(await msg()), 'the hint frames the grande suite');
await write(10);
await myTurn();

// 7. A reload keeps the game; a reload during the computer's turn finishes it.
const saved = await g(() => JSON.stringify(G));
await page.reload();
await wait(300);
ok(await g(s => JSON.stringify(G) === s, saved), 'a reload brings back the same game');
await click(page.locator('#rollBtn'));
await write(6);
await wait(100);
ok(await g(() => showing && G.turn === 1), "the computer's turn is being shown");
const mid = await g(() => { const s = Yams.computerTurn(G); return JSON.stringify(s[s.length - 1].G); });
await page.reload();
await myTurn();
ok(await g(m => JSON.stringify(G) === m, mid), "a reload during the computer's turn plays the same turn again");

// 8. The end: he wins with the last box, the win is counted once, and undo does not count it twice.
await g(() => {
  G = view = { ...G, sheets: [[3, 6, 9, 12, 15, 18, 18, 24, 25, 30, 40, 50, null], [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, null]], dice: null, rolls: 0, turn: 0 };
  save(); render();
});
await click(page.locator('#rollBtn'));
// An undo while the computer plays its last box: the win was never shown, so it is not counted.
await write(12);
ok(await g(() => showing && !G.result), "the game ends only once the computer's last box is shown");
await page.click('#undoBtn');
await wait(300);
ok(await g(() => !G.result && stats.won === 0 && !GG.meta('yams').summary.includes('victoire')), 'an undo during the last turn counts no win');
await write(12);
await page.waitForFunction(() => !!G.result && document.getElementById('over').classList.contains('on'), null, { timeout: 15000 });
ok(await page.locator('.die svg').count() === 5, 'the last dice stay on the piste for the win');
ok(await g(() => G.result === 'won' && stats.won === 1 && GG.meta('yams').summary === '1 victoire'), 'the win is counted and the tile says so');
ok(await page.locator('#overTitle').textContent() === 'Bravo, vous avez gagné !', 'the win says bravo');
ok(await g(() => document.getElementById('newBtn').hasAttribute('data-nudge')) && /Nouvelle partie/.test(await msg()), 'the end points to « Nouvelle partie »');
await page.screenshot({ path: `${OUT}/yams-won.png` });
await page.keyboard.press('Escape');
await page.click('#undoBtn');
await write(12);
await page.waitForFunction(() => !!G.result, null, { timeout: 15000 });
ok(await g(() => stats.won === 1), 'winning again after an undo does not count a second win');
await page.keyboard.press('Escape');

// A damaged save is not loaded: the game starts again with the rules, and no error. Broken undo steps are dropped.
await g(() => { const v = GG.load('yams'); v.G.dice = [7, 1, 1, 1, 1]; v.G.rolls = 1; localStorage.setItem('gg:save:yams', JSON.stringify({ updatedAt: Date.now(), data: v })); });
await page.reload();
await wait(300);
ok(await g(() => !Kit.isOpen() && G.dice === null && G.level === 'facile'), 'a save with a die of 7 is refused, and a new game starts');
await click(page.locator('#rollBtn'));
await g(() => { const v = GG.load('yams'); v.undo = ['broken', ...v.undo]; localStorage.setItem('gg:save:yams', JSON.stringify({ updatedAt: Date.now(), data: v })); });
await page.reload();
await wait(300);
ok(await g(() => undo.length === 0 && document.getElementById('undoBtn').disabled), 'a broken undo step is dropped');

// A new game during the computer's turn starts clean: he can throw at once.
await write(7);
ok(await g(() => showing), "the computer's turn is being shown");
await page.click('#newBtn');
await page.getByRole('button', { name: 'Facile', exact: true }).click();
await click(page.locator('#rollBtn'));
ok(await g(() => !showing && G.rolls === 1), "a new game during the computer's turn can be played at once");

// A save without a known level still loads, at Facile.
await g(() => { const v = GG.load('yams'); delete v.G.level; localStorage.setItem('gg:save:yams', JSON.stringify({ updatedAt: Date.now(), data: v })); });
await page.reload();
await wait(300);
ok(await g(() => !Kit.isOpen() && G.level === 'facile' && level === 'facile'), 'a save without a level loads at Facile');

// 9. The sizes: dice and rows large enough on his laptop and at 125 %, nothing outside the window.
await page.click('#newBtn');
await page.locator('#overBtns button', { hasText: 'Difficile' }).click();
await click(page.locator('#rollBtn'));
const sizes = () => g(() => {
  const d = document.querySelector('.die').getBoundingClientRect(), r = document.querySelector('#sheet td.v').getBoundingClientRect();
  const s = document.getElementById('sheet').getBoundingClientRect(), t = document.getElementById('tray').getBoundingClientRect();
  return { die: Math.round(d.width), row: Math.round(r.height), fits: s.right <= innerWidth && s.bottom <= innerHeight && t.left >= 0 && t.bottom <= innerHeight };
});
let s = await sizes();
ok(s.die >= 80 && s.row >= 44 && s.fits, `at 1366x680 the dice are ${s.die} px and the rows ${s.row} px`);
await page.screenshot({ path: `${OUT}/yams-table.png` });
await page.setViewportSize({ width: 1093, height: 530 });
await wait(200);
s = await sizes();
ok(s.die >= 56 && s.row >= 34 && s.fits, `at 1093x530 the dice are ${s.die} px and the rows ${s.row} px`);

// 10. A phone: the dice on top, the sheet under them, nothing past the sides.
const phone = await browser.newPage({ viewport: { width: 390, height: 760 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
await phone.goto(URL);
await phone.locator('#rollBtn').click();
const p = await phone.evaluate(() => ({ wide: document.scrollingElement.scrollWidth <= innerWidth,
  sheet: document.getElementById('sheet').getBoundingClientRect().right <= innerWidth,
  die: Math.round(document.querySelector('.die').getBoundingClientRect().width) }));
ok(p.wide && p.sheet && p.die >= 50, `a phone fits the dice (${p.die} px) and the sheet across`);
await phone.screenshot({ path: `${OUT}/yams-phone.png` });

ok(!errors.length, 'no page error' + (errors.length ? ': ' + errors.join(' | ') : ''));
await browser.close();
console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
process.exit(fails ? 1 : 0);
