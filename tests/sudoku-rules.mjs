// The sudoku without a browser: the solver, the reasoning of the levels, the grid maker, the moves,
// the hint and the check of a save.
import { createRequire } from 'node:module';
import vm from 'node:vm';
const require = createRequire(import.meta.url);
require('../public/sudoku/engine.js');
const S = globalThis.Sudoku;
let fails = 0;
const ok = (c, m, extra = '') => { console.log((c ? 'PASS ' : 'FAIL ') + m + (c ? '' : ' ' + extra)); if (!c) fails++; };
const givens = s => [...s].filter(c => c !== '0').length;
const validFull = s => S.UNITS.every(u => new Set(u.map(i => s[i])).size === 9) && !s.includes('0');

// 1. The shape of the grid.
ok(S.UNITS.length === 27 && S.UNITS.every(u => u.length === 9 && new Set(u).size === 9), '27 units of 9 cells: rows, columns, blocks');
ok(S.PEERS.every((p, i) => p.length === 20 && !p.includes(i)), 'each cell sees 20 others');
ok(S.BOX(0) === 0 && S.BOX(80) === 8 && S.BOX(30) === 4 && S.BOX(8) === 2, 'the blocks are numbered in reading order');

// 2. The search solver.
// A classic puzzle with one solution (Project Euler, grid 01).
const EULER = '003020600900305001001806400008102900700000008006708200002609500800203009005010300';
const EULER_SOL = '483921657967345821251876493548132976729564138136798245372689514814253769695417382';
ok(S.countSolutions(EULER) === 1 && S.solve(EULER) === EULER_SOL, 'a known puzzle has its one known solution');
ok(S.countSolutions('0'.repeat(81)) === 2, 'an empty grid has several solutions');
ok(S.countSolutions('11' + '0'.repeat(79)) === 0 && S.solve('11' + '0'.repeat(79)) === null, 'two 1 in a row: no solution');
{
  const r = S.grade(EULER);
  ok(r.solved && r.grid === EULER_SOL && r.level === 1, `the reasoning solves it with singles alone (${r.steps.join('/')})`);
}

// 3. The reasoning never goes wrong: on 150 grids with a single solution, made by taking out as many
// digits as possible, every grid it solves ends on the true solution, and where it stops, every digit
// it placed is right.
{
  let wrong = 0, solved = 0, stuck = 0;
  for (let seed = 1; seed <= 150; seed++) {
    const rnd = S.random(seed * 7919);
    const sol = S.make('facile', seed).solution;
    const g = [...sol];
    for (const i of [...Array(81).keys()].sort(() => rnd() - .5)) {
      const keep = g[i]; g[i] = '0';
      if (S.countSolutions(g.join('')) !== 1) g[i] = keep;
    }
    const r = S.grade(g.join(''));
    if (r.solved) solved++; else stuck++;
    if ([...r.grid].some((c, i) => c !== '0' && c !== sol[i])) wrong++;
  }
  ok(!wrong, `the reasoning places only right digits: ${solved} grids solved, ${stuck} stopped, ${wrong} wrong`);
}

// 4. The grid maker: one solution, the givens are part of it, the same seed makes the same grid.
const made = {};
for (const level of Object.keys(S.LEVELS)) {
  const list = made[level] = [];
  let bad = 0, slow = 0;
  const times = [];
  for (let seed = 1; seed <= 40; seed++) {
    const t = performance.now();
    const G = S.newGame(level, seed * 101);
    times.push(performance.now() - t);
    const r = S.grade(G.givens);
    list.push({ G, r });
    if (S.countSolutions(G.givens) !== 1 || !validFull(G.solution) || [...G.givens].some((c, i) => c !== '0' && c !== G.solution[i])
      || !r.solved || r.grid !== G.solution || !S.valid(G)) bad++;
  }
  times.sort((a, b) => a - b);
  ok(!bad, `${level}: 40 grids, each with one solution that the reasoning finds without a guess`, `${bad} bad`);
  ok(times[20] < 120, `${level}: a grid takes ${times[20].toFixed(1)} ms in the middle, ${times.at(-1).toFixed(0)} ms at most`);
  const a = S.newGame(level, 77), b = S.newGame(level, 78);
  ok(JSON.stringify(a) === JSON.stringify(S.newGame(level, 77)) && a.givens !== b.givens, `${level}: a seed always gives the same grid`);
}
ok(S.newGame('expert', 5).level === 'facile' && S.newGame('toString', 5).level === 'facile', 'an unknown level makes a Facile grid');
// Putting digits back to keep Facile to singles used to leave up to 48 givens on these seeds.
ok([7533, 2899].every(seed => givens(S.newGame('facile', seed).givens) <= 42), 'Facile never goes past 42 givens');

// 5. The levels: each needs harder reasoning than the one below.
{
  const F = made.facile, M = made.moyen, D = made.fort;
  ok(F.every(({ G, r }) => r.level === 1 && givens(G.givens) >= 38 && givens(G.givens) <= 42), 'Facile: singles only, 38 to 42 givens');
  ok(M.every(({ r }) => r.level === 2 && r.steps[2] >= 2), 'Moyen: needs pairs or pointing at least twice, nothing harder');
  ok(D.every(({ r }) => r.level === 3 && r.steps[3] >= 2), 'Difficile: needs an X-wing, a wing or a triple at least twice, never a guess');
  const avg = (list, f) => list.reduce((s, x) => s + f(x), 0) / list.length;
  const hard = ({ r }) => r.steps[2] + 2 * r.steps[3];
  const gv = list => avg(list, ({ G }) => givens(G.givens));
  console.log(`     givens on average: Facile ${gv(F).toFixed(1)}, Moyen ${gv(M).toFixed(1)}, Difficile ${gv(D).toFixed(1)}`);
  console.log(`     steps beyond singles (level 3 counts twice): Facile ${avg(F, hard).toFixed(1)}, Moyen ${avg(M, hard).toFixed(1)}, Difficile ${avg(D, hard).toFixed(1)}`);
  ok(avg(F, hard) < avg(M, hard) && avg(M, hard) < avg(D, hard), 'each level needs more reasoning beyond singles than the one below');
  ok(gv(F) > gv(M), 'Facile gives more digits than Moyen');
}

// 6. The moves.
{
  let G = S.newGame('facile', 4242);
  const empty = [...G.givens].findIndex(c => c === '0');
  const given = [...G.givens].findIndex(c => c !== '0');
  const right = +G.solution[empty];
  ok(S.refusal(G, given, 'place', 1) === 'given' && S.write(G, given, 1) === null, 'a given cannot change');
  let r = S.write(G, empty, right);
  ok(r && r.G.cells[empty] === String(right) && !r.clash && S.board(r.G)[empty] === right, 'a digit goes in an empty cell');
  ok(S.refusal(r.G, empty, 'place', right) === 'same', 'the same digit again is refused');
  // A digit that is already in the row, the column or the block.
  const inRow = S.UNITS[S.ROW(empty)].map(j => +G.givens[j]).find(d => d);
  const rowClash = S.write(G, empty, inRow);
  ok(rowClash.clash && rowClash.clash.unit === 'row' && +G.givens[rowClash.clash.cell] === inRow && S.conflicts(rowClash.G).includes(empty),
    'a digit already in the row breaks the rule, and the row is named');
  const colOnly = [1, 2, 3, 4, 5, 6, 7, 8, 9].find(d => !S.UNITS[S.ROW(empty)].some(j => +G.givens[j] === d)
    && S.UNITS[9 + S.COL(empty)].some(j => +G.givens[j] === d));
  if (colOnly) ok(S.write(G, empty, colOnly).clash.unit === 'col', 'a digit already in the column only names the column');
  const boxOnly = [1, 2, 3, 4, 5, 6, 7, 8, 9].find(d => ![S.ROW(empty), 9 + S.COL(empty)].some(u => S.UNITS[u].some(j => +G.givens[j] === d))
    && S.UNITS[18 + S.BOX(empty)].some(j => +G.givens[j] === d));
  if (boxOnly) ok(S.write(G, empty, boxOnly).clash.unit === 'box', 'a digit already in the block only names the block');
  // Notes.
  const other = S.PEERS[empty].find(j => G.givens[j] === '0');
  let n = S.note(G, other, right);
  ok(n.on && n.G.notes[other] === 1 << right, 'a note goes in an empty cell');
  n = S.note(n.G, empty, 4);
  r = S.write(n.G, empty, right);
  ok(r.G.notes[empty] === 0 && r.G.notes[other] === 0, 'a digit written clears the notes of its cell and itself from the notes it sees');
  ok(S.refusal(r.G, empty, 'note', 3) === 'filled' && S.note(r.G, empty, 3) === null, 'no note in a cell with a digit');
  ok(S.note(S.note(G, other, 6).G, other, 6).G.notes[other] === 0, 'a second click on a note takes it off');
  // Erase.
  const e = S.erase(r.G, empty);
  ok(e.was === right && e.G.cells[empty] === '0', 'erase takes the digit off');
  const en = S.erase(S.note(G, other, 2).G, other);
  ok(en.was === 0 && en.G.notes[other] === 0, 'erase on an empty cell takes its notes off');
  ok(S.refusal(G, empty, 'erase') === 'empty' && S.erase(G, empty) === null, 'erase on an empty cell without notes is refused');
  ok(S.erase(G, given) === null, 'a given cannot be erased');
  // A digit complete, and the win.
  for (let i = 0; i < 81; i++) if (G.givens[i] === '0' && G.solution[i] === '1') G = S.write(G, i, 1).G;
  ok(S.complete(G).includes(1), 'nine 1 in place make the 1 complete');
  const dup = S.write(G, [...G.givens].findIndex((c, i) => c === '0' && G.cells[i] === '0'), 1).G;
  ok(!S.complete(dup).includes(1), 'a tenth 1 that breaks a rule makes it not complete');
  let last = null;
  for (let i = 0; i < 81; i++) if (G.givens[i] === '0' && G.cells[i] === '0') { last = S.write(G, i, +G.solution[i]); G = last.G; }
  ok(G.result === 'won' && S.filled(G), 'the full grid wins');
  ok(S.refusal(G, empty, 'erase') === 'won' && S.write(G, empty, 1) === null && S.hint(G) === null, 'after the win, nothing more can be played');
}

// 7. The hint: the simplest reason first, and following it wins every level.
{
  let G = S.newGame('facile', 9);
  let h = S.hint(G);
  ok((h.kind === 'naked' || h.kind === 'hidden') && h.digit === +G.solution[h.cell], `on a new Facile grid the hint is a single: ${h.kind}`);
  const empty = [...G.givens].findIndex(c => c === '0');
  const clashDigit = S.PEERS[empty].map(j => +G.givens[j]).find(d => d);
  h = S.hint(S.write(G, empty, clashDigit).G);
  ok(h.kind === 'clash' && h.cell === empty && h.digit === clashDigit, 'a digit that breaks a rule comes first in the hint');
  const legal = [1, 2, 3, 4, 5, 6, 7, 8, 9].find(d => d !== +G.solution[empty] && !S.PEERS[empty].some(j => +G.givens[j] === d));
  if (legal) {
    h = S.hint(S.write(G, empty, legal).G);
    ok(h.kind === 'wrong' && h.cell === empty, 'a legal digit that is not the solution comes next, only when asked');
    ok(!S.write(G, empty, legal).clash && !S.conflicts(S.write(G, empty, legal).G).length, 'a legal but wrong digit is not shown as wrong');
  }
  // Two copies of a digit in a row, the right one first: the hint erases the wrong one.
  const row = S.UNITS.slice(0, 9).find(u => u.filter(j => G.givens[j] === '0').length >= 2);
  const [a, b] = row.filter(j => G.givens[j] === '0');
  h = S.hint(S.write(S.write(G, a, +G.solution[a]).G, b, +G.solution[a]).G);
  ok(h.kind === 'clash' && h.cell === b, 'of two clashing digits, the hint erases the one that is not the solution');
  for (const level of Object.keys(S.LEVELS)) {
    let won = 0, wrong = 0, deep = 0, unexplained = 0;
    for (let seed = 1; seed <= 8; seed++) {
      let g = S.newGame(level, seed * 31);
      for (let k = 0; k < 81 && !g.result; k++) {
        const x = S.hint(g);
        if (x.digit !== +g.solution[x.cell]) wrong++;
        if (x.kind === 'deep') {
          deep++;
          // A longer reasoning names its cells, and the digits it rules out of the cell or of the unit.
          const b = S.board(g);
          if (!x.cells.length || x.cells.some(j => b[j]) || !(x.via === 'naked' ? x.removed.length && !x.removed.includes(x.digit) : x.unit)) unexplained++;
        }
        g = S.write(g, x.cell, x.digit).G;
      }
      if (g.result === 'won') won++;
    }
    ok(won === 8 && !wrong, `${level}: following the hint wins 8 grids out of 8 with no wrong digit (${deep} longer reasonings)`);
    ok(!unexplained, `${level}: each longer reasoning lights its cells and names what it rules out`, `${unexplained} without a reason`);
  }
}

// 8. A save read back is checked whole.
{
  const G0 = S.newGame('moyen', 55);
  const empty = [...G0.givens].findIndex(c => c === '0');
  const G = S.write(G0, empty, +G0.solution[empty]).G;
  const data = { v: 1, G, undo: [S.snapshot(G0)], level: 'moyen', stats: { won: 3 }, wonNow: false };
  let r = S.restore(JSON.parse(JSON.stringify(data)));
  ok(r && r.G.cells === G.cells && r.undo.length === 1 && r.level === 'moyen' && r.stats.won === 3, 'a game in progress reads back with its undo');
  ok(S.back(r.G, r.undo[0]).cells === G0.cells, 'its undo goes back to the grid before');
  ok(S.restore(null) === null && S.restore({}) === null && S.restore({ G: 5 }) === null && S.restore('x') === null, 'an empty save is refused');
  const { level, ...bare } = G;
  r = S.restore({ G: bare });
  ok(r && r.level === 'facile' && r.stats.won === 0 && r.undo.length === 0, 'a save without a level or stats loads, at Facile');
  r = S.restore({ G: { ...G, level: 'expert' }, level: 'fort' });
  ok(r && r.level === 'fort', 'an unknown level in the game takes the level saved beside it');
  const { notes, result, ...old } = G;
  r = S.restore({ G: old });
  ok(r && r.G.notes.length === 81 && r.G.result === '', 'a save without notes or result loads');
  const set = (s, i, c) => s.slice(0, i) + c + s.slice(i + 1);
  const given = [...G.givens].findIndex(c => c !== '0');
  ok(!S.restore({ G: { ...G, givens: G.givens.slice(1) } }), 'a short grid is refused');
  ok(!S.restore({ G: { ...G, givens: set(G.givens, given, String(G.givens[given] % 9 + 1)) } }), 'a given that is not part of the solution is refused');
  ok(!S.restore({ G: { ...G, solution: set(G.solution, 0, G.solution[1]) } }), 'a solution that breaks a rule is refused');
  ok(!S.restore({ G: { ...G, cells: set(G.cells, given, '5') } }), 'a digit of his over a given is refused');
  ok(!S.restore({ G: { ...G, givens: '0'.repeat(81), cells: '0'.repeat(81) } }), 'givens with several solutions are refused');
  ok(!S.restore({ G: { ...G, notes: G.notes.slice(1) } }) && !S.restore({ G: { ...G, notes: G.notes.map((n, i) => i ? n : 1) } }), 'broken notes are refused');
  ok(!S.restore({ G: { ...G, result: 'won' } }), 'a win with empty cells is refused');
  r = S.restore({ ...data, undo: [S.snapshot(G0), '{broken', { cells: 'x' }, S.snapshot(G)] });
  ok(r && r.undo.length === 1 && r.undo[0] === S.snapshot(G), 'a broken step of the undo drops the steps before it');
  ok(!S.valid({ ...G, level: 'toString' }) && S.restore({ ...data, G: { ...G, level: 'constructor' } }).level === 'moyen',
    'a level such as "constructor" is not a level: the level saved beside it is taken');
  r = S.restore({ ...data, undo: [S.snapshot(G0), JSON.stringify({ cells: [...G.solution].map((c, i) => G.givens[i] === '0' ? c : '0').join(''), notes: G.notes })] });
  ok(r && r.undo.length === 0, 'an undo step that is a won grid is refused, with the steps before it');
  ok(S.restore({ ...data, wonNow: true }).wonNow === false, 'a game not won cannot be counted as won');
  ok(S.restore({ ...data, stats: { won: -2 } }).stats.won === 0, 'a broken count of wins starts at 0');
}

// 9. The worker is made from the engine's own source.
{
  const self = {};
  vm.runInNewContext(S.source, { self });
  ok(self.Sudoku && self.Sudoku.newGame('facile', 3).givens === S.newGame('facile', 3).givens, "the worker's source makes the same grids");
}

console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
process.exit(fails ? 1 : 0);
