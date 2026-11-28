// Rules of the dominos, the computer players and the hint. No DOM: the game page loads it with <script>,
// and the tests load it in Node.
//
// The French « domino à la pioche » of the cafés, for three: him (0) and two computer players. Play turns
// to the right, counter-clockwise: from him (0) to the player on his right (1), to the one on his left (2).
// The 28 dominoes of the double-six set: 7 each, 7 face down in the pioche. The highest double starts the
// manche. A domino goes at one end of the line when one of its halves shows the number of that end. A
// player who cannot play draws from the pioche, one domino at a time, until one fits; with the pioche
// empty, he passes. The first to lay all his dominoes says « Domino ! » and marks the points left in the
// two other hands. When nobody can play any more (pioche empty), the line is blocked: the smallest total
// in hand wins and marks the points of the two others; a tie for the smallest marks nothing. The first to
// 100 points wins the game.
//
// A tile is a number 0..27: Dominos.TILES[t] = [a, b] with a <= b.
// A game G = { v, level, rs, hands, stock, line, first, turn, opening, voids, scores, manche, last, end, result }:
//   rs       the state of the random numbers for the next deal
//   hands    three arrays of tiles; stock: the pioche, the next tile to draw last
//   line     the tiles laid, from one end to the other: { t, l, r }, l and r the numbers on each side;
//            first: the index in line of the domino that opened the manche
//   turn     whose turn it is, 0 him, 1 his right, 2 his left
//   opening  the tile that must open the manche while the line is empty, else null
//   voids    for each player, the numbers he showed he has none of (he drew or passed on them)
//   scores   the points of the three players; manche: the number of the manche, from 1
//   last     what was done last: { p, kind: 'play' | 'draw' | 'pass', t, side }, or null
//   end      null while the manche goes on, then { winner (or null), blocked, pips: [3], points }
//   result   null, then 'won' or 'lost' for him when a player reaches the target
//
//   Dominos.newGame(level, seed)        -> a game, the first manche dealt
//   Dominos.legal(G)                    -> the moves of the player whose turn it is: [{ t, side }]
//   Dominos.fits(G, t)                  -> the sides where t goes: [], ['L'], ['R'], ['L', 'R'] or ['C'] (the opening)
//   Dominos.play(G, t, side)            -> the game after the move, or G when it is not allowed
//   Dominos.draw(G), Dominos.pass(G)    -> the game after a draw or a pass, or G when not allowed
//   Dominos.nextManche(G)               -> the next manche, dealt
//   Dominos.autoTurn(G, level)          -> the steps of a whole turn played at a level: [{ did, t, side, G }]
//   Dominos.computerTurn(G)             -> autoTurn at the level of the game
//   Dominos.advice(G)                   -> { kind: 'play', t, side } | { kind: 'draw' } | { kind: 'pass' }
//   Dominos.valid(G)                    -> a saved game holds together
(function (root) {
  'use strict';

  const TILES = [];
  for (let a = 0; a <= 6; a++) for (let b = a; b <= 6; b++) TILES.push([a, b]);
  const PLAYERS = 3, HAND = 7, TARGET = 100;
  const LEVELS = { facile: {}, moyen: {}, fort: {} };
  const pips = t => TILES[t][0] + TILES[t][1];
  const isDouble = t => TILES[t][0] === TILES[t][1];
  const has = (t, n) => TILES[t][0] === n || TILES[t][1] === n;
  const other = (t, n) => TILES[t][0] === n ? TILES[t][1] : TILES[t][0];
  const handPips = h => h.reduce((a, t) => a + pips(t), 0);

  // Small, fast random numbers with a state of 32 bits (mulberry32).
  function next(s) {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return [s, ((t ^ (t >>> 14)) >>> 0) / 4294967296];
  }
  function stream(seed) {
    let s = seed >>> 0;
    return () => { const [n, x] = next(s); s = n; return x; };
  }
  function shuffle(list, rand) {
    const a = list.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }

  const ends = G => G.line.length ? [G.line[0].l, G.line[G.line.length - 1].r] : null;

  // The tile that opens: the highest double dealt, else the heaviest tile.
  function opener(hands) {
    let best = null, who = 0;
    hands.forEach((h, p) => h.forEach(t => {
      const k = (isDouble(t) ? 100 : 0) + pips(t) * 2 + (isDouble(t) ? 0 : TILES[t][1] / 10);
      if (best === null || k > best.k) { best = { k, t }; who = p; }
    }));
    return { t: best.t, p: who };
  }

  function deal(G) {
    const rand = stream(G.rs);
    const all = shuffle(TILES.map((x, i) => i), rand);
    const byHigh = (a, b) => TILES[b][1] - TILES[a][1] || TILES[b][0] - TILES[a][0];
    const hands = [0, 1, 2].map(p => all.slice(p * HAND, p * HAND + HAND).sort(byHigh));
    const stock = all.slice(PLAYERS * HAND);
    const { t, p } = opener(hands);
    const [rs] = next(Math.imul(G.rs ^ 0x9E3779B9, 0x85EBCA6B) >>> 0);
    return { ...G, rs, hands, stock, line: [], first: 0, turn: p, opening: t, voids: [[], [], []], manche: G.manche + 1, last: null, end: null };
  }

  function newGame(level, seed) {
    return deal({ v: 1, level, rs: seed >>> 0, hands: [[], [], []], stock: [], line: [], first: 0, turn: 0, opening: null,
      voids: [[], [], []], scores: [0, 0, 0], manche: 0, last: null, end: null, result: null });
  }

  function fits(G, t) {
    if (!G.line.length) return t === G.opening ? ['C'] : [];
    const [l, r] = ends(G), out = [];
    if (has(t, l)) out.push('L');
    if (has(t, r)) out.push('R');
    return out;
  }
  function legal(G, p = G.turn) {
    if (G.end || G.result) return [];
    const out = [];
    for (const t of G.hands[p]) for (const side of fits(G, t)) out.push({ t, side });
    return out;
  }
  const canPlay = (G, p) => G.hands[p].some(t => fits(G, t).length);

  // The end of a manche: who won, the pips left in each hand, and the points marked.
  function finish(G, winner, blocked) {
    const pipsLeft = G.hands.map(handPips);
    let points = 0;
    if (winner !== null) points = pipsLeft.reduce((a, v, p) => a + (p === winner ? 0 : v), 0);
    const scores = G.scores.map((s, p) => p === winner ? s + points : s);
    const done = scores.some(s => s >= TARGET);
    return { ...G, scores, end: { winner, blocked, pips: pipsLeft, points }, result: done ? (scores[0] >= TARGET ? 'won' : 'lost') : null };
  }
  // After a move: the next player, or the end of the manche when nobody can play any more.
  function after(G) {
    if (!G.hands[G.last.p].length) return finish(G, G.last.p, false);
    if (!G.stock.length && [0, 1, 2].every(p => !canPlay(G, p))) {
      const left = G.hands.map(handPips), low = Math.min(...left);
      const winners = left.map((v, p) => v === low ? p : -1).filter(p => p >= 0);
      return finish(G, winners.length === 1 ? winners[0] : null, true);
    }
    return G;
  }

  function play(G, t, side) {
    if (G.end || G.result || !G.hands[G.turn].includes(t) || !fits(G, t).includes(side)) return G;
    const p = G.turn, [a, b] = TILES[t];
    let line = G.line, first = G.first;
    if (side === 'C') line = [{ t, l: a, r: b }];
    else if (side === 'L') { const l = line[0].l; line = [{ t, l: other(t, l), r: l }, ...line]; first++; }
    else { const r = line[line.length - 1].r; line = [...line, { t, l: r, r: other(t, r) }]; }
    const hands = G.hands.map((h, q) => q === p ? h.filter(x => x !== t) : h);
    return after({ ...G, hands, line, first, opening: null, turn: (p + 1) % PLAYERS, last: { p, kind: 'play', t, side } });
  }
  // A player with no domino that fits takes one from the pioche, and plays again if it fits.
  // He showed he has none of the two ends: the computer players remember it (his other dominoes).
  function draw(G) {
    const p = G.turn;
    if (G.end || G.result || !G.stock.length || !G.line.length || canPlay(G, p)) return G;
    const t = G.stock[G.stock.length - 1];
    const voids = G.voids.map((v, q) => q === p ? [...new Set(ends(G))] : v);
    return { ...G, stock: G.stock.slice(0, -1), hands: G.hands.map((h, q) => q === p ? [...h, t] : h), voids, last: { p, kind: 'draw', t } };
  }
  function pass(G) {
    const p = G.turn;
    if (G.end || G.result || G.stock.length || !G.line.length || canPlay(G, p)) return G;
    const voids = G.voids.map((v, q) => q === p ? [...new Set([...v, ...ends(G)])] : v);
    return after({ ...G, voids, turn: (p + 1) % PLAYERS, last: { p, kind: 'pass' } });
  }
  function nextManche(G) {
    if (!G.end || G.result) return G;
    return deal(G);
  }

  /* ---------- The computer players ----------
     Facile lays any domino that fits. Moyen gets rid of its doubles, keeps a domino for the next end and
     lays heavy dominoes, so it keeps few points in hand.
     Difficile counts the dominoes: it knows the line, its own hand, how many each player holds and the
     numbers each one showed it has none of. For each move, it imagines 40 deals of the unseen dominoes
     that agree with all this, plays each manche out as Moyen would, and keeps the move that marks the most
     points for it, or lets the others mark the fewest. */
  const seedOf = (G, salt) => (G.rs ^ Math.imul(G.line.length + 1, 0x9E3779B1) ^ Math.imul(G.stock.length + 7, 0x85EBCA77) ^ Math.imul(salt + 13, 0xC2B2AE3D)) >>> 0;

  // Moyen: its doubles first, then the domino that leaves it a domino for the new end, and the heaviest when
  // that is equal. In the tests, this wins 41 % of the manches against two Facile players, where Facile wins 32 %.
  function greedy(hand, l, r, empty) {
    let best = null, bk = -1;
    for (const t of hand) {
      const sides = empty ? ['C'] : [];
      if (!empty) { if (has(t, l)) sides.push('L'); if (has(t, r)) sides.push('R'); }
      for (const side of sides) {
        const open = side === 'L' ? other(t, l) : side === 'R' ? other(t, r) : TILES[t][1];
        let keep = 0;
        for (const u of hand) if (u !== t && has(u, open)) keep++;
        const k = pips(t) * 4 + (isDouble(t) ? 10 : 0) + keep * 10 + (side === 'R' ? .1 : 0);
        if (k > bk) { bk = k; best = { t, side }; }
      }
    }
    return best;
  }

  // Plays a manche to its end from a world { hands, stock, l, r, turn }, every player as Moyen.
  // Returns the winner (or null) and the pips left in each hand.
  function rollout(w) {
    const hands = w.hands.map(h => h.slice()), stock = w.stock.slice();
    let l = w.l, r = w.r, turn = w.turn, passes = 0;
    for (let guard = 0; guard < 200; guard++) {
      const h = hands[turn];
      let m = greedy(h, l, r, false);
      while (!m && stock.length) { h.push(stock.pop()); m = greedy(h, l, r, false); }
      if (m) {
        h.splice(h.indexOf(m.t), 1);
        if (m.side === 'L') l = other(m.t, l); else r = other(m.t, r);
        passes = 0;
        if (!h.length) return { winner: turn, pips: hands.map(handPips) };
      } else if (++passes >= PLAYERS) {
        const left = hands.map(handPips), low = Math.min(...left), ws = left.filter(v => v === low).length;
        return { winner: ws === 1 ? left.indexOf(low) : null, pips: left };
      }
      turn = (turn + 1) % PLAYERS;
    }
    return { winner: null, pips: hands.map(handPips) };
  }

  // The unseen dominoes dealt again to the others and the pioche, each player away from the numbers he showed
  // he has none of. After 30 tries that fail, a deal that ignores them.
  function imagine(G, p, rand) {
    const seen = new Set([...G.hands[p], ...G.line.map(x => x.t)]);
    const unseen = TILES.map((x, i) => i).filter(t => !seen.has(t));
    const others = [0, 1, 2].filter(q => q !== p);
    for (let tries = 0; tries < 31; tries++) {
      const pool = shuffle(unseen, rand), hands = [[], [], []];
      hands[p] = G.hands[p].slice();
      let ok = true;
      for (const q of others) {
        const need = G.hands[q].length, avoid = tries < 30 ? G.voids[q] : [];
        for (let i = 0; i < pool.length && hands[q].length < need; i++) {
          if (avoid.some(n => has(pool[i], n))) continue;
          hands[q].push(pool[i]); pool.splice(i, 1); i--;
        }
        if (hands[q].length < need) { ok = false; break; }
      }
      if (ok) return { hands, stock: pool };
    }
    return null;
  }

  function smart(G, moves, samples = 40) {
    const p = G.turn;
    const uniq = [];
    for (const m of moves) {
      const [l, r] = ends(G);
      const key = m.side === 'L' ? `${other(m.t, l)},${r}` : `${l},${other(m.t, r)}`;
      if (!uniq.some(u => u.t === m.t && u.key === key)) uniq.push({ ...m, key });
    }
    if (uniq.length === 1) return uniq[0];
    const rand = stream(seedOf(G, p));
    const worlds = [];
    for (let k = 0; k < samples; k++) { const w = imagine(G, p, rand); if (w) worlds.push(w); }
    let best = null, bv = -Infinity;
    for (const m of uniq) {
      let total = 0;
      for (const w of worlds) {
        const hands = w.hands.map(h => h.slice());
        hands[p] = hands[p].filter(x => x !== m.t);
        let [l, r] = ends(G);
        if (m.side === 'L') l = other(m.t, l); else r = other(m.t, r);
        const out = hands[p].length ? rollout({ hands, stock: w.stock, l, r, turn: (p + 1) % PLAYERS })
          : { winner: p, pips: hands.map(handPips) };
        if (out.winner === p) total += out.pips.reduce((a, v, q) => a + (q === p ? 0 : v), 0);
        else if (out.winner !== null) total -= out.pips.reduce((a, v, q) => a + (q === out.winner ? 0 : v), 0) * .6;
        total -= out.pips[p] * .05;
      }
      const v = total + pips(m.t) * .01;
      if (v > bv) { bv = v; best = m; }
    }
    return best;
  }

  function choose(G, level) {
    const moves = legal(G);
    if (!moves.length) return null;
    if (moves.length === 1) return moves[0];
    if (level === 'facile') return moves[Math.floor(stream(seedOf(G, G.turn))() * moves.length)];
    const [l, r] = G.line.length ? ends(G) : [null, null];
    if (level === 'moyen') return greedy(G.hands[G.turn], l, r, !G.line.length);
    return smart(G, moves);
  }

  // One whole turn of the player whose turn it is: draws, then a domino or a pass.
  function autoTurn(G, level) {
    const steps = [];
    const p = G.turn;
    for (let guard = 0; guard < 30 && !G.end && G.turn === p; guard++) {
      const m = choose(G, level);
      if (m) { G = play(G, m.t, m.side); steps.push({ did: 'play', t: m.t, side: m.side, G }); }
      else if (G.stock.length) { G = draw(G); steps.push({ did: 'draw', t: G.last.t, G }); }
      else { G = pass(G); steps.push({ did: 'pass', G }); }
    }
    return steps;
  }
  const computerTurn = G => autoTurn(G, G.level);

  function advice(G) {
    if (G.end || G.result) return null;
    const moves = legal(G);
    if (!moves.length) return { kind: G.stock.length ? 'draw' : 'pass' };
    const m = moves.length === 1 ? moves[0] : smart(G, moves, 60);
    return { kind: 'play', t: m.t, side: m.side };
  }

  // A saved game holds together: each tile once, the line joins, the counts and the turn make sense.
  function valid(G) {
    try {
      const int = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
      if (!G || G.v !== 1 || !Object.hasOwn(LEVELS, G.level) || !int(G.rs, 0, 2 ** 32 - 1) || !int(G.turn, 0, 2) || !int(G.manche, 1, 999)) return false;
      if (!Array.isArray(G.hands) || G.hands.length !== 3 || !Array.isArray(G.stock) || !Array.isArray(G.line)) return false;
      if (!Array.isArray(G.scores) || G.scores.length !== 3 || !G.scores.every(s => int(s, 0, 9999))) return false;
      if (!Array.isArray(G.voids) || G.voids.length !== 3 || !G.voids.every(v => Array.isArray(v) && v.every(n => int(n, 0, 6)))) return false;
      const all = [...G.hands.flat(), ...G.stock, ...G.line.map(x => x && x.t)];
      if (all.length !== 28 || !all.every(t => int(t, 0, 27)) || new Set(all).size !== 28) return false;
      for (let i = 0; i < G.line.length; i++) {
        const x = G.line[i], [a, b] = TILES[x.t];
        if (!((x.l === a && x.r === b) || (x.l === b && x.r === a))) return false;
        if (i && G.line[i - 1].r !== x.l) return false;
      }
      if (G.line.length ? !int(G.first, 0, G.line.length - 1) || G.opening !== null : !int(G.opening, 0, 27) || G.first !== 0) return false;
      if (!G.line.length && !G.hands[G.turn].includes(G.opening)) return false;
      if (G.result !== null && G.result !== 'won' && G.result !== 'lost') return false;
      if (G.result && !G.end) return false;
      if (G.end) {
        const e = G.end;
        if (!(e.winner === null || int(e.winner, 0, 2)) || typeof e.blocked !== 'boolean' || !Array.isArray(e.pips) || !int(e.points, 0, 168)) return false;
      } else if (G.hands.some(h => !h.length)) return false;
      const done = G.scores.some(s => s >= TARGET);
      if (done !== !!G.result) return false;
      return true;
    } catch (e) { return false; }
  }

  // Words: "le double six", "le six-quatre", "le quatre-blanc".
  const NUM = ['blanc', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six'];
  const name = t => { const [a, b] = TILES[t]; return a === b ? `le double ${NUM[a]}` : `le ${NUM[b]}-${NUM[a]}`; };

  root.Dominos = { opener, TILES, PLAYERS, HAND, TARGET, LEVELS, NUM, pips, isDouble, has, handPips, ends, name, stream,
    newGame, legal, fits, play, draw, pass, nextManche, choose, autoTurn, computerTurn, advice, valid, canPlay };
})(typeof window !== 'undefined' ? window : globalThis);
