// Rules of the petits chevaux, the computer players, the hint and the drawing places of the board.
// No DOM: the game page loads it with <script>, and the tests load it in Node.
//
// Four players, each with two horses, as in the French short game. He plays blue (0), then the turn
// goes clockwise to red (1), green (2) and yellow (3), the three computer players. A save from before
// has four horses each: it plays on with four, by the same rules.
//
// The board is a grid of 15 by 15 squares. A track of 56 squares runs clockwise around the centre.
// Each colour has its stable in a corner, a start square beside it, and a ladder of 6 squares from
// the foot of the ladder, on the track just before the start square, to the centre.
//
// A horse's place, counted from its own start square:
//   -1        in the stable
//   0 to 55   on the track: 0 is its start square, 55 the foot of its ladder
//   56 to 61  on its ladder: step 1 to step 6. Step 6 is the centre: the horse has arrived.
//
// The rules:
//   - a 6 takes a horse out of the stable to its start square;
//   - a horse on the track moves the number of the die, and may jump over other horses;
//   - it must land exactly on the foot of its ladder: a throw that would take it past cannot move it;
//   - on the ladder, it climbs one step with the exact number: 1 for step 1, 2 for step 2, up to 6;
//   - landing on a square held by another colour sends those horses back to their stable;
//   - two horses of one colour may share a square;
//   - after a 6, the same player throws again, also when no horse could move;
//   - a player who can move must move; the first to bring all its horses to the centre wins.
//
// A game G = { level, rng, turn, die, horses, last, result }:
//   level    the computer players' level: 'facile', 'moyen' or 'fort'
//   rng      four states of random numbers, one per player: the same state always throws the same die
//   turn     whose turn it is, 0 to 3
//   die      the die thrown this turn, 1 to 6, or null before the throw
//   horses   four arrays of places, one per player: two horses each (four in an older save)
//   last     what the last player did, or null: { player, die, pass } or { player, die, horse, from, to, captured: [[player, horse]] }
//   result   null while the game goes on, then the winner, 0 to 3
//
//   PetitsChevaux.newGame(level, seed)   -> a game, his turn, before the throw
//   PetitsChevaux.roll(G)                -> the game after the player whose turn it is throws the die
//   PetitsChevaux.moves(G)               -> the legal moves: [{ horse, from, to, captured }]
//   PetitsChevaux.play(G, horse)         -> the game after that horse moves (the same game if it cannot)
//   PetitsChevaux.pass(G)                -> the game after a throw that no horse can use
//   PetitsChevaux.blocked(G, player, h)  -> why that horse cannot move with the die: { why, need, left }
//   PetitsChevaux.choose(G, level)       -> the horse a computer player of that level moves
//   PetitsChevaux.advice(G)              -> the hint: { horse, why }
//   PetitsChevaux.computerTurn(G)        -> the steps of the computer players until his turn or the end
//   PetitsChevaux.valid(G)               -> true when a game read from a save is whole and possible
//   PetitsChevaux.PACE                   -> the pauses of the page, in ms, so the tests can time a game
(function (root) {
  'use strict';

  const COLORS = ['bleu', 'rouge', 'vert', 'jaune'];
  const LEVELS = { facile: {}, moyen: {}, fort: {} };
  const TRACK_LEN = 56, FOOT = 55, ARRIVED = 61, HORSES = 2;
  // The pace of the page, slow enough for his eyes to follow. A computer throw that no horse can use
  // is quicker: there is nothing to watch.
  const PACE = {
    ROLL: 1400,    // his die tumbles
    CPU_ROLL: 900, // a computer player's die: quicker, there are three of them
    SHOW: 450,     // a computer player's number stays alone before its horse moves
    HOP: 360,      // each square a horse passes
    ARRIVE: 700,   // a horse jumps at the centre
    HIT: 420,      // a horse taken nods
    FLY: 560,      // then flies home
    LAND: 650,     // after a computer player's move, before the next throw
    PASS: 900,     // a computer player who cannot move, after its die stops
    NOMOVE: 2200,  // his throw that no horse can use, before the turn passes
    FIRST: 1400,   // his own move stays on the message line before the computer players start
    QUICK: 500,    // his throw that no horse could use was read already: the computer players start
    HURT: 1700,    // a computer player who took one of his horses, before the next throw
  };
  // Each player's start square on the track, counted from red's start.
  const START = [42, 0, 14, 28];

  /* ---------- The board ----------
     Squares are [column, row], 0 to 14 from the top left. A quarter turn clockwise around the centre
     takes each player's squares to the next player's. Red's are drawn first: its stable is the top
     left corner, its start square the first square of the row under the stable, and its ladder the
     middle row of the left arm. */
  const turnOnce = ([c, r]) => [14 - r, c];
  const turnN = (sq, n) => { for (let i = 0; i < n; i++) sq = turnOnce(sq); return sq; };
  const QUARTER = [];
  for (let c = 0; c < 6; c++) QUARTER.push([c, 6]);
  QUARTER.push([6, 6]);
  for (let r = 5; r >= 0; r--) QUARTER.push([6, r]);
  QUARTER.push([7, 0]);
  const TRACK = [0, 1, 2, 3].flatMap(n => QUARTER.map(sq => turnN(sq, n)));
  // How many quarter turns take red's squares to each player's: blue 3, red 0, green 1, yellow 2.
  const TURNS = [3, 0, 1, 2];
  const LADDER = [0, 1, 2, 3].map(p => [1, 2, 3, 4, 5, 6].map(k => turnN([k, 7], TURNS[p])));
  // The stables do not turn: each has a place per horse and its name under them. Two places side by
  // side, or four in a square for an older save.
  const STABLE = [[0, 9], [0, 0], [9, 0], [9, 9]];
  const PADS = [[1.95, 1.55], [4.05, 1.55], [1.95, 3.55], [4.05, 3.55]];
  const PADS2 = [[1.95, 2.55], [4.05, 2.55]];
  const pads = n => n === 2 ? PADS2 : PADS;
  const abs = (p, pos) => (START[p] + pos) % TRACK_LEN;
  // The centre of the square where horse h of player p stands at pos, in squares from the top left,
  // with n horses a player.
  function point(p, pos, h = 0, n = HORSES) {
    if (pos < 0) return [STABLE[p][0] + pads(n)[h][0], STABLE[p][1] + pads(n)[h][1]];
    const sq = pos <= FOOT ? TRACK[abs(p, pos)] : LADDER[p][pos - FOOT - 1];
    return [sq[0] + .5, sq[1] + .5];
  }
  // The squares a horse passes through, one per hop, from pos to its new place.
  function path(p, from, to, h = 0) {
    if (from < 0) return [point(p, 0, h)];
    const out = [];
    for (let pos = from + 1; pos <= to; pos++) out.push(point(p, pos, h));
    return out;
  }

  /* ---------- Random numbers ----------
     Small and fast, with a state of 32 bits (mulberry32). */
  function next(s) {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return [s, ((t ^ (t >>> 14)) >>> 0) / 4294967296];
  }

  /* ---------- The rules ---------- */
  function newGame(level, seed, n = HORSES) {
    const rng = [];
    let s = seed >>> 0;
    for (let p = 0; p < 4; p++) { s = Math.imul(s ^ (s >>> 16) ^ (0x9E3779B9 + p), 0x85EBCA6B) >>> 0; rng.push(s); }
    return { level: typeof level === 'string' && Object.hasOwn(LEVELS, level) ? level : 'facile', rng, turn: 0, die: null,
      horses: [0, 1, 2, 3].map(() => Array(n).fill(-1)), last: null, result: null };
  }

  function roll(G) {
    if (G.result !== null || G.die !== null) return G;
    const rng = G.rng.slice();
    const [s, r] = next(rng[G.turn]);
    rng[G.turn] = s;
    return { ...G, rng, die: 1 + Math.floor(r * 6) };
  }

  // Where a horse at pos goes with die d, or null.
  function target(pos, d) {
    if (pos < 0) return d === 6 ? 0 : null;
    if (pos < FOOT) return pos + d <= FOOT ? pos + d : null;
    if (pos < ARRIVED) return d === pos - FOOT + 1 ? pos + 1 : null;
    return null;
  }
  // The horses of other colours on the track square where player p's horse would stand at pos.
  function victims(horses, p, pos) {
    if (pos < 0 || pos > FOOT) return [];
    const at = abs(p, pos), out = [];
    horses.forEach((hs, q) => { if (q !== p) hs.forEach((x, h) => { if (x >= 0 && x <= FOOT && abs(q, x) === at) out.push([q, h]); }); });
    return out;
  }
  function moves(G) {
    if (G.result !== null || G.die === null) return [];
    const p = G.turn, out = [];
    G.horses[p].forEach((from, horse) => {
      const to = target(from, G.die);
      if (to !== null) out.push({ horse, from, to, captured: victims(G.horses, p, to) });
    });
    return out;
  }
  function play(G, horse) {
    const m = moves(G).find(x => x.horse === horse);
    if (!m) return G;
    const p = G.turn;
    const horses = G.horses.map(hs => hs.slice());
    horses[p][horse] = m.to;
    for (const [q, h] of m.captured) horses[q][h] = -1;
    const won = horses[p].every(x => x === ARRIVED);
    return { ...G, horses, die: null, turn: won || G.die === 6 ? p : (p + 1) % 4, result: won ? p : null,
      last: { player: p, die: G.die, horse, from: m.from, to: m.to, captured: m.captured } };
  }
  function pass(G) {
    if (G.die === null || G.result !== null || moves(G).length) return G;
    const p = G.turn;
    return { ...G, die: null, turn: G.die === 6 ? p : (p + 1) % 4, last: { player: p, die: G.die, pass: true } };
  }
  // Why horse h of player p cannot move with the die:
  //   'arrived' it is already at the centre
  //   'stable'  it needs a 6 to leave the stable
  //   'far'     the die would take it past the foot of its ladder: left squares remain to it
  //   'ladder'  it needs exactly need to climb the next step
  //   null      it can move
  function blocked(G, p, h) {
    const pos = G.horses[p][h], d = G.die;
    if (pos === ARRIVED) return { why: 'arrived' };
    if (d !== null && target(pos, d) !== null) return null;
    if (pos < 0) return { why: 'stable', need: 6 };
    if (pos < FOOT) return { why: 'far', left: FOOT - pos };
    return { why: 'ladder', need: pos - FOOT + 1 };
  }

  /* ---------- The computer players ---------- */
  // How far a horse has come, in squares: 8 for leaving the stable, 1 a square, 6 a step of the ladder.
  const worth = pos => pos < 0 ? 0 : pos <= FOOT ? 8 + pos : 66 + 6 * (pos - FOOT);
  // The chance that another colour lands on player p's horse at pos with its next throw: each
  // horse behind it within 6 squares, and a stable whose start square it stands on (with a 6),
  // gives that player the throws that hit it.
  function risk(horses, p, pos) {
    if (pos < 0 || pos > FOOT) return 0;
    const at = abs(p, pos);
    let safe = 1;
    horses.forEach((hs, q) => {
      if (q === p) return;
      const hits = new Set();
      hs.forEach(x => {
        if (x < 0) { if (START[q] === at) hits.add(6); return; }
        if (x >= FOOT) return;
        const d = (at - abs(q, x) + TRACK_LEN) % TRACK_LEN;
        if (d >= 1 && d <= 6 && x + d <= FOOT) hits.add(d);
      });
      safe *= 1 - hits.size / 6;
    });
    return 1 - safe;
  }
  // How many turns a player needs, on average, to bring its two horses to the centre, alone on the
  // board and playing its best: TURNS_LEFT[a + 1][b + 1] for horses at a and b. Each move only takes a
  // horse forward, so one pass from the horses furthest along to the stable fills the table. A
  // throw that no horse can use costs a turn; a 6 gives another throw in the same turn.
  const TURNS_LEFT = (() => {
    const N = ARRIVED + 2, V = Array.from({ length: N }, () => new Float64Array(N));
    for (let sum = 2 * ARRIVED - 1; sum >= -2; sum--) for (let a = Math.max(-1, sum - ARRIVED); a <= Math.min(ARRIVED, sum + 1); a++) {
      const b = sum - a;
      let moved = 0, stuck = 0, stuck6 = 0;
      for (let d = 1; d <= 6; d++) {
        const ta = target(a, d), tb = target(b, d), next = [];
        if (ta !== null) next.push(ta === ARRIVED && b === ARRIVED ? 0 : V[ta + 1][b + 1]);
        if (tb !== null) next.push(a === ARRIVED && tb === ARRIVED ? 0 : V[a + 1][tb + 1]);
        if (!next.length) { stuck++; if (d === 6) stuck6 = 1; continue; }
        moved += Math.max(0, Math.min(...next) - (d === 6 ? 1 : 0));
      }
      V[a + 1][b + 1] = (6 + moved - stuck6) / (6 - stuck);
    }
    return V;
  })();
  const turnsLeft = hs => TURNS_LEFT[hs[0] + 1][hs[1] + 1];
  // Difficile, with two horses each, weighs a position for player p in turns: the turns it still
  // needs, less what each horse may lose to a capture, against the turns the others need, the most
  // for the player in the lead (the weights come from simulated games against Moyen).
  function value2(horses, p) {
    const mine = turnsLeft(horses[p]);
    let v = -mine;
    horses[p].forEach((x, h) => {
      const r = risk(horses, p, x);
      if (r) { const back = horses[p].slice(); back[h] = -1; v -= r * (turnsLeft(back) - mine); }
    });
    const others = [0, 1, 2, 3].filter(q => q !== p).map(q => turnsLeft(horses[q]));
    const lead = Math.min(...others);
    for (const t of others) v += (t === lead ? .6 : .3) * t;
    return v;
  }
  // Difficile, in an older save with four horses each, weighs a position for player p (the weights
  // come from simulated games against Moyen):
  //   - its own way made, more for a horse further along, so it races its front horse home;
  //   - less 1.5 times what each horse may lose to a capture;
  //   - less a share of the others' way, the most for the player in the lead (race math);
  //   - 3 for each number of the die its horses could use next time: horses that all wait on one
  //     step of the ladder waste throws;
  //   - a small plus for each horse of another colour its horses could land on.
  function value(horses, p) {
    const own = x => 100 * (worth(x) / 100) ** 1.4;
    let v = 0;
    for (const x of horses[p]) v += own(x) - 1.5 * risk(horses, p, x) * (own(x) + 10);
    const others = [0, 1, 2, 3].filter(q => q !== p).map(q => horses[q].reduce((a, x) => a + worth(x), 0));
    const lead = Math.max(...others);
    for (const t of others) v -= (t === lead ? .55 : .3) * t;
    const usable = new Set();
    for (const x of horses[p]) for (let d = 1; d <= 6; d++) if (target(x, d) !== null) usable.add(d);
    v += 3 * usable.size;
    for (const x of horses[p]) if (x >= 0 && x < FOOT) {
      for (let q = 0; q < 4; q++) if (q !== p) for (const y of horses[q]) if (y >= 0 && y <= FOOT) {
        const d = (abs(q, y) - abs(p, x) + TRACK_LEN) % TRACK_LEN;
        if (d >= 1 && d <= 6 && x + d <= FOOT) v += worth(y) * .04;
      }
    }
    return v;
  }
  const after = (G, m) => {
    const horses = G.horses.map(hs => hs.slice());
    horses[G.turn][m.horse] = m.to;
    for (const [q, h] of m.captured) horses[q][h] = -1;
    return horses;
  };
  const best = (list, score) => list.reduce((a, m) => { const s = score(m); return s > a.s + 1e-9 ? { m, s } : a; }, { m: null, s: -Infinity }).m;
  // Moyen, with two horses each: a capture first, the one that hurts most; else its front horse.
  // In an older save with four horses each: a capture first; then a horse that gets out of reach;
  // then out of the stable; then the move that lands safest, the horse furthest along first.
  function moyenScore(G, m) {
    if (G.horses[G.turn].length === 2) return (m.captured.length ? 1000 + m.captured.reduce((a, [q, h]) => a + worth(G.horses[q][h]), 0) : 0) + worth(m.from);
    const p = G.turn, hs = G.horses;
    let s = 0;
    if (m.captured.length) s += 1000 + m.captured.reduce((a, [q, h]) => a + worth(hs[q][h]), 0);
    if (m.to === ARRIVED) s += 600;
    const before = risk(hs, p, m.from), now = risk(after(G, m), p, m.to);
    if (before > 0 && now === 0) s += 400;
    if (m.from < 0) s += 300;
    s -= now * 200;
    return s + worth(m.from) * .5;
  }
  function choose(G, level) {
    const list = moves(G);
    if (!list.length) return null;
    if (level === 'facile') {
      // Its chance comes from its own numbers, so the same game always gets the same move.
      const r = next((G.rng[G.turn] ^ 0x5F3759DF) >>> 0)[1];
      return list[Math.floor(r * list.length)].horse;
    }
    if (level === 'moyen') return best(list, m => moyenScore(G, m)).horse;
    const weigh = G.horses[G.turn].length === 2 ? value2 : value;
    return best(list, m => weigh(after(G, m), G.turn)).horse;
  }
  // The hint: Difficile's move, and the main reason for it.
  function advice(G) {
    const list = moves(G);
    if (!list.length) return null;
    const horse = choose(G, 'fort'), m = list.find(x => x.horse === horse), p = G.turn;
    let why = 'advance';
    if (list.length === 1) why = 'only';
    else if (m.captured.length) why = 'capture';
    else if (m.to === ARRIVED) why = 'arrive';
    else if (m.to > FOOT) why = 'ladder';
    else if (m.to === FOOT) why = 'foot';
    else if (m.from < 0) why = 'out';
    else if (risk(G.horses, p, m.from) > 0 && risk(after(G, m), p, m.to) === 0) why = 'escape';
    else if (risk(after(G, m), p, m.to) === 0) why = 'safe';
    return { horse, why, to: m.to, captured: m.captured };
  }

  // The computer players' turns, until his turn or the end, in steps the page shows one by one:
  // { G, did: 'roll' } then { G, did: 'move' } or { G, did: 'pass' }. Each step's G is the game
  // after it. They depend only on G, so a reload during them plays the same turns again.
  function computerTurn(G) {
    const steps = [];
    let g = G;
    for (let guard = 0; guard < 400 && g.turn !== 0 && g.result === null; guard++) {
      if (g.die === null) { g = roll(g); steps.push({ G: g, did: 'roll' }); }
      const h = choose(g, g.level);
      g = h === null ? pass(g) : play(g, h);
      steps.push({ G: g, did: h === null ? 'pass' : 'move' });
    }
    return steps;
  }

  /* ---------- Saves ---------- */
  function valid(G) {
    const int = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
    if (!G || typeof G !== 'object' || typeof G.level !== 'string' || !Object.hasOwn(LEVELS, G.level)) return false;
    if (!int(G.turn, 0, 3) || !(G.die === null || int(G.die, 1, 6))) return false;
    if (!Array.isArray(G.rng) || G.rng.length !== 4 || !G.rng.every(v => int(v, 0, 2 ** 32 - 1))) return false;
    // Two horses each, or four in an older save.
    const n = Array.isArray(G.horses) && Array.isArray(G.horses[0]) ? G.horses[0].length : 0;
    if (n !== 2 && n !== 4) return false;
    if (G.horses.length !== 4 || !G.horses.every(hs => Array.isArray(hs) && hs.length === n && hs.every(x => int(x, -1, ARRIVED)))) return false;
    // Two colours never share a track square.
    const seen = new Map();
    for (let p = 0; p < 4; p++) for (const x of G.horses[p]) if (x >= 0 && x <= FOOT) {
      const at = abs(p, x);
      if (seen.has(at) && seen.get(at) !== p) return false;
      seen.set(at, p);
    }
    const done = G.horses.map(hs => hs.every(x => x === ARRIVED));
    if (G.result === null) return !done.some(Boolean);
    return int(G.result, 0, 3) && done[G.result] && done.filter(Boolean).length === 1 && G.die === null && G.turn === G.result;
  }

  root.PetitsChevaux = { COLORS, LEVELS, TRACK, LADDER, STABLE, START, FOOT, ARRIVED, TRACK_LEN, HORSES, PACE,
    pads, newGame, roll, moves, play, pass, blocked, choose, advice, computerTurn, valid, point, path, abs, risk, worth };
})(typeof self !== 'undefined' ? self : globalThis);
