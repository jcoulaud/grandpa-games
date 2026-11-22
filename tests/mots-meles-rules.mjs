// The mots mêlés without a browser: the word list, the grids, the pairs of letters, undo, the hint, that
// each level asks more reading than the one below, and the check of a save.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
require('../public/mots-meles/words.js');
require('../public/mots-meles/engine.js');
const M = globalThis.MotsMeles, THEMES = globalThis.MotsMelesThemes;
let fails = 0;
const ok = (c, m, extra = '') => { console.log((c ? 'PASS ' : 'FAIL ') + m + (c ? '' : ' ' + extra)); if (!c) fails++; };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const at = (G, r, c) => r * G.size + c;
const ends = (G, w) => { const c = M.cells(G, w); return [c[0], c[c.length - 1]]; };

// 1. The word list: plain words of 4 to 10 letters, with their accents, none twice in a theme.
{
  const all = THEMES.flatMap(t => t.words);
  ok(all.length >= 300 && THEMES.length >= 12, `${all.length} words in ${THEMES.length} themes`);
  const bad = all.filter(w => !/^[A-ZÀ-Ý][a-zà-ÿ]+$/.test(w) || M.key(w).length < 4 || M.key(w).length > 10 || !/^[A-Z]+$/.test(M.key(w)));
  ok(!bad.length, 'each word is one word of 4 to 10 letters, written with a capital', bad.join(', '));
  const twice = THEMES.filter(t => new Set(t.words.map(M.key)).size !== t.words.length).map(t => t.title);
  ok(!twice.length, 'no word comes twice in a theme', twice.join(', '));
  ok(M.key('Châtaigne') === 'CHATAIGNE' && M.key('Besançon') === 'BESANCON' && M.key('Glaïeul') === 'GLAIEUL', 'the grid drops the accents and the cedilla');
  ok(M.caps('Râteau') === 'RÂTEAU' && M.caps('Épicéa') === 'ÉPICÉA', 'the list and the messages keep the accents in capitals');
  for (const level of Object.keys(M.LEVELS)) ok(M.themesFor(level).length === THEMES.length, `${level}: every theme can fill a grid`);
}

// 2. The grids: the size and the words of the level, every word in its place, the directions of the level,
// no second copy of a word, nothing rude spelled by the filler, and a seed always gives the same grid.
for (const [level, L] of Object.entries(M.LEVELS)) {
  let bad = 0, copies = 0, rude = 0, dirs = new Set(), sizes = new Set(), themes = new Set();
  const start = Date.now();
  for (let seed = 1; seed <= 400; seed++) {
    const G = M.newGame(level, seed);
    if (!M.valid(G) || G.words.length !== L.words || !L.sizes.includes(G.size)) bad++;
    sizes.add(G.size); themes.add(G.theme);
    for (const w of G.words) {
      dirs.add(w.dr + ',' + w.dc);
      if (M.occurrences(G.grid, G.size, w.key).length !== 1) copies++;
      if (w.key.length < L.min || w.key.length > L.max) bad++;
    }
    const own = new Set(G.words.flatMap((w, k) => M.cells(G, k)));
    for (const b of M.BLOCKED) for (const cells of M.occurrences(G.grid, G.size, b)) if (cells.some(i => !own.has(i))) rude++;
  }
  const ms = (Date.now() - start) / 400;
  ok(!bad, `${level}: 400 grids of ${L.words} words, each in its place`, `${bad} bad`);
  ok(!copies, `${level}: no word can be read twice in the grid, in any direction`, `${copies} copies`);
  ok(!rude, `${level}: the filler letters spell no rude word`, `${rude} found`);
  ok(dirs.size === L.dirs.length, `${level}: the words go in the ${L.dirs.length} directions of the level`, [...dirs].join(' '));
  ok(themes.size === THEMES.length, `${level}: every theme comes up`, `${themes.size}`);
  ok(ms < 30, `${level}: a grid takes ${ms.toFixed(1)} ms to make`);
  if (level === 'facile') ok(sizes.has(8) && sizes.has(9), 'Facile makes grids of 8 and of 9 letters across');
  ok(same(M.newGame(level, 77), M.newGame(level, 77)) && M.newGame(level, 77).grid !== M.newGame(level, 78).grid, `${level}: a seed always gives the same grid`);
}
{
  const G = M.newGame('facile', 5);
  ok(M.newGame('facile', 5, [G.theme]).theme !== G.theme, 'a new grid avoids the themes just played');
  const ALLT = THEMES.map(t => t.title);
  ok(ALLT.includes(M.newGame('facile', 5, ALLT).theme), 'with every theme just played, a grid still comes');
  ok(M.newGame('expert', 5).level === 'facile', 'an unknown level makes a Facile grid');
}
// Facile only to the right and down, Moyen never backwards, Difficile also backwards.
{
  const backwards = level => { let n = 0; for (let s = 1; s <= 100; s++) for (const w of M.newGame(level, s).words) if (w.dc < 0 || (w.dc === 0 && w.dr < 0)) n++; return n; };
  ok(backwards('facile') === 0 && backwards('moyen') === 0, 'Facile and Moyen have no word written backwards');
  ok(backwards('fort') > 200, `Difficile writes words backwards: ${backwards('fort')} in 100 grids`);
  let diag = 0;
  for (let s = 1; s <= 100; s++) for (const w of M.newGame('facile', s).words) if (w.dr && w.dc) diag++;
  ok(diag === 0, 'Facile has no diagonal');
}

// 3. A pair of letters: the first and the last letter of a word, from either end, finds it.
{
  let G = M.newGame('moyen', 11);
  const [s, e] = ends(G, 0);
  let r = M.check(G, s, e);
  ok(r.kind === 'found' && r.w === 0, 'the first then the last letter find the word');
  ok(M.check(G, e, s).kind === 'found', 'the last then the first letter find it too');
  G = M.find(G, 0);
  ok(same(G.found, [0]) && !G.result, 'the word found is kept');
  ok(M.check(G, s, e).kind === 'already', 'a word found before says so');
  ok(M.check(G, s, s).kind === 'same', 'the same letter twice cancels');
  ok(M.find(G, 0) === G, 'a word cannot be found twice');
  // Two letters not on one line.
  const n = G.size;
  ok(M.check(G, at(G, 0, 0), at(G, 1, 2)).kind === 'notAligned', 'two letters off a line are refused');
  ok(M.line(G, at(G, 0, 0), at(G, 3, 3)).length === 4 && M.line(G, at(G, 0, 3), at(G, 3, 0)).length === 4 && M.line(G, at(G, 2, 0), at(G, 2, n - 1)).length === n, 'the lines across, down and in diagonal are read');
  // A line with letters that spell nothing gives the letters read, from the first click.
  let none = null;
  for (let row = 0; row < n && !none; row++) for (let c = 1; c < n && !none; c++) {
    const r2 = M.check(G, at(G, row, 0), at(G, row, c));
    if (r2.kind === 'none') none = { r2, row, c };
  }
  ok(none && none.r2.text === G.grid.slice(at(G, none.row, 0), at(G, none.row, none.c) + 1), 'a line that spells no word gives the letters read');
}
// Facile: a diagonal is refused for the level, with its own reason.
{
  const G = M.newGame('facile', 3);
  ok(M.check(G, at(G, 0, 0), at(G, 3, 3)).kind === 'direction', 'Facile refuses a diagonal and says why');
}
// "Presque": the right first letter, the wrong last one, along the word's line.
{
  const G = M.newGame('fort', 21);
  const w = G.words.findIndex(x => x.key.length >= 6);
  const c = M.cells(G, w);
  const r = M.check(G, c[0], c[c.length - 2]);
  ok(r.kind === 'almost' && r.w === w && r.end === 'start', 'a word cut short says its first letter is right');
  const r2 = M.check(G, c[1], c[c.length - 1]);
  ok(r2.kind === 'almost' && r2.end === 'end', 'a word started late says its last letter is right');
}

// 4. The whole grid: every word found wins, undo takes back the last word, a finished grid stays finished.
{
  let G = M.newGame('fort', 8);
  for (let w = 0; w < G.words.length - 1; w++) G = M.find(G, w);
  ok(!G.result, 'a word left: the grid is not won');
  const u = M.undo(G);
  ok(same(u.found, G.found.slice(0, -1)), 'undo takes back the last word found');
  ok(M.undo(M.newGame('fort', 8)).found.length === 0, 'undo with no word found changes nothing');
  G = M.find(G, G.words.length - 1);
  ok(G.result === 'won' && M.check(G, ...ends(G, 0)).kind === 'won', 'the last word wins, and then the grid is finished');
  ok(M.undo(G) === G && M.hint(G) === -1, 'a finished grid has no undo and no hint');
}

// 5. The hint goes through the words still to find, one after the other.
{
  let G = M.newGame('moyen', 4);
  G = M.find(M.find(G, 0), 2);
  const seen = [];
  let h = -1;
  for (let k = 0; k < 9; k++) { h = M.hint(G, h); seen.push(h); }
  ok(seen[0] === 1 && seen[1] === 3 && !seen.includes(0) && !seen.includes(2), 'the hint skips the words found', seen.join(','));
  ok(new Set(seen.slice(0, 7)).size === 7 && seen[7] === seen[0], 'the hint shows each word left before showing one again');
}

// 6. Each level asks more reading than the one below: a reader who goes over the grid row by row and reads
// along each direction of the level reads more letters before he finds each word.
{
  const avg = {};
  for (const level of Object.keys(M.LEVELS)) {
    let sum = 0;
    for (let s = 1; s <= 300; s++) sum += M.searchCost(M.newGame(level, s));
    avg[level] = sum / 300;
  }
  console.log(`     letters read on average: Facile ${avg.facile.toFixed(0)}, Moyen ${avg.moyen.toFixed(0)}, Difficile ${avg.fort.toFixed(0)}`);
  ok(avg.facile * 1.5 < avg.moyen && avg.moyen * 1.5 < avg.fort, 'each level asks at least half as much reading again as the one below');
  // Per word too, so the larger grids are not the only reason.
  const per = level => { let s = 0, n = 0; for (let k = 1; k <= 200; k++) { const G = M.newGame(level, k); s += M.searchCost(G); n += G.words.length; } return s / n; };
  ok(per('facile') < per('moyen') && per('moyen') < per('fort'), `each word asks more reading at each level: ${per('facile').toFixed(0)}, ${per('moyen').toFixed(0)}, ${per('fort').toFixed(0)}`);
}

// 7. Saves read back are checked: a broken one is refused, an old one without its level still loads.
{
  const G = M.find(M.newGame('moyen', 3), 1);
  ok(M.valid(G) && M.valid(JSON.parse(JSON.stringify(G))), 'a game in progress is a valid save, also through JSON');
  ok(!M.valid(null) && !M.valid({}) && !M.valid('x'), 'an empty save is refused');
  ok(!M.valid({ ...G, level: 'expert' }), 'an unknown level is refused');
  ok(!M.valid({ ...G, size: 12 }), 'a size the level does not have is refused');
  ok(!M.valid({ ...G, grid: G.grid.slice(1) }), 'a grid of the wrong length is refused');
  ok(!M.valid({ ...G, grid: 'é' + G.grid.slice(1) }), 'a grid with a letter that is not a capital is refused');
  const moved = { ...G, words: G.words.map((w, k) => k === 0 ? { ...w, c: (w.c + 1) % G.size } : w) };
  ok(!M.valid(moved), 'a word that is not in its place is refused');
  ok(!M.valid({ ...G, words: G.words.map((w, k) => k === 0 ? { ...w, key: w.key + 'S' } : w) }), 'a word whose letters do not match is refused');
  ok(!M.valid({ ...G, words: G.words.slice(1) }), 'a word missing is refused');
  ok(!M.valid({ ...G, found: [1, 1] }) && !M.valid({ ...G, found: [99] }) && !M.valid({ ...G, found: 'x' }), 'a list of words found that is broken is refused');
  ok(!M.valid({ ...G, result: 'won' }), 'a win with words left is refused');
  const F = M.newGame('facile', 3);
  ok(!M.valid({ ...F, words: F.words.map((w, k) => k === 0 ? { ...w, dr: 1, dc: 1 } : w) }), 'a diagonal in a Facile save is refused');
  const { level, ...bare } = G;
  ok(M.valid(M.withLevel(bare)) && M.withLevel(bare).level === 'moyen', 'a save without its level takes the level of its size');
  ok(!M.valid(M.withLevel({ ...bare, size: 12 })), 'a save without its level and with an unknown size is still refused');
  ok(M.withLevel(null) === null && M.withLevel(G) === G, 'withLevel leaves the rest alone');
}

console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
process.exit(fails ? 1 : 0);
