// The rules of the morpion, the computer players, the levels and the saves, without a browser.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
require('../public/morpion/engine.js');
const M = globalThis.Morpion;
let fails = 0;
const ok = (c, m, extra = '') => { console.log((c ? 'PASS ' : 'FAIL ') + m + (c ? '' : ' ' + extra)); if (!c) fails++; };
const X = 1, O = 2;
const N = 11, E = N - 1, MID = 5;
const at = (r, c, n = N) => r * n + c;
// A game from a list of moves, the cross first unless first is O.
const game = (level, moves, first = X) => M.restore({ level, first, moves });

// 1. The levels: the little morpion at Facile, the big one at Moyen and Difficile.
ok(M.LEVELS.facile.n === 3 && M.LEVELS.facile.k === 3, 'Facile is 3 by 3, three in a row');
ok(M.LEVELS.moyen.n === 11 && M.LEVELS.moyen.k === 5 && M.LEVELS.fort.n === 11 && M.LEVELS.fort.k === 5, 'Moyen and Difficile are 11 by 11, five in a row');
{
  const G = M.newGame('moyen');
  ok(G.first === X && M.turn(G) === X && !G.moves.length && !G.result, 'a new game is empty and the cross starts');
  ok(M.turn(M.newGame('moyen', O)) === O, 'the ring can start');
  ok(M.newGame('expert').level === 'facile', 'an unknown level is Facile');
}

// 2. Playing: turns, refusals, lines in each direction, the draw.
{
  let G = M.newGame('facile');
  G = M.play(G, 4);
  ok(M.board(G)[4] === X && M.turn(G) === O, 'a cross goes on the square, then the ring plays');
  ok(M.play(G, 4) === null && M.refusal(G, 4) === 'mine', 'a square with a cross is refused');
  G = M.play(G, 0);
  ok(M.refusal(G, 0) === 'theirs' && M.refusal(G, 8) === null, 'a square with a ring is refused, a free square is not');
  ok(M.play(G, 9) === null && M.play(G, -1) === null && M.play(G, 1.5) === null, 'a square off the board is refused');
  for (const [name, line] of [['row', [3, 4, 5]], ['column', [1, 4, 7]], ['diagonal', [0, 4, 8]], ['other diagonal', [2, 4, 6]]]) {
    const others = [0, 1, 2, 3, 5, 6, 7, 8].filter(c => !line.includes(c)).slice(0, 2);
    const W = game('facile', [line[0], others[0], line[1], others[1], line[2]]);
    ok(W.result && W.result.winner === X && W.result.line.join() === line.join(), `three in a ${name} wins, with its line`, JSON.stringify(W && W.result));
  }
  const D = game('facile', [4, 0, 8, 2, 1, 7, 6, 3, 5]);
  ok(D.result && D.result.winner === 0 && D.result.line === null, 'a full grid without a line is a draw');
  ok(M.play(game('facile', [0, 3, 1, 4, 2]), 8) === null && M.refusal(game('facile', [0, 3, 1, 4, 2]), 8) === 'over', 'no move after a win');
}
{
  const row = [0, 1, 2, 3].map(c => at(6, 3 + c));
  const G = game('moyen', [row[0], at(0, 0), row[1], at(0, 1), row[2], at(0, 2), row[3], at(0, 3)]);
  ok(!G.result, 'four in a row does not win the big morpion');
  const W = M.play(G, at(6, 7));
  ok(W.result.winner === X && W.result.line.length === 5, 'five in a row wins');
  const diag = game('moyen', [at(2, 2), at(0, E), at(3, 3), at(1, E), at(4, 4), at(2, E), at(5, 5), at(3, E), at(6, 6)]);
  ok(diag.result && diag.result.winner === X, 'five on a diagonal wins');
  const anti = game('moyen', [at(0, E), at(E, 0), at(1, E - 1), at(E, 1), at(2, E - 2), at(E, 2), at(3, E - 3), at(E, 3), at(4, E - 4)]);
  ok(anti.result && anti.result.winner === X, 'five on the other diagonal wins');
  // Six in a row also wins (freestyle): five, a gap, then the gap filled.
  const six = game('moyen', [at(8, 1), at(0, 0), at(8, 2), at(0, 2), at(8, 4), at(0, 4), at(8, 5), at(0, 6), at(8, 6), at(0, 8), at(8, 3)]);
  ok(six.result && six.result.winner === X && six.result.line.length === 6, 'six in a row wins, and the whole line is crossed out');
  const edge = game('moyen', [at(0, 7), at(5, 5), at(0, 8), at(5, 6), at(0, 9), at(6, 6), at(0, E), at(7, 7)]);
  ok(!edge.result && !M.play(edge, at(1, 0)).result, 'a line does not wrap round the edge of the board');
  const ring = game('moyen', [at(8, 0), at(3, 3), at(8, 2), at(3, 4), at(9, 5), at(3, 5), at(10, 0), at(3, 6), at(10, 5), at(3, 7)]);
  ok(ring.result && ring.result.winner === O, 'the ring wins with five too');
}

// 3. Undo takes back his cross and the computer's answer.
{
  const G = game('facile', [4, 0, 8]);
  ok(M.undo(G).moves.join() === '4,0', 'with the computer to play, undo takes back his cross only');
  ok(M.undo(game('facile', [4, 0])).moves.length === 0, 'undo takes back his cross and the answer');
  ok(M.undo(game('facile', [4], O)) === null, 'nothing to undo when only the computer has played');
  ok(M.undo(game('facile', [4, 0, 2], O)).moves.join() === '4', 'when the computer started, undo stops at its first ring');
  const lost = game('facile', [0, 4, 1, 2, 8, 6]);
  ok(lost.result.winner === O && M.undo(lost).moves.join() === '0,4,1,2' && !M.undo(lost).result, 'undo after a loss takes back the winning ring and his cross');
  let H = game('moyen', [at(6, 6), at(6, 7), at(7, 7), at(5, 5), at(8, 8)]);
  const back = [];
  while ((H = M.undo(H))) back.push(H.moves.length);
  ok(back.join() === '4,2,0', 'undo works back to the start, two marks at a time');
}

// 4. Saves: the moves replay, and a broken or old save is refused or read with a default.
{
  const G = game('moyen', [at(6, 6), at(6, 7), at(7, 7)]);
  const R = M.restore(JSON.parse(JSON.stringify(G)));
  ok(R && R.moves.join() === G.moves.join() && M.turn(R) === O, 'a save comes back with its moves and its turn');
  ok(M.restore({ level: 'moyen', first: X, moves: [at(6, 6), at(6, 6)] }) === null, 'a square played twice is refused');
  ok(M.restore({ level: 'moyen', first: X, moves: [N * N] }) === null, 'a square off the board is refused');
  ok(M.restore({ level: 'facile', first: X, moves: [0, 3, 1, 4, 2, 5] }) === null, 'a move after the end is refused');
  ok(M.restore({ level: 'moyen', moves: ['a'] }) === null, 'a move that is not a number is refused');
  ok(M.restore(null) === null && M.restore({}) === null && M.restore({ moves: 'abc' }) === null, 'an empty or broken save is refused');
  const old = M.restore({ moves: [4, 0] });
  ok(old && old.level === 'facile' && old.first === X, 'a save without a level or first player reads as Facile, the cross first');
  ok(M.restore({ level: 'expert', first: 7, moves: [] }).level === 'facile', 'a save with an unknown level reads as Facile');
  ok(M.restore({ level: 'expert', moves: [100] }) === null, 'an unknown level with big-board moves is refused, not misread');
  const won = game('facile', [0, 3, 1, 4, 2]);
  ok(M.restore({ level: 'facile', first: X, moves: won.moves }).result.winner === X, 'a finished game keeps its result');
}

// The older 13 by 13 sheet: a save of that size goes on with it, any other size is the new sheet.
{
  ok(M.restore({ level: 'moyen', first: X, n: 13, moves: [168] }).n === 13, 'a save of the 13 by 13 sheet keeps its size');
  ok(M.restore({ level: 'fort', first: X, moves: [] }).n === N && M.restore({ level: 'moyen', n: 7, moves: [] }).n === N, 'a save without a size, or a wrong one, is the 11 by 11 sheet');
  ok(M.restore({ level: 'facile', n: 13, moves: [] }).n === 3, 'the little morpion stays 3 by 3');
  let bad = null;
  try { bad = M.restore({ level: { toString: null }, moves: [] }); } catch (e) { bad = e; }
  ok(bad && bad.level === 'facile', 'a level that is not a word reads as Facile, without an error');
}
// Difficile prefers a draw to a loss when the sheet is nearly full (a 13 by 13 position).
{
  const n = 13, b = [];
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) b.push((r % 2 === 0) === (c % 4 < 2) ? X : O);
  b[60] = O;
  for (const c of [59, 73, 85, 97]) b[c] = 0;
  const xs = [...b.keys()].filter(c => b[c] === X), os = [...b.keys()].filter(c => b[c] === O);
  const moves = xs.flatMap((c, i) => i < os.length ? [c, os[i]] : [c]);
  const G = M.restore({ level: 'fort', first: X, n, moves });
  ok(G && M.turn(G) === O && M.think(G, 'fort').cell !== 97, 'Difficile does not play the one move that loses a drawn end');
}

// 5. The patterns the computer reads.
{
  const nb = M.nbOf(N);
  const B = (xs, os) => { const b = new Uint8Array(N * N); xs.forEach(c => { b[c] = X; }); os.forEach(c => { b[c] = O; }); return b; };
  ok(M.maxCls(B([at(6, 3), at(6, 4), at(6, 5), at(6, 6)], []), nb, at(6, 7), X) === 8, 'four in a row and one more is five');
  ok(M.maxCls(B([at(6, 3), at(6, 4), at(6, 6), at(6, 7)], []), nb, at(6, 5), X) === 8, 'the gap of a broken four is five');
  ok(M.maxCls(B([at(6, 4), at(6, 5), at(6, 6)], []), nb, at(6, 7), X) === 7, 'an open three becomes an open four');
  ok(M.maxCls(B([at(6, 4), at(6, 5), at(6, 6)], [at(6, 3)]), nb, at(6, 7), X) === 6, 'a blocked three becomes a four only');
  ok(M.maxCls(B([at(6, 5), at(6, 6)], []), nb, at(6, 7), X) === 5, 'an open two becomes an open three');
  ok(M.cls(B([at(6, 1), at(6, 2), at(6, 3)], [at(6, 4)]), nb, at(6, 0), X, 0) === 0, 'a line with no room for five is worth nothing');
  ok(M.maxCls(B([at(0, E - 2), at(0, E - 1), at(0, E)], []), nb, at(0, E - 3), X) === 6, 'the edge of the board blocks like a ring');
  const b = B([at(6, 4), at(6, 5), at(6, 6), at(3, 8), at(4, 8)], [at(6, 3)]);
  const v = M.vcf(b, N, X, 10, { nodes: 1000 });
  ok(v && v.length === 3, 'the threat search finds a win by fours', JSON.stringify(v));
  ok(!M.vcf(B([at(6, 4), at(6, 5)], []), N, X, 10, { nodes: 1000 }), 'and finds none where there is none');
}

// 6. The computer always plays a free square, takes a five and blocks one.
{
  const r = M.rng(9);
  let bad = 0;
  for (const level of ['facile', 'moyen', 'fort']) for (let g = 0; g < (level === 'fort' ? 3 : 20); g++) {
    let G = M.newGame(level, g % 2 ? O : X);
    while (!G.result) {
      const b = M.board(G), free = [...b.keys()].filter(c => !b[c]);
      const c = M.turn(G) === O ? M.think(G, level).cell : free[Math.floor(r() * free.length)];
      const next = M.play(G, c);
      if (!next) { bad++; break; }
      G = next;
    }
  }
  ok(!bad, 'every level plays only free squares, to the end of the game', `${bad} bad`);
  const four = game('moyen', [at(6, 3), at(0, 0), at(6, 4), at(0, 2), at(6, 5), at(E, E), at(6, 6)]);
  for (const level of ['moyen', 'fort']) ok([at(6, 2), at(6, 7)].includes(M.think(four, level).cell), `${level} blocks four crosses`);
  const mine = game('moyen', [at(0, 0), at(5, 3), at(0, 2), at(5, 4), at(E, E), at(5, 5), at(E, E - 2), at(5, 6), at(6, 6)]);
  for (const level of ['moyen', 'fort']) ok([at(5, 2), at(5, 7)].includes(M.think(mine, level).cell), `${level} takes its own five before blocking`);
  const three = game('moyen', [at(6, 4), at(0, 0), at(6, 5), at(0, E), at(6, 6)]);
  ok([at(6, 3), at(6, 7), at(6, 2), at(6, 8)].includes(M.think(three, 'fort').cell), 'Difficile blocks an open three');
  ok(M.think(three, 'fort').cell === M.think(three, 'fort').cell && M.think(three, 'moyen').cell === M.think(three, 'moyen').cell,
    'the same position always gets the same answer');
  ok(M.think(M.newGame('fort', O), 'fort').cell === at(MID, MID), 'on an empty sheet the computer starts in the middle');
}

// 7. The levels. Facile loses to the perfect player of the little morpion and never beats it.
{
  const tally = { won: 0, lost: 0, draw: 0 };
  for (let g = 0; g < 400; g++) {
    // The computer to test plays the ring. The perfect player starts every other game, and the first
    // squares of the perfect player vary so the games differ.
    let G = M.newGame('facile', g % 2 ? O : X);
    const r = M.rng(g + 1);
    while (!G.result) {
      const c = M.turn(G) === X ? (G.moves.length < 2 && r() < 0.5 ? [0, 2, 6, 8, 4].find(s => !M.board(G)[s]) : M.perfect3(M.board(G), X)) : M.think(G, 'facile').cell;
      G = M.play(G, c);
    }
    tally[G.result.winner === O ? 'won' : G.result.winner === X ? 'lost' : 'draw']++;
  }
  ok(tally.won === 0 && tally.lost >= 120, `Facile never beats the perfect player and loses often: ${JSON.stringify(tally)}`);
  // The perfect player never loses to itself and draws.
  let G = M.newGame('facile');
  while (!G.result) G = M.play(G, M.perfect3(M.board(G), M.turn(G)));
  ok(G.result.winner === 0, 'the perfect player against itself draws');
}
// A match on the big board. Each game opens with two marks each near the middle, at random, so the
// games differ; the players take turns to start.
function match(a, b, games) {
  const tally = { a: 0, b: 0, draw: 0 };
  for (let g = 0; g < games; g++) {
    const r = M.rng(1000 + g);
    let G = M.newGame('moyen', g % 2 ? O : X);
    for (let i = 0; i < 4; i++) G = M.play(G, at(MID - 1 + Math.floor(r() * 3), MID - 1 + Math.floor(r() * 3))) || G;
    while (!G.result) G = M.play(G, (M.turn(G) === X ? a : b)(G, r));
    tally[G.result.winner === X ? 'a' : G.result.winner === O ? 'b' : 'draw']++;
  }
  return tally;
}
const randomPlayer = (G, r) => { const cs = M.candidates(M.board(G), G.n); return cs[Math.floor(r() * cs.length)]; };
// Greedy: it makes its longest line, and never blocks.
const greedyPlayer = G => {
  const b = M.board(G), nb = M.nbOf(G.n), p = M.turn(G);
  let best = -1, top = -1;
  for (const c of M.candidates(b, G.n)) { const v = M.info(b, nb, c, p).v; if (v > top) { top = v; best = c; } }
  return best;
};
const level = name => G => M.think(G, name).cell;
{
  const vsRandom = match(level('moyen'), randomPlayer, 20);
  ok(vsRandom.a === 20, `Moyen beats a random player every time: ${JSON.stringify(vsRandom)}`);
  const vsGreedy = match(level('moyen'), greedyPlayer, 20);
  ok(vsGreedy.a >= 18, `Moyen beats a greedy player that never blocks: ${JSON.stringify(vsGreedy)}`);
  const t0 = Date.now();
  const strong = match(level('fort'), level('moyen'), 16);
  ok(strong.a >= 10 && strong.a >= 3 * strong.b, `Difficile beats Moyen most of the time: ${JSON.stringify(strong)}`);
  console.log(`  (16 games in ${((Date.now() - t0) / 1000).toFixed(1)} s)`);
}

// 8. The hint and the warnings.
{
  const h3 = M.hint(game('facile', [0, 4, 1, 8]));
  ok(h3.cell === 2 && /trois croix et vous gagnez/.test(h3.why), 'the hint of the little morpion takes the win', JSON.stringify(h3));
  const block3 = M.hint(game('facile', [0, 4, 8, 2]));
  ok(block3.cell === 6 && /bloquez deux ronds/.test(block3.why), 'the hint blocks two rings', JSON.stringify(block3));
  ok(/centre/.test(M.hint(M.newGame('facile')).why), 'the hint starts in the centre');
  const big = game('moyen', [at(0, 0), at(6, 4), at(0, 2), at(6, 5), at(E, E), at(6, 6)]);
  const hb = M.hint(big);
  ok([at(6, 3), at(6, 7), at(6, 2), at(6, 8)].includes(hb.cell) && hb.why === 'Ici, vous bloquez trois ronds alignés.', 'the hint blocks three rings and says so', JSON.stringify(hb));
  ok(M.danger(big) === 'three', 'three rings in a row are a danger');
  const four = game('moyen', [at(0, 0), at(6, 3), at(0, 2), at(6, 4), at(E, E), at(6, 5), at(E, E - 2), at(6, 6)]);
  const hf = M.hint(four);
  ok(M.danger(four) === 'wins' && /à plusieurs endroits, et une croix n’en bloque qu’un/.test(hf.why) && !/empêchez/.test(hf.why), 'four rings open at both ends are a danger on two squares, and the hint does not claim that one cross stops them: ' + hf.why);
  // The review's game at Moyen: three rings with a gap, then two squares that make five.
  const gap3 = game('moyen', [32, 54, 0, 76, 27, 87]);
  const hg3 = M.hint(gap3);
  ok(M.danger(gap3) === 'gap' && hg3.cell === 65 && /trou entre trois ronds/.test(hg3.why) && !/alignés/.test(hg3.why), 'three rings with a gap are a danger of their own, and the hint fills the gap: ' + hg3.why);
  const two = game('moyen', [32, 54, 0, 76, 27, 87, 17, 65]);
  const ht = M.hint(two);
  ok(M.danger(two) === 'wins' && /plusieurs endroits/.test(ht.why) && !/empêchez/.test(ht.why), 'two squares that make five: the hint says one cross cannot stop both: ' + ht.why);
  const fork3 = M.hint(game('facile', [4, 1, 0, 8, 6], O));
  ok(/trois ronds à plusieurs endroits/.test(fork3.why) && !/bloquez deux ronds/.test(fork3.why), 'on the little grid too, two winning squares are said plainly: ' + fork3.why);
  const gap = game('moyen', [at(0, 0), at(6, 2), at(0, 2), at(6, 3), at(E, E), at(6, 5), at(E, E - 2), at(6, 6)]);
  const hg = M.hint(gap);
  ok(M.danger(gap) === 'win' && hg.cell === at(6, 4) && hg.why === 'Ici, vous empêchez l’ordinateur d’aligner cinq ronds.', 'four rings with a gap are a danger on one square, and the hint fills the gap without saying "four in a row"', JSON.stringify(hg));
  ok(M.danger(game('facile', [4, 8, 1, 5])) === null && M.hint(game('facile', [4, 8, 1, 5])).cell === 7, 'when he can win now, no warning to block, and the hint takes the win');
  const nowin = game('moyen', [at(6, 3), at(0, 0), at(6, 4), at(0, 1), at(6, 5), at(0, 2), at(6, 6), at(0, 3)]);
  ok(M.danger(nowin) === null, 'on the big sheet too, no warning when he can make five now');
  ok(M.hint(game('facile', [3, 6, 5, 4])).cell === 2, 'a lost little morpion still blocks the next line instead of losing at once');
  const opened = M.hint(game('moyen', [at(MID, MID)], O));
  ok(!/vos croix/.test(opened.why), 'after the computer opens, the hint does not speak of crosses he has not played: ' + opened.why);
  const win = game('moyen', [at(6, 3), at(0, 0), at(6, 4), at(0, 2), at(6, 5), at(0, 4), at(6, 6), at(E, E)]);
  ok(/cinq croix et vous gagnez/.test(M.hint(win).why), 'the hint finds his five');
  ok(/milieu/.test(M.hint(M.newGame('moyen')).why) && M.hint(M.newGame('moyen')).cell === at(MID, MID), 'the hint starts in the middle of the sheet');
  const blocked = game('moyen', [at(6, 4), at(0, 0), at(6, 5), at(0, E), at(6, 6), at(6, 7)]);
  ok(M.blocked(blocked, at(6, 7)) === 'three', 'a ring that stops an open three is seen as a block');
  ok(M.danger(game('facile', [0, 4, 8, 2])) === 'win', 'two rings in a line of the little morpion are a danger');
}

// Several winning squares on the little grid: the hint says so, and offers to block only on one of them.
{
  let A = M.newGame('facile'); for (const c of [1, 0, 5, 4, 7, 6]) A = M.play(A, c);
  const ha = M.hint(A);
  ok(/plusieurs endroits/.test(ha.why), 'three winning squares: the hint says several places', ha.why);
  let B = M.newGame('facile'); for (const c of [1, 5, 3]) B = M.play(B, c);
  const hb = M.hint(B), wins = [2, 8];
  ok(wins.includes(hb.cell) || !/bloquez ici/.test(hb.why), 'a hint square that blocks no win does not say "bloquez ici"', `${hb.cell} ${hb.why}`);
}

console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
process.exit(fails ? 1 : 0);
