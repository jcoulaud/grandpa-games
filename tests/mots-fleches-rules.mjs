// The mots fléchés without a browser: the word bank, every grid of grids.js, the grid maker, that each
// level is harder than the one below, typing, the check, the hint and the check of a save.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
require('../public/mots-fleches/words.js');
require('../public/mots-fleches/grids.js');
require('../public/mots-fleches/engine.js');
const M = globalThis.MotsFleches, BANK = globalThis.MotsFlechesWords, GRIDS = globalThis.MotsFlechesGrids;
let fails = 0;
const ok = (c, m, extra = '') => { console.log((c ? 'PASS ' : 'FAIL ') + m + (c ? '' : ' ' + extra)); if (!c) fails++; };
const LEVELS = ['facile', 'moyen', 'fort'];
const byWord = new Map(BANK.map(e => [e[0], e]));

// 1. The bank: thousands of words, each written as the grid writes it, with a short definition in
// French typography, and no word twice.
{
  ok(BANK.length >= 3000, `${BANK.length} words in the bank`);
  const bad = BANK.filter(([w, t, d, h]) => !/^[A-Z]{2,12}$/.test(w) || ![1, 2, 3].includes(t) || typeof d !== 'string' || !d || d.length > 26
    || typeof h !== 'string' || h.length > 26 || /'/.test(d + h) || d !== d.trim() || /[.]$/.test(d.replace(/\.\.\.$/, '')));
  ok(!bad.length, 'each word is in capitals without accents, with a tier and a definition of 26 characters or less', bad.slice(0, 5).map(e => e.join('|')).join(', '));
  ok(byWord.size === BANK.length, 'no word comes twice');
  // A definition never gives the word away.
  const gives = BANK.filter(([w, , d, h]) => w.length > 2 && [d, h].some(s => M.key(s).split(/[^A-Z]+/).includes(w)));
  ok(!gives.length, 'no definition contains its word', gives.slice(0, 5).map(e => e[0]).join(', '));
  const tiers = [1, 2, 3].map(t => BANK.filter(e => e[1] === t).length);
  ok(tiers.every(n => n >= 400), `the three tiers have ${tiers.join(', ')} words`);
  const short = BANK.filter(e => e[0].length <= 4).length;
  ok(short >= 1000, `${short} words of 2 to 4 letters, which fill the grids`);
  ok(BANK.filter(e => e[3]).length >= BANK.length / 2, 'most words have a harder definition for Difficile');
  ok(M.key('Épée') === 'EPEE' && M.key('cœur') === 'COEUR' && M.key('ç') === 'C', 'the grid drops the accents: É is E, Œ is OE');
}

// 2. Every grid of grids.js: its size, the frame, every run of two letters a word of the level, no word
// twice, every letter in a word, every definition cell with one or two definitions, few words of two
// letters. The arrows: each starts at its definition cell and enters the first letter of its word.
const stats = {};
for (const level of LEVELS) {
  const L = M.LEVELS[level], list = GRIDS[level], bank = M.index(level).words, lim = M.LIMITS[level];
  let bad = 0, arrows = 0, poor = 0;
  const s = stats[level] = { grids: list.length, tier: 0, hard: 0, words: 0, letters: 0, given: 0, cells: L.cols * L.rows, len: 0 };
  for (let n = 0; n < list.length; n++) {
    const grid = list[n];
    if (!M.sound(L.cols, L.rows, grid, bank)) { bad++; continue; }
    const q = M.shape(L.cols, L.rows, grid);
    if (q.twos > lim.twos || q.single > lim.single || q.side > lim.side) poor++;
    for (const w of M.words(L.cols, L.rows, grid)) {
      const [r0, c0] = [Math.floor(w.cells[0] / L.cols), w.cells[0] % L.cols], [r, c] = [Math.floor(w.clue / L.cols), w.clue % L.cols];
      const good = { right: r === r0 && c + 1 === c0 && w.dir === 'h', down: c === c0 && r + 1 === r0 && w.dir === 'v',
        rightDown: r === 0 && r0 === 0 && c + 1 === c0 && w.dir === 'v', downRight: c === 0 && c0 === 0 && r + 1 === r0 && w.dir === 'h' }[w.arrow];
      if (!good) arrows++;
    }
    const G = M.newGame(level, n), x = M.weight(G);
    s.tier += x.tier; s.hard += x.hard; s.words += x.words; s.letters += x.letters; s.given += x.given;
    s.len += M.wordsOf(G).reduce((a, w) => a + w.cells.length, 0) / x.words;
  }
  for (const k of ['tier', 'hard', 'words', 'letters', 'given', 'len']) s[k] = +(s[k] / list.length).toFixed(2);
  ok(list.length >= 250 && new Set(list).size === list.length, `${level}: ${list.length} different grids, enough for months of daily play`);
  ok(!bad, `${level}: every grid is ${L.cols} by ${L.rows} cells, with the frame, words of the level and no word twice`, `${bad} bad`);
  ok(!poor, `${level}: every grid has at most ${lim.twos} words of two letters, ${lim.single} letters in one word only and ${lim.side} definition cells side by side`, `${poor} poor`);
  ok(!arrows, `${level}: every arrow leaves its definition cell into the first letter of its word`, `${arrows} wrong`);
}

// 3. Each level is harder than the one below: a larger grid with more words to find, rarer words (the
// tier of the bank, 1 very common to 3 rare), longer words, and at Difficile the harder definitions.
// Facile gives the first letter of each word.
{
  const [f, m, d] = LEVELS.map(l => stats[l]);
  console.log('     ' + LEVELS.map(l => `${l}: ${JSON.stringify(stats[l])}`).join('\n     '));
  ok(f.cells < m.cells && m.cells < d.cells && f.words < m.words && m.words < d.words && f.letters < m.letters && m.letters < d.letters,
    `the grids grow: ${f.cells}, ${m.cells} and ${d.cells} cells, ${f.words}, ${m.words} and ${d.words} words`);
  ok(f.tier === 1 && m.tier > f.tier + .2 && d.tier > m.tier + .2, `the words get rarer: average tier ${f.tier}, ${m.tier} and ${d.tier}`);
  ok(f.len <= m.len && m.len <= d.len + .05, `the words are as long or longer: ${f.len}, ${m.len} and ${d.len} letters`);
  ok(f.hard === 0 && m.hard === 0 && d.hard >= .5, `Difficile takes the harder definitions: ${Math.round(d.hard * 100)} % of its words`);
  ok(f.given > 10 && m.given === 0 && d.given === 0, `Facile gives the first letter of each word: ${f.given} letters given on average`);
}

// 4. The grid maker: a seed always makes the same grid, a sound one, within the limits of its level.
// The seeds are those of the first grids of grids.js, so the test runs fast.
const SEEDS = { facile: 1000517, moyen: 1000101, fort: 1000005 };
for (const level of LEVELS) {
  const L = M.LEVELS[level], t = Date.now();
  const a = M.make(level, SEEDS[level]), b = M.make(level, SEEDS[level]);
  const q = a && M.shape(L.cols, L.rows, a);
  ok(a && a === b && GRIDS[level].includes(a) && M.sound(L.cols, L.rows, a, M.index(level).words) && q.twos <= M.LIMITS[level].twos, `${level}: make() fills a sound grid from a seed, the same each time, as in grids.js (${Date.now() - t} ms)`);
}

// 5. Playing: a letter goes in a cell, accents are dropped, the letters given stay, « Vérifier » finds the
// wrong letters, the hint fixes a wrong letter first, then fills, and following it wins.
{
  let G = M.newGame('facile', 0);
  const ws = M.wordsOf(G), w = ws.find(x => x.cells.length >= 3), first = w.cells[0], second = w.cells[1];
  ok(G.given[first] === '1' && G.typed[first] === G.grid[first], 'Facile writes the first letter of each word');
  ok(M.write(G, first, 'Z') === G, 'a letter given by the game cannot be changed');
  G = M.write(G, second, 'é');
  ok(G.typed[second] === 'E', 'a letter with an accent is written without it: é is E');
  ok(M.write(G, second, '7') === G, 'a figure is not written');
  const wrongLetter = G.grid[second] === 'Q' ? 'W' : 'Q';
  G = M.write(G, second, wrongLetter);
  ok(M.mistakes(G).includes(second), '« Vérifier » finds a wrong letter');
  G = M.mark(G);
  ok(G.wrong[second] === '1', 'the wrong letter is marked');
  const fixed = M.hint(G, ws.indexOf(w));
  ok(fixed.i === second && fixed.fixed && fixed.G.typed[second] === G.grid[second] && fixed.G.given[second] === '1' && fixed.G.wrong[second] === '0',
    'the hint first fixes the wrong letter of the word he is on, and keeps it');
  G = fixed.G;
  ok(M.write(G, second, '') === G, 'a letter of the hint stays');
  // The hint, again and again, fills the whole grid and wins.
  let steps = 0;
  while (!G.result && steps < 500) { G = M.hint(G, 0).G; steps++; }
  ok(G.result === 'won' && M.solved(G) && M.hint(G, 0) === null, `following the hint wins, in ${steps} letters`);
  ok(M.valid(G), 'a won game is a valid save');
  // Writing every letter wins too.
  let H = M.newGame('moyen', 3);
  for (let i = 0; i < H.grid.length; i++) if (H.grid[i] !== '#') H = M.write(H, i, H.grid[i].toLowerCase());
  ok(H.result === 'won', 'writing every letter, even in small letters, wins');
  ok(M.write(H, H.grid.indexOf('#') + 1, 'A') === H, 'a finished grid takes no more letters');
}

// 6. A save read back: a good one loads, a broken one does not.
{
  const G = M.write(M.newGame('fort', 7), M.wordsOf(M.newGame('fort', 7))[0].cells[0], 'A');
  ok(M.valid(G) && M.valid(JSON.parse(JSON.stringify(G))), 'a game in progress is a valid save');
  const broken = [
    { ...G, v: 2 }, { ...G, level: 'normal' }, { ...G, cols: 11 }, { ...G, grid: G.grid.replace('#', 'A') },
    { ...G, typed: G.typed.slice(1) }, { ...G, typed: G.typed.replace('#', ' ') }, { ...G, defs: G.defs.slice(1) },
    { ...G, given: G.given.replace('0', '1') }, { ...G, result: 'won' }, { ...G, wrong: '2' + G.wrong.slice(1) }, null, 'x',
  ];
  ok(broken.every(b => !M.valid(b)), 'a broken save is refused');
}

// 7. The definitions of a game: the plain one at Facile and Moyen, the harder one at Difficile when the
// bank has one.
{
  const e = BANK.find(x => x[3] && x[1] === 1);
  ok(M.define('facile', e[0]) === e[2] && M.define('moyen', e[0]) === e[2] && M.define('fort', e[0]) === e[3], `${e[0]}: « ${e[2]} », and « ${e[3]} » at Difficile`);
}

if (fails) { console.log(`${fails} FAILED`); process.exit(1); }
console.log('All passed');
