function createSolver() {
'use strict';
const rk = id => id % 13 + 1, st = id => (id / 13) | 0, rd = id => st(id) === 1 || st(id) === 2;
const last = a => a[a.length - 1];

/* ---------- Solver ----------
   Draw-one Klondike with unlimited redeals: every stock/waste card can be reached
   by turning the deck, so the solver treats them as one "talon" set. */
function sClone(x) { return { cols: x.cols.map(c => ({ d: c.d.slice(), u: c.u.slice() })), f: x.f.slice(), t: x.t.slice() }; }
function sFlip(c) { if (!c.u.length && c.d.length) c.u.push(c.d.pop()); }
function sFits(id, onto) { return rd(id) !== rd(onto) && rk(onto) === rk(id) + 1; }
function sCanF(x, id) { return x.f[st(id)] === rk(id) - 1; }
// A card is safe to send home when no card that could still need it is left out.
function sSafe(x, id) {
  const r = rk(id); if (r <= 2) return true;
  const o = rd(id) ? [0, 3] : [1, 2];
  return x.f[o[0]] >= r - 1 && x.f[o[1]] >= r - 1;
}
function sNormalize(x, log) {
  for (let moved = true; moved;) {
    moved = false;
    for (let i = 0; i < 7; i++) {
      const c = x.cols[i], id = last(c.u);
      if (id !== undefined && sCanF(x, id) && sSafe(x, id)) { c.u.pop(); sFlip(c); x.f[st(id)]++; log.push({ k: 'tf', src: i, id }); moved = true; }
    }
    for (let j = 0; j < x.t.length; j++) {
      const id = x.t[j];
      if (sCanF(x, id) && sSafe(x, id)) { x.t.splice(j--, 1); x.f[st(id)]++; log.push({ k: 'xf', id }); moved = true; }
    }
  }
}
function sMoves(x) {
  const home = [], tt = [], xt = [];
  for (let i = 0; i < 7; i++) { const id = last(x.cols[i].u); if (id !== undefined && sCanF(x, id)) home.push({ k: 'tf', src: i, id }); }
  for (const id of x.t) if (sCanF(x, id)) home.push({ k: 'xf', id });
  for (let i = 0; i < 7; i++) {
    const c = x.cols[i];
    for (let n = 0; n < c.u.length; n++) {
      const id = c.u[n];
      let pri;
      if (n > 0) { const under = c.u[n - 1]; if (!sCanF(x, under)) continue; pri = 100; } // frees a card for home
      else if (c.d.length) pri = 10 + c.d.length;                                         // turns a card over
      else if (rk(id) === 13) continue;                                                    // king already at the bottom
      else pri = 0;                                                                        // empties a column
      let emptyDone = false;
      for (let j = 0; j < 7; j++) {
        if (j === i) continue;
        const top = last(x.cols[j].u);
        if (top === undefined) { if (rk(id) === 13 && !emptyDone) { emptyDone = true; tt.push({ k: 'tt', src: i, n, dst: j, id, pri }); } }
        else if (sFits(id, top)) tt.push({ k: 'tt', src: i, n, dst: j, id, pri });
      }
    }
  }
  for (const id of x.t) {
    let emptyDone = false;
    for (let j = 0; j < 7; j++) {
      const top = last(x.cols[j].u);
      if (top === undefined) { if (rk(id) === 13 && !emptyDone) { emptyDone = true; xt.push({ k: 'xt', id, dst: j }); } }
      else if (sFits(id, top)) xt.push({ k: 'xt', id, dst: j });
    }
  }
  // A foundation card may come back down to hold a card. Safe cards would go straight back.
  const ft = [];
  for (let s = 0; s < 4; s++) {
    if (x.f[s] < 2) continue;
    const id = s * 13 + x.f[s] - 1;
    if (sSafe(x, id)) continue;
    let emptyDone = false;
    for (let j = 0; j < 7; j++) {
      const top = last(x.cols[j].u);
      if (top === undefined) { if (rk(id) === 13 && !emptyDone) { emptyDone = true; ft.push({ k: 'ft', id, dst: j }); } }
      else if (sFits(id, top)) ft.push({ k: 'ft', id, dst: j });
    }
  }
  tt.sort((a, b) => b.pri - a.pri);
  return home.concat(tt.filter(m => m.pri > 0), xt, tt.filter(m => m.pri === 0), ft);
}
function sApply(x, m) {
  const y = sClone(x);
  if (m.k === 'tf') { const c = y.cols[m.src]; c.u.pop(); sFlip(c); y.f[st(m.id)]++; }
  else if (m.k === 'xf') { y.t.splice(y.t.indexOf(m.id), 1); y.f[st(m.id)]++; }
  else if (m.k === 'tt') { const c = y.cols[m.src]; y.cols[m.dst].u.push(...c.u.splice(m.n)); sFlip(c); }
  else if (m.k === 'ft') { y.f[st(m.id)]--; y.cols[m.dst].u.push(m.id); }
  else { y.t.splice(y.t.indexOf(m.id), 1); y.cols[m.dst].u.push(m.id); }
  return y;
}
function sKey(x) {
  return x.cols.map(c => c.d.length + '.' + (c.d[0] ?? '') + ':' + c.u.join(',')).sort().join('|')
    + '#' + x.t.slice().sort((a, b) => a - b).join(',');
}
// Returns { win: true, path } | { win: false } | { unknown: true }
function solve(x0, budget) {
  const seen = new Set(), path = [];
  let nodes = 0;
  const x = sClone(x0), pre = [];
  sNormalize(x, pre);
  const dfs = x => {
    if (x.f.every(n => n === 13)) return true;
    if (++nodes > budget || seen.size >= 400000) throw 'budget';
    const k = sKey(x);
    if (seen.has(k)) return false;
    seen.add(k);
    for (const m of sMoves(x)) {
      const y = sApply(x, m), log = [m];
      sNormalize(y, log);
      path.push(...log);
      if (dfs(y)) return true;
      path.length -= log.length;
    }
    return false;
  };
  try { return dfs(x) ? { win: true, nodes, path: pre.concat(path) } : { win: false }; }
  catch (e) { if (e === 'budget') return { unknown: true }; throw e; }
}
return { solve, sApply, sNormalize, sFits, sSafe, sMoves };
}
globalThis.Solver = createSolver();
