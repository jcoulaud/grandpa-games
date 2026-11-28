// The rules of the dominos, the computer players and the hint, without a browser.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
require('../public/dominos/engine.js');
require('../public/dominos/line.js');
const D = globalThis.Dominos, DL = globalThis.DominoLine;

// A tile by its two numbers, in any order.
const T = (a, b) => D.TILES.findIndex(([x, y]) => (x === Math.min(a, b) && y === Math.max(a, b)));
// A game in progress: the three hands, the line from one end to the other as [a, b] pairs, and the top of
// the pioche (drawn first last). Every other tile goes under the pioche, or with stock: null, to the hand
// of the player given in rest, so the pioche is empty.
function at(hands, line, { stock = [], turn = 0, rest = null } = {}) {
  const hs = hands.map(h => h.map(([a, b]) => T(a, b)));
  const ln = line.map(([a, b]) => ({ t: T(a, b), l: a, r: b }));
  const st = (stock || []).map(([a, b]) => T(a, b));
  const used = new Set([...hs.flat(), ...ln.map(x => x.t), ...st]);
  const others = D.TILES.map((x, i) => i).filter(t => !used.has(t));
  if (rest !== null) hs[rest].push(...others);
  const G = { ...D.newGame('moyen', 1), hands: hs, line: ln, first: 0, stock: rest !== null ? st : [...others, ...st],
    opening: null, turn, voids: [[], [], []], last: null, end: null, result: null };
  assert.ok(D.valid(G), 'the test game holds together');
  return G;
}

test('the set and the deal', () => {
  assert.equal(D.TILES.length, 28);
  assert.equal(D.TILES.reduce((a, [x, y]) => a + x + y, 0), 168, 'the double-six set holds 168 points');
  assert.equal(D.TILES.filter(([a, b]) => a === b).length, 7, 'seven doubles');
  for (let s = 1; s <= 300; s++) {
    const G = D.newGame('facile', s);
    assert.ok(G.hands.every(h => h.length === 7) && G.stock.length === 7 && !G.line.length, 'seven each, seven in the pioche');
    assert.equal(new Set([...G.hands.flat(), ...G.stock]).size, 28, 'each tile once');
    const doubles = G.hands.flat().filter(D.isDouble);
    const best = doubles.length ? Math.max(...doubles.map(D.pips)) : null;
    if (best !== null) assert.ok(D.isDouble(G.opening) && D.pips(G.opening) === best, 'the highest double opens');
    assert.ok(G.hands[G.turn].includes(G.opening), 'the player with it starts');
    assert.deepEqual(D.legal(G), [{ t: G.opening, side: 'C' }], 'the only move is to lay it');
    assert.ok(D.valid(G), 'a new game is valid');
  }
  assert.deepEqual(D.newGame('fort', 5), D.newGame('fort', 5), 'a seed deals the same game');
  assert.notDeepEqual(D.newGame('fort', 5).hands, D.newGame('fort', 6).hands, 'another seed deals another game');
});

test('without a double, the heaviest tile opens', () => {
  // All seven doubles in the pioche happens once in a million deals: check the rule on hands made for it.
  const h = [[T(6, 5), T(1, 0)], [T(6, 4), T(2, 1)], [T(5, 4), T(3, 0)]];
  assert.deepEqual(D.opener(h), { t: T(6, 5), p: 0 }, 'the six-cinq, the heaviest');
  assert.deepEqual(D.opener([[T(6, 5)], [T(0, 0)], []]), { t: T(0, 0), p: 1 }, 'a double, even the double blanc, comes first');
});

test('laying a domino at each end', () => {
  let G = at([[[6, 4], [4, 2], [3, 3]], [[1, 0]], [[2, 0]]], [[4, 1], [1, 6]]);
  assert.deepEqual(D.fits(G, T(6, 4)), ['L', 'R'], 'a six-quatre goes at both ends of 4 … 6');
  assert.deepEqual(D.fits(G, T(4, 2)), ['L'], 'a quatre-deux only by the 4');
  assert.deepEqual(D.fits(G, T(3, 3)), [], 'a double trois nowhere');
  assert.equal(D.play(G, T(3, 3), 'L'), G, 'a tile that does not fit is refused');
  assert.equal(D.play(G, T(4, 2), 'R'), G, 'a tile at the wrong end is refused');
  G = D.play(G, T(4, 2), 'L');
  assert.deepEqual(G.line.map(x => [x.l, x.r]), [[2, 4], [4, 1], [1, 6]], 'the 4 touches the 4');
  assert.equal(G.first, 1, 'the opening tile moved one place');
  assert.equal(G.turn, 1, 'play turns to the player on his right');
  assert.ok(D.valid(G));
  G = D.play(G, T(1, 0), 'L');
  assert.equal(G.turn, 1, 'a tile that does not fit for player 1 is refused');
});

test('drawing and passing', () => {
  let G = at([[[5, 5], [3, 1]], [[1, 0]], [[2, 0]]], [[4, 6]], { stock: [[6, 2], [3, 3]] });
  assert.deepEqual(D.legal(G), [], 'nothing fits');
  assert.equal(D.pass(G), G, 'no pass while the pioche has tiles');
  G = D.draw(G);
  assert.equal(G.hands[0].at(-1), T(3, 3), 'the top of the pioche comes to his hand');
  assert.deepEqual(G.voids[0].sort(), [4, 6], 'he showed he has no 4 and no 6');
  assert.equal(G.turn, 0, 'still his turn');
  G = D.draw(G);
  assert.deepEqual(D.legal(G), [{ t: T(6, 2), side: 'R' }], 'the six-deux now fits');
  assert.equal(D.draw(G), G, 'no draw while a tile fits');
  // The pioche is empty and nothing fits: he passes, and the others go on.
  G = at([[[5, 5], [3, 1]], [[1, 0], [4, 4]], []], [[4, 6]], { stock: null, rest: 2 });
  assert.equal(D.draw(G), G, 'no draw from an empty pioche');
  const P = D.pass(G);
  assert.ok(P.turn === 1 && P.last.kind === 'pass' && !P.end, 'a pass gives the turn to the next player');
  assert.deepEqual(P.voids[0].sort(), [4, 6]);
});

test('the end of a manche: domino and blocked', () => {
  // He lays his last tile: he marks the points left in the two other hands.
  let G = at([[[6, 4]], [[1, 0], [5, 5]], []], [[4, 3]], { stock: null, rest: 2 });
  G = D.play(G, T(6, 4), 'L');
  const pts = D.handPips(G.hands[1]) + D.handPips(G.hands[2]);
  assert.ok(G.end && G.end.winner === 0 && !G.end.blocked && G.end.points === pts, 'domino: he marks the others\' points');
  assert.equal(G.scores[0], pts);
  assert.equal(G.result, 'won', `${pts} points end the game`);
  assert.deepEqual(D.legal(G), [], 'nothing moves after the end');
  // Real blocked manches, from games played to the end.
  let seen = 0;
  for (let s = 1; s <= 3000 && seen < 30; s++) {
    let R = D.newGame('facile', s);
    while (!R.end) { const st = D.autoTurn(R, 'facile'); R = st.at(-1).G; }
    if (!R.end.blocked) continue;
    seen++;
    const low = Math.min(...R.end.pips);
    assert.ok(!R.stock.length && [0, 1, 2].every(p => !D.canPlay(R, p)), 'nobody could play');
    if (R.end.winner !== null) {
      assert.equal(R.end.pips[R.end.winner], low, 'the smallest total wins a blocked manche');
      assert.equal(R.end.points, R.end.pips.reduce((a, v) => a + v, 0) - low, 'and marks the others\' points');
    } else assert.ok(R.end.pips.filter(v => v === low).length > 1 && R.end.points === 0, 'a tie for the smallest marks nothing');
  }
  assert.ok(seen >= 5, `${seen} manches blocked`);
});

test('the game ends at 100 points, then a new manche cannot start', () => {
  let G = D.newGame('moyen', 77);
  let manches = 0;
  while (!G.result) {
    while (!G.end) { const st = D.autoTurn(G, 'moyen'); G = st.at(-1).G; }
    assert.ok(D.valid(G), 'the end of a manche is valid');
    manches++;
    if (!G.result) { G = D.nextManche(G); assert.equal(G.manche, manches + 1); assert.ok(D.valid(G)); }
  }
  assert.ok(G.scores.some(s => s >= 100), 'someone reached 100');
  assert.equal(G.result, G.scores[0] >= 100 ? 'won' : 'lost');
  assert.equal(D.nextManche(G), G, 'no manche after the end of the game');
  assert.ok(manches >= 2 && manches <= 20, `the game took ${manches} manches`);
});

test('every computer turn is legal and repeats the same', () => {
  for (const level of ['facile', 'moyen', 'fort']) {
    let worst = 0;
    for (let s = 1; s <= 40; s++) {
      let G = D.newGame(level, s * 31);
      while (!G.end) {
        const t0 = performance.now();
        const steps = D.computerTurn(G);
        worst = Math.max(worst, performance.now() - t0);
        assert.deepEqual(steps, D.computerTurn(G), 'the same game gives the same turn');
        const p = G.turn;
        for (const s of steps) {
          assert.ok(D.valid(s.G), 'each step is valid');
          if (s.did === 'draw') assert.ok(!D.canPlay(G, p) && G.stock.length, 'a draw only when nothing fits');
          if (s.did === 'pass') assert.ok(!D.canPlay(G, p) && !G.stock.length, 'a pass only with an empty pioche');
          if (s.did === 'play') assert.ok(D.fits(G, s.t).includes(s.side), 'a play fits');
          G = s.G;
        }
      }
    }
    assert.ok(worst < 120, `${level}: the slowest turn took ${worst.toFixed(1)} ms`);
  }
});

test('the hint', () => {
  // Only one tile fits: the hint lays it.
  let G = at([[[6, 2], [3, 3], [1, 1]], [[1, 0]], [[2, 0]]], [[4, 6]]);
  assert.deepEqual(D.advice(G), { kind: 'play', t: T(6, 2), side: 'R' });
  G = at([[[3, 3], [1, 1]], [[1, 0]], [[2, 0]]], [[4, 6]]);
  assert.deepEqual(D.advice(G), { kind: 'draw' }, 'nothing fits: draw');
  // The hint prefers going out: his last tile.
  G = at([[[6, 5]], [[1, 0]], [[2, 0]]], [[4, 6]]);
  assert.deepEqual(D.advice(G), { kind: 'play', t: T(6, 5), side: 'R' });
  // Following the hint is never worse than Moyen at the same seat.
  let hintPts = 0, moyenPts = 0;
  for (let s = 1; s <= 150; s++) {
    for (const who of ['hint', 'moyen']) {
      let H = D.newGame('moyen', s * 101);
      while (!H.end) {
        if (H.turn === 0 && who === 'hint') {
          const a = D.advice(H);
          H = a.kind === 'play' ? D.play(H, a.t, a.side) : a.kind === 'draw' ? D.draw(H) : D.pass(H);
        } else { const st = D.autoTurn(H, 'moyen'); H = st.at(-1).G; }
      }
      const got = H.end.winner === 0 ? H.end.points : 0;
      if (who === 'hint') hintPts += got; else moyenPts += got;
    }
  }
  assert.ok(hintPts > moyenPts, `the hint marks ${hintPts} points, Moyen ${moyenPts}`);
});

test('a save is checked', () => {
  const G = D.newGame('fort', 9);
  assert.ok(D.valid(JSON.parse(JSON.stringify(G))));
  assert.ok(!D.valid({ ...G, level: 'expert' }), 'an unknown level');
  assert.ok(!D.valid({ ...G, hands: [G.hands[0], G.hands[1], [...G.hands[2], G.hands[0][0]]] }), 'a tile twice');
  assert.ok(!D.valid({ ...G, stock: G.stock.slice(1) }), 'a missing tile');
  const P = D.play(G, G.opening, 'C');
  assert.ok(D.valid(P));
  assert.ok(!D.valid({ ...P, line: [{ ...P.line[0], l: (P.line[0].l + 1) % 7 }] }), 'a line that does not match its tile');
  assert.ok(!D.valid(null) && !D.valid({}), 'no game');
});

// The line on the table: whatever its length and the width of the table, the dominoes never overlap, stay
// inside the width, and each one touches the one before it by the matching half.
test('the line snakes inside the table', () => {
  const ends = r => {
    if (r.dir === 'X') { const c = [r.x + .5, r.y + 1]; return [c, c]; }
    const a = [r.x + .5, r.y + .5], b = r.dir === 'E' || r.dir === 'W' ? [r.x + 1.5, r.y + .5] : [r.x + .5, r.y + 1.5];
    return r.dir === 'E' || r.dir === 'S' ? [a, b] : [b, a];
  };
  const dist = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]);
  let lines = 0, longest = 0;
  for (let s = 1; s <= 120; s++) {
    let G = D.newGame('facile', s * 13);
    while (!G.end) {
      const st = D.autoTurn(G, 'facile'); G = st.at(-1).G;
      longest = Math.max(longest, G.line.length);
      for (const [C, off] of [[8, 0], [9, 0], [13, -3], [20, 4], [31, -12], [44, 0], [26, 'best']]) {
        const rects = off === 'best' ? DL.best(G.line, G.first, C).rects : DL.layout(G.line, G.first, C, off);
        lines++;
        assert.equal(rects.length, G.line.length + 2, 'every domino and the two free places');
        for (const r of rects) assert.ok(r.x >= -C / 2 - 1e-9 && r.x + r.w <= C / 2 + 1e-9, `inside the width ${C}`);
        for (let a = 0; a < rects.length; a++) for (let b = a + 1; b < rects.length; b++) {
          const A = rects[a], B = rects[b];
          const ox = Math.min(A.x + A.w, B.x + B.w) - Math.max(A.x, B.x), oy = Math.min(A.y + A.h, B.y + B.h) - Math.max(A.y, B.y);
          assert.ok(ox <= 1e-9 || oy <= 1e-9, `no overlap at width ${C}`);
        }
        const by = new Map(rects.filter(r => !r.ghost).map(r => [r.i, r]));
        for (let i = 0; i < G.line.length; i++) {
          const r = by.get(i);
          if (r.dir !== 'X' || G.line[i].l !== G.line[i].r) assert.ok(r.vi === G.line[i].l || r.vi === G.line[i].r);
          if (i === G.first || i === G.first + 1 || i === G.first - 1) continue;
          const prev = i > G.first ? by.get(i - 1) : by.get(i + 1);
          assert.equal(dist(ends(prev)[1], ends(r)[0]), 1, `domino ${i} touches the one before at width ${C}`);
          assert.equal(prev.vo, r.vi, 'by the same number');
        }
      }
    }
  }
  assert.ok(lines > 1000 && longest >= 18, `${lines} lines, the longest ${longest} dominoes`);
  // Two dominoes on the left of the opening one, then the opening double across.
  const L = DL.layout([{ t: 0, l: 5, r: 3 }, { t: 0, l: 3, r: 6 }, { t: 27, l: 6, r: 6 }], 2, 20);
  assert.equal(L[0].dir, 'X', 'the opening double lies across');
});

// The levels: one seat at a level against two seats one level below, the seat moving round the table.
// Each level wins more manches and marks more points than the players one level below.
function duel(hi, lo, n) {
  let wins = 0, hiPts = 0, loPts = 0;
  for (let s = 1; s <= n; s++) {
    const seat = s % 3;
    let G = D.newGame('moyen', s * 7919);
    while (!G.end) { const st = D.autoTurn(G, G.turn === seat ? hi : lo); G = st.at(-1).G; }
    if (G.end.winner === seat) { wins++; hiPts += G.end.points; } else if (G.end.winner !== null) loPts += G.end.points;
  }
  return { wins: wins / n, hi: hiPts / n, lo: loPts / n / 2 };
}
test('Moyen beats Facile', () => {
  const r = duel('moyen', 'facile', 1500);
  console.log(`# Moyen against two Facile: wins ${(r.wins * 100).toFixed(1)} % of the manches, ${r.hi.toFixed(1)} points a manche, each Facile ${r.lo.toFixed(1)}`);
  assert.ok(r.wins > .38 && r.hi > r.lo * 1.4);
});
test('Difficile beats Moyen', () => {
  const r = duel('fort', 'moyen', 450);
  console.log(`# Difficile against two Moyen: wins ${(r.wins * 100).toFixed(1)} % of the manches, ${r.hi.toFixed(1)} points a manche, each Moyen ${r.lo.toFixed(1)}`);
  assert.ok(r.wins > .40 && r.hi > r.lo * 1.6);
});
test('whole games: each level wins more games to 100 points than one in three', () => {
  for (const [hi, lo, n] of [['moyen', 'facile', 300], ['fort', 'moyen', 90]]) {
    let wins = 0;
    for (let s = 1; s <= n; s++) {
      const seat = s % 3;
      let G = D.newGame('moyen', s * 104729);
      for (;;) {
        while (!G.end) { const st = D.autoTurn(G, G.turn === seat ? hi : lo); G = st.at(-1).G; }
        if (G.scores.some(x => x >= 100)) break;
        G = D.nextManche(G);
      }
      const top = Math.max(...G.scores);
      if (G.scores[seat] === top) wins++;
    }
    console.log(`# ${hi} against two ${lo}: wins ${wins} of ${n} games`);
    assert.ok(wins / n > .42, `${hi} wins ${wins} of ${n}`);
  }
});
