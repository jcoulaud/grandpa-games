// The mots mêlés: the grids, the rules of a pair of letters, the hint and the check of a save. No DOM, so
// the page and the tests run the same code. Load words.js first.
//
// A game G: { level, size, theme: the title of the grid, grid: size * size capital letters without accents,
//   row by row, words: [{ word: 'Râteau', key: 'RATEAU', r, c, dr, dc }] (the first letter at row r,
//   column c, then one step of dr, dc per letter), found: the indexes of the words found, in the order
//   found, result: '' or 'won' }.
// A cell is r * size + c. check(G, a, b) says what a click on cell a, then on cell b, means.
(function (root) {
  'use strict';
  const THEMES = () => root.MotsMelesThemes;
  // The eight directions as [dr, dc].
  const RIGHT = [0, 1], DOWN = [1, 0], DOWN_RIGHT = [1, 1], UP_RIGHT = [-1, 1];
  const ALL = [RIGHT, DOWN, DOWN_RIGHT, UP_RIGHT, [0, -1], [-1, 0], [-1, -1], [1, -1]];
  // The key 'fort' shows as "Difficile" (lib/kit.js). Facile reads only to the right and down, Moyen adds
  // the two diagonals that read from left to right, Difficile reads in all eight directions.
  const LEVELS = {
    facile: { sizes: [8, 9], words: 6, min: 4, max: 6, dirs: [RIGHT, DOWN] },
    moyen: { sizes: [11], words: 9, min: 4, max: 8, dirs: [RIGHT, DOWN, DOWN_RIGHT, UP_RIGHT] },
    fort: { sizes: [11], words: 12, min: 5, max: 10, dirs: ALL },
  };

  // A word as the grid writes it: capitals without accents. "Châtaigne" becomes CHATAIGNE.
  const key = word => word.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
  // A word as the list and the messages write it: capitals with their accents.
  const caps = word => word.toLocaleUpperCase('fr-FR');
  const reverse = s => [...s].reverse().join('');

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
  const pick = (list, rnd) => list[Math.floor(rnd() * list.length)];
  function shuffle(list, rnd) {
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
    return list;
  }

  // The filler letters, about as often as in French text, so the grid looks like real words.
  const FILLER = 'EEEEEEEAAAAAAIIIIISSSSSNNNNNTTTTTRRRRRUUUULLLLOOOOODDDCCCPPPMMMVVGGBBFFHHQJXYZK';
  // Words the filler must never spell by chance, in any direction.
  const BLOCKED = ['CON', 'CUL', 'PET', 'PUE', 'PUTE', 'MERDE', 'BITE', 'NAZI', 'SEXE', 'PENIS', 'CONNE', 'SALE', 'MORT', 'TUER', 'ZIZI', 'NUL', 'NULLE'];

  const cells = (w, size) => [...w.key].map((x, k) => (w.r + k * w.dr) * size + w.c + k * w.dc);

  // Every place where the letters of key are read in a straight line, in any of the eight directions.
  function occurrences(grid, size, key) {
    const out = [];
    for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) {
      if (grid[r * size + c] !== key[0]) continue;
      for (const [dr, dc] of ALL) {
        const er = r + dr * (key.length - 1), ec = c + dc * (key.length - 1);
        if (er < 0 || er >= size || ec < 0 || ec >= size) continue;
        let k = 1;
        while (k < key.length && grid[(r + k * dr) * size + c + k * dc] === key[k]) k++;
        if (k === key.length) out.push(cells({ key, r, c, dr, dc }, size));
      }
    }
    return out;
  }

  // The words of a grid: none may hold another one, forwards or backwards, or it would be found twice,
  // and none reads the same backwards.
  function chooseWords(theme, L, rnd) {
    const list = shuffle(theme.words.filter(w => key(w).length >= L.min && key(w).length <= L.max && /^[A-Z]+$/.test(key(w))), rnd);
    const chosen = [];
    for (const w of list) {
      const k = key(w);
      if (k === reverse(k)) continue;
      if (chosen.some(c => { const o = key(c); return o.includes(k) || k.includes(o) || o.includes(reverse(k)) || k.includes(reverse(o)); })) continue;
      chosen.push(w);
      if (chosen.length === L.words) return chosen;
    }
    return null;
  }

  // The themes that can fill a grid of this level.
  const themesFor = level => THEMES().filter(t => chooseWords(t, LEVELS[level], () => 0));

  // Places the words one by one, the longest first, each at random among the places where it fits.
  // Returns the letters and the words, or null when a word finds no place.
  function place(words, size, dirs, rnd) {
    const grid = new Array(size * size).fill('');
    const placed = [];
    for (const word of [...words].sort((a, b) => key(b).length - key(a).length)) {
      const k = key(word), spots = [];
      for (const [dr, dc] of dirs) for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) {
        const er = r + dr * (k.length - 1), ec = c + dc * (k.length - 1);
        if (er < 0 || er >= size || ec < 0 || ec >= size) continue;
        let fits = true;
        for (let i = 0; i < k.length && fits; i++) {
          const x = grid[(r + i * dr) * size + c + i * dc];
          fits = x === '' || x === k[i];
        }
        if (fits) spots.push({ r, c, dr, dc });
      }
      if (!spots.length) return null;
      const s = pick(spots, rnd), w = { word, key: k, ...s };
      cells(w, size).forEach((i, n) => { grid[i] = k[n]; });
      placed.push(w);
    }
    // The list keeps the order of the theme's words as chosen, so it does not show the longest first.
    placed.sort((a, b) => words.indexOf(a.word) - words.indexOf(b.word));
    return { grid, words: placed };
  }

  // Fills the free cells, then draws again any free cell that spells a second copy of a word of the list
  // or a blocked word. Returns null when a second copy, or a blocked word across two words, is made only
  // of letters of the list. A blocked word inside one word of the list is part of that word: it stays.
  function fill(grid, words, size, rnd) {
    const own = new Set(grid.map((x, i) => x ? i : -1).filter(i => i >= 0));
    const homes = words.map(w => new Set(cells(w, size)));
    const pool = FILLER + words.map(w => w.key).join('');
    const out = grid.map(x => x || pick(pool, rnd));
    for (let round = 0; round < 400; round++) {
      let clean = true;
      const s = out.join('');
      for (const w of words) {
        const home = cells(w, size).join();
        for (const at of occurrences(s, size, w.key)) {
          if (at.join() === home) continue;
          clean = false;
          const free = at.filter(i => !own.has(i));
          if (!free.length) return null;
          out[pick(free, rnd)] = pick(pool, rnd);
        }
      }
      for (const b of BLOCKED) for (const at of occurrences(s, size, b)) {
        const free = at.filter(i => !own.has(i));
        if (!free.length) {
          if (homes.some(h => at.every(i => h.has(i)))) continue;
          return null;
        }
        clean = false;
        out[pick(free, rnd)] = pick(FILLER, rnd);
      }
      if (clean) return out.join('');
    }
    return null;
  }

  // A new grid of this level. avoid: the titles of the last themes played, not to be taken again soon.
  function newGame(level, seed, avoid = []) {
    level = LEVELS[level] ? level : 'facile';
    const L = LEVELS[level], rnd = random(seed);
    const themes = themesFor(level);
    const fresh = themes.filter(t => !avoid.includes(t.title));
    const theme = pick(fresh.length ? fresh : themes, rnd);
    for (;;) {
      const words = chooseWords(theme, L, rnd);
      if (!words) continue;
      const letters = words.reduce((n, w) => n + key(w).length, 0);
      const size = L.sizes.length > 1 && letters <= 30 ? L.sizes[0] : L.sizes[L.sizes.length - 1];
      for (let tries = 0; tries < 30; tries++) {
        const p = place(words, size, L.dirs, rnd);
        const grid = p && fill(p.grid, p.words, size, rnd);
        if (grid) return { level, size, theme: theme.title, grid, words: p.words, found: [], result: '' };
      }
    }
  }

  // The cells from a to b in a straight line, both included, or null when a and b are not on one line.
  function line(G, a, b) {
    const n = G.size, ar = Math.floor(a / n), ac = a % n, br = Math.floor(b / n), bc = b % n;
    const dr = Math.sign(br - ar), dc = Math.sign(bc - ac), len = Math.max(Math.abs(br - ar), Math.abs(bc - ac));
    if (a === b || (ar !== br && ac !== bc && Math.abs(br - ar) !== Math.abs(bc - ac))) return null;
    return Array.from({ length: len + 1 }, (x, k) => (ar + k * dr) * n + ac + k * dc);
  }
  const ends = (G, w) => { const c = cells(w, G.size); return [c[0], c[c.length - 1]]; };
  const allowed = (G, a, b) => {
    const n = G.size, dr = Math.sign(Math.floor(b / n) - Math.floor(a / n)), dc = Math.sign(b % n - a % n);
    // Either way along the line: a word read backwards is clicked from its first letter too.
    return LEVELS[G.level].dirs.some(([r, c]) => (r === dr && c === dc) || (r === -dr && c === -dc));
  };

  // What a click on a, then on b, means:
  //   { kind: 'found', w }     the word w lies between them: it is found
  //   { kind: 'already', w }   the word w lies between them, found before
  //   { kind: 'same' }         the same letter: the choice is cancelled
  //   { kind: 'won' }          the grid is finished
  //   { kind: 'notAligned' }   the two letters are not on one line
  //   { kind: 'direction' }    a diagonal at Facile
  //   { kind: 'almost', w, end: 'start' | 'end' }  the word w starts (or ends) at one of them, along this line
  //   { kind: 'none', text }   the letters from a to b spell no word of the list
  // A word is found from either end: from its first letter to its last, or the other way.
  function check(G, a, b) {
    if (G.result) return { kind: 'won' };
    if (a === b) return { kind: 'same' };
    const path = line(G, a, b);
    if (!path) return { kind: 'notAligned' };
    if (!allowed(G, a, b)) return { kind: 'direction' };
    for (let w = 0; w < G.words.length; w++) {
      const [s, e] = ends(G, G.words[w]);
      if ((s === a && e === b) || (s === b && e === a)) return { kind: G.found.includes(w) ? 'already' : 'found', w };
    }
    for (let w = 0; w < G.words.length; w++) {
      if (G.found.includes(w)) continue;
      const c = cells(G.words[w], G.size), set = new Set(path);
      const along = c.filter(i => set.has(i)).length >= 2;
      if (!along) continue;
      if (c[0] === a || c[0] === b) return { kind: 'almost', w, end: 'start' };
      if (c[c.length - 1] === a || c[c.length - 1] === b) return { kind: 'almost', w, end: 'end' };
    }
    return { kind: 'none', text: path.map(i => G.grid[i]).join('') };
  }

  function find(G, w) {
    if (G.result || G.found.includes(w) || !G.words[w]) return G;
    const found = [...G.found, w];
    return { ...G, found, result: found.length === G.words.length ? 'won' : '' };
  }
  // Undo takes back the last word found. A finished grid stays finished.
  function undo(G) {
    if (G.result || !G.found.length) return G;
    return { ...G, found: G.found.slice(0, -1) };
  }
  // The hint: the next word still to find after the word last shown, in the order of the list.
  function hint(G, after = -1) {
    if (G.result) return -1;
    for (let k = 1; k <= G.words.length; k++) {
      const w = (after + k + G.words.length) % G.words.length;
      if (!G.found.includes(w)) return w;
    }
    return -1;
  }

  // How much reading a grid asks: a reader goes over the cells row by row and, on each letter that starts
  // a word, reads along each direction of the level until a letter differs. The sum over the words of the
  // letters read until each word is met. The levels test uses it.
  function searchCost(G) {
    const n = G.size, dirs = LEVELS[G.level].dirs;
    let total = 0;
    for (const w of G.words) {
      let read = 0, done = false;
      for (let i = 0; i < n * n && !done; i++) {
        read++;
        if (G.grid[i] !== w.key[0]) continue;
        const r = Math.floor(i / n), c = i % n;
        for (const [dr, dc] of dirs) {
          let k = 1;
          while (k < w.key.length) {
            const rr = r + k * dr, cc = c + k * dc;
            if (rr < 0 || rr >= n || cc < 0 || cc >= n) break;
            read++;
            if (G.grid[rr * n + cc] !== w.key[k]) break;
            k++;
          }
          if (k === w.key.length && r === w.r && c === w.c && dr === w.dr && dc === w.dc) { done = true; break; }
        }
      }
      total += read;
    }
    return total;
  }

  // A save without its level, or with a level this file does not know, takes the level of its size and its number of words.
  function withLevel(G) {
    if (!G || typeof G !== 'object' || Object.hasOwn(LEVELS, G.level)) return G;
    const level = Object.keys(LEVELS).find(k => LEVELS[k].sizes.includes(G.size) && G.words?.length === LEVELS[k].words);
    return level ? { ...G, level } : G;
  }

  // A save read back must be a grid this file could have made: its words in their places, letter by letter.
  function valid(G) {
    const L = G && typeof G === 'object' && LEVELS[G.level];
    if (!L || !L.sizes.includes(G.size) || typeof G.theme !== 'string' || typeof G.grid !== 'string') return false;
    const n = G.size;
    if (G.grid.length !== n * n || !/^[A-Z]+$/.test(G.grid)) return false;
    if (!Array.isArray(G.words) || G.words.length !== L.words) return false;
    const keys = new Set();
    for (const w of G.words) {
      if (!w || typeof w.word !== 'string' || key(w.word) !== w.key || !/^[A-Z]+$/.test(w.key)) return false;
      if (w.key.length < L.min || w.key.length > L.max || keys.has(w.key)) return false;
      keys.add(w.key);
      if (![w.r, w.c, w.dr, w.dc].every(Number.isInteger)) return false;
      if (!L.dirs.some(([dr, dc]) => dr === w.dr && dc === w.dc)) return false;
      const er = w.r + w.dr * (w.key.length - 1), ec = w.c + w.dc * (w.key.length - 1);
      if ([w.r, w.c, er, ec].some(x => x < 0 || x >= n)) return false;
      if (cells(w, n).some((i, k) => G.grid[i] !== w.key[k])) return false;
      // A second copy of the word could be read but not found.
      if (occurrences(G.grid, n, w.key).length !== 1) return false;
    }
    if (!Array.isArray(G.found) || new Set(G.found).size !== G.found.length) return false;
    if (G.found.some(w => !Number.isInteger(w) || w < 0 || w >= G.words.length)) return false;
    return G.result === (G.found.length === G.words.length ? 'won' : '');
  }

  root.MotsMeles = { LEVELS, ALL, key, caps, random, newGame, themesFor, line, cells: (G, w) => cells(G.words[w], G.size),
    check, find, undo, hint, occurrences, searchCost, valid, withLevel, BLOCKED };
})(typeof window !== 'undefined' ? window : globalThis);
