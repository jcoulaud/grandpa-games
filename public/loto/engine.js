// Rules of the loto of the salle des fêtes, the neighbours at his table and the hint. No DOM: the game page
// loads it with <script>, and the tests load it in Node.
//
// A carton has 3 rows of 9 columns and 15 numbers, 5 on each row. Column 1 holds 1 to 9, column 2 holds
// 10 to 19 … column 9 holds 80 to 90. The numbers 1 to 90 come out of the bag one at a time, only when he
// clicks « Tirer le numéro ». A partie plays three phases on the same draw: the quine (one full row), the
// double quine (two full rows on one carton) and the carton plein (the 15 numbers). Each phase has a lot.
// The first player to call a phase that is really done wins its lot.
//
// The neighbours at his table play their own cartons perfectly, but they call late: a neighbour calls a
// phase `delay` clicks of « Tirer le numéro » after the draw that completed it. With delay 0, he still has
// until his next click to call first. So no level ever asks for a fast hand: only for attention.
//
// A game G = { v, level, seed, drawn, covered, phase, starts, winners, undo }:
//   seed     everything else comes from it: the order of the bag, his cartons, the neighbours, the lots
//   drawn    how many numbers are out of the bag
//   covered  one array per carton of his: the numbers he covered with a jeton, in the order he put them
//   phase    0 quine, 1 double quine, 2 carton plein, 3 the partie is over
//   starts   the value of drawn when each phase began
//   winners  one per phase played: { who: -1 for him, else the neighbour, carton, at: drawn }
//   undo     the jetons he may still take back: [carton, number], since the last call
//
//   Loto.newGame(level, seed)   -> a game before the first draw
//   Loto.setup(G)               -> { order, mine, hall, lots } built from the seed
//   Loto.next(G)                -> { G, event }: a neighbour calls ({ kind: 'call' }), else a number comes out ({ kind: 'draw', n })
//   Loto.cover(G, c, n)         -> { G } or { why }: a jeton on the number n of his carton c
//   Loto.takeBack(G)            -> the game without his last jeton
//   Loto.call(G)                -> { G, carton } when he calls a phase that is done, else { why, ... }
//   Loto.advice(G)              -> { kind: 'cover', carton, n } | { kind: 'call', carton } | { kind: 'draw' } | { kind: 'over' }
(function (root) {
  'use strict';

  const PHASES = ['quine', 'double quine', 'carton plein'];
  const CALLS = ['Quine !', 'Double quine !', 'Carton plein !'];
  // The rows a phase needs on one carton.
  const ROWS = [1, 2, 3];
  // cartons: his cartons. hall: the cartons of each of the three neighbours. delay: the clicks a neighbour
  // waits before calling, from lo to hi. light: the numbers out of the bag that he has not covered glow.
  const LEVELS = {
    facile: { cartons: 1, hall: 1, delay: [3, 6], light: true },
    moyen: { cartons: 2, hall: 2, delay: [1, 3], light: false },
    fort: { cartons: 3, hall: 3, delay: [0, 1], light: false },
  };
  // The neighbours who can sit at his table, with the word for « she » or « he ».
  const PEOPLE = [
    ['jeanne', 'Jeanne', 'elle'], ['louise', 'Louise', 'elle'], ['simone', 'Simone', 'elle'], ['odette', 'Odette', 'elle'],
    ['colette', 'Colette', 'elle'], ['yvonne', 'Yvonne', 'elle'], ['paul', 'Paul', 'il'], ['marcel', 'Marcel', 'il'],
    ['rene', 'René', 'il'], ['andre', 'André', 'il'], ['henri', 'Henri', 'il'], ['gaston', 'Gaston', 'il'],
  ];
  // The lots of each phase: an id the page draws, and the words.
  const LOTS = [
    [['cidre', 'une bouteille de cidre'], ['chocolats', 'une boîte de chocolats'], ['fleurs', 'un bouquet de fleurs']],
    [['panier', 'un panier garni'], ['fromages', 'un plateau de fromages'], ['champagne', 'une bouteille de champagne']],
    [['jambon', 'un jambon'], ['cocotte', 'une cocotte en fonte'], ['tele', 'une télévision']],
  ];
  // A few names the callers of the salle des fêtes give the numbers, kept kind and well known.
  const NICKNAMES = { 2: 'le petit canard', 22: 'les deux cocottes', 90: 'le grand-père' };

  // Small, fast random numbers from a 32-bit state (mulberry32).
  function rng(seed) {
    let s = seed >>> 0;
    return () => {
      s = (s + 0x6D2B79F5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const pick = (r, n) => Math.floor(r() * n);
  function shuffle(list, r) {
    const a = list.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = pick(r, i + 1); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }

  // The numbers of column c (0 to 8).
  const column = c => c === 0 ? [1, 2, 3, 4, 5, 6, 7, 8, 9] : c === 8 ? [80, 81, 82, 83, 84, 85, 86, 87, 88, 89, 90]
    : Array.from({ length: 10 }, (_, k) => c * 10 + k);
  const colOf = n => n === 90 ? 8 : Math.floor(n / 10);

  // A carton: rows[r][c] is a number or 0 for an empty box. Every column has one to three numbers, every
  // row five, and a column reads from the smallest number on top.
  function makeCarton(r) {
    const count = Array(9).fill(1);
    for (let extra = 0; extra < 6;) { const c = pick(r, 9); if (count[c] < 3) { count[c]++; extra++; } }
    // The columns with the most numbers first, each on the rows that still need the most.
    const need = [5, 5, 5], rows = [[], [], []].map(() => Array(9).fill(0));
    const order = shuffle([0, 1, 2, 3, 4, 5, 6, 7, 8], r).sort((a, b) => count[b] - count[a]);
    const taken = Array.from({ length: 9 }, () => []);
    for (const c of order) {
      const by = shuffle([0, 1, 2], r).sort((a, b) => need[b] - need[a]).slice(0, count[c]).sort();
      for (const k of by) need[k]--;
      taken[c] = by;
    }
    for (let c = 0; c < 9; c++) {
      const nums = shuffle(column(c), r).slice(0, count[c]).sort((a, b) => a - b);
      taken[c].forEach((k, i) => { rows[k][c] = nums[i]; });
    }
    return rows;
  }
  const numbersOf = carton => carton.flat().filter(Boolean);

  // Everything that comes from the seed, kept for the last seeds asked.
  const cache = new Map();
  function setup(G) {
    const key = G.level + ':' + G.seed;
    if (cache.has(key)) return cache.get(key);
    const L = LEVELS[G.level], r = rng(G.seed);
    const order = shuffle(Array.from({ length: 90 }, (_, i) => i + 1), r);
    const mine = Array.from({ length: L.cartons }, () => makeCarton(r));
    const people = shuffle(PEOPLE, r).slice(0, 3);
    const hall = people.map(([id, name, pronoun]) => ({
      id, name, pronoun,
      cartons: Array.from({ length: L.hall }, () => makeCarton(r)),
      delay: [0, 1, 2].map(() => L.delay[0] + pick(r, L.delay[1] - L.delay[0] + 1)),
    }));
    const lots = LOTS.map(list => list[pick(r, list.length)]);
    const out = { order, mine, hall, lots, at: new Map(order.map((n, i) => [n, i + 1])) };
    if (cache.size > 40) cache.clear();
    cache.set(key, out);
    return out;
  }

  function newGame(level, seed) {
    if (!LEVELS[level]) level = 'facile';
    return { v: 1, level, seed: seed >>> 0, drawn: 0, covered: Array.from({ length: LEVELS[level].cartons }, () => []),
      phase: 0, starts: [0], winners: [], undo: [] };
  }

  const out = G => new Set(setup(G).order.slice(0, G.drawn));
  // The full rows of a carton, with the numbers in `has`.
  const fullRows = (carton, has) => carton.filter(row => row.every(n => !n || has.has(n))).length;
  // The numbers still missing on a carton for a phase: the fewest over its rows.
  function missing(carton, has, phase) {
    const left = carton.map(row => row.filter(n => n && !has.has(n)).length).sort((a, b) => a - b);
    return left.slice(0, ROWS[phase]).reduce((a, b) => a + b, 0);
  }
  // The draw (1 to 90) at which a carton completes a phase, when every number out is covered.
  function doneAt(G, carton, phase) {
    const at = setup(G).at;
    const rowAt = carton.map(row => Math.max(...row.filter(Boolean).map(n => at.get(n)))).sort((a, b) => a - b);
    return rowAt[ROWS[phase] - 1];
  }
  // The neighbour who calls when he next clicks « Tirer le numéro », if any: the earliest call due.
  function dueCall(G) {
    if (G.phase > 2) return null;
    const { hall } = setup(G), start = G.starts[G.phase];
    let best = null;
    hall.forEach((p, who) => p.cartons.forEach((carton, c) => {
      const done = doneAt(G, carton, G.phase);
      if (done > G.drawn) return;
      // Once the bag is empty, nobody waits any more.
      const due = Math.min(90, Math.max(done, start) + p.delay[G.phase]);
      if (due <= G.drawn && (!best || due < best.due || (due === best.due && done < best.done))) best = { who, carton: c, due, done };
    }));
    return best;
  }

  function win(G, who, carton) {
    const phase = G.phase + 1;
    return { ...G, phase, starts: [...G.starts, G.drawn], winners: [...G.winners, { who, carton, at: G.drawn }], undo: [] };
  }

  // His click on « Tirer le numéro »: a neighbour whose call is due calls first, else a number comes out.
  function next(G) {
    if (G.phase > 2) return { G, event: { kind: 'over' } };
    const due = dueCall(G);
    if (due) {
      const phase = G.phase;
      return { G: win(G, due.who, due.carton), event: { kind: 'call', who: due.who, carton: due.carton, phase } };
    }
    if (G.drawn >= 90) return { G, event: { kind: 'empty' } };
    const g = { ...G, drawn: G.drawn + 1 };
    return { G: g, event: { kind: 'draw', n: setup(G).order[G.drawn] } };
  }

  function cover(G, c, n) {
    const carton = setup(G).mine[c];
    if (!carton || !numbersOf(carton).includes(n)) return { why: 'absent' };
    if (G.covered[c].includes(n)) return { why: 'covered' };
    if (!out(G).has(n)) return { why: 'notout' };
    const covered = G.covered.map((list, k) => k === c ? [...list, n] : list);
    return { G: { ...G, covered, undo: [...G.undo, [c, n]] } };
  }
  function takeBack(G) {
    if (!G.undo.length) return G;
    const [c, n] = G.undo[G.undo.length - 1];
    return { ...G, covered: G.covered.map((list, k) => k === c ? list.filter(x => x !== n) : list), undo: G.undo.slice(0, -1) };
  }

  // His call. It is good when one of his cartons has the rows of the phase full of jetons. Otherwise the
  // reason: the rows covered on his best carton, and the numbers out that he has not covered yet.
  function call(G) {
    if (G.phase > 2) return { why: 'over' };
    const { mine } = setup(G), has = out(G);
    for (let c = 0; c < mine.length; c++)
      if (fullRows(mine[c], new Set(G.covered[c])) >= ROWS[G.phase]) return { G: win(G, -1, c), carton: c, phase: G.phase };
    // The carton closest to the phase with his jetons, and what it lacks.
    let best = null;
    mine.forEach((carton, c) => {
      const set = new Set(G.covered[c]);
      const left = missing(carton, set, G.phase);
      // The numbers out but not covered that would complete it: on the rows full of numbers out, the ones
      // that lack the fewest jetons.
      const outRows = carton.filter(row => row.every(n => !n || has.has(n)))
        .map(row => row.filter(n => n && !set.has(n))).sort((a, b) => a.length - b.length);
      const open = outRows.length >= ROWS[G.phase] ? outRows.slice(0, ROWS[G.phase]).flat().sort((a, b) => a - b) : [];
      if (!best || left < best.left) best = { carton: c, left, rows: fullRows(carton, set), open };
    });
    return { why: best.open.length ? 'uncovered' : 'notyet', ...best, phase: G.phase };
  }

  // The hint: a number out that he has not covered, then a call that is ready, else the next draw.
  function advice(G) {
    if (G.phase > 2) return { kind: 'over' };
    const { mine, order } = setup(G);
    for (let c = 0; c < mine.length; c++)
      if (fullRows(mine[c], new Set(G.covered[c])) >= ROWS[G.phase]) return { kind: 'call', carton: c };
    // The most recent number first, so his eye goes to what was just called.
    for (let i = G.drawn - 1; i >= 0; i--) {
      const n = order[i];
      for (let c = 0; c < mine.length; c++) if (numbersOf(mine[c]).includes(n) && !G.covered[c].includes(n)) return { kind: 'cover', carton: c, n };
    }
    return { kind: 'draw' };
  }

  // How close each neighbour is to the phase in play: the fewest numbers missing over their cartons.
  function closeness(G) {
    if (G.phase > 2) return setup(G).hall.map(() => null);
    const has = out(G);
    return setup(G).hall.map(p => Math.min(...p.cartons.map(carton => missing(carton, has, G.phase))));
  }

  // A save read back is checked whole.
  function valid(G) {
    const int = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
    if (!G || G.v !== 1 || !LEVELS[G.level] || !int(G.seed, 0, 2 ** 32 - 1) || !int(G.drawn, 0, 90) || !int(G.phase, 0, 3)) return false;
    if (!Array.isArray(G.covered) || G.covered.length !== LEVELS[G.level].cartons) return false;
    if (!Array.isArray(G.starts) || G.starts.length !== G.phase + 1 || !Array.isArray(G.winners) || G.winners.length !== G.phase) return false;
    if (!Array.isArray(G.undo)) return false;
    const { mine, hall } = setup(G), has = out(G);
    for (let c = 0; c < mine.length; c++) {
      const list = G.covered[c], nums = numbersOf(mine[c]);
      if (!Array.isArray(list) || new Set(list).size !== list.length || !list.every(n => nums.includes(n) && has.has(n))) return false;
    }
    for (let k = 0; k <= G.phase; k++) if (!int(G.starts[k], 0, G.drawn) || (k && G.starts[k] < G.starts[k - 1])) return false;
    for (const w of G.winners) {
      if (!w || !(w.who === -1 || int(w.who, 0, 2)) || !int(w.at, 0, G.drawn)) return false;
      if (!int(w.carton, 0, (w.who === -1 ? mine.length : hall[w.who].cartons.length) - 1)) return false;
    }
    return G.undo.every(u => Array.isArray(u) && int(u[0], 0, mine.length - 1) && G.covered[u[0]].includes(u[1]));
  }

  // A partie played by a player who covers each number at once and calls as soon as he can, or `late`
  // clicks after his carton is done (a player who scans his cartons slowly). Returns the phases he won.
  function simulate(level, seed, late = 0) {
    let G = newGame(level, seed);
    const { mine } = setup(G);
    let ready = null, won = 0;
    for (let guard = 0; guard < 200 && G.phase < 3; guard++) {
      const can = mine.some((carton, c) => fullRows(carton, new Set(G.covered[c])) >= ROWS[G.phase]);
      if (can && ready === null) ready = 0;
      if (can && ready >= late) { const r = call(G); G = r.G; won++; ready = null; continue; }
      const step = next(G);
      G = step.G;
      if (step.event.kind === 'call') { ready = null; continue; }
      if (ready !== null) ready++;
      if (step.event.kind === 'draw') mine.forEach((carton, c) => { if (numbersOf(carton).includes(step.event.n)) G = cover(G, c, step.event.n).G; });
    }
    return { won, drawn: G.drawn, winners: G.winners };
  }

  root.Loto = { PHASES, CALLS, ROWS, LEVELS, LOTS, NICKNAMES, rng, makeCarton, numbersOf, colOf, setup, newGame, next, cover, takeBack, call,
    advice, closeness, missing, fullRows, doneAt, dueCall, valid, simulate };
})(typeof self !== 'undefined' ? self : globalThis);
