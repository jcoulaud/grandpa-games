import test from 'node:test';
import assert from 'node:assert/strict';
import * as G from '../public/golf/engine.js';

const seeds = (n) => Array.from({ length: n }, (_, i) => ((i + 1) * 2654435761) >>> 0);
// The first 50 courses of each level, kept for the tests that play them.
const kept = new Map();
const course = (level, seed) => kept.get(level + seed) || G.course(level, seed);
// Plays a hole with the hint, each target turned by error radians. Returns the strokes and every
// position the ball went through.
function playHole(h, error = 0) {
  let p = h.tee,
    count = 0,
    sunk = false;
  const seen = [];
  while (!sunk && count < 8) {
    const t = G.hint(h, p),
      a = Math.atan2(t.z - p.z, t.x - p.x) + error,
      d = Math.hypot(t.z - p.z, t.x - p.x);
    const shot = G.simulate(h, p, { x: p.x + Math.cos(a) * d, z: p.z + Math.sin(a) * d });
    seen.push(...shot.path);
    p = shot.end;
    sunk = shot.sunk;
    count++;
  }
  return { count, sunk, seen };
}

test('200 seeds per level give nine sound holes each, in time', () => {
  for (const level of G.levels) {
    const times = [];
    for (const seed of seeds(200)) {
      const t = performance.now(),
        holes = G.generate(level, seed);
      times.push(performance.now() - t);
      if (kept.size < 150 && seeds(50).includes(seed)) kept.set(level + seed, holes);
      assert.equal(holes.length, 9);
      const names = new Set(holes.map((h) => h.name));
      assert.equal(names.size, 9, level + ' ' + seed + ' names');
      holes.forEach((h, i) => {
        const where = level + ' seed ' + seed + ' hole ' + (i + 1);
        assert.ok(h.par >= 2 && h.par <= 4, where + ' par ' + h.par);
        assert.ok(G.free(h, h.tee.x, h.tee.z) && G.free(h, h.cup.x, h.cup.z), where + ' tee and cup on the lane');
        assert.ok(G.playout(h) <= h.par, where + ' the hint makes par');
        if (i) assert.notEqual(h.type, holes[i - 1].type, where + ' same type twice in a row');
      });
    }
    times.sort((a, b) => a - b);
    const median = times[100],
      worst = times.at(-1);
    console.log(level + ': a course in ' + median.toFixed(0) + ' ms (median), ' + worst.toFixed(0) + ' ms at worst');
    // Loose bounds: a busy CI runner must not fail this. The times above are the real measure.
    assert.ok(median < 600, level + ' median ' + median);
  }
});

test('the same seed gives the same course, and each new seed a new one', () => {
  for (const level of G.levels) {
    const a = JSON.stringify(G.generate(level, 42)),
      b = JSON.stringify(G.generate(level, 42)),
      c = JSON.stringify(G.generate(level, 43));
    assert.equal(a, b);
    assert.notEqual(a, c);
  }
});

test('a course starts gently and ends with its showpiece', () => {
  const finale = { facile: 'grand-pont', moyen: 'grande-terrasse', fort: 'moulin' };
  for (const level of G.levels)
    for (const seed of seeds(30)) {
      const holes = course(level, seed);
      assert.equal(holes[8].type, finale[level]);
      assert.ok(['droit', 'green', 'virage'].includes(holes[0].type), holes[0].type);
    }
  // The level picks the obstacles: the mill only in Difficile, bank shots and tunnels from Moyen.
  const kinds = (level) => new Set(seeds(30).flatMap((seed) => course(level, seed).flatMap((h) => h.parts.map((p) => p.kind))));
  assert.ok(!kinds('facile').has('mill') && !kinds('facile').has('tunnel') && !kinds('facile').has('bank'));
  // Facile has one bridge, in its showpiece, and only wide gates.
  for (const seed of seeds(30)) assert.equal(course('facile', seed).filter((h) => h.parts.some((p) => p.kind === 'bridge')).length, 1);
  assert.ok(G.LEVEL.facile.gate > G.LEVEL.fort.gate);
  assert.ok(kinds('moyen').has('tunnel') && kinds('moyen').has('bank') && !kinds('moyen').has('mill'));
  assert.ok(kinds('fort').has('mill') && kinds('fort').has('gate'));
});

test('the hint finishes every hole of 50 seeds per level at par or better, inside the walls', () => {
  for (const level of G.levels)
    for (const seed of seeds(50))
      for (const h of course(level, seed)) {
        const { count, sunk, seen } = playHole(h);
        assert.ok(sunk && count <= h.par, level + ' ' + seed + ' ' + h.name);
        for (const p of seen) assert.ok(G.free(h, p.x, p.z) || (p.x === h.cup.x && p.z === h.cup.z), level + ' ' + seed + ' left the lane');
      }
});

test('a fixed aiming error costs more strokes over par at each level', () => {
  const over = G.levels.map((level) => {
    let total = 0;
    for (const seed of seeds(50))
      for (const h of course(level, seed)) total += playHole(h, 0.06).count - h.par;
    return total;
  });
  assert.ok(over[0] < over[1] && over[1] < over[2], over.join(', '));
  // The holes get tighter too: a smaller cup and narrower lanes.
  assert.ok(G.LEVEL.facile.cup > G.LEVEL.moyen.cup && G.LEVEL.moyen.cup > G.LEVEL.fort.cup);
});

test('the preview shows less of the path at each level', () => {
  // A long shot whose first bounce comes after 3 m, then one that hits a toadstool sooner.
  const shots = seeds(20).map((seed) => {
    const h = G.course('fort', seed)[0];
    return G.simulate(h, h.tee, { x: h.tee.x + 12, z: h.tee.z + 3 });
  });
  const travel = (shot) => shot.path.slice(1, shot.firstBounce + 1).reduce((d, p, i) => d + Math.hypot(p.x - shot.path[i].x, p.z - shot.path[i].z), 0);
  const late = shots.find((s) => s.firstBounce !== null && travel(s) > 4),
    early = shots.find((s) => s.firstBounce !== null && travel(s) < 2.5);
  assert.ok(late && early);
  const shown = G.levels.map((level) => G.reveal(level, late));
  assert.equal(shown[0], late.path.length - 1);
  assert.ok(shown[0] > shown[1] && shown[1] > shown[2], shown.join(', '));
  // Moyen never shows less than Difficile.
  assert.ok(G.reveal('moyen', early) >= G.reveal('fort', early));
});

test('wild shots from anywhere never leave the lane', () => {
  const rnd = G.random(99);
  for (const level of G.levels)
    for (const seed of seeds(12))
      for (const h of course(level, seed)) {
        let p = h.tee;
        for (let k = 0; k < 6; k++) {
          const a = rnd() * Math.PI * 2,
            d = 1 + rnd() * 18,
            shot = G.simulate(h, p, { x: p.x + Math.cos(a) * d, z: p.z + Math.sin(a) * d });
          for (const q of shot.path) assert.ok(G.free(h, q.x, q.z) || shot.sunk, level + ' ' + seed + ' ' + h.name);
          // No shot keeps him waiting: a ball held in sand or against a wall on a slope stops.
          assert.ok(shot.steps < 25 * 60, level + ' ' + seed + ' ' + h.name + ' ran to the time limit');
          // And it stops only where it would stay: let go again from there, it does not roll on.
          if (!shot.sunk) assert.ok(G.simulate(h, shot.end, shot.end, false).steps <= 121, level + ' ' + seed + ' ' + h.name + ' stopped while rolling');
          if (!shot.sunk) p = shot.end;
        }
      }
});

test('most holes have two obstacles, and sand slows the ball', () => {
  for (const level of G.levels) {
    const holes = seeds(30).flatMap((seed) => course(level, seed)),
      count = (h) => (h.bumpers.length > 0) + (h.sands.length > 0) + (h.bumps.length > 0) + !!h.ramp + new Set(h.regions.map((r) => (r.kind === 'water' || r.kind === 'flowers' ? 'part' : r.kind))).size;
    assert.ok(holes.filter((h) => count(h) >= 2).length > holes.length * 0.6, level);
    assert.ok(holes.some((h) => h.sands.length) && holes.some((h) => h.regions.some((r) => r.kind === 'rock')), level);
    if (level !== 'facile') assert.ok(holes.some((h) => h.regions.some((r) => r.kind === 'board')), level);
  }
  // The same shot across a sand trap, and without it.
  const h = seeds(30).flatMap((seed) => course('facile', seed)).find((h) => h.sands.length),
    target = { x: h.sands[0].x, z: h.sands[0].z },
    sandy = G.simulate(h, h.tee, target),
    plain = G.simulate({ ...h, sands: [] }, h.tee, target);
  const run = (shot) => shot.path.reduce((d, p, i) => (i ? d + Math.hypot(p.x - shot.path[i - 1].x, p.z - shot.path[i - 1].z) : 0), 0);
  assert.ok(run(sandy) < run(plain) - 0.2, run(sandy) + ' ' + run(plain));
});

test('a ball rocking in a dip is not stopped on its side', () => {
  // This shot comes back to almost the same place 2 s apart while it still rolls in the dip.
  const h = G.course('moyen', 4)[2],
    shot = G.simulate(h, h.tee, { x: 5.16, z: 0.41 });
  assert.ok(G.simulate(h, shot.end, shot.end, false).steps <= 121);
});

test('the mill turns on a clock that restarts at each stroke', () => {
  const h = G.course('fort', 11)[8];
  assert.ok(h.mill);
  // Straight at the gate with different paces: some get through, some bounce off a sail.
  const gate = { x: h.mill.x - h.mill.dz * h.mill.o, z: h.mill.z + h.mill.dx * h.mill.o };
  const results = [];
  for (let d = 2; d < 14; d += 0.25) {
    const a = Math.atan2(gate.z - h.tee.z, gate.x - h.tee.x),
      shot = G.simulate(h, h.tee, { x: h.tee.x + Math.cos(a) * d, z: h.tee.z + Math.sin(a) * d });
    const past = (shot.end.x - h.mill.x) * h.mill.dx + (shot.end.z - h.mill.z) * h.mill.dz > 0;
    results.push(past);
    assert.deepEqual(G.simulate(h, h.tee, { x: h.tee.x + Math.cos(a) * d, z: h.tee.z + Math.sin(a) * d }), shot);
  }
  assert.ok(results.includes(true) && results.includes(false));
});

test('the complete path is reproducible before a shot and after undo and reload', () => {
  const state = G.fresh('moyen', 0, 5),
    { h, ball } = G.current(state),
    target = { x: h.tee.x + 4, z: h.tee.z + 0.5 };
  const preview = G.simulate(h, ball, target);
  assert.deepEqual(G.play(state, target), preview);
  const copy = G.restore(JSON.parse(JSON.stringify(state)));
  assert.deepEqual(G.current(copy).ball, preview.end);
  assert.deepEqual(G.undo(copy), target);
  assert.deepEqual(G.play(copy, target), preview);
});

test('the cup catches a slow ball and lets a fast ball cross', () => {
  const h = { ...G.course('facile', 3)[0] };
  const dir = { x: h.cup.x - h.tee.x, z: h.cup.z - h.tee.z },
    len = Math.hypot(dir.x, dir.z),
    to = (d) => ({ x: h.tee.x + (dir.x / len) * d, z: h.tee.z + (dir.z / len) * d });
  assert.ok(G.simulate(h, h.tee, to(len + 0.2)).sunk);
  assert.ok(!G.simulate(h, h.tee, to(len - 0.6)).sunk);
  // Far too fast: it crosses the cup, then may come back off the end wall.
  const fast = G.simulate(h, h.tee, to(len + 9));
  assert.ok(fast.path.some((p, i) => i && Math.hypot(p.x - h.cup.x, p.z - h.cup.z) < h.cup.r && !(p.x === h.cup.x && p.z === h.cup.z)));
});

test('a hole takes at most eight strokes and undo crosses a hole boundary', () => {
  const s = G.fresh('facile', 0, 9),
    { h } = G.current(s),
    away = { x: h.tee.x, z: h.tee.z + 0.3 };
  for (let i = 0; i < 8; i++) assert.ok(G.play(s, { x: G.current(s).ball.x - 0.4, z: G.current(s).ball.z }));
  assert.equal(G.current(s).done, true);
  assert.deepEqual(G.current(s).ball, { x: h.cup.x, z: h.cup.z });
  assert.equal(G.play(s, away), null);
  s.rounds.push([]);
  assert.ok(G.undo(G.restore(structuredClone(s))));
  G.undo(s);
  assert.equal(s.rounds.length, 1);
  assert.equal(G.current(s).count, 7);
});

test('the save reader checks targets, holes, counts and shape, and keeps the level of an old save', () => {
  const s = G.fresh('moyen', 2, 77);
  for (const patch of [
    { rounds: [] },
    { rounds: [[], []] },
    { rounds: [[{ x: NaN, z: 0 }]] },
    { rounds: [[{ x: 80, z: 0 }]] },
    { rounds: [Array(9).fill({ x: 1, z: 0 })] },
    { finished: -1 },
    { v: 2 },
    { v: 4 },
    { seed: -1 },
    { seed: 1.5 },
    { won: true },
    { credited: 3 }
  ])
    assert.equal(G.restore({ ...s, ...patch }), null, JSON.stringify(patch));
  assert.equal(G.restore({ ...s, level: 'ancien' }).level, 'facile');
  // The first version saved no seed: it gives a fresh course, at its level and with its count.
  const old = { v: 1, level: 'fort', finished: 4, credited: false, won: false, rounds: [[{ x: 2, z: 1 }]] };
  assert.equal(G.restore(old), null);
  assert.equal(G.oldLevel(old), 'fort');
  assert.equal(G.oldFinished(old), 4);
  assert.equal(G.oldLevel(null), null);
});
