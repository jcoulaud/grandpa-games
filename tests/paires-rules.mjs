// The rules of the jeu des paires, the deal, the hint and the levels, without a browser.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
require('../public/paires/engine.js');
const P = globalThis.Paires;
let fails = 0;
const ok = (c, m, extra = '') => { console.log((c ? 'PASS ' : 'FAIL ') + m + (c ? '' : ' ' + extra)); if (!c) fails++; };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// 1. Deals: each picture twice, the size of the level, the same seed gives the same deal.
for (const [level, L] of Object.entries(P.LEVELS)) {
  let bad = 0;
  for (let seed = 1; seed <= 200; seed++) {
    const G = P.newGame(level, seed);
    const count = {};
    G.cards.forEach(c => { count[c] = (count[c] || 0) + 1; });
    if (G.cards.length !== L.cols * L.rows || Object.values(count).some(n => n !== 2) || !P.valid(G)) bad++;
  }
  ok(!bad, `${level}: 200 deals of ${L.cols * L.rows / 2} pairs, each picture twice`, `${bad} bad`);
  ok(same(P.newGame(level, 77), P.newGame(level, 77)) && !same(P.newGame(level, 77).cards, P.newGame(level, 78).cards), `${level}: a seed always gives the same deal`);
}
ok(P.PICTURES.length * 2 >= P.LEVELS.fort.cols * P.LEVELS.fort.rows, 'Difficile has a picture for each of its pairs');
const pics = new Set();
for (let seed = 1; seed <= 100; seed++) P.newGame('facile', seed).cards.forEach(c => pics.add(c));
ok(pics.size === P.PICTURES.length, 'Facile takes its 6 pictures among all 15');

// 2. Turning cards: a pair stays, a miss turns back, refusals.
{
  let G = P.newGame('facile', 5);
  const a = 0, b = G.cards.indexOf(G.cards[0], 1), c = G.cards.findIndex(x => x !== G.cards[0]);
  let r = P.flip(G, a);
  ok(r.event === 'first' && r.G.up === a && r.G.turns === 0, 'the first card stays up alone');
  ok(P.flip(r.G, a) === null && P.refusal(r.G, a) === 'up', 'the same card cannot be turned twice');
  const miss = P.flip(r.G, c);
  ok(miss.event === 'miss' && miss.G.up === -1 && miss.G.turns === 1 && !miss.G.found.includes('1'), 'two different pictures turn back and count one turn');
  ok(miss.G.seen[a] === '1' && miss.G.seen[c] === '1', 'both are remembered as seen');
  r = P.flip(P.flip(miss.G, a).G, b);
  ok(r.event === 'pair' && r.G.found[a] === '1' && r.G.found[b] === '1' && r.G.turns === 2, 'two same pictures make a pair');
  ok(P.refusal(r.G, a) === 'found' && P.flip(r.G, b) === null, 'a card of a pair found cannot be turned');
  ok(P.valid(r.G) && P.valid(miss.G), 'the games played are valid saves');
}

// 3. The hint uses what he has seen, and following it always wins.
{
  let G = P.newGame('moyen', 9);
  let h = P.hint(G);
  ok(h.kind === 'new' && h.cells.length === 1, 'at the start the hint points to a card never turned');
  const a = 0, b = G.cards.indexOf(G.cards[0], 1);
  const other = G.cards.findIndex((x, k) => k !== a && k !== b && x !== G.cards[0]);
  G = P.flip(P.flip(G, a).G, other).G;
  G = P.flip(G, b).G;
  h = P.hint(G);
  ok(h.kind === 'match' && same(h.cells, [a]), 'with one card up, the hint shows its twin seen before');
  G = P.flip(G, other).G;
  h = P.hint(G);
  ok(h.kind === 'known' && same(h.cells.sort((x, y) => x - y), [a, b].sort((x, y) => x - y)), 'the hint shows two cards seen before that make a pair');
}
// A player who follows the hint: each level, 300 games, all won.
const byHint = (level, seed) => {
  let G = P.newGame(level, seed), steps = 0;
  while (!G.result && steps++ < 1000) G = P.flip(G, P.hint(G).cells[0]).G;
  return G;
};
for (const level of Object.keys(P.LEVELS)) {
  let won = 0;
  for (let seed = 1; seed <= 300; seed++) if (byHint(level, seed).result === 'won') won++;
  ok(won === 300, `${level}: following the hint wins all 300 games`, `${won} won`);
}

// 4. Each level is harder than the one below: a player with a good but imperfect memory needs more
// turns. He forgets each card seen with a chance of 1 in 4 per turn after it.
function player(level, seed) {
  const rnd = P.random(seed * 7919 + 1);
  let G = P.newGame(level, seed);
  const known = new Map();
  const forget = () => { for (const k of [...known.keys()]) if (rnd() < .25) known.delete(k); };
  const pickNew = () => {
    const open = G.cards.map((c, k) => k).filter(k => G.found[k] === '0' && !known.has(k) && k !== G.up);
    return open.length ? open[Math.floor(rnd() * open.length)] : G.cards.findIndex((c, k) => G.found[k] === '0' && k !== G.up);
  };
  while (!G.result) {
    let a = -1, b = -1;
    for (const [k, c] of known) for (const [j, d] of known) if (k !== j && c === d) { a = k; b = j; }
    if (a < 0) a = pickNew();
    let r = P.flip(G, a); G = r.G; known.set(a, G.cards[a]);
    if (b < 0) { const twin = [...known].find(([k, c]) => k !== a && c === G.cards[a]); b = twin ? twin[0] : pickNew(); }
    r = P.flip(G, b); G = r.G; known.set(b, G.cards[b]);
    if (r.event === 'pair') { known.delete(a); known.delete(b); }
    forget();
  }
  return G.turns;
}
const avg = {};
for (const level of Object.keys(P.LEVELS)) {
  let sum = 0;
  for (let seed = 1; seed <= 300; seed++) sum += player(level, seed);
  avg[level] = sum / 300;
}
console.log(`     turns on average: Facile ${avg.facile.toFixed(1)}, Moyen ${avg.moyen.toFixed(1)}, Difficile ${avg.fort.toFixed(1)}`);
ok(avg.facile < avg.moyen && avg.moyen < avg.fort, 'each level takes more turns than the one below');

// 5. Saves read back are checked: a broken one is refused.
{
  const G = P.flip(P.newGame('facile', 3), 4).G;
  ok(P.valid(G), 'a game in progress is a valid save');
  ok(!P.valid({ ...G, level: 'expert' }), 'an unknown level is refused');
  ok(!P.valid({ ...G, cards: G.cards.map((c, k) => k === 0 ? G.cards[1] === c ? G.cards[2] : G.cards[1] : c) }), 'a picture three times is refused');
  ok(!P.valid({ ...G, found: '1' + G.found.slice(1) }), 'half a pair found is refused');
  ok(!P.valid({ ...G, up: 7 }), 'a card up that was never seen is refused');
  ok(!P.valid({ ...G, result: 'won' }), 'a win with pairs left is refused');
  ok(!P.valid(null) && !P.valid({}), 'an empty save is refused');
}

console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
process.exit(fails ? 1 : 0);
