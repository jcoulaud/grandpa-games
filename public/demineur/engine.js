// Rules of the démineur, the board maker and the hint. No DOM: the game page loads it with <script>,
// and the tests load it in Node.
//
// A board is w by h squares, numbered 0 to w * h - 1 in reading order: square i is on row
// floor(i / w), column i % w. A game G = { level, w, h, mines, seed, first, layout, cells, boom, result }:
//   mines    how many mines the board holds
//   seed     the random number of this game: with the first square, it gives the board
//   first    the first square opened, or -1 before the first click
//   layout   the squares of the mines, sorted, or null before the first click
//   cells    one letter per square: "." closed, "o" open, "f" flag
//   boom     the mine that went off, or -1
//   result   null while the game goes on, "won" or "lost"
//
// Every board can be cleared without a guess. The first square and its neighbours hold no mine, and
// the board is kept only if the hint's own reasoning, from that first square, clears it:
//   one number   a number that touches as many flags as its value: its other closed squares are safe;
//                one whose closed squares are as many as its mines left: they are all mines;
//   two numbers  (Moyen and Difficile) when the closed squares of one number are all around another,
//                the squares the second has in addition hold the difference of their mines left;
//   the count    with every mine found, the closed squares are safe; with as many closed squares as
//                mines left, they are all mines.
//
//   Demineur.newGame(level, seed)   -> a game before the first click
//   Demineur.open(G, i)             -> the game after a click on closed square i (the first one makes the board)
//   Demineur.openAround(G, i)       -> the game after a click on open number i that touches as many flags as its value
//   Demineur.flag(G, i)             -> the game with a flag put on, or taken off, closed square i
//   Demineur.number(G, i)           -> the mines around square i
//   Demineur.hint(G)                -> the next step, see hint() below
(function (root) {
  'use strict';
  const LEVELS = {
    facile: { w: 9, h: 9, mines: 10, pairs: false },
    moyen: { w: 14, h: 10, mines: 22, pairs: true },
    fort: { w: 20, h: 10, mines: 36, pairs: true },
  };
  const TRIES = 2000;

  // A small seeded random generator (mulberry32): the same seed gives the same board.
  function random(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = Math.imul(a ^ (a >>> 15), a | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // The neighbours of each square, in reading order, kept for each size of board.
  const cache = {};
  function neighbours(w, h) {
    const key = w + 'x' + h;
    if (cache[key]) return cache[key];
    const all = [];
    for (let i = 0; i < w * h; i++) {
      const r = Math.floor(i / w), c = i % w, out = [];
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
        const rr = r + dr, cc = c + dc;
        if ((dr || dc) && rr >= 0 && rr < h && cc >= 0 && cc < w) out.push(rr * w + cc);
      }
      all.push(out);
    }
    return (cache[key] = all);
  }

  /* ---------- The reasoning ----------
     K holds what is known of each square: a number (0 to 8) for an open square, MINE for a known
     mine, and UNKNOWN otherwise. step() returns the first thing that follows, in a fixed order
     (safe squares before mines, one number before two, then the count), or null:
     { kind: 'safe' | 'mine', cells, rule: 'one' | 'two' | 'count', a, b, left }
     a is the number used, b the second number of a "two" step, left the mines left in the count. */
  const UNKNOWN = -1, MINE = -2;
  function step(K, w, h, total, pairs) {
    const nb = neighbours(w, h);
    const front = [];
    for (let i = 0; i < K.length; i++) {
      if (K[i] < 1) continue;
      const closed = [];
      let found = 0;
      for (const j of nb[i]) { if (K[j] === UNKNOWN) closed.push(j); else if (K[j] === MINE) found++; }
      if (closed.length) front.push({ i, closed, left: K[i] - found });
    }
    for (const f of front) if (f.left === 0) return { kind: 'safe', cells: f.closed, rule: 'one', a: f.i };
    for (const f of front) if (f.left === f.closed.length) return { kind: 'mine', cells: f.closed, rule: 'one', a: f.i };
    if (pairs) {
      // a's closed squares all touch b too: b's other closed squares hold b.left - a.left mines.
      let mine = null;
      for (const a of front) for (const b of front) {
        if (a === b || b.closed.length <= a.closed.length || !a.closed.every(j => b.closed.includes(j))) continue;
        const extra = b.closed.filter(j => !a.closed.includes(j)), d = b.left - a.left;
        if (d === 0) return { kind: 'safe', cells: extra, rule: 'two', a: a.i, b: b.i };
        if (d === extra.length && !mine) mine = { kind: 'mine', cells: extra, rule: 'two', a: a.i, b: b.i };
      }
      if (mine) return mine;
    }
    let closed = [], found = 0;
    for (let i = 0; i < K.length; i++) { if (K[i] === UNKNOWN) closed.push(i); else if (K[i] === MINE) found++; }
    const left = total - found;
    if (closed.length && left === 0) return { kind: 'safe', cells: closed, rule: 'count', left };
    if (closed.length && left === closed.length) return { kind: 'mine', cells: closed, rule: 'count', left };
    return null;
  }

  // Opens square i in K, and the squares around each 0 it reaches. Returns how many it opened.
  function reveal(K, i, nums, nb) {
    const todo = [i];
    let n = 0;
    while (todo.length) {
      const j = todo.pop();
      if (K[j] !== UNKNOWN) continue;
      K[j] = nums[j]; n++;
      if (nums[j] === 0) for (const k of nb[j]) if (K[k] === UNKNOWN) todo.push(k);
    }
    return n;
  }
  function numbers(w, h, layout) {
    const nb = neighbours(w, h), mine = new Uint8Array(w * h), nums = new Int8Array(w * h);
    for (const m of layout) mine[m] = 1;
    for (let i = 0; i < w * h; i++) {
      if (mine[i]) { nums[i] = MINE; continue; }
      let n = 0;
      for (const j of nb[i]) n += mine[j];
      nums[i] = n;
    }
    return nums;
  }

  // True if the reasoning clears the board from the first square.
  function clears(level, layout, first) {
    const { w, h, mines, pairs } = LEVELS[level];
    const nb = neighbours(w, h), nums = numbers(w, h, layout);
    const K = new Array(w * h).fill(UNKNOWN);
    let open = reveal(K, first, nums, nb);
    for (;;) {
      if (open === w * h - mines) return true;
      const s = step(K, w, h, mines, pairs);
      if (!s) return false;
      for (const j of s.cells) {
        if (s.kind === 'mine') K[j] = MINE;
        else open += reveal(K, j, nums, nb);
      }
    }
  }

  // The mines of a board that the reasoning clears from the first square, the same for the same seed
  // and first square. After TRIES boards, the last one is kept: it still opens safely.
  function makeLayout(level, seed, first) {
    const { w, h, mines } = LEVELS[level];
    const nb = neighbours(w, h);
    const rnd = random((seed ^ Math.imul(first + 1, 0x9E3779B1)) >>> 0);
    const safe = new Set([first, ...nb[first]]);
    const spots = [];
    for (let i = 0; i < w * h; i++) if (!safe.has(i)) spots.push(i);
    let layout = null;
    for (let t = 0; t < TRIES; t++) {
      // The first squares of a shuffle of the free spots.
      const s = spots.slice();
      for (let k = 0; k < mines; k++) { const j = k + Math.floor(rnd() * (s.length - k)); [s[k], s[j]] = [s[j], s[k]]; }
      layout = s.slice(0, mines).sort((a, b) => a - b);
      if (clears(level, layout, first)) return layout;
    }
    return layout;
  }

  /* ---------- The game ---------- */
  function newGame(level, seed) {
    const { w, h, mines } = LEVELS[level];
    return { level, w, h, mines, seed: seed >>> 0, first: -1, layout: null, cells: '.'.repeat(w * h), boom: -1, result: null };
  }
  const isMine = (G, i) => !!G.layout && G.layout.includes(i);
  const number = (G, i) => neighbours(G.w, G.h)[i].reduce((n, j) => n + (isMine(G, j) ? 1 : 0), 0);

  // Opens the squares of `list` (closed, without a flag), each 0 opening its neighbours.
  // A mine ends the game: the first one in reading order is the one that goes off.
  function openSquares(G, list) {
    const nb = neighbours(G.w, G.h), nums = numbers(G.w, G.h, G.layout);
    const cells = G.cells.split('');
    const hit = list.filter(i => cells[i] === '.' && nums[i] === MINE).sort((a, b) => a - b)[0];
    if (hit !== undefined) return { ...G, boom: hit, result: 'lost' };
    const todo = list.filter(i => cells[i] === '.');
    while (todo.length) {
      const j = todo.pop();
      if (cells[j] !== '.') continue;
      cells[j] = 'o';
      if (nums[j] === 0) for (const k of nb[j]) if (cells[k] === '.') todo.push(k);
    }
    return finish({ ...G, cells: cells.join('') });
  }
  // Every safe square open: won, and the mines left get their flags.
  function finish(G) {
    let open = 0;
    for (const c of G.cells) if (c === 'o') open++;
    if (open < G.w * G.h - G.mines) return G;
    return { ...G, cells: G.cells.replace(/\./g, 'f'), result: 'won' };
  }
  function open(G, i) {
    if (G.result || G.cells[i] !== '.') return G;
    if (G.first < 0) G = { ...G, first: i, layout: makeLayout(G.level, G.seed, i) };
    return openSquares(G, [i]);
  }
  function openAround(G, i) {
    if (G.result || G.cells[i] !== 'o') return G;
    return openSquares(G, neighbours(G.w, G.h)[i].filter(j => G.cells[j] === '.'));
  }
  function flag(G, i) {
    if (G.result || G.cells[i] === 'o') return G;
    const cells = G.cells.split('');
    cells[i] = cells[i] === 'f' ? '.' : 'f';
    return { ...G, cells: cells.join('') };
  }
  const flags = G => G.cells.split('').filter(c => c === 'f').length;

  /* ---------- The hint ----------
     What to do next, from what he sees: the open numbers and his flags.
     { kind: 'start' }                      before the first click
     { kind: 'wrong', cell }                a flag with no mine under it, the first in reading order
     { kind: 'safe' | 'mine', cell, ... }   a step of the reasoning (see step()): cell is the first square
                                            of its cells that he has not dealt with yet.
     A board made after TRIES failed boards can need a guess: the hint then shows a safe square
     ({ kind: 'safe', rule: 'peek' }). */
  function hint(G) {
    if (G.result) return null;
    if (G.first < 0) return { kind: 'start' };
    for (let i = 0; i < G.cells.length; i++) if (G.cells[i] === 'f' && !isMine(G, i)) return { kind: 'wrong', cell: i };
    const { pairs } = LEVELS[G.level];
    const nums = numbers(G.w, G.h, G.layout);
    const K = G.cells.split('').map((c, i) => c === 'o' ? nums[i] : c === 'f' ? MINE : UNKNOWN);
    const s = step(K, G.w, G.h, G.mines, pairs);
    if (s) return { ...s, cell: s.cells[0] };
    const cell = G.cells.split('').findIndex((c, i) => c === '.' && nums[i] !== MINE);
    return cell < 0 ? null : { kind: 'safe', cells: [cell], cell, rule: 'peek' };
  }

  root.Demineur = { LEVELS, TRIES, random, neighbours, newGame, open, openAround, flag, flags, number, isMine, hint, makeLayout, clears, step };
})(typeof self !== 'undefined' ? self : globalThis);
