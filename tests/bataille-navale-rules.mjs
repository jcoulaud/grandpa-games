// Checks the rules of the bataille navale in Node: the fleets, the shots, what each side knows, the
// computer at each level, the hint, and that each level fires fewer shots than the one below.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const ctx = {};
vm.runInNewContext(readFileSync(new URL('../public/bataille-navale/engine.js', import.meta.url), 'utf8'), ctx);
const B = ctx.Bataille;
let fails = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const row = i => Math.floor(i / 10), col = i => i % 10;

// 1. Fleets: five straight ships of 5, 4, 3, 3 and 2 squares, inside the sea, that never touch.
let fleetsOk = true;
for (let seed = 1; seed <= 500; seed++) {
  for (const fleet of B.newGame('facile', seed).fleets) {
    const owner = new Map();
    fleet.forEach((ship, s) => {
      if (ship.length !== B.FLEET[s].size) fleetsOk = false;
      const across = ship.every(i => row(i) === row(ship[0])) && ship.every((i, k) => i === ship[0] + k);
      const down = ship.every(i => col(i) === col(ship[0])) && ship.every((i, k) => i === ship[0] + 10 * k);
      if (!across && !down) fleetsOk = false;
      for (const i of ship) { if (owner.has(i) || i < 0 || i > 99) fleetsOk = false; owner.set(i, s); }
    });
    for (const [i, s] of owner) for (const j of B.AROUND[i]) if (owner.has(j) && owner.get(j) !== s) fleetsOk = false;
  }
}
ok(fleetsOk, 'every fleet has five straight ships of the right sizes that never touch, on 1000 fleets');
ok(JSON.stringify(B.newGame('moyen', 77)) === JSON.stringify(B.newGame('moyen', 77)), 'the same seed gives the same game');
const g0 = B.newGame('facile', 3);
const moved = B.replace(g0, 99);
ok(JSON.stringify(moved.fleets[1]) === JSON.stringify(g0.fleets[1]) && JSON.stringify(moved.fleets[0]) !== JSON.stringify(g0.fleets[0]),
  'placing again changes his fleet only');

// 2. Shots: water, hit, sunk, and the squares around a sunk ship are known water.
let G = B.newGame('facile', 11);
const torp = G.fleets[1][4];
const water = [...Array(100).keys()].find(i => !G.fleets[1].flat().includes(i));
let r = B.fire(G, 1, water);
ok(r.kind === 'eau' && r.ship === -1 && r.G.shots[1][water] === 'o' && r.G.turn === 'them' && r.G.last[1] === water, 'a shot in the water');
r = B.fire(r.G, 1, torp[0]);
ok(r.kind === 'touche' && r.ship === 4 && B.view(r.G, 1)[torp[0]] === 'x', 'a hit');
r = B.fire(r.G, 1, torp[1]);
const v = B.view(r.G, 1);
ok(r.kind === 'coule' && v[torp[0]] === 's' && v[torp[1]] === 's', 'a sunk ship shows whole');
const around = [...new Set(torp.flatMap(i => B.AROUND[i]))].filter(i => !torp.includes(i));
ok(around.every(i => v[i] === 'c' || v[i] === 'o'), 'the squares around a sunk ship are known water');
ok(B.view(r.G, 1).filter(x => x === 'c').length > 0 && B.view(r.G, 0).every(x => x === '.'), 'the other sea knows nothing');

// 3. The end: the last ship sunk wins, on either side.
const sinkAll = (G, k) => { for (const i of G.fleets[k].flat()) G = B.fire(G, k, i).G; return G; };
ok(sinkAll(B.newGame('facile', 5), 1).result === 'won', 'sinking his five ships wins');
ok(sinkAll(B.newGame('facile', 5), 0).result === 'lost', 'losing his five ships loses');
let partial = B.newGame('facile', 5);
for (const i of partial.fleets[1].flat().slice(0, -1)) partial = B.fire(partial, 1, i).G;
ok(partial.result === null, 'one square left afloat: the game goes on');

// 4. The computer at each level: never a square already fired, never one known empty (Moyen and
// Difficile), always the same shot for the same game, and a whole game ends within 100 shots.
const avg = {};
for (const level of B.LEVELS) {
  let total = 0, bad = 0, again = 0, known = 0;
  const games = 300;
  for (let seed = 1; seed <= games; seed++) {
    let G = B.newGame(level, seed * 7919);
    let n = 0;
    while (!G.result && n <= 100) {
      G = { ...G, turn: 'them' };
      const i = B.aim(G);
      if (B.aim(G) !== i) again++;
      if (!Number.isInteger(i) || G.shots[0][i] !== '.') { bad++; break; }
      if (level !== 'facile' && B.view(G, 0)[i] !== '.') known++;
      G = B.fire(G, 0, i).G; n++;
    }
    if (G.result !== 'lost') bad++;
    total += n;
  }
  avg[level] = total / games;
  ok(!bad, `${level}: the computer fires only on new squares and ends each game, ${avg[level].toFixed(1)} shots on average`);
  ok(!again, `${level}: the same game gives the same shot`);
  if (level !== 'facile') ok(!known, `${level}: the computer never fires beside a sunk ship`);
}
ok(avg.facile > avg.moyen + 10 && avg.moyen > avg.fort + 3, 'each level needs fewer shots than the one below');

// 5. The computer knows only its shots: moving his ships it has not found yet does not change its shot.
let seen = 0, same = 0;
for (let seed = 1; seed <= 200; seed++) {
  let G = B.newGame('fort', seed);
  for (let n = 0; n < 6; n++) G = B.fire({ ...G, turn: 'them' }, 0, B.aim({ ...G, turn: 'them' })).G;
  if ([...G.shots[0]].some(x => x === 'x')) continue;
  // With no hit yet, any fleet that avoids the squares fired gives the same shot.
  let other = null;
  for (let s = 1; s < 50 && !other; s++) {
    const fleet = B.place(B.random(seed * 1000 + s));
    if (fleet.flat().every(i => G.shots[0][i] === '.')) other = { ...G, fleets: [fleet, G.fleets[1]] };
  }
  if (!other) continue;
  seen++;
  if (B.aim(other) === B.aim(G)) same++;
}
ok(seen > 0 && same === seen, `the computer does not see his ships (${seen} games checked)`);

// 6. Two ships hit at once, neither sunk: the density keeps both, and the hint stays beside a hit.
G = B.newGame('facile', 21);
G = B.fire(G, 1, G.fleets[1][0][0]).G; G = B.fire(G, 1, G.fleets[1][1][0]).G;
let h = B.hint(G);
ok(h && h.rule !== 'search' && B.view(G, 1)[h.cell] === '.' && h.hits.some(j => B.AROUND[j].includes(h.cell)), 'two ships hit at once: the hint is beside one of them');

// 6b. One ship afloat, hit at both ends: the hint goes between the hits, never beside them.
for (let seed = 1; seed <= 50; seed++) {
  let G = B.newGame('facile', seed);
  for (const i of G.fleets[1].slice(1).flat()) G = B.fire(G, 1, i).G;
  const big = G.fleets[1][0];
  G = B.fire(G, 1, big[0]).G; G = B.fire(G, 1, big[4]).G;
  const h = B.hint(G);
  if (!big.includes(h.cell)) { ok(false, `seed ${seed}: one ship left hit at both ends, the hint goes to ${B.name(h.cell)}`); break; }
  if (seed === 50) ok(true, 'one ship left hit at both ends: the hint goes between the hits');
}

// 6b2. Hits of several ships: the hint never goes to a square that touches a hit only by a corner.
let cornered = 0;
for (let seed = 1; seed <= 300; seed++) {
  let G = B.newGame('facile', seed);
  const rand = B.random(seed);
  for (let n = 0; n < 40 && !G.result; n++) {
    const v = B.view(G, 1), open = v.map((x, i) => x === '.' ? i : -1).filter(i => i >= 0);
    const h = B.hint(G);
    const hits = v.map((x, i) => x === 'x' ? i : -1).filter(i => i >= 0);
    const diag = hits.some(j => B.AROUND[j].includes(h.cell)) && !hits.some(j => B.AROUND[j].includes(h.cell) && (j % 10 === h.cell % 10 || Math.floor(j / 10) === Math.floor(h.cell / 10)));
    if (diag) cornered++;
    G = B.fire(G, 1, open[Math.floor(rand() * open.length)]).G;
  }
}
ok(!cornered, 'the hint never goes to a square that touches a hit only by a corner');

// 6c. Moyen goes on from each ship hit, also when two ships are hit at once.
let followed = 0, missed = 0;
for (let seed = 1; seed <= 200; seed++) {
  let G = B.newGame('moyen', seed * 13);
  while (!G.result) {
    G = { ...G, turn: 'them' };
    const v = B.view(G, 0), hits = B.groups(v);
    const i = B.aim(G);
    if (hits.flat().some(j => B.AROUND[j].some(n => v[n] === '.' && (n % 10 === j % 10 || Math.floor(n / 10) === Math.floor(j / 10)))))
      hits.flat().some(j => B.AROUND[j].includes(i)) ? followed++ : missed++;
    G = B.fire(G, 0, i).G;
  }
}
ok(followed > 0 && !missed, `moyen always fires beside a ship it hit (${followed} shots)`);

// 6d. A save read back: real games pass, broken ones do not.
let real = 0, realOk = 0;
for (const level of B.LEVELS) for (let seed = 1; seed <= 20; seed++) {
  let G = B.newGame(level, seed);
  while (!G.result) {
    real++; if (B.check(G)) realOk++;
    G = B.fire(G, 1, B.hint(G).cell).G;
    real++; if (B.check(G)) realOk++;
    if (!G.result) G = B.fire(G, 0, B.aim(G)).G;
  }
  real++; if (B.check(G)) realOk++;
}
ok(real === realOk, `every position of ${60} real games passes the check`);
const good = B.newGame('facile', 9);
const broken = {
  'the computer to play on a sea fired all over': { ...good, turn: 'them', shots: ['o'.repeat(100), good.shots[1]] },
  'two ships touching': { ...good, fleets: [[[0, 1, 2, 3, 4], [10, 11, 12, 13], ...good.fleets[0].slice(2)], good.fleets[1]] },
  'a ship that bends': { ...good, fleets: [[[0, 1, 2, 3, 13], ...good.fleets[0].slice(1)], good.fleets[1]] },
  'a strange letter': { ...good, shots: [good.shots[0], 'z' + good.shots[1].slice(1)] },
  'a hit on water': { ...good, turn: 'them', shots: [good.shots[0], [...good.shots[1]].map((x, i) => i === [...Array(100).keys()].find(j => !good.fleets[1].flat().includes(j)) ? 'x' : x).join('')] },
  'a wrong turn': { ...good, turn: 'them' },
  'a win not said': sinkAll(good, 1) && { ...sinkAll(good, 1), result: null },
  'no level': { ...good, level: 'expert' },
  'a ship too long': { ...good, fleets: [[[...good.fleets[0][0], 99], ...good.fleets[0].slice(1)], good.fleets[1]] },
  'shots that cannot be': (() => { const w = [...Array(100).keys()].filter(j => !good.fleets[1].flat().includes(j));
    return { ...good, turn: '', shots: [good.shots[0], [...good.shots[1]].map((x, i) => i === w[0] || i === w[1] ? 'o' : x).join('')], last: [-1, w[0]] }; })(),
  'a strange seed': { ...good, seed: { valueOf: null } },
};
for (const [what, G] of Object.entries(broken)) ok(!B.check(G), `a save with ${what} is refused`);
ok(B.aim({ ...good, shots: ['o'.repeat(100), good.shots[1]] }) === -1, 'the computer has no shot on a sea fired all over');

// 7. The hint: always a new square while the game goes on, and following it wins every game.
let hintBad = 0, shots = 0;
for (let seed = 1; seed <= 300; seed++) {
  let G = B.newGame('facile', seed * 31);
  let n = 0;
  while (!G.result && n <= 100) {
    const h = B.hint(G);
    if (!h || B.view(G, 1)[h.cell] !== '.') { hintBad++; break; }
    G = B.fire(G, 1, h.cell).G; n++;
  }
  if (G.result !== 'won') hintBad++;
  shots += n;
}
ok(!hintBad, `following the hint wins every game, in ${(shots / 300).toFixed(1)} shots on average`);

console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
process.exit(fails ? 1 : 0);
