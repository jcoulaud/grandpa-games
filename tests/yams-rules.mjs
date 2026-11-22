// The rules of the yams, the computer players and the hint, without a browser.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
require('../public/yams/engine.js');
const Y = globalThis.Yams;
let fails = 0;
const ok = (c, m, extra = '') => { console.log((c ? 'PASS ' : 'FAIL ') + m + (c ? '' : ' ' + extra)); if (!c) fails++; };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const B = Object.fromEntries(Y.BOXES.map((b, i) => [b, i]));
const pts = dice => Object.fromEntries(Y.BOXES.map((b, i) => [b, Y.points(i, dice)]));

// 1. Points in each box.
let p = pts([1, 1, 1, 2, 2]);
ok(p.as === 3 && p.deux === 4 && p.brelan === 3 && p.full === 25 && p.carre === 0 && p.chance === 7, 'a full of 1 and 2', JSON.stringify(p));
p = pts([6, 6, 6, 6, 6]);
ok(p.yams === 50 && p.carre === 24 && p.brelan === 18 && p.six === 30 && p.full === 0 && p.chance === 30 && p.petite === 0, 'a yams of 6 is not a full', JSON.stringify(p));
p = pts([4, 4, 4, 4, 2]);
ok(p.carre === 16 && p.brelan === 12 && p.full === 0 && p.quatre === 16, 'a carré counts its four dice', JSON.stringify(p));
ok(pts([1, 2, 3, 4, 6]).petite === 30 && pts([1, 2, 3, 4, 6]).grande === 0, 'a petite suite from 1 to 4');
ok(pts([3, 4, 5, 6, 6]).petite === 30, 'a petite suite with a pair');
ok(pts([2, 3, 4, 5, 6]).grande === 40 && pts([2, 3, 4, 5, 6]).petite === 30, 'a grande suite also makes a petite suite');
ok(pts([6, 5, 4, 3, 2]).grande === 40 && pts([1, 2, 3, 4, 5]).grande === 40, 'a grande suite in any order, from 1 or from 2');
ok(pts([1, 2, 3, 5, 6]).petite === 0, 'a gap breaks the suite');
ok(pts([5, 5, 2, 2, 3]).brelan === 0 && pts([5, 5, 5, 2, 2]).brelan === 15, 'a brelan needs three dice alike');

// 2. Totals and the bonus at exactly 63.
const sheet = top => [...top, ...Array(7).fill(null)];
ok(Y.totals(sheet([3, 6, 9, 12, 15, 18])).bonus === 35, '63 in the top boxes gives the bonus');
ok(Y.totals(sheet([3, 6, 9, 12, 15, 17])).bonus === 0, '62 does not');
ok(Y.totals([3, 6, 9, 12, 15, 18, 18, 24, 25, 30, 40, 50, 30]).total === 63 + 35 + 217, 'the total adds the top, the bonus and the bottom');
ok(Y.bonusOpen(sheet([0, 0, 0, null, null, null])) && !Y.bonusOpen(sheet([0, 0, 0, 0, null, null])), 'the bonus is open while the empty top boxes can still reach 63');

// The points a box can hold, used to check a save.
ok(Y.possible(B.full, 25) && !Y.possible(B.full, 20) && Y.possible(B.chance, 30) && !Y.possible(B.chance, 50) && !Y.possible(B.trois, 4) && Y.possible(B.carre, 0),
  'the points each box can hold');

// 3. Throws: the same seed throws the same dice, kept dice stay, a turn has three throws.
let G = Y.newGame('moyen', 42);
ok(G.dice === null && G.turn === 0 && G.rolls === 0, 'a new game waits for his first throw');
G = Y.roll(G);
ok(same(G.dice, Y.roll(Y.newGame('moyen', 42)).dice) && G.dice.every(d => d >= 1 && d <= 6), 'the same seed throws the same dice');
G = Y.keep(Y.keep(G, 0), 3);
const kept = [G.dice[0], G.dice[3]];
G = Y.roll(G);
ok(G.dice[0] === kept[0] && G.dice[3] === kept[1] && same(G.kept, [true, false, false, true, false]), 'kept dice stay and stay kept');
G = Y.roll(G);
ok(G.rolls === 3 && Y.roll(G) === G && Y.keep(G, 1) === G, 'no fourth throw, and no keeping after the third');

// His throws and the computer's come from two streams: what the computer throws after his box is not
// what he would throw if he took the box back.
{
  const start = Y.roll(Y.newGame('fort', 42));
  const after = Y.write(start, B.chance);
  const its = Y.computerTurn(after)[0].G.dice;
  const mine = Y.roll(start).dice;
  ok(!same(its, mine) && same(Y.roll(start).dice, Y.roll(start).dice), 'the computer throws from its own stream');
}

// 4. Writing: an empty box only, the turn passes, the dice go.
let W = Y.write(G, B.chance);
ok(W.sheets[0][B.chance] === G.dice.reduce((a, b) => a + b) && W.turn === 1 && W.dice === null && W.rolls === 0 && W.kept.every(k => !k), 'writing scores the dice and passes the turn');
ok(Y.write(Y.newGame('facile', 1), 0).sheets[0][0] === null, 'no box before the first throw');
W = Y.roll(W);
W = Y.write(W, B.chance);
ok(W.sheets[1][B.chance] !== null && W.turn === 0, 'the computer writes in its own sheet');
W = Y.roll(W);
ok(Y.write(W, B.chance) === W, 'a full box is refused');
// The end: 13 boxes each, then won, lost or tie.
const full = (a, b) => ({ ...Y.newGame('fort', 3), sheets: [a, b] });
let E = full([...Array(12).fill(0), null], Array(13).fill(0));
E = Y.write(Y.roll(E), 12);
ok(E.result === 'won', 'the larger total wins');
E = full([...Array(12).fill(0), null], [...Array(12).fill(0), 31]);
ok(Y.write(Y.roll(E), 12).result === 'lost', 'the smaller total loses');
E = full([...Array(12).fill(0), null], Array(13).fill(0));
E = Y.roll(E); E = { ...E, dice: [1, 1, 1, 1, 1] };
const tied = { ...E, sheets: [E.sheets[0], [...Array(12).fill(0), 5]] };
ok(Y.write(tied, 12).result === 'tie', 'equal totals are a tie');

// 5. Advice: the hint takes the obvious points and keeps the obvious dice.
const at = (dice, rolls, sh = Array(13).fill(null)) => ({ ...Y.newGame('fort', 9), dice, rolls, sheets: [sh, Array(13).fill(null)] });
let a = Y.advice(at([5, 5, 5, 5, 5], 1));
ok(a.kind === 'write' && a.box === B.yams, 'a yams on the first throw goes in the Yams box', JSON.stringify(a));
a = Y.advice(at([2, 3, 4, 5, 6], 1));
ok(a.kind === 'write' && a.box === B.grande, 'a grande suite is written at once', JSON.stringify(a));
a = Y.advice(at([6, 6, 6, 1, 2], 1));
ok(a.kind === 'keep' && same(a.kept, [true, true, true, false, false]), 'three 6 are kept, the others thrown again', JSON.stringify(a));
a = Y.advice(at([1, 2, 3, 4, 1], 1, [...Array(9).fill(0), null, null, 0, 0]));
ok(a.kind === 'keep' && a.kept.filter(k => k).length === 4 && !(a.kept[0] && a.kept[4]), 'with only the suites left, the four in a row are kept', JSON.stringify(a));
a = Y.advice(at([1, 1, 2, 3, 5], 3, [...Array(11).fill(0), null, 0]));
ok(a.kind === 'write' && a.box === B.yams, 'with one box left, it is the one written, even for 0');
ok(Y.advice(Y.newGame('fort', 1)).kind === 'roll', 'before the first throw, the advice is to throw');
// Five 6 with Six and Yams left and 60 in the top: the Yams is written, a 6 next turn brings the bonus.
a = Y.advice(at([6, 6, 6, 6, 6], 3, [4, 8, 12, 16, 20, null, 0, 0, 0, 0, 0, null, 0]));
ok(a.kind === 'write' && a.box === B.yams, 'five 6 go in the Yams when the bonus is one 6 away', JSON.stringify(a));
// The computer's last box, Chance, with 224 points: it plays to win the game, not for points.
const its = [3, 6, 9, 4, 10, 5, 18, 24, 25, 30, 40, 50, null], his = t => [...Array(11).fill(0), 50, t];
const lastBox = (dice, rolls, him) => Y.advice({ ...Y.newGame('fort', 1), turn: 1, dice, rolls, sheets: [his(him - 50), its] });
a = lastBox([4, 6, 5, 5, 3], 1, 246);
ok(a.kind === 'write' && a.box === B.chance, 'on its last box, Difficile writes dice that win, rather than risk them for more', JSON.stringify(a));
a = lastBox([4, 4, 4, 4, 4], 2, 245);
ok(a.kind === 'keep' && a.kept.filter(k => k).length === 4, 'on its last box, Difficile throws again rather than write a sure loss', JSON.stringify(a));
a = Y.advice({ ...Y.newGame('fort', 1), turn: 1, dice: [1, 1, 1, 1, 5], rolls: 2, sheets: [his(254 - 50), [3, 6, 9, 4, 10, 6, 18, 24, 25, 30, 40, 50, null]] });
ok(a.kind === 'keep' && a.kept.every(k => !k), 'on its last box, Difficile takes its only chance to win over a sure tie', JSON.stringify(a));
// Deux and Carré left, 61 in the top: four 6 go in the Carré, a 2 next turn is nearly sure.
a = Y.advice(at([2, 6, 6, 6, 6], 3, [3, null, 9, 12, 15, 22, 0, null, 0, 0, 0, 0, 0]));
ok(a.kind === 'write' && a.box === B.carre, 'the hint does not spend a good Carré on a bonus that is nearly sure anyway', JSON.stringify(a));
// One point short of the bonus with As left: the hint keeps As for the bonus and gives up Brelan.
a = Y.advice(at([2, 3, 4, 5, 6], 3, [null, 2, 9, 12, 15, 24, null, 0, 0, 0, 0, 0, 0]));
ok(a.kind === 'write' && a.box === B.brelan, 'the hint does not give up a bonus that is nearly sure', JSON.stringify(a));

// The computer never throws with all five dice kept, and its keep flags are booleans.
let empty = 0, flags = 0;
for (const level of ['facile', 'moyen', 'fort']) for (let seed = 1; seed <= 400; seed++) {
  const start = { ...Y.newGame(level, seed), turn: 1, sheets: [Array(13).fill(0), Y.BOXES.map((b, i) => (seed >> (i % 8)) & 1 ? 0 : null)] };
  if (start.sheets[1].every(v => v !== null)) start.sheets[1][11] = null;
  for (const st of Y.computerTurn(start)) {
    if (st.did === 'keep' && st.G.kept.every(k => k)) empty++;
    if (st.G.kept.some(k => typeof k !== 'boolean')) flags++;
  }
}
ok(!empty && !flags, 'the computer never throws again with all dice kept, and keeps with true or false', `${empty} empty throws, ${flags} bad flags`);

// 6. The computer's turn: one to three throws, then one empty box; the same game gives the same turn.
for (const level of ['facile', 'moyen', 'fort']) {
  let bad = 0, worst = 0;
  for (let seed = 1; seed <= 300; seed++) {
    const start = { ...Y.newGame(level, seed * 2654435761), turn: 1 };
    start.sheets = [Array(13).fill(0), Y.BOXES.map((b, i) => (seed + i) % 3 === 0 ? 0 : null)];
    if (start.sheets[1].every(v => v !== null)) start.sheets[1][seed % 13] = null;
    const t = performance.now();
    const steps = Y.computerTurn(start);
    worst = Math.max(worst, performance.now() - t);
    const last = steps[steps.length - 1];
    const throws = steps.filter(s => s.did === 'roll').length;
    const box = last.box;
    if (last.did !== 'write' || throws < 1 || throws > 3 || start.sheets[1][box] !== null || last.G.turn !== 0
      || !same(steps, Y.computerTurn(start))) bad++;
  }
  ok(!bad, `${level}: 300 turns throw 1 to 3 times, write one empty box and repeat the same`, `${bad} bad`);
  ok(worst < 50, `${level}: the slowest turn took ${worst.toFixed(1)} ms`);
}

// 7. The levels: playing whole sheets alone, each level scores more than the one below it.
const average = level => {
  let sum = 0;
  for (let seed = 1; seed <= 150; seed++) {
    let g = { ...Y.newGame(level, seed * 7919), turn: 1 };
    for (let r = 0; r < 13; r++) {
      const steps = Y.computerTurn(g);
      g = steps[steps.length - 1].G;
      g = { ...g, turn: 1, sheets: [g.sheets[1].map(() => null), g.sheets[1]], result: null };
    }
    sum += Y.totals(g.sheets[1]).total;
  }
  return sum / 150;
};
const avg = { facile: average('facile'), moyen: average('moyen'), fort: average('fort') };
ok(avg.moyen > avg.facile + 25 && avg.fort > avg.moyen + 8 && avg.fort > 215,
  `averages: Facile ${avg.facile.toFixed(0)}, Moyen ${avg.moyen.toFixed(0)}, Difficile ${avg.fort.toFixed(0)}`);

// 8. A whole game against the computer ends after 13 turns each with a result.
G = Y.newGame('fort', 99);
for (let n = 0; n < 26 && !G.result; n++) {
  if (G.turn === 0) { G = Y.roll(G); G = Y.write(G, G.sheets[0].indexOf(null)); }
  else { const s = Y.computerTurn(G); G = s[s.length - 1].G; }
}
ok(!!G.result && G.sheets.every(s => s.every(v => v !== null)), `a game ends with both sheets full: ${G.result}`);

console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
process.exit(fails ? 1 : 0);
