// The code secret: the rules, the clues and the solver of the hint. No DOM, so the page and the tests run the same code.
//
// The computer hides a code of coloured pegs. He proposes a combination per row and gets a clue for it:
// how many pegs have the right colour in the right place (« bien placées »), and how many more have a colour
// of the code in another place (« mal placées »).
//
// A game G: { level, holes, colors, rows: the most rows he may try, code: [colour per hole],
//   tries: [{ guess: [colour per hole], black, white }], cur: [colour or -1 per hole] (the row being filled),
//   order: [the holes of cur in the order they were filled, for undo], result: '' | 'won' | 'lost' }.
// A colour is a number from 0 to colors - 1 (see COLORS).
(function (root) {
  'use strict';
  // Each colour has a name and a symbol painted on the peg, so it never depends on colour alone.
  // `ink` is the colour of the symbol: white on the dark pegs, dark on the light ones.
  const COLORS = [
    { id: 'rouge', name: 'rouge', sym: 'cœur', fill: '#D3263A', ink: '#FFFFFF' },
    { id: 'bleu', name: 'bleu', sym: 'étoile', fill: '#2463D6', ink: '#FFFFFF' },
    { id: 'jaune', name: 'jaune', sym: 'soleil', fill: '#F6C624', ink: '#4A3500' },
    { id: 'vert', name: 'vert', sym: 'triangle', fill: '#2F9A4E', ink: '#FFFFFF' },
    { id: 'blanc', name: 'blanc', sym: 'losange', fill: '#F4F0E6', ink: '#2A2622' },
    { id: 'violet', name: 'violet', sym: 'croix', fill: '#7E45B8', ink: '#FFFFFF' },
    { id: 'orange', name: 'orange', sym: 'carré', fill: '#F08A1C', ink: '#4A2300' },
    { id: 'rose', name: 'rose', sym: 'lune', fill: '#F29BC0', ink: '#5A1030' },
  ];
  // The key 'fort' shows as "Difficile" (lib/kit.js).
  // Facile: 4 holes, 6 colours, each colour once in the code and in a row, 12 rows.
  // Moyen: 4 holes, 6 colours, a colour may come back, 10 rows.
  // Difficile: 5 holes, 8 colours, a colour may come back, 10 rows.
  const LEVELS = {
    facile: { holes: 4, colors: 6, repeat: false, rows: 12 },
    moyen: { holes: 4, colors: 6, repeat: true, rows: 10 },
    fort: { holes: 5, colors: 8, repeat: true, rows: 10 },
  };

  // A small seeded random source (mulberry32), so a seed always gives the same code.
  function random(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function newGame(level, seed) {
    const key = LEVELS[level] ? level : 'facile', L = LEVELS[key];
    const rnd = random(seed);
    const code = [];
    while (code.length < L.holes) {
      const c = Math.floor(rnd() * L.colors);
      if (L.repeat || !code.includes(c)) code.push(c);
    }
    return { level: key, holes: L.holes, colors: L.colors, rows: L.rows, code, tries: [], cur: Array(L.holes).fill(-1), order: [], result: '' };
  }

  // The clue of a guess: [right colour in the right place, right colour in another place].
  // Two small tables, reused, so the hint can score a million rows quickly.
  const ca = new Uint8Array(8), cb = new Uint8Array(8);
  function score(code, guess) {
    let black = 0;
    ca.fill(0); cb.fill(0);
    for (let i = 0; i < code.length; i++) {
      if (code[i] === guess[i]) black++;
      else { ca[code[i]]++; cb[guess[i]]++; }
    }
    let white = 0;
    for (let c = 0; c < 8; c++) white += ca[c] < cb[c] ? ca[c] : cb[c];
    return [black, white];
  }
  // The same clue as one number, black * 8 + white, with no array made.
  function key(code, guess) {
    let black = 0;
    ca.fill(0); cb.fill(0);
    for (let i = 0; i < code.length; i++) {
      if (code[i] === guess[i]) black++;
      else { ca[code[i]]++; cb[guess[i]]++; }
    }
    let white = 0;
    for (let c = 0; c < 8; c++) white += ca[c] < cb[c] ? ca[c] : cb[c];
    return black * 8 + white;
  }

  // « 2 bien placées, 1 mal placée »: zero and one take the singular, as in French.
  const word = (n, s) => `${n} ${s}${n > 1 ? 's' : ''}`;
  const sentence = (black, white) => `${word(black, 'bien placée')}, ${word(white, 'mal placée')}`;

  const level = G => LEVELS[G.level];
  const full = G => G.cur.every(c => c >= 0);
  const playing = G => !G.result;

  // Why colour c cannot go in hole i of the row now, or ''.
  //   'over': the game is over; 'twice': at Facile, the colour is already in the row (in another hole).
  function refusal(G, i, c) {
    if (G.result) return 'over';
    if (!level(G).repeat && G.cur.some((x, k) => x === c && k !== i)) return 'twice';
    return '';
  }

  // Puts colour c in hole i of the row, in place of what was there.
  function place(G, i, c) {
    if (refusal(G, i, c) || i < 0 || i >= G.holes || c < 0 || c >= G.colors) return null;
    const cur = G.cur.slice(); cur[i] = c;
    return { ...G, cur, order: [...G.order.filter(k => k !== i), i] };
  }
  // Takes the peg out of hole i of the row.
  function remove(G, i) {
    if (G.result || G.cur[i] < 0) return null;
    const cur = G.cur.slice(); cur[i] = -1;
    return { ...G, cur, order: G.order.filter(k => k !== i) };
  }
  // The row is full: the clue is given, and the game ends on the code or on the last row.
  function submit(G) {
    if (G.result || !full(G)) return null;
    const [black, white] = score(G.code, G.cur);
    const tries = [...G.tries, { guess: G.cur.slice(), black, white }];
    const result = black === G.holes ? 'won' : tries.length >= G.rows ? 'lost' : '';
    return { ...G, tries, cur: Array(G.holes).fill(-1), order: [], result };
  }
  // Undo: the last peg put in the row, or, with an empty row, the last row given back as it was.
  // A finished game cannot be undone: the code has been shown.
  function undo(G) {
    if (G.result) return null;
    if (G.order.length) return remove(G, G.order[G.order.length - 1]);
    if (!G.tries.length) return null;
    const last = G.tries[G.tries.length - 1];
    return { ...G, tries: G.tries.slice(0, -1), cur: last.guess.slice(), order: last.guess.map((c, i) => i) };
  }

  // Every code of a level, as arrays. Facile has 360, Moyen 1,296 and Difficile 32,768.
  const cache = {};
  function allCodes(key) {
    if (cache[key]) return cache[key];
    const L = LEVELS[key], out = [];
    const total = L.colors ** L.holes;
    for (let n = 0; n < total; n++) {
      const code = [];
      let m = n;
      for (let i = 0; i < L.holes; i++) { code.push(m % L.colors); m = Math.floor(m / L.colors); }
      if (L.repeat || new Set(code).size === L.holes) out.push(code);
    }
    return (cache[key] = out);
  }
  // The codes that give every clue seen so far: what the secret code can still be.
  function possible(G) {
    const want = G.tries.map(t => t.black * 8 + t.white);
    return allCodes(G.level).filter(code => G.tries.every((t, k) => key(code, t.guess) === want[k]));
  }
  // Does a row fit every clue seen so far?
  function fits(G, guess) {
    return G.tries.every(t => { const [b, w] = score(guess, t.guess); return b === t.black && w === t.white; });
  }

  // The first row: no clue yet, so any row is possible. These give the most to learn on average:
  // four colours at Facile, two pairs at Moyen (as Knuth's 1122), two pairs and one more at Difficile.
  const OPENING = { facile: [0, 1, 2, 3], moyen: [0, 0, 1, 1], fort: [0, 0, 1, 1, 2] };

  // The hint: a row that fits every clue, chosen so that the worst answer leaves the fewest codes
  // (Knuth's minimax, among the possible codes only, so the hint can always be the code itself).
  // It never looks at the code.
  //   { guess, left: codes possible now, worst: codes possible after the worst answer, first: true for the opening }
  // A large set is cut to evenly spaced samples, so a hint takes a few tens of milliseconds at Difficile.
  const CANDIDATES = 400, SAMPLE = 2500;
  function hint(G) {
    if (G.result) return null;
    if (!G.tries.length) {
      const left = allCodes(G.level).length;
      return { guess: OPENING[G.level].slice(), left, worst: left, first: true };
    }
    const S = possible(G);
    if (S.length <= 2) return { guess: S[0].slice(), left: S.length, worst: S.length - 1, first: false };
    const spread = (list, n) => list.length <= n ? list : Array.from({ length: n }, (_, k) => list[Math.floor(k * list.length / n)]);
    const cands = spread(S, CANDIDATES), sample = spread(S, SAMPLE);
    const scale = S.length / sample.length;
    let best = null, bestWorst = Infinity;
    const parts = new Int32Array(64);
    for (const c of cands) {
      parts.fill(0);
      let worst = 0;
      for (const s of sample) {
        const k = key(s, c);
        if (++parts[k] > worst) worst = parts[k];
      }
      if (worst < bestWorst) { bestWorst = worst; best = c; }
    }
    // Once the guess itself is right, nothing is left: the worst answer counts the other codes only.
    return { guess: best.slice(), left: S.length, worst: Math.max(1, Math.round(bestWorst * scale)), first: false };
  }

  // A save read back must be a game this file could have made.
  function valid(G) {
    const L = G && LEVELS[G.level];
    if (!L || G.holes !== L.holes || G.colors !== L.colors || G.rows !== L.rows) return false;
    const row = r => Array.isArray(r) && r.length === L.holes && r.every(c => Number.isInteger(c) && c >= 0 && c < L.colors)
      && (L.repeat || new Set(r).size === L.holes);
    if (!row(G.code) || !Array.isArray(G.tries) || G.tries.length > L.rows) return false;
    for (const t of G.tries) {
      if (!t || !row(t.guess)) return false;
      const [b, w] = score(G.code, t.guess);
      if (t.black !== b || t.white !== w) return false;
    }
    if (!Array.isArray(G.cur) || G.cur.length !== L.holes || !G.cur.every(c => Number.isInteger(c) && c >= -1 && c < L.colors)) return false;
    const set = G.cur.filter(c => c >= 0);
    if (!L.repeat && new Set(set).size !== set.length) return false;
    if (!Array.isArray(G.order) || G.order.length !== set.length || new Set(G.order).size !== G.order.length
      || !G.order.every(i => Number.isInteger(i) && G.cur[i] >= 0)) return false;
    const last = G.tries[G.tries.length - 1];
    const result = last && last.black === L.holes ? 'won' : G.tries.length >= L.rows ? 'lost' : '';
    if (G.result !== result) return false;
    // No game goes on after the code is found.
    if (G.tries.slice(0, -1).some(t => t.black === L.holes)) return false;
    return !result || set.length === 0;
  }

  root.CodeSecret = { COLORS, LEVELS, OPENING, newGame, score, sentence, refusal, place, remove, submit, undo, full, playing,
    allCodes, possible, fits, hint, valid, random };
})(typeof window !== 'undefined' ? window : globalThis);
