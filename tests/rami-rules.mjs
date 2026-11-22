// The rules of the rami and the computer player, without a browser.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
require('../public/rami/engine.js');
const R = globalThis.RA;

// Cards by name: "QS" the dame de pique, "8H" the 8 de cœur, "10D", "AC", "JK" and "JK2" the jokers.
const SUITS = 'SHDC', RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const card = n => n === 'JK' ? 52 : n === 'JK2' ? 53 : SUITS.indexOf(n.slice(-1)) * 13 + RANKS.indexOf(n.slice(0, -1));
const cards = s => s.split(' ').filter(Boolean).map(card);
const name = c => c >= 52 ? (c === 52 ? 'JK' : 'JK2') : RANKS[c % 13] + SUITS[(c / 13) | 0];
const names = list => list.map(name).join(' ');
const pts = s => R.combo(cards(s))?.pts ?? null;

// A game in progress: the two hands, the défausse (the top card last), the combinations on the table
// and the pioche (the next card last). Every other card goes under the défausse.
function at(hands, { pile = '', stock = '', melds = [], ...extra } = {}) {
  const hs = hands.map(cards), st = cards(stock), pl = cards(pile);
  const ms = melds.map(([owner, s]) => { const m = R.combo(cards(s)); return { owner, type: m.type, slots: m.slots }; });
  const used = new Set([...hs.flat(), ...st, ...pl, ...ms.flatMap(m => m.slots.map(x => x[0]))]);
  const under = [...Array(54).keys()].filter(c => !used.has(c));
  const G = { v: 1, hands: hs, stock: st, pile: [...under, ...pl], melds: ms, opened: [ms.some(m => m.owner === 0), ms.some(m => m.owner === 1)],
    turn: 0, phase: 'play', taken: null, took: [[], []], turns: [0, 0], rs: 7, seed: 9, n: 0, last: { kind: 'deal', seat: null }, result: null, ...extra };
  assert.ok(R.valid(JSON.parse(JSON.stringify(G))), 'the test game holds together');
  return G;
}

test('the deal', () => {
  for (let i = 0; i < 200; i++) {
    const G = R.newGame(R.seeded(i));
    assert.ok(G.hands.every(h => h.length === 13) && G.pile.length === 1 && G.stock.length === 54 - 27);
    assert.equal(new Set([...G.hands.flat(), ...G.stock, ...G.pile]).size, 54, 'the 52 cards and the 2 jokers, once each');
    assert.ok(G.turn === 0 && G.phase === 'draw' && R.valid(G), 'he starts by taking a card');
  }
  assert.deepEqual(R.newGame(R.seeded(5)), R.newGame(R.seeded(5)), 'a seed deals the same game');
});

test('the suites', () => {
  assert.equal(pts('5H 6H 7H'), 18);
  assert.equal(pts('7H 5H 6H'), 18, 'in any order');
  assert.equal(pts('5H 6H 8H'), null, 'cards that do not follow');
  assert.equal(pts('5H 6H 7S'), null, 'two suits');
  assert.equal(pts('5H 6H'), null, 'two cards');
  assert.equal(pts('AH 2H 3H'), 6, 'the as before the 2 counts 1');
  assert.equal(pts('QH KH AH'), 31, 'the as after the roi counts 11');
  assert.equal(pts('KH AH 2H'), null, 'no suite goes round the as');
  assert.equal(pts('JH QH KH'), 30, 'the figures count 10');
  assert.equal(pts('AH 2H 3H 4H 5H 6H 7H 8H 9H 10H JH QH KH'), 95, 'a whole suit: the as goes after the roi, where it counts 11');
  const m = R.combo(cards('9D 8D 10D'));
  assert.equal(names(m.slots.map(s => s[0])), '8D 9D 10D', 'a suite is kept in order');
});

test('the brelans and carrés', () => {
  assert.equal(pts('7H 7S 7C'), 21);
  assert.equal(pts('7H 7S 7C 7D'), 28, 'a carré');
  assert.equal(pts('AH AS AC'), 33, 'the as counts 11');
  assert.equal(pts('KH KS KC'), 30);
  assert.equal(pts('7H 7S 8C'), null, 'two ranks');
  assert.equal(pts('7H 7S'), null, 'two cards');
});

test('the joker', () => {
  assert.equal(pts('5H JK 7H'), 18, 'a joker in the gap counts the 6');
  assert.equal(pts('5H 6H JK'), 18, 'a joker at the end counts the card after');
  assert.equal(pts('QH KH JK'), 31, 'after the roi the joker is the as, 11');
  const top = R.combo(cards('KH AH JK'));
  assert.deepEqual(top.slots.map(s => s[1]), [12, 13, 14], 'with the as on top, the joker goes before the roi');
  assert.equal(pts('7H 7S JK'), 21, 'a joker in a brelan');
  assert.equal(pts('7H 7S 7C JK'), 28, 'a joker in a carré');
  assert.equal(pts('7H JK JK2'), null, 'one joker at most');
  assert.equal(pts('5H 6H JK JK2'), null, 'one joker at most in a suite too');
  assert.equal(pts('7H 7S 7C 7D JK'), null, 'a carré has 4 cards at most');
});

test('a selection splits into combinations by itself', () => {
  const s = R.split(cards('7S 9H 8H 7C 7H 7D'));
  assert.ok(s, 'a suite and a brelan, mixed');
  const sorted = list => list.map(g => names(R.sortHand(g))).sort();
  assert.deepEqual(sorted(s.groups), sorted([cards('7H 8H 9H'), cards('7S 7C 7D')]), 'the 7 de cœur goes to the suite');
  assert.equal(R.split(cards('7H 9S 8H 7S 9H 7C')), null, 'two 9s and three 7s with 8H: no split uses every card');
  assert.equal(R.split(cards('KS KH KC QD JD 10D JK')).pts, 70, 'the joker goes where it counts most: a roi, 10');
  assert.equal(R.split(cards('7H 8H 9H 2C')), null, 'a card left over: no split');
  assert.equal(R.split(cards('7H 8H')), null, 'too few cards');
  // Four 7s and 8H 9H: the 7H goes to the suite, the three others make a brelan.
  const t = R.split(cards('7H 7S 7C 7D 8H 9H'));
  assert.ok(t && t.groups.length === 2 && t.groups.every(g => g.length === 3));
  assert.equal(R.whyNot(cards('7H 9H 2H')), 'gap');
  assert.equal(R.whyNot(cards('KH AH 2H')), 'ace');
  assert.equal(R.whyNot(cards('7H 8S 2C')), 'mixed');
  assert.equal(R.whyNot(cards('7H 8H')), 'few');
});

test('taking a card', () => {
  const G = at(['3S 4S', '5D 6D'], { pile: '9H', stock: '2C', phase: 'draw' });
  const a = R.take(G, 'stock');
  assert.ok(a.hands[0].includes(card('2C')) && a.phase === 'play' && a.taken === null && a.stock.length === 0);
  const b = R.take(G, 'pile');
  assert.ok(b.hands[0].includes(card('9H')) && b.taken === card('9H') && b.took[0].includes(card('9H')));
  assert.equal(R.throwCheck(b, card('9H')), 'taken', 'the card taken from the défausse cannot go back the same turn');
  assert.equal(R.throwCheck(b, card('3S')), null);
  assert.throws(() => R.take(a, 'stock'), 'one card a turn');
});

test('the 51 points to open', () => {
  const G = at(['KS KH KC QD JD 10D 2C 3C', '5D 6D']);
  const ok = R.layCheck(G, cards('KS KH KC QD JD 10D'));
  assert.ok(ok.groups && ok.pts === 60, '30 + 30 opens');
  const short = R.layCheck(G, cards('KS KH KC'));
  assert.deepEqual([short.why, short.missing], ['open', 21], 'a brelan of rois alone is 21 points short');
  const g = R.lay(G, cards('KS KH KC QD JD 10D'));
  assert.ok(g.opened[0] && g.melds.length === 2 && g.hands[0].length === 2 && g.last.opening && g.last.pts === 60);
  // Once open, a small suite goes down too.
  const h = R.lay(at(['2C 3C 4C 9S', '5D 6D'], { melds: [[0, 'KS KH KC']] }), cards('2C 3C 4C'));
  assert.equal(h.melds.length, 2);
  assert.equal(R.layCheck(G, cards('2C 3C KS')).why, 'mixed');
});

test('adding to a combination', () => {
  const G = at(['8H 4H JK 9S', '5D 6D'], { melds: [[1, '5H 6H 7H'], [0, 'KS KH KC']] });
  assert.equal(R.addCheck(G, 0, cards('8H')), null, 'on her suite');
  assert.equal(R.addCheck(G, 0, cards('4H')), null, 'at the other end too');
  assert.equal(R.addCheck(G, 0, cards('4H 8H')), null, 'two cards at once');
  assert.equal(R.addCheck(G, 0, cards('9S')), 'fit');
  assert.equal(R.addCheck(G, 1, cards('JK')), null, 'a joker on a brelan');
  const g = R.add(G, 0, cards('8H 4H'));
  assert.equal(names(g.melds[0].slots.map(s => s[0])), '4H 5H 6H 7H 8H');
  assert.equal(g.last.kind, 'add');
  // Before opening, nothing goes on the table.
  const closed = at(['8H 9S', '5D 6D'], { melds: [[1, '5H 6H 7H']] });
  assert.equal(R.addCheck(closed, 0, cards('8H')), 'closed');
  // A second joker is refused.
  const two = at(['JK2 9S', '5D 6D'], { melds: [[1, '5H JK 7H']] , opened: [true, true] });
  assert.equal(R.addCheck(two, 0, [53]), 'joker');
  // A joker keeps its place: the 6 it stands for cannot go in.
  const placed = at(['6H 8H 9S', '5D 6D'], { melds: [[1, '5H JK 7H']], opened: [true, true] });
  assert.equal(R.addCheck(placed, 0, cards('6H')), 'fit');
  assert.equal(R.addCheck(placed, 0, cards('8H')), null);
  // He must keep a card to throw: the card taken from the défausse does not count.
  const keep = at(['8H 9S', '5D 6D'], { melds: [[1, '5H 6H 7H']], opened: [true, true], taken: card('9S') });
  assert.equal(R.addCheck(keep, 0, cards('8H')), 'keep');
});

test('the end of the partie', () => {
  // By throwing the last card.
  const a = R.discard(at(['9S', 'KD JK AC 5C'], { melds: [[0, 'KS KH KC']] }), card('9S'));
  assert.ok(a.phase === 'over' && a.result.winner === 0);
  assert.equal(a.result.points, 10 + 20 + 11 + 5, 'the loser counts a figure 10, the joker 20, the as 11');
  // By laying the last cards.
  const b = R.lay(at(['2C 3C 4C', '5D 6D'], { melds: [[0, 'KS KH KC']] }), cards('2C 3C 4C'));
  assert.ok(b.phase === 'over' && b.result.winner === 0 && b.result.points === 11);
  assert.ok(R.valid(JSON.parse(JSON.stringify(b))), 'a finished game is a valid save');
  // A plain throw passes the turn.
  const c = R.discard(at(['9S 2D', '5D 6D']), card('9S'));
  assert.ok(c.turn === 1 && c.phase === 'draw' && R.top(c) === card('9S') && c.turns[0] === 1);
});

test('the pioche takes the défausse when it runs out', () => {
  const G = at(['9S 2D', '5D 6D'], { stock: '' });
  const before = G.pile.length;
  const g = R.discard(G, card('9S'));
  assert.ok(g.last.shuffled && g.pile.length === 1 && R.top(g) === card('9S') && g.stock.length === before, 'all but the top card go back, shuffled');
  assert.equal(new Set([...g.hands.flat(), ...g.stock, ...g.pile]).size, 54);
  assert.deepEqual(R.discard(G, card('9S')).stock, g.stock, 'the same shuffle each time, for undo and reloads');
});

test('the computer plays legal turns, and the hint too', () => {
  for (const level of ['facile', 'moyen', 'fort']) {
    for (let seed = 0; seed < 25; seed++) {
      let G = R.newGame(R.seeded(seed * 31 + 3));
      for (let t = 0; t < 400 && G.phase !== 'over'; t++) {
        const h = R.hint(G);
        assert.ok(h && h.type === 'take');
        G = R.take(G, R.chooseDraw(G, level));
        const plan = R.planTurn(G, level);
        assert.deepEqual(plan, R.planTurn(G, level), 'the same choice each time');
        const hp = R.hint(G);
        assert.doesNotThrow(() => R.apply(G, hp), 'the hint is a legal move');
        for (const a of plan) { G = R.apply(G, a); if (G.phase === 'over') break; }
        assert.ok(R.valid(JSON.parse(JSON.stringify(G))));
      }
    }
  }
  // The hint opens when it can.
  const G = at(['KS KH KC QD JD 10D 2C 3S', '5D 6D']);
  const h = R.hint(G);
  assert.equal(h.type, 'lay');
  assert.equal(names(R.sortHand(h.cards)), names(R.sortHand(cards('KS KH KC QD JD 10D'))));
});

test('the levels: each one beats the one below', () => {
  function play(levels, seed, starter) {
    let G = R.newGame(R.seeded(seed));
    G.turn = starter;
    for (let t = 0; t < 2000 && G.phase !== 'over'; t++) {
      const lv = levels[G.turn];
      G = R.take(G, R.chooseDraw(G, lv));
      for (const a of R.planTurn(G, lv)) { G = R.apply(G, a); if (G.phase === 'over') break; }
    }
    return G.phase === 'over' ? G.result.winner : -1;
  }
  // The same 400 deals for each pair, each player starting half of them.
  const rate = (strong, weak) => {
    let won = 0;
    for (let i = 0; i < 400; i++) for (const s of [0, 1]) if (play([strong, weak], i * 7919 + 1, s) === 0) won++;
    return won / 8;
  };
  const mf = rate('moyen', 'facile'), dm = rate('fort', 'moyen');
  console.log(`Moyen wins ${mf.toFixed(1)} % against Facile, Difficile ${dm.toFixed(1)} % against Moyen`);
  assert.ok(mf > 70, 'Moyen beats Facile');
  assert.ok(dm > 53, 'Difficile beats Moyen');
});

test('a save is checked', () => {
  const G = R.newGame(R.seeded(2));
  assert.ok(R.valid(JSON.parse(JSON.stringify(G))));
  assert.ok(!R.valid({ ...G, hands: [G.hands[0], G.hands[1].slice(1)] }), 'a card missing');
  assert.ok(!R.valid({ ...G, phase: 'nap' }));
  assert.ok(!R.valid({ ...G, melds: [{ owner: 0, type: 'run', slots: [[0, 1], [1, 2], [3, 4]] }] }), 'a broken combination');
  assert.ok(!R.valid(null));
  const old = JSON.parse(JSON.stringify(G));
  delete old.took; delete old.turns; delete old.n;
  assert.ok(R.valid(old) && old.took.length === 2 && old.turns.join() === '0,0', 'an older save without the computer\'s notes gets them');
});
