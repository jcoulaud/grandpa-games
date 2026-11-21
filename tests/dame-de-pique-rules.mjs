// The rules of the dame de pique and the computer players, without a browser.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
require('../public/dame-de-pique/engine.js');
const D = globalThis.DDP;
let fails = 0;
const ok = (c, m, extra = '') => { console.log((c ? 'PASS ' : 'FAIL ') + m + (c ? '' : ' ' + extra)); if (!c) fails++; };

// Cards by name: "QS" the queen of spades, "2C" the 2 of clubs, "10H", "AD".
const SUITS = 'SHDC', RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const card = n => SUITS.indexOf(n.slice(-1)) * 13 + RANKS.indexOf(n.slice(0, -1));
const cards = s => s.split(' ').filter(Boolean).map(card);
const name = c => RANKS[c % 13] + SUITS[(c / 13) | 0];

// A game in the middle of a hand: hands for the 4 seats; every other card counts as played earlier.
function midGame(hands, extra = {}) {
  const hs = hands.map(h => D.sortHand(cards(h)));
  const held = new Set(hs.flat());
  const log = [];
  for (let c = 0; c < 52; c++) if (!held.has(c)) log.push([log.length % 4, c]);
  return Object.assign({ v: 1, scores: [0, 0, 0, 0], handNo: 0, result: null, phase: 'play', hands: hs, gave: null,
    leader: 0, turn: 0, trick: [], tricks: 13 - hs[0].length, broken: true, pts: [0, 0, 0, 0], log,
    voids: [0, 1, 2, 3].map(() => [false, false, false, false]), only: [null, null, null, null], last: null,
    handPts: null, moon: null, seed: 1 }, extra);
}
const legalNames = G => D.legal(G).map(name).sort().join(' ');

// 1. The deal and the pass.
{
  const G = D.newGame(D.seeded(1));
  ok(G.hands.every(h => h.length === 13) && new Set(G.hands.flat()).size === 52, 'the deal gives 13 different cards to each');
  ok(G.phase === 'pass', 'the first hand starts with the pass');
  ok([0, 1, 2, 3].map(s => D.passTarget(G, s)).join() === '1,2,3,0', 'hand 1: each passes to the left');
  const g2 = D.nextHand(Object.assign({}, G, { phase: 'done' }), D.seeded(2));
  ok(D.passTarget(g2, 0) === 3, 'hand 2: to the right');
  const g3 = D.nextHand(g2, D.seeded(3));
  ok(D.passTarget(g3, 0) === 2, 'hand 3: across');
  const g4 = D.nextHand(g3, D.seeded(4));
  ok(D.passTarget(g4, 0) === null && g4.phase === 'play', 'hand 4: no pass, the play starts at once');
  ok(g4.hands[g4.turn].includes(D.TWO_CLUBS), 'the holder of the 2 of clubs leads');
  const g5 = D.nextHand(g4, D.seeded(5));
  ok(g5.phase === 'pass' && D.passTarget(g5, 0) === 1, 'hand 5: to the left again');

  // Everyone passes at once. The 2 of clubs, passed on, makes its new holder lead.
  let H = G, holder = G.hands.findIndex(h => h.includes(D.TWO_CLUBS));
  const picks = G.hands.map(h => h.slice(0, 3));
  if (!picks[holder].includes(D.TWO_CLUBS)) picks[holder][0] = D.TWO_CLUBS;
  H = D.doPass(G, picks);
  ok(H.turn === (holder + 1) % 4, 'the 2 of clubs passed to the left: the left player leads');
  ok(H.hands.every(h => h.length === 13), 'each still holds 13 cards after the pass');
  ok([0, 1, 2, 3].every(s => picks[s].every(c => H.hands[(s + 1) % 4].includes(c))), 'each card passed is with its receiver');
  let threw = false;
  try { D.doPass(G, [picks[0].slice(0, 2), picks[1], picks[2], picks[3]]); } catch (e) { threw = true; }
  ok(threw, 'a pass of 2 cards is refused');
}

// 2. What may be played.
{
  let G = midGame(['2C 5C 3H QS 4D AS 7S 8S 9S 10S JS KS 2D', '3C 4C 6C 7C 8C 9C 10C JC QC KC AC 2H 4H',
    '5H 6H 7H 8H 9H 10H JH QH KH AH 2S 3S 4S', '3D 5D 6D 7D 8D 9D 10D JD QD KD AD 5S 6S'], { tricks: 0, broken: false, log: [] });
  ok(legalNames(G) === '2C', 'the first trick starts with the 2 of clubs');
  ok(D.refusal(G, card('3H')) === 'two', 'any other card is refused on the first lead');
  G = D.play(G, card('2C'));
  ok(legalNames(G) === '10C 3C 4C 6C 7C 8C 9C AC JC KC QC', 'the next player follows clubs');
  G = D.play(G, card('AC'));
  // Seat 2 has no club: no point card on the first trick while it has another card.
  ok(legalNames(G) === '2S 3S 4S', 'no heart on the first trick when another card can be played');
  ok(D.refusal(G, card('KH')) === 'first', 'a heart is refused on the first trick');
}
{
  // Only hearts and the queen: anything goes on the first trick.
  const G = midGame(['2C 3C 4C 5C 6C 7C 8C 9C 10C JC QC KC AC', '2H 3H 4H 5H 6H 7H 8H 9H 10H JH QH KH QS',
    '2S 3S 4S 5S 6S 7S 8S 9S 10S JS KS AS AH', '2D 3D 4D 5D 6D 7D 8D 9D 10D JD QD KD AD'], { tricks: 0, broken: false, log: [] });
  let g = D.play(G, card('2C'));
  ok(D.legal(g).length === 13, 'a hand of hearts and the queen of spades may play any card on the first trick');
  g = D.play(g, card('QS'));
  ok(!g.broken, 'the queen of spades does not break hearts');
  ok(g.only[1] === 'points', 'a point card on the first trick shows that seat holds only point cards');
  const H = midGame(['2C 3C 4C 5C 6C 7C 8C 9C 10C JC QC KC AC', '2H 3H 4H 5H 6H 7H 8H 9H 10H JH QH KH AH',
    '2S 3S 4S 5S 6S 7S 8S 9S 10S JS QS KS AS', '2D 3D 4D 5D 6D 7D 8D 9D 10D JD QD KD AD'], { tricks: 0, broken: false, log: [] });
  const h = D.play(D.play(H, card('2C')), card('AH'));
  ok(h.broken, 'a heart, even a forced one, breaks hearts');
}
{
  // Leading before hearts are broken.
  const G = midGame(['2H 3H QS', '4H 5H 6H', '7H 8H 9H', '10H JH QH'], { broken: false });
  ok(legalNames(G) === 'QS', 'with hearts and the queen, the queen must lead');
  const H = midGame(['2H 3H 4H', '5H 6H 7H', '8H 9H 10H', 'JH QH KH'], { broken: false });
  ok(legalNames(H) === '2H 3H 4H', 'a hand of only hearts may lead a heart');
  const h2 = D.play(H, card('3H'));
  ok(h2.only[0] === 'hearts', 'a heart led before hearts were broken shows a hand of only hearts');
  const I = midGame(['2H 3D', '5H 6D', '8H 9D', 'JH QD'], { broken: false });
  ok(D.refusal(I, card('2H')) === 'hearts' && legalNames(I) === '3D', 'no heart lead before hearts are broken');
  ok(legalNames(Object.assign({}, I, { broken: true })) === '2H 3D', 'once broken, hearts may lead');
}

// 3. The trick, the points, the moon and the end of the game.
{
  ok(D.trickWinner(0, cards('5D AD KS 10D')) === 1, 'the ace is the highest card');
  ok(D.trickWinner(2, cards('5D 4D AS 3D')) === 2, 'only the suit led can win');
  let G = midGame(['AH', 'KH', 'QH', 'JH'], { pts: [0, 0, 0, 22], tricks: 12 });
  for (const c of ['AH', 'KH', 'QH', 'JH']) G = D.play(G, card(c));
  ok(G.phase === 'done' && G.handPts.join() === '4,0,0,22' && G.scores.join() === '4,0,0,22', 'the hand is scored after 13 tricks');
  G = midGame(['2D', 'AH', '3D', '4D'], { pts: [0, 25, 0, 0], tricks: 12, turn: 1, leader: 1 });
  for (const c of ['AH', '3D', '4D', '2D']) G = D.play(G, card(c));
  ok(G.moon === 1 && G.handPts.join() === '26,0,26,26', 'all 26 points: the moon gives 26 to each of the others');
  G = midGame(['2D', 'AH', '3D', '4D'], { pts: [0, 25, 0, 0], tricks: 12, turn: 1, leader: 1, scores: [18, 18, 74, 46] });
  for (const c of ['AH', '3D', '4D', '2D']) G = D.play(G, card(c));
  ok(G.phase === 'over' && G.result.winner === 1, 'a score of 100 or more ends the game: the lowest wins');
  G = midGame(['2D', 'AH', '3D', '4D'], { pts: [0, 25, 0, 0], tricks: 12, turn: 1, leader: 1, scores: [18, 44, 74, 46] });
  for (const c of ['AH', '3D', '4D', '2D']) G = D.play(G, card(c));
  ok(G.phase === 'over' && G.scores.join() === '44,44,100,72' && G.result.winners.join() === '0,1' && G.result.winner === 0,
    'a tie for the lowest ends the game too: he shares the win');
  G = midGame(['2D', 'AH', '3D', '4D'], { pts: [0, 25, 0, 0], tricks: 12, turn: 1, leader: 1, scores: [50, 30, 4, 80] });
  for (const c of ['AH', '3D', '4D', '2D']) G = D.play(G, card(c));
  ok(G.phase === 'over' && G.result.winners.join() === '1,2' && G.result.winner === 1, 'two computer players tied for the lowest share the win');
  G = midGame(['2S 3D', 'QS 4D', 'AS 5D', '3S 6D'], { pts: [0, 0, 0, 0], tricks: 11 });
  for (const c of ['2S', 'QS', 'AS', '3S']) G = D.play(G, card(c));
  ok(G.qsTo === 2 && G.pts[2] === 13, 'the game knows who took the queen of spades');
  G = midGame(['2D', '5D', '3D', 'AD'], { pts: [26, 0, 0, 0], tricks: 12, scores: [90, 80, 99, 95] });
  for (const c of ['2D', '5D', '3D', 'AD']) G = D.play(G, card(c));
  ok(G.phase === 'over' && G.result.winner === 0 && G.scores.join() === '90,106,125,121', 'his moon ends the game with him lowest');
}

// 4. The deals the computer imagines.
{
  // Three unseen cards, one per seat. X can go to seats 1 or 2, Y to 2 or 3, Z anywhere:
  // three deals fit, and each must come about as often.
  const G = midGame(['2C 3C', '5D', '5H', '5S'], { tricks: 11, broken: true });
  G.voids[3][2] = true; // seat 3 has no diamond: 5D goes to 1 or 2
  G.voids[1][1] = true; // seat 1 has no heart: 5H goes to 2 or 3
  const seen = {};
  const rnd = D.seeded(7);
  for (let i = 0; i < 6000; i++) {
    const g = D.sampleDeal(G, 0, rnd);
    const k = [1, 2, 3].map(s => name(g.hands[s][0])).join(' ');
    seen[k] = (seen[k] || 0) + 1;
  }
  const counts = Object.values(seen);
  ok(counts.length === 3 && counts.every(n => n > 1800 && n < 2200), 'each fitting deal is equally likely: ' + JSON.stringify(seen));
  // A seat that showed only point cards gets only point cards; a passed card stays with its receiver.
  const P = D.newGame(D.seeded(3));
  const picks = P.hands.map(h => h.slice(10));
  let Q = D.doPass(P, picks);
  let fit = true;
  for (let i = 0; i < 200 && fit; i++) {
    const g = D.sampleDeal(Q, 0, D.seeded(i));
    fit = picks[0].every(c => g.hands[1].includes(c)) && g.hands.every((h, s) => h.length === Q.hands[s].length);
  }
  ok(fit, 'the cards he passed stay with the player who got them, and each seat keeps its count');
  const R = midGame(['2C 3C 4C', '2H 3H QS', '5D 6D 7D', '8D 9D 10D'], { tricks: 10 });
  R.only[1] = 'points';
  ok([...Array(200)].every((_, i) => D.sampleDeal(R, 0, D.seeded(i)).hands[1].every(c => D.points(c) > 0)), 'a seat that showed only point cards gets only point cards');
}

// 5. The computer players: legal, repeatable, fair, fast, and stronger by level.
{
  let bad = 0, slow = 0;
  for (const level of ['facile', 'moyen', 'fort']) {
    let G = D.newGame(D.seeded(11));
    for (let hand = 0; hand < 2; hand++) {
      if (G.phase === 'pass') G = D.doPass(G, [0, 1, 2, 3].map(s => D.choosePass(G, s, level)));
      while (G.phase === 'play') {
        const t = Date.now(), c = D.choosePlay(G, level);
        slow = Math.max(slow, Date.now() - t);
        if (!D.legal(G).includes(c)) bad++;
        if (c !== D.choosePlay(G, level)) bad++;
        G = D.play(G, c);
      }
      G = D.nextHand(G, D.seeded(hand));
    }
  }
  ok(!bad, 'every computer card is legal, and the same position gets the same card');
  ok(slow < 400, `the slowest choice took ${slow} ms`);

  // The hint knows only his cards: swapping two hidden cards between other players changes nothing.
  // Two cards of one suit, one with Paul and one with Louise, that he did not pass: a swap he cannot see.
  let G = D.newGame(D.seeded(21)), pair = null;
  G = D.doPass(G, [0, 1, 2, 3].map(s => D.choosePass(G, s, 'moyen')));
  while (G.phase === 'play' && !pair) {
    if (G.turn === 0 && D.legal(G).length > 1) {
      for (const a of G.hands[2]) {
        const b = G.hands[3].find(c => D.suit(c) === D.suit(a));
        if (b !== undefined && !G.gave[0].includes(a) && !G.gave[0].includes(b)) { pair = [a, b]; break; }
      }
    }
    if (!pair) G = D.play(G, D.choosePlay(G, 'moyen'));
  }
  const S = JSON.parse(JSON.stringify(G));
  const [a, b] = pair;
  S.hands[2] = D.sortHand(S.hands[2].map(c => c === a ? b : c));
  S.hands[3] = D.sortHand(S.hands[3].map(c => c === b ? a : c));
  ok(D.choosePlay(G, 'fort', D.seeded(5)) === D.choosePlay(S, 'fort', D.seeded(5)), 'the computer does not look at the other hands');

  // Average points per hand of the first seat against three of the level below.
  function average(me, them, hands, seed) {
    const levels = [me, them, them, them];
    let G = D.newGame(D.seeded(seed)), sum = 0;
    for (let h = 0; h < hands; h++) {
      if (G.phase === 'pass') G = D.doPass(G, [0, 1, 2, 3].map(s => D.choosePass(G, s, levels[s])));
      while (G.phase === 'play') G = D.play(G, D.choosePlay(G, levels[G.turn]));
      sum += G.handPts[0] - (G.handPts[1] + G.handPts[2] + G.handPts[3]) / 3;
      G = D.nextHand(Object.assign(G, { phase: 'done', result: null }), D.seeded(seed + h + 1));
    }
    return sum / hands;
  }
  const mf = average('moyen', 'facile', 60, 100), fm = average('fort', 'moyen', 20, 200);
  ok(mf < -1, `Moyen takes fewer points than Facile: ${mf.toFixed(1)} per hand against the others`);
  ok(fm < 0, `Difficile takes fewer points than Moyen: ${fm.toFixed(1)} per hand against the others`);
}

console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
process.exit(fails ? 1 : 0);
