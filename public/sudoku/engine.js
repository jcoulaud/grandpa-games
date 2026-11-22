// The sudoku: the rules, the solver, the grid maker, the levels and the hint. No DOM, so the page,
// the Web Worker and the tests run the same code. The page makes its worker from this file's own source
// (Sudoku.source), so it also starts offline and from a file.
//
// The cells are numbered 0 to 80, row by row. A grid is a string of 81 characters, '0' for an empty cell.
// A game G: { level, seed, givens: the grid at the start, solution: the full grid, cells: the digits he
//   wrote ('0' where he wrote none, and always '0' on a given), result: '' or 'won' }.
//
// The levels follow the techniques a solver that reasons like a person needs, never a guess:
//   1, singles: a cell with one possible digit, or a digit with one possible cell in a row, column or block.
//   2, locked candidates (pointing and claiming), naked and hidden pairs, naked triples.
//   3, hidden triples, quads, the X-wing, the swordfish, the XY-wing and the XYZ-wing.
// Facile needs level 1 only, with 38 to 42 givens. Moyen needs level 2 at least twice, Difficile level 3
// at least twice.
(function factory(root) {
  'use strict';

  // ---------- The shape of the grid ----------
  const ROW = i => Math.floor(i / 9), COL = i => i % 9, BOX = i => Math.floor(i / 27) * 3 + Math.floor(i % 9 / 3);
  const UNITS = [];
  for (let r = 0; r < 9; r++) UNITS.push(Array.from({ length: 9 }, (_, c) => r * 9 + c));
  for (let c = 0; c < 9; c++) UNITS.push(Array.from({ length: 9 }, (_, r) => r * 9 + c));
  for (let b = 0; b < 9; b++) UNITS.push(Array.from({ length: 9 }, (_, k) => (Math.floor(b / 3) * 3 + Math.floor(k / 3)) * 9 + b % 3 * 3 + k % 3));
  // The three units of each cell: its row, its column and its block.
  const CELL_UNITS = Array.from({ length: 81 }, (_, i) => [ROW(i), 9 + COL(i), 18 + BOX(i)]);
  const PEERS = Array.from({ length: 81 }, (_, i) => {
    const s = new Set();
    for (const u of CELL_UNITS[i]) for (const j of UNITS[u]) if (j !== i) s.add(j);
    return [...s];
  });
  const sees = (a, b) => a !== b && (ROW(a) === ROW(b) || COL(a) === COL(b) || BOX(a) === BOX(b));
  const ALL = 0x3FE; // bits 1 to 9
  const bits = m => { let n = 0; while (m) { m &= m - 1; n++; } return n; };
  const digitsOf = m => { const out = []; for (let d = 1; d <= 9; d++) if (m & (1 << d)) out.push(d); return out; };

  // A small seeded random source (mulberry32), so a seed always gives the same grid.
  function random(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function shuffle(list, rnd) {
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
    return list;
  }
  const toArray = s => Array.from(s, Number);
  const toString = a => a.join('');

  // ---------- The search solver ----------
  // Counts the solutions of a grid (an array of 81 digits), up to limit. With rnd, it tries the digits
  // in a random order and fills the grid with its first solution: that makes a full grid.
  function search(g, limit, rnd) {
    const rows = new Int32Array(9), cols = new Int32Array(9), boxes = new Int32Array(9);
    for (let i = 0; i < 81; i++) {
      const d = g[i];
      if (!d) continue;
      const m = 1 << d, r = ROW(i), c = COL(i), b = BOX(i);
      if ((rows[r] | cols[c] | boxes[b]) & m) return 0;
      rows[r] |= m; cols[c] |= m; boxes[b] |= m;
    }
    let found = 0, first = null;
    const empties = [];
    for (let i = 0; i < 81; i++) if (!g[i]) empties.push(i);
    function rec() {
      let best = -1, bestMask = 0, bestCount = 10;
      for (const i of empties) {
        if (g[i]) continue;
        const m = ~(rows[ROW(i)] | cols[COL(i)] | boxes[BOX(i)]) & ALL;
        const n = bits(m);
        if (n < bestCount) { best = i; bestMask = m; bestCount = n; if (n <= 1) break; }
      }
      if (best < 0) { found++; if (rnd && !first) first = g.slice(); return; }
      if (!bestCount) return;
      const r = ROW(best), c = COL(best), b = BOX(best);
      const ds = digitsOf(bestMask);
      if (rnd) shuffle(ds, rnd);
      for (const d of ds) {
        const m = 1 << d;
        g[best] = d; rows[r] |= m; cols[c] |= m; boxes[b] |= m;
        rec();
        g[best] = 0; rows[r] &= ~m; cols[c] &= ~m; boxes[b] &= ~m;
        if (found >= limit) return;
      }
    }
    rec();
    if (rnd && first) for (let i = 0; i < 81; i++) g[i] = first[i];
    return found;
  }
  const countSolutions = (grid, limit = 2) => search(typeof grid === 'string' ? toArray(grid) : grid.slice(), limit);
  function solve(grid) {
    const g = toArray(grid);
    if (search(g.slice(), 2) !== 1) return null;
    search(g, 1, () => 0);
    return toString(g);
  }

  // ---------- The logical solver ----------
  // Works on the candidates of each empty cell. Each step finds the simplest technique that places a
  // digit or removes a candidate, so the hardest technique it needed is the level of the grid.
  function candidates(g) {
    const cand = new Int32Array(81);
    for (let i = 0; i < 81; i++) {
      if (g[i]) continue;
      let m = ALL;
      for (const j of PEERS[i]) if (g[j]) m &= ~(1 << g[j]);
      cand[i] = m;
    }
    return cand;
  }
  function place(g, cand, i, d) {
    g[i] = d; cand[i] = 0;
    const m = ~(1 << d);
    for (const j of PEERS[i]) cand[j] &= m;
  }
  // Each finder gives a step: { place: [i, d] } or { remove: [[i, mask], ...] }, with its name and its
  // level, or null. A step that removes nothing is never given.
  function nakedSingle(g, cand) {
    for (let i = 0; i < 81; i++) if (!g[i] && bits(cand[i]) === 1) return { name: 'naked', level: 1, place: [i, digitsOf(cand[i])[0]] };
    return null;
  }
  // Blocks first, then rows, then columns: a block is the easiest place to look for a person.
  const HIDDEN_ORDER = [...UNITS.keys()].slice(18).concat([...UNITS.keys()].slice(0, 18));
  function hiddenSingle(g, cand) {
    for (const u of HIDDEN_ORDER) {
      for (let d = 1; d <= 9; d++) {
        const m = 1 << d;
        let at = -1, n = 0, placed = false;
        for (const j of UNITS[u]) { if (g[j] === d) { placed = true; break; } if (cand[j] & m) { at = j; n++; } }
        if (!placed && n === 1) return { name: 'hidden', level: 1, place: [at, d], unit: u };
      }
    }
    return null;
  }
  // cells: the cells whose candidates make the reasoning, which the hint lights. need: what the reasoning
  // relies on, [cell, mask] for digits that must be out of that cell. extra: more for the hint.
  const removal = (list, name, level, cells, need, extra) => {
    const keep = list.filter(([, , has]) => has);
    return keep.length ? { name, level, remove: keep.map(([i, m]) => [i, m]), cells, need, ...extra } : null;
  };
  // Pointing: a digit of a block that sits in one row or column of it leaves the rest of that line.
  // Claiming: a digit of a line that sits in one block leaves the rest of that block.
  function locked(g, cand) {
    for (let d = 1; d <= 9; d++) {
      const m = 1 << d;
      for (let u = 0; u < 27; u++) {
        const where = UNITS[u].filter(j => !g[j] && cand[j] & m);
        if (where.length < 2) continue;
        const targets = [];
        if (u >= 18) {
          if (where.every(j => ROW(j) === ROW(where[0]))) targets.push(ROW(where[0]));
          if (where.every(j => COL(j) === COL(where[0]))) targets.push(9 + COL(where[0]));
        } else if (where.every(j => BOX(j) === BOX(where[0]))) targets.push(18 + BOX(where[0]));
        for (const t of targets) {
          const list = UNITS[t].filter(j => !where.includes(j) && !g[j]).map(j => [j, m, !!(cand[j] & m)]);
          const need = UNITS[u].filter(j => !g[j] && !where.includes(j)).map(j => [j, m]);
          const step = removal(list, u >= 18 ? 'pointing' : 'claiming', 2, where, need);
          if (step) return step;
        }
      }
    }
    return null;
  }
  function combos(list, k, start = 0, pick = [], out = []) {
    if (pick.length === k) { out.push(pick.slice()); return out; }
    for (let x = start; x <= list.length - (k - pick.length); x++) { pick.push(list[x]); combos(list, k, x + 1, pick, out); pick.pop(); }
    return out;
  }
  // k cells of a unit that share only k digits: the other cells of the unit lose those digits.
  function nakedSubset(g, cand, k, level) {
    for (let u = 0; u < 27; u++) {
      const open = UNITS[u].filter(j => !g[j]);
      if (open.length <= k) continue;
      const small = open.filter(j => bits(cand[j]) >= 2 && bits(cand[j]) <= k);
      for (const set of combos(small, k)) {
        let union = 0;
        for (const j of set) union |= cand[j];
        if (bits(union) !== k) continue;
        const step = removal(open.filter(j => !set.includes(j)).map(j => [j, union, !!(cand[j] & union)]), 'naked' + k, level, set,
          set.map(j => [j, ALL & ~union]));
        if (step) return step;
      }
    }
    return null;
  }
  // k digits of a unit that fit in only k cells: those cells lose their other digits.
  function hiddenSubset(g, cand, k, level) {
    for (let u = 0; u < 27; u++) {
      const open = UNITS[u].filter(j => !g[j]);
      if (open.length <= k) continue;
      const missing = [];
      for (let d = 1; d <= 9; d++) {
        const n = open.filter(j => cand[j] & (1 << d)).length;
        if (n >= 2 && n <= k) missing.push(d);
      }
      for (const set of combos(missing, k)) {
        const mask = set.reduce((m, d) => m | (1 << d), 0);
        const cells = open.filter(j => cand[j] & mask);
        if (cells.length !== k) continue;
        const step = removal(cells.map(j => [j, ALL & ~mask, !!(cand[j] & ~mask)]), 'hidden' + k, level, cells,
          open.filter(j => !cells.includes(j)).map(j => [j, mask]), { unit: u, digits: set });
        if (step) return step;
      }
    }
    return null;
  }
  // The X-wing (k = 2) and the swordfish (k = 3): a digit that fits in the same k columns of k rows
  // leaves the rest of those columns, and the same with rows and columns swapped.
  function fish(g, cand, k) {
    for (let d = 1; d <= 9; d++) {
      const m = 1 << d;
      for (const byRow of [true, false]) {
        const lines = [];
        for (let a = 0; a < 9; a++) {
          const where = [];
          for (let b = 0; b < 9; b++) { const i = byRow ? a * 9 + b : b * 9 + a; if (!g[i] && cand[i] & m) where.push(b); }
          if (where.length >= 2 && where.length <= k) lines.push([a, where]);
        }
        for (const set of combos(lines, k)) {
          const cross = new Set(set.flatMap(([, w]) => w));
          if (cross.size !== k) continue;
          const base = new Set(set.map(([a]) => a));
          const list = [];
          for (const b of cross) for (let a = 0; a < 9; a++) {
            if (base.has(a)) continue;
            const i = byRow ? a * 9 + b : b * 9 + a;
            if (!g[i]) list.push([i, m, !!(cand[i] & m)]);
          }
          const at = set.flatMap(([a, w]) => w.map(b => byRow ? a * 9 + b : b * 9 + a));
          const need = [];
          for (const a of base) for (let b = 0; b < 9; b++) {
            const i = byRow ? a * 9 + b : b * 9 + a;
            if (!g[i] && !cross.has(b)) need.push([i, m]);
          }
          const step = removal(list, k === 2 ? 'xwing' : 'swordfish', 3, at, need);
          if (step) return step;
        }
      }
    }
    return null;
  }
  // The XY-wing: a cell {x, y} sees a cell {x, z} and a cell {y, z}. Whatever the first holds, one of the
  // two others is z, so a cell that sees both of them cannot be z. The XYZ-wing: the first cell is
  // {x, y, z}, and a cell that sees all three cannot be z.
  function wing(g, cand, xyz) {
    for (let p = 0; p < 81; p++) {
      if (g[p] || bits(cand[p]) !== (xyz ? 3 : 2)) continue;
      const pairs = PEERS[p].filter(j => !g[j] && bits(cand[j]) === 2 && bits(cand[j] & cand[p]) === (xyz ? 2 : 1));
      for (let a = 0; a < pairs.length; a++) for (let b = a + 1; b < pairs.length; b++) {
        const A = cand[pairs[a]], B = cand[pairs[b]];
        if (A === B) continue;
        const z = xyz ? A & B & cand[p] : A & B & ~cand[p];
        if (bits(z) !== 1 || (!xyz && (A | B | cand[p]) !== (A | B))) continue;
        if (xyz && ((A | B) & ALL) !== cand[p]) continue;
        const list = [];
        for (let i = 0; i < 81; i++) {
          if (g[i] || i === p || i === pairs[a] || i === pairs[b]) continue;
          if (sees(i, pairs[a]) && sees(i, pairs[b]) && (!xyz || sees(i, p))) list.push([i, z, !!(cand[i] & z)]);
        }
        const three = [p, pairs[a], pairs[b]];
        const step = removal(list, xyz ? 'xyzwing' : 'xywing', 3, three, three.map(x => [x, ALL & ~cand[x]]));
        if (step) return step;
      }
    }
    return null;
  }
  const FINDERS = [
    nakedSingle, hiddenSingle,
    locked, (g, c) => nakedSubset(g, c, 2, 2), (g, c) => hiddenSubset(g, c, 2, 2), (g, c) => nakedSubset(g, c, 3, 2),
    (g, c) => hiddenSubset(g, c, 3, 3), (g, c) => fish(g, c, 2), (g, c) => wing(g, c, false), (g, c) => wing(g, c, true),
    (g, c) => fish(g, c, 3), (g, c) => nakedSubset(g, c, 4, 3), (g, c) => hiddenSubset(g, c, 4, 3),
  ];
  function nextStep(g, cand) {
    for (const f of FINDERS) { const s = f(g, cand); if (s) return s; }
    return null;
  }
  function apply(g, cand, s) {
    if (s.place) place(g, cand, s.place[0], s.place[1]);
    else for (const [i, m] of s.remove) cand[i] &= ~m;
  }
  // Solves a grid by reasoning only. Returns { solved, level, steps: the steps of each level, stuck: the
  // first empty cell when it is stuck, grid: how far it got }.
  function grade(grid) {
    const g = toArray(grid), cand = candidates(g);
    const steps = [0, 0, 0, 0];
    let level = 0;
    for (;;) {
      if (g.every(Boolean)) return { solved: true, level, steps, grid: toString(g) };
      // A cell with no candidate: the grid has no solution.
      if (g.some((d, i) => !d && !cand[i])) return { solved: false, level, steps, stuck: g.indexOf(0), grid: toString(g) };
      const s = nextStep(g, cand);
      if (!s) return { solved: false, level, steps, stuck: g.indexOf(0), grid: toString(g) };
      apply(g, cand, s);
      steps[s.level]++;
      level = Math.max(level, s.level);
    }
  }

  // ---------- The grid maker ----------
  // The key 'fort' shows as "Difficile" (lib/kit.js).
  const LEVELS = {
    facile: { level: 1, givens: [38, 42] },
    moyen: { level: 2, steps: 2 },
    fort: { level: 3, steps: 2 },
  };
  // Only the three keys: a save with "toString" or "constructor" is not a level.
  const isLevel = k => typeof k === 'string' && Object.hasOwn(LEVELS, k);
  function fullGrid(rnd) {
    const g = new Array(81).fill(0);
    search(g, 1, rnd);
    return g;
  }
  // Makes the grid of a level from a seed: { givens, solution, tries }. It takes empty cells out two at a
  // time, opposite each other through the centre, as long as the grid keeps one solution. For Facile it
  // stops at 38 to 42 givens. For Moyen and Difficile it goes as far as it can, then puts back the digits
  // where the reasoning gets stuck until the grid needs exactly the level.
  function make(level, seed) {
    const L = LEVELS[isLevel(level) ? level : 'facile'];
    const rnd = random(seed);
    for (let tries = 1; ; tries++) {
      const solution = fullGrid(rnd);
      const g = solution.slice();
      const target = L.givens ? L.givens[0] + Math.floor(rnd() * (L.givens[1] - L.givens[0] + 1)) : 0;
      let count = 81;
      for (const i of shuffle([...Array(41).keys()], rnd)) {
        const pair = i === 40 ? [40] : [i, 80 - i];
        if (count - pair.length < target) continue;
        const keep = pair.map(j => g[j]);
        pair.forEach(j => { g[j] = 0; });
        if (search(g.slice(), 2) === 1) count -= pair.length;
        else pair.forEach((j, k) => { g[j] = keep[k]; });
        if (count === target) break;
      }
      if (L.givens && count !== target) continue;
      let r = grade(toString(g));
      // Too hard: give back the digit where the reasoning stopped, and its opposite.
      while (!r.solved || r.level > L.level) {
        let at = r.solved ? -1 : r.stuck;
        if (r.solved) {
          // Solved, but with a technique above the level: give back an empty cell at random.
          const empty = g.map((d, i) => d ? -1 : i).filter(i => i >= 0);
          at = empty[Math.floor(rnd() * empty.length)];
        }
        g[at] = solution[at]; g[80 - at] = solution[80 - at];
        r = grade(toString(g));
      }
      // Facile: the digits given back must not take it past its most givens.
      if (L.givens && g.filter(Boolean).length > L.givens[1]) continue;
      if (r.level === L.level && r.steps[L.level] >= (L.steps || 0)) return { givens: toString(g), solution: toString(solution), tries };
    }
  }

  // ---------- The game ----------
  function newGame(level, seed) {
    const key = isLevel(level) ? level : 'facile';
    const { givens, solution } = make(key, seed);
    return { level: key, seed: seed >>> 0, givens, solution, cells: '0'.repeat(81), result: '' };
  }
  // The grid he sees: the givens and his digits.
  const board = G => Array.from(G.givens, (c, i) => c !== '0' ? +c : +G.cells[i]);
  const isGiven = (G, i) => G.givens[i] !== '0';
  const setAt = (s, i, c) => s.slice(0, i) + c + s.slice(i + 1);
  const UNIT_KIND = u => u < 9 ? 'row' : u < 18 ? 'col' : 'box';

  // The first other cell of the same row, column or block with the same digit as cell i: { unit, cell },
  // or null. The row first, then the column, then the block, as a person checks.
  function clash(G, i, b = board(G)) {
    const d = b[i];
    if (!d) return null;
    for (const u of CELL_UNITS[i]) for (const j of UNITS[u]) if (j !== i && b[j] === d) return { unit: UNIT_KIND(u), cell: j };
    return null;
  }
  // His digits that break a rule. A given never does: two givens never clash.
  function conflicts(G) {
    const b = board(G), out = [];
    for (let i = 0; i < 81; i++) if (!isGiven(G, i) && b[i] && clash(G, i, b)) out.push(i);
    return out;
  }
  // The digits already in place nine times, with no clash.
  function complete(G) {
    const b = board(G), bad = new Set(conflicts(G).map(i => b[i])), out = [];
    for (let d = 1; d <= 9; d++) if (!bad.has(d) && b.filter(x => x === d).length === 9) out.push(d);
    return out;
  }
  const filled = G => board(G).every(Boolean);
  const finish = G => ({ ...G, result: filled(G) && !conflicts(G).length && board(G).join('') === G.solution ? 'won' : '' });

  // Why cell i cannot take a digit or an erase now, or ''.
  function refusal(G, i, what, d) {
    if (G.result) return 'won';
    if (isGiven(G, i)) return 'given';
    if (what === 'place' && +G.cells[i] === d) return 'same';
    if (what === 'erase' && G.cells[i] === '0') return 'empty';
    return '';
  }
  // Writes d in cell i.
  function write(G, i, d) {
    if (refusal(G, i, 'place', d)) return null;
    const g = finish({ ...G, cells: setAt(G.cells, i, String(d)) });
    return { G: g, clash: clash(g, i) };
  }
  // Erases the digit of cell i.
  function erase(G, i) {
    if (refusal(G, i, 'erase')) return null;
    return { G: { ...G, cells: setAt(G.cells, i, '0') }, was: +G.cells[i] };
  }

  // The hint, from the simplest reason:
  //   { kind: 'clash', cell, digit, unit, other }  a digit of his breaks a rule: erase it
  //   { kind: 'wrong', cell, digit }               a digit of his breaks no rule but is not the solution
  //   { kind: 'naked', cell, digit }               only this digit fits this cell
  //   { kind: 'hidden', cell, digit, unit }        in this row, column or block, the digit fits only here
  //   { kind: 'deep', cell, digit, technique, via, unit, removed, cells, steps }
  //       the next digit a longer reasoning finds. via 'naked': the reasoning took the digits removed out of
  //       this cell. via 'hidden': it took the digit out of the other cells of this unit. cells: the cells
  //       whose candidates did it. steps: the reasoning in order, only the steps the digit needs, each
  //       { name, cells, targets, digits, unit, subset }: because of its cells, its digits leave its
  //       targets. A step relies on the visible board and the steps before it only. With one step, cells
  //       and removed say it all; with more, the page shows them one at a time.
  // The steps of used that a conclusion needs, in order: a step counts when it took out a digit the
  // conclusion or a later step relies on (need). A step that took different digits out of different cells
  // splits in one step for each set of digits, so each sentence is true for each cell it names.
  function chain(used, need) {
    const want = new Int32Array(81), out = [];
    for (const [j, m] of need) want[j] |= m;
    for (let k = used.length - 1; k >= 0; k--) {
      const s = used[k], rel = s.remove.map(([j, m]) => [j, m & want[j]]).filter(([, m]) => m);
      if (!rel.length) continue;
      const groups = new Map();
      for (const [j, m] of rel) groups.set(m, [...(groups.get(m) || []), j]);
      const split = [...groups].map(([m, targets]) => ({ name: s.name, cells: s.cells, targets, digits: digitsOf(m),
        unit: s.unit === undefined ? '' : UNIT_KIND(s.unit), subset: s.digits || [] }));
      out.unshift(...split);
      for (const [j, m] of s.need) want[j] |= m;
    }
    return out;
  }
  function hint(G) {
    if (G.result) return null;
    const b = board(G);
    const bad = conflicts(G);
    // Of two of his digits that clash, erase the one that is not the solution: at least one is not.
    if (bad.length) {
      const i = bad.find(j => b[j] !== +G.solution[j]) ?? bad[0], c = clash(G, i, b);
      return { kind: 'clash', cell: i, digit: b[i], unit: c.unit, other: c.cell };
    }
    for (let i = 0; i < 81; i++) if (b[i] && b[i] !== +G.solution[i]) return { kind: 'wrong', cell: i, digit: b[i] };
    const cand = candidates(b);
    const n = nakedSingle(b, cand);
    if (n) return { kind: 'naked', cell: n.place[0], digit: n.place[1] };
    const h = hiddenSingle(b, cand);
    if (h) return { kind: 'hidden', cell: h.place[0], digit: h.place[1], unit: UNIT_KIND(h.unit) };
    // Reason further until a digit can be placed.
    let technique = '';
    const start = cand.slice(), used = [];
    for (let k = 0; k < 400; k++) {
      const s = nextStep(b, cand);
      if (!s) break;
      if (s.place) {
        const [i, d] = s.place, naked = s.name === 'naked';
        const steps = chain(used, naked ? [[i, ALL & ~(1 << d)]] : UNITS[s.unit].filter(j => j !== i && !b[j]).map(j => [j, 1 << d]));
        const cells = steps.length === 1 ? steps[0].cells.filter(j => j !== i) : [];
        return { kind: 'deep', cell: i, digit: d, technique: technique || s.name, via: naked ? 'naked' : 'hidden',
          unit: naked ? '' : UNIT_KIND(s.unit), removed: naked ? digitsOf(start[i] & ~(1 << d)) : [], cells, steps };
      }
      technique = technique || s.name;
      // The digits it really takes out: its masks name all the digits of a pair or a triple.
      used.push({ ...s, remove: s.remove.map(([j, m]) => [j, m & cand[j]]) });
      apply(b, cand, s);
    }
    // The reasoning of the solver is stuck (it never is on a grid it made): give the solution of a cell.
    const i = b.indexOf(0);
    return { kind: 'deep', cell: i, digit: +G.solution[i], technique: '', via: '', unit: '', removed: [], cells: [], steps: [] };
  }

  // ---------- Saves ----------
  const grid81 = s => typeof s === 'string' && /^[0-9]{81}$/.test(s);
  // A save read back must be a game this file could have made: a full solution that keeps every rule,
  // givens that are part of it with one solution, and his digits only in the empty cells.
  function valid(G) {
    if (!G || typeof G !== 'object' || !isLevel(G.level)) return false;
    if (!grid81(G.givens) || !grid81(G.solution) || !grid81(G.cells)) return false;
    if (G.solution.includes('0')) return false;
    const sol = toArray(G.solution);
    for (const u of UNITS) if (new Set(u.map(i => sol[i])).size !== 9) return false;
    for (let i = 0; i < 81; i++) {
      if (G.givens[i] !== '0' && (G.givens[i] !== G.solution[i] || G.cells[i] !== '0')) return false;
    }
    if (countSolutions(G.givens) !== 1) return false;
    return G.result === finish(G).result;
  }
  // Reads back a save: { G, undo, level, stats, wonNow }, or null for a save that cannot be played.
  // A save without a known level takes Facile; a missing result is filled in. The game had notes once:
  // the notes of an old save are left out, with the steps of the undo that only changed notes.
  function restore(data) {
    if (!data || typeof data !== 'object' || !data.G || typeof data.G !== 'object') return null;
    const g = { ...data.G };
    delete g.notes;
    if (!isLevel(g.level)) g.level = isLevel(data.level) ? data.level : 'facile';
    if (g.result === undefined) g.result = finish(g).result;
    if (!Number.isInteger(g.seed)) g.seed = 0;
    try { if (!valid(g)) return null; } catch (e) { return null; }
    // Each step of the undo is { cells } of the same grid. A broken step drops itself and the steps
    // before it, so an undo never jumps over a gap.
    const undo = [];
    for (const s of Array.isArray(data.undo) ? data.undo : []) {
      let u;
      try { u = typeof s === 'string' ? JSON.parse(s) : s; } catch (e) { u = null; }
      if (!u || !grid81(u.cells) || ![...u.cells].every((c, i) => c === '0' || g.givens[i] === '0')
        // A won grid takes no more moves, so it is never the grid before a move.
        || finish({ ...g, cells: u.cells }).result) { undo.length = 0; continue; }
      undo.push(u.cells);
    }
    // A step with the same digits as the grid after it was a move on notes only: it goes.
    const steps = undo.filter((c, k) => c !== (k + 1 < undo.length ? undo[k + 1] : g.cells)).map(cells => JSON.stringify({ cells }));
    const won = data.stats && Number.isInteger(data.stats.won) && data.stats.won >= 0 ? data.stats.won : 0;
    return { G: g, undo: steps, level: g.level, stats: { won }, wonNow: !!data.wonNow && g.result === 'won' };
  }
  const snapshot = G => JSON.stringify({ cells: G.cells });
  const back = (G, s) => finish({ ...G, cells: JSON.parse(s).cells });

  root.Sudoku = {
    LEVELS, UNITS, PEERS, ROW, COL, BOX, random,
    countSolutions, solve, grade, make, candidates: g => candidates(typeof g === 'string' ? toArray(g) : g),
    newGame, board, isGiven, clash, conflicts, complete, filled, refusal, write, erase, hint,
    valid, restore, snapshot, back, digitsOf,
    source: '(' + factory.toString() + ')(self);',
  };
  // In the worker: make the grid asked for. Difficile can take 0.2 s, so the page never waits for it.
  if (typeof WorkerGlobalScope !== 'undefined' && root instanceof WorkerGlobalScope)
    root.onmessage = e => root.postMessage({ id: e.data.id, G: newGame(e.data.level, e.data.seed) });
})(typeof window !== 'undefined' ? window : globalThis);
