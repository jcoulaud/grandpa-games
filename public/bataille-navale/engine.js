// Rules of the bataille navale, the computer and the hint. No DOM: the game page loads it with
// <script>, and the tests load it in Node.
//
// Each side has a sea of 10 by 10 squares, numbered 0 to 99 in reading order: square i is on row
// floor(i / 10), column i % 10. Columns are A to J, rows 1 to 10, so square 0 is A1 and square 99 J10.
// Sea 0 is his, sea 1 the computer's.
//
// The fleet: a porte-avions of 5 squares, a croiseur of 4, a contre-torpilleur and a sous-marin of 3,
// and a torpilleur of 2. A ship lies along a row or a column. Two ships never touch, not even by a
// corner, so the squares around a sunk ship are water: the game marks them.
//
// A game G = { level, seed, fleets, shots, turn, last, result }:
//   fleets   [his, the computer's]: each the five ships in the order of FLEET, a ship the sorted list
//            of its squares
//   shots    [on his sea, on the computer's]: one letter per square, "." not fired, "o" water, "x" hit
//   turn     "me" (his shot) or "them" (the computer's)
//   last     the last shot on each sea, or -1
//   result   null while the game goes on, "won" or "lost"
//
//   Bataille.newGame(level, seed)   -> a new game, both fleets placed, his turn
//   Bataille.replace(G, seed)       -> the same game with his fleet placed again (before the first shot)
//   Bataille.fire(G, k, i)          -> { G, kind, ship }: the game after a shot on square i of sea k;
//                                      kind "eau", "touche" or "coule", ship the index of the ship hit
//   Bataille.view(G, k)             -> what the shooter knows of sea k, one letter per square:
//                                      "." unknown, "o" water, "x" hit, "s" sunk, "c" water beside a sunk ship
//   Bataille.aim(G)                 -> the square of his sea the computer fires on, at the level of G
//   Bataille.hint(G)                -> { cell, rule, hits }: the best square of the computer's sea, see hint()
//   Bataille.check(G)               -> true if G is a whole, consistent game (a save read back)
(function (root) {
  'use strict';
  const N = 10, SIZE = N * N;
  const FLEET = [
    { name: 'porte-avions', size: 5 },
    { name: 'croiseur', size: 4 },
    { name: 'contre-torpilleur', size: 3 },
    { name: 'sous-marin', size: 3 },
    { name: 'torpilleur', size: 2 },
  ];
  const LEVELS = ['facile', 'moyen', 'fort'];

  // A small seeded random generator (mulberry32): the same seed gives the same game.
  function random(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = Math.imul(a ^ (a >>> 15), a | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const pick = (list, rand) => list[Math.floor(rand() * list.length)];

  // The 8 squares around each square, and the 4 beside it.
  const AROUND = [], BESIDE = [];
  for (let i = 0; i < SIZE; i++) {
    const r = Math.floor(i / N), c = i % N, all = [], side = [];
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      const rr = r + dr, cc = c + dc;
      if (!(dr || dc) || rr < 0 || rr >= N || cc < 0 || cc >= N) continue;
      all.push(rr * N + cc);
      if (!dr || !dc) side.push(rr * N + cc);
    }
    AROUND.push(all); BESIDE.push(side);
  }
  const name = i => 'ABCDEFGHIJ'[i % N] + (Math.floor(i / N) + 1);

  // Every way to lay a ship of a given size: a row or a column of squares.
  const LINES = {};
  function lines(size) {
    if (LINES[size]) return LINES[size];
    const out = [];
    for (let r = 0; r < N; r++) for (let c = 0; c <= N - size; c++) out.push([...Array(size)].map((_, k) => r * N + c + k));
    for (let c = 0; c < N; c++) for (let r = 0; r <= N - size; r++) out.push([...Array(size)].map((_, k) => (r + k) * N + c));
    return (LINES[size] = out);
  }

  // A fleet at random: the largest ship first, each on free squares that touch no other ship.
  function place(rand) {
    for (;;) {
      const taken = new Uint8Array(SIZE), ships = [];
      for (const { size } of FLEET) {
        const free = lines(size).filter(l => l.every(i => !taken[i] && AROUND[i].every(j => !taken[j])));
        if (!free.length) break;
        const ship = pick(free, rand);
        ship.forEach(i => { taken[i] = 1; });
        ships.push(ship.slice().sort((a, b) => a - b));
      }
      if (ships.length === FLEET.length) return ships;
    }
  }

  function newGame(level, seed) {
    const rand = random(seed);
    return { level, seed: seed >>> 0, fleets: [place(rand), place(rand)], shots: ['.'.repeat(SIZE), '.'.repeat(SIZE)],
      turn: 'me', last: [-1, -1], result: null };
  }
  function replace(G, seed) {
    return { ...G, fleets: [place(random(seed)), G.fleets[1]] };
  }

  const shipAt = (G, k, i) => G.fleets[k].findIndex(s => s.includes(i));
  const isSunk = (G, k, s) => G.fleets[k][s].every(i => G.shots[k][i] === 'x');
  const sunk = (G, k) => G.fleets[k].map((_, s) => isSunk(G, k, s));
  const allSunk = (G, k) => sunk(G, k).every(Boolean);

  function fire(G, k, i) {
    const s = shipAt(G, k, i);
    const shots = G.shots.slice();
    shots[k] = shots[k].slice(0, i) + (s >= 0 ? 'x' : 'o') + shots[k].slice(i + 1);
    const last = G.last.slice(); last[k] = i;
    const next = { ...G, shots, last, turn: k === 1 ? 'them' : 'me' };
    const kind = s < 0 ? 'eau' : isSunk(next, k, s) ? 'coule' : 'touche';
    if (allSunk(next, k)) next.result = k === 1 ? 'won' : 'lost';
    return { G: next, kind, ship: s };
  }

  // What the shooter of sea k knows. A sunk ship shows whole, and the squares around it are water.
  function view(G, k) {
    const v = G.shots[k].split('');
    sunk(G, k).forEach((done, s) => {
      if (!done) return;
      for (const i of G.fleets[k][s]) {
        v[i] = 's';
        for (const j of AROUND[i]) if (v[j] === '.') v[j] = 'c';
      }
    });
    return v;
  }

  /* ---------- The aim ----------
     The hits of ships not sunk yet, in groups: hits that touch, even by a corner, belong to one ship,
     since two ships never touch. Each group is a ship hit and not sunk. */
  function groups(v) {
    const seen = new Uint8Array(SIZE), out = [];
    for (let i = 0; i < SIZE; i++) {
      if (v[i] !== 'x' || seen[i]) continue;
      const g = [i]; seen[i] = 1;
      for (let n = 0; n < g.length; n++) for (const j of AROUND[g[n]]) if (v[j] === 'x' && !seen[j]) { seen[j] = 1; g.push(j); }
      out.push(g.sort((a, b) => a - b));
    }
    return out;
  }
  /* density() counts, for each unknown square, the ways the ships still afloat can lie over it,
     knowing what the shooter knows. A ship cannot lie on water, on a sunk ship, nor beside a hit it
     does not cover (ships never touch). With one ship afloat, it must cover every hit. While a ship
     is hit and not sunk, only the ways that cover a hit count: they lead to the rest of that ship.
     The real ship hit is always one of these ways, so some square always scores. */
  function density(v, afloat) {
    const score = new Float64Array(SIZE);
    const hitGroups = groups(v), target = hitGroups.length > 0;
    const groupOf = new Int16Array(SIZE).fill(-1);
    hitGroups.forEach((g, n) => g.forEach(i => { groupOf[i] = n; }));
    for (const size of afloat) for (const l of lines(size)) {
      let hits = 0, ok = true;
      const covered = new Set();
      for (const i of l) {
        if (v[i] === 'x') { hits++; covered.add(groupOf[i]); }
        else if (v[i] !== '.') { ok = false; break; }
      }
      if (!ok || (target && !hits)) continue;
      if (afloat.length === 1 && covered.size < hitGroups.length) continue;
      if (l.some(i => AROUND[i].some(j => v[j] === 'x' && !l.includes(j)))) continue;
      const w = target ? hits * hits : 1;
      for (const i of l) if (v[i] === '.') score[i] += w;
    }
    return score;
  }
  const afloat = (G, k) => FLEET.filter((_, s) => !isSunk(G, k, s)).map(f => f.size);
  const unknown = v => v.reduce((out, x, i) => (x === '.' && out.push(i), out), []);
  function best(score, cells, rand) {
    if (!cells.length) return -1;
    let top = -1, out = [];
    for (const i of cells) {
      if (score[i] > top) { top = score[i]; out = [i]; } else if (score[i] === top) out.push(i);
    }
    return rand ? pick(out, rand) : out[0];
  }

  // The computer fires on his sea. It knows only its own shots and the ships it sank.
  //   Facile   fires at random on squares not fired yet; after a hit, half the time beside it.
  //   Moyen    finishes a hit ship along its line, else fires on one colour of a chessboard,
  //            and never beside a sunk ship.
  //   Difficile  fires where the ships still afloat can lie in the most ways (density above).
  // The same position always gets the same shot, so a game reloaded goes on the same way.
  function aim(G) {
    const fired = [...G.shots[0]].filter(x => x !== '.').length;
    const rand = random((G.seed ^ Math.imul(fired + 1, 0x9E3779B1)) >>> 0);
    const v = view(G, 0), open = unknown(v);
    if (!open.length) return -1;
    if (G.level === 'facile') {
      const near = [...new Set(groups(v).flat().flatMap(i => BESIDE[i]))].filter(i => v[i] === '.');
      if (near.length && rand() < .5) return pick(near, rand);
      return pick([...G.shots[0]].reduce((out, x, i) => (x === '.' && out.push(i), out), []), rand);
    }
    if (G.level === 'moyen') {
      // Each ship hit in turn: along its line once two hits show it, else beside its hit.
      for (const g of groups(v)) {
        const near = (g.length > 1 ? ends(g) : BESIDE[g[0]]).filter(i => v[i] === '.');
        if (near.length) return pick(near, rand);
      }
      const even = open.filter(i => (Math.floor(i / N) + i) % 2 === 0);
      return pick(even.length ? even : open, rand);
    }
    return best(density(v, afloat(G, 0)), open, rand);
  }

  // The two squares that go on the line of a group of hits, one at each end.
  function ends(g) {
    const step = g[1] - g[0], a = g[0] - step, b = g[g.length - 1] + step;
    const inLine = i => i >= 0 && i < SIZE && (step === N || Math.floor(i / N) === Math.floor(g[0] / N));
    return [a, b].filter(inLine);
  }

  // The hint on the computer's sea: the square where its ships afloat can lie in the most ways.
  // hits: the group of hits the square goes on from, if any. rule: "line" when that group has two
  // hits or more (the ship goes on along their line), "beside" when it has one, "search" otherwise.
  function hint(G) {
    const v = view(G, 1), open = unknown(v);
    if (!open.length) return null;
    const cell = best(density(v, afloat(G, 1)), open);
    const g = groups(v).find(g => g.some(i => AROUND[i].includes(cell)));
    if (!g) return { cell, rule: groups(v).length ? 'other' : 'search', hits: groups(v).flat() };
    return { cell, rule: g.length > 1 ? 'line' : 'beside', hits: g, across: g.length > 1 && g[1] - g[0] === 1 };
  }

  // A save read back: every ship straight and of its size, no two touching, the shots one letter
  // per square that agree with the ships, the turn that follows from the number of shots, and the
  // result that follows from the ships sunk.
  function check(G) {
    try {
      if (!G || !LEVELS.includes(G.level) || !Number.isInteger(G.seed) || G.seed < 0 || G.seed > 0xFFFFFFFF || !Array.isArray(G.fleets) || G.fleets.length !== 2) return false;
      if (!Array.isArray(G.shots) || G.shots.length !== 2 || !Array.isArray(G.last) || G.last.length !== 2) return false;
      for (const fleet of G.fleets) {
        if (!Array.isArray(fleet) || fleet.length !== FLEET.length) return false;
        const owner = new Map();
        for (let s = 0; s < fleet.length; s++) {
          const ship = fleet[s];
          if (!Array.isArray(ship) || ship.length !== FLEET[s].size || !lines(FLEET[s].size).some(l => l.every((i, k) => ship[k] === i))) return false;
          for (const i of ship) { if (owner.has(i)) return false; owner.set(i, s); }
        }
        for (const [i, s] of owner) if (AROUND[i].some(j => owner.has(j) && owner.get(j) !== s)) return false;
      }
      for (let k = 0; k < 2; k++) {
        const shots = G.shots[k], ships = new Set(G.fleets[k].flat());
        if (typeof shots !== 'string' || !/^[.ox]{100}$/.test(shots)) return false;
        for (let i = 0; i < SIZE; i++) if (shots[i] !== '.' && (shots[i] === 'x') !== ships.has(i)) return false;
        const l = G.last[k];
        if (!Number.isInteger(l) || l < -1 || l >= SIZE || (l >= 0 && shots[l] === '.')) return false;
      }
      const mine = [...G.shots[1]].filter(x => x !== '.').length, theirs = [...G.shots[0]].filter(x => x !== '.').length;
      if (mine !== theirs && mine !== theirs + 1) return false;
      if (G.turn !== (mine === theirs ? 'me' : 'them')) return false;
      const result = allSunk(G, 1) ? 'won' : allSunk(G, 0) ? 'lost' : null;
      return G.result === result && !(allSunk(G, 0) && allSunk(G, 1));
    } catch (e) { return false; }
  }

  root.Bataille = { N, SIZE, FLEET, LEVELS, AROUND, random, name, newGame, replace, fire, view, sunk, shipAt, aim, hint, check, density, groups, place };
})(typeof window !== 'undefined' ? window : globalThis);
