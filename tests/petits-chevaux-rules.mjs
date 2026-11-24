// The rules of the petits chevaux, the computer players, the hint, the levels, the check of a save,
// an older save with four horses and the length of a game, without a browser.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
require('../public/petits-chevaux/engine.js');
const P = globalThis.PetitsChevaux;
let fails = 0;
const ok = (c, m, extra = '') => { console.log((c ? 'PASS ' : 'FAIL ') + m + (c ? '' : ' ' + extra)); if (!c) fails++; };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const { FOOT, ARRIVED } = P;
// A game set up by hand: the horses of each player, whose turn it is and the die.
const at = (horses, turn = 0, die = null, level = 'moyen') => ({ ...P.newGame(level, 7), horses, turn, die });
const STABLE = [-1, -1];
const H = (blue, red = STABLE, green = STABLE, yellow = STABLE) => [blue, red, green, yellow];
const movers = G => P.moves(G).map(m => m.horse).sort().join();

// 1. The board: 56 squares clockwise, each player's start beside its stable, the ladders to the centre.
{
  const keys = new Set(P.TRACK.map(s => s.join()));
  ok(P.TRACK.length === 56 && keys.size === 56, 'the track has 56 different squares');
  ok(P.TRACK.every((s, i) => { const n = P.TRACK[(i + 1) % 56]; return Math.max(Math.abs(s[0] - n[0]), Math.abs(s[1] - n[1])) === 1; }),
    'each square of the track touches the next one');
  ok(same(P.TRACK[P.START[0]], [6, 14]) && same(P.TRACK[P.START[1]], [0, 6]) && same(P.TRACK[P.START[2]], [8, 0]) && same(P.TRACK[P.START[3]], [14, 8]),
    'blue starts at the bottom left, red top left, green top right, yellow bottom right');
  // Clockwise on the screen: from blue's start the horse goes up, toward red.
  ok(P.TRACK[P.START[0] + 1][1] < P.TRACK[P.START[0]][1], 'a horse goes clockwise');
  ok(same([0, 1, 2, 3].map(p => P.TRACK[P.abs(p, FOOT)]), [[7, 14], [0, 7], [7, 0], [14, 7]]), 'the foot of each ladder is the end of an arm, just before the start square');
  ok([0, 1, 2, 3].every(p => { const f = P.TRACK[P.abs(p, FOOT)], s = P.LADDER[p][0]; return Math.abs(f[0] - s[0]) + Math.abs(f[1] - s[1]) === 1; }), 'step 1 touches the foot of its ladder');
  ok(same(P.TRACK[P.abs(0, FOOT)], [7, 14]) && same(P.LADDER[0][0], [7, 13]) && same(P.LADDER[0][5], [7, 8]), "blue's ladder climbs the bottom arm to the centre");
  const ladders = new Set(P.LADDER.flat().map(s => s.join()));
  ok(ladders.size === 24 && [...ladders].every(k => !keys.has(k)), 'the ladders are off the track');
  ok(same(P.path(0, 3, 6), [P.point(0, 4), P.point(0, 5), P.point(0, 6)]) && same(P.path(0, -1, 0, 2), [P.point(0, 0)]), 'a horse hops one square at a time');
}

// 2. Out of the stable: only with a 6, onto the start square.
{
  let G = at(H(STABLE), 0, 5);
  ok(P.moves(G).length === 0, 'no horse leaves the stable without a 6');
  ok(P.blocked(G, 0, 0).why === 'stable', 'a horse in the stable needs a 6');
  G = at(H(STABLE), 0, 6);
  ok(same(P.newGame('moyen', 1).horses, [STABLE, STABLE, STABLE, STABLE]), 'each player starts with two horses in the stable');
  ok(movers(G) === '0,1' && P.moves(G).every(m => m.to === 0), 'with a 6 each horse in the stable can go to the start square');
  ok(P.advice(G).why === 'out', 'the hint on the first 6 says to bring a horse out, not that only one can move');
  G = P.play(G, 1);
  ok(same(G.horses[0], [-1, 0]) && G.turn === 0 && G.die === null, 'a 6 brings the horse out, and he throws again');
}

// 3. The track: the die moves the horse, jumps are allowed, own horses share a square.
{
  let G = at(H([10, 12], [P.abs(0, 12) - P.START[1], -1]), 0, 4);
  // red's horse sits 2 squares ahead of blue's horse at 10: blue jumps over it.
  const m = P.moves(G).find(x => x.horse === 0);
  ok(m.to === 14 && m.captured.length === 0, 'a horse jumps over other horses');
  G = at(H([10, 14]), 0, 4);
  G = P.play(G, 0);
  ok(same(G.horses[0], [14, 14]) && G.turn === 1, 'two horses of one colour share a square, and the turn passes');
  ok(same(G.last, { player: 0, die: 4, horse: 0, from: 10, to: 14, captured: [] }), 'the game remembers the last move');
  const G4 = at(H([10, -1]), 0, 4), G0 = at(H([10, -1]), 0, null);
  ok(P.play(G4, 1) === G4, 'a horse that cannot move does not move');
  ok(P.play(G0, 0) === G0, 'no move before the throw');
}

// 4. Captures: landing on another colour sends it home; the start square counts too.
{
  const redAt = blueSquare => (P.abs(0, blueSquare) - P.START[1] + 56) % 56;
  let G = at(H([10, -1], [redAt(13), redAt(13)]), 0, 3);
  ok(same(P.moves(G)[0].captured, [[1, 0], [1, 1]]), 'a move onto two red horses takes both');
  G = P.play(G, 0);
  ok(same(G.horses[1], STABLE) && G.horses[0][0] === 13, 'the red horses go back to their stable');
  // A red horse on blue's start square is taken by a blue horse leaving the stable.
  G = at(H(STABLE, [redAt(0), -1]), 0, 6);
  G = P.play(G, 0);
  ok(G.horses[0][0] === 0 && G.horses[1][0] === -1, 'leaving the stable takes the horse on the start square');
  // The ladder is safe: no capture there, and nobody else can reach it.
  G = at(H([FOOT, -1], [redAt(FOOT) - 3, -1]), 1, 3);
  ok(same(P.moves(G)[0].captured, [[0, 0]]), 'a horse at the foot of its ladder can still be taken');
  G = at(H([FOOT + 1, -1], [redAt(FOOT) - 3, -1]), 1, 3);
  ok(P.moves(G)[0].captured.length === 0, 'a horse on its ladder is safe');
  // Red passes the foot of blue's ladder and goes on around the track.
  G = at(H(STABLE, [redAt(FOOT) - 1, -1]), 1, 4);
  ok(P.moves(G)[0].to === redAt(FOOT) + 3, "another colour goes past blue's ladder on the track");
}

// 5. The foot of the ladder and the ladder: exact numbers only.
{
  let G = at(H([52, -1]), 0, 4);
  ok(P.moves(G).length === 0 && same(P.blocked(G, 0, 0), { why: 'far', left: 3 }), 'a throw that goes past the foot of the ladder cannot be used');
  G = at(H([52, -1]), 0, 3);
  ok(P.moves(G)[0].to === FOOT, 'the exact throw lands on the foot of the ladder');
  for (let step = 0; step < 6; step++) {
    const pos = FOOT + step;
    const need = step + 1;
    ok([1, 2, 3, 4, 5, 6].every(d => P.moves(at(H([pos, ARRIVED]), 0, d)).length === (d === need ? 1 : 0)),
      step ? `step ${step} needs exactly a ${need}` : 'the foot of the ladder needs exactly a 1');
    ok(same(P.blocked(at(H([pos, -1]), 0, need === 1 ? 2 : 1), 0, 0), { why: 'ladder', need }), `the reason names the ${need}`);
  }
  G = P.play(at(H([60, -1]), 0, 6), 0);
  ok(G.horses[0][0] === ARRIVED && P.blocked(G, 0, 0).why === 'arrived', 'a 6 on step 5 reaches the centre');
}

// 6. Turns: after a 6 the same player throws again, even with no move; else the next one, clockwise.
{
  let G = at(H([52, ARRIVED]), 0, 6);
  ok(P.moves(G).length === 0, 'a 6 with nothing to move');
  G = P.pass(G);
  ok(G.turn === 0 && G.die === null && same(G.last, { player: 0, die: 6, pass: true }), 'after a 6 he throws again, even with no move');
  G = P.pass(at(H(STABLE), 0, 3));
  ok(G.turn === 1, 'a throw with no move passes the turn');
  G = P.pass(at(H(STABLE), 3, 3));
  ok(G.turn === 0, 'after yellow it is blue again');
  const g6 = at(H(STABLE), 0, 6);
  ok(P.pass(g6) === g6, 'a throw that can be used cannot be passed');
  // The throws: the same state throws the same die, one stream per player.
  const a = P.roll(P.newGame('facile', 42)), b = P.roll(P.newGame('facile', 42));
  ok(a.die === b.die && a.die >= 1 && a.die <= 6 && a.rng[0] !== P.newGame('facile', 42).rng[0] && a.rng[1] === b.rng[1], 'the same seed throws the same die, from his own stream');
  ok(P.roll(a) === a, 'no second throw before the move');
  const dice = new Set();
  let g = P.newGame('facile', 1);
  for (let i = 0; i < 300; i++) { g = P.roll(g); dice.add(g.die); g = { ...g, die: null }; }
  ok(dice.size === 6, 'the die shows every face');
}

// 7. The end: the first with both horses at the centre wins.
{
  let G = at(H([ARRIVED, 60]), 0, 6);
  G = P.play(G, 1);
  ok(G.result === 0 && G.die === null && G.turn === 0, 'both horses at the centre win the game');
  ok(P.roll(G) === G && P.moves({ ...G, die: 3 }).length === 0, 'nothing moves after the end');
  ok(P.play(at(H([60, -1]), 0, 6), 0).result === null, 'one horse at the centre does not win');
  G = P.play(at(H(STABLE, [ARRIVED, 60]), 1, 6), 1);
  ok(G.result === 1, 'a computer player can win');
}

// 8. The computer players always play a legal move, and their turns end on his turn.
{
  let bad = 0, games = 0;
  for (const level of ['facile', 'moyen', 'fort']) {
    for (let seed = 1; seed <= 20; seed++) {
      let g = { ...P.newGame(level, seed), turn: 1 };
      for (let round = 0; round < 400 && g.result === null; round++) {
        if (g.turn === 0) {
          g = P.roll(g);
          const ms = P.moves(g);
          g = ms.length ? P.play(g, ms[0].horse) : P.pass(g);
          continue;
        }
        const steps = P.computerTurn(g);
        for (const s of steps) {
          if (s.did === 'move') {
            const before = steps[steps.indexOf(s) - 1].G;
            if (!P.moves(before).some(m => m.horse === s.G.last.horse && m.to === s.G.last.to)) bad++;
          }
          if (!P.valid(s.G)) bad++;
        }
        g = steps[steps.length - 1].G;
        if (g.result === null && g.turn !== 0) bad++;
      }
      games++;
    }
  }
  ok(bad === 0, `the computer players make only legal moves, in ${games} games`, String(bad));
  const g = { ...P.newGame('fort', 5), turn: 2 };
  ok(same(P.computerTurn(g), P.computerTurn(g)), 'the same game always gets the same computer turns');
  ok(P.computerTurn(P.newGame('fort', 5)).length === 0, 'on his turn the computer does nothing');
}

// 9. Moyen and Difficile take a horse when they can, and the hint says so.
{
  const redAt = blueSquare => (P.abs(0, blueSquare) - P.START[1] + 56) % 56;
  const blueAt = redSquare => (P.abs(1, redSquare) - P.START[0] + 56) % 56;
  // Red's horse at its square 20 with a 4 lands on blue; its other horse would just move.
  const G = at(H([blueAt(24), -1], [20, 30]), 1, 4);
  ok(P.moves(G).some(m => m.captured.length), 'a capture is on offer');
  ok(P.choose(G, 'moyen') === 0 && P.choose(G, 'fort') === 0, 'Moyen and Difficile take it');
  const B = at(H([36, 10], [redAt(40), -1]), 0, 4);
  const a = P.advice(B);
  ok(a.horse === 0 && a.why === 'capture', 'the hint takes the red horse: ' + JSON.stringify(a));
  ok(P.advice(at(H([5, -1]), 0, 3)).why === 'only', 'the hint says when only one horse can move');
  ok(P.advice(at(H(STABLE), 0, 3)) === null, 'no hint when no horse can move');
  // Difficile leaves a horse in danger less often than it gets one out of reach.
  const D = at(H([20, 2], [redAt(18), -1]), 0, 5);
  ok(P.risk(D.horses, 0, 20) > 0 && P.choose(D, 'fort') === 0, 'Difficile moves the horse under threat away');
  // Moyen, with nothing to take, moves its front horse.
  ok(P.choose(at(H(STABLE, [30, 10], [-1, -1], [-1, -1]), 1, 2), 'moyen') === 0, 'Moyen moves its front horse');
}

// 10. The levels: each wins more often against the level below it, at tables of two against two.
function game(levels, seed) {
  let g = P.newGame('facile', seed), n = 0;
  while (g.result === null && n++ < 20000) {
    g = P.roll(g);
    const h = P.choose(g, levels[g.turn]);
    g = h === null ? P.pass(g) : P.play(g, h);
  }
  return levels[g.result];
}
const share = (a, b, n) => {
  let won = 0;
  for (let s = 1; s <= n; s++) if (game(s % 2 ? [a, b, a, b] : [b, a, b, a], s * 7919) === a) won++;
  return won / n;
};
// With two horses each, the dice decide more: 2000 games put each share four standard errors or more
// above one half.
const moyen = share('moyen', 'facile', 2000), fort = share('fort', 'moyen', 2000);
ok(moyen > .56, `Moyen wins ${(moyen * 100).toFixed(1)} % of the games against Facile`);
ok(fort > .53, `Difficile wins ${(fort * 100).toFixed(1)} % of the games against Moyen`);

// 11. Saves: a whole game reads back; a broken or impossible one does not.
{
  const G = P.newGame('moyen', 3);
  ok(P.valid(G) && P.valid(JSON.parse(JSON.stringify(P.play(P.roll({ ...G, rng: [5, 1, 2, 3] }), 0)))), 'a new game and a game read back from JSON are valid');
  ok(P.newGame('nope', 1).level === 'facile', 'an unknown level becomes Facile');
  const bad = [
    null, 'x', {}, { ...G, level: 'expert' }, { ...G, turn: 4 }, { ...G, die: 7 }, { ...G, die: 0 }, { ...G, rng: [1, 2, 3] },
    { ...G, rng: [1, 2, 3, -1] }, { ...G, horses: [[0, 0, 0], [-1, -1, -1], [-1, -1, -1], [-1, -1, -1]] }, { ...G, horses: H([62, -1]) },
    { ...G, horses: H([-2, -1]) }, { ...G, horses: H(['1', -1]) }, { ...G, level: ['facile'] },
    // two horses for one player and four for another
    { ...G, horses: [[-1, -1], [-1, -1, -1, -1], [-1, -1], [-1, -1]] },
    // two colours on one square
    { ...G, horses: H([0, -1], [(P.START[0] - P.START[1] + 56) % 56, -1]) },
    // both horses home but no result, a result without both horses home, two winners
    { ...G, horses: H([61, 61]) }, { ...G, result: 0 },
    { ...G, horses: H([61, 61], [61, 61]), result: 0 },
  ];
  ok(bad.every(b => !P.valid(b)), 'broken saves are refused', String(bad.findIndex(b => P.valid(b))));
  ok(P.valid({ ...G, horses: H([61, 61]), result: 0, turn: 0, die: null }), 'a won game is valid');
  ok(P.valid({ ...G, horses: H([5, 5]) }), 'two horses of one colour on a square is valid');
}

// 12. An older save, with four horses each, plays on to its end by the same rules: four horses must
// reach the centre, and the computer players move legally.
{
  const S4 = [-1, -1, -1, -1];
  const old = { ...P.newGame('moyen', 3), horses: [S4, S4, S4, S4] };
  ok(P.valid(old) && P.valid(JSON.parse(JSON.stringify(old))), 'a save with four horses each is valid');
  ok(P.play({ ...old, horses: [[61, 61, 61, 60], S4, S4, S4], die: 6 }, 3).result === 0, 'four horses at the centre win an older game');
  ok(P.play({ ...old, horses: [[61, 60, -1, -1], S4, S4, S4], die: 6 }, 1).result === null, 'two horses at the centre do not win an older game');
  ok(P.point(0, -1, 3, 4)[1] > P.point(0, -1, 0, 4)[1] && P.point(0, -1, 1, 2)[1] === P.point(0, -1, 0, 2)[1], 'four stable places in a square, or two side by side');
  let bad = 0, ended = 0;
  for (const level of ['facile', 'moyen', 'fort']) for (let seed = 1; seed <= 5; seed++) {
    let g = { ...P.newGame(level, seed, 4) };
    for (let n = 0; n < 20000 && g.result === null; n++) {
      if (g.turn === 0) { g = P.roll(g); const h = P.choose(g, 'fort'); g = h === null ? P.pass(g) : P.play(g, h); continue; }
      const steps = P.computerTurn(g);
      steps.forEach((s, i) => { if (s.did === 'move' && !P.moves(steps[i - 1].G).some(m => m.horse === s.G.last.horse)) bad++; if (!P.valid(s.G)) bad++; });
      g = steps[steps.length - 1].G;
    }
    if (g.result !== null && g.horses[g.result].every(x => x === ARRIVED) && g.horses[g.result].length === 4) ended++;
  }
  ok(bad === 0 && ended === 15, `older games with four horses end with four at the centre, legally (${ended} of 15)`, String(bad));
}

// 13. The length of a game: he plays the hint and takes 2 s for each click; the page waits PACE
// between the steps, as index.html does. The median must be 15 to 25 minutes at each level.
{
  const T = P.PACE, CLICK = 2000;
  const moveMs = l => (l.from < 0 ? 1 : l.to - l.from) * T.HOP + (l.to === ARRIVED ? T.ARRIVE : 0) + (l.captured.length ? T.HIT + T.FLY : 0);
  const minutes = (level, seed) => {
    let g = P.newGame(level, seed), ms = 0;
    for (let n = 0; n < 50000 && g.result === null; n++) {
      if (g.turn === 0) {
        ms += CLICK + T.ROLL; g = P.roll(g);
        const h = P.choose(g, 'fort');
        if (h === null) { ms += T.NOMOVE; g = P.pass(g); if (g.turn !== 0) ms += T.QUICK; }
        else { ms += CLICK; g = P.play(g, h); ms += moveMs(g.last); if (g.turn !== 0 && g.result === null) ms += T.FIRST; }
        continue;
      }
      // A computer throw: the die, then its move and a pause, or at once the pass and a shorter pause.
      g = P.roll(g); ms += T.CPU_ROLL;
      const h = P.choose(g, g.level);
      if (h === null) { g = P.pass(g); ms += T.PASS; continue; }
      g = P.play(g, h);
      ms += T.SHOW + moveMs(g.last) + (g.last.captured.some(([q]) => q === 0) ? T.HURT : T.LAND);
    }
    return ms / 60000;
  };
  for (const level of ['facile', 'moyen', 'fort']) {
    const all = [];
    for (let s = 1; s <= 400; s++) all.push(minutes(level, s * 7919));
    all.sort((a, b) => a - b);
    const median = all[200], tenth = all[360];
    ok(median >= 15 && median <= 25, `a game at ${level} takes ${median.toFixed(1)} minutes in the middle, ${tenth.toFixed(1)} for one in ten`);
  }
}

console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
process.exit(fails ? 1 : 0);
