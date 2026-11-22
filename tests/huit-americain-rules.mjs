// The rules of the huit américain and the computer players, without a browser.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
require('../public/huit-americain/engine.js');
const H = globalThis.HA;
let fails = 0;
const ok = (c, m, extra = '') => { console.log((c ? 'PASS ' : 'FAIL ') + m + (c ? '' : ' ' + extra)); if (!c) fails++; };
const throws = fn => { try { fn(); return false; } catch (e) { return true; } };

// Cards by name: "QS" the dame de pique, "8H" the 8 de cœur, "10D", "AC".
const SUITS = 'SHDC', RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const card = n => SUITS.indexOf(n.slice(-1)) * 13 + RANKS.indexOf(n.slice(0, -1));
const cards = s => s.split(' ').filter(Boolean).map(card);
const names = list => list.map(c => RANKS[c % 13] + SUITS[(c / 13) | 0]).sort().join(' ');

// A round in progress: the hands, the top card of the défausse, and the pioche (the next card last).
// Every other card lies under the top card.
function at(hands, topCard, stock = '', extra = {}) {
  const hs = hands.map(h => H.sortHand(cards(h)));
  const st = cards(stock), t = card(topCard);
  const used = new Set([...hs.flat(), ...st, t]);
  const under = [...Array(52).keys()].filter(c => !used.has(c));
  return Object.assign({ v: 1, round: 0, scores: [0, 0, 0, 0], result: null, hands: hs, stock: st, pile: [...under, t],
    suit: (t / 13) | 0, dir: 1, turn: 0, phase: 'play', drawn: null, rs: 7, seed: 9, n: 0, last: null,
    voids: [0, 1, 2, 3].map(() => [false, false, false, false]), roundPts: null, out: null }, extra);
}

// 1. The deal.
{
  let plain = true, sizes = true, all = true;
  for (let i = 0; i < 300; i++) {
    const G = H.newGame(H.seeded(i));
    sizes &&= G.hands.every(h => h.length === 7) && G.stock.length === 52 - 28 - 1 && G.pile.length === 1;
    all &&= new Set([...G.hands.flat(), ...G.stock, ...G.pile]).size === 52;
    plain &&= !H.special(G.pile[0]) && G.suit === H.suit(G.pile[0]);
  }
  ok(sizes, 'each player gets 7 cards, one card starts the défausse, 23 make the pioche');
  ok(all, 'the 52 cards are dealt once each');
  ok(plain, 'the first card of the défausse is never an 8, an as, a 2 or a valet');
  const G = H.newGame(H.seeded(3));
  ok(G.turn === 0 && G.dir === 1, 'he starts the first round, and the play goes to the left');
  const turns = [];
  let g = Object.assign(G, { phase: 'done' });
  for (let r = 1; r < 5; r++) { g = H.nextRound(Object.assign(g, { phase: 'done' }), H.seeded(r)); turns.push(g.turn); }
  ok(turns.join() === '1,2,3,0', 'each round, the next player starts');
  ok(throws(() => H.nextRound(H.newGame(H.seeded(4)))), 'no next round before the round is over');
}

// 2. What may be played.
{
  const G = at(['9H 4H 9S 2C 8D KC', '3S 5S', '6S 7S', '10S JS'], '9C');
  ok(names(H.legal(G)) === '2C 8D 9H 9S KC', 'a card of the colour asked, of the same rank, or an 8');
  ok(H.refusal(G, card('4H')) === 'fit', 'a card of another colour and rank is refused');
  ok(H.refusal(G, card('3S')) === 'turn', 'a card of another player is refused');
  ok(throws(() => H.play(G, card('4H'))), 'playing a card that does not fit throws');
  ok(throws(() => H.draw(G)), 'a player who can play may not draw');
  ok(!H.canDraw(G), 'the pioche is closed to a player who can play');

  // After an 8, the colour named counts, not the colour of the 8.
  const E = at(['5D 5H 3C', '4S 6S', '6H 7S', '10S JS'], '8D', '', { suit: 1 });
  ok(names(H.legal(E)) === '5H', 'after an 8 that named cœur, only a cœur or another 8 fits');
  const E2 = at(['8S 3C 4C', '4S 6S', '6H 7S', '10S JS'], '8D', '', { suit: 1 });
  ok(names(H.legal(E2)) === '8S', 'an 8 goes on an 8');
}

// 3. The plain cards and the special cards.
{
  let G = at(['9H 4C KC', '3S 5S', '6S 7S', '10S JS'], '9C');
  let g = H.play(G, card('4C'));
  ok(g.turn === 1 && g.suit === 3 && H.top(g) === card('4C') && g.hands[0].length === 2, 'a card goes on the défausse and the next player plays');
  ok(g.last.kind === 'play' && g.last.seat === 0 && g.last.effect === null, 'the game says who played what');

  g = H.play(G, card('9H'));
  ok(g.suit === 1, 'a card of the same rank changes the colour to its own');

  // The 8: the player names the colour.
  G = at(['8S 4C KC', '3S 5S', '6S 7S', '10S JS'], '9H');
  g = H.play(G, card('8S'), 2);
  ok(g.suit === 2 && g.last.effect === 'eight' && g.last.suit === 2 && g.turn === 1, 'an 8 goes on a cœur, and carreau is named');
  g = H.play(G, card('8S'));
  ok(g.suit === 0, 'an 8 with no colour named keeps its own colour');
  ok([1.5, null, -1, '2'].every(x => H.play(G, card('8S'), x).suit === 0), 'an 8 with a colour that is not one of the four keeps its own colour');

  // The as: the way of play changes.
  G = at(['AH 4C KC', '3S 5S', '6S 7S', '10S JS'], '9H');
  g = H.play(G, card('AH'));
  ok(g.dir === -1 && g.turn === 3 && g.last.effect === 'ace', 'the as changes the way: the player on the right plays next');
  g = H.play(Object.assign(g, { turn: 3, hands: [g.hands[0], g.hands[1], g.hands[2], H.sortHand(cards('AS JS'))] }), card('AS'));
  ok(g.dir === 1 && g.turn === 0, 'a second as turns the way back');

  // The 2: the next player draws 2 cards and misses the turn.
  G = at(['2H 4C KC', '3S 5S', '6S 7S', '10S JS'], '9H', '3D 4D 5D');
  g = H.play(G, card('2H'));
  ok(g.hands[1].length === 4 && g.hands[1].includes(card('5D')) && g.hands[1].includes(card('4D')) && g.turn === 2,
    'the 2: the next player draws the top 2 cards of the pioche, and the one after plays');
  ok(g.last.effect === 'two' && g.last.victim === 1 && names(g.last.got) === '4D 5D', 'the game says who drew which cards');
  // With the way turned, the victim is on the right.
  g = H.play(Object.assign(at(['2H 4C KC', '3S 5S', '6S 7S', '10S JS'], '9H', '3D 4D 5D'), { dir: -1 }), card('2H'));
  ok(g.last.victim === 3 && g.turn === 2, 'after an as, the 2 hits the player on the right');

  // The valet: the next player misses the turn.
  G = at(['JH 4C KC', '3S 5S', '6S 7S', '10S JS'], '9H');
  g = H.play(G, card('JH'));
  ok(g.turn === 2 && g.last.effect === 'jack' && g.last.victim === 1, 'the valet: the next player misses the turn');
  // The valet played by the player on his right skips him.
  g = H.play(Object.assign(at(['3S 5S', '4C KC', '6S 7S', 'JH 10S'], '9H'), { turn: 3 }), card('JH'));
  ok(g.turn === 1 && g.last.victim === 0, 'a valet from the right skips him');
}

// 4. Drawing.
{
  // A card that does not fit: the turn passes.
  let G = at(['4C KC', '3S 5S', '6S 7S', '10S JS'], '9H', '2D 3D');
  let g = H.draw(G);
  ok(H.canDraw(G) && g.hands[0].includes(card('3D')) && g.turn === 1 && g.phase === 'play', 'a card drawn that does not fit: the turn passes');
  ok(g.last.kind === 'draw' && g.last.card === card('3D') && !g.last.fits, 'the game says which card was drawn');
  ok(g.voids[0][1], 'the computers remember he had no cœur');

  // A card that fits: he may play it or pass.
  G = at(['4C KC', '3S 5S', '6S 7S', '10S JS'], '9H', '2D 3H');
  g = H.draw(G);
  ok(g.phase === 'drawn' && g.drawn === card('3H') && g.turn === 0, 'a card drawn that fits: he may play it');
  ok(names(H.legal(g)) === '3H' && H.refusal(g, card('4C')) === 'drawn', 'only the card drawn may be played then');
  ok(throws(() => H.draw(g)), 'no second card from the pioche');
  const p = H.pass(g);
  ok(p.phase === 'play' && p.turn === 1 && p.hands[0].includes(card('3H')) && p.last.kind === 'pass', 'he may keep it and pass');
  const q = H.play(g, card('3H'));
  ok(q.turn === 1 && H.top(q) === card('3H') && q.phase === 'play', 'or play it');
  ok(throws(() => H.pass(G)), 'no pass without a card drawn');
  // An 8 drawn fits too.
  g = H.draw(at(['4C KC', '3S 5S', '6S 7S', '10S JS'], '9H', '8C'));
  ok(g.phase === 'drawn' && g.drawn === card('8C'), 'an 8 drawn may be played at once');

  // The pioche is empty: the défausse is shuffled back, except its top card.
  G = at(['4C KC', '3S 5S', '6S 7S', '10S JS'], '9H', '');
  const under = G.pile.length - 1;
  g = H.draw(G);
  ok(g.last.shuffled && g.pile.length === 1 && H.top(g) === card('9H') && g.stock.length === under - 1 && g.hands[0].length === 3,
    'an empty pioche takes back the défausse, shuffled, except its top card');
  ok(new Set([...g.hands.flat(), ...g.stock, ...g.pile]).size === 52, 'no card is lost in the shuffle');
  ok(JSON.stringify(H.draw(G)) === JSON.stringify(g), 'the same game always shuffles the same way');
  // The 2 with one card left in the pioche: one card, then the shuffle.
  G = at(['2H 4C KC', '3S 5S', '6S 7S', '10S JS'], '9H', '5D');
  g = H.play(G, card('2H'));
  ok(g.last.got.length === 2 && g.last.got[0] === card('5D') && g.last.shuffled && H.top(g) === card('2H'), 'a 2 on a short pioche shuffles the défausse for the second card');

  // Nothing to draw at all: the pioche is empty and the défausse holds only its top card. Every card
  // is then in a hand, so some player can always play: the turn passes until that player.
  const deck = [...Array(52).keys()], nine = card('9H');
  const fitsNine = c => H.suit(c) === 1 || H.rank(c) === 9 || H.rank(c) === 8;
  const t = at(['4C', '3S', '6S', '10S'], '9H', '');
  t.pile = [nine];
  t.hands = [[], [], [], []];
  for (const c of deck) if (c !== nine) t.hands[fitsNine(c) ? 3 : c % 3].push(c);
  t.hands = t.hands.map(H.sortHand);
  ok(H.valid(t), 'a table with an empty pioche and a single card on the défausse is a valid game');
  g = H.draw(t);
  ok(g.last.kind === 'empty' && g.turn === 1 && g.phase === 'play' && !g.last.shuffled, 'nothing to draw: the turn passes');
  g = H.draw(H.draw(g));
  ok(g.turn === 3 && g.phase === 'play' && H.legal(g).length > 0, 'the turn passes until a player who can play');
  // An old save that counted three passes in a row: a fourth pass does not score the round while a
  // player still holds a card that fits.
  const old = Object.assign(JSON.parse(JSON.stringify(t)), { passes: 3 });
  ok(H.valid(old), 'an old save with a count of passes loads');
  g = H.draw(old);
  ok(g.phase === 'play' && g.turn === 1 && g.roundPts === null, 'an old count of passes never stops the round');
}

// 5. The end of a round and of the game.
{
  // He plays his last card: the round ends at once, even on a special card.
  let G = at(['2H', '3S 5S KS', '8S 7S', '10S JS'], '9H', '3D 4D', { scores: [10, 20, 30, 40] });
  let g = H.play(G, card('2H'));
  ok(g.phase === 'done' && g.out === 0 && g.hands[1].length === 3, 'his last card ends the round at once: a last 2 makes nobody draw');
  ok(g.roundPts.join() === '0,18,57,20' && g.scores.join() === '10,38,87,60', 'the cards left count: 8 = 50, figures 10, the others their value');
  ok(H.points(card('AS')) === 1 && H.points(card('QH')) === 10 && H.points(card('KD')) === 10 && H.points(card('JC')) === 10 && H.points(card('8H')) === 50 && H.points(card('7D')) === 7,
    'as 1, dame 10, roi 10, valet 10, 8 = 50, 7 = 7');
  // A last 8 needs no colour.
  g = H.play(at(['8H', '3S', '4S', '5S'], '9C'), card('8H'));
  ok(g.phase === 'done' && g.out === 0, 'a last 8 ends the round');
  ok(throws(() => H.play(g, card('3S'))), 'no card after the end of the round');

  // The game ends after the round where a total reaches 100. The lowest total wins.
  g = H.play(at(['5H', 'KS QS', '4S', '10S JS'], '9H', '', { scores: [40, 90, 50, 70] }), card('5H'));
  ok(g.phase === 'over' && g.scores.join() === '40,110,54,90' && g.result.winners.join() === '0' && g.result.winner === 0,
    'a total of 100 or more ends the game: the lowest total wins');
  g = H.play(at(['5H', 'KS QS', '4S 3S 2S', '10S JS'], '9H', '', { scores: [50, 90, 41, 70] }), card('5H'));
  ok(g.phase === 'over' && g.result.winners.join() === '0,2' && g.result.winner === 0, 'two lowest totals share the win');
  g = H.play(at(['5H', 'KS QS', '4S', '10S JS'], '9H', '', { scores: [60, 90, 10, 70] }), card('5H'));
  ok(g.result.winners.join() === '2' && g.result.winner === 2, 'another player can win with the lowest total');
  g = H.play(at(['5H', 'KS', '4S', '10S'], '9H', '', { scores: [60, 80, 10, 70] }), card('5H'));
  ok(g.phase === 'done', 'under 100, the game goes on');
  const n = H.nextRound(g, H.seeded(5));
  ok(n.round === 1 && n.scores.join() === g.scores.join() && n.hands.every(h => h.length === 7) && n.phase === 'play', 'the next round keeps the totals and deals again');
}

// 6. The computer players: legal, repeatable, and stronger by level.
{
  let bad = 0, same = 0, steps = 0, rounds = 0, eights = 0, slow = 0;
  for (const level of ['facile', 'moyen', 'fort']) {
    for (let i = 0; i < 60; i++) {
      let G = H.newGame(H.seeded(100 + i));
      while (G.phase === 'play' || G.phase === 'drawn') {
        const t = Date.now(), a = H.choose(G, level);
        slow = Math.max(slow, Date.now() - t);
        if (JSON.stringify(a) !== JSON.stringify(H.choose(G, level))) same++;
        if (a.type === 'draw' && !H.canDraw(G)) bad++;
        if (a.type === 'play' && H.refusal(G, a.card)) bad++;
        if (a.type === 'play' && H.rank(a.card) === 8 && G.hands[G.turn].length > 1 && !(a.suit >= 0 && a.suit < 4) && level !== 'facile') bad++;
        if (a.type === 'play' && H.rank(a.card) === 8) eights++;
        G = H.apply(G, a);
        if (++steps > 1e6) break;
      }
      rounds++;
      if (!(G.phase === 'done' || G.phase === 'over')) bad++;
    }
  }
  ok(!bad, 'every computer action is legal, and every round ends');
  ok(!same, 'the same position always gets the same answer');
  ok(eights > 0, 'the computers play 8s');
  ok(slow < 50, `the slowest choice took ${slow} ms`);

  // Moyen keeps its 8s: it plays one only when nothing else fits.
  const M = at(['8S 4H 9C', '3S 5S', '6S 7S', '10S JS'], '9H');
  ok(H.choose(M, 'moyen').card !== card('8S'), 'Moyen keeps its 8 while another card fits');
  const M8 = at(['8S 4C 3C', '3S 5S', '6S 7S', '10S JS'], '9H');
  const m8 = H.choose(M8, 'moyen');
  ok(m8.card === card('8S') && m8.suit === 3, 'Moyen plays the 8 when nothing else fits, and names its own colour, trèfle');
  // Moyen plays the colour it holds most of.
  const MC = at(['9S 4H 5C 6C 7C', '3S 5S', '6S 7S', '10S JS'], '9H');
  ok(H.choose(MC, 'moyen').card === card('9S') || H.choose(MC, 'moyen').card === card('4H'), 'Moyen plays a card that fits');
  const MC2 = at(['9C 4H 5C 6C', '3S 5S', '6S 7S', '10S JS'], '9H');
  ok(H.choose(MC2, 'moyen').card === card('9C'), 'Moyen turns the play to the colour it holds most of');

  // Difficile hits the player about to go out with a 2 or a valet.
  const D2 = at(['2H 5H 6C 7C', '3S', '6S 7S 9S', '10S JS 4S'], '9H');
  ok(H.choose(D2, 'fort').card === card('2H'), 'Difficile plays its 2 on the next player, who holds one card');
  const DJ = at(['JH 5H 6C 7C', '3S', '6S 7S 9S', '10S JS 4S'], '9H');
  ok(H.choose(DJ, 'fort').card === card('JH'), 'Difficile plays its valet on the next player, who holds one card');
  // It turns the play away from a player about to go out.
  const DA = at(['AH 5H 6C 7C', '3S', '6S 7S 9S', '10S JS 4S QS'], '9H');
  ok(H.choose(DA, 'fort').card === card('AH'), 'Difficile turns the way with its as when the next player is about to go out');
  // It names a colour the next player showed it lacks.
  const DV = at(['8D 3C 4S', '3S 5S 6C', '6S 7S 9S', '10S JS 4D'], '9H');
  DV.voids[1][3] = true;
  ok(H.choose(DV, 'fort').suit === 3, 'Difficile names trèfle, the colour the next player showed it lacks');
  // It gets rid of its big cards first.
  const DB = at(['KH 3H 5C 6S', '3S 5S 7C', '6S 7S 9S', '10S JS 4D'], '9H');
  ok(H.choose(DB, 'fort').card === card('KH'), 'Difficile plays its roi before its 3');
  // Difficile knows only what it saw: two hidden hands swapped change nothing.
  let G = H.newGame(H.seeded(41));
  for (let k = 0; k < 6; k++) G = H.apply(G, H.choose(G, 'moyen'));
  const S = JSON.parse(JSON.stringify(G)), me = S.turn, a = (me + 1) % 4, b = (me + 2) % 4;
  if (S.hands[a].length === S.hands[b].length) [S.hands[a], S.hands[b]] = [S.hands[b], S.hands[a]];
  else { const pool = H.sortHand([...S.hands[a], ...S.hands[b]]); S.hands[a] = pool.slice(0, S.hands[a].length); S.hands[b] = pool.slice(S.hands[a].length); }
  ok(JSON.stringify(H.choose(G, 'fort')) === JSON.stringify(H.choose(S, 'fort')), 'Difficile does not look at the other hands');

  // The levels: a player who plays like Moyen wins fewer games at each level up. Games to 100 points,
  // his seat against three computers of one level, on the same 1000 deals.
  const rate = them => {
    let w = 0;
    for (let i = 0; i < 1000; i++) {
      let G = H.newGame(H.seeded(500 + i));
      for (let r = 0; r < 40; r++) {
        while (G.phase === 'play' || G.phase === 'drawn') G = H.apply(G, H.choose(G, G.turn === 0 ? 'moyen' : them));
        if (G.phase === 'over') break;
        G = H.nextRound(G, H.seeded(i * 97 + G.round));
      }
      if (G.result.winners.includes(0)) w += 1 / G.result.winners.length;
    }
    return w / 10;
  };
  const [f, m, d] = ['facile', 'moyen', 'fort'].map(rate);
  ok(f > m + 3 && m > d + 3, `he wins ${f.toFixed(1)} % of games against Facile, ${m.toFixed(1)} % against Moyen, ${d.toFixed(1)} % against Difficile`);
}

// 7. Saves read back.
{
  const G = H.newGame(H.seeded(8));
  ok(H.valid(JSON.parse(JSON.stringify(G))), 'a new game is a valid save');
  let g = G;
  for (let k = 0; k < 30 && (g.phase === 'play' || g.phase === 'drawn'); k++) g = H.apply(g, H.choose(g, 'moyen'));
  ok(H.valid(JSON.parse(JSON.stringify(g))), 'a game in progress is a valid save');
  const broken = [
    null, 'texte', {}, { ...G, v: 2 }, { ...G, phase: 'pass' }, { ...G, hands: G.hands.slice(0, 3) },
    { ...G, hands: [G.hands[0], G.hands[1], G.hands[2], [...G.hands[3], G.stock[0]]] }, { ...G, stock: G.stock.slice(1) },
    { ...G, pile: [] }, { ...G, turn: 4 }, { ...G, dir: 0 }, { ...G, suit: 5 }, { ...G, scores: [0, 0, 'a', 0] },
    { ...G, phase: 'drawn', drawn: 99 }, { ...G, phase: 'done', roundPts: null }, { ...G, phase: 'over', roundPts: [0, 0, 0, 0], result: null },
    { ...G, hands: [[], ...G.hands.slice(1)], stock: [...G.stock, ...G.hands[0]] }, { ...G, round: -1 }, { ...G, rs: 'x' },
  ];
  // A save the page or a computer would stop on: a card drawn that does not fit, a seat that is not one
  // of the four in the result, the round or what just happened.
  const seat1 = G.hands[1].find(c => H.rank(c) !== 8 && H.suit(c) !== G.suit && H.rank(c) !== H.rank(H.top(G)));
  const done = H.play(at(['5H', '3S', '6S', '10S'], '9H'), card('5H'));
  const over = H.play(at(['5H', '3S', '6S', '10S'], '9H', '', { scores: [0, 120, 0, 0] }), card('5H'));
  ok(H.valid(JSON.parse(JSON.stringify(done))) && H.valid(JSON.parse(JSON.stringify(over))) && over.phase === 'over', 'a round and a game that are over are valid saves');
  broken.push({ ...G, turn: 1, phase: 'drawn', drawn: seat1 }, { ...over, result: { winners: [4], winner: 4 } },
    { ...over, result: { winners: [0], winner: 7 } }, { ...done, out: 4 }, { ...done, out: undefined });
  ok(seat1 !== undefined && broken.every(b => !H.valid(b)), 'a broken save is refused: wrong cards, phase, seat, way, colour, scores or numbers');
  // An old save without the fields the computers read still loads, with them filled in.
  const old = JSON.parse(JSON.stringify(G));
  delete old.voids; delete old.n; delete old.last;
  ok(H.valid(old) && old.voids.length === 4 && old.n === 0 && old.last.kind === 'deal', 'an older save without the computers\' notes loads, with them filled in');
  ok(H.choose(old, 'fort').type, 'and the computers can play from it');
  const odd = { ...JSON.parse(JSON.stringify(g)), last: { kind: 'play', seat: 7, card: H.top(g), got: 3 } };
  ok(H.valid(odd) && odd.last.kind === 'deal' && odd.last.seat === null, 'a last move with a seat that is not one of the four is replaced by the deal');
}

console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
process.exit(fails ? 1 : 0);
