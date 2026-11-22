// Plays the dame de pique with a real mouse: the pass, refusals, the computer players, undo, hint,
// saves across a reload, the end of a hand, the moon, the win and the layout.
import { launch, gameUrl, OUT } from './harness.mjs';
const browser = await launch();
let fails = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const URL = gameUrl('dame-de-pique');

const page = await browser.newPage({ viewport: { width: 1366, height: 680 } });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
const g = (fn, arg) => page.evaluate(fn, arg);
const wait = ms => page.waitForTimeout(ms);
const msg = () => g(() => document.getElementById('msg').textContent);
// Clicks a card of his hand where it shows, then moves the mouse away and waits past the double-click time.
const clickCard = async c => {
  const r = await g(c => { const b = document.querySelector(`.card.hand[data-c="${c}"]`).getBoundingClientRect(); return [b.left + 12, b.top + 14]; }, c);
  await page.mouse.click(...r); await page.mouse.move(5, 5); await wait(560);
};
const myTurn = async () => { for (let i = 0; i < 150 && !(await g(() => G.phase === 'play' && G.turn === 0 && !busy)); i++) await wait(100); };
// Puts a hand in progress on the table: the cards of each seat, and every other card already played.
const setHand = (hands, extra = {}) => g(([hands, extra]) => {
  cancelAll();
  const SU = 'SHDC', RK = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
  const card = n => SU.indexOf(n.slice(-1)) * 13 + RK.indexOf(n.slice(0, -1));
  const hs = hands.map(h => DDP.sortHand(h.split(' ').map(card)));
  const held = new Set(hs.flat()), log = [];
  for (let c = 0; c < 52; c++) if (!held.has(c)) log.push([log.length % 4, c]);
  G = Object.assign({ v: 1, scores: [0, 0, 0, 0], handNo: 0, result: null, phase: 'play', hands: hs, gave: null, leader: 0, turn: 0,
    trick: [], tricks: 13 - hs[0].length, broken: true, pts: [0, 0, 0, 0], log, voids: [0, 1, 2, 3].map(() => [false, false, false, false]),
    only: [null, null, null, null], last: null, handPts: null, moon: null, seed: 1 }, extra);
  picks = []; got = []; undo = []; hint = []; started = true;
  save(); render(); step();
}, [hands, extra]);
const SU = 'SHDC', RK = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const card = n => SU.indexOf(n.slice(-1)) * 13 + RK.indexOf(n.slice(0, -1));

// 1. The first visit: the rules open, and each page fits without scrolling.
await page.goto(URL);
await wait(400);
ok(await g(() => Kit.isOpen()), 'the rules open on the first visit');
for (let n = 0; n < 5; n++) {
  ok(await g(() => { const t = document.getElementById('helpText'); return t.scrollHeight <= t.clientHeight + 1; }), `rules page ${n + 1} fits without scrolling`);
  await page.screenshot({ path: `${OUT}/ddp-rules-${n + 1}.png` });
  await page.click('#helpNext');
}
await page.getByRole('button', { name: 'Moyen', exact: true }).click();
ok(!(await g(() => Kit.isOpen())) && await g(() => level === 'moyen'), 'the level is chosen after the rules');
ok(await g(() => cast.length === 3 && !['jeanne', 'paul', 'louise'].some(id => cast.includes(id))), 'a new game seats three other players');
ok(await g(() => [1, 2, 3].every(s => document.querySelector(`#seat${s} img.ava`).src.endsWith(`/lib/avatars/${cast[s - 1]}.webp`))), 'each player shows a face');
// The checks below name the first three players.
await g(() => { setCast(['jeanne', 'paul', 'louise']); save(); render(); });

// 2. Layout at 1366x680: large cards, and the corner of each card of his hand in view.
const lay = await g(() => {
  const t = table.getBoundingClientRect();
  const hand = [...document.querySelectorAll('.card.hand')].map(e => e.getBoundingClientRect());
  const inside = id => { const r = document.getElementById(id).getBoundingClientRect(); return r.left >= t.left && r.right <= t.right && r.top >= t.top && r.bottom <= t.bottom; };
  return { w: L.w, n: hand.length, corners: hand.every((r, i) => r.top + r.height * .3 <= innerHeight && (i === hand.length - 1 || hand[i + 1].left - r.left >= r.width * .3)),
    seats: ['seat1', 'seat2', 'seat3', 'side'].every(inside),
    apart: (() => { const a = document.getElementById('seat1').getBoundingClientRect(), b = document.getElementById('seat3').getBoundingClientRect(), s = document.getElementById('side').getBoundingClientRect();
      return a.right <= L.cx - L.w * 1.62 && b.left >= L.cx + L.w * 1.62 && b.right <= s.left; })() };
});
ok(lay.w >= 110, `cards are ${lay.w} px wide at 1366x680`);
ok(lay.n === 13 && lay.corners, 'the rank and suit of all 13 cards are in view');
ok(lay.seats && lay.apart, 'the three players and the scores fit, clear of the trick');

// 3. The pass: three cards, to the left on the first hand.
ok((await g(() => document.getElementById('passTitle').textContent)) === 'Donnez 3 cartes à Jeanne, à votre gauche', 'the first pass goes to Jeanne, on the left');
ok(await g(() => document.getElementById('passBtn').disabled), 'the pass button waits for 3 cards');
const hand0 = await g(() => G.hands[0].slice());
const first = hand0[0];
const r0 = await g(c => { const b = document.querySelector(`.card.hand[data-c="${c}"]`).getBoundingClientRect(); return [b.left + 12, b.top + 14]; }, first);
await page.mouse.dblclick(...r0); await page.mouse.move(5, 5); await wait(560);
ok(JSON.stringify(await g(() => picks)) === JSON.stringify([first]), 'a double-click chooses the card once');
for (const c of hand0.slice(1, 4)) await clickCard(c);
ok((await g(() => picks.length)) === 3 && (await msg()).includes('déjà choisi 3 cartes'), 'a fourth card is refused');
await clickCard(hand0[2]);
ok(JSON.stringify(await g(() => picks)) === JSON.stringify([first, hand0[1]]), 'a click on a chosen card takes it back');
await page.click('#undoBtn');
ok((await g(() => picks.length)) === 1, 'undo takes back the last card chosen');
await clickCard(hand0[5]); await clickCard(hand0[6]);
await page.screenshot({ path: `${OUT}/ddp-pass.png` });
ok((await g(() => document.getElementById('passBtn').textContent)) === 'Donner ces 3 cartes à Jeanne', 'the button names Jeanne');
const gave = await g(() => picks.slice());
await page.click('#passBtn');
await wait(200);
ok(await g(gave => G.phase === 'play' && gave.every(c => G.hands[1].includes(c)) && G.hands[0].length === 13, gave), 'his 3 cards went to Jeanne');
ok((await g(() => document.querySelectorAll('.card.hand .got').length)) === 3 && (await msg()).includes('vous a donné'), 'the 3 cards received are tagged and named');
await page.screenshot({ path: `${OUT}/ddp-received.png` });

// 4. His turn: a refused card says why; a legal card is played; the others answer.
await myTurn();
ok(await g(() => document.getElementById('mySlot').classList.contains('on') && document.getElementById('seat0').classList.contains('turn')
  && document.getElementById('seat0').textContent.includes('À vous de jouer')), 'his turn shows on the table: his place in the trick and his seat');
ok(await g(() => { const v = document.getElementById('seat0').getBoundingClientRect(), c = document.querySelector('.card.hand').getBoundingClientRect(); return v.bottom <= c.top && v.left >= c.left - 1; }),
  'his seat sits above the left end of his hand');
const bad = await g(() => G.hands[0].find(c => DDP.refusal(G, c)));
if (bad !== undefined) {
  await clickCard(bad);
  ok(await g(c => G.hands[0].includes(c), bad) && /2 de trèfle|devez|premier pli|cœur/.test(await msg()), 'a card that cannot be played stays, and the line says why: ' + await msg());
  ok(await g(c => {
    const b = document.getElementById('bubble'), r = b.getBoundingClientRect(), k = document.querySelector(`.card.hand[data-c="${c}"]`).getBoundingClientRect();
    return b.classList.contains('on') && b.textContent === document.getElementById('msg').textContent && r.bottom <= k.top && r.right > k.left && r.left < k.left + k.width;
  }, bad), 'the reason also shows in a bubble just above the card');
  await page.screenshot({ path: `${OUT}/ddp-refused.png` });
  await wait(3100);
  ok(!(await g(() => document.getElementById('bubble').classList.contains('on'))), 'the bubble goes after 3 seconds');
}
ok(await g(() => document.querySelectorAll('.card.hand.no').length === G.hands[0].filter(c => DDP.refusal(G, c)).length), 'the cards that cannot be played are darker');
const before = await g(() => G.log.length);
const good = await g(() => DDP.legal(G)[0]);
await clickCard(good);
ok(await g(([c, n]) => !G.hands[0].includes(c) && G.log.length > n, [good, before]), 'a legal card is played with one click');
ok(!(await g(() => document.getElementById('mySlot').classList.contains('on'))), 'his place in the trick is no longer marked once he has played');
ok(await g(() => { const f = document.querySelectorAll('.card.trick .first'); return f.length === 1 && f[0].parentElement.dataset.c == (shown || { cards: G.trick }).cards[0]; }), 'the first card of the trick has a "1er" tag');
ok((await g(() => document.querySelectorAll('.card.hand .got').length)) === 0, 'the "Reçue" tags go once he plays');

ok(await g(() => { const b = document.getElementById('hintBtn'); return b.disabled && getComputedStyle(b).backgroundColor === 'rgba(0, 0, 0, 0)'; }), 'the hint button looks idle while the others play');

// 5. During the others' turn, a click on his cards does nothing but answer.
await g(() => { cancelAll(); G.turn = 2; G.trick = G.trick.length ? G.trick : []; render(); });
const n5 = await g(() => G.hands[0].length);
await clickCard(await g(() => G.hands[0][0]));
ok((await g(() => G.hands[0].length)) === n5 && (await msg()).includes('Attendez'), 'a click while the others play is refused');

// 6. Undo takes back his card and the cards played after it.
await page.reload(); await wait(300);
await myTurn();
const snap = await g(() => JSON.stringify(G));
await clickCard(await g(() => DDP.legal(G)[0]));
await wait(1700);
await page.click('#undoBtn');
ok((await g(() => JSON.stringify(G))) === snap, 'undo puts back the table as it was before his card');
ok((await msg()).startsWith('Coup annulé'), 'the line says the move is taken back');

// 7. A reload keeps the game, the level and the turn.
await page.reload(); await wait(300);
ok((await g(() => JSON.stringify(G))) === snap && await g(() => level === 'moyen'), 'a reload brings back the same game');

// 8. The hint frames a legal card.
await page.click('#hintBtn'); await wait(500);
ok(await g(() => hint.length === 1 && DDP.legal(G).includes(hint[0]) && !!document.querySelector('.card.hand.hint')), 'the hint frames a card he may play');
await page.screenshot({ path: `${OUT}/ddp-hint.png` });

// 9. The end of a hand: the score sheet, which Escape does not close, then the next hand passes right.
await setHand(['2D', '3D', '4D', 'AH'], { pts: [5, 10, 6, 4], scores: [10, 20, 30, 40] });
await clickCard(card('2D'));
for (let i = 0; i < 60 && !(await g(() => document.getElementById('scoreSheet').classList.contains('on'))); i++) await wait(100);
ok(await g(() => G.phase === 'done' && G.scores.join() === '15,30,37,44'), 'the hand is added to the scores');
ok((await g(() => document.getElementById('scoreTitle').textContent)) === 'Fin de la manche 1', 'the score sheet shows');
await page.screenshot({ path: `${OUT}/ddp-scores.png` });
await page.keyboard.press('Escape');
ok(await g(() => document.getElementById('scoreSheet').classList.contains('on')), 'Escape leaves the score sheet in place');
await page.reload(); await wait(300);
ok(await g(() => document.getElementById('scoreSheet').classList.contains('on')), 'the score sheet comes back after a reload');
await page.click('#nextBtn'); await wait(200);
ok((await g(() => document.getElementById('passTitle').textContent)) === 'Donnez 3 cartes à Louise, à votre droite', 'the second hand passes to Louise, on the right');
ok(await g(() => G.handNo === 1 && G.scores.join() === '15,30,37,44' && !undo.length), 'the scores carry on to the next hand');
// Two quick clicks 12 px apart, on each side of the edge between two cards, choose both.
const h2 = await g(() => G.hands[0].slice(0, 2));
const edge = await g(c => { const b = document.querySelector(`.card.hand[data-c="${c}"]`).getBoundingClientRect(); return [b.left, b.top + 30]; }, h2[1]);
await page.mouse.click(edge[0] - 6, edge[1]); await wait(120);
await page.mouse.click(edge[0] + 6, edge[1]); await wait(120);
await page.mouse.move(5, 5);
ok(JSON.stringify(await g(() => picks)) === JSON.stringify(h2), 'two quick clicks on two cards choose both');
// A short window keeps the pass button inside the table.
await page.setViewportSize({ width: 1366, height: 420 }); await wait(200);
const onTop = id => g(id => { const r = document.getElementById(id).getBoundingClientRect(); return r.bottom <= innerHeight && document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)?.closest('button')?.id === id; }, id);
ok(await onTop('passBtn'), 'a short window keeps the pass button in view');
ok(await g(() => [...document.querySelectorAll('.card.hand')].every(e => { const r = e.getBoundingClientRect(); return e.contains(document.elementFromPoint(r.left + 6, r.top + 10)); })),
  'a short window keeps the corner of every card clear of the pass sheet');
await page.setViewportSize({ width: 1366, height: 680 }); await wait(200);

// He takes a trick and leads again at once: the others still play one card at a time.
await setHand(['AD 2C', '2D 3C', '3D 4C', '4D 5C'], { turn: 1, leader: 1 });
await myTurn();
await clickCard(card('AD'));
await myTurn();
await page.mouse.click(...await g(c => { const b = document.querySelector(`.card.hand[data-c="${c}"]`).getBoundingClientRect(); return [b.left + 12, b.top + 14]; }, card('2C')));
ok(await g(() => timers.length === 1 && G.log.length === 49), 'a quick lead after a trick starts only one round of turns');

// The queen of spades and the hearts: who took her, and whether hearts are open.
await setHand(['2S 3D', 'QS 4D', 'AS 5D', '3S 6D'], { broken: false, pts: [0, 0, 0, 0] });
await clickCard(card('2S'));
for (let i = 0; i < 60 && !(await g(() => G.tricks === 12 && !busy)); i++) await wait(100);
ok(await g(() => document.getElementById('seat2').querySelector('.qs') && document.getElementById('state').textContent.includes('La dame de pique : chez Paul')
  && document.getElementById('state').textContent.includes('Les cœurs : pas encore ouverts')), 'Paul has the queen of spades by his name, and the scores say so');
ok(await g(() => document.querySelector('#lastCards .mini em')?.textContent === '1er' && document.querySelector('#lastCards .mini:first-child em')), 'the last trick marks who led it');
await page.screenshot({ path: `${OUT}/ddp-queen.png` });

// 10. The moon: Paul takes all 26 points.
await setHand(['2D', '3D', 'AH', '4D'], { pts: [0, 0, 25, 0], turn: 2, leader: 2 });
for (let i = 0; i < 80 && !(await g(() => document.getElementById('scoreSheet').classList.contains('on'))); i++) {
  if (await g(() => G.turn === 0 && !busy && G.phase === 'play')) await clickCard(card('2D'));
  await wait(100);
}
ok(await g(() => G.moon === 2 && G.handPts.join() === '26,26,0,26'), 'all 26 points: Paul scores 0 and each other 26');
ok((await g(() => document.getElementById('scoreNote').textContent)).includes('Paul a pris tous les points : il marque 0'), 'the sheet explains the moon');
await page.setViewportSize({ width: 1366, height: 420 }); await wait(200);
ok(await onTop('nextBtn'), 'a short window keeps "Manche suivante" in view');
await page.setViewportSize({ width: 1366, height: 680 }); await wait(200);
// "Manche suivante" at once, while the last step of the hand still waits: one round of turns only.
await g(() => { later(() => {}, 700); nextHandNow(); });
ok(await g(() => timers.length === 0), 'the next hand drops the steps of the last one');

// 11. The win: the game ends past 100, with him lowest. It counts once.
await setHand(['2D', '3D', 'AH', '4D'], { pts: [0, 5, 10, 10], scores: [20, 95, 96, 97], turn: 0 });
await clickCard(card('2D'));
for (let i = 0; i < 80 && !(await g(() => document.getElementById('over').classList.contains('on'))); i++) await wait(100);
ok(await g(() => G.phase === 'over' && G.result.winner === 0 && stats.won === 1), 'he wins with the lowest score');
ok((await g(() => document.getElementById('overTitle').textContent)) === 'Bravo, vous avez gagné !', 'the win sheet shows');
ok(await g(() => /atteint 100 points : la partie est finie\.\n[^]*\nLes points : Vous 20, Jeanne/.test(document.getElementById('overText').textContent)), 'the win sheet says why the game ended, with the four totals');
ok(await g(() => getComputedStyle(document.getElementById('scoreSheet')).visibility === 'hidden'), 'the score sheet hides behind the win sheet');
await page.screenshot({ path: `${OUT}/ddp-won.png` });
ok((await g(() => GG.meta('dame-de-pique').summary)) === '1 victoire', 'the library tile shows the win');
await page.reload(); await wait(300);
ok(await g(() => stats.won === 1 && G.phase === 'over'), 'a reload does not count the win again');
await g(() => Kit.closeDialog());

// A tie for the lowest score: he shares the win with Jeanne.
await g(() => { wonNow = false; });
await setHand(['2D', '3D', '4D', 'AH'], { pts: [0, 0, 13, 12], scores: [30, 30, 99, 99], turn: 0 });
await clickCard(card('2D'));
for (let i = 0; i < 80 && !(await g(() => document.getElementById('over').classList.contains('on'))); i++) await wait(100);
ok(await g(() => G.phase === 'over' && G.result.winners.join() === '0,1' && document.getElementById('overTitle').textContent === 'Bravo, vous partagez la victoire !'
  && document.getElementById('overText').textContent.includes('à égalité avec Jeanne')), 'a tie for the lowest: he shares the win with Jeanne');
await g(() => Kit.closeDialog());

// 12. The fourth hand keeps its cards.
await g(() => { G.phase = 'done'; G.result = null; G.handNo = 2; G.scores = [1, 2, 3, 4]; nextHandNow(); });
ok(await g(() => G.phase === 'play' && !document.getElementById('passSheet').classList.contains('on')), 'the fourth hand has no pass');

// 13. Other windows: a narrow one shows the totals by each player, a wide one larger cards.
await page.setViewportSize({ width: 1024, height: 640 }); await wait(300);
ok(await g(() => !L.sideW && ['seat0', 'seat1', 'seat2', 'seat3'].every(id => document.getElementById(id).textContent.includes('total'))), 'a narrow window shows each total by its player, his own too');
ok(await g(() => { const r = id => document.getElementById(id).getBoundingClientRect(), a = r('seat1'), b = r('seat3'), v = r('seat0'), p = r('seat2');
  const hand = document.querySelector('.card.hand')?.getBoundingClientRect();
  return a.left >= 0 && b.right <= innerWidth && (!hand || v.bottom <= hand.top) && v.top >= a.bottom - 1; }), 'a narrow window keeps the players inside, his own above his hand');
await page.screenshot({ path: `${OUT}/ddp-1024.png` });
await page.setViewportSize({ width: 1920, height: 1000 }); await wait(300);
ok(await g(() => L.w) >= 150, `cards are ${await g(() => L.w)} px wide at 1920x1000`);
await page.screenshot({ path: `${OUT}/ddp-1920.png` });

ok((await g(() => document.getElementById('home').href)).endsWith('/public/index.html'), 'the way back to the games works from a file');
ok(!errors.length, 'no page errors ' + errors.join(' | '));
await browser.close();
if (fails) { console.log(`\n${fails} FAILED`); process.exit(1); }
console.log('\nAll dame de pique tests passed');
