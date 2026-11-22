// The FreeCell solver: it deals only games it has won, gives the hints and sees a lost game.
// A position is { c: the 8 columns, l: the cards in the free cells (sorted), f: cards home per suit }.
// The search is best-first: it always grows the position that looks closest to the end.
function createSolver() {
'use strict';
const rk = id => id % 13 + 1, st = id => (id / 13) | 0, rd = id => st(id) === 1 || st(id) === 2;
const last = a => a[a.length - 1];
function sClone(x) { return { c: x.c.map(c => c.slice()), l: x.l.slice(), f: x.f.slice() }; }
function sFits(id, onto) { return rd(id) !== rd(onto) && rk(onto) === rk(id) + 1; }
function sCanF(x, id) { return x.f[st(id)] === rk(id) - 1; }
// A card is safe to send home when no card that could still need it is left out.
function sSafe(x, id) {
  const r = rk(id); if (r <= 2) return true;
  const o = rd(id) ? [0, 3] : [1, 2];
  return x.f[o[0]] >= r - 1 && x.f[o[1]] >= r - 1;
}
// How many cards move at once: one per free cell plus one, doubled by each empty column.
function sCap(x, toEmpty) {
  const empty = x.c.filter(c => !c.length).length - (toEmpty ? 1 : 0);
  return (5 - x.l.length) * 2 ** Math.max(0, empty);
}
// Length of the ordered run on top of a column.
function sRun(c) {
  let n = c.length ? 1 : 0;
  while (n < c.length && sFits(c[c.length - n], c[c.length - n - 1])) n++;
  return n;
}
function sNormalize(x, log) {
  for (let moved = true; moved;) {
    moved = false;
    for (let i = 0; i < 8; i++) {
      const id = last(x.c[i]);
      if (id !== undefined && sCanF(x, id) && sSafe(x, id)) { x.c[i].pop(); x.f[st(id)]++; log.push({ k: 'cf', src: i, id }); moved = true; }
    }
    for (let j = 0; j < x.l.length; j++) {
      const id = x.l[j];
      if (sCanF(x, id) && sSafe(x, id)) { x.l.splice(j--, 1); x.f[st(id)]++; log.push({ k: 'lf', id }); moved = true; }
    }
  }
}
function sMoves(x) {
  const out = [];
  const firstEmpty = x.c.findIndex(c => !c.length);
  for (let i = 0; i < 8; i++) { const id = last(x.c[i]); if (id !== undefined && sCanF(x, id)) out.push({ k: 'cf', src: i, id }); }
  for (const id of x.l) if (sCanF(x, id)) out.push({ k: 'lf', id });
  for (const id of x.l) {
    for (let j = 0; j < 8; j++) { const t = last(x.c[j]); if (t !== undefined && sFits(id, t)) out.push({ k: 'lc', id, dst: j }); }
    if (firstEmpty >= 0) out.push({ k: 'lc', id, dst: firstEmpty });
  }
  const capFull = sCap(x, false), capEmpty = sCap(x, true);
  for (let i = 0; i < 8; i++) {
    const c = x.c[i]; if (!c.length) continue;
    const run = sRun(c);
    for (let j = 0; j < 8; j++) {
      if (j === i || !x.c[j].length) continue;
      const t = last(x.c[j]);
      for (let m = 1; m <= Math.min(run, capFull); m++) {
        const id = c[c.length - m];
        if (sFits(id, t)) { out.push({ k: 'cc', src: i, n: c.length - m, dst: j, id }); break; }
      }
    }
    if (firstEmpty >= 0) {
      const m = Math.min(run, capEmpty);
      if (m < c.length) out.push({ k: 'cc', src: i, n: c.length - m, dst: firstEmpty, id: c[c.length - m] });
      if (m > 1 && 1 < c.length) out.push({ k: 'cc', src: i, n: c.length - 1, dst: firstEmpty, id: last(c) });
    }
    if (x.l.length < 4) out.push({ k: 'cl', src: i, id: last(c) });
  }
  return out;
}
function sApply(x, m) {
  const y = sClone(x);
  if (m.k === 'cf') { y.c[m.src].pop(); y.f[st(m.id)]++; }
  else if (m.k === 'lf') { y.l.splice(y.l.indexOf(m.id), 1); y.f[st(m.id)]++; }
  else if (m.k === 'lc') { y.l.splice(y.l.indexOf(m.id), 1); y.c[m.dst].push(m.id); }
  else if (m.k === 'cc') { y.c[m.dst].push(...y.c[m.src].splice(m.n)); }
  else { y.c[m.src].pop(); y.l.push(m.id); y.l.sort((a, b) => a - b); }
  return y;
}
const sKey = x => x.c.map(c => c.join(',')).sort().join('|') + '#' + x.l.join(',');
// Distance to the end: cards still out, cards in the free cells, and cards that sit on a card
// they do not continue, weighted by how deep the next cards of the foundations are buried.
function sScore(x) {
  let h = 4 * (52 - x.f[0] - x.f[1] - x.f[2] - x.f[3]) + 2 * x.l.length;
  for (const c of x.c) {
    for (let k = 1; k < c.length; k++) if (!sFits(c[k], c[k - 1])) h += 3;
    for (let k = 0; k < c.length; k++) if (sCanF(x, c[k])) h += 2 * (c.length - 1 - k);
  }
  return h;
}
// Returns { win: true, path } | { win: false } | { unknown: true }
function solve(x0, budget) {
  const x = sClone(x0), pre = [];
  sNormalize(x, pre);
  const won = y => y.f.every(n => n === 13);
  if (won(x)) return { win: true, nodes: 0, path: pre };
  // A binary heap of [score, node]. A node keeps its parent and the moves that led to it.
  const heap = [], push = (s, n) => {
    heap.push([s, n]);
    for (let i = heap.length - 1; i > 0;) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; }
  }, pop = () => {
    const top = heap[0], end = heap.pop();
    if (heap.length) {
      heap[0] = end;
      for (let i = 0; ;) {
        const a = 2 * i + 1, b = a + 1; let m = i;
        if (a < heap.length && heap[a][0] < heap[m][0]) m = a;
        if (b < heap.length && heap[b][0] < heap[m][0]) m = b;
        if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m;
      }
    }
    return top[1];
  };
  const seen = new Set([sKey(x)]);
  push(sScore(x), { x, up: null, log: [], d: 0 });
  let nodes = 0;
  while (heap.length) {
    const node = pop();
    if (++nodes > budget || seen.size >= 400000) return { unknown: true };
    for (const m of sMoves(node.x)) {
      const y = sApply(node.x, m), log = [m];
      sNormalize(y, log);
      const k = sKey(y);
      if (seen.has(k)) continue;
      seen.add(k);
      const child = { x: y, up: node, log, d: node.d + 1 };
      if (won(y)) {
        const path = [];
        for (let n = child; n; n = n.up) path.unshift(...n.log);
        return { win: true, nodes, path: pre.concat(path) };
      }
      push(sScore(y) + child.d * 0.5, child);
    }
  }
  return { win: false };
}
return { solve, sApply, sMoves, sNormalize, sFits, sSafe, sRun };
}
globalThis.Solver = createSolver();
