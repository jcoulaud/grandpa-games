// Plays the petits chevaux with a real mouse: the first visit and the rules, a throw, the horses
// framed with their landing rings, refusals, leaving the stable, a capture, the computer players, double-clicks, the hint,
// undo with the same die, saves across a reload (also during the computer players' turns), the win
// and the loss, broken and old saves, and the layout at every window size of docs/design.md.
import { launch, gameUrl, OUT } from './harness.mjs';
const browser = await launch();
let fails = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const URL = gameUrl('petits-chevaux');

const page = await browser.newPage({ viewport: { width: 1366, height: 680 }, reducedMotion: 'reduce' });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
const g = (fn, arg) => page.evaluate(fn, arg);
const wait = ms => page.waitForTimeout(ms);
const msg = () => g(() => document.getElementById('msg').textContent);
const horse = (p, h) => page.locator(`.horse[data-p="${p}"][data-h="${h}"]`);
// A click, then the mouse moves away and waits, so the next click on the same thing is not a double-click.
const click = async loc => { await loc.click(); await page.mouse.move(5, 5); await wait(520); };
const myTurn = () => page.waitForFunction(() => G.turn === 0 && !showing && !anim && !rolling && G.result === null, null, { timeout: 30000 });
// Sets a game by hand, his turn, with the die already thrown, as after his throw.
const setGame = (horses, die, extra = {}) => g(([horses, die, extra]) => {
  calm(); hint = null; moved = null; noMove = '';
  G = view = { ...PetitsChevaux.newGame('facile', 99), horses, die, ...extra };
  save(); render();
  if (die !== null && G.turn === 0) afterThrow();
}, [horses, die, extra]);
const S = [-1, -1];
const shown = () => g(() => [...document.querySelectorAll('.horse')].filter(e => getComputedStyle(e).display !== 'none').length);
// Writes a save by hand, as an older version or a broken file would leave it.
const writeSave = async fn => g(async fn => { await GG.flush(); const v = GG.load('petits-chevaux'); eval(fn)(v); localStorage.setItem('gg:save:petits-chevaux', JSON.stringify({ updatedAt: Date.now(), data: v })); }, String(fn));
const relTo = (q, p, pos) => g(([q, p, pos]) => (PetitsChevaux.abs(p, pos) - PetitsChevaux.START[q] + 56) % 56, [q, p, pos]);

// 1. The first visit: a game starts at Facile at once, with the coach on the die; the rules open on « Règles ».
await page.goto(URL);
await wait(400);
ok(await g(() => !Kit.isOpen() && G.level === 'facile' && G.die === null), 'the first visit starts a game at Facile, with no dialog');
ok(await g(() => Kit.coaching() && document.getElementById('die').classList.contains('coach')), 'the coach rings the die');
ok(await g(() => document.querySelector('#dieBox .six.on')?.textContent === 'Il faut un 6'), 'with all his horses in the stable, the die says « Il faut un 6 »');
ok(await g(() => document.getElementById('undoBtn').dataset.why === "Il n'y a pas encore de coup à annuler."), 'the grey undo button says why');
await page.click('#helpBtn');
for (let n = 0; n < 5; n++) {
  ok(await g(() => { const t = document.getElementById('helpText'); return t.scrollHeight <= t.clientHeight + 1; }), `rules page ${n + 1} fits without scrolling`);
  await page.screenshot({ path: `${OUT}/petits-chevaux-rules-${n + 1}.png` });
  if (n < 4) await page.click('#helpNext');
}
await page.click('#helpClose');
ok(await g(() => /Amenez vos chevaux au centre/.test(document.querySelector('#help .page').textContent)), 'the first rules page says to bring the horses to the centre, for two or four');
ok(await g(() => [...document.querySelectorAll('#help .page')].every(p => p.querySelector('svg.pc-pic') && p.querySelector('.guide-lead') && [...p.querySelectorAll('p')].map(e => e.textContent).join(' ').split(/\s+/).filter(w => /\w/.test(w)).length <= 25)),
  'each rules page is one picture and at most about 25 words');
ok(await g(() => G.die === null && G.turn === 0 && /chevaux bleus/.test(document.getElementById('msg').textContent)), 'a new game says he plays blue and waits for his throw');
ok(await shown() === 8 && await page.locator('.horse.can').count() === 0, 'two horses each in their stables, none framed before the throw');
ok(await g(() => document.getElementById('die').classList.contains('ready') && !document.getElementById('die').disabled && document.querySelector('#dieBox .hand').getBoundingClientRect().width > 0
  && !document.getElementById('rollBtn').hidden && document.getElementById('rollBtn').hasAttribute('data-nudge') && document.getElementById('todo').hidden),
  'before his throw, the die glows with a hand on it, and the throw button shows and is the one to nudge');
ok(await g(() => document.querySelectorAll('#art text').length === 4 + 6), 'only his own ladder is numbered: four names and six numbers on the board');

// 2. Before the throw: a horse is refused; the button throws the die.
await click(horse(0, 0));
ok(/Lancez d'abord le dé/.test(await msg()), 'a horse before the throw is refused, with the reason');
await page.click('#hintBtn');
ok(/Lancer le dé/.test(await msg()), 'the hint before the throw says to throw');
await click(page.locator('#rollBtn'));
ok(await g(() => G.die >= 1 && G.die <= 6), 'the button throws the die');
ok(await g(() => GG.load('petits-chevaux').G.die === G.die), 'the throw is saved at once');

// 3. A throw with no move: the game says why and passes the turn; the computer players play.
await setGame([S, S, S, S], 3);
ok(/il faut un 6 pour sortir/.test(await msg()) && /Rouge/.test(await msg()), 'no move: the message says why and who plays next');
await page.waitForFunction(() => G.turn !== 0 || showing, null, { timeout: 5000 });
ok(true, 'the turn passes after a pause');
ok(await g(() => /il faut un 6 pour sortir/.test(document.getElementById('why').textContent) && !document.getElementById('why').hidden), 'the reason stays beside the die while the others play');
ok(await g(() => document.getElementById('die').disabled && /^Attendez : c'est à (Rouge|Vert|Jaune) de jouer\.$/.test(document.getElementById('die').dataset.why)), 'the grey die names who plays');
await myTurn();
ok(/À vous : cliquez sur le dé\.$/.test(await msg()), 'after the computer players, the message gives him the hand: ' + await msg());
ok(await g(() => !document.getElementById('why').hidden), 'the reason stays until his next throw');
// A long message of the last computer move is kept when the turn comes back.
await g(() => { calm(); G = view = { ...PetitsChevaux.newGame('facile', 7), horses: [[10, -1], [-1, -1], [-1, -1], [-1, -1]], turn: 3, die: null }; render(); computerPlays(); });
await myTurn();
ok(/À vous : cliquez sur le dé\.$/.test(await msg()) && (await msg()).length > 30, 'the last move stays on the line with his turn: ' + await msg());

// 4. A 6: the two horses in the stable are framed; one click brings one out, and he throws again.
await setGame([S, S, S, S], 6);
ok(await page.locator('.horse.can').count() === 2, 'with a 6, his two horses in the stable are framed');
ok(!/Un seul/.test(await msg()) && /pour le sortir/.test(await msg()), 'the first 6 says to bring out one of his horses: ' + await msg());
await page.click('#hintBtn');
ok(!/Un seul/.test(await msg()), 'the hint on the first 6 does not say only one horse can move: ' + await msg());
ok(await page.locator('#dieBox .six.on').count() === 1, 'the die says a 6 plays again');
ok(await g(() => document.getElementById('rollBtn').hidden && /Cliquez sur un cheval bleu/.test(document.getElementById('todo').textContent) && !document.getElementById('die').classList.contains('ready')),
  'after his throw, the button gives way to the words « Cliquez sur un cheval bleu »');
ok(await page.locator('#marks .land').count() === 1, 'the start square shows where a horse from the stable lands');
await click(horse(0, 1));
ok(await g(() => G.horses[0][1] === 0 && G.turn === 0 && G.die === null), 'one click brings the horse out to the start square');
ok(/sort de l'écurie/.test(await msg()) && /cliquez sur le dé pour rejouer/.test(await msg()), 'the message says so, and to throw again');
ok(await g(() => document.getElementById('why').hidden), 'a new throw takes the old reason away');

// 5. One move only: it still waits for his click, and says so.
await setGame([[10, -1], S, S, S], 4);
ok(/Un seul cheval peut bouger/.test(await msg()) && await g(() => G.horses[0][0] === 10), 'with one move, the game waits for his click and says so');
// A horse of another colour, and his own horse that cannot move, are refused with the reason.
await click(horse(1, 0));
ok(/vos chevaux sont les bleus/.test(await msg()), "a click on another colour's horse is refused");
await click(horse(0, 1));
ok(/Il faut un 6/.test(await msg()), 'a horse in the stable without a 6 is refused, with the reason');
await setGame([[52, 10], S, S, S], 5);
await click(horse(0, 0));
ok(/dépasserait le pied de son échelle : il lui reste 3 cases/.test(await msg()), 'a horse that would go past the foot of its ladder is refused: ' + await msg());
await setGame([[57, 10], S, S, S], 4);
await click(horse(0, 0));
ok(/exactement 3 pour monter sur la marche 3/.test(await msg()), 'a horse on the ladder needs the exact number: ' + await msg());
// A throw that neither horse can use says why for each.
await setGame([[54, 56], S, S, S], 5);
ok(/il faut un 2 pour monter sur la marche 2, et votre cheval à 1 case du pied de l'échelle irait trop loin/.test(await msg()), 'no move with two horses out says why for each: ' + await msg());
await myTurn();
// A click on a horse picks that horse, also beside a framed one: on the base of a blocked horse just
// above the framed horse at the foot of the ladder, then on a red horse one square ahead.
await setGame([[55, 56], S, S, S], 1);
{
  const b = await horse(0, 1).boundingBox();
  await page.mouse.click(b.x + b.width / 2, b.y + b.height * .8); await page.mouse.move(5, 5); await wait(520);
  ok(await g(() => G.horses[0][0] === 55 && G.horses[0][1] === 56) && /exactement 2/.test(await msg()), 'a click on the base of a blocked horse is refused, and the framed horse beside it stays: ' + await msg());
}
await setGame([[10, -1], [await relTo(1, 0, 11), -1], S, S], 2);
await click(horse(1, 0));
ok(await g(() => G.horses[0][0] === 10) && /vos chevaux sont les bleus/.test(await msg()), 'a click on a red horse beside his framed horse moves nothing');
// His two framed horses side by side: a large button for each, under the die.
await setGame([[20, 21], S, S, S], 2);
{
  const labels = await page.locator('#pick button').allTextContents();
  const tall = await g(() => [...document.querySelectorAll('#pick button')].every(b => b.getBoundingClientRect().height >= 44));
  ok(labels.join() === 'Le cheval de devant,Le cheval de derrière' && tall && !(await page.locator('#rollBtn').isVisible()) && /son bouton sous le dé/.test(await msg()),
    'two framed horses side by side get two buttons 44 px or more: ' + labels.join());
  await page.locator('#pick button', { hasText: 'Le cheval de devant' }).hover();
  ok(await g(() => document.querySelector('.horse[data-p="0"][data-h="1"]').classList.contains('hover') && document.getElementById('ghost').classList.contains('on')), 'under the mouse, a button shows its horse and where it lands');
  await click(page.locator('#pick button', { hasText: 'Le cheval de devant' }));
  ok(await g(() => G.horses[0][1] === 23 && G.horses[0][0] === 20), 'the button "Le cheval de devant" moves the front horse');
  await myTurn();
}
// Waiting while the turn comes back to him does not say « c'est à Vous ».
ok(await g(() => { showing = true; view = { ...G, turn: 0 }; refuseBusy(); showing = false; return /bientôt à vous/.test(document.getElementById('msg').textContent); }), 'the wait before his turn is said in French');

// 6. A capture by a click: the red horse goes home; undo brings everything back with the same die.
const red = await relTo(1, 0, 13);
await setGame([[10, 30], [red, -1], S, S], 3);
ok(await page.locator('#marks .land').count() === 2 && await page.locator('#marks .dot').count() === 4, 'each horse that can move shows its landing ring, and dots on the squares it passes');
const before = await g(() => JSON.stringify({ ...G, rng: G.rng.slice(1) }));
await horse(0, 0).click();
ok(await page.waitForFunction(() => /renvoie le cheval rouge à l'écurie !/.test(document.getElementById('msg').textContent), null, { timeout: 2000 }).then(() => true, () => false),
  'the message says so: ' + await msg());
await page.mouse.move(5, 5); await wait(520);
ok(await g(() => G.horses[0][0] === 13 && G.horses[1][0] === -1), 'landing on the red horse sends it home');
await myTurn();
await page.click('#undoBtn');
ok(await g(b => JSON.stringify({ ...G, rng: G.rng.slice(1) }) === b, before), 'undo takes back his move and the computer turns, with the same die');
ok(await page.locator('.horse.can').count() === 2 && /toujours 3/.test(await msg()), 'after undo, the same horses are framed and the message names the die');
// A click on a landing ring moves the horse that lands there.
await click(page.locator('#marks .land[data-h="1"]'));
ok(await g(() => G.horses[0][1] === 33 && G.horses[0][0] === 10), 'a click on the ring where a horse lands moves that horse');
await myTurn();
await page.click('#undoBtn');
// A double-click on a horse moves it once.
await horse(0, 1).dblclick();
await page.mouse.move(5, 5); await wait(520);
ok(await g(() => G.horses[0][1] === 33 && G.horses[0][0] === 10), 'a double-click on a horse counts as one click');
await myTurn();

// 7. The hint frames the horse that takes, and says why.
await setGame([[36, 10], [await relTo(1, 0, 40), -1], S, S], 4);
await page.click('#hintBtn');
ok(await page.locator('.horse.hint[data-h="0"]').count() === 1 && /renvoie le cheval rouge/.test(await msg()), 'the hint frames the horse that takes: ' + await msg());
await click(horse(0, 0));
await myTurn();

// 8. A reload keeps the game; a reload during the computer turns plays the same turns again.
const saved = await g(() => JSON.stringify(G));
await page.reload();
await wait(300);
ok(await g(s => JSON.stringify(G) === s, saved), 'a reload brings back the same game');
await setGame([[10, -1], [5, -1], [8, -1], [3, -1]], 2);
await click(horse(0, 0));
ok(await g(() => showing && G.turn === 1), 'the computer players are playing');
ok(await g(() => new RegExp(`${NAMES[view.turn]} joue`).test(document.getElementById('todo').textContent) && view.turn !== 0 && document.getElementById('rollBtn').hidden && document.getElementById('die').disabled), 'while a computer player plays, the panel says who plays, with no button');
const end = await g(() => { const s = PetitsChevaux.computerTurn(G); return JSON.stringify(s[s.length - 1].G); });
await page.reload();
await myTurn();
ok(await g(e => JSON.stringify(G) === e, end), 'a reload during their turns plays the same turns again');

// 9. The win: the last horse reaches the centre; the win is counted once, also after an undo.
await setGame([[61, 60], S, S, S], 6);
await click(horse(0, 1));
await page.waitForFunction(() => document.getElementById('over').classList.contains('on'), null, { timeout: 8000 });
ok(await page.locator('#overTitle').textContent() === 'Bravo, vous avez gagné !' && /Vos deux chevaux/.test(await page.locator('#overText').textContent()), 'the win says bravo');
ok(await g(() => G.result === 0 && stats.won === 1 && GG.meta('petits-chevaux').summary === '1 victoire'), 'the win is counted and the tile says so');
await page.screenshot({ path: `${OUT}/petits-chevaux-won.png` });
await page.keyboard.press('Escape');
await page.click('#undoBtn');
await click(horse(0, 1));
await page.waitForFunction(() => G.result === 0, null, { timeout: 8000 });
ok(await g(() => stats.won === 1), 'winning again after an undo does not count a second win');
await page.keyboard.press('Escape');
// Undo while the win is being written: the win is still reported, once.
await setGame([[61, 60], S, S, S], 6);
await g(() => {
  stats.won = 0; wonNow = false; undo = []; window.sent = []; GG.track = (game, kind) => sent.push(kind);
  const real = GG.save; window.held = [];
  GG.save = (...a) => new Promise(r => held.push(() => r(real(...a))));
  window.letGo = () => { GG.save = real; held.splice(0).forEach(f => f()); };
});
await horse(0, 1).click();
await page.waitForFunction(() => held.length === 1);
await page.click('#undoBtn');
await g(() => letGo());
await wait(300);
ok(await g(() => sent.filter(k => k === 'won').length === 1 && stats.won === 1 && wonNow && G.result === null), 'undo during the save of a win still reports the win once');
await click(horse(0, 1));
await page.waitForFunction(() => G.result === 0, null, { timeout: 8000 });
await wait(200);
ok(await g(() => sent.filter(k => k === 'won').length === 1 && stats.won === 1), 'winning again after that undo counts nothing more');
await page.keyboard.press('Escape');
// A win that could not be written, while an undo was written after it: the save keeps no win.
await setGame([[61, 60], S, S, S], 6);
{
  const r = await g(async () => {
    stats.won = 0; wonNow = false; undo = []; window.sent = []; GG.track = (game, kind) => sent.push(kind);
    const real = GG.save; let first = true;
    GG.save = (...a) => { if (!first) return real(...a); first = false; return new Promise(r => setTimeout(() => r(false), 300)); };
    tapHorse(0, 1);
    await new Promise(r => setTimeout(r, 50));
    doUndo();
    await new Promise(r => setTimeout(r, 500));
    await GG.flush();
    GG.save = real;
    const v = GG.load('petits-chevaux');
    return { won: v.stats.won, flag: v.wonNow, mem: stats.won, memFlag: wonNow, sent: sent.includes('won') };
  });
  ok(r.won === 0 && !r.flag && r.mem === 0 && !r.memFlag && !r.sent, 'a win that could not be written leaves no win in the save, also after an undo: ' + JSON.stringify(r));
}
await setGame([[10, -1], S, S, S], null);
// A save that fails keeps its warning on the message line, also when the die settles.
await setGame([[10, -1], S, S, S], null);
await g(() => { window.realSave = GG.save; GG.save = async () => false; });
await click(page.locator('#rollBtn'));
await wait(300);
ok(/n'a pas pu être enregistrée/.test(await msg()), 'after a save that failed, the warning stays when the die settles: ' + await msg());
// The hint, a refused horse, a click beside the horses and a throw again do not erase it.
await page.click('#hintBtn');
ok(/n'a pas pu être enregistrée/.test(await msg()), 'the hint keeps the warning: ' + await msg());
await click(horse(1, 0));
ok(/n'a pas pu être enregistrée/.test(await msg()), 'a refused horse keeps the warning: ' + await msg());
await g(() => rollDice());
ok(/n'a pas pu être enregistrée/.test(await msg()), 'a second throw keeps the warning: ' + await msg());
ok(await g(() => { showing = true; refuseBusy(); showing = false; const keep = G; G = { ...G, result: 1 }; finish(false); G = view = keep; render(); return /n'a pas pu être enregistrée/.test(document.getElementById('msg').textContent); }), 'a wait and the end of a game keep the warning');
// A save that works brings the game's words back.
await g(() => { GG.save = realSave; });
await click(horse(0, 0));
ok(!/n'a pas pu être enregistrée/.test(await msg()), 'after a save that works, the game speaks again: ' + await msg());
await myTurn();
await g(() => calm());

// 10. The loss: red's last horse reaches the centre.
await g(() => {
  calm();
  G = view = { ...PetitsChevaux.newGame('facile', 5), horses: [[20, -1], [61, 60], [-1, -1], [-1, -1]], turn: 1, die: 6 };
  undo = []; save(); render(); computerPlays();
});
await page.waitForFunction(() => document.getElementById('over').classList.contains('on'), null, { timeout: 8000 });
ok(await page.locator('#overTitle').textContent() === 'Rouge a gagné' && /Rouge a gagné/.test(await msg()), 'a computer win says who won');
ok(!(await page.locator('#overBtns button', { hasText: 'Annuler' }).count()) && !/Annuler/.test(await page.locator('#overText').textContent()), 'with no move of his to take back, the loss offers no undo');
await page.keyboard.press('Escape');

// 11. Broken and old saves.
await writeSave(v => { v.G.horses[0][0] = 70; v.stats = { won: 12 }; });
await page.reload();
await wait(300);
ok(await g(() => !Kit.isOpen() && G.level === 'facile' && G.die === null), 'a broken save is refused, and a new game starts');
await page.click('#newBtn');
await page.getByRole('button', { name: 'Moyen', exact: true }).click();
ok(await g(() => stats.won === 12 && GG.load('petits-chevaux').stats.won === 12), 'a broken game keeps the count of wins');
// A level that is not a word, an undo step from another level, and a last move that took five horses.
await setGame([[10, -1], S, S, S], 4, { level: 'moyen' });
await writeSave(v => { v.undo = [JSON.stringify({ ...v.G, level: 'fort' }), JSON.stringify(v.G)]; v.G.last = { player: 1, die: 3, horse: 0, from: 2, to: 5, captured: [[0, 0], [0, 0], [0, 0], [0, 0], [0, 0]] }; });
await page.reload();
await wait(300);
ok(await g(() => level === 'moyen' && undo.length === 1 && JSON.parse(undo[0]).level === 'moyen' && G.last === null && !/undefined/.test(document.getElementById('msg').textContent)),
  'an undo step from another level and an impossible last move are dropped');
// A last move that took a horse still on the track, or whose horse is not where it went, is dropped.
await setGame([[10, -1], S, S, [2, -1]], null);
await writeSave(v => { v.G.last = { player: 3, die: 2, horse: 0, from: 0, to: 2, captured: [[0, 0]] }; });
await page.reload();
await wait(300);
ok(await g(() => G.last === null && !/écurie/.test(document.getElementById('msg').textContent)), 'a last move that took a horse still on the track is dropped: ' + await msg());
await writeSave(v => { v.G.horses[0][0] = -1; v.G.horses[3][0] = 3; v.G.last = { player: 3, die: 2, horse: 0, from: 0, to: 2, captured: [[0, 0]] }; });
await page.reload();
await wait(300);
ok(await g(() => G.last === null), 'a last move whose horse is not where it went is dropped');
await writeSave(v => { v.G.horses[3][0] = 2; v.G.last = { player: 3, die: 2, horse: 0, from: 0, to: 2, captured: [[0, 0]] }; });
await page.reload();
await wait(300);
ok(/Le cheval jaune renvoie votre cheval à l'écurie/.test(await msg()), 'a true capture in the save is still said: ' + await msg());
await writeSave(v => { v.G.level = ['fort']; });
await page.reload();
await wait(300);
ok(await g(() => G.level === 'facile' && level === 'facile' && document.getElementById('level').textContent.startsWith('Niveau facile')), 'a level that is not a word loads as Facile, and plays as Facile');
// An older save with four horses each plays on with four.
await writeSave(v => { v.G = { ...v.G, horses: [[61, 61, 61, 60], [-1, -1, -1, -1], [-1, -1, -1, -1], [-1, -1, -1, -1]], die: 6, turn: 0, last: null, result: null }; v.undo = []; v.wonNow = false; });
await page.reload();
await wait(300);
ok(await shown() === 16 && await page.locator('.horse.can').count() === 1, 'an older save with four horses each loads with sixteen horses');
await click(horse(0, 3));
await page.waitForFunction(() => document.getElementById('over').classList.contains('on'), null, { timeout: 8000 });
ok(/Vos quatre chevaux/.test(await page.locator('#overText').textContent()), 'an older game is won with four horses at the centre');
await page.keyboard.press('Escape');
await setGame([[10, -1], S, S, S], 4);
await click(horse(0, 0));
await myTurn();
await writeSave(v => { v.undo = ['broken', '{"x":1}', ...v.undo.map(u => { const g = JSON.parse(u); delete g.level; return JSON.stringify(g); })]; delete v.G.level; delete v.v; v.G.last = { what: 'old' }; });
await page.reload();
await wait(300);
ok(await g(() => !Kit.isOpen() && G.level === 'facile' && level === 'facile' && undo.length === 1 && G.last === null), 'an old save without a level loads at Facile, keeps its undo steps without a level, and drops the broken ones');
// A save stopped on a throw that no horse can use passes the turn after the reload.
await setGame([S, S, S, S], 2);
await page.reload();
await page.waitForFunction(() => G.turn !== 0 || showing, null, { timeout: 8000 });
ok(true, 'a reload on a throw with no move passes the turn');
await myTurn();

// A window that is behind (the game was saved in another window since) counts no game and no win.
{
  const ctx = await browser.newContext({ reducedMotion: 'reduce' });
  const a = await ctx.newPage(), b = await ctx.newPage();
  await a.goto(URL);
  await a.evaluate(() => localStorage.clear());
  await a.reload();
  await b.goto(URL);
  await b.evaluate(() => newGame('facile'));
  await a.evaluate(() => { window.sent = []; GG.track = (game, kind) => sent.push(kind); });
  await a.evaluate(() => newGame('facile'));
  await a.waitForTimeout(100);
  ok(await a.evaluate(() => !sent.includes('start') && document.getElementById('overTitle').textContent === 'Le jeu a changé ailleurs'),
    'a stale window counts no game started and asks to reload');
  const won = await a.evaluate(async () => {
    Kit.closeDialog(); calm();
    G = view = { ...PetitsChevaux.newGame('facile', 1), horses: [[61, 61], [-1, -1], [-1, -1], [-1, -1]], result: 0 };
    const before = stats.won;
    await commit();
    return { counted: stats.won - before, sent: sent.includes('won'), flag: wonNow };
  });
  ok(!won.counted && !won.sent && !won.flag, 'a stale window counts no win');
  await ctx.close();
}

// 12. Motion on: a horse hops square by square, 360 ms a square, and the die rolls 0.9 s.
const live = await browser.newPage({ viewport: { width: 1366, height: 680 } });
live.on('pageerror', e => errors.push(e.message));
await live.goto(URL);
await live.evaluate(() => { calm(); undo = []; G = view = { ...PetitsChevaux.newGame('facile', 3), horses: [[4, -1], [-1, -1], [-1, -1], [-1, -1]], die: 5 }; render(); afterThrow(); });
await live.evaluate(() => document.addEventListener('click', () => { window.moveStarted = performance.now(); }, { capture: true, once: true }));
await live.locator('.horse[data-p="0"][data-h="0"]').click();
ok(await live.evaluate(() => anim && !document.getElementById('undoBtn').disabled), 'during his first move, "Annuler" can already be clicked');
await live.waitForFunction(() => !anim, null, { timeout: 5000 });
const hop = await live.evaluate(() => performance.now() - window.moveStarted);
ok(hop >= 5 * 350 && hop < 3500, `a move of 5 squares takes ${hop} ms`);
const dieRolls = () => document.getElementById('die').classList.contains('rolling');
await live.waitForFunction(dieRolls, null, { timeout: 5000 });
const r0 = Date.now();
await live.waitForFunction(d => !eval(d)(), String(dieRolls), { timeout: 5000 });
ok(Date.now() - r0 >= 700, `a computer player's die rolls ${Date.now() - r0} ms`);
// Undo while a computer player's die rolls: the die shows his number again.
await live.evaluate(() => { calm(); undo = []; G = view = { ...PetitsChevaux.newGame('facile', 3), horses: [[10, -1], [-1, -1], [-1, -1], [-1, -1]], die: 2 }; render(); afterThrow(); });
await live.locator('.horse[data-p="0"][data-h="0"]').click();
await live.waitForFunction(() => showing && rolling, null, { timeout: 8000 });
await live.waitForTimeout(350);
await live.click('#undoBtn');
await live.waitForTimeout(600);
ok(await live.evaluate(() => G.die === 2 && document.querySelectorAll('#die .pips circle').length === 2), 'after undo during a computer throw, the die shows his 2 again');
// His own throw: the button says the die rolls, not « Vous joue ».
await live.evaluate(() => { calm(); G = view = { ...PetitsChevaux.newGame('facile', 3), horses: [[10, -1], [-1, -1], [-1, -1], [-1, -1]] }; render(); });
await live.click('#rollBtn');
ok(await live.evaluate(() => rolling && document.getElementById('todo').textContent === 'Le dé roule…' && document.getElementById('rollBtn').hidden), 'during his throw the panel says « Le dé roule »');
// Full computer turns with motion on, from a new game at seed 3: his opening throw passes, then the
// computer players bring out and move their horses. Each hop ends on the horse's own place.
await live.evaluate(() => {
  window.landings = [];
  const real = moveAnim;
  moveAnim = async (l, after) => {
    await real(l, after);
    if (!l || l.pass || reducedMotion.matches) return;
    const e = horseEl(l.player, l.horse), pl = places(after).find(q => q.p === l.player && q.h === l.horse);
    const x = parseFloat(e.style.getPropertyValue('--x')), y = parseFloat(e.style.getPropertyValue('--y'));
    landings.push({ p: l.player, bad: Math.abs(x - pl.x) < .01 && Math.abs(y - pl.y) < .01 ? '' : `player ${l.player} horse ${l.horse} at ${x},${y}, not ${pl.x},${pl.y}` });
  };
  calm(); undo = []; hint = null; moved = null;
  G = view = PetitsChevaux.newGame('facile', 3); save(); render(); tell(turnText());
});
for (let turn = 0; turn < 10 && await live.evaluate(() => landings.filter(l => l.p !== 0).length) < 8; turn++) {
  await live.waitForFunction(() => G.turn === 0 && !showing && !anim && !rolling && G.result === null, null, { timeout: 90000 });
  // The throw button breathes when he waits (the nudge): a moving button takes a click all the same.
  await live.locator('#rollBtn').waitFor({ state: 'visible' });
  await live.click('#rollBtn', { force: true });
  await live.waitForFunction(() => !rolling, null, { timeout: 5000 });
  if (await live.locator('#pick button').count()) await live.locator('#pick button').first().click();
  else if (await live.locator('.horse.can').count()) await live.locator('.horse.can').first().click();
  await live.mouse.move(5, 5);
  await live.waitForTimeout(520);
}
{
  const l = await live.evaluate(() => landings), theirs = l.filter(x => x.p !== 0).length, bad = l.filter(x => x.bad).map(x => x.bad);
  ok(theirs >= 8 && !bad.length, `with motion on, ${theirs} computer moves in full turns each land on the horse's place${bad.length ? ': ' + bad.join('; ') : ''}`);
}
// The rules and level picker can stay open until after the celebration ends.
for (const button of ['helpBtn', 'newBtn']) {
  await live.evaluate(() => {
    calm();
    const game = PetitsChevaux.newGame('facile', 5);
    game.horses[0] = [61, 60];
    G = view = { ...game, die: 6 };
    render(); afterThrow();
  });
  await live.locator('.horse.can').click();
  await live.waitForSelector('.winner-shoe');
  await live.click('#' + button);
  await live.waitForFunction(() => pendingResult !== null);
  await live.keyboard.press('Escape');
  await live.waitForFunction(() => document.querySelector('#over.on #overTitle')?.textContent === 'Bravo, vous avez gagné !');
  ok(true, `the win dialog follows the closed ${button === 'helpBtn' ? 'rules' : 'level picker'}`);
  await live.keyboard.press('Escape');
}
await live.close();

// 13. The layout at every window size: nothing past the window, buttons 44 px or more, text 20 px or
// more (13 on a phone), no text cut, and the board's squares as large as the room allows.
const sizes = [[1366, 680, 1], [1093, 530, 1], [1920, 1000, 1], [1280, 620, 1], [390, 760, 1], [1366, 680, 1.3], [1920, 1000, 1.75]];
for (const [w, h, z] of sizes) {
  const phone = w < 700;
  const p = await browser.newPage({ viewport: { width: w, height: h }, reducedMotion: 'reduce', ...(phone ? { isMobile: true, hasTouch: true } : {}) });
  await p.goto(URL);
  await p.evaluate(z => { localStorage.setItem('gg:size', String(z)); }, z);
  await p.reload();
  await p.waitForTimeout(300);
  const name = `${w}x${h}${z !== 1 ? ' at ' + z * 100 + ' %' : ''}`;
  // The rules: each page fits without scrolling in a window 620 px high or more.
  if (h / z >= 620) {
    await p.click('#helpBtn');
    const fit = [];
    for (let n = 0; n < 5; n++) {
      fit.push(await p.evaluate(() => { const t = document.getElementById('helpText'); return t.scrollHeight <= t.clientHeight + 1; }));
      await p.click('#helpNext');
    }
    await p.evaluate(() => Kit.closeHelp());
    ok(fit.every(Boolean), `${name}: every rules page fits without scrolling (${fit.map(f => f ? 'ok' : 'scrolls').join(', ')})`);
  }
  // A busy game, with his two framed horses side by side, and the longest kind of message.
  await p.evaluate(() => {
    calm();
    G = view = { ...PetitsChevaux.newGame('facile', 5), horses: [[12, 13], [20, 61], [5, 40], [61, 33]], die: 6 };
    render(); afterThrow();
    Kit.say('Le cheval jaune renvoie votre cheval à l’écurie. À vous : cliquez sur le dé.');
  });
  await p.waitForTimeout(250);
  const r = await p.evaluate(phone => {
    const W = innerWidth, H = innerHeight, bad = [];
    const box = e => e.getBoundingClientRect();
    const seen = e => { const s = getComputedStyle(e); const b = box(e); return s.visibility !== 'hidden' && s.display !== 'none' && b.width > 0 && b.height > 0; };
    const z = Zoom.z();
    for (const id of ['bar', 'msg', 'frame', 'side', 'rail']) {
      const e = document.getElementById(id);
      if (!e || !seen(e)) continue;
      const b = box(e);
      // The table of a phone scrolls down; nothing goes past the sides.
      if (b.left < -1 || b.right > W + 1 || (!phone && b.bottom > H + 1)) bad.push(`${id} outside the window`);
    }
    if (document.documentElement.scrollWidth > W + 1) bad.push('the page scrolls sideways');
    for (const b of document.querySelectorAll('button')) {
      if (!seen(b) || b.closest('#help, #over') || b.classList.contains('horse')) continue;
      if (box(b).height / z < (phone ? 44 : 44) - .5) bad.push(`button "${b.textContent.trim()}" is ${Math.round(box(b).height / z)} px high`);
    }
    for (const e of document.querySelectorAll('#bar *, #msg, #side *, #rail *')) {
      if (!seen(e) || ![...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())) continue;
      const fs = parseFloat(getComputedStyle(e).fontSize);
      if (fs < (phone ? 13 : 20) - .1) bad.push(`"${e.textContent.trim().slice(0, 30)}" is ${fs} px`);
      if (e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).overflow !== 'visible') bad.push(`"${e.textContent.trim().slice(0, 30)}" is cut`);
    }
    // The words of the panel stay inside the window.
    const todo = document.getElementById('todo');
    if (seen(todo) && (box(todo).right > W + 1 || box(todo).left < -1)) bad.push('the words of the panel go past the window');
    // The names in the stables are 20 px or more on a computer.
    const label = box(document.querySelector('#art text')).height / z;
    if (!phone && label < 20) bad.push(`the stable names are ${label.toFixed(1)} px`);
    const cell = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--cell'));
    return { bad, cell };
  }, phone);
  // An older save with four horses side by side: when the buttons show, all four fit in the table,
  // each 44 px or more, with distinct names that are not cut, and the rear one moves the rear horse.
  const four = await p.evaluate(() => {
    calm(); const s4 = [-1, -1, -1, -1];
    G = view = { ...PetitsChevaux.newGame('facile', 5), horses: [[20, 21, 22, 23], s4, s4, s4], die: 2 }; render(); afterThrow();
    const bs = [...document.querySelectorAll('#pick button')], bad = [], t = document.getElementById('table');
    if (!crowded) return { crowded, bad };
    if (bs.length !== 4) return { crowded, bad: [`the four horses get ${bs.length} buttons`] };
    // Beside the board the table does not scroll; under the board (a narrow window) it scrolls down.
    const col = t.classList.contains('col');
    if (!col && t.scrollHeight > t.clientHeight + 1) bad.push(`the table needs ${t.scrollHeight} px of height and has ${t.clientHeight}`);
    for (const b of bs) {
      if (col) b.scrollIntoView({ block: 'nearest' });
      const tb = t.getBoundingClientRect(), bb = b.getBoundingClientRect(), name = b.textContent;
      if (bb.top < tb.top - 1 || bb.bottom > tb.bottom + 1 || bb.left < tb.left - 1 || bb.right > Math.min(tb.right, innerWidth) + 1) bad.push(`button "${name}" is outside the table`);
      if (bb.height / Zoom.z() < 44 - .5) bad.push(`button "${name}" is ${Math.round(bb.height / Zoom.z())} px high`);
      if (b.scrollWidth > b.clientWidth + 1 || b.scrollHeight > b.clientHeight + 1) bad.push(`button "${name}" is cut`);
    }
    if (new Set(bs.map(b => b.textContent)).size !== 4) bad.push('two buttons have the same name');
    return { crowded, bad };
  });
  r.bad.push(...four.bad);
  if (four.crowded && !four.bad.length) {
    await p.locator('#pick button', { hasText: 'Derrière' }).click();
    await p.waitForTimeout(300);
    r.bad.push(...await p.evaluate(() => G.horses[0][0] === 22 ? [] : ['the button "Derrière" moved ' + JSON.stringify(G.horses[0])]));
  }
  if (w === 1093) ok(four.crowded, `${name}: four horses side by side get a button each`);
  // A click at this size, a little beside the pawn, still moves the right horse.
  if (!phone) {
    await p.evaluate(() => { calm(); G = view = { ...PetitsChevaux.newGame('facile', 5), horses: [[20, 21], [-1, -1], [-1, -1], [-1, -1]], die: 2 }; render(); afterThrow(); });
    const bx = await p.locator('.horse[data-p="0"][data-h="1"]').boundingBox();
    await p.mouse.click(bx.x + bx.width * .5 + bx.width * .3, bx.y + bx.height * .6);
    await p.waitForTimeout(300);
    r.bad.push(...await p.evaluate(() => G.horses[0][1] === 23 && G.horses[0][0] === 20 ? [] : ['a click beside the second horse moved ' + JSON.stringify(G.horses[0])]));
  }
  ok(!r.bad.length, `${name}: nothing outside the window, buttons and text large enough (squares ${r.cell} px)${r.bad.length ? ': ' + r.bad.join('; ') : ''}`);
  await p.screenshot({ path: `${OUT}/petits-chevaux-${w}x${h}${z !== 1 ? '-' + z * 100 : ''}.png` });
  await p.close();
}
const cellAt = await (async () => {
  const p = await browser.newPage({ viewport: { width: 1920, height: 1000 }, reducedMotion: 'reduce' });
  await p.goto(URL); await p.evaluate(() => { localStorage.setItem('gg:size', '1'); });
  const c = await p.evaluate(() => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--cell')));
  await p.close();
  return c;
})();
ok(cellAt >= 44, `the squares grow to ${cellAt} px on a 1920x1000 monitor`);

ok(!errors.length, 'no page error' + (errors.length ? ': ' + errors.join(' | ') : ''));
await browser.close();
console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
process.exit(fails ? 1 : 0);
