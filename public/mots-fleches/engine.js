// The mots fléchés: the grid maker, the words and their definitions, typing, the check and the hint.
// No DOM, so the page and the tests run the same code. Load words.js first.
//
// A grid is cols * rows cells, row by row: '#' for a definition cell, a capital letter A to Z for a
// letter cell. As in a French newspaper, the first row and the first column are a frame: definition
// cells on the even places, letters on the odd ones. A definition cell holds one or two definitions,
// each with its arrow:
//   right       the word starts in the cell on its right and reads to the right (→)
//   down        the word starts in the cell under it and reads down (↓)
//   rightDown   the word starts in the cell on its right and reads down (the bent arrow ↴, top row)
//   downRight   the word starts in the cell under it and reads to the right (the bent arrow ↳, left column)
// Each run of two letters or more, across or down, is a word of the bank, and no word comes twice. Every
// letter is in one word at least. A run of one letter has no definition.
//
// A game G: { v: 1, level, n: the number of its grid in grids.js, cols, rows, grid: the solution, defs: the definition of each word in
//   the order of words(), typed: one character per cell ('#' on a definition, ' ' when empty), given: one
//   character per cell, '1' for a letter he did not write (the first letters of Facile and the letters of
//   the hint), wrong: the cells marked by « Vérifier » (one character per cell, '1' marked), result: '' or 'won' }.
(function (root) {
  'use strict';
  const BANK = () => root.MotsFlechesWords;

  // The key 'fort' shows as "Difficile" (lib/kit.js). Each level is larger, takes rarer words and,
  // at Difficile, the harder definitions: wordplay and allusions. Facile gives the first letter of
  // each word.
  const LEVELS = {
    facile: { cols: 9, rows: 7, tiers: [1], hard: false, given: true },
    moyen: { cols: 11, rows: 8, tiers: [1, 2], hard: false, given: false },
    fort: { cols: 13, rows: 9, tiers: [1, 2, 3], hard: true, given: false },
  };

  // A word as the grid writes it: capitals without accents. « Épée » becomes EPEE.
  const key = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/Œ/g, 'OE').replace(/Æ/g, 'AE');

  // A small seeded random source (mulberry32), so a seed always gives the same grid.
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

  // ---------- The bank ----------
  // words.js: [word, tier, definition, harder definition or ''], tier 1 very common, 2 usual, 3 rare.
  // For each level: the words it may use, and for each prefix the lengths of its words (a bit mask) and
  // how many words start with it.
  const indexes = {};
  function index(level) {
    if (indexes[level]) return indexes[level];
    const L = LEVELS[level], words = new Map(), pre = new Map(), count = new Map();
    for (const e of BANK()) {
      const [w, t] = e;
      if (!L.tiers.includes(t) || words.has(w) || w.length > Math.max(L.cols, L.rows) - 1) continue;
      words.set(w, e);
      for (let k = 1; k <= w.length; k++) {
        const p = w.slice(0, k);
        pre.set(p, (pre.get(p) || 0) | (1 << w.length));
        count.set(p, (count.get(p) || 0) + 1);
      }
    }
    return (indexes[level] = { words, pre, count });
  }
  // The definition of a word at a level: the harder one at Difficile when the bank has one.
  function define(level, w) {
    const e = BANK().find(x => x[0] === w);
    if (!e) return '';
    return LEVELS[level].hard && e[3] ? e[3] : e[2];
  }

  // ---------- The frame ----------
  // The first row and the first column are fixed: definitions on even places, letters on odd ones. A
  // letter of the frame belongs to one word only, the one that goes into the grid, so the cell after it
  // is a letter too.
  const fixed = (r, c) => r === 0 ? (c % 2 ? 'L' : '#') : c === 0 ? (r % 2 ? 'L' : '#')
    : (c === 1 && r % 2) || (r === 1 && c % 2) ? 'L' : '';

  // ---------- The grid maker ----------
  // The words of a level in a tree of letters: for each node, its children, the lengths of the words
  // that go through it (a bit mask), how many words go through it, and the word it ends, if any.
  const tries = {};
  function tree(level) {
    if (tries[level]) return tries[level];
    const { words } = index(level), list = [...words.keys()];
    let size = 1;
    const kids = [new Int32Array(26).fill(-1)], mask = [0], count = [0], end = [-1];
    list.forEach((w, id) => {
      let node = 0;
      mask[0] |= 1 << w.length; count[0]++;
      for (let k = 0; k < w.length; k++) {
        const ch = w.charCodeAt(k) - 65;
        if (kids[node][ch] < 0) { kids[node][ch] = size++; kids.push(new Int32Array(26).fill(-1)); mask.push(0); count.push(0); end.push(-1); }
        node = kids[node][ch];
        mask[node] |= 1 << w.length; count[node]++;
      }
      end[node] = id;
    });
    return (tries[level] = { kids, mask, count, end, list });
  }

  // Fills the cells in reading order. Each cell takes a letter that keeps its word across and its word
  // down possible, or a definition cell, which ends both words before it. A dead end goes back; a search
  // longer than the budget gives up, and the caller tries another seed. Returns the grid, or null.
  function fill(level, seed, budget = 8000, maxTwos = Infinity) {
    const L = LEVELS[level], { cols, rows } = L, { kids, mask, count, end, list } = tree(level);
    const rnd = random(seed);
    const n = cols * rows, g = new Array(n).fill(null), used = new Uint8Array(list.length);
    // The word down each column so far: its node in the tree (-1: none, SINGLE: one letter that starts
    // no word, so the run must end there) and its length.
    const SINGLE = -2, vn = new Int32Array(cols).fill(-1), vl = new Int32Array(cols);
    const at = (r, c) => r < 0 || c < 0 || r >= rows || c >= cols ? '#' : g[r * cols + c];
    let steps = 0, twos = 0;
    // A run of len letters ending at node can still grow into a word of at most max letters.
    const grows = (node, len, max) => node >= 0 && (mask[node] & (((1 << (max + 1)) - 1) & ~((1 << len) - 1))) !== 0;
    const word = (node, len) => len < 2 ? -1 : node >= 0 ? end[node] : -1;
    const closes = (node, len) => len < 2 || (node >= 0 && end[node] >= 0 && !used[end[node]]);
    // A letter alone across and down belongs to no word.
    const lone = (r, c) => {
      const x = at(r, c);
      if (x === '#' || x === null) return false;
      const near = [at(r, c - 1), at(r, c + 1), at(r - 1, c), at(r + 1, c)];
      return !near.includes(null) && near.every(y => y === '#');
    };
    // A definition cell inside the grid must hold a definition: a word of two letters or more on its
    // right or under it.
    const idle = (r, c) => {
      if (r < 0 || c < 0 || at(r, c) !== '#') return false;
      if (r === 0 && c < cols - 1 || c === 0 && r < rows - 1) return false;
      const side = (a, b) => a === null || (b === null && a !== '#') ? null : a !== '#' && b !== '#';
      const right = r === 0 ? false : side(at(r, c + 1), at(r, c + 2)), down = c === 0 ? false : side(at(r + 1, c), at(r + 2, c));
      return right === false && down === false;
    };
    const broken = (r, c) => lone(r - 1, c) || lone(r, c - 1) || (r === rows - 1 && lone(r, c))
      || idle(r, c - 1) || idle(r, c - 2) || idle(r - 1, c) || idle(r - 2, c)
      || (r === rows - 1 && (idle(r, c) || idle(r - 1, c))) || (c === cols - 1 && (idle(r, c) || idle(r - 1, c)));

    // Whether the cell (r, c) can still take something, the run across before it ending at node hn with
    // hl letters: a look one cell ahead, so a dead end shows before the rest of the row is tried.
    function open(r, c, hn, hl) {
      if (c >= cols) return true;
      const f = fixed(r, c), v0 = vn[c], vlen = vl[c];
      if (f === '#') return closes(hn, hl) && closes(v0, vlen);
      if (!f && closes(hn, hl) && closes(v0, vlen)) return true;
      const hMax = cols - (c - hl), vMax = rows - (r - vlen);
      for (let ch = 0; ch < 26; ch++) {
        let nh = hl === 0 ? kids[0][ch] : hn >= 0 ? kids[hn][ch] : -1;
        if (!grows(nh, hl + 1, hMax)) { if (hl === 0) nh = SINGLE; else continue; }
        let nv = vlen === 0 ? kids[0][ch] : v0 >= 0 ? kids[v0][ch] : -1;
        if (!grows(nv, vlen + 1, vMax)) { if (vlen === 0) nv = SINGLE; else continue; }
        if (c === cols - 1 && !closes(nh, hl + 1)) continue;
        if (r === rows - 1 && !closes(nv, vlen + 1)) continue;
        return true;
      }
      return false;
    }
    // place() returns true when the grid is full, or the cells to blame for a dead end. A dead end goes
    // back to the latest of those cells, past the cells that played no part in it (conflict-directed
    // backjumping), so a word that cannot end in row 5 does not make the search try every letter of row 4.
    const OUT = new Set();
    // The cells near (r, c) that its checks read: its rows and columns two cells back, and two ahead in the
    // rows above.
    const near = (r, c, i, into) => {
      for (let a = Math.max(0, r - 2); a <= r; a++) for (let b = Math.max(0, c - 2); b <= Math.min(cols - 1, c + 2); b++) {
        const k = a * cols + b;
        if (k < i) into.add(k);
      }
    };
    function place(i, hn, hl) {
      if (i === n) return true;
      if (++steps > budget) return OUT;
      const r = Math.floor(i / cols), c = i % cols, f = fixed(r, c);
      if (c === 0) { hn = -1; hl = 0; }
      const v0 = vn[c], vlen = vl[c];
      // The cells that decide which letters fit here: the run across and the run down.
      const blame = new Set();
      for (let k = 1; k <= hl; k++) blame.add(i - k);
      for (let k = 1; k <= vlen; k++) blame.add(i - k * cols);
      near(r, c, i, blame);
      const opts = [];
      if (f !== '#') {
        const hMax = cols - (c - hl), vMax = rows - (r - vlen);
        for (let ch = 0; ch < 26; ch++) {
          let nh = hl === 0 ? kids[0][ch] : hn >= 0 ? kids[hn][ch] : -1;
          if (!grows(nh, hl + 1, hMax)) { if (hl === 0) nh = SINGLE; else continue; }
          let nv = vlen === 0 ? kids[0][ch] : v0 >= 0 ? kids[v0][ch] : -1;
          if (!grows(nv, vlen + 1, vMax)) { if (vlen === 0) nv = SINGLE; else continue; }
          // At the edge the run ends here.
          if (c === cols - 1 && !closes(nh, hl + 1)) continue;
          if (r === rows - 1 && !closes(nv, vlen + 1)) continue;
          const w = Math.log(2 + (nh >= 0 && hl ? count[nh] : 40)) * Math.log(2 + (nv >= 0 && vlen ? count[nv] : 40));
          opts.push([ch, w * (0.2 + rnd()), nh, nv]);
        }
        opts.sort((a, b) => b[1] - a[1]);
      }
      if (f === '#' || (!f && closes(hn, hl) && closes(v0, vlen))) {
        // A definition cell after a single letter leaves that letter alone in one direction: rarely.
        // Beside another definition cell, or after a word of two letters: rarely. After a longer word: one time in four.
        const p = f === '#' ? 1 : hl === 1 || vlen === 1 ? 0.02 : hl === 0 || vlen === 0 ? 0.04 : hl === 2 || vlen === 2 ? 0.06 : 0.24;
        const clue = ['#'];
        if (rnd() < p) opts.unshift(clue); else opts.push(clue);
      }
      for (const [ch, , nh, nv] of opts) {
        const ends = [];
        if (ch === '#') {
          g[i] = '#';
          if (hl > 1) ends.push(end[hn]);
          if (vlen > 1) ends.push(end[v0]);
          vn[c] = -1; vl[c] = 0;
        } else {
          g[i] = String.fromCharCode(65 + ch);
          if (c === cols - 1 && hl + 1 > 1) ends.push(end[nh]);
          if (r === rows - 1 && vlen + 1 > 1) ends.push(end[nv]);
          vn[c] = nv; vl[c] = vlen + 1;
        }
        const short = ends.filter(w => list[w].length === 2).length;
        let res = null;
        if (ends.length === 2 && ends[0] === ends[1]) res = blame;
        else if (ends.some(w => used[w]) || twos + short > maxTwos) {
          // A word used before, or one word of two letters too many: the cause may be anywhere before.
          res = new Set([i - 1]);
        } else {
          ends.forEach(w => { used[w] = 1; });
          twos += short;
          if (c + 1 < cols && !(ch === '#' ? open(r, c + 1, -1, 0) : open(r, c + 1, nh, hl + 1))) {
            // The next cell can take nothing: its run down is to blame too.
            res = new Set(blame);
            for (let k = 1; k <= vl[c + 1]; k++) res.add(i + 1 - k * cols);
          } else if (broken(r, c)) res = blame;
          else res = ch === '#' ? place(i + 1, -1, 0) : place(i + 1, nh, hl + 1);
          if (res === true) return true;
          twos -= short;
          ends.forEach(w => { used[w] = 0; });
        }
        g[i] = null; vn[c] = v0; vl[c] = vlen;
        if (res === OUT) return OUT;
        // A dead end further on that this cell played no part in: go straight back past it.
        if (res !== blame && !res.has(i)) return res;
        if (res !== blame) for (const k of res) if (k !== i) blame.add(k);
      }
      if (!blame.size && i > 0) blame.add(i - 1);
      return blame;
    }
    return place(0, -1, 0) === true ? g.join('') : null;
  }

  // ---------- Reading a grid ----------
  // The words of a grid, in reading order of their definition cells: { word, cells, dir: 'h' or 'v',
  // clue: the definition cell, arrow, part: 0 for the top half of the definition cell, 1 for the bottom }.
  // In a cell with two definitions, the one whose arrow leaves on the right is on top.
  const cache = new Map();
  function words(cols, rows, grid) {
    const k = cols + ':' + grid;
    if (cache.has(k)) return cache.get(k);
    const out = [];
    const is = (r, c) => r >= 0 && c >= 0 && r < rows && c < cols && grid[r * cols + c] !== '#';
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      if (!is(r, c)) continue;
      if (!is(r, c - 1) && is(r, c + 1)) {
        const cells = []; for (let k = c; is(r, k); k++) cells.push(r * cols + k);
        const clue = c === 0 ? (r - 1) * cols : r * cols + c - 1;
        out.push({ dir: 'h', cells, clue, arrow: c === 0 ? 'downRight' : 'right', part: c === 0 ? 1 : 0 });
      }
      if (!is(r - 1, c) && is(r + 1, c)) {
        const cells = []; for (let k = r; is(k, c); k++) cells.push(k * cols + c);
        const clue = r === 0 ? c - 1 : (r - 1) * cols + c;
        out.push({ dir: 'v', cells, clue, arrow: r === 0 ? 'rightDown' : 'down', part: r === 0 ? 0 : 1 });
      }
    }
    out.sort((a, b) => a.clue - b.clue || a.part - b.part);
    out.forEach(w => { w.word = w.cells.map(i => grid[i]).join(''); });
    // A definition cell with one definition shows it on its whole height.
    const per = new Map();
    out.forEach(w => per.set(w.clue, (per.get(w.clue) || 0) + 1));
    out.forEach(w => { w.alone = per.get(w.clue) === 1; });
    cache.set(k, out);
    if (cache.size > 40) cache.delete(cache.keys().next().value);
    return out;
  }

  // The checks of a grid, for the maker, the tests and a save: the frame, every run a word of the bank,
  // no word twice, every letter in a word, every definition cell with a definition, two at most.
  function sound(cols, rows, grid, bank) {
    if (typeof grid !== 'string' || grid.length !== cols * rows || !/^[A-Z#]+$/.test(grid)) return false;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const f = fixed(r, c), x = grid[r * cols + c];
      if (f === '#' && x !== '#' || f === 'L' && x === '#') return false;
    }
    const ws = words(cols, rows, grid), seen = new Set(), inWord = new Set(), clues = new Map();
    for (const w of ws) {
      if (seen.has(w.word) || (bank && !bank.has(w.word))) return false;
      seen.add(w.word);
      w.cells.forEach(i => inWord.add(i));
      clues.set(w.clue, (clues.get(w.clue) || 0) + 1);
      if (grid[w.clue] !== '#') return false;
    }
    for (let i = 0; i < grid.length; i++) {
      if (grid[i] !== '#' && !inWord.has(i)) return false;
      if (grid[i] === '#' && !(clues.get(i) >= 1)) return false;
      if ((clues.get(i) || 0) > 2) return false;
    }
    return true;
  }

  // ---------- A game ----------
  // The grids are made ahead of time with make() and kept in grids.js, checked by the tests, so a new
  // game opens at once. A game takes grid number n of its level.
  const GRIDS = () => root.MotsFlechesGrids;
  // make(): a new grid from a seed, for grids.js. A seed that fills no grid in time, or a grid too poor,
  // moves on to the next seed. A good grid has few words of two letters, few letters inside the grid that
  // belong to one word only, and few definition cells side by side.
  const LIMITS = { facile: { twos: 4, single: 6, side: 3 }, moyen: { twos: 5, single: 8, side: 4 }, fort: { twos: 7, single: 10, side: 6 } };
  function shape(cols, rows, grid) {
    const ws = words(cols, rows, grid), seen = new Map();
    ws.forEach(w => w.cells.forEach(i => seen.set(i, (seen.get(i) || 0) + 1)));
    let single = 0, side = 0;
    for (const [i, k] of seen) if (k === 1 && i >= cols && i % cols) single++;
    for (let r = 1; r < rows; r++) for (let c = 1; c < cols; c++) {
      const i = r * cols + c;
      if (grid[i] === '#' && ((c > 1 && grid[i - 1] === '#') || (r > 1 && grid[i - cols] === '#'))) side++;
    }
    return { twos: ws.filter(w => w.word.length === 2).length, single, side };
  }
  function make(level, seed) {
    const L = LEVELS[level], bank = index(level).words, lim = LIMITS[level];
    for (let k = 0; k < 2000; k++) {
      const grid = fill(level, (seed + k) >>> 0, 8000, lim.twos);
      if (!grid || !sound(L.cols, L.rows, grid, bank)) continue;
      const q = shape(L.cols, L.rows, grid);
      if (q.single <= lim.single && q.side <= lim.side) return grid;
    }
    return null;
  }
  const count = level => GRIDS()[level].length;
  function newGame(level, n) {
    if (!LEVELS[level]) level = 'facile';
    n = ((n % count(level)) + count(level)) % count(level);
    return start(level, n, GRIDS()[level][n]);
  }
  function start(level, n, grid) {
    const L = LEVELS[level], ws = words(L.cols, L.rows, grid);
    const given = [...grid].map(() => '0');
    if (L.given) ws.forEach(w => { given[w.cells[0]] = '1'; });
    const typed = [...grid].map((x, i) => x === '#' ? '#' : given[i] === '1' ? x : ' ').join('');
    return { v: 1, level, n, cols: L.cols, rows: L.rows, grid, defs: ws.map(w => define(level, w.word)),
      typed, given: given.join(''), wrong: '0'.repeat(grid.length), result: '' };
  }
  const wordsOf = G => words(G.cols, G.rows, G.grid);

  // The cells still empty, and whether the grid is full and right.
  const empty = G => [...G.typed].filter(x => x === ' ').length;
  const solved = G => G.typed === G.grid;

  // He writes a letter in a cell, or erases it (letter ''). The letters he did not write stay.
  function write(G, i, letter) {
    if (G.result || G.grid[i] === '#' || G.given[i] === '1') return G;
    const ch = letter ? key(letter).replace(/[^A-Z]/g, '')[0] || '' : '';
    if (letter && !ch) return G;
    const typed = G.typed.slice(0, i) + (ch || ' ') + G.typed.slice(i + 1);
    const wrong = G.wrong.slice(0, i) + '0' + G.wrong.slice(i + 1);
    const H = { ...G, typed, wrong };
    if (solved(H)) H.result = 'won';
    return H;
  }
  // « Vérifier »: the letters written that are not those of the grid.
  function mistakes(G) {
    const out = [];
    for (let i = 0; i < G.grid.length; i++) if (G.typed[i] !== ' ' && G.typed[i] !== '#' && G.typed[i] !== G.grid[i]) out.push(i);
    return out;
  }
  function mark(G) {
    const bad = new Set(mistakes(G));
    return { ...G, wrong: [...G.grid].map((x, i) => bad.has(i) ? '1' : '0').join('') };
  }
  // The hint gives one letter, and says which. First a wrong letter of the word he is on, then an empty
  // cell of that word, then the word with the fewest cells left, so a word gets finished. A cell that
  // crosses a word nearly done comes first. Returns { G, i, w, fixed } or null when the grid is done.
  function hint(G, current) {
    if (G.result) return null;
    const ws = wordsOf(G), bad = new Set(mistakes(G));
    const left = w => w.cells.filter(i => G.typed[i] !== G.grid[i]);
    let w = current >= 0 && current < ws.length && left(ws[current]).length ? current : -1;
    if (w < 0) {
      let best = Infinity;
      ws.forEach((x, k) => {
        const n = left(x).length;
        if (!n) return;
        // A word nearly done, then the shorter word, then the first in reading order.
        const score = n * 100 + x.cells.length;
        if (score < best) { best = score; w = k; }
      });
    }
    if (w < 0) return null;
    const cells = left(ws[w]);
    const i = cells.find(k => bad.has(k)) ?? cells[0];
    const fixedOne = bad.has(i);
    const typed = G.typed.slice(0, i) + G.grid[i] + G.typed.slice(i + 1);
    const given = G.given.slice(0, i) + '1' + G.given.slice(i + 1);
    const wrong = G.wrong.slice(0, i) + '0' + G.wrong.slice(i + 1);
    const H = { ...G, typed, given, wrong };
    if (solved(H)) H.result = 'won';
    return { G: H, i, w, fixed: fixedOne };
  }

  // A save read back: checked whole, so a broken save starts a new game.
  function valid(G) {
    if (!G || typeof G !== 'object' || G.v !== 1 || !LEVELS[G.level]) return false;
    const L = LEVELS[G.level];
    if (G.cols !== L.cols || G.rows !== L.rows || !sound(G.cols, G.rows, G.grid)) return false;
    const n = G.grid.length, ws = wordsOf(G);
    if (!Array.isArray(G.defs) || G.defs.length !== ws.length || !G.defs.every(d => typeof d === 'string' && d.length > 0)) return false;
    if (typeof G.typed !== 'string' || G.typed.length !== n || !/^[A-Z #]+$/.test(G.typed)) return false;
    for (let i = 0; i < n; i++) if ((G.grid[i] === '#') !== (G.typed[i] === '#')) return false;
    for (const s of [G.given, G.wrong]) if (typeof s !== 'string' || s.length !== n || !/^[01]+$/.test(s)) return false;
    for (let i = 0; i < n; i++) if (G.given[i] === '1' && (G.grid[i] === '#' || G.typed[i] !== G.grid[i])) return false;
    return G.result === (solved(G) ? 'won' : '');
  }

  // The average tier of the words of a grid and the share of harder definitions: the tests prove each
  // level asks more than the one below.
  function weight(G) {
    const ws = wordsOf(G), bank = new Map(BANK().map(e => [e[0], e]));
    const tiers = ws.map(w => bank.get(w.word)[1]);
    const hard = ws.filter((w, k) => { const e = bank.get(w.word); return e[3] && G.defs[k] === e[3]; }).length;
    return { tier: tiers.reduce((a, b) => a + b, 0) / tiers.length, hard: hard / ws.length, words: ws.length,
      letters: [...G.grid].filter(x => x !== '#').length, given: [...G.given].filter(x => x === '1').length };
  }

  root.MotsFleches = { LEVELS, key, random, index, define, fill, make, shape, LIMITS, count, words, wordsOf, sound, newGame, start, write,
    mistakes, mark, hint, valid, empty, solved, weight };
})(typeof window !== 'undefined' ? window : globalThis);
