// The rules of the belote and the computer players, without a browser.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
require('../public/belote/engine.js');
const B = globalThis.Belote;
let fails = 0;
const ok = (c, m, extra = '') => { console.log((c ? 'PASS ' : 'FAIL ') + m + (c ? '' : ' ' + extra)); if (!c) fails++; };

// Cards by name: "JH" the valet de cœur, "10S", "AD", "7C". Suits as in lib/cards.js: S pique, H cœur, D carreau, C trèfle.
const SUITS = 'SHDC', RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const card = n => SUITS.indexOf(n.slice(-1)) * 13 + RANKS.indexOf(n.slice(0, -1));
const cards = s => s.split(' ').filter(Boolean).map(card);
const name = c => RANKS[c % 13] + SUITS[(c / 13) | 0];
const S = 0, H = 1, D = 2, C = 3;

// A hand in play: the cards of the 4 seats; every other card counts as played in earlier tricks.
function midGame(hands, trump, extra = {}) {
  const hs = hands.map(h => B.sortHand(cards(h), trump));
  const held = new Set(hs.flat().concat(extra.trick || []));
  const log = [];
  for (const c of B.DECK) if (!held.has(c)) log.push([log.length % 4, c]);
  const tricks = Math.floor(log.length / 4);
  const g = Object.assign({ v: 1, target: 501, scores: [0, 0], handNo: 0, dealer: 3, phase: 'play', hands: hs, turnup: log.length ? log[0][1] : hs[0][0],
    stock: [], bids: [[0, 'take']], redeal: false, turn: 0, leader: 0, taker: 0, trump, trick: [], tricks, won: [0, 0], tricksWon: [0, 0],
    belote: null, said: 0, log, voids: [0, 1, 2, 3].map(() => [false, false, false, false]), caps: [8, 8, 8, 8], last: null,
    handPts: null, outcome: null, capot: null, seed: 1, result: null }, extra);
  return g;
}
const legalNames = G => B.legal(G).map(name).sort().join(' ');
const sorted = s => s.split(' ').sort().join(' ');

// 1. The deal and the bids.
{
  const G = B.newGame(B.seeded(1));
  ok(G.hands.every(h => h.length === 5) && G.stock.length === 11, 'the deal gives 5 cards to each, and 11 stay for after the bids');
  const all = G.hands.flat().concat(G.turnup, G.stock);
  ok(new Set(all).size === 32 && all.every(c => [1, 7, 8, 9, 10, 11, 12, 13].includes(c % 13 + 1)), 'the 32 cards from the 7 to the as, each once');
  ok(G.dealer === 3 && G.turn === 0 && G.phase === 'bid1', 'Simone deals the first hand, so he speaks first');
  ok(B.check(G), 'a new game passes the check of a save');
  ok(B.bidOptions(G).join() === 'take,pass', 'first round: take or pass');

  let g = B.bid(G, 'pass');
  ok(g.turn === 1 && g.phase === 'bid1' && g.bids.length === 1, 'a pass gives the word to the next player, on his right');
  g = B.bid(g, 'take');
  ok(g.phase === 'play' && g.taker === 1 && g.trump === B.suit(G.turnup), 'take in the first round: the suit of the retourne is trump');
  ok(g.hands.every(h => h.length === 8) && g.hands[1].includes(G.turnup), 'the taker gets the retourne and 2 cards, the others 3: 8 cards each');
  ok(g.leader === 0 && g.turn === 0, 'the player after the dealer leads the first trick');
  ok(B.check(g), 'a game in play passes the check');
  ok(g.hands[1].slice(0, g.hands[1].filter(c => B.suit(c) === g.trump).length).every(c => B.suit(c) === g.trump), 'the hand is sorted with the trumps first');

  let r = G;
  for (let i = 0; i < 4; i++) r = B.bid(r, 'pass');
  ok(r.phase === 'bid2' && r.turn === 0, 'four passes: the second round starts with the same player');
  ok(!B.bidOptions(r).includes(B.suit(G.turnup)) && B.bidOptions(r).length === 4, 'second round: the three other suits, or pass');
  let threw = false;
  try { B.bid(r, B.suit(G.turnup)); } catch (e) { threw = true; }
  ok(threw, 'the suit of the retourne cannot be named in the second round');
  const other = B.bidOptions(r)[0];
  const t2 = B.bid(B.bid(r, 'pass'), other);
  ok(t2.taker === 1 && t2.trump === other && t2.hands[1].includes(G.turnup), 'take in the second round: the suit named is trump, and the taker gets the retourne');
  for (let i = 0; i < 4; i++) r = B.bid(r, 'pass');
  ok(r.redeal && r.phase === 'bid1' && r.dealer === 0 && r.turn === 1 && r.handNo === 0 && r.scores.join() === '0,0',
    'eight passes: the next player deals again, the scores do not change');
  ok(B.check(r), 'the new deal passes the check');
}

// 2. The order and the points of the cards.
{
  ok(B.trickWinner(0, cards('JH 9H AH 10H'), H) === 0 && B.trickWinner(0, cards('9H AH 10H KH'), H) === 0, 'trumps: the valet beats the 9, the 9 beats the as');
  ok(B.trickWinner(0, cards('10S AS KS JS'), H) === 1, 'other suits: the as beats the 10, the 10 the roi');
  ok(B.trickWinner(0, cards('AS 7H KS QS'), H) === 1, 'the 7 of trumps beats the as of the suit led');
  ok(B.trickWinner(0, cards('7S AD AC KS'), H) === 3, 'a card of another suit never wins');
  const trumpPts = cards('JH 9H AH 10H KH QH 8H 7H').map(c => B.points(c, H));
  const plainPts = cards('AS 10S KS QS JS 9S 8S 7S').map(c => B.points(c, H));
  ok(trumpPts.join() === '20,14,11,10,4,3,0,0' && plainPts.join() === '11,10,4,3,2,0,0,0', 'the points of the trumps and of the other suits');
  ok(B.DECK.reduce((a, c) => a + B.points(c, D), 0) === 152, '152 points in the cards, 162 with the dix de der');
}

// 3. What may be played.
{
  // He follows the suit led.
  let G = midGame(['AS 7S 9H AD', '8H 7D 7C', '8S JD 8C', 'JS 9D 9C'], H, { trick: cards('KS QS 10S'), leader: 1 });
  ok(legalNames(G) === sorted('AS 7S'), 'with the suit led, he must play it');
  ok(B.refusal(G, card('9H')) === 'suit', 'a trump is refused while he holds the suit led');

  // Trumps led: he must go higher when he can.
  G = midGame(['JH 8H AS', '7S 7D', '8S 8D', '9S 9D'], H, { trick: cards('AH 7H QH'), leader: 1 });
  ok(legalNames(G) === 'JH', 'trumps led: he must play a higher trump');
  ok(B.refusal(G, card('8H')) === 'monter', 'a lower trump is refused when he has a higher one');
  G = midGame(['10H 8H AS', 'AH 7S 7D', '7H 8S 8D', 'QH 9S 9D'], H);
  Object.assign(G, { trick: cards('AH 7H QH'), leader: 1 });
  ok(legalNames(G) === sorted('10H 8H'), 'trumps led and no higher trump: any trump');
  G = midGame(['AS KS 9D', 'AH 7S 7D', '7H 8S 8D', 'QH 9S 10D'], H);
  Object.assign(G, { trick: cards('AH 7H QH'), leader: 1 });
  ok(legalNames(G) === sorted('AS KS 9D'), 'trumps led and no trump: any card');
  // Even over his partner, at trumps.
  // Henri plays the dame, André the as and wins, Simone the 7.
  G = midGame(['JH 8H AS', '7S 7D', '8S 8D', '9S 9D'], H, { trick: cards('QH AH 7H'), leader: 1 });
  ok(legalNames(G) === 'JH', 'at trumps he must go higher, even over his partner');

  // Void in the suit led.
  G = midGame(['7H JH AD 8C', '7S 7D 7C', '9S 8S 8D 9C', 'KS QS 9D 10C'], H, { trick: cards('AS'), leader: 3 });
  ok(legalNames(G) === sorted('7H JH'), 'void in the suit led, the other team winning: he must trump');
  ok(B.refusal(G, card('AD')) === 'couper', 'a card that does not trump is refused');
  Object.assign(G, { trick: cards('AS 9S'), leader: 2 });
  ok(legalNames(G) === sorted('7H JH AD 8C'), 'void in the suit led, his partner winning: any card');
  Object.assign(G, { trick: cards('AS 9S 9H'), leader: 1 });
  ok(legalNames(G) === 'JH', 'the other team has trumped: he must trump higher');
  ok(B.refusal(G, card('7H')) === 'surcouper' && B.refusal(G, card('AD')) === 'surcouper', 'a lower trump or another card is refused when he can trump higher');
  const G2 = midGame(['7H 8H AD 8C', 'AS 7S 7D 7C', '9S 8S 8D 9C', 'KS QS 9D 10C'], H);
  Object.assign(G2, { trick: cards('AS 9S 9H'), leader: 1 });
  ok(legalNames(G2) === sorted('7H 8H'), 'trumped and no higher trump: he must play a lower trump (FFB 5.2)');
  ok(B.refusal(G2, card('AD')) === 'couper', 'a discard is refused while he holds a lower trump');
  // FFB 5.2.2: Henri leads the 10 of clubs, Simone trumps with the 9 of diamonds; his only trump, the queen, is compulsory.
  const G5 = midGame(['QD 7H 8H 9S', 'AS 7S 7C 8C', 'KS QS 8S 9C', 'JS 10S AH KH'], D);
  Object.assign(G5, { trick: cards('10C JC 9D'), leader: 1 });
  ok(legalNames(G5) === 'QD', 'void in clubs, the other team trumped higher than his only trump: he must play it');
  ok(['facile', 'moyen', 'fort'].every(lv => B.choosePlay(G5, lv) === card('QD')), 'every computer level plays the lower trump there');
  // What a lower trump and a discard show: no higher trump, and no trump at all.
  const G6 = midGame(['7H 8H 9S AD', 'AS 7S 7C 8C', 'KS QS 8S 9C', 'JS 10S AH KH'], H);
  Object.assign(G6, { trick: cards('10C JC 9H'), leader: 1 });
  ok(B.play(G6, card('7H')).caps[0] === B.order(card('9H'), H), 'a lower trump under a trump shows no trump above it');
  const G7 = midGame(['10D 9S AD QS', 'AS 7S 7C 8C', 'KS 8S 9C 8D', 'JS 10S AH KH'], H);
  Object.assign(G7, { trick: cards('10C JC 9H'), leader: 1 });
  ok(B.play(G7, card('AD')).voids[0][H], 'a discard on a trumped trick shows no trump');
  const G3 = midGame(['10D AD 8C 9C', 'AS 7S 7D 7C', '9S 8S 8D JC', 'KS QS 9D 10C'], H);
  Object.assign(G3, { trick: cards('AS'), leader: 3 });
  ok(legalNames(G3) === sorted('10D AD 8C 9C'), 'void in the suit led and in trumps: any card');
  // His partner was trumped over by the other team: he must trump higher again.
  const G4 = midGame(['JH 7H AD 8C', 'AS 7S 7D 7C', '9S 8S 8D 9C', 'KS QS 9D 10C'], H);
  Object.assign(G4, { trick: cards('KS 8H 9H'), leader: 1 });
  ok(legalNames(G4) === 'JH', 'the other team trumped over his partner: he must trump higher');
  ok(legalNames(midGame(['AS 7D 9H', 'KS', 'QS', 'JS'], H)) === sorted('AS 7D 9H'), 'he may lead any card');
}

// 4. The hand, the points, belote, dedans, capot and the end of the game.
{
  // A last trick: the as wins 20 points, and 10 more for the dix de der.
  let G = midGame(['AS', 'KS', 'QS', 'JS'], H, { tricks: 7, won: [80, 72], tricksWon: [4, 3], taker: 0 });
  for (const c of ['AS', 'KS', 'QS', 'JS']) G = B.play(G, card(c));
  ok(G.phase === 'done' && G.won.join() === '110,72', 'the last trick gives 10 more: the dix de der');
  ok(G.outcome === 'made' && G.handPts.join() === '110,72' && G.scores.join() === '110,72', 'the taker made more than the other team: each marks its points');

  const end = (won, tricksWon, extra) => {
    let g = midGame(['7S', '8S', '9S', 'JS'], H, Object.assign({ tricks: 7, won, tricksWon }, extra));
    for (const c of ['7S', '8S', '9S', 'JS']) g = B.play(g, card(c));
    return g;
  };
  // The 8th trick (7S 8S 9S JS) goes to Simone (seat 3, team 1): 2 points + 10.
  G = end([90, 60], [5, 2], { taker: 0 });
  ok(G.won.join() === '90,72' && G.outcome === 'made', '90 against 72: made');
  G = end([69, 81], [4, 3], { taker: 0 });
  ok(G.won.join() === '69,93' && G.outcome === 'dedans' && G.handPts.join() === '0,162', 'fewer points than the other team: dedans, the other team marks 162');
  G = end([81, 69], [4, 3], { taker: 1 });
  ok(G.won.join() === '81,81' && G.outcome === 'dedans' && G.handPts.join() === '162,0', 'a tie at 81: the taker is dedans');
  G = end([81, 69], [4, 3], { taker: 0, belote: 0, said: 2 });
  ok(G.outcome === 'made' && G.handPts.join() === '101,81', 'the belote counts for the taker: 81 + 20 against 81 is made', G.handPts.join());
  G = end([71, 79], [4, 3], { taker: 0, belote: 0, said: 2 });
  ok(G.outcome === 'dedans' && G.handPts.join() === '20,162', 'a tie with the belote counted, 91 against 91: dedans', G.handPts.join());
  G = end([62, 88], [4, 3], { taker: 0, belote: 0, said: 2 });
  ok(G.outcome === 'dedans' && G.handPts.join() === '20,162', 'dedans: the taker keeps its belote, the other team marks 162');
  G = end([70, 80], [4, 3], { taker: 1, belote: 2, said: 2 });
  ok(G.outcome === 'made' && G.handPts.join() === '90,92', 'the belote of the defenders counts against the taker: 90 against 92 is made', G.handPts.join());
  G = end([80, 70], [4, 3], { taker: 1, belote: 2, said: 2 });
  ok(G.outcome === 'dedans' && G.handPts.join() === '182,0', 'the defenders with the belote: 162 + 20 when the taker is dedans');
  // Capot.
  // The first 7 tricks hold 162 - 10 - 20 = 132 points; the last one holds 20 of cards.
  G = midGame(['AS', 'KS', 'QS', 'JS'], H, { tricks: 7, won: [132, 0], tricksWon: [7, 0], taker: 0 });
  for (const c of ['AS', 'KS', 'QS', 'JS']) G = B.play(G, card(c));
  ok(G.outcome === 'capot' && G.capot === 0 && G.handPts.join() === '252,0', 'every trick to the taker: capot, 252 points');
  // FFB 9.2: in a capot the dix de der is 100, so the tricks themselves make 252 (AS KS QS JS: 11 + 4 + 3 + 2 + 100).
  ok(G.won.join() === '252,0' && G.last.pts === 120, 'a capot: the dix de der is 100, the tricks make 252', G.won.join() + ' ' + G.last.pts);
  G = midGame(['AS', 'KS', 'QS', 'JS'], H, { tricks: 7, won: [142, 0], tricksWon: [7, 0], taker: 1, belote: 1, said: 2 });
  for (const c of ['AS', 'KS', 'QS', 'JS']) G = B.play(G, card(c));
  ok(G.outcome === 'dedans' && G.capot === 0 && G.handPts.join() === '252,20', 'the defenders take every trick: 252, and the taker keeps its belote');

  // Belote, then rebelote.
  G = midGame(['KH QH', '7S 8S', 'AS 9S', '10S JS'], H, { belote: 0 });
  let g = B.play(G, card('KH'));
  ok(g.said === 1, 'the king of trumps from the holder of both: "Belote"');
  for (const c of ['7S', 'AS', '10S']) g = B.play(g, card(c));
  ok(g.turn === 0 && B.play(g, card('QH')).said === 2, 'then the queen: "Rebelote"');
  const o = midGame(['KH 7S', 'QH 8S', 'AS 9S', '10S JS'], H, { belote: null });
  ok(B.play(o, card('KH')).said === 0, 'a king of trumps without the queen in the same hand says nothing');

  // The end of the game.
  G = end([90, 60], [5, 2], { taker: 0, scores: [420, 300] });
  ok(G.phase === 'over' && G.result.winner === 0 && G.scores.join() === '510,372', 'a team that passes 501 wins the game');
  G = end([90, 60], [5, 2], { taker: 0, scores: [300, 460] });
  ok(G.phase === 'over' && G.result.winner === 1, 'the other team wins when it passes 501 first');
  G = end([90, 60], [5, 2], { taker: 0, scores: [480, 500] });
  ok(G.phase === 'over' && G.scores.join() === '570,572' && G.result.winner === 1, 'both past 501: the larger total wins');
  G = end([90, 60], [5, 2], { taker: 0, scores: [411, 429] });
  ok(G.phase === 'done' && G.scores.join() === '501,501', 'a tie past 501: one more hand');
  const n = B.nextHand(G, B.seeded(3));
  ok(n.dealer === 0 && n.turn === 1 && n.handNo === 1 && n.scores.join() === '501,501', 'the next hand is dealt by the next player');
}

// 5. A whole hand: 162 points, and what the cards show.
{
  let G = B.newGame(B.seeded(5));
  while (G.phase !== 'play') G = B.bid(G, G.phase === 'bid1' ? 'take' : 'pass');
  let shownOk = true;
  while (G.phase === 'play') {
    const c = B.choosePlay(G, 'moyen');
    G = B.play(G, c);
    // A void or a cap shown is true of the real hand.
    for (let s = 0; s < 4; s++) for (const x of G.hands[s]) {
      if (G.voids[s][B.suit(x)]) shownOk = false;
      if (B.suit(x) === G.trump && B.order(x, G.trump) >= G.caps[s]) shownOk = false;
    }
  }
  ok(G.won[0] + G.won[1] === 162 && G.tricksWon[0] + G.tricksWon[1] === 8, 'a whole hand gives 162 points in 8 tricks');
  ok(shownOk, 'what the cards show (voids, trumps a player cannot hold) is always true');
  ok(B.check(G), 'a finished hand passes the check');
}

// 6. The saves.
{
  const G = B.bid(B.newGame(B.seeded(9)), 'take');
  ok(B.check(JSON.parse(JSON.stringify(G))), 'a game read back from JSON passes the check');
  const broken = [
    null, 42, 'text', {}, Object.assign({}, G, { phase: 'nap' }), Object.assign({}, G, { hands: G.hands.slice(0, 3) }),
    Object.assign({}, G, { hands: [G.hands[0].concat(G.hands[1][0]), G.hands[1], G.hands[2], G.hands[3]] }),
    Object.assign({}, G, { scores: [0] }), Object.assign({}, G, { trump: 7 }), Object.assign({}, G, { log: [[0, 99]] }),
    Object.assign({}, G, { turn: 2 }), Object.assign({}, G, { hands: G.hands.map(h => h.map(() => 0)) }),
  ];
  ok(broken.every(b => !B.check(b)), 'a broken or foreign save fails the check');
  // Damaged fields that the page reads: a bid, a void, the last trick, a finished hand put back in play.
  const bidding = B.newGame(B.seeded(9));
  const P = JSON.parse(JSON.stringify(G));
  let L = P;
  while (L.phase === 'play' && L.tricks < 1) L = B.play(L, B.legal(L)[0]);
  let F = L;
  while (F.phase === 'play') F = B.play(F, B.legal(F)[0]);
  const damaged = [
    Object.assign({}, bidding, { bids: [null] }), Object.assign({}, bidding, { bids: [[0, 'maybe']] }),
    Object.assign({}, P, { voids: [null, [false, false, false, false], [false, false, false, false], [false, false, false, false]] }),
    Object.assign({}, P, { caps: [8, 8, 8, 'x'] }), Object.assign({}, L, { last: Object.assign({}, L.last, { cards: undefined }) }),
    Object.assign({}, F, { phase: 'play' }), Object.assign({}, F, { outcome: 'odd' }), Object.assign({}, P, { said: 5 }),
    // A taker or a trump during the bids: the page would read the name of a seat that does not exist.
    Object.assign({}, bidding, { taker: 4 }), Object.assign({}, bidding, { taker: 1, trump: 2 }),
  ];
  ok(B.check(L) && B.check(F) && damaged.every(b => !B.check(b)), 'a save with a damaged bid, void, cap, last trick or phase fails the check');
  const old = JSON.parse(JSON.stringify(G)); delete old.v;
  ok(B.check(old), 'a save without a version number still loads');
}

// 7. The computer players: legal, repeatable, fair and fast.
{
  let bad = 0, slow = 0, same = 0;
  for (const level of ['facile', 'moyen', 'fort']) {
    for (let d = 0; d < 3; d++) {
      let G = B.newGame(B.seeded(30 + d));
      while (G.phase.startsWith('bid')) {
        const b = B.chooseBid(G, level);
        if (!B.bidOptions(G).includes(b)) bad++;
        if (b !== B.chooseBid(G, level)) same++;
        G = B.bid(G, b);
        if (G.redeal) break;
      }
      while (G.phase === 'play') {
        const t = Date.now(), c = B.choosePlay(G, level);
        slow = Math.max(slow, Date.now() - t);
        if (!B.legal(G).includes(c)) bad++;
        if (c !== B.choosePlay(G, level)) same++;
        G = B.play(G, c);
      }
    }
  }
  ok(!bad, 'every bid and every card of the computer is legal');
  ok(!same, 'the same position always gets the same answer');
  ok(slow < 300, `the slowest card took ${slow} ms`);

  // The deals the computer imagines keep what it knows.
  let G = midGame(['7S 8S', 'AH 10C', 'KD QD', '7C 8C'], H, { turn: 0, taker: 1, turnup: card('AH') });
  G.voids[2][C] = true; G.caps[3] = 5; // Simone holds no trump above the as
  let fit = true;
  for (let i = 0; i < 300 && fit; i++) {
    const w = B.sampleDeal(G, 0, B.seeded(i));
    fit = w.hands[1].includes(card('AH')) && !w.hands[2].some(c => B.suit(c) === C)
      && w.hands.every((h, s) => h.length === G.hands[s].length);
  }
  ok(fit, 'the retourne stays with the taker, a void stays void, and each seat keeps its count');
  const T = midGame(['7S 8S', 'JH 10C', 'KD QD', '9H 8C'], H, { turn: 0, taker: 0 });
  T.caps[3] = 5;
  ok([...Array(200)].every((_, i) => !B.sampleDeal(T, 0, B.seeded(i)).hands[3].some(c => c === card('JH') || c === card('9H'))), 'a player who could not go higher at trumps gets no higher trump');

  // The computer does not look at the other hands: swapping two cards it cannot see changes nothing.
  G = B.newGame(B.seeded(41));
  while (G.phase !== 'play') G = B.bid(G, G.phase === 'bid1' ? 'take' : 'pass');
  let pair = null;
  while (G.phase === 'play' && !pair) {
    if (G.turn === 2 && B.legal(G).length > 1) {
      for (const a of G.hands[1]) { const b = G.hands[3].find(c => B.suit(c) === B.suit(a) && c !== G.turnup && a !== G.turnup); if (b !== undefined) { pair = [a, b]; break; } }
    }
    if (!pair) G = B.play(G, B.choosePlay(G, 'moyen'));
  }
  if (pair) {
    const Sw = JSON.parse(JSON.stringify(G));
    Sw.hands[1] = B.sortHand(Sw.hands[1].map(c => c === pair[0] ? pair[1] : c), G.trump);
    Sw.hands[3] = B.sortHand(Sw.hands[3].map(c => c === pair[1] ? pair[0] : c), G.trump);
    ok(B.choosePlay(G, 'fort', B.seeded(5)) === B.choosePlay(Sw, 'fort', B.seeded(5)), 'the computer does not look at the other hands');
  } else ok(false, 'found two hidden cards to swap');
  const H0 = B.newGame(B.seeded(77)), H1 = JSON.parse(JSON.stringify(H0));
  [H1.hands[1], H1.hands[3]] = [H0.hands[3], H0.hands[1]];
  ok(B.chooseBid(H0, 'fort', B.seeded(3)) === B.chooseBid(H1, 'fort', B.seeded(3)), 'the bid does not look at the other hands either');

  // An unannounced belote is hidden too: at the first card, the king and the queen of trumps together in one
  // hidden hand, or apart in two, change nothing the computer to play decides.
  let hidden = 0, differ = 0;
  for (let d = 0; d < 60; d++) {
    // Henri, Simone or André deals, so a computer leads.
    let Gb = B.newGame(B.seeded(200 + d));
    for (let k = 0; k <= d % 3; k++) Gb = B.nextHand(Gb, B.seeded(900 + d * 3 + k));
    while (Gb.phase !== 'play') Gb = B.bid(Gb, Gb.phase === 'bid1' ? 'take' : 'pass');
    const me = Gb.turn, T = Gb.trump, K = T * 13 + 12, Q = T * 13 + 11;
    if (me === 0 || Gb.turnup === K || Gb.turnup === Q) continue;
    const hk = Gb.hands.findIndex(h => h.includes(K)), hq = Gb.hands.findIndex(h => h.includes(Q));
    if (hk === me || hq === me) continue;
    const other = [0, 1, 2, 3].find(s => s !== me && s !== hk);
    const x = Gb.hands[hk === hq ? other : hk].find(c => B.suit(c) !== T && c !== Gb.turnup);
    if (x === undefined) continue;
    // Swap the queen with a plain card: the pair is split if it was together, put together if it was apart.
    const W = JSON.parse(JSON.stringify(Gb)), to = hk === hq ? other : hk;
    W.hands[hq] = B.sortHand(W.hands[hq].map(c => c === Q ? x : c), T);
    W.hands[to] = B.sortHand(W.hands[to].map(c => c === x ? Q : c), T);
    const h = W.hands.findIndex(z => z.includes(K) && z.includes(Q)); W.belote = h >= 0 ? h : null;
    if (!B.check(W) || (W.belote === null) === (Gb.belote === null)) throw new Error('bad swap');
    hidden++;
    if (B.choosePlay(Gb, 'fort', B.seeded(5)) !== B.choosePlay(W, 'fort', B.seeded(5))) differ++;
  }
  ok(hidden >= 10 && !differ, `an unannounced belote in hidden hands changes no choice (${hidden} positions, ${differ} differ)`);

  // After "Belote !", the deals imagined keep the other card with the player who said it.
  {
    const A = midGame(['7S 8S 9S', 'KH 10C AC', 'JD QD KD', '7C 8C 9C'], H, { turn: 0, leader: 1, taker: 1, belote: 1, said: 1, trick: [] });
    A.log = A.log.filter(x => x[1] !== card('QH')).concat([[1, card('QH')]]);
    A.log = A.log.map((x, i) => [i % 4, x[1]]);
    A.log[A.log.length - 1] = [1, card('QH')];
    let kept = true;
    for (let i = 0; i < 200 && kept; i++) kept = B.sampleDeal(A, 0, B.seeded(i)).hands[1].includes(card('KH'));
    ok(kept, 'after "Belote !", the king stays with the player who said it');
  }
}

// 8. Each level beats the one below. Each deal is played twice, the teams swapped, so the cards are fair.
{
  function match(a, b, deals, seed) {
    let diff = 0, n = 0;
    for (let d = 0; d < deals; d++) for (const side of [0, 1]) {
      const lv = s => B.team(s) === side ? a : b;
      let G = B.newGame(B.seeded(seed + d));
      while (G.phase.startsWith('bid') && !G.redeal) G = B.bid(G, B.chooseBid(G, lv(G.turn)));
      if (G.phase !== 'play') continue;
      while (G.phase === 'play') G = B.play(G, B.choosePlay(G, lv(G.turn)));
      diff += G.handPts[side] - G.handPts[1 - side]; n++;
    }
    return diff / n;
  }
  const mf = match('moyen', 'facile', 120, 1000), fm = match('fort', 'moyen', 50, 5000);
  ok(mf > 15, `Moyen beats Facile by ${mf.toFixed(1)} points a hand`);
  ok(fm > 8, `Difficile beats Moyen by ${fm.toFixed(1)} points a hand`);
}

console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
process.exit(fails ? 1 : 0);
