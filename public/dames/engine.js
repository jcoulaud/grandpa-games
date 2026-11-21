// Rules of international draughts (le jeu de dames, FMJD rules) on a 10x10 board, and the computer player.
// No DOM: the game page loads it with <script>, the computer runs it again in a Web Worker made from
// its own source (Dames.source), and the tests load it in Node.
//
// Squares are numbered 1 to 50 as in the official notation: 1 is at the top left, black starts on
// 1-20, white on 31-50, and white moves up and promotes on 1-5. A board is an array of 51 numbers:
// b[n] is 0 (empty), 1 (white man), 2 (white king), -1 (black man) or -2 (black king). b[0] is unused.
//
// A game G = { b, turn, quiet, endLeft, reps, result }:
//   turn     1 (white) or -1 (black), the side to move
//   quiet    plies in a row made only of king moves without a capture (a draw at 50)
//   endLeft  plies left before the draw of a short ending, or null (FMJD articles 6.3 and 6.4)
//   reps     how many times each position occurred since the last capture or man move
//   result   null while the game goes on, else { winner: 1 | -1 | 0, why }
//
//   Dames.newGame()          -> the opening position, white to move
//   Dames.moves(b, turn)     -> the legal moves. Each is { from, to, caps, routes }: caps lists the
//                               squares taken, sorted, and routes holds every legal way to play it,
//                               each { path: [landing squares in order], caps: [squares taken in order] }.
//                               A quiet move has one route and no caps.
//   Dames.advance(G, move)   -> the next game, with its draw counters and its result
//   Dames.think(G, opts)     -> { move, score, depth } the computer's choice for the side to move
(function factory(root) {
  'use strict';
  const WHITE = 1, BLACK = -1;

  // Row and column of a square, from the top left, as white sees the board.
  const rowOf = n => Math.floor((n - 1) / 5);
  const colOf = n => { const r = rowOf(n), k = (n - 1) % 5; return r % 2 === 0 ? 2 * k + 1 : 2 * k; };
  const sqAt = (r, c) => (r < 0 || r > 9 || c < 0 || c > 9 || (r + c) % 2 === 0) ? 0 : r * 5 + Math.floor(c / 2) + 1;

  // RAY[n][d]: the squares along direction d from n, nearest first.
  // d: 0 up-left, 1 up-right, 2 down-left, 3 down-right ("up" is towards row 0, where white promotes).
  const DIRS = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
  const RAY = [null];
  for (let n = 1; n <= 50; n++) {
    RAY.push(DIRS.map(([dr, dc]) => {
      const out = [];
      for (let r = rowOf(n) + dr, c = colOf(n) + dc, s; (s = sqAt(r, c)); r += dr, c += dc) out.push(s);
      return out;
    }));
  }
  // A man moves forward: white up (directions 0 and 1), black down (2 and 3).
  const FORWARD = { [WHITE]: [0, 1], [BLACK]: [2, 3] };
  const promotes = (side, n) => rowOf(n) === (side === WHITE ? 0 : 9);
  // The long diagonal, from 5 to 46.
  const LONG = new Set([5, 10, 14, 19, 23, 28, 32, 37, 41, 46]);

  function startBoard() {
    const b = new Array(51).fill(0);
    for (let n = 1; n <= 20; n++) b[n] = BLACK;
    for (let n = 31; n <= 50; n++) b[n] = WHITE;
    return b;
  }

  // Every capture route of the piece on `from`. The piece leaves its square when it starts, so it may
  // pass over it or finish on it. Taken pieces stay on the board until the end: they block the way,
  // and none can be taken twice. The piece keeps its kind during the move: a man that passes over the
  // last row and goes on taking is still a man.
  function captures(b, from, out) {
    const me = b[from], side = Math.sign(me), king = Math.abs(me) === 2;
    const taken = new Uint8Array(51), path = [], caps = [];
    const cell = s => (s === from ? 0 : b[s]);
    const step = at => {
      let more = false;
      for (let d = 0; d < 4; d++) {
        const ray = RAY[at][d];
        let i = 0;
        if (king) while (i < ray.length && cell(ray[i]) === 0) i++;
        if (i >= ray.length - 1) continue;
        const v = ray[i], p = cell(v);
        if (p === 0 || Math.sign(p) === side || taken[v]) continue;
        // Landing squares: the next one for a man, every empty one beyond the piece for a king.
        for (let j = i + 1; j < ray.length && cell(ray[j]) === 0; j++) {
          more = true;
          taken[v] = 1; caps.push(v); path.push(ray[j]);
          step(ray[j]);
          taken[v] = 0; caps.pop(); path.pop();
          if (!king) break;
        }
      }
      if (!more && caps.length) out.push({ from, to: at, path: path.slice(), caps: caps.slice() });
    };
    step(from);
  }

  // The legal moves. Taking is compulsory, and the player must take the most pieces possible, whatever
  // the pieces are (a king counts as one). Routes that take the same pieces and end on the same square
  // are one move: the engine weighs it once, and the player may still take any of its routes.
  function moves(b, turn) {
    const found = [];
    for (let n = 1; n <= 50; n++) if (Math.sign(b[n]) === turn) captures(b, n, found);
    if (found.length) {
      let most = 0;
      for (const r of found) most = Math.max(most, r.caps.length);
      const byKey = new Map();
      for (const r of found) {
        if (r.caps.length !== most) continue;
        const caps = r.caps.slice().sort((x, y) => x - y);
        const k = r.from + '-' + r.to + ':' + caps.join(',');
        let m = byKey.get(k);
        if (!m) byKey.set(k, m = { from: r.from, to: r.to, caps, routes: [] });
        m.routes.push({ path: r.path, caps: r.caps });
      }
      return [...byKey.values()];
    }
    const out = [];
    const quiet = (from, to) => out.push({ from, to, caps: [], routes: [{ path: [to], caps: [] }] });
    for (let n = 1; n <= 50; n++) {
      const p = b[n];
      if (Math.sign(p) !== turn) continue;
      if (Math.abs(p) === 2) {
        for (let d = 0; d < 4; d++) for (const s of RAY[n][d]) { if (b[s]) break; quiet(n, s); }
      } else {
        for (const d of FORWARD[turn]) { const s = RAY[n][d][0]; if (s && !b[s]) quiet(n, s); }
      }
    }
    return out;
  }

  // The board after a move. A man crowns only if it ends its move on the last row.
  function apply(b, m) {
    const nb = b.slice(), p = nb[m.from], side = Math.sign(p);
    nb[m.from] = 0;
    for (const c of m.caps) nb[c] = 0;
    nb[m.to] = Math.abs(p) === 1 && promotes(side, m.to) ? 2 * side : p;
    return nb;
  }

  // A short key of a position, for repetitions: the side to move, then each square.
  const key = (b, turn) => (turn === WHITE ? 'w' : 'b') + b.slice(1).map(v => 'KMeWQ'[v + 2]).join('');

  // The draw limit of a short ending, in plies, or null. One side has a lone king, and the other has
  // three pieces with at least one king (16 moves each, or 5 when the lone king holds the long diagonal
  // alone), or one or two pieces with at least one king (5 moves each).
  function endLimit(b) {
    const w = [], k = [];
    for (let n = 1; n <= 50; n++) if (b[n] > 0) w.push(n); else if (b[n] < 0) k.push(n);
    const check = (strong, lone) => {
      if (lone.length !== 1 || Math.abs(b[lone[0]]) !== 2) return null;
      if (!strong.some(n => Math.abs(b[n]) === 2)) return null;
      if (strong.length === 3) return LONG.has(lone[0]) && !strong.some(n => LONG.has(n)) ? 10 : 32;
      if (strong.length <= 2) return 10;
      return null;
    };
    const a = check(w, k), c = check(k, w);
    return a === null ? c : c === null ? a : Math.min(a, c);
  }

  function newGame() {
    const b = startBoard();
    return { b, turn: WHITE, quiet: 0, endLeft: null, reps: { [key(b, WHITE)]: 1 }, result: null };
  }

  // The game after one move: the board, the side to move, the draw counters and the result.
  // A win comes first: taking the last piece or blocking the other side on the last allowed ply wins.
  function advance(G, m) {
    const p = G.b[m.from];
    const b = apply(G.b, m), turn = -G.turn;
    const reset = m.caps.length > 0 || Math.abs(p) === 1;
    const quiet = reset ? 0 : G.quiet + 1;
    const k = key(b, turn);
    const reps = reset ? {} : Object.assign({}, G.reps);
    reps[k] = (reps[k] || 0) + 1;
    // An ending's count starts after the move that makes it. A capture that leads to a smaller
    // ending keeps the earlier deadline when it is nearer.
    const lim = endLimit(b);
    let endLeft = null;
    if (lim !== null) endLeft = G.endLeft === null ? lim : Math.min(G.endLeft - 1, lim);
    let result = null;
    if (!moves(b, turn).length) result = { winner: G.turn, why: hasPieces(b, turn) ? 'blocked' : 'taken' };
    else if (reps[k] >= 3) result = { winner: 0, why: 'repeat' };
    else if (quiet >= 50) result = { winner: 0, why: 'quiet' };
    else if (endLeft !== null && endLeft <= 0) result = { winner: 0, why: 'ending' };
    return { b, turn, quiet, endLeft, reps, result };
  }
  function hasPieces(b, side) { for (let n = 1; n <= 50; n++) if (Math.sign(b[n]) === side) return true; return false; }

  /* ---------- The computer ----------
     Negamax with alpha-beta and iterative deepening, in whole moves (a multiple capture is one ply).
     At the depth limit, compulsory captures are still searched, so a static score never hides a piece
     that is about to be taken. The draw rules count in the search: repetitions along the line, the
     quiet king moves and the endings' deadlines. */
  const MAN = 100, KING = 320, WIN = 100000;
  // Bonus for a man by how far it has come (0 = its own back row).
  const ADV = [0, 2, 4, 6, 9, 12, 16, 22, 30, 0];
  function evaluate(b, turn) {
    let s = 0, wk = 0, bk = 0, wm = 0, bm = 0;
    for (let n = 1; n <= 50; n++) {
      const v = b[n];
      if (!v) continue;
      const r = rowOf(n), c = colOf(n);
      const centre = c >= 2 && c <= 7 && r >= 2 && r <= 7 ? 4 : 0;
      if (v === 1) { wm++; s += MAN + ADV[9 - r] + centre + (c === 0 || c === 9 ? -3 : 0); }
      else if (v === -1) { bm++; s -= MAN + ADV[r] + centre + (c === 0 || c === 9 ? -3 : 0); }
      else if (v === 2) { wk++; s += KING + (LONG.has(n) ? 12 : 0); }
      else { bk++; s -= KING + (LONG.has(n) ? 12 : 0); }
    }
    // Men that still guard the back row keep the other side from crowning, until it has a king.
    if (!bk) for (const n of [46, 48, 50]) if (b[n] === 1) s += 6;
    if (!wk) for (const n of [1, 3, 5]) if (b[n] === -1) s -= 6;
    // Ahead in material, trading pieces brings the win nearer.
    const wt = wm + 3 * wk, bt = bm + 3 * bk;
    if (wt !== bt) s += (wt > bt ? 1 : -1) * (40 - (wt + bt)) * 2;
    return turn === WHITE ? s : -s;
  }

  // A quick order for the moves: big captures, crowning, then moves forward.
  function order(b, ms, first) {
    const score = m => {
      if (first && m.from === first.from && m.to === first.to && m.caps.join() === first.caps.join()) return 1e6;
      const p = b[m.from];
      let s = m.caps.length * 1000;
      for (const c of m.caps) if (Math.abs(b[c]) === 2) s += 300;
      if (Math.abs(p) === 1 && promotes(Math.sign(p), m.to)) s += 500;
      if (Math.abs(p) === 1) s += 10;
      return s;
    };
    return ms.map(m => [score(m), m]).sort((x, y) => y[0] - x[0]).map(x => x[1]);
  }

  // opts: { time (ms), depth (most plies), only (keys "from-to:caps" of the moves allowed), spread (Facile: points within which a weaker move may be
  //        chosen), chance (how often it is), random (a function; Math.random by default) }
  function think(G, opts = {}) {
    const rnd = opts.random || Math.random;
    const time = opts.time || 500, maxDepth = opts.depth || 30;
    const deadline = Date.now() + time;
    let root = moves(G.b, G.turn);
    // The hint during a capture: only the moves that follow the landings already clicked.
    if (opts.only) root = root.filter(m => opts.only.includes(m.from + '-' + m.to + ':' + m.caps.join(',')));
    if (!root.length) return null;
    if (root.length === 1) return { move: root[0], score: 0, depth: 0 };
    // Ties at the root are broken at random, so two games do not repeat.
    for (let i = root.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [root[i], root[j]] = [root[j], root[i]]; }
    let nodes = 0;
    const path = [];
    const STOP = {};
    function search(b, turn, depth, alpha, beta, ply, quiet, endLeft, ext) {
      if ((++nodes & 1023) === 0 && Date.now() > deadline) throw STOP;
      const ms = moves(b, turn);
      if (!ms.length) return -WIN + ply;
      if (ply > 0) {
        if (quiet >= 50 || (endLeft !== null && endLeft <= 0)) return 0;
        const k = key(b, turn);
        // A position met again on this line can be repeated for ever: it is a draw.
        for (let i = path.length - 2; i >= 0; i -= 2) if (path[i] === k) return 0;
      }
      const forced = ms[0].caps.length > 0;
      if (depth <= 0 && (!forced || ext >= 12)) return evaluate(b, turn);
      const nextDepth = depth > 0 ? depth - 1 : 0;
      let best = -Infinity;
      path.push(key(b, turn));
      try {
        for (const m of order(b, ms)) {
          const nb = apply(b, m);
          const reset = m.caps.length > 0 || Math.abs(b[m.from]) === 1;
          const lim = endLimit(nb);
          const el = lim === null ? null : endLeft === null ? lim : Math.min(endLeft - 1, lim);
          const v = -search(nb, -turn, nextDepth, -beta, -alpha, ply + 1, reset ? 0 : quiet + 1, el, depth > 0 ? ext : ext + 1);
          if (v > best) best = v;
          if (v > alpha) alpha = v;
          if (alpha >= beta) break;
        }
      } finally { path.pop(); }
      return best;
    }
    // Scores every root move with a full window when the level picks among good moves, else searches
    // for the best one only.
    const histKeys = Object.keys(G.reps).filter(k => G.reps[k] >= 2);
    const rootScore = (m, depth, alpha, beta) => {
      const nb = apply(G.b, m);
      const reset = m.caps.length > 0 || Math.abs(G.b[m.from]) === 1;
      const lim = endLimit(nb);
      const el = lim === null ? null : G.endLeft === null ? lim : Math.min(G.endLeft - 1, lim);
      // A move that brings back a position seen twice already draws at once.
      if (!reset && histKeys.includes(key(nb, -G.turn))) return 0;
      if (!moves(nb, -G.turn).length) return WIN;
      path.length = 0; path.push(key(G.b, G.turn));
      return -search(nb, -G.turn, depth - 1, -beta, -alpha, 1, reset ? 0 : G.quiet + 1, el, 0);
    };
    let best = { move: order(G.b, root)[0], score: 0, depth: 0 }, scored = null;
    try {
      for (let depth = 1; depth <= maxDepth; depth++) {
        const list = order(G.b, root, best.move);
        if (opts.spread) {
          const all = list.map(m => ({ m, v: rootScore(m, depth, -Infinity, Infinity) }));
          all.sort((x, y) => y.v - x.v);
          scored = all;
          best = { move: all[0].m, score: all[0].v, depth };
        } else {
          let alpha = -Infinity, top = null;
          for (const m of list) {
            const v = rootScore(m, depth, alpha, Infinity);
            if (v > alpha) { alpha = v; top = m; }
          }
          best = { move: top, score: alpha, depth };
        }
        if (Math.abs(best.score) > WIN - 1000) break; // a forced win or loss is found
      }
    } catch (e) { if (e !== STOP) throw e; }
    // Facile: now and then, a weaker move, but never one that loses much more than the best one.
    if (opts.spread && scored && rnd() < (opts.chance ?? 0.35)) {
      const near = scored.filter(x => x.v >= scored[0].v - opts.spread && x.v > -WIN + 1000);
      if (near.length > 1) { const x = near[1 + Math.floor(rnd() * (near.length - 1))]; return { move: x.m, score: x.v, depth: best.depth }; }
    }
    return best;
  }

  // The capture routes of one piece, whether or not they take the most pieces.
  const capturesFrom = (b, n) => { const out = []; captures(b, n, out); return out; };

  const api = { WHITE, BLACK, RAY, LONG, rowOf, colOf, sqAt, startBoard, moves, capturesFrom, apply, key, endLimit, newGame, advance, think, evaluate };
  api.source = '(' + factory.toString() + ')(self);';
  root.Dames = api;

  // In a Web Worker: answer each request with the computer's move.
  if (typeof importScripts === 'function' && typeof root.postMessage === 'function') {
    root.onmessage = e => {
      const { id, G, opts } = e.data;
      root.postMessage({ id, best: think(G, opts) });
    };
  }
})(typeof self !== 'undefined' ? self : globalThis);
