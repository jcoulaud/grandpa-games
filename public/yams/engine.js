// Rules of the yams, the computer player and the hint. No DOM: the game page loads it with <script>,
// and the tests load it in Node.
//
// Two players, him (0) and the computer (1), each fill a sheet of 13 boxes, one box per turn. A turn
// has up to three throws of five dice; between throws the player keeps the dice he likes.
//
// A game G = { level, rng, turn, dice, kept, rolls, sheets, last, result }:
//   rng      the states of the random numbers, one per player: the same state always throws the same
//            dice. His throws and the computer's are apart, so an undo cannot show him his next dice.
//   turn     whose turn it is: 0 him, 1 the computer
//   dice     the five dice, 1 to 6, or null before the first throw of a turn
//   kept     five booleans: the dice kept for the next throw
//   rolls    the throws made this turn, 0 to 3
//   sheets   two arrays of 13 boxes: the points written, or null while the box is empty
//   last     the last box written: { player, box }, or null
//   result   null while the game goes on, then "won", "lost" or "tie" for him
//
//   Yams.newGame(level, seed)   -> a game, his turn, before the first throw
//   Yams.roll(G)                -> the game after a throw of the dice not kept
//   Yams.keep(G, i)             -> the game with die i kept, or put back
//   Yams.write(G, box)          -> the game after the player writes the dice in a box
//   Yams.points(box, dice)      -> what the dice score in a box
//   Yams.totals(sheet)          -> { top, bonus, bottom, total }
//   Yams.advice(G, how)         -> the best step: { kind: 'roll' } | { kind: 'keep', kept } | { kind: 'write', box }
//   Yams.computerTurn(G)        -> the steps of the computer's turn, the last one is the game after it
(function (root) {
  'use strict';

  const BOXES = ['as', 'deux', 'trois', 'quatre', 'cinq', 'six', 'brelan', 'carre', 'full', 'petite', 'grande', 'yams', 'chance'];
  const NAMES = ['As', 'Deux', 'Trois', 'Quatre', 'Cinq', 'Six', 'Brelan', 'Carré', 'Full', 'Petite suite', 'Grande suite', 'Yams', 'Chance'];
  const BONUS_AT = 63, BONUS = 35;
  const LEVELS = { facile: {}, moyen: {}, fort: {} };

  // Small, fast random numbers with a state of 32 bits (mulberry32).
  function next(s) {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return [s, ((t ^ (t >>> 14)) >>> 0) / 4294967296];
  }

  const counts = dice => { const c = [0, 0, 0, 0, 0, 0, 0]; for (const d of dice) c[d]++; return c; };
  const sum = dice => dice.reduce((a, b) => a + b, 0);
  // From counts: points of each box.
  function pointsOf(box, c) {
    if (box < 6) return (box + 1) * c[box + 1];
    const faces = [1, 2, 3, 4, 5, 6];
    const total = faces.reduce((a, f) => a + f * c[f], 0);
    const most = Math.max(...faces.map(f => c[f]));
    const run = n => { for (let a = 1; a + n - 1 <= 6; a++) { let ok = true; for (let f = a; f < a + n; f++) if (!c[f]) ok = false; if (ok) return true; } return false; };
    switch (BOXES[box]) {
      case 'brelan': { const f = faces.filter(f => c[f] >= 3).pop(); return f ? 3 * f : 0; }
      case 'carre': { const f = faces.filter(f => c[f] >= 4).pop(); return f ? 4 * f : 0; }
      case 'full': return faces.some(f => c[f] === 3) && faces.some(f => c[f] === 2) ? 25 : 0;
      case 'petite': return run(4) ? 30 : 0;
      case 'grande': return run(5) ? 40 : 0;
      case 'yams': return most === 5 ? 50 : 0;
      case 'chance': return total;
    }
    return 0;
  }
  const points = (box, dice) => pointsOf(box, counts(dice));

  function totals(sheet) {
    let top = 0, bottom = 0;
    sheet.forEach((v, b) => { if (v !== null) { if (b < 6) top += v; else bottom += v; } });
    const bonus = top >= BONUS_AT ? BONUS : 0;
    return { top, bonus, bottom, total: top + bonus + bottom };
  }
  // The bonus can still be reached: the empty top boxes, each with five dice, could make up the rest.
  const bonusOpen = sheet => {
    const t = totals(sheet).top;
    if (t >= BONUS_AT) return false;
    return t + sheet.slice(0, 6).reduce((a, v, b) => a + (v === null ? 5 * (b + 1) : 0), 0) >= BONUS_AT;
  };

  function newGame(level, seed) {
    return { level, rng: [seed >>> 0, Math.imul(seed ^ 0x5BD1E995, 0x27D4EB2F) >>> 0], turn: 0, dice: null, kept: [false, false, false, false, false], rolls: 0,
      sheets: [Array(13).fill(null), Array(13).fill(null)], last: null, result: null };
  }
  function roll(G) {
    if (G.result || G.rolls >= 3) return G;
    let s = G.rng[G.turn];
    const first = !G.dice;
    const dice = first ? [0, 0, 0, 0, 0] : G.dice.slice();
    const kept = first ? [false, false, false, false, false] : G.kept;
    for (let i = 0; i < 5; i++) if (!kept[i]) { let r; [s, r] = next(s); dice[i] = 1 + Math.floor(r * 6); }
    const rng = G.rng.slice(); rng[G.turn] = s;
    return { ...G, rng, dice, kept: kept.slice(), rolls: G.rolls + 1 };
  }
  function keep(G, i) {
    if (!G.dice || G.rolls >= 3) return G;
    const kept = G.kept.slice(); kept[i] = !kept[i];
    return { ...G, kept };
  }
  function write(G, box) {
    if (!G.dice || G.sheets[G.turn][box] !== null) return G;
    const sheets = G.sheets.map(s => s.slice());
    sheets[G.turn][box] = points(box, G.dice);
    const done = sheets.every(s => s.every(v => v !== null));
    let result = null;
    if (done) {
      const a = totals(sheets[0]).total, b = totals(sheets[1]).total;
      result = a > b ? 'won' : a < b ? 'lost' : 'tie';
    }
    return { ...G, sheets, turn: 1 - G.turn, dice: null, kept: [false, false, false, false, false], rolls: 0,
      last: { player: G.turn, box }, result };
  }

  /* ---------- The dice as multisets ----------
     The order of the dice does not matter to the score: the planner works on counts. A multiset of up
     to five dice has a key, its counts in base 6. ALL: the 252 hands of five dice. KEEPS: every multiset
     of 0 to 5 dice, with the hands a throw of the other dice gives and their probabilities. */
  const keyOf = c => { let k = 0; for (let f = 6; f >= 1; f--) k = k * 6 + c[f]; return k; };
  function multisets(n) {
    const out = [];
    const walk = (f, left, c) => {
      if (f === 6) { c[6] = left; out.push(c.slice()); return; }
      for (let k = left; k >= 0; k--) { c[f] = k; walk(f + 1, left - k, c); }
    };
    walk(1, n, [0, 0, 0, 0, 0, 0, 0]);
    return out;
  }
  const FACT = [1, 1, 2, 6, 24, 120];
  const ALL = multisets(5), INDEX = new Map(ALL.map((c, i) => [keyOf(c), i]));
  const KEEPS = new Map();
  for (let k = 0; k <= 5; k++) for (const kc of multisets(k)) {
    const n = 5 - k, outs = [];
    for (const m of multisets(n)) {
      let p = FACT[n] / 6 ** n;
      for (let f = 1; f <= 6; f++) p /= FACT[m[f]];
      const c = kc.map((x, f) => x + m[f]);
      outs.push([INDEX.get(keyOf(c)), p]);
    }
    KEEPS.set(keyOf(kc), { c: kc, outs });
  }
  // The multisets a hand can keep.
  const SUBS = ALL.map(c => {
    const out = [];
    const walk = (f, s) => {
      if (f === 7) { out.push(keyOf(s)); return; }
      for (let k = 0; k <= c[f]; k++) { s[f] = k; walk(f + 1, s); }
    };
    walk(1, [0, 0, 0, 0, 0, 0, 0]);
    return out;
  });

  /* ---------- What a box is worth ----------
     Writing points in a box also gives up what the box would have made later. COST: about what each
     box makes when a player aims at it. A top box also counts for the bonus: points above three dice
     of its face bring the bonus closer, points under it push it away. */
  const COST = [2, 5, 8, 11, 14, 17, 9, 6, 15, 18, 15, 12, 21];
  function boxValue(box, c, sheet, careful) {
    const p = pointsOf(box, c);
    // The Yams is rare: late in the game, there are few turns left to make one.
    const cost = box === 11 ? Math.min(COST[11], 2.5 * (open(sheet).length - 1)) : COST[box];
    let v = p - (careful ? cost : cost * .5);
    if (careful && box < 6 && bonusOpen(sheet)) {
      const after = sheet.slice(); after[box] = p;
      // Reaching the bonus gains what it was not yet sure to bring.
      if (totals(after).top >= BONUS_AT) v += BONUS * (1 - bonusChance(sheet));
      // A box that makes the bonus impossible gives up what it was likely to bring.
      else if (!bonusOpen(after)) v -= BONUS * bonusChance(sheet);
      // Otherwise, points above three dice of the face bring the bonus closer, points under it push it away.
      else v += 2 * (p - 3 * (box + 1));
    }
    return v;
  }
  // AIM[k]: the chance of at least k dice of one face after three throws that keep that face.
  const AIM = (() => {
    const C = (n, k) => { let r = 1; for (let i = 0; i < k; i++) r = r * (n - i) / (i + 1); return r; };
    let dist = [1, 0, 0, 0, 0, 0];
    for (let t = 0; t < 3; t++) {
      const nd = [0, 0, 0, 0, 0, 0];
      dist.forEach((p, c) => { const n = 5 - c; for (let h = 0; h <= n; h++) nd[c + h] += p * C(n, h) * (1 / 6) ** h * (5 / 6) ** (n - h); });
      dist = nd;
    }
    return dist.map((_, k) => dist.slice(k).reduce((a, b) => a + b, 0));
  })();
  // How likely the bonus still is. With one top box left, exactly: the dice of its face it needs.
  // With more, about: the points missing against what the empty top boxes make with three dice each.
  function bonusChance(sheet) {
    const missing = BONUS_AT - totals(sheet).top, left = open(sheet).filter(b => b < 6);
    if (missing <= 0) return 1;
    if (!left.length) return 0;
    if (left.length === 1) { const k = Math.ceil(missing / (left[0] + 1)); return k > 5 ? 0 : AIM[k]; }
    const par = left.reduce((a, b) => a + 3 * (b + 1), 0);
    return Math.max(.1, Math.min(.95, .5 + (par - missing) / 20));
  }
  const open = sheet => sheet.map((v, b) => v === null ? b : -1).filter(b => b >= 0);
  function bestBox(c, sheet, careful) {
    let best = -1, bv = -Infinity;
    for (const b of open(sheet)) { const v = boxValue(b, c, sheet, careful); if (v > bv) { bv = v; best = b; } }
    return [best, bv];
  }

  // The planner: for each hand with r throws left (1 or 2), the multiset to keep and what it is worth.
  // worth(c): what a hand is worth once written.
  function plan(worth, r) {
    const V0 = ALL.map(worth);
    const expect = V => { const E = new Map(); for (const [k, { outs }] of KEEPS) { let e = 0; for (const [i, p] of outs) e += p * V[i]; E.set(k, e); } return E; };
    const best = E => ALL.map((c, i) => { let bk = 0, bv = -Infinity; for (const k of SUBS[i]) { const v = E.get(k); if (v > bv) { bv = v; bk = k; } } return [bk, bv]; });
    const B1 = best(expect(V0));
    return r === 1 ? B1 : best(expect(B1.map(x => x[1])));
  }
  // Turns a multiset to keep into five booleans, keeping the dice already kept first, so no die jumps.
  function keptFor(dice, kept, k) {
    const want = KEEPS.get(k).c.slice(), out = [false, false, false, false, false];
    for (const pass of [true, false]) dice.forEach((d, i) => { if (!out[i] && kept[i] === pass && want[d] > 0) { want[d]--; out[i] = true; } });
    return out;
  }

  // The best step for the player whose turn it is. how: 'fort' (the hint and the Difficile player),
  // 'moyen' (looks one throw ahead, ignores the bonus) or 'facile' (simple rules, some chance).
  function advice(G, how = 'fort', random = Math.random) {
    if (G.result) return null;
    if (!G.dice) return { kind: 'roll' };
    const sheet = G.sheets[G.turn], c = counts(G.dice), left = 3 - G.rolls;
    if (how === 'facile') return easy(G, sheet, c, left, random);
    const careful = how === 'fort';
    // Difficile's last box, with the other sheet full: it plays to win the game, not for points. A win
    // is worth 1, a tie 0.5; the points only break ties between two equal chances.
    const other = G.sheets[1 - G.turn], last = open(sheet);
    let worth = h => bestBox(h, sheet, careful)[1];
    if (careful && last.length === 1 && other.every(v => v !== null)) {
      const need = totals(other).total;
      worth = h => { const after = sheet.slice(); after[last[0]] = pointsOf(last[0], h); const t = totals(after).total;
        return (t > need ? 1 : t === need ? .5 : 0) + t / 1e4; };
    }
    if (left > 0) {
      const [k] = plan(worth, how === 'fort' ? left : 1)[INDEX.get(keyOf(c))];
      if (k !== keyOf(c)) return { kind: 'keep', kept: keptFor(G.dice, G.kept, k) };
    }
    return { kind: 'write', box: bestBox(c, sheet, careful)[0] };
  }
  // Facile: keeps the face it has most of (the higher one on a tie), or four dice in a row. It writes
  // in the box that scores most now, and one time in four in another box that scores.
  function easy(G, sheet, c, left, random) {
    const boxes = open(sheet);
    const score = b => pointsOf(b, c);
    if (left > 0) {
      const good = boxes.filter(b => b >= 8 && b <= 11 && score(b) > 0);
      if (!good.length) {
        let f = 6;
        for (let x = 6; x >= 1; x--) if (c[x] > c[f]) f = x;
        const kept = G.dice.map(d => d === f);
        const runFaces = [[1, 2, 3, 4], [2, 3, 4, 5], [3, 4, 5, 6]].find(r => r.every(x => c[x]));
        if (runFaces && c[f] < 3 && (boxes.includes(9) || boxes.includes(10))) {
          const seen = new Set();
          return { kind: 'keep', kept: G.dice.map(d => runFaces.includes(d) && !seen.has(d) ? (seen.add(d), true) : false) };
        }
        if (kept.some(k => !k)) return { kind: 'keep', kept };
      }
    }
    const scored = boxes.filter(b => score(b) > 0).sort((a, b) => score(b) - score(a));
    if (!scored.length) return { kind: 'write', box: boxes.slice().sort((a, b) => COST[a] - COST[b])[0] };
    const box = scored.length > 1 && random() < .25 ? scored[1 + Math.floor(random() * (scored.length - 1))] : scored[0];
    return { kind: 'write', box };
  }

  // The computer's whole turn, in steps the page shows one by one: each step is a game, with what
  // happened: { G, did: 'roll' | 'keep' | 'write', box }. Facile's chance comes from the game's own
  // random numbers, so the same game always gets the same turn.
  function computerTurn(G) {
    const steps = [];
    let g = G, s = G.rng[1] ^ 0x9E3779B9;
    const random = () => { let r; [s, r] = next(s); return r; };
    for (let guard = 0; guard < 8 && g.turn === 1 && !g.result; guard++) {
      const a = advice(g, g.level, random);
      if (a.kind === 'roll') { g = roll(g); steps.push({ G: g, did: 'roll' }); }
      else if (a.kind === 'keep') {
        g = { ...g, kept: a.kept };
        steps.push({ G: g, did: 'keep' });
        g = roll(g); steps.push({ G: g, did: 'roll' });
      } else { g = write(g, a.box); steps.push({ G: g, did: 'write', box: a.box }); }
    }
    return steps;
  }

  root.Yams = { BOXES, NAMES, BONUS_AT, BONUS, LEVELS, newGame, roll, keep, write, points, totals, bonusOpen, advice, computerTurn, counts };
})(typeof self !== 'undefined' ? self : globalThis);
