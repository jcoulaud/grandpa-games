// The rules of the démineur, the board maker and the hint, without a browser.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
require('../public/demineur/engine.js');
const D = globalThis.Demineur;
let fails = 0;
const ok = (c, m, extra = '') => { console.log((c ? 'PASS ' : 'FAIL ') + m + (c ? '' : ' ' + extra)); if (!c) fails++; };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// 1. Neighbours: 3 in a corner, 5 on an edge, 8 inside.
const nb = D.neighbours(9, 9);
ok(nb[0].length === 3 && nb[4].length === 5 && nb[40].length === 8, 'neighbours of a corner, an edge and an inside square');

// 2. Boards: for each level and each kind of first square, the first square and its neighbours hold no
// mine, the board has its mines, the reasoning clears it, and the same seed gives the same board.
for (const [level, L] of Object.entries(D.LEVELS)) {
  const firsts = [0, L.w - 1, (L.h - 1) * L.w, L.w * L.h - 1, 3, L.w * 4, Math.floor(L.h / 2) * L.w + Math.floor(L.w / 2)];
  let bad = 0, worst = 0;
  for (let seed = 1; seed <= 200; seed++) {
    const first = firsts[seed % firsts.length];
    const t = performance.now();
    const layout = D.makeLayout(level, seed, first);
    worst = Math.max(worst, performance.now() - t);
    const safe = [first, ...D.neighbours(L.w, L.h)[first]];
    if (layout.length !== L.mines || new Set(layout).size !== L.mines || safe.some(i => layout.includes(i)) || !D.clears(level, layout, first)) bad++;
  }
  ok(!bad, `${level}: 200 boards open safely and clear without a guess`, `${bad} bad`);
  ok(worst < 200, `${level}: the slowest board took ${worst.toFixed(1)} ms`);
  ok(same(D.makeLayout(level, 77, 5), D.makeLayout(level, 77, 5)), `${level}: the same seed and first square give the same board`);
}

// A game with a given layout.
const game = (level, layout, first = -1) => ({ ...D.newGame(level, 1), layout, first: first < 0 ? layout.length ? 0 : -1 : first });

// 3. Opening: a 0 opens its area, a mine ends the game, the last safe square wins and flags the mines.
{
  // A 9 by 9 board with mines on the last row and on the first square of row 7.
  const layout = [63, 72, 73, 74, 75, 76, 77, 78, 79, 80];
  let G = game('facile', layout);
  G = D.open(G, 0);
  const open = [...G.cells].filter(c => c === 'o').length;
  ok(open === 81 - 10 && G.result === 'won' && [...G.cells].filter(c => c === 'f').length === 10, 'opening a 0 opens its area, and the last safe square wins with flags', `open ${open} ${G.result}`);
  let H = D.open(game('facile', layout), 72);
  ok(H.result === 'lost' && H.boom === 72, 'a mine ends the game and is the one that goes off');
}

// 4. Opening around a number: with a wrong flag, a mine goes off; with the right flags, the squares open.
{
  // Mines in a corner block: square 10 (row 1, col 1) is a 3 with mines on 0, 1, 9.
  const layout = [0, 1, 9, 80, 79, 78, 71, 70, 69, 62];
  let G = { ...game('facile', layout), first: 40 };
  G = { ...G, cells: G.cells.split('').map((c, i) => i === 10 ? 'o' : c).join('') };
  ok(D.number(G, 10) === 3, 'square 10 is a 3');
  const right = D.openAround(['0', '1', '9'].reduce((g, i) => D.flag(g, +i), G), 10);
  ok(right.result === 'won' && [2, 11, 18, 19, 20].every(i => right.cells[i] === 'o'), 'the right flags open the other squares around, and the flood wins here');
  const wrong = D.openAround([0, 1, 2].reduce((g, i) => D.flag(g, i), G), 10);
  ok(wrong.result === 'lost' && wrong.boom === 9, 'a wrong flag makes a mine go off');
}

// 5. The reasoning on small positions. K: a number for an open square, -2 for a known mine, -1 closed.
{
  const _ = -1;
  // A 1 next to a 2 on the edge of a 4 by 2 board: 1 2 _ _ / _ _ _ _ is not enough alone, but the
  // classic 1-2 on a wall is. Row 0 open: 1 1 _ ... the 1 at the corner shares its squares with its neighbour.
  // Board 3 wide, 2 high: [1, 1, 1] over [_, _, _] with one mine: the corner 1 sees 3 and 4, the middle 1
  // sees 3, 4, 5. So 5 is safe (two numbers).
  const s = D.step([1, 1, 1, _, _, _], 3, 2, 1, true);
  ok(s && s.kind === 'safe' && s.rule === 'two' && same(s.cells, [5]) && s.a === 0 && s.b === 1, 'two numbers: the extra square is safe', JSON.stringify(s));
  // [1, 2, 1] over three closed squares with two mines: 3 and 5 are mines (two numbers), 4 is then safe.
  const m = D.step([1, 2, 1, _, _, _], 3, 2, 2, true);
  ok(m && m.kind === 'mine' && m.rule === 'two', 'two numbers: the extra square is a mine', JSON.stringify(m));
  ok(D.step([1, 2, 1, _, _, _], 3, 2, 2, false) === null, 'without two numbers (Facile), nothing follows');
  // One number with its flag: the rest is safe. One number with as many closed squares as mines.
  const one = D.step([1, -2, _, _, _, _], 3, 2, 1, false);
  ok(one && one.kind === 'safe' && one.rule === 'one' && same(one.cells, [3, 4]), 'one number with its flag: the others are safe', JSON.stringify(one));
  const full = D.step([_, 1, 0, 1, 1, 0], 3, 2, 1, false);
  ok(full && full.kind === 'mine' && same(full.cells, [0]), 'one number with one closed square: a mine', JSON.stringify(full));
  const count = D.step([-2, 1, _, 1, 1, _], 3, 2, 1, false);
  ok(count && count.kind === 'safe' && count.rule !== 'two', 'every mine found: the closed squares are safe', JSON.stringify(count));
}

// 6. Following the hint wins every game, on every level, even after a wrong flag.
for (const level of Object.keys(D.LEVELS)) {
  let won = 0, wrongSeen = 0, start = 0;
  for (let seed = 1; seed <= 60; seed++) {
    let G = D.newGame(level, seed);
    if (D.hint(G).kind === 'start') start++;
    G = D.open(G, (seed * 13) % (G.w * G.h));
    // A wrong flag on the first closed square that has no mine.
    const free = [...G.cells].findIndex((c, i) => c === '.' && !D.isMine(G, i));
    if (free >= 0) G = D.flag(G, free);
    for (let n = 0; n < 500 && !G.result; n++) {
      const h = D.hint(G);
      if (h.kind === 'wrong') { wrongSeen++; G = D.flag(G, h.cell); continue; }
      if (h.rule === 'peek') break;
      G = h.kind === 'safe' ? D.open(G, h.cell) : D.flag(G, h.cell);
    }
    if (G.result === 'won') won++;
  }
  ok(start === 60, `${level}: before the first click, the hint says to click anywhere`);
  ok(won === 60 && wrongSeen >= 50, `${level}: following the hint wins 60 games of 60, and it finds the wrong flag first`, `won ${won}, wrong ${wrongSeen}`);
}

// A flag taken off next to an open blank: the blank shows the square is safe, without a peek.
{
  let G = D.open(D.newGame('facile', 45), 0);
  G = D.flag(G, 14); G = D.open(G, 4); G = D.flag(G, 14); G = D.flag(G, 2);
  const h = D.hint(G);
  ok(G.cells[4] === 'o' && D.number(G, 4) === 0 && h && h.kind === 'safe' && h.a === 4 && h.cells.includes(14),
    'an open blank next to a closed square shows that square is safe', JSON.stringify(h));
}

// 7. Undo of the first click: the same square gives the same board again.
{
  const G = D.newGame('moyen', 1234);
  ok(same(D.open(G, 30).layout, D.open(G, 30).layout), 'the same first square gives the same board after an undo');
}

console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
process.exit(fails ? 1 : 0);
