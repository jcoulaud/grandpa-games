// Plays the belote with a real mouse: the rules guide, the bids, refusals, the computer players, undo,
// hint, saves across a reload, belote and rebelote, the end of a hand, the win, a broken save, and the
// layout at every window size of docs/design.md.
import { launch, gameUrl, OUT } from './harness.mjs';
const browser = await launch();
let fails = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const URL = gameUrl('belote');

let page = await browser.newPage({ viewport: { width: 1366, height: 680 } });
const errors = [];
const watch = p => p.on('pageerror', e => errors.push(e.message));
watch(page);
const g = (fn, arg) => page.evaluate(fn, arg);
const wait = ms => page.waitForTimeout(ms);
const msg = () => g(() => document.getElementById('msg').textContent);
const until = async (fn, arg, tries = 150) => { for (let i = 0; i < tries; i++) { if (await g(fn, arg)) return true; await wait(100); } return false; };
// Clicks a card of his hand where it shows, then moves the mouse away and waits past the double-click time.
const clickCard = async c => {
  await g(c => els.get(c).flight?.finished.catch(() => {}), c);
  const r = await g(c => { const b = document.querySelector(`.card.hand[data-c="${c}"]`).getBoundingClientRect(); return [b.left + 12, b.top + 14]; }, c);
  await page.mouse.click(...r); await page.mouse.move(5, 5); await wait(560);
};
const myTurn = () => until(() => G.turn === 0 && !busy && (G.phase === 'play' || G.phase.startsWith('bid')));
const SU = 'SHDC', RK = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const card = n => SU.indexOf(n.slice(-1)) * 13 + RK.indexOf(n.slice(0, -1));
// Puts a hand in progress on the table: the cards of each seat, the trick in progress, and every other card
// played in earlier tricks, so the game passes the check of a save.
const setHand = (hands, trump, extra = {}) => g(([hands, trump, extra]) => {
  cancelAll();
  const SU = 'SHDC', RK = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
  const card = n => SU.indexOf(n.slice(-1)) * 13 + RK.indexOf(n.slice(0, -1));
  const hs = hands.map(h => Belote.sortHand(h.split(' ').filter(Boolean).map(card), trump));
  const trick = (extra.trick || []).map(card), leader = extra.leader ?? 0;
  const held = new Set(hs.flat().concat(trick)), rest = Belote.DECK.filter(c => !held.has(c));
  const log = rest.map((c, i) => [i % 4, c]).concat(trick.map((c, i) => [(leader + i) % 4, c]));
  delete extra.trick;
  G = Object.assign({ v: 1, target: 501, scores: [0, 0], handNo: 0, dealer: 3, phase: 'play', hands: hs, turnup: rest[0], stock: [],
    bids: [[0, 'take']], redeal: false, turn: (leader + trick.length) % 4, leader, taker: 0, trump, trick, tricks: rest.length / 4,
    won: [0, 0], tricksWon: [0, 0], belote: null, said: 0, log, voids: [0, 1, 2, 3].map(() => [false, false, false, false]),
    caps: [8, 8, 8, 8], last: null, handPts: null, outcome: null, capot: null, seed: 1, result: null }, extra);
  if (!Belote.check(G)) throw new Error('bad test hand');
  undo = []; hint = null; started = true; note = ''; wonNow = false; sentWin = false;
  save(); render(); step();
}, [hands, trump, extra]);

// 1. The first visit: the rules open, and each page fits without scrolling.
await page.goto(URL);
await wait(400);
ok(await g(() => Kit.isOpen()), 'the rules open on the first visit');
const pages = await g(() => document.querySelectorAll('#helpText .page').length);
for (let n = 0; n < pages; n++) {
  ok(await g(() => { const t = document.getElementById('helpText'); return t.scrollHeight <= t.clientHeight + 1; }), `rules page ${n + 1} fits without scrolling`);
  await page.screenshot({ path: `${OUT}/belote-rules-${n + 1}.png` });
  await page.click('#helpNext');
}
const guide = await g(() => document.getElementById('help').textContent);
ok(guide.includes('ici le valet de cœur') && guide.includes('Sans elle, si André gagne le pli') && guide.includes("à l'atout plus fort si vous pouvez.")
  && guide.includes("plus fort qu'un atout posé si possible. Sans atout, jouez ce que vous voulez.") && guide.includes('il vaut 100 points')
  && guide.includes("En cas d'égalité, on joue une manche de plus."), 'the guide names the card shown, and gives each rule with its condition');
await page.getByRole('button', { name: 'Moyen', exact: true }).click();
ok(!(await g(() => Kit.isOpen())) && await g(() => level === 'moyen'), 'the level is chosen after the rules');
ok(await g(() => [1, 2, 3].every(s => document.querySelector(`#seat${s} img.ava`).src.endsWith(`/lib/avatars/${['', 'henri', 'andre', 'simone'][s]}.webp`))), 'Henri, André and Simone show their faces');

// 2. The bids. Simone deals, so he speaks first.
await myTurn();
ok(await g(() => G.phase === 'bid1' && G.hands[0].length === 5 && document.getElementById('bidBar').classList.contains('on')), 'he speaks first, with 5 cards, and the bid bar shows');
await g(() => els.get(G.turnup).flight?.finished.catch(() => {}));
ok(await g(() => { const t = document.querySelector('.card.turnup'), r = t.getBoundingClientRect(), m = document.getElementById('mid').getBoundingClientRect();
  return +t.dataset.c === G.turnup && r.left >= m.left && r.right <= m.right; }), 'the retourne lies face up on the mat');
ok((await g(() => [...document.querySelectorAll('#bidBtns button')].map(b => b.textContent.trim()).join('|'))) === 'Je prends|Je passe', 'first round: "Je prends" and "Je passe"');
ok(await until(() => document.getElementById('msg').textContent.startsWith('À vous de parler : prenez-vous à')), 'the line asks whether he takes');
await page.screenshot({ path: `${OUT}/belote-bid.png` });
const hand5 = await g(() => G.hands[0].slice());
await clickCard(hand5[0]);
ok((await msg()).includes('prendre ou de passer') && await g(() => G.hands[0].length === 5), 'a click on a card during the bids is refused, and says why');
await page.click('#hintBtn');
ok(await g(() => !!document.querySelector('#bidBtns button.hint')) && (await msg()).startsWith('Conseil'), 'the hint marks a bid in yellow and says why');
// A double-click on "Je passe" passes once.
const passBtn = page.locator('#bidBtns button[data-bid="pass"]');
await passBtn.dblclick();
await wait(200);
ok(await g(() => G.bids.filter(b => b[0] === 0).length === 1), 'a double-click on "Je passe" counts as one click');
ok((await msg()) === 'Vous passez.' || (await msg()).includes('passe'), 'the line says he passed');
await until(() => G.bids.length >= 2);
ok(await g(() => document.getElementById('seat1').textContent.includes('Passe') || G.taker === 1), 'Henri answers after him, on his right');
// Undo takes back his pass and the bids after it.
await page.click('#undoBtn');
ok(await g(() => G.phase === 'bid1' && G.bids.length === 0 && G.turn === 0), 'undo takes back his pass and the bids after it');
await page.locator('#bidBtns button[data-bid="take"]').click();
// A card still flying in: pressed where it shows, released after it moved on, the click still gets an answer.
const flying = await g(() => { const c = G.hands[0].find(c => els.get(c).getAnimations().some(a => a.playState === 'running'));
  if (c === undefined) return null; const b = els.get(c).getBoundingClientRect(); return [c, b.left + 12, b.top + 14]; });
if (flying) {
  await page.mouse.move(flying[1], flying[2]); await page.mouse.down(); await wait(250); await page.mouse.up(); await page.mouse.move(5, 5);
  ok((await msg()).includes('Attendez') && await g(() => G.hands[0].length === 8), 'a card pressed while it flies in is not played, and the line says to wait');
} else ok(false, 'a card of the deal is flying in');
ok(await g(() => busy && !document.querySelector('.card.hand.can')), 'his cards cannot be played until they land');
await wait(560);
ok(await g(() => G.phase === 'play' && G.taker === 0 && G.hands[0].length === 8 && G.hands[0].includes(G.turnup)), 'he takes: he gets the retourne and has 8 cards');
ok(await g(() => document.querySelector(`.card.hand[data-c="${G.turnup}"] .got`)?.textContent === 'Retourne'), 'the retourne in his hand has a tag');
ok(await g(() => document.getElementById('atoutBox').textContent.includes('Atout ' + Cards.SUIT_NAMES[G.trump]) && document.getElementById('atoutBox').textContent.includes('Vous avez pris')), 'the side column shows the trump, large, and who took');
ok(await g(() => !!document.querySelector('#mid svg')), 'the trump is drawn on the mat');
await wait(1800);
await page.screenshot({ path: `${OUT}/belote-taken.png` });

// 3. He leads: a card is played with one click; the others answer.
await myTurn();
ok(await g(() => document.getElementById('mySlot').classList.contains('on') && document.getElementById('seat0').textContent.includes('À vous de jouer')), 'his turn shows: his place in the trick and his seat');
const lead = await g(() => G.hands[0][G.hands[0].length - 1]);
await clickCard(lead);
ok(await g(c => !G.hands[0].includes(c) && G.log.length === 1, lead), 'a card is played with one click');
ok(await g(() => !document.querySelector('.card.hand .got')), 'the tag on the retourne goes once he plays');
ok(await g(() => document.querySelectorAll('.card.trick .first').length === 1), 'the first card of the trick has a "1er" tag');
await until(() => G.log.length >= 2);
ok(await g(() => G.log[1][0] === 1), 'Henri, on his right, plays next');
// A click while the others play is refused.
const n5 = await g(() => G.hands[0].length);
if (await g(() => G.turn !== 0)) {
  await clickCard(await g(() => G.hands[0][0]));
  ok((await g(() => G.hands[0].length)) === n5 && (await msg()).includes('Attendez'), 'a click while the others play is refused');
}

// 4. A refused card says why; undo; reload; hint.
await setHand(['AS 7H', '8D 9D', '8C 9C', 'KD'], 1, { trick: ['KS'], leader: 3 });
await myTurn();
await clickCard(card('7H'));
ok(await g(c => G.hands[0].includes(c), card('7H')) && (await msg()) === 'Vous avez du pique : vous devez en jouer.', 'a card that may not be played stays, and the line says why');
ok(await g(c => {
  const b = document.getElementById('bubble'), r = b.getBoundingClientRect(), k = document.querySelector(`.card.hand[data-c="${c}"]`).getBoundingClientRect();
  return b.classList.contains('on') && r.bottom <= k.top && r.right > k.left && r.left < k.right;
}, card('7H')), 'the reason also shows in a bubble just above the card');
ok(await g(c => document.querySelector(`.card.hand[data-c="${c}"]`).classList.contains('no'), card('7H')), 'the card that may not be played is darker');
await page.screenshot({ path: `${OUT}/belote-refused.png` });
await setHand(['JH 7H AD', '8D 9D', '8C 9C', 'KD QD'], 1, { trick: ['AS', '9S', '9H'], leader: 1 });
await myTurn();
ok((await msg()).endsWith('coupez avec un atout plus fort que celui posé.'), 'trumped by the other team: his turn says to trump higher');
await clickCard(card('AD'));
ok((await msg()) === 'Vous devez surcouper : jouez un atout plus fort que celui posé.', 'trumped by the other team: he must trump higher, and the line says so');
// Only a lower trump: he must play it, and may not discard (FFB 5.2).
await setHand(['8H 7H AD', '8D 9D', '8C 9C', 'KD QD'], 1, { trick: ['AS', '9S', '9H'], leader: 1 });
await myTurn();
ok((await msg()).endsWith('jouez un atout, même plus faible.'), 'trumped higher than his trumps: his turn says to play a lower trump');
await clickCard(card('AD'));
ok(await g(c => G.hands[0].includes(c), card('AD')) && (await msg()) === "Vous n'avez pas de pique : vous devez jouer un atout, même plus faible.", 'a discard is refused while he holds a lower trump');
await clickCard(card('7H'));
ok(await g(c => !G.hands[0].includes(c), card('7H')), 'the lower trump is played');
// A click refused before his turn does not swallow the click he makes once it is his turn.
await setHand(['8H 7H AD', '8D 9D 10D', '8C 9C 10C', 'KD QD JD'], 1, { trick: [], leader: 0 });
await myTurn();
const pos = await g(c => { const b = document.querySelector(`.card.hand[data-c="${c}"]`).getBoundingClientRect(); return [b.left + 12, b.top + 14]; }, card('AD'));
await g(([c, x, y]) => { lastTap = { t: performance.now(), c, x, y, turn: 'an earlier turn' }; }, [card('AD'), ...pos]);
await page.mouse.click(...pos); await page.mouse.move(5, 5);
ok(await g(c => !G.hands[0].includes(c), card('AD')), 'a click right after a refused one, in a new turn, is played');
await wait(560);
await setHand(['JH 7H AD 8C', '7S 7D 7C 10D', 'KS 8S 8D', 'QS 9D 10S'], 1, { trick: ['AS', '9S'], leader: 2 });
await myTurn();
ok((await msg()).includes('André gagne le pli') && await g(() => Belote.legal(G).length === 4), 'his partner winning: he may play any card, and the line says so');

await setHand(['AS 7S 8H 9H', '8D 9D 10D JD', '8C 9C 10C JC', 'KD QD KC QC'], 1, { trick: [], leader: 0 });
await myTurn();
const snap = await g(() => JSON.stringify(G));
await clickCard(card('AS'));
await wait(1700);
await page.click('#undoBtn');
ok((await g(() => JSON.stringify(G))) === snap, 'undo puts the table back as it was before his card');
ok((await msg()).startsWith('Coup annulé'), 'the line says the move is taken back');
await page.evaluate(() => GG.flush());
await page.reload(); await wait(400);
ok((await g(() => JSON.stringify(G))) === snap && await g(() => level === 'moyen'), 'a reload brings back the same game and the level');
await page.click('#hintBtn'); await wait(600);
ok(await g(() => hint && Belote.legal(G).includes(hint.card) && !!document.querySelector('.card.hand.hint')), 'the hint frames a card he may play');
ok((await msg()).startsWith('Posez '), 'the hint says which card');

// 5. Belote and rebelote.
await setHand(['KH QH', '7S 8S', 'AS 9S', '10S JS'], 1, { belote: 0 });
await myTurn();
await clickCard(card('KH'));
ok(await g(() => G.said === 1 && document.querySelector('.callout')?.textContent === 'Belote !') && (await msg()).includes('« Belote ! »'), 'the king of trumps: "Belote !" shows and the line says it');
await myTurn();
await clickCard(card('QH'));
ok(await g(() => G.said === 2) && (await msg()).includes('« Rebelote ! »'), 'then the queen: "Rebelote !"');

// 6. The end of a hand: the score sheet, which Escape does not close, then the next hand.
await until(() => document.getElementById('scoreSheet').classList.contains('on'));
ok(await g(() => G.phase === 'done' && G.handPts[0] === G.won[0] + 20), 'the hand is scored with the belote');
ok((await g(() => document.getElementById('scoreTitle').textContent)) === 'Fin de la manche 1' && (await g(() => document.getElementById('scoreNote').textContent)).includes('contrat réussi'), 'the score sheet says the contract is made');
await page.screenshot({ path: `${OUT}/belote-scores.png` });
await page.keyboard.press('Escape');
ok(await g(() => document.getElementById('scoreSheet').classList.contains('on')), 'Escape leaves the score sheet in place');
await page.evaluate(() => GG.flush());
await page.reload(); await wait(400);
ok(await g(() => document.getElementById('scoreSheet').classList.contains('on')), 'the score sheet comes back after a reload');
const total = await g(() => G.scores.slice());
await page.click('#nextBtn'); await wait(300);
ok(await g(t => G.phase === 'bid1' && G.handNo === 1 && G.dealer === 0 && G.scores.join() === t.join() && !undo.length, total), 'the next hand is dealt by him, and the scores carry on');
await until(() => G.turn === 0 || G.phase === 'play');

// Dedans: the taker's team marks nothing, the other 162.
await setHand(['7S', '8S', '9S', 'AS'], 1, { taker: 0, won: [40, 100], tricksWon: [3, 4] });
await myTurn();
await clickCard(card('7S'));
await until(() => document.getElementById('scoreSheet').classList.contains('on'));
ok(await g(() => G.outcome === 'dedans' && G.handPts.join() === '0,162') && (await g(() => document.getElementById('scoreNote').textContent)).includes('dedans'), 'dedans: the sheet says so, and the others mark 162');
// Henri dedans, and a tie at 501: his team "marquez", and one more hand.
await setHand(['7S', '8S', '9S', 'AS'], 1, { taker: 1, won: [100, 40], tricksWon: [4, 3], scores: [339, 501] });
await myTurn();
await clickCard(card('7S'));
await until(() => document.getElementById('scoreSheet').classList.contains('on'));
ok((await g(() => document.getElementById('scoreNote').textContent)) === 'Henri a pris à cœur et est dedans : vous et André marquez 162 points. Égalité à 501 points : on joue une manche de plus.'
  && await g(() => G.phase === 'done'), 'a tie at 501: the sheet says why one more hand is played, with "vous et André marquez"');

// 7. The win: past 501, counted once.
await setHand(['AS', 'KS', 'QS', 'JS'], 1, { scores: [371, 300], won: [100, 32], tricksWon: [5, 2], taker: 0 });
await myTurn();
await clickCard(card('AS'));
await page.waitForFunction(() => document.querySelector('#joy i') || motion.matches);
if (!(await g(() => motion.matches))) {
  ok(await g(() => !Kit.isOpen()), 'suit cards drift down before the win dialog');
  await page.click('#helpBtn');
  await page.waitForFunction(() => !document.querySelector('#joy i'));
  ok(await g(() => !!document.querySelector('#help.on')), 'the rules stay open when the win animation ends');
  await page.click('#helpClose');
}
await until(() => document.getElementById('over').classList.contains('on'));
ok(await g(() => G.phase === 'over' && G.result.winner === 0 && stats.won === 1), 'he wins past 501 points');
ok((await g(() => document.getElementById('overTitle').textContent)) === 'Bravo, vous avez gagné !', 'the win sheet shows');
ok(await g(() => /atteignez 501 points[^]*\nLes points : Vous et André 501, Simone et Henri 3\d\d\./.test(document.getElementById('overText').textContent)), 'the win sheet says why the game ended, with both totals');
await page.screenshot({ path: `${OUT}/belote-won.png` });
ok((await g(() => GG.meta('belote').summary)) === '1 victoire', 'the library tile shows the win');
await page.evaluate(() => GG.flush());
await page.reload(); await wait(400);
ok(await g(() => stats.won === 1 && G.phase === 'over'), 'a reload does not count the win again');
await g(() => Kit.closeDialog());
// Undo takes back the winning card: the win is no longer counted, and the tile says so. Played again, it counts once.
await page.click('#undoBtn');
await page.evaluate(() => GG.flush());
ok(await g(() => G.phase === 'play' && stats.won === 0 && !wonNow) && (await g(() => GG.meta('belote').summary)) === 'Partie en cours', 'undo of the winning card takes the win back');
await g(() => { window.sentWins = 0; const track = GG.track; GG.track = (game, kind) => { if (kind === 'won') sentWins++; return track(game, kind); }; });
await myTurn();
await clickCard(card('AS'));
await until(() => G.phase === 'over' && !busy);
await page.evaluate(() => GG.flush());
ok(await g(() => stats.won === 1 && sentWins === 0), 'won again, the win counts once, and the statistics get it once');
await until(() => document.getElementById('over').classList.contains('on'));
await g(() => Kit.closeDialog());

// A win whose save waits for the lock, then undo before it is written: the statistics still get the win, once.
await setHand(['AS', 'KS', 'QS', 'JS'], 1, { scores: [371, 300], won: [100, 32], tricksWon: [5, 2], taker: 0 });
await g(() => GG.flush());
await g(() => { wonNow = false; sentWin = false; sentWins = 0; stats.won = 0;
  const held = new Promise(r => { window.releaseLock = r; }); navigator.locks.request('gg:save:belote', () => held); });
await myTurn();
await clickCard(card('AS'));
await until(() => G.phase === 'over');
await g(() => doUndo());
await g(() => releaseLock());
await page.evaluate(() => GG.flush());
ok(await g(() => sentWins === 1 && G.phase === 'play' && stats.won === 0), 'a win undone while its save waits still reaches the statistics');
await myTurn();
await clickCard(card('AS'));
await until(() => G.phase === 'over' && !busy);
await page.evaluate(() => GG.flush());
ok(await g(() => sentWins === 1 && stats.won === 1), 'won again after that undo: the statistics do not get it twice');
await until(() => document.getElementById('over').classList.contains('on'));
await g(() => Kit.closeDialog());

// A capot: the dix de der is 100, so the tricks show 252 on the score sheet (FFB 9.2).
await setHand(['AS', 'KS', 'QS', 'JS'], 1, { won: [132, 0], tricksWon: [7, 0], taker: 0 });
await myTurn();
await clickCard(card('AS'));
await until(() => document.getElementById('scoreSheet').classList.contains('on'));
ok(await g(() => [...document.querySelectorAll('#scoreTable tr')].find(r => r.cells[0].textContent === 'Les plis')?.textContent === 'Les plis2520'
  && G.last.pts === 120 && document.getElementById('lastText').textContent.includes('120 points')), 'a capot: the tricks show 252, and the last trick 120 with its dix de der of 100');

// A card pressed while it flies in, held until it lands, and released on the bare table, is not played.
await g(() => { cancelAll(); G = Belote.newGame(Belote.seeded(4)); undo = []; hint = null; render(); });
await g(() => myBid('take'));
const fly = await g(() => {
  const c = G.hands[0].find(c => els.get(c).getAnimations().some(a => a.playState === 'running'));
  if (c === undefined) return null;
  const b = els.get(c).getBoundingClientRect(), x = b.left + b.width / 2, y = b.top + b.height / 2;
  const top = document.elementFromPoint(x, y)?.closest('.card.hand');
  return top ? [+top.dataset.c, x, y] : null;
});
if (fly) {
  await page.mouse.move(fly[1], fly[2]); await page.mouse.down();
  await until(() => !busy);
  await g(c => els.get(c).flight?.finished.catch(() => {}), fly[0]);
  const bare = await g(([c, x, y]) => +document.elementFromPoint(x, y)?.closest('.card.hand')?.dataset.c !== c, fly);
  await page.mouse.up(); await page.mouse.move(5, 5);
  ok(bare && await g(() => G.hands[0].length === 8 && !G.log.length), 'a release on the bare table, once the cards landed, plays no card');
} else ok(false, 'a card of the deal is flying in');
await wait(560);

// With reduced motion: a card played, undone with Ctrl+Z, and clicked again at once is played again.
await page.emulateMedia({ reducedMotion: 'reduce' });
await setHand(['AS 7S', '8S 9S', '10S JS', 'QS KS'], 1, {});
await myTurn();
const again = await g(c => { const b = document.querySelector(`.card.hand[data-c="${c}"]`).getBoundingClientRect(); return [b.left + 12, b.top + 14]; }, card('AS'));
await page.mouse.click(...again);
await page.keyboard.press('Control+z');
ok(await g(c => G.hands[0].includes(c), card('AS')), 'Ctrl+Z takes the card back');
await page.mouse.click(...again); await page.mouse.move(5, 5);
ok(await g(c => !G.hands[0].includes(c), card('AS')), 'the same card clicked again right after undo is played');
await page.emulateMedia({ reducedMotion: 'no-preference' });
await wait(560);

// The loss.
await setHand(['7S', '8S', '9S', 'AS'], 1, { scores: [300, 450], won: [40, 100], tricksWon: [3, 4], taker: 1 });
await myTurn();
await clickCard(card('7S'));
await until(() => document.getElementById('over').classList.contains('on'));
ok(await g(() => G.result.winner === 1 && stats.won === 1 && document.getElementById('overTitle').textContent === 'Simone et Henri ont gagné'), 'the other team wins: the sheet says so, and no win is counted');
await g(() => Kit.closeDialog());

// An undo step from another deal is dropped when the save is read: undo would wait for Henri forever.
await g(() => { const s = JSON.parse(localStorage.getItem('gg:save:belote')); const other = Belote.bid(Belote.newGame(Belote.seeded(12)), 'pass');
  s.data.undo = [JSON.stringify(other)]; localStorage.setItem('gg:save:belote', JSON.stringify(s)); });
await page.reload(); await wait(400);
ok(await g(() => !undo.length && document.getElementById('undoBtn').disabled), 'an undo step from another deal is not kept');

// 8. A broken save starts a new game and keeps the wins and the level; an unknown level loads as Facile.
await g(() => { localStorage.setItem('gg:save:belote', JSON.stringify({ updatedAt: Date.now(), summary: '', data: { v: 1, G: { phase: 'play', hands: 3 }, stats: { won: 4 }, level: 'fort' } })); });
await page.reload(); await wait(400);
ok(await g(() => Belote.check(G) && stats.won === 4 && level === 'fort' && G.phase === 'bid1'), 'a broken save starts a new game, with its wins and its level');
await myTurn();
ok((await msg()).includes("n'a pas pu être relue"), 'the line says the saved game could not be read');
await g(() => { const s = JSON.parse(localStorage.getItem('gg:save:belote')); s.data.level = 'expert'; delete s.data.v; localStorage.setItem('gg:save:belote', JSON.stringify(s)); });
await page.reload(); await wait(400);
ok(await g(() => Belote.check(G) && level === 'facile' && document.getElementById('level').textContent.startsWith('Niveau facile')), 'a save with an unknown level and no version loads, at Facile');
ok((await g(() => document.getElementById('home').href)).endsWith('/public/index.html'), 'the way back to the games works from a file');

// 9. The layout at every window size: nothing outside the window, no text cut, buttons of 44 px and more,
// text of 20 px and more (13 on a phone), and the seats clear of each other and of his hand.
function audit(minText) {
  const out = [], z = Zoom.z(), vw = innerWidth, vh = innerHeight;
  const desc = e => e.id ? '#' + e.id : e.tagName.toLowerCase() + '.' + [...e.classList].join('.') + ' "' + e.textContent.trim().slice(0, 30) + '"';
  const vis = e => { const r = e.getBoundingClientRect(), cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && !e.closest('[hidden]'); };
  if (document.documentElement.scrollWidth > vw + 1) out.push('the page scrolls sideways');
  const t = document.getElementById('table').getBoundingClientRect();
  for (const e of document.querySelectorAll('#bar *, #say *, #table *, #rail *, #over.on *, #help.on *')) {
    if (!vis(e) || e.closest('.card, #joy, .sr, .backs, #mid')) continue;
    const r = e.getBoundingClientRect();
    const box = e.closest('#table') ? t : { left: 0, top: 0, right: vw, bottom: vh };
    if (r.left < box.left - 1 || r.right > box.right + 1 || r.top < box.top - 1 || r.bottom > box.bottom + 1) out.push('outside: ' + desc(e));
    const own = [...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
    if (!own) continue;
    const scale = e.offsetHeight ? r.height / (e.offsetHeight * z) : 1;
    const size = parseFloat(getComputedStyle(e).fontSize) * scale;
    if (size < minText - .5) out.push(`small text ${size.toFixed(1)}px: ` + desc(e));
    if (e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).overflowX !== 'visible') out.push('cut: ' + desc(e));
  }
  for (const b of document.querySelectorAll('button')) if (vis(b) && b.getBoundingClientRect().height / z < 44 - .5) out.push('small button: ' + desc(b));
  const seats = ['seat0', 'seat1', 'seat2', 'seat3', 'side', 'strip'].map(id => document.getElementById(id)).filter(vis).map(e => [e.id, e.getBoundingClientRect()]);
  const hit = (a, b) => a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1;
  for (let i = 0; i < seats.length; i++) for (let j = i + 1; j < seats.length; j++) if (hit(seats[i][1], seats[j][1])) out.push(`overlap: ${seats[i][0]} and ${seats[j][0]}`);
  const hand = [...document.querySelectorAll('.card.hand')].map(e => e.getBoundingClientRect());
  for (const [id, r] of seats) if (id !== 'strip' && hand.some(h => hit(h, r))) out.push(`overlap: ${id} and his hand`);
  if (hand.some(h => h.top + h.height * .3 > t.bottom)) out.push('the corner of a card of his hand is hidden');
  return out;
}
const WINDOWS = [[1366, 680, 1], [1093, 530, 1], [1920, 1000, 1], [1280, 620, 1], [390, 760, 1], [1366, 680, 1.3], [1920, 1000, 1.75]];
for (const [w, h, z] of WINDOWS) {
  await page.close();
  page = await browser.newPage({ viewport: { width: w, height: h } });
  watch(page);
  await page.goto(URL);
  await g(z => { localStorage.setItem('gg:zoom', String(z)); localStorage.setItem('gg:save:belote', JSON.stringify({ updatedAt: 1, summary: '', data: { v: 1, level: 'moyen', stats: { won: 2 } } })); }, z);
  await page.reload(); await wait(400);
  const size = `${w}x${h}${z > 1 ? ' at ' + Math.round(z * 100) + ' %' : ''}`;
  const min = w < 700 ? 13 : 20;
  ok((await g(() => Zoom.z())) === z, `${size}: the page is at its size`);
  // The bids, the longest message, a trick in play, the score sheet and the rules guide.
  await g(() => { cancelAll(); G = Belote.newGame(Belote.seeded(4)); render(); step(); });
  await myTurn();
  await g(() => { hint = { bid: 'take' }; render(); });
  await wait(900);
  let bad = await g(audit, min);
  ok(!bad.length, `${size}: the bids fit ` + bad.join(' | '));
  await page.screenshot({ path: `${OUT}/belote-${w}x${h}-${z}-bid.png` });
  await g(() => { cancelAll(); let x = G; for (let i = 0; i < 4; i++) x = Belote.bid(x, 'pass'); G = x; render(); });
  await wait(700);
  bad = await g(audit, min);
  ok(!bad.length && await g(() => document.querySelectorAll('#bidBtns button').length === 4), `${size}: the second round, four buttons, fits ` + bad.join(' | '));
  // A trick led by another player, with his turn to answer.
  await g(() => { cancelAll(); G = Belote.bid(Belote.newGame(Belote.seeded(4)), 'take');
    for (let i = 0; i < 40 && G.phase === 'play' && !(G.turn === 0 && G.trick.length && G.tricks); i++) G = Belote.play(G, Belote.choosePlay(G, 'moyen')); render(); });
  await g(() => Kit.say("Vous n'avez pas de carreau, et André gagne le pli : jouez la carte de votre choix."));
  await wait(700);
  bad = await g(audit, min);
  ok(!bad.length, `${size}: a trick in play and the longest message fit ` + bad.join(' | '));
  ok(w < 700 || await g(() => { const b = document.getElementById('lastBox').getBoundingClientRect(); return b.height > 0 && b.bottom <= innerHeight && document.querySelectorAll('#lastCards .mini').length === 4; }),
    `${size}: the last trick shows in the side column`);
  ok(await g(() => L.w) >= (w >= 1900 && z === 1 ? 140 : w >= 1300 && z === 1 ? 95 : 56), `${size}: cards are ${await g(() => L.w)} px wide`);
  await page.screenshot({ path: `${OUT}/belote-${w}x${h}-${z}-play.png` });
  await g(() => { while (G.phase === 'play') G = Belote.play(G, Belote.choosePlay(G, 'moyen')); render(); });
  await wait(700);
  bad = await g(audit, min);
  ok(!bad.length && await g(() => { const b = document.getElementById('nextBtn').getBoundingClientRect(); return document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2)?.closest('button')?.id === 'nextBtn'; }),
    `${size}: the score sheet fits, its button in view ` + bad.join(' | '));
  await page.screenshot({ path: `${OUT}/belote-${w}x${h}-${z}-scores.png` });
  await g(() => Kit.openHelp());
  for (let n = 0; n < pages; n++) {
    bad = await g(audit, min);
    const fits = await g(() => { const t = document.getElementById('helpText'); return t.scrollHeight <= t.clientHeight + 1; });
    ok(!bad.length && (fits || h / z < 620), `${size}: rules page ${n + 1} fits ` + bad.join(' | '));
    await page.click('#helpNext');
  }
}

ok(!errors.length, 'no page errors ' + errors.join(' | '));
await browser.close();
if (fails) { console.log(`\n${fails} FAILED`); process.exit(1); }
console.log('\nALL PASSED');
