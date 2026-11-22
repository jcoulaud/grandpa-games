// Rules of the morpion and the computer players. Facile is the little morpion: 3 by 3, three in a row
// wins. Moyen and Difficile are the morpion of squared paper: 11 by 11, five in a row or more wins
// (freestyle gomoku). No DOM: the game page loads it with <script>, the computer runs it again in a
// Web Worker made from its own source (Morpion.source), and the tests load it in Node.
//
// A square is a number: row * n + column, from the top left. A board is an array of n * n numbers:
// 0 empty, 1 a cross (X, the player), 2 a ring (O, the computer).
//
// A game G = { level, n, k, first, moves, result }:
//   first    who played the first mark, 1 or 2. The players take turns after it.
//   moves    the squares played, in order. The board, the turn and the result follow from them, so a
//            save is only the level, the first player and the moves (see restore).
//   result   null while the game goes on, else { winner: 1 | 2 | 0 (a draw), line: [squares] | null }
//
//   Morpion.newGame(level, first, n) -> an empty board; n 13 keeps the sheet of the older saves
//   Morpion.play(G, square)         -> the next game, or null if the square is not free
//   Morpion.undo(G)                 -> the game before the player's last cross, or null
//   Morpion.think(G, level)         -> { cell, kind } the move of the computer for the side to move
//   Morpion.hint(G)                 -> { cell, why } a good square for the side to move, and why
//   Morpion.restore(save)           -> the game of a save, or null if the save is broken
(function factory(root) {
  'use strict';
  const X = 1, O = 2;
  // The key 'fort' shows as "Difficile" (see lib/kit.js).
  const LEVELS = { facile: { n: 3, k: 3 }, moyen: { n: 11, k: 5 }, fort: { n: 11, k: 5 } };
  // The big sheet was 13 by 13 before: a save of that size goes on with it.
  const OLD_N = 13;
  const DIRS = [[0, 1], [1, 0], [1, 1], [1, -1]];

  // A random stream from a seed. The computer's seed comes from the position, so the same position
  // always gets the same answer: an undo followed by the same move replays the same game.
  function rng(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function seedOf(G) {
    let h = 2166136261 ^ G.n;
    for (const c of [G.first, ...G.moves]) { h ^= c + 1; h = Math.imul(h, 16777619); }
    return h >>> 0;
  }

  /* ---------- Rules ---------- */
  function newGame(level, first, n) {
    const key = typeof level === 'string' && Object.hasOwn(LEVELS, level) ? level : 'facile';
    const size = key !== 'facile' && n === OLD_N ? OLD_N : LEVELS[key].n;
    return { level: key, n: size, k: LEVELS[key].k, first: first === O ? O : X, moves: [], result: null };
  }
  const mover = (G, i) => (i % 2 === 0 ? G.first : 3 - G.first);
  const turn = G => mover(G, G.moves.length);
  function board(G) {
    const b = new Uint8Array(G.n * G.n);
    G.moves.forEach((c, i) => { b[c] = mover(G, i); });
    return b;
  }
  // The whole run of marks through c that makes k in a row or more, in board order, or null.
  function lineThrough(b, n, k, c) {
    const p = b[c], r = Math.floor(c / n), q = c % n;
    const at = (rr, qq) => rr >= 0 && rr < n && qq >= 0 && qq < n && b[rr * n + qq] === p;
    for (const [dr, dc] of DIRS) {
      const run = [c];
      for (let s = 1; at(r + dr * s, q + dc * s); s++) run.push((r + dr * s) * n + q + dc * s);
      for (let s = 1; at(r - dr * s, q - dc * s); s++) run.unshift((r - dr * s) * n + q - dc * s);
      if (run.length >= k) return run;
    }
    return null;
  }
  function play(G, c) {
    if (!G || G.result || !Number.isInteger(c) || c < 0 || c >= G.n * G.n) return null;
    const b = board(G);
    if (b[c]) return null;
    const p = turn(G);
    b[c] = p;
    const moves = [...G.moves, c];
    const line = lineThrough(b, G.n, G.k, c);
    const result = line ? { winner: p, line } : moves.length === G.n * G.n ? { winner: 0, line: null } : null;
    return { ...G, moves, result };
  }
  // Why a square cannot take a mark now: 'over' (the game is finished), 'mine' (a cross is there),
  // 'theirs' (a ring is there), or null when it is free.
  function refusal(G, c) {
    if (G.result) return 'over';
    const v = board(G)[c];
    return v === X ? 'mine' : v === O ? 'theirs' : null;
  }
  const replay = (G, moves) => moves.reduce((g, c) => g && play(g, c), { ...G, moves: [], result: null });
  // Back to just before the player's last cross: it takes back his cross and the computer's answer.
  function undo(G) {
    let i = G.moves.length - 1;
    while (i >= 0 && mover(G, i) !== X) i--;
    return i < 0 ? null : replay(G, G.moves.slice(0, i));
  }
  // A save holds the level, the first player, the size of the sheet and the moves. An unknown level
  // reads as Facile, and any move that is not legal makes the save broken.
  function restore(v) {
    if (!v || typeof v !== 'object' || !Array.isArray(v.moves)) return null;
    const G = newGame(v.level, v.first, v.n);
    return replay(G, v.moves);
  }

  /* ---------- The little morpion, 3 by 3 ---------- */
  const LINES3 = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
  const won3 = (b, p) => LINES3.some(l => l.every(c => b[c] === p));
  // The squares where p completes a line of three now.
  const wins3 = (b, p) => [...new Set(LINES3.filter(l => l.filter(c => b[c] === p).length === 2 && l.some(c => !b[c]))
    .map(l => l.find(c => !b[c])))];
  // Exact value of a position for p to move: above 0 a win, 0 a draw, below 0 a loss. A quicker win
  // is worth more and a later loss less bad, so a lost position still blocks the next line.
  const memo3 = new Map();
  const win3 = b => 10 - b.reduce((s, x) => s + (x ? 1 : 0), 0);
  function value3(b, p) {
    const key = b.join('') + p;
    if (memo3.has(key)) return memo3.get(key);
    let best = -99, free = 0;
    for (let c = 0; c < 9; c++) if (!b[c]) {
      free++;
      b[c] = p;
      const v = won3(b, p) ? win3(b) : -value3(b, 3 - p);
      b[c] = 0;
      if (v > best) best = v;
    }
    if (!free) best = 0;
    memo3.set(key, best);
    return best;
  }
  // The perfect player: among the best squares, the centre, then a corner, then an edge.
  const ORDER3 = [4, 0, 2, 6, 8, 1, 3, 5, 7];
  function perfect3(b, p) {
    let best = -99, cell = -1;
    for (const c of ORDER3) if (!b[c]) {
      b[c] = p;
      const v = won3(b, p) ? win3(b) : b.every(x => x) ? 0 : -value3(b, 3 - p);
      b[c] = 0;
      if (v > best) { best = v; cell = c; }
    }
    return cell;
  }
  // Facile: it often finishes its line and often blocks his, but not always, and it plays at random
  // otherwise. It never plays perfectly, so he can win often.
  function facile3(b, p, rnd) {
    const win = wins3(b, p), block = wins3(b, 3 - p);
    if (win.length && rnd() < 0.8) return win[0];
    if (block.length && rnd() < 0.5) return block[0];
    if (!b[4] && rnd() < 0.3) return 4;
    const free = [];
    for (let c = 0; c < 9; c++) if (!b[c]) free.push(c);
    return free[Math.floor(rnd() * free.length)];
  }

  /* ---------- Patterns of five in a row ----------
     The 8 squares around a square in one direction (4 each side) make a code: each is 0 empty, 1 the
     player's, 2 blocked (the other player's, or off the board). CLS[code] is what a mark in the middle
     makes in that line:
       8 five       five in a row
       7 open four  two squares make five: the other player cannot block both
       6 four       one square makes five
       5 open three one more mark makes an open four
       4 three      one more mark makes a four
       3 open two   one more mark makes an open three
       2 two        one more mark makes a three
       1 one        one more mark makes a two or an open two
       0 nothing    no five fits in this line any more */
  const POW = [1, 3, 9, 27, 81, 243, 729, 2187];
  const CLS = new Int8Array(6561).fill(-1);
  function five(L) {
    for (let s = 0; s <= 4; s++) {
      let all = true;
      for (let j = s; j < s + 5; j++) if (L[j] !== 1) { all = false; break; }
      if (all) return true;
    }
    return false;
  }
  function codeOf(L) { let x = 0, j = 0; for (let i = 0; i < 9; i++) if (i !== 4) x += L[i] * POW[j++]; return x; }
  function classify(L) {
    const code = codeOf(L);
    if (CLS[code] >= 0) return CLS[code];
    let res;
    if (five(L)) res = 8;
    else {
      let wins = 0;
      for (let e = 0; e < 9; e++) if (L[e] === 0) { L[e] = 1; if (five(L)) wins++; L[e] = 0; }
      if (wins >= 2) res = 7;
      else if (wins === 1) res = 6;
      else {
        let best = -1;
        for (let e = 0; e < 9; e++) if (L[e] === 0) { L[e] = 1; best = Math.max(best, classify(L)); L[e] = 0; }
        res = best >= 7 ? 5 : best === 6 ? 4 : best === 5 ? 3 : best === 4 ? 2 : best >= 2 ? 1 : 0;
      }
    }
    CLS[code] = res;
    return res;
  }
  for (let code = 0; code < 6561; code++) {
    const L = [0, 0, 0, 0, 1, 0, 0, 0, 0];
    let x = code;
    for (let i = 0; i < 9; i++) if (i !== 4) { L[i] = x % 3; x = Math.floor(x / 3); }
    classify(L);
  }

  // NB[n][c * 32 + d * 8 + j]: the square at offset -4, -3, -2, -1, 1, 2, 3, 4 from c in direction d,
  // or -1 off the board.
  const OFFS = [-4, -3, -2, -1, 1, 2, 3, 4];
  const NB = {};
  function nbOf(n) {
    if (NB[n]) return NB[n];
    const t = new Int16Array(n * n * 32);
    for (let c = 0; c < n * n; c++) {
      const r = Math.floor(c / n), q = c % n;
      DIRS.forEach(([dr, dc], d) => OFFS.forEach((o, j) => {
        const rr = r + dr * o, qq = q + dc * o;
        t[c * 32 + d * 8 + j] = rr >= 0 && rr < n && qq >= 0 && qq < n ? rr * n + qq : -1;
      }));
    }
    return (NB[n] = t);
  }
  // What a mark of p on c makes in direction d. c may be empty or already hold the mark.
  function cls(b, nb, c, p, d) {
    let x = 0;
    const base = c * 32 + d * 8;
    for (let j = 0; j < 8; j++) {
      const s = nb[base + j];
      x += (s < 0 ? 2 : b[s] === 0 ? 0 : b[s] === p ? 1 : 2) * POW[j];
    }
    return CLS[x];
  }
  function maxCls(b, nb, c, p) {
    let m = 0;
    for (let d = 0; d < 4; d++) { const k = cls(b, nb, c, p, d); if (k > m) m = k; }
    return m;
  }
  // Everything a mark of p on c makes: the best line, the fours and open threes, a double threat
  // (an open four, two fours, or a four and an open three: one move cannot stop it), and a score.
  const W = [0, 2, 6, 25, 30, 300, 400, 6000, 200000];
  function info(b, nb, c, p) {
    let v = 0, max = 0, n4 = 0, n3 = 0;
    for (let d = 0; d < 4; d++) {
      const k = cls(b, nb, c, p, d);
      v += W[k];
      if (k > max) max = k;
      if (k === 6 || k === 7) n4++;
      if (k === 5) n3++;
    }
    const threat = max < 8 && (max === 7 || n4 >= 2 || (n4 >= 1 && n3 >= 1));
    if (threat) v += 30000; else if (n3 >= 2) v += 8000;
    return { max, n4, n3, threat, double3: !threat && n3 >= 2, v };
  }
  // The empty squares at most 2 rows or columns from a mark, or the centre on an empty board.
  function candidates(b, n) {
    const seen = new Uint8Array(n * n), out = [];
    let any = false;
    for (let c = 0; c < n * n; c++) if (b[c]) {
      any = true;
      const r = Math.floor(c / n), q = c % n;
      for (let rr = Math.max(0, r - 2); rr <= Math.min(n - 1, r + 2); rr++)
        for (let qq = Math.max(0, q - 2); qq <= Math.min(n - 1, q + 2); qq++) {
          const s = rr * n + qq;
          if (!b[s] && !seen[s]) { seen[s] = 1; out.push(s); }
        }
    }
    if (!any) out.push(Math.floor(n / 2) * n + Math.floor(n / 2));
    return out;
  }
  // The squares on the lines through c where p now makes five.
  function fivePoints(b, nb, c, p) {
    const out = [];
    for (let d = 0; d < 4; d++) for (let j = 0; j < 8; j++) {
      const s = nb[c * 32 + d * 8 + j];
      if (s >= 0 && !b[s] && cls(b, nb, s, p, d) === 8 && !out.includes(s)) out.push(s);
    }
    return out;
  }
  // A small lead for the middle of the board, so equal squares are not chosen at the edge.
  const central = (n, c) => -(Math.abs(Math.floor(c / n) - (n - 1) / 2) + Math.abs(c % n - (n - 1) / 2)) * 0.5;
  // The score of a square for p: what it makes for p, and what it takes from the other player.
  const score = (b, nb, n, c, p, att = 1.1) => info(b, nb, c, p).v * att + info(b, nb, c, 3 - p).v + central(n, c);

  /* ---------- Moyen: the best square by its patterns, with no search ---------- */
  function greedy(b, n, me, rnd, noise) {
    const nb = nbOf(n), op = 3 - me, cs = candidates(b, n);
    for (const c of cs) if (maxCls(b, nb, c, me) === 8) return c;
    for (const c of cs) if (maxCls(b, nb, c, op) === 8) return c;
    let best = cs[0], top = -Infinity;
    for (const c of cs) {
      const v = score(b, nb, n, c, me) * (1 + noise * rnd());
      if (v > top) { top = v; best = c; }
    }
    return best;
  }

  /* ---------- Difficile: threat search ----------
     VCF (victory by continuous fours): a line of fours, each forcing the other player to block the one
     square that makes five, until a five or an open four. The other player's block may make a four of
     his own: then the next move must stop it. */
  function vcf(b, n, me, depth, budget) {
    if (budget.nodes-- <= 0) return null;
    const nb = nbOf(n), op = 3 - me, cs = candidates(b, n);
    const oppFive = [];
    let fours = [];
    for (const c of cs) {
      const m = maxCls(b, nb, c, me);
      if (m === 8) return [c];
      if (m >= 6) fours.push([c, m]);
      if (maxCls(b, nb, c, op) === 8) oppFive.push(c);
    }
    if (oppFive.length > 1) return null;
    if (oppFive.length === 1) fours = fours.filter(([c]) => c === oppFive[0]);
    if (depth <= 0 || !fours.length) return null;
    fours.sort((x, y) => y[1] - x[1]);
    for (const [c] of fours) {
      b[c] = me;
      const pts = fivePoints(b, nb, c, me);
      let res = null;
      if (pts.length >= 2) res = [c];
      else if (pts.length === 1) {
        const p = pts[0];
        b[p] = op;
        const rest = vcf(b, n, me, depth - 1, budget);
        if (rest) res = [c, p, ...rest];
        b[p] = 0;
      }
      b[c] = 0;
      if (res) return res;
    }
    return null;
  }
  // VCT (victory by continuous threats): open threes too. After each open three, every square where
  // the other player could block it, or make a four of his own, is tried; each one must still lose.
  function vct(b, n, me, depth, budget) {
    if (budget.nodes-- <= 0) return null;
    const nb = nbOf(n), op = 3 - me, cs = candidates(b, n);
    for (const c of cs) if (maxCls(b, nb, c, me) === 8) return [c];
    for (const c of cs) if (maxCls(b, nb, c, op) === 8) return null;
    const f = vcf(b, n, me, 8, budget);
    if (f) return f;
    if (depth <= 0) return null;
    const threes = cs.map(c => [c, info(b, nb, c, me)]).filter(([, i]) => i.max === 5 || i.double3)
      .sort((x, y) => y[1].v - x[1].v).slice(0, 8);
    for (const [c] of threes) {
      b[c] = me;
      const replies = candidates(b, n).filter(e => maxCls(b, nb, e, me) >= 6 || maxCls(b, nb, e, op) >= 6);
      let all = replies.length > 0;
      for (const r of replies) {
        b[r] = op;
        const w = vct(b, n, me, depth - 1, budget);
        b[r] = 0;
        if (!w) { all = false; break; }
        if (budget.nodes <= 0) { all = false; break; }
      }
      b[c] = 0;
      if (all) return [c];
    }
    return null;
  }
  const WIN = 1e7;
  // The k best squares for p to play, by their patterns. When the other player can make five, only
  // the square that stops it.
  function order(b, nb, n, p, k) {
    const cs = candidates(b, n);
    for (const c of cs) if (maxCls(b, nb, c, 3 - p) === 8 && maxCls(b, nb, c, p) < 8) {
      if (!cs.some(e => maxCls(b, nb, e, p) === 8)) return [c];
    }
    return cs.map(c => [c, score(b, nb, n, c, p)]).sort((x, y) => y[1] - x[1]).slice(0, k).map(x => x[0]);
  }
  // The value of a position for p to move: the best square p has, less the best the other player has.
  function leaf(b, nb, n, p) {
    let mine = 0, theirs = 0;
    for (const c of candidates(b, n)) {
      const a = info(b, nb, c, p).v, d = info(b, nb, c, 3 - p).v;
      if (a > mine) mine = a;
      if (d > theirs) theirs = d;
    }
    return mine - 0.5 * theirs;
  }
  function negamax(b, n, p, depth, alpha, beta) {
    const nb = nbOf(n);
    if (depth <= 0) return leaf(b, nb, n, p);
    const list = order(b, nb, n, p, 8);
    // A full sheet without five is a draw.
    if (!list.length) return 0;
    let top = -Infinity;
    for (const c of list) {
      if (maxCls(b, nb, c, p) === 8) return WIN;
      b[c] = p;
      const v = -negamax(b, n, 3 - p, depth - 1, -beta, -alpha);
      b[c] = 0;
      if (v > top) top = v;
      if (top > alpha) alpha = top;
      if (alpha >= beta) break;
    }
    return top;
  }
  // Difficile: a five, a block of a five, its own forced win, then the best square that leaves the
  // other player no forced win.
  function strong(b, n, me, nodes) {
    const nb = nbOf(n), op = 3 - me, cs = candidates(b, n);
    for (const c of cs) if (maxCls(b, nb, c, me) === 8) return { cell: c, kind: 'five' };
    for (const c of cs) if (maxCls(b, nb, c, op) === 8) return { cell: c, kind: 'block' };
    const own = vcf(b, n, me, 12, { nodes });
    if (own) return { cell: own[0], kind: 'vcf' };
    const threat = vct(b, n, me, 3, { nodes });
    if (threat) return { cell: threat[0], kind: 'vct' };
    // Otherwise a short search: the best squares by their patterns, the other player's best answers,
    // and so on, each position valued by the best square each side has left.
    const ranked = order(b, nb, n, me, 12);
    let best = ranked[0], top = -Infinity;
    for (const c of ranked) {
      b[c] = me;
      const lost = vcf(b, n, op, 10, { nodes: nodes / 4 });
      const v = lost ? -WIN : -negamax(b, n, op, DEPTH, -Infinity, -top);
      b[c] = 0;
      if (v > top) { top = v; best = c; }
    }
    return { cell: best, kind: 'best' };
  }

  // The computer's move for the side to move. level: 'facile', 'moyen', 'fort', or 'parfait' (the
  // perfect player of the little morpion, for the hint and the tests).
  const NODES = 1500, DEPTH = 5;
  function think(G, level) {
    if (G.result) return null;
    const b = board(G), me = turn(G), rnd = rng(seedOf(G) ^ (level === 'moyen' ? 77 : 13));
    if (G.n === 3) return { cell: level === 'facile' ? facile3(b, me, rnd) : perfect3(b, me), kind: 'best' };
    if (level === 'moyen') return { cell: greedy(b, G.n, me, rnd, 0.35), kind: 'best' };
    return strong(b, G.n, me, NODES);
  }

  // A mark of p on c in direction d fills a gap: p has a mark on each side of it, so the three marks
  // that c makes into an open four are not in a row.
  const fillsGap = (b, nb, c, p, d) => b[nb[c * 32 + d * 8 + 3]] === p && b[nb[c * 32 + d * 8 + 4]] === p;
  // The squares where p makes five now.
  const fivesOf = (b, n, p) => { const nb = nbOf(n); return candidates(b, n).filter(c => maxCls(b, nb, c, p) === 8); };
  // What the side to move has to fear: 'win' when the other player can make his line at the next
  // move on one square, 'wins' on two squares or more, 'three' when he can make an open four from
  // three marks in a row, 'gap' when only from three marks with an empty square between them, else
  // null. Nothing to fear when the side to move can make his own line now.
  function danger(G) {
    if (G.result) return null;
    const b = board(G), me = turn(G), op = 3 - me;
    if (G.n === 3) {
      const w = wins3(b, op).length;
      return wins3(b, me).length ? null : w > 1 ? 'wins' : w ? 'win' : null;
    }
    const nb = nbOf(G.n), cs = candidates(b, G.n);
    if (cs.some(c => maxCls(b, nb, c, me) === 8)) return null;
    const w = cs.filter(c => maxCls(b, nb, c, op) === 8).length;
    if (w) return w > 1 ? 'wins' : 'win';
    let gap = false;
    for (const c of cs) for (let d = 0; d < 4; d++) if (cls(b, nb, c, op, d) === 7) {
      if (!fillsGap(b, nb, c, op, d)) return 'three';
      gap = true;
    }
    return gap ? 'gap' : null;
  }
  // The other player's mark that the move on c stopped: 'win' if he could have won there, 'three' if
  // he could have made an open four there, else null.
  function blocked(G, c) {
    const b = board(G), me = mover(G, G.moves.lastIndexOf(c)), op = 3 - me;
    b[c] = 0;
    if (G.n === 3) return wins3(b, op).includes(c) ? 'win' : null;
    const m = maxCls(b, nbOf(G.n), c, op);
    return m === 8 ? 'win' : m === 7 ? 'three' : null;
  }

  // The hint: the best square for the side to move, with one sentence that says why.
  function hint(G) {
    if (G.result) return null;
    const b = board(G), me = turn(G), op = 3 - me;
    if (G.n === 3) {
      const cell = perfect3(b, me);
      let why;
      if (wins3(b, me).includes(cell)) why = 'Ici, vous alignez trois croix et vous gagnez.';
      else if (wins3(b, op).length > 1) why = TWO_WINS(3, wins3(b, op).includes(cell));
      else if (wins3(b, op).includes(cell)) why = 'Ici, vous bloquez deux ronds alignés.';
      else {
        b[cell] = me;
        const fork = wins3(b, me).length >= 2;
        b[cell] = 0;
        why = fork ? 'Ici, vous préparez deux alignements à la fois : l’ordinateur ne pourra pas tout bloquer.'
          : cell === 4 ? 'Le centre est la meilleure case : il touche quatre alignements.'
          : [0, 2, 6, 8].includes(cell) ? 'Un coin touche trois alignements : c’est une bonne case.'
          : 'Ici, vous empêchez l’ordinateur de préparer un piège.';
      }
      return { cell, why };
    }
    const { cell, kind } = strong(b, G.n, me, NODES);
    return { cell, why: reason(b, G.n, cell, me, kind) };
  }
  // The other player can win on two squares or more: one cross cannot stop them all, so the hint says so.
  // It offers to block only when the hinted square is one of them.
  const TWO_WINS = (k, blocks) => `L’ordinateur peut aligner ${k === 3 ? 'trois' : 'cinq'} ronds à plusieurs endroits, et une croix n’en bloque qu’un. ` +
    (blocks ? 'Annulez votre dernier coup, ou bloquez ici.' : 'Annulez votre dernier coup.');
  function reason(b, n, c, me, kind) {
    const nb = nbOf(n), op = 3 - me, mine = info(b, nb, c, me), theirs = info(b, nb, c, op);
    if (mine.max === 8) return 'Ici, vous alignez cinq croix et vous gagnez.';
    if (fivesOf(b, n, op).length > 1) return TWO_WINS(5, theirs.max === 8);
    if (theirs.max === 8) return 'Ici, vous empêchez l’ordinateur d’aligner cinq ronds.';
    if (mine.max === 7) return 'Ici, vous alignez quatre croix libres aux deux bouts : l’ordinateur ne pourra pas tout bloquer.';
    if (mine.threat) return 'Ici, vous faites deux menaces à la fois : l’ordinateur ne pourra pas tout bloquer.';
    if (kind === 'vcf' || kind === 'vct') return 'Ici, vous lancez une attaque gagnante : continuez à aligner vos croix.';
    if (theirs.max === 7) {
      const gap = [0, 1, 2, 3].some(d => cls(b, nb, c, op, d) === 7 && fillsGap(b, nb, c, op, d));
      return gap ? 'Ici, vous bouchez le trou entre trois ronds de l’ordinateur.' : 'Ici, vous bloquez trois ronds alignés.';
    }
    if (theirs.threat || theirs.double3) return 'Ici, vous empêchez l’ordinateur de faire deux menaces à la fois.';
    if (mine.max === 6) return 'Ici, vous alignez quatre croix : l’ordinateur devra bloquer.';
    if (mine.max === 5) return 'Ici, vous alignez trois croix, avec de la place des deux côtés.';
    if (theirs.max === 5) return 'Ici, vous bloquez deux ronds alignés avant qu’ils deviennent dangereux.';
    if (!b.some(x => x)) return 'Commencez au milieu de la feuille : vous aurez de la place dans tous les sens.';
    if (!b.includes(me)) return 'Ici, vous posez votre croix contre son rond : vous le gênez déjà.';
    return 'Ici, vous rapprochez vos croix pour préparer un alignement.';
  }

  const api = { X, O, LEVELS, newGame, play, undo, refusal, restore, board, turn, mover, think, hint, danger, blocked,
    // For the tests.
    perfect3, info, cls, maxCls, nbOf, candidates, vcf, rng };
  api.source = '(' + factory.toString() + ')(self);';
  root.Morpion = api;

  // In a Web Worker: answer each request with the computer's move or the hint.
  if (typeof importScripts === 'function' && typeof root.postMessage === 'function') {
    root.onmessage = e => {
      const { id, G, level } = e.data;
      root.postMessage({ id, answer: level === 'hint' ? hint(G) : think(G, level) });
    };
  }
})(typeof self !== 'undefined' ? self : globalThis);
