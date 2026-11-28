import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../public/petanque/engine.js';

const launch = (style, z, x = 0, id = 1) => E.launchOf({ kind: style === 'cochonnet' ? 'cochonnet' : 'boule', style, aim: { x, z }, id, who: 'you' });
const mene = (boules, cochonnet = { x: 0, z: 8 }, left = { you: 0, cpu: 0 }, last = 'cpu') => ({
  n: 1, starter: 'you', cochonnet, boules: boules.map((b, i) => ({ id: i + 1, dead: false, ...b })), left, last
});
// A whole game, each side playing as the level given.
function playGame(level, youLevel, seed) {
  const g = E.fresh(level, 0, seed);
  if (youLevel) g.you = youLevel;
  for (let guard = 0; E.turn(g) && guard < 500; guard++) {
    const t = E.turn(g);
    E.play(g, t.who === 'cpu' ? E.cpuChoice(g) : youLevel ? E.choiceFor(g, 'you', youLevel) : t.kind === 'cochonnet' ? { aim: { x: 0, z: 7.5 } } : E.choiceFor(g, 'you', 'facile'));
  }
  return g;
}

test('each way of pointing stops on its aim on empty gravel, and lands where its style says', () => {
  for (const d of [6, 8, 10]) {
    const lands = {};
    for (const style of ['roulette', 'demi', 'plombee']) {
      const sim = E.simulate([], launch(style, d));
      const end = sim.bodies[0];
      assert.ok(Math.abs(end.z - d) < 0.03 && Math.abs(end.x) < 1e-9, style + ' ' + d + ' ' + end.z);
      lands[style] = sim.events.find((e) => e.type === 'land').z / d;
      const apex = Math.max(...sim.path.map((p) => p.y));
      if (style === 'roulette') assert.ok(apex < 0.7);
      if (style === 'plombee') assert.ok(apex > 2.8 && d - sim.events.at(-1).z < 1.1);
    }
    assert.ok(lands.roulette < 0.3 && lands.demi > 0.4 && lands.demi < 0.65 && lands.plombee > 0.85, JSON.stringify(lands));
  }
  const c = E.simulate([], launch('cochonnet', 8)).bodies[0];
  assert.ok(Math.abs(c.z - 8) < 0.03);
});

test('a rolling boule sends the light cochonnet about 58 cm, and a tir au fer leaves a carreau', () => {
  // Astra's regression case: a boule rolling at 1 m/s square into the cochonnet sends it 0.58 m.
  const at = 0.3 + E.R + E.RC + 0.0005;
  const s = E.simulate([{ id: 0, x: 0, z: at }], { id: 1, owner: 'you', style: 'roulette', u: 1, up: 0, yaw: 0, release: E.R });
  const moved = s.bodies.find((b) => b.id === 0).z - at;
  assert.ok(moved > 0.5 && moved < 0.66, 'moved ' + moved);
  // A tir that lands square on a boule sends it far away and stops on its spot.
  const head = E.simulate([{ id: 1, owner: 'cpu', x: 0, z: 8 }], launch('tir', 8, 0, 2));
  const target = head.bodies.find((b) => b.id === 1),
    shooter = head.bodies.find((b) => b.id === 2);
  assert.ok(target.dead || target.z > 10, 'the hit boule flies far');
  assert.ok(Math.hypot(shooter.x, shooter.z - 8) < 0.1, 'carreau ' + shooter.z);
});

test('the same seed gives the same throw, and the pebbles spread the boules', () => {
  const bodies = [{ id: 0, x: 0.1, z: 8 }, { id: 1, owner: 'cpu', x: -0.2, z: 7.6 }];
  const a = E.random(99),
    b = E.random(99);
  const one = E.simulate(bodies, E.launchOf({ kind: 'boule', style: 'demi', aim: { x: 0.1, z: 8 }, id: 2, who: 'you' }, a, 1.3), a);
  const two = E.simulate(bodies, E.launchOf({ kind: 'boule', style: 'demi', aim: { x: 0.1, z: 8 }, id: 2, who: 'you' }, b, 1.3), b);
  assert.deepEqual(one.bodies, two.bodies);
  const ends = new Set();
  for (let k = 0; k < 20; k++) {
    const r = E.random(k + 1);
    ends.add(E.simulate([], E.launchOf({ kind: 'boule', style: 'roulette', aim: { x: 0, z: 8 }, id: 1 }, r), r).bodies[0].z.toFixed(3));
  }
  assert.ok(ends.size > 15);
});

test('the point, the turn and the score of a mène follow the rules', () => {
  // Two of his boules nearer than Marius's best: he holds the point with 2.
  const m = mene([
    { owner: 'you', x: 0.1, z: 8 },
    { owner: 'you', x: -0.15, z: 8 },
    { owner: 'cpu', x: 0.3, z: 8 },
    { owner: 'you', x: 0, z: 9 }
  ]);
  const p = E.point(m);
  assert.equal(p.holder, 'you');
  assert.equal(p.count, 2);
  assert.deepEqual(E.meneResult(m), { winner: 'you', points: 2, reason: 'point' });
  // The player who does not hold the point plays; one with no boule left gives the turn to the other.
  assert.equal(E.nextPlayer({ ...m, left: { you: 1, cpu: 2 } }), 'cpu');
  assert.equal(E.nextPlayer({ ...m, left: { you: 1, cpu: 0 } }), 'you');
  assert.equal(E.nextPlayer({ ...m, left: { you: 0, cpu: 0 } }), null);
  // The first boule of a mène belongs to the player who threw the cochonnet.
  assert.equal(E.nextPlayer(mene([], { x: 0, z: 8 }, { you: 3, cpu: 3 })), 'you');
  // A dead boule does not count; with no boule in play, the other player plays.
  const dead = mene([{ owner: 'you', x: 2, z: 8, dead: true }], { x: 0, z: 8 }, { you: 2, cpu: 3 }, 'you');
  assert.equal(E.point(dead).holder, null);
  assert.equal(E.nextPlayer(dead), 'cpu');
  // A tie: the last player plays again.
  const tie = mene([{ owner: 'you', x: 0.2, z: 8 }, { owner: 'cpu', x: -0.2, z: 8 }], { x: 0, z: 8 }, { you: 2, cpu: 2 }, 'cpu');
  assert.ok(E.point(tie).tie);
  assert.equal(E.nextPlayer(tie), 'cpu');
  assert.deepEqual(E.meneResult({ ...tie, left: { you: 0, cpu: 0 } }), { winner: null, points: 0, reason: 'tie' });
  // The cochonnet out: the player who still has boules scores them, else nobody.
  const out = (left) => E.meneResult(mene([{ owner: 'you', x: 0, z: 8 }], { x: 2, z: 8, dead: true }, left));
  assert.deepEqual(out({ you: 0, cpu: 2 }), { winner: 'cpu', points: 2, reason: 'out' });
  assert.deepEqual(out({ you: 1, cpu: 1 }), { winner: null, points: 0, reason: 'out' });
  // The measure runs from edge to edge, as a tape does.
  assert.ok(Math.abs(E.gap({ x: 0, z: 8.1 }, { x: 0, z: 8 }) - (0.1 - E.R - E.RC)) < 1e-12);
});

test('a game is played mène after mène until a player reaches the goal', () => {
  for (const [level, goal] of [['facile', 7], ['moyen', 13]]) {
    const g = playGame(level, null, 11);
    const s = E.situation(g);
    assert.ok(s.over);
    assert.equal(Math.max(s.score.you, s.score.cpu) >= goal, true);
    assert.equal(Math.min(s.score.you, s.score.cpu) < goal, true);
    assert.equal(s.over.winner, s.score.you >= goal ? 'you' : 'cpu');
    // The score is the sum of the mènes, each worth 0 to 3 points, and the winner of a mène throws the next cochonnet.
    const sum = { you: 0, cpu: 0 };
    for (const [i, m] of s.menes.entries()) {
      assert.ok(m.points >= 0 && m.points <= 3);
      if (m.winner) sum[m.winner] += m.points;
      const next = g.actions.find((a, k) => a.kind === 'cochonnet' && g.actions.slice(0, k).filter((b) => b.kind === 'cochonnet').length === i + 1);
      if (next && m.winner) assert.equal(next.who, m.winner);
    }
    assert.deepEqual(sum, s.score);
    assert.equal(E.GOAL[level], goal);
  }
});

test('undo takes back his throw and Marius’s answers, and the same throw replays the same way', () => {
  const g = E.fresh('moyen', 2, 1234);
  E.play(g, { aim: { x: 0, z: 8 } });
  const first = E.play(g, { style: 'demi', aim: { x: 0.2, z: 8.3 } });
  while (E.turn(g).who === 'cpu') E.play(g, E.cpuChoice(g));
  const after = JSON.stringify(E.situation(g).mene);
  assert.ok(g.actions.length > 2);
  assert.ok(E.undo(g));
  assert.equal(g.actions.length, 1);
  const again = E.play(g, { style: 'demi', aim: { x: 0.2, z: 8.3 } });
  assert.deepEqual(again.mene.boules, first.mene.boules);
  while (E.turn(g).who === 'cpu') E.play(g, E.cpuChoice(g));
  assert.equal(JSON.stringify(E.situation(g).mene), after);
  // A save read back replays to the same state; a broken one starts again with the wins kept.
  const back = E.restore(JSON.parse(JSON.stringify(g)), 5);
  assert.equal(JSON.stringify(E.situation(back)), JSON.stringify(E.situation(g)));
  const broken = E.restore({ ...JSON.parse(JSON.stringify(g)), actions: [{ who: 'cpu', kind: 'boule' }] }, 5);
  assert.equal(broken.actions.length, 0);
  assert.equal(broken.wins, 2);
  assert.equal(broken.level, 'moyen');
  assert.equal(E.restore({ v: 1, level: 'bizarre', seed: 3, actions: [] }, 5).level, 'facile');
  // Nothing to undo before his first throw.
  assert.equal(E.undo(E.fresh('facile', 0, 1)), false);
});

test('the hint and Marius only choose legal throws, and the hint never shoots at Facile', () => {
  for (const [level, seeds] of [['fort', [77]], ['facile', [77, 20, 31, 45, 58]]]) {
    let targets = 0;
    for (const seed of seeds) {
      const g = E.fresh(level, 0, seed);
      for (let guard = 0; E.turn(g) && guard < 60; guard++) {
        const t = E.turn(g);
        const c = t.who === 'you' ? E.hint(g) : E.cpuChoice(g);
        if (t.who === 'you') assert.match(c.reason, /\.$/);
        if (t.kind === 'boule') assert.ok(E.STYLES.includes(c.style));
        if (c.style === 'tir') assert.ok(E.situation(g).mene.boules.some((b) => b.id === c.target && !b.dead && b.owner !== t.who));
        // Facile has no « Tir » key, so its hint only points.
        if (level === 'facile' && t.who === 'you' && t.kind === 'boule') {
          assert.notEqual(c.style, 'tir', 'facile hint ' + seed);
          if (E.situation(g).mene.boules.some((b) => !b.dead && b.owner === 'cpu')) targets++;
        }
        E.play(g, c);
      }
    }
    if (level === 'facile') assert.ok(targets > 10, 'the hint met boules of Marius it could have shot');
  }
});

test('a finished game cannot be taken back, so its win counts once, also when Marius throws last', () => {
  // Facile, seed 20, the default throw each time: he wins 7 to 1 on Marius's last throw.
  const g = E.fresh('facile', 0, 20);
  let last;
  while (E.turn(g)) {
    const t = E.turn(g);
    last = t.who;
    E.play(g, t.who === 'cpu' ? E.cpuChoice(g) : t.kind === 'cochonnet' ? { aim: { x: 0, z: 7.5 } } : { style: 'demi', aim: E.situation(g).mene.cochonnet });
  }
  assert.deepEqual(E.situation(g).score, { you: 7, cpu: 1 });
  assert.equal(last, 'cpu');
  assert.equal(g.wins, 1);
  const n = g.actions.length;
  assert.equal(E.undo(g), false);
  assert.equal(g.actions.length, n);
  assert.equal(g.wins, 1);
});

test('each level of Marius beats the level below, and a steady player wins less often at each level', () => {
  let moyen = 0,
    fort = 0;
  for (let i = 0; i < 12; i++) if (E.situation(playGame('moyen', 'facile', 300 + i)).over.winner === 'cpu') moyen++;
  for (let i = 0; i < 12; i++) if (E.situation(playGame('fort', 'moyen', 1000 + i)).over.winner === 'cpu') fort++;
  console.log('Moyen beat Facile', moyen, 'of 12; Difficile beat Moyen', fort, 'of 12');
  assert.ok(moyen >= 10, 'moyen ' + moyen);
  assert.ok(fort >= 8, 'fort ' + fort);
  // His hand, always the throw the panel starts with: a demi-portée at the cochonnet.
  const wins = {};
  for (const [level, n] of [['facile', 12], ['moyen', 12], ['fort', 8]]) {
    wins[level] = 0;
    for (let i = 0; i < n; i++) if (E.situation(playGame(level, null, 500 + i)).over.winner === 'you') wins[level]++;
    wins[level] /= n;
  }
  console.log('A steady player wins', JSON.stringify(wins));
  assert.ok(wins.facile > wins.moyen && wins.moyen > wins.fort, JSON.stringify(wins));
});
