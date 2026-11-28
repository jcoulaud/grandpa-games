// The rules of the code secret, the clues, the hint and the levels, without a browser.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
require('../public/code-secret/engine.js');
const C = globalThis.CodeSecret;
let fails = 0;
const ok = (c, m, extra = '') => { console.log((c ? 'PASS ' : 'FAIL ') + m + (c ? '' : ' ' + extra)); if (!c) fails++; };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const fill = (G, guess) => guess.reduce((g, c, i) => C.place(g, i, c), G);

// 1. The codes: the size and the colours of each level, no colour twice at Facile, and a seed always gives the same code.
for (const [level, L] of Object.entries(C.LEVELS)) {
  let bad = 0;
  const seen = new Set();
  for (let seed = 1; seed <= 300; seed++) {
    const G = C.newGame(level, seed);
    if (G.code.length !== L.holes || G.code.some(c => c < 0 || c >= L.colors) || (!L.repeat && new Set(G.code).size !== L.holes) || !C.valid(G)) bad++;
    G.code.forEach(c => seen.add(c));
  }
  ok(!bad, `${level}: 300 codes of ${L.holes} pegs in ${L.colors} colours${L.repeat ? '' : ', each colour once'}`, `${bad} bad`);
  ok(seen.size === L.colors, `${level}: every colour shows up in the codes`);
  ok(same(C.newGame(level, 77), C.newGame(level, 77)), `${level}: a seed always gives the same code`);
}
ok(same(C.LEVELS.facile, { holes: 4, colors: 6, repeat: false, rows: 12 }) && same(C.LEVELS.moyen, { holes: 4, colors: 6, repeat: true, rows: 10 })
  && same(C.LEVELS.fort, { holes: 5, colors: 8, repeat: true, rows: 10 }), 'the levels: 4 of 6 without repeats in 12 rows, 4 of 6 in 10, 5 of 8 in 10');
ok(C.COLORS.length === 8 && new Set(C.COLORS.map(c => c.sym)).size === 8 && new Set(C.COLORS.map(c => c.fill)).size === 8, 'eight colours, each with its own symbol');
ok(C.allCodes('facile').length === 360 && C.allCodes('moyen').length === 1296 && C.allCodes('fort').length === 32768, 'the levels hide one code among 360, 1,296 and 32,768');

// 2. The clues.
ok(same(C.score([0, 1, 2, 3], [0, 1, 3, 4]), [2, 1]), 'the rules guide example: rouge bleu vert blanc against rouge bleu jaune vert gives 2 and 1');
ok(same(C.score([0, 0, 1, 1], [0, 1, 0, 1]), [2, 2]), 'repeats: AABB against ABAB gives 2 and 2');
ok(same(C.score([0, 0, 0, 1], [0, 0, 1, 1]), [3, 0]), 'a colour is counted once: AAAB against AABB gives 3 and 0');
ok(same(C.score([0, 1, 2, 3], [4, 4, 5, 5]), [0, 0]), 'no colour of the code gives nothing');
ok(same(C.score([1, 2, 3, 4, 5], [5, 4, 3, 2, 1]), [1, 4]), 'five pegs, all there: 1 in place and 4 elsewhere');
ok(C.sentence(2, 1) === '2 bien placées, 1 mal placée' && C.sentence(0, 0) === '0 bien placée, 0 mal placée' && C.sentence(1, 3) === '1 bien placée, 3 mal placées',
  'the sentence of a clue, singular for 0 and 1');
// The score is symmetric and counts every peg at most once, on random rows.
{
  const rnd = C.random(5);
  let bad = 0;
  for (let k = 0; k < 2000; k++) {
    const a = Array.from({ length: 5 }, () => Math.floor(rnd() * 8)), b = Array.from({ length: 5 }, () => Math.floor(rnd() * 8));
    const [x, y] = C.score(a, b), [x2, y2] = C.score(b, a);
    let common = 0;
    for (let c = 0; c < 8; c++) common += Math.min(a.filter(v => v === c).length, b.filter(v => v === c).length);
    if (x !== x2 || y !== y2 || x + y !== common || x !== a.filter((v, i) => v === b[i]).length) bad++;
  }
  ok(!bad, '2,000 random rows: the clue is symmetric, and black plus white is the colours in common');
}

// 3. Putting pegs, taking them out, and the rule of Facile.
{
  let G = C.newGame('facile', 3);
  G = C.place(G, 0, 2);
  ok(G.cur[0] === 2 && same(G.order, [0]), 'a colour goes in its hole');
  ok(C.refusal(G, 1, 2) === 'twice' && C.place(G, 1, 2) === null, 'at Facile, a colour cannot go twice in a row');
  ok(C.place(G, 0, 2) !== null, 'the same colour can go back in its own hole');
  G = C.place(G, 1, 4);
  ok(same(C.remove(G, 0).cur, [-1, 4, -1, -1]) && same(C.remove(G, 0).order, [1]), 'a peg taken out leaves its hole empty');
  ok(C.remove(G, 3) === null, 'an empty hole has nothing to take out');
  ok(C.submit(G) === null, 'a row with empty holes cannot be validated');
  let M = C.newGame('moyen', 3);
  M = fill(M, [1, 1, 1, 1]);
  ok(M && same(M.cur, [1, 1, 1, 1]), 'at Moyen, a colour can come back');
}

// 4. Validating: the clue, the win and the loss.
{
  let G = C.newGame('moyen', 11);
  const wrong = G.code.map(c => (c + 1) % 6);
  G = C.submit(fill(G, wrong));
  const t = G.tries[0];
  ok(G.tries.length === 1 && same([t.black, t.white], C.score(G.code, wrong)) && !G.result && G.cur.every(c => c === -1), 'a row gets its clue and a new empty row starts');
  const W = C.submit(fill(G, G.code));
  ok(W.result === 'won' && W.tries[1].black === 4, 'the code itself wins');
  ok(C.place(W, 0, 1) === null && C.submit(W) === null && C.refusal(W, 0, 1) === 'over', 'nothing plays after the end');
  let L = C.newGame('moyen', 12);
  const miss = L.code.map(c => (c + 1) % 6);
  for (let k = 0; k < 10; k++) L = C.submit(fill(L, miss));
  ok(L.result === 'lost' && L.tries.length === 10, 'ten wrong rows at Moyen lose the game');
  ok(C.valid(G) && C.valid(W) && C.valid(L), 'the games played are valid saves');
}

// 5. Undo: the last peg, then a whole row; never after the end.
{
  let G = C.newGame('facile', 21);
  G = C.place(C.place(G, 2, 0), 0, 5);
  let U = C.undo(G);
  ok(same(U.cur, [-1, -1, 0, -1]), 'undo takes back the last peg put');
  G = C.submit(fill(C.newGame('facile', 21), [0, 1, 2, 3]));
  U = C.undo(G);
  ok(U.tries.length === 0 && same(U.cur, [0, 1, 2, 3]) && U.order.length === 4, 'with an empty row, undo gives the last row back');
  ok(C.undo(C.newGame('facile', 21)) === null, 'a new game has nothing to undo');
  const W = C.submit(fill(C.newGame('facile', 22), C.newGame('facile', 22).code));
  ok(C.undo(W) === null, 'a finished game cannot be undone: the code was shown');
}

// 6. The hint: it never looks at the code, it fits every clue, and it says how many codes are left.
{
  let G = C.newGame('moyen', 31);
  let h = C.hint(G);
  ok(h.first && same(h.guess, [0, 0, 1, 1]), 'the first hint of Moyen is two pairs');
  ok(same(C.hint(C.newGame('facile', 1)).guess, [0, 1, 2, 3]), 'the first hint of Facile is four colours');
  G = C.submit(fill(G, [0, 0, 1, 1]));
  G = C.submit(fill(G, [2, 3, 4, 5]));
  h = C.hint(G);
  ok(C.fits(G, h.guess), 'the hint fits every clue');
  ok(h.left === C.possible(G).length && h.worst <= h.left, 'it counts the codes still possible');
  const other = C.possible(G).find(c => !same(c, G.code));
  ok(!other || same(C.hint({ ...G, code: other }).guess, h.guess), 'another possible code gives the same hint: the hint does not see the code');
  ok(C.possible(G).some(c => same(c, G.code)), 'the code is always among the possible codes');
}

// 7. Following the hint wins every game, in the rows of the level.
const play = (level, seed) => {
  let G = C.newGame(level, seed);
  while (!G.result) G = C.submit(fill(G, C.hint(G).guess));
  return G;
};
for (const [level, n] of [['facile', 200], ['moyen', 150], ['fort', 25]]) {
  let lost = 0, most = 0;
  for (let s = 1; s <= n; s++) { const G = play(level, s * 7919); if (G.result !== 'won') lost++; most = Math.max(most, G.tries.length); }
  ok(!lost, `${level}: following the hint wins ${n} games out of ${n}, in ${most} rows at most`, `${lost} lost`);
}

// 8. Each level is harder: the solver of the hint needs more rows on average, on the same seeds, and a
// player who tries any code that fits the clues needs more too.
{
  const avg = {}, rnd = {};
  const N = { facile: 120, moyen: 120, fort: 40 };
  for (const level of ['facile', 'moyen', 'fort']) {
    let sum = 0;
    for (let s = 1; s <= N[level]; s++) sum += play(level, 1000 + s).tries.length;
    avg[level] = sum / N[level];
    // A simpler player: any code that fits the clues, drawn at random.
    const r = C.random(99);
    let total = 0;
    for (let s = 1; s <= N[level]; s++) {
      let G = C.newGame(level, 5000 + s);
      while (!G.result) { const P = C.possible(G); G = C.submit(fill(G, P[Math.floor(r() * P.length)])); }
      total += G.tries.length;
    }
    rnd[level] = total / N[level];
  }
  const f = x => x.toFixed(2);
  console.log(`  hint solver, rows on average: facile ${f(avg.facile)}, moyen ${f(avg.moyen)}, difficile ${f(avg.fort)}`);
  console.log(`  random player that fits the clues: facile ${f(rnd.facile)}, moyen ${f(rnd.moyen)}, difficile ${f(rnd.fort)}`);
  ok(avg.facile < avg.moyen && avg.moyen < avg.fort, 'the hint solver needs more rows at each level');
  ok(avg.moyen - avg.facile > .2 && avg.fort - avg.moyen > .6, 'the steps are clear: more than 0.2 and 0.6 rows');
  ok(rnd.facile < rnd.moyen && rnd.moyen < rnd.fort, 'a simpler player needs more rows at each level too');
  ok(C.LEVELS.facile.rows - avg.facile > C.LEVELS.fort.rows - avg.fort, 'Facile also leaves more spare rows than Difficile');
}

// 9. A hint at Difficile stays quick: the slowest is the one after the first row, with the most codes left.
{
  let ms = 0;
  for (let seed = 1; seed <= 6; seed++) {
    let G = C.newGame('fort', seed);
    G = C.submit(fill(G, C.hint(G).guess));
    const t = performance.now();
    C.hint(G);
    ms = Math.max(ms, performance.now() - t);
  }
  ok(ms < 2500, `the slowest hint after the first row of Difficile takes ${Math.round(ms)} ms`);
}

// 10. A save read back is checked whole.
{
  const G = C.submit(fill(C.newGame('moyen', 8), [0, 0, 1, 1]));
  ok(C.valid(G), 'a game in progress is valid');
  const t = G.tries[0];
  ok(!C.valid({ ...G, tries: [{ ...t, black: (t.black + 1) % 5 }] }), 'a wrong clue is refused');
  ok(!C.valid({ ...G, code: [0, 0, 1] }), 'a code of the wrong length is refused');
  ok(!C.valid({ ...C.newGame('facile', 8), code: [1, 1, 2, 3] }), 'a code with a repeat at Facile is refused');
  ok(!C.valid({ ...G, result: 'won' }), 'a result that the rows do not give is refused');
  ok(!C.valid({ ...G, cur: [2, -1, -1, -1], order: [] }), 'a row whose order does not match its pegs is refused');
  ok(!C.valid({ ...G, level: 'expert' }) && !C.valid(null) && !C.valid({}), 'an unknown level or an empty save is refused');
  const P = C.place(G, 1, 3);
  ok(C.valid(P) && C.valid(JSON.parse(JSON.stringify(P))), 'a row being filled survives a save and a reload');
}

console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
process.exit(fails ? 1 : 0);
