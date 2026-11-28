// The rules of the loto, the neighbours, the hint, the check of a save and the three levels, without a browser.
// Run: node --test tests/loto-rules.mjs (or node tests/loto-rules.mjs)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
require('../public/loto/engine.js');
const L = globalThis.Loto;

// Plays the numbers out on his cartons, every one, as a perfect player would.
function coverAll(G) {
  L.setup(G).mine.forEach((carton, c) => L.numbersOf(carton).forEach(n => { const r = L.cover(G, c, n); if (r.G) G = r.G; }));
  return G;
}
// Draws until a number comes out, skipping the neighbours' calls; returns the game.
function drawOne(G) {
  for (;;) { const r = L.next(G); if (r.event.kind === 'draw') return r; if (r.event.kind !== 'call') throw new Error('no number left'); G = r.G; }
}

test('a carton has 3 rows of 9 columns, 5 numbers a row, each column in its tens and in order', () => {
  for (let s = 0; s < 3000; s++) {
    const c = L.makeCarton(L.rng(s));
    assert.equal(c.length, 3);
    for (const row of c) { assert.equal(row.length, 9); assert.equal(row.filter(Boolean).length, 5); }
    for (let k = 0; k < 9; k++) {
      const col = c.map(r => r[k]).filter(Boolean);
      assert.ok(col.length >= 1 && col.length <= 3, 'column ' + k + ' has 1 to 3 numbers');
      for (const n of col) assert.equal(L.colOf(n), k, `${n} is in column ${k}`);
      for (let i = 1; i < col.length; i++) assert.ok(col[i] > col[i - 1], 'a column reads from the smallest on top');
    }
    assert.equal(new Set(L.numbersOf(c)).size, 15);
  }
  assert.equal(L.colOf(9), 0); assert.equal(L.colOf(10), 1); assert.equal(L.colOf(89), 8); assert.equal(L.colOf(90), 8);
});

test('the bag holds 1 to 90 once each, and the same seed makes the same partie', () => {
  const G = L.newGame('moyen', 1234);
  const s = L.setup(G);
  assert.deepEqual([...s.order].sort((a, b) => a - b), Array.from({ length: 90 }, (_, i) => i + 1));
  assert.equal(s.mine.length, 2);
  assert.equal(s.hall.length, 3);
  assert.deepEqual(JSON.stringify(L.setup(L.newGame('moyen', 1234))), JSON.stringify(s));
  assert.equal(new Set(s.hall.map(p => p.id)).size, 3, 'three different neighbours');
});

test('a jeton goes only on a number of his carton that is out', () => {
  let G = L.newGame('facile', 7);
  const carton = L.setup(G).mine[0], nums = L.numbersOf(carton), order = L.setup(G).order;
  const later = nums.find(n => order.indexOf(n) > 10);
  assert.equal(L.cover(G, 0, later).why, 'notout');
  const absent = order.find(n => !nums.includes(n));
  assert.equal(L.cover(G, 0, absent).why, 'absent');
  // Draw until one of his numbers is out, then cover it.
  let n = null;
  while (n === null) { const r = drawOne(G); G = r.G; if (nums.includes(r.event.n)) n = r.event.n; }
  const r = L.cover(G, 0, n);
  assert.ok(r.G && r.G.covered[0].includes(n));
  assert.equal(L.cover(r.G, 0, n).why, 'covered');
  // A number missed earlier is never lost: it can be covered later.
  G = r.G;
  for (let i = 0; i < 5; i++) G = drawOne(G).G;
  const missed = nums.filter(x => order.slice(0, G.drawn).includes(x) && !G.covered[0].includes(x));
  for (const x of missed) assert.ok(L.cover(G, 0, x).G, `the ${x} can still be covered`);
  // Undo takes back the last jeton.
  const back = L.takeBack(r.G);
  assert.ok(!back.covered[0].includes(n) && back.undo.length === 0);
});

test('a call is checked: quine, double quine and carton plein, with the reason when it is wrong', () => {
  // A partie where his top row is all out while the quine is still in play.
  let G, carton, row0, seed = 1;
  const out = () => new Set(L.setup(G).order.slice(0, G.drawn));
  for (;; seed++) {
    G = L.newGame('facile', seed); carton = L.setup(G).mine[0]; row0 = carton[0].filter(Boolean);
    while (G.phase === 0 && !row0.every(n => out().has(n))) G = L.next(G).G;
    if (G.phase === 0) break;
  }
  const at = G.drawn;
  G = L.newGame('facile', seed);
  let r = L.call(G);
  assert.equal(r.why, 'notyet');
  assert.equal(r.rows, 0);
  // Draw until the first row is all out, without covering: the call says which numbers lack a jeton.
  while (G.drawn < at) G = L.next(G).G;
  {
    r = L.call(G);
    assert.equal(r.why, 'uncovered');
    assert.ok(r.open.length >= 5 && r.open.every(n => out().has(n)));
    for (const n of row0) G = L.cover(G, 0, n).G;
    r = L.call(G);
    assert.ok(r.G, 'a full row of jetons makes the quine');
    assert.equal(r.G.phase, 1);
    assert.equal(r.G.winners[0].who, -1);
    assert.equal(r.G.undo.length, 0, 'a call cannot be undone');
    // One row is not a double quine.
    assert.equal(L.call(r.G).why === 'notyet' || L.call(r.G).why === 'uncovered', true);
  }
  // Carton plein: all fifteen.
  let g = L.newGame('facile', 5);
  g = { ...g, drawn: 90, phase: 2, starts: [0, 0, 0], winners: [{ who: 0, carton: 0, at: 0 }, { who: 1, carton: 0, at: 0 }] };
  const nums = L.numbersOf(L.setup(g).mine[0]);
  for (const n of nums.slice(0, 14)) g = L.cover(g, 0, n).G;
  assert.equal(L.call(g).why, 'uncovered');
  assert.deepEqual(L.call(g).open, [nums[14]]);
  g = L.cover(g, 0, nums[14]).G;
  const end = L.call(g);
  assert.ok(end.G && end.G.phase === 3, 'the carton plein ends the partie');
  assert.equal(L.next(end.G).event.kind, 'over');
});

test('a double quine needs two full rows on the same carton', () => {
  let g = L.newGame('moyen', 31);
  g = { ...g, drawn: 90, phase: 1, starts: [0, 0], winners: [{ who: 0, carton: 0, at: 0 }] };
  const [a, b] = L.setup(g).mine;
  // One row on each carton is not a double quine.
  for (const n of a[0].filter(Boolean)) g = L.cover(g, 0, n).G;
  for (const n of b[1].filter(Boolean)) g = L.cover(g, 1, n).G;
  assert.equal(L.call(g).why, 'uncovered');
  assert.equal(L.call(g).rows, 1);
  for (const n of a[2].filter(Boolean)) g = L.cover(g, 0, n).G;
  const r = L.call(g);
  assert.ok(r.G && r.carton === 0 && r.G.phase === 2);
});

test('the neighbours call late: never before he could have called', () => {
  for (let s = 1; s <= 300; s++) for (const level of ['facile', 'moyen', 'fort']) {
    let G = L.newGame(level, s * 31);
    for (let guard = 0; guard < 200 && G.phase < 3; guard++) {
      const due = L.dueCall(G);
      const r = L.next(G);
      if (r.event.kind === 'call') {
        // The neighbour's carton was done before this click, and the delay of the level has passed.
        const p = L.setup(G).hall[r.event.who];
        const done = L.doneAt(G, p.cartons[r.event.carton], r.event.phase);
        assert.ok(done <= G.drawn, 'the carton was done before the click');
        assert.ok(G.drawn === 90 || G.drawn - Math.max(done, G.starts[G.phase]) >= p.delay[r.event.phase], 'the delay of the level has passed, or the bag is empty');
        assert.ok(due && due.who === r.event.who);
      }
      G = r.G;
    }
    assert.equal(G.phase, 3, 'every partie ends with a carton plein');
  }
});

test('the hint: a number to cover, then the call, then the next draw', () => {
  let G = L.newGame('facile', 4242);
  assert.equal(L.advice(G).kind, 'draw');
  const nums = L.numbersOf(L.setup(G).mine[0]);
  let n = null;
  while (n === null) { const r = drawOne(G); G = r.G; if (nums.includes(r.event.n)) n = r.event.n; }
  assert.deepEqual(L.advice(G), { kind: 'cover', carton: 0, n });
  // Following the hint always ends the partie, and wins at least as many lots as a player who calls late.
  let lots = 0;
  for (let s = 1; s <= 200; s++) {
    let g = L.newGame('facile', s);
    for (let guard = 0; guard < 400 && g.phase < 3; guard++) {
      const a = L.advice(g);
      if (a.kind === 'cover') g = L.cover(g, a.carton, a.n).G;
      else if (a.kind === 'call') { g = L.call(g).G; lots++; }
      else g = L.next(g).G;
    }
    assert.equal(g.phase, 3);
  }
  assert.ok(lots / 200 > 1, 'the hint wins more than one lot a partie at Facile: ' + lots / 200);
});

test('a save is checked whole', () => {
  let G = L.newGame('moyen', 77);
  assert.ok(L.valid(G));
  for (let i = 0; i < 30; i++) G = L.next(G).G;
  G = coverAll(G);
  assert.ok(L.valid(G));
  assert.ok(!L.valid({ ...G, level: 'expert' }));
  assert.ok(!L.valid({ ...G, drawn: 91 }));
  assert.ok(!L.valid({ ...G, covered: [[], []].map((_, c) => c ? G.covered[c] : [L.setup(G).order[80]]) }), 'a jeton on a number not out yet');
  assert.ok(!L.valid({ ...G, covered: [G.covered[0]] }), 'one carton missing');
  assert.ok(!L.valid({ ...G, phase: 1 }), 'a phase without its winner');
  assert.ok(!L.valid(null));
  assert.ok(!L.valid(JSON.parse(JSON.stringify({ ...G, v: 2 }))));
});

// The levels. Each level is harder than the one below:
//  1. more cartons to scan (1, 2, then 3), and no light on the numbers out from Moyen on;
//  2. the neighbours call sooner: their mean delay falls, and their first call comes earlier;
//  3. the same player wins fewer lots: one who calls at once, and one who notices his rows 2 clicks late.
const N = 1500;
function stats(level, late) {
  let lots = 0, firstCall = 0, calls = 0, delay = 0;
  for (let s = 1; s <= N; s++) {
    const seed = s * 7919;
    lots += L.simulate(level, seed, late).won;
    const hall = L.setup(L.newGame(level, seed)).hall;
    delay += hall.reduce((a, p) => a + p.delay.reduce((x, y) => x + y, 0), 0) / 9;
    // When the first neighbour would call the quine, if he never called.
    let G = L.newGame(level, seed);
    for (let guard = 0; guard < 200; guard++) { const r = L.next(G); if (r.event.kind === 'call') { firstCall += G.drawn; calls++; break; } G = r.G; }
  }
  return { lots: lots / N, delay: delay / N, firstCall: firstCall / calls };
}
test('each level is harder than the one below', () => {
  assert.deepEqual(['facile', 'moyen', 'fort'].map(l => L.LEVELS[l].cartons), [1, 2, 3]);
  assert.deepEqual(['facile', 'moyen', 'fort'].map(l => L.LEVELS[l].light), [true, false, false]);
  const s = Object.fromEntries(['facile', 'moyen', 'fort'].map(l => [l, { now: stats(l, 0), late: stats(l, 2) }]));
  console.log('# lots a partie, calling at once:', ['facile', 'moyen', 'fort'].map(l => s[l].now.lots.toFixed(2)).join(' > '));
  console.log('# lots a partie, 2 clicks late:', ['facile', 'moyen', 'fort'].map(l => s[l].late.lots.toFixed(2)).join(' > '));
  console.log('# mean delay of a neighbour, in clicks:', ['facile', 'moyen', 'fort'].map(l => s[l].now.delay.toFixed(2)).join(' > '));
  console.log('# first call of a neighbour, after draw:', ['facile', 'moyen', 'fort'].map(l => s[l].now.firstCall.toFixed(1)).join(' > '));
  for (const [a, b] of [['facile', 'moyen'], ['moyen', 'fort']]) {
    assert.ok(s[a].now.lots > s[b].now.lots + .1, `calling at once, ${a} gives more lots than ${b}`);
    assert.ok(s[a].late.lots > s[b].late.lots + .1, `calling late, ${a} gives more lots than ${b}`);
    assert.ok(s[a].now.delay > s[b].now.delay + .5, `the neighbours of ${b} call sooner`);
    assert.ok(s[a].now.firstCall > s[b].now.firstCall + 1, `the first neighbour of ${b} calls sooner`);
  }
});

// Review fix: a call looks at every carton. At Moyen with seed 2 and 67 numbers out, carton one has 4 jetons and
// carton two has a row all out with only the 13 covered: the call names that row's numbers, not « pas encore ».
test('a call that is not ready names the uncovered numbers on any carton, not only the first', () => {
  let G = { ...L.newGame('moyen', 2), drawn: 67 };
  for (const n of [20, 44, 60, 87]) G = L.cover(G, 0, n).G;
  G = L.cover(G, 1, 13).G;
  const r = L.call(G);
  assert.equal(r.why, 'uncovered');
  assert.equal(r.carton, 1);
  assert.deepEqual(r.open, [23, 35, 46, 74]);
  // Covering them makes the quine on carton two.
  for (const n of r.open) G = L.cover(G, 1, n).G;
  const won = L.call(G);
  assert.ok(won.G && won.carton === 1);
});
