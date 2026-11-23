import test from 'node:test';
import assert from 'node:assert/strict';
import * as B from '../public/bowling/engine.js';
const zeros = Array(18).fill(0);
test('scores wait for bonus rolls and credit every tenth frame correctly', () => {
  assert.equal(B.score([10, 10]).frames[0].total, null);
  assert.equal(B.score([10, 10, 4]).frames[0].total, 24);
  assert.equal(B.score([3, 7]).frames[0].total, null);
  assert.equal(B.score([3, 7, 2]).frames[0].total, 12);
  assert.equal(B.score(Array(12).fill(10)).total, 300);
  assert.equal(B.score(Array(21).fill(5)).total, 150);
  for (const [rolls, total, marks] of [
    [[0, 0], 0, ['−', '−']],
    [[4, 3], 7, [4, 3]],
    [[6, 4, 10], 20, [6, '/', 'X']],
    [[0, 10, 0], 10, ['−', '/', '−']],
    [[10, 10, 10], 30, ['X', 'X', 'X']],
    [[10, 10, 3], 23, ['X', 'X', 3]],
    [[10, 7, 3], 20, ['X', 7, '/']],
    [[10, 0, 10], 20, ['X', '−', '/']],
    [[10, 2, 3], 15, ['X', 2, 3]]
  ]) {
    const final = B.score([...zeros, ...rolls]);
    assert.equal(final.total, total);
    assert.ok(final.done);
    assert.deepEqual(final.frames[9].marks, marks);
    assert.equal(B.score([...zeros, ...rolls.slice(0, -1)]).done, false);
  }
});
test('running score includes pins in unfinished frames and replaces them when a bonus settles', () => {
  assert.equal(B.score([6]).total, 6);
  assert.equal(B.score([6, 4]).total, 10);
  assert.equal(B.score([6, 4, 3]).total, 16);
  assert.equal(B.score([10, 10, 4]).total, 38);
  assert.equal(B.score([...zeros, 10, 4]).total, 14);
});
test('entry angle predicts pocket carry, head-on splits and light leaves', () => {
  const strikes = [0, 0, 0, 0, 0];
  let splits = 0,
    light = 0,
    reference = 0;
  for (let i = 1; i <= 128; i++) {
    const pins = B.rack(Math.imul(i, 2654435761));
    const roll = (aim, speed, curve, hz = 480) => B.simulate(pins, { aim, speed, curve }, 'moyen', false, hz);
    const shots = [
      [6, 0],
      [3, -1],
      [8, -2],
      [6, -2],
      [6, -3]
    ];
    shots.forEach(([speed, curve], j) => {
      strikes[j] += roll(22.5, speed, curve).count === 10;
    });
    reference += roll(22.5, 6, -2, 1920).count === 10;
    const ids = roll(20, 6, 0).standing.map((p) => p.id);
    splits += !ids.includes(1) && ((ids.includes(7) && ids.includes(10)) || (ids.includes(4) && ids.includes(6)));
    light += ['10', '5', '5-7'].includes(
      roll(23.5, 6, -2)
        .standing.map((p) => p.id)
        .join('-')
    );
  }
  const rates = strikes.map((x) => x / 128);
  console.log({ strikes, reference, splits, light, racks: 128 });
  assert.ok(rates[0] < 0.3);
  for (const [i, min, max] of [
    [1, 0.2, 0.3],
    [2, 0.45, 0.55],
    [4, 0.65, 0.75]
  ]) {
    assert.ok(rates[i] >= min && rates[i] <= max);
  }
  assert.ok((rates[2] + rates[3] + rates[4]) / 3 >= 0.5);
  assert.ok(Math.abs(strikes[3] - reference) / 128 < 0.1);
  assert.ok(splits > 32 && splits < 110);
  assert.ok(light > 64);
});

test('recorded rigid bodies tumble, stay inside solid surfaces, lose energy and sleep', () => {
  const pins = B.rack(1013904226);
  const result = B.simulate(pins, B.defaults(), 'moyen', true);
  assert.deepEqual(B.simulate(pins, B.defaults(), 'moyen', true), result);
  for (const shot of [B.defaults(), { aim: 22.5, speed: 7, curve: -2 }, { aim: 23.3, speed: 6, curve: -2 }]) {
    const { frames, sleeping } = B.simulate(pins, shot, 'moyen', true);
    assert.ok(sleeping);
    assert.ok(frames.at(-1).energy < frames[0].energy * 0.45);
    assert.ok(frames.at(-1).ball.y < 0 && frames.at(-1).ball.z > B.deckEnd);
    assert.ok(frames.some((f) => f.pins.some((p) => p.tilt > Math.PI / 2)));
    for (const { pins, ball, energy } of frames) {
      assert.ok(energy <= frames[0].energy * 1.01);
      for (const p of [ball, ...pins]) {
        const [a, b, c, d] = p.q;
        assert.ok(Math.abs(Math.hypot(...p.q) - 1) < 1e-7);
        for (const [h, r] of p.id ? B.pinShape : [[B.com, B.radius]]) {
          const x = p.x + 2 * (a * b - d * c) * (h - B.com);
          const y = p.y + (1 - 2 * (a * a + c * c)) * (h - B.com);
          const z = p.z + 2 * (b * c + d * a) * (h - B.com);
          assert.ok(y - r >= B.pitFloor - 0.003);
          if (Math.abs(x) < B.width / 2 && z <= B.deckEnd) assert.ok(y - r >= -0.003);
          if (z > B.length - 0.45 && z < B.cushionZ && y < 1) assert.ok(Math.abs(x) + r <= B.wallX + 0.003);
        }
      }
    }
  }
  const hard = B.simulate(B.rack(2654435761), { ...B.defaults(), speed: 10 }, 'moyen', true);
  assert.ok(hard.frames.every((f) => f.pins.every((p) => p.y < 0.5)));
  const wide = { aim: 45, speed: 7, curve: 0 };
  const gutter = B.simulate(pins, wide, 'moyen', true);
  assert.ok(gutter.gutter && gutter.sleeping && gutter.frames.at(-1).ball.y < 0);
  assert.deepEqual(gutter.standing, pins);
  // No level has barrières: a wide ball drops into the gutter in Facile too.
  assert.ok(B.simulate(pins, wide, 'facile').gutter);
});

test('the foot settles after a glancing hit on the 8 pin', () => {
  const pins = B.rack(Math.imul(2, 2654435761));
  const r = B.simulate(pins, { aim: 23, speed: 5, curve: -2 }, 'moyen', true);
  assert.ok(r.sleeping);
  // The 8 pin is touched and rocks, then stands upright again.
  assert.ok(Math.max(...r.frames.map((f) => f.pins[7].tilt)) > 0.02);
  assert.ok(r.frames.at(-1).pins[7].tilt < Math.PI / 180);
  assert.ok(r.frames.length * B.frameStep < 5);
});

test('the 6 pin returns from the kickback and carries the 10', () => {
  const audit = { impacts: [] };
  const r = B.simulate(B.rack(186), { aim: 22.5, speed: 6, curve: -2 }, 'moyen', true, 480, audit);
  const out = r.frames.findIndex((f) => f.pins[5].x > B.wallX - 0.065);
  assert.ok(out > 0 && r.frames[out].pins[9].tilt < 0.1);
  assert.ok(r.frames.slice(out).some((f) => f.pins[5].x < r.frames[out].pins[5].x - 0.035));
  assert.equal(audit.impacts.find((c) => c.a === 10).b, 6);
  assert.ok(!r.standing.some((p) => p.id === 10));
  assert.ok(audit.maxDepth < 0.007);
  for (const c of [audit.impacts[0], audit.impacts.find((c) => c.a === 10)]) {
    const restitution = c.b === 0 ? 0.67 : 0.45;
    assert.ok(Math.abs(c.separation / c.approach - restitution) < 0.01);
  }
});
test('all seven curves bend in order and reach the selected board', () => {
  for (const level of Object.keys(B.goals)) {
    for (const speed of [1, 6, 10]) {
      let previous = -Infinity;
      for (let curve = -3; curve <= 3; curve++) {
        const aim = 20 - 2.5 * Math.sign(curve);
        const path = B.trajectory({ aim, speed, curve }, level, B.length, false);
        const at = (z) => {
          const i = path.findIndex((p) => p.z >= z);
          const a = path[i - 1],
            b = path[i];
          return a.x + ((b.x - a.x) * (z - a.z)) / (b.z - a.z);
        };
        assert.ok(Math.abs(at(B.length) - B.boardX(aim)) < 1e-7);
        const middle = at(B.length / 2);
        const hook = (at(B.length) - path[0].x - (B.length * path[0].vx) / path[0].vz) / B.board;
        assert.ok(hook > previous);
        previous = hook;
        if (speed === 6 && curve) {
          const q = path.find((p) => p.z >= B.length);
          assert.ok(Math.abs(hook - 10 * curve) < 3);
          assert.ok(Math.abs((Math.atan2(q.vx, q.vz) * 180) / Math.PI - 2 * curve) < 0.8);
          assert.ok(q.vz / path[0].vz > 0.85 && q.vz / path[0].vz < 0.9);
        }
        if (!curve) assert.ok(Math.abs(middle - B.boardX(aim) / 2) < 1e-8);
      }
    }
  }
});
test('the ball leaves from its start board, and the hint start keeps every pocket hook on the boards', () => {
  for (let curve = -3; curve <= 3; curve++)
    for (const aim of [10, 20, 30]) {
      assert.ok(Math.abs(B.trajectory({ start: 12, aim, speed: 6, curve }, 'moyen')[0].x - B.boardX(12)) < 1e-12);
      // A shot that names no start leaves from the hint's start for its curve.
      assert.ok(Math.abs(B.trajectory({ aim, speed: 6, curve }, 'moyen')[0].x - B.boardX(B.defaultStart(curve))) < 1e-12);
    }
  for (const level of Object.keys(B.goals))
    for (const side of [-1, 1])
      for (let step = 1; step <= 3; step++)
        for (let speed = 1; speed <= 10; speed++) {
          const shot = { aim: 20 - 2.5 * side, speed, curve: step * side };
          const path = B.trajectory(shot, level);
          assert.ok(Math.abs(B.arrival(path) - B.boardX(shot.aim)) < 1e-7);
          assert.ok(path.filter((p) => p.z < B.length).every((p) => Math.abs(p.x) <= B.width / 2 - B.board));
          assert.equal(B.simulate(B.rack(42), shot, level, true).path[0].x, path[0].x);
        }
});
test('Difficile grips later and turns harder on the dry boards', () => {
  const acceleration = (level, z) => {
    const path = B.trajectory({ ...B.defaults(), curve: 2 }, level);
    const i = path.findIndex((p) => p.z >= z);
    return (path[i].vx - path[i - 1].vx) / B.step;
  };
  assert.ok(acceleration('fort', 11) < acceleration('moyen', 11));
  assert.ok(acceleration('fort', 13) > acceleration('moyen', 13));
});
test('reload and undo preserve rack poses, hints use the current rack', () => {
  const g = B.fresh('moyen', 3, 42),
    initial = B.pinsFor(g);
  assert.match(B.hint(g).reason, /poche/);
  B.play(g, B.defaults());
  const leave = B.pinsFor(g);
  assert.ok(leave.length < 10);
  const restored = B.restore(JSON.parse(JSON.stringify(g)), 17);
  assert.deepEqual(restored, g);
  const advice2 = B.hint(restored);
  const expected = B.play(restored, advice2);
  const savedThrow = restored.throws.at(-1);
  B.undo(restored);
  assert.deepEqual(B.hint(restored), advice2);
  assert.deepEqual(B.play(restored, advice2), expected);
  assert.deepEqual(restored.throws.at(-1), savedThrow);
  B.undo(restored);
  assert.deepEqual(B.pinsFor(restored), leave);
  B.undo(restored);
  assert.deepEqual(B.pinsFor(restored), initial);
  const alone = [initial[9]];
  const spare = { ...g, throws: [{ ...g.throws[0], count: 9, standing: alone }] };
  const advice = B.hint(spare);
  assert.match(advice.reason, /quille 10 : elle est seule/);
  assert.equal(B.play(spare, advice).count, 1);
  for (const bad of [
    { ...g, v: 0 },
    { ...g, throws: [null] },
    ...[4, -4, 0.5, 'left'].map((curve) => ({ ...g, throws: [{ ...g.throws[0], curve }] })),
    { ...g, throws: [{ ...g.throws[0], standing: [{}, {}] }] }
  ]) {
    assert.deepEqual(B.restore(bad, 17), B.fresh('moyen', 3, 17));
  }
  const miss = B.fresh('moyen', 0, 101);
  B.play(miss, { ...B.defaults(), aim: 45 });
  assert.deepEqual(B.pinsFor(miss), B.rack(101));
});
test('the same imperfect player reaches each higher goal less often', () => {
  const wins = [];
  for (const level of Object.keys(B.goals)) {
    let won = 0;
    for (let seed = 1; seed <= 64; seed++) {
      const g = B.fresh(level, 0, Math.imul(seed, 2654435761) >>> 0);
      let state = g.seed;
      const error = () => ((state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 4294967296) * 2 - 1;
      while (!B.sheet(g).done) {
        const pins = B.pinsFor(g),
          full = pins.length === 10;
        B.play(g, {
          aim: (full ? 22.5 : B.boardAt(pins[0].x)) + error() * 4,
          speed: 7 + Math.round(error() * 2),
          curve: (full ? -2 : 0) + Math.round(error())
        });
      }
      won += g.wins;
      assert.deepEqual(B.restore(g, 0), g);
    }
    wins.push(won);
  }
  console.log('Goals reached in 64 games:', wins);
  assert.deepEqual(wins, [52, 25, 11]);
  assert.ok(wins[0] > wins[1] && wins[1] > wins[2] && wins[2] > 0);
});
