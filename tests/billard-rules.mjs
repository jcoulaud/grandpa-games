import test from 'node:test';
import assert from 'node:assert/strict';
import * as B from '../public/billard/engine.js';

const { L, W, R, headSpot, footSpot, pockets, cushions, jaws, headString } = B.table;
const diameter = R * 2, radians = Math.PI / 180;
const pose = (id, x, y) => ({ id, x, y, q: [1, 0, 0, 0] });
const distance = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);
const near = (actual, expected, tolerance) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} differs from ${expected} by more than ${tolerance}`);
const pick = (balls, id) => balls.find((b) => b.id === id);
const median = (samples) => quantile(samples, 0.5);
const quantile = (samples, fraction) => [...samples].sort((a, b) => a - b)[Math.floor(samples.length * fraction)];
const straight = (power, top = 0) => ({ angle: 0, power, spin: { top } });
const sidePot = (power, top = 0) => ({ angle: -Math.PI / 2, power, spin: { top } });
const seedAt = (i) => Math.imul(i + 1, 0x9e3779b9) >>> 0;
const onAxis = (p, id, depth) => pose(id, p.x + p.nx * depth, p.y + p.ny * depth);
const depthAt = (p, b) => (b.x - p.x) * p.nx + (b.y - p.y) * p.ny;
const facings = cushions.filter((_, i) => i % 3 !== 1).map(({ a, b }, i) =>
  i % 2 === 0 ? { tip: b, back: a } : { tip: a, back: b });
const facingsAt = (p) => facings.toSorted((a, b) => distance(a.tip, p) - distance(b.tip, p)).slice(0, 2);

function velocity(frames, index, id = 0) {
  const a = pick(frames[index].balls, id), b = pick(frames[index + 1].balls, id);
  const dt = frames[index + 1].t - frames[index].t;
  const vx = (b.x - a.x) / dt, vy = (b.y - a.y) / dt;
  return { vx, vy, speed: Math.hypot(vx, vy), angle: Math.atan2(vy, vx) };
}
const after = (sim, event) => sim.frames.findIndex((f) => f.t > event.t);
function clearRest(balls) {
  for (const [i, b] of balls.entries()) {
    const onCloth = b.x >= 0 && b.x <= L && b.y >= 0 && b.y <= W;
    const onShelf = pockets.some((p) => depthAt(p, b) >= p.capture && depthAt(p, b) < (p.nx ? p.mouth / 2 : 0) &&
      Math.abs((b.y - p.y) * p.nx - (b.x - p.x) * p.ny) < p.width);
    assert.ok(onCloth || onShelf, JSON.stringify(b));
    assert.ok(pockets.every((p) => distance(b, p.hole) >= p.hole.r), JSON.stringify(b));
    for (const a of balls.slice(i + 1)) assert.ok(distance(a, b) >= diameter - 1e-7, `Overlap between ${a.id} and ${b.id}`);
  }
}

test('the 7-foot table and the seeded rack agree with the renderer geometry', () => {
  assert.deepEqual([L, W, R, B.table.mass], [1.98, 0.99, 0.028575, 0.17]);
  for (let i = 0; i < 20; i++) {
    const rack = B.rack(seedAt(i));
    assert.deepEqual(B.rack(seedAt(i)), rack);
    assert.equal(rack[5].id, 8);
    assert.notEqual(B.groupOf(rack[11].id), B.groupOf(rack[15].id));
    assert.deepEqual({ x: rack[1].x, y: rack[1].y }, footSpot);
    assert.equal(new Set(rack.map((b) => b.id)).size, 16);
    assert.equal(new Set(rack.map((b) => b.q.join(','))).size, 16);
    clearRest(rack);
    for (const [j, b] of rack.entries()) {
      for (const a of rack.slice(j + 1)) {
        const gap = distance(a, b) - diameter;
        if (gap < 0.01) assert.ok(gap > 0 && gap < 0.0003);
      }
    }
  }
});

test('each cushion widens at its back and each pair of jaws narrows to the hole rim', () => {
  assert.equal(cushions.length, 18);
  assert.equal(jaws.length, 24);
  for (let i = 0; i < cushions.length; i += 3) {
    const [start, nose, end] = cushions.slice(i, i + 3);
    assert.deepEqual([start.kind, nose.kind, end.kind], ['jaw', 'cushion', 'jaw']);
    assert.deepEqual(start.b, nose.a);
    assert.deepEqual(end.a, nose.b);
    assert.ok(distance(start.a, end.b) > distance(nose.a, nose.b));
    const horizontal = nose.a.y === nose.b.y;
    near(Math.abs(horizontal ? start.a.y - nose.a.y : start.a.x - nose.a.x), 0.05, 1e-9);
    near(Math.abs(horizontal ? end.b.y - nose.b.y : end.b.x - nose.b.x), 0.05, 1e-9);
    for (const tip of [start.a, nose.a, nose.b, end.b]) {
      assert.ok(jaws.some((p) => distance(p, tip) < 1e-9 && p.r === 0.003));
    }
  }
  for (const p of pockets) {
    assert.ok(B.pocketNames[p.id].startsWith('le trou'));
    const [a, b] = facingsAt(p);
    const side = p.nx === 0, mouth = distance(a.tip, b.tip), throat = distance(a.back, b.back);
    near(mouth, side ? 0.127 : 0.1143, 1e-9);
    near(mouth, p.mouth, 1e-9);
    near(throat, 2 * p.width, 1e-9);
    assert.ok(throat < mouth);
    const shelf = depthAt(p, a.tip) - depthAt(p, p.hole) - p.hole.r;
    near(shelf, p.shelf, 1e-9);
    assert.ok(side ? shelf >= 0 && shelf <= 0.009525 : shelf >= 0.0254 && shelf <= 0.05715);
    for (const [jaw, opposite] of [[a, b], [b, a]]) {
      const dx = jaw.back.x - jaw.tip.x, dy = jaw.back.y - jaw.tip.y;
      assert.ok(dx * (opposite.tip.x - jaw.tip.x) + dy * (opposite.tip.y - jaw.tip.y) > 0);
      const nose = cushions.find((s) => s.kind === 'cushion' && (s.a === jaw.tip || s.b === jaw.tip));
      const far = nose.a === jaw.tip ? nose.b : nose.a;
      const cosine = (dx * (far.x - jaw.tip.x) + dy * (far.y - jaw.tip.y)) / (distance(jaw.tip, jaw.back) * distance(jaw.tip, far));
      near(Math.acos(cosine) / radians, side ? 104 : 142, 1e-9);
      near(distance(jaw.back, p.hole), p.hole.r, 1e-9);
      near(depthAt(p, jaw.back), p.capture, 1e-9);
    }
    assert.ok(depthAt(p, p.drop) < p.capture);
  }
});

test('stun transfers speed, rolling follow retains about 2/7, and draw reverses', () => {
  const cue = pose(0, 0.55, 0.47);
  for (const [name, gap, top] of [['stun', 0.00001, 0], ['follow', 0.19, 0.8], ['draw', 0.019, -0.8]]) {
    const balls = [cue, pose(1, cue.x + gap + diameter, cue.y)];
    const sim = B.simulate(balls, straight(4, top), true);
    const hit = sim.events[0], index = after(sim, hit);
    assert.equal(hit.type, 'ball');
    assert.equal(sim.firstHit, 1);
    if (name === 'stun') {
      assert.ok(velocity(sim.frames, index).speed < hit.speed * 0.10);
      assert.ok(velocity(sim.frames, index, 1).speed > hit.speed * 0.9);
    } else if (name === 'follow') {
      const speeds = sim.frames.slice(index, index + 19).map((_, j) => velocity(sim.frames, index + j).vx);
      near(Math.max(...speeds) / hit.speed, 2 / 7, 0.025);
    } else {
      assert.ok(velocity(sim.frames, index + 8).vx < -0.2);
      assert.ok(pick(sim.balls, 0).x < cue.x - 0.3);
    }
  }
});

test('cut aim gives the 90-degree tangent and a rolling half-ball hit curves about 30 degrees', () => {
  const cue = pose(0, 0.55, 0.47), cut = Math.PI / 6, ghostX = cue.x + 0.19;
  const balls = [cue, pose(1, ghostX + diameter * Math.cos(cut), cue.y + diameter * Math.sin(cut))];
  const aim = B.aimLine(balls, 0);
  assert.equal(aim.hit, 1);
  near(aim.contact.x, ghostX, 1e-9);
  near(aim.objectDir, cut, 1e-9);
  near(aim.cueDir, -60 * radians, 1e-9);
  const sim = B.simulate(balls, straight(4, 0.8), true);
  const index = after(sim, sim.events[0]);
  const first = velocity(sim.frames, index);
  const rolling = velocity(sim.frames, index + 12);
  near(first.angle, aim.cueDir, 9 * radians);
  near(rolling.angle - aim.cueDir, 30 * radians, 4 * radians);
  const object = velocity(sim.frames, index, 1);
  assert.ok(aim.objectDir - object.angle > 1 * radians);
  assert.ok(aim.objectDir - object.angle < 3 * radians);
});

test('the cushion reflects, exchanges spin with the ball and returns about 75 percent of its speed', () => {
  const cue = pose(0, L - R - 0.18, W / 2);
  const normal = B.simulate([cue], straight(4, 0.8), true);
  const event = normal.events[0], index = after(normal, event);
  assert.equal(event.type, 'cushion');
  const rebound = velocity(normal.frames, index);
  assert.ok(rebound.vx < 0);
  near(rebound.speed / event.speed, 0.75, 0.055);
  const angles = [-1, 0, 1].map((side) => {
    const sim = B.simulate([cue], { angle: 0.31, power: 4.2, spin: { side, top: 0 } }, true);
    const bounce = sim.events[0];
    assert.equal(bounce.type, 'cushion');
    const { vx, vy } = velocity(sim.frames, after(sim, bounce));
    assert.ok(vx < 0 && vy > 0);
    return Math.atan2(vy, -vx);
  });
  near(angles[1], 0.35, 0.11);
  assert.ok(angles[0] - angles[2] > 0.12 || angles[2] - angles[0] > 0.12);
});

test('the visible top rolls in the direction of travel and frame quaternions stay unit length', () => {
  const cue = pose(0, 0.55, 0.47);
  const sim = B.simulate([cue], straight(3, 0.8), true);
  const frame = sim.frames[1], b = frame.balls[0], [w, x, y, z] = b.q;
  assert.equal(frame.t, 1 / 60);
  const visibleTopX = -2 * (w * y + x * z);
  assert.ok(visibleTopX > 0);
  near(visibleTopX, Math.sin((b.x - cue.x) / R), 0.001);
  for (const sample of sim.frames) near(Math.hypot(...sample.balls[0].q), 1, 1e-10);
  assert.deepEqual(B.simulate([cue], straight(3, 0.8)).balls, sim.balls);
});

test('each pocket takes a straight shot, an aimed jaw rejects it, and a fast ball can rattle out', () => {
  for (const p of pockets) {
    const cue = onAxis(p, 0, 0.4), angle = Math.atan2(-p.ny, -p.nx);
    const sim = B.simulate([cue], { angle, power: 4 }, true);
    const event = sim.events.find((e) => e.type === 'pocket');
    assert.equal(event.pocket, p.id);
    assert.deepEqual(event.drop, p.drop);
    near(depthAt(p, event), p.capture, 1e-9);
    assert.ok(event.speed > 0 && Math.hypot(event.vx, event.vy) > 0);
    assert.ok(sim.frames.every((f) => (f.t < event.t) === !!pick(f.balls, 0)));
    const { tip, back } = facingsAt(p).find(({ tip }) => tip.y === p.y);
    const x = tip.x + (back.x - tip.x) * 0.2;
    const hit = B.simulate([pose(0, x, p.y + 0.32 * p.ny)], { angle: -p.ny * Math.PI / 2 / Math.abs(p.ny), power: 4 });
    assert.equal(hit.events[0].type, 'jaw');
    assert.equal(hit.pocketed.length, 0);
  }
  const rattle = B.simulate([pose(0, 1.48289, 0.22058)], { angle: -2.7568, power: 10 });
  assert.deepEqual(rattle.events.slice(0, 2).map((e) => e.type), ['jaw', 'jaw']);
  assert.equal(rattle.pocketed.length, 0);
});

test('hard shots conserve geometry and dissipate energy, and a straight break spreads the rack', (t) => {
  const racks = [], spare = [pose(0, 0.61, 0.46), pose(1, 1.51, 0.64)];
  let state = 98402;
  const random = () => ((state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 4294967296);
  const hard = B.simulate([spare[0], pose(1, 0.61 + diameter + 0.005, 0.46)], straight(10));
  assert.equal(hard.firstHit, 1);
  assert.equal(hard.events[0].type, 'ball');
  const cushion = B.simulate([pose(0, L - R - 0.02, W / 2)], straight(10));
  assert.equal(cushion.events[0].type, 'cushion');
  for (let i = 0; i < 320; i++) {
    const balls = B.rack(seedAt(i));
    const shot = i < 96 ? straight(10) : {
      angle: i % 3 ? (random() - 0.5) * 0.2 : random() * 2 * Math.PI,
      power: i % 3 ? 10 : 1 + 9 * random(), spin: { top: 2 * random() - 1, side: 2 * random() - 1 }
    };
    const sim = B.simulate(balls, shot, i % 20 === 0);
    assert.equal(sim.balls.length + sim.pocketed.length, 16);
    clearRest(sim.balls);
    if (sim.frames) {
      assert.deepEqual(B.simulate(balls, shot, true), sim);
      for (let j = 1; j < sim.frames.length; j++) {
        assert.ok(sim.frames[j].energy <= sim.frames[j - 1].energy + 1e-10, `Energy rose on shot ${i}, frame ${j}`);
      }
    }
    if (i < 96) racks.push(balls.filter((b) => {
      const final = pick(sim.balls, b.id);
      return b.id && (!final || distance(b, final) > 0.2);
    }).length);
  }
  t.diagnostic(`Median spread past 20 cm: ${median(racks)} balls over ${racks.length} straight breaks`);
  assert.ok(median(racks) >= 6);
});

function position(balls, options = {}) {
  return { ...B.fresh('moyen', 3, 42), balls, broken: true, shots: 5, ...options };
}
const groups = () => ({ player: 'pleines' });
const cue = (y = 0.3) => pose(0, L / 2, y);
const inMouth = (id, y = 0.12) => pose(id, L / 2, y);
const solid = pose(3, 0.64, 0.62), stripe = pose(9, 1.2, 0.3), black = pose(8, 1.5, 0.61);

test('a soft ball can rest on the shelf and falls if it runs out of speed over the slate hole', () => {
  const p = pockets.find(({ id }) => id === 'hm');
  const shelf = B.simulate([cue(0.312)], sidePot(1, -1));
  assert.equal(shelf.pocketed.length, 0);
  assert.ok(shelf.balls[0].y < 0 && distance(shelf.balls[0], p.hole) > p.hole.r);
  const saved = position([...shelf.balls, black]);
  assert.deepEqual(B.restore(saved, 99), saved);

  const slowPot = B.simulate([cue()], sidePot(1, -1));
  assert.equal(slowPot.balls.length, 0);
  assert.equal(slowPot.events[0].pocket, p.id);
  assert.ok(distance(slowPot.events[0], p.hole) < p.hole.r);
});

test('the first legal pot assigns groups, and own pots keep the turn on the break or later', () => {
  for (const opening of [true, false]) {
    const g = position([cue(), inMouth(2), stripe, black], { broken: !opening, shots: opening ? 0 : 5 });
    const r = B.play(g, sidePot(4));
    assert.equal(r.foul, null);
    assert.equal(r.assigned, 'pleines');
    assert.deepEqual(g.groups, groups());
    assert.deepEqual(r.pocketed, { own: [2], other: [], eight: false });
    assert.ok(r.keepsTurn);
    assert.equal(g.turn, 'player');
    assert.deepEqual(B.remaining(g, 'player'), []);
    assert.deepEqual(B.remaining(g, 'cpu'), [9]);
  }
  const cpu = position([cue(), inMouth(2), stripe, black], { turn: 'cpu' });
  assert.equal(B.play(cpu, sidePot(4)).assigned, 'pleines');
  assert.deepEqual(cpu.groups, { player: 'rayees' });
  assert.deepEqual(B.remaining(cpu, 'player'), [9]);
  const g = position([cue(), inMouth(1, 0.20), inMouth(9, 0.10), black], { groups: groups() });
  const r = B.play(g, sidePot(4));
  assert.equal(r.foul, null);
  assert.equal(r.keepsTurn, false);
  assert.deepEqual(r.pocketed.other, [9]);
  assert.equal(pick(g.balls, 9), undefined);
});

test('miss, wrong first contact and scratch give the correct ball in hand', () => {
  for (const [balls, shot, assigned, foul] of [
    [[cue(), solid, black], straight(1), groups(), 'miss'],
    [[cue(), stripe, black, solid], straight(2), groups(), 'wrong'],
    [[cue(0.74), inMouth(8, 0.55), solid, stripe], sidePot(1), { player: null }, 'wrong'],
    [[cue(), solid, black], sidePot(4), groups(), 'scratch']
  ]) {
    const g = position(balls, { groups: assigned });
    assert.equal(B.play(g, shot).foul, foul);
    assert.equal(g.turn, 'cpu');
    assert.ok(g.ballInHand);
    assert.equal(g.behindLine, false);
    assert.equal(pick(g.balls, 0), undefined);
    assert.ok(B.canPlace(g, 1.7, 0.4));
  }
  const g = B.fresh('facile', 0, 99), initial = structuredClone(g);
  const angle = Math.atan2(-headSpot.y, L / 2 - headSpot.x);
  const r = B.play(g, { angle, power: 4 });
  assert.equal(r.foul, 'scratch');
  assert.ok(g.ballInHand && g.behindLine);
  assert.equal(B.placeCue(g, headString + 0.00001, W / 2), false);
  assert.equal(B.placeCue(g, NaN, 0.4), false);
  assert.equal(B.placeCue(g, 0, 0), false);
  assert.equal(B.placeCue(g, headString, W / 2), true);
  assert.ok(!g.ballInHand && !g.behindLine);
  assert.ok(B.undo(g));
  assert.deepEqual(g, initial);
});

test('an early 8 loses, a scratched 8 loses, and clearing the group first allows the win', () => {
  const early = position([cue(), inMouth(1, 0.2), inMouth(8, 0.1), stripe], { groups: groups() });
  assert.deepEqual(B.play(early, sidePot(4)).over, { winner: 'cpu', reason: '8-early' });
  const scratch = position([cue(0.24), inMouth(8), stripe], { groups: groups() });
  assert.deepEqual(B.play(scratch, sidePot(4, 0.8)).over, { winner: 'cpu', reason: '8-foul' });
  const win = position([cue(), inMouth(8), stripe], { groups: groups() }), before = structuredClone(win);
  assert.deepEqual(B.play(win, sidePot(4)).over, { winner: 'player', reason: 'win' });
  assert.equal(win.wins, before.wins + 1);
  assert.deepEqual(B.restore(JSON.parse(JSON.stringify(win)), 8), win);
  assert.ok(B.undo(win));
  assert.deepEqual(win, before);
});

test('the 8 is spotted on the opening shot, including when the foot spot is occupied', () => {
  for (const blocked of [false, true]) {
    const g = position([cue(), inMouth(1, 0.2), inMouth(8, 0.1), stripe,
      ...(blocked ? [pose(3, footSpot.x, footSpot.y)] : [])], { broken: false, shots: 0 });
    const r = B.play(g, sidePot(4));
    assert.ok(r.pocketed.eight);
    assert.equal(g.over, null);
    const respot = pick(g.balls, 8);
    near(respot.x, footSpot.x + (blocked ? diameter : 0), 1e-8);
    near(respot.y, footSpot.y, 1e-8);
  }
});

test('undo discards the CPU reply, and restore validates both positions and history', () => {
  const g = B.fresh('fort', 2, 21), before = structuredClone(g);
  B.play(g, { angle: Math.PI / 2, power: 1 });
  const shot = B.cpuShot(g);
  assert.deepEqual(B.cpuShot(g), shot);
  assert.ok(B.canPlace(g, shot.place.x, shot.place.y));
  B.play(g, shot);
  const restored = B.restore(JSON.parse(JSON.stringify(g)), 90);
  assert.deepEqual(restored, g);
  assert.ok(B.undo(restored));
  assert.deepEqual(restored, before);
  const reset = B.fresh('fort', 2, 90);
  for (const edit of [
    (bad) => { bad.balls[0].x = Infinity; },
    (bad) => { bad.balls[0].y = -1; },
    (bad) => { bad.balls[0].q = [0, 0, 0, 0]; },
    (bad) => { bad.balls[0].id = bad.balls[1].id; },
    (bad) => { [bad.balls[0].x, bad.balls[0].y] = [bad.balls[1].x, bad.balls[1].y]; },
    (bad) => { bad.history[0].behindLine = true; },
    (bad) => { bad.history[0].balls[0].id = 17; },
    (bad) => { bad.history[0].shots = bad.shots; }
  ]) {
    const bad = structuredClone(g);
    edit(bad);
    assert.deepEqual(B.restore(bad, 90), reset);
  }
  const scaled = structuredClone(before);
  scaled.balls[0].q = scaled.balls[0].q.map((q) => q * 2);
  const loaded = B.restore(scaled, 90);
  assert.equal(loaded.seed, before.seed);
  near(Math.hypot(...loaded.balls[0].q), 1, 1e-12);
});

test('a hint pots the named ball, and the path preview ends at the matching pocket', () => {
  for (const p of pockets) {
    for (const inHand of [false, true]) {
      const balls = [...(inHand ? [] : [onAxis(p, 0, 0.4)]), onAxis(p, 2, 0.16), stripe, black];
      const g = position(balls, { ballInHand: inHand, groups: groups() });
      const hint = B.hint(g);
      assert.equal(hint.target, 2);
      assert.equal(hint.pocket, p.id);
      assert.match(hint.reason, /Visez la 2 bleue vers le trou/);
      if (inHand) {
        assert.ok(B.canPlace(g, hint.place.x, hint.place.y));
        const suggestion = B.suggestPlace(g);
        assert.ok(B.canPlace(g, suggestion.x, suggestion.y));
        assert.ok(B.placeCue(g, hint.place.x, hint.place.y));
      }
      const preview = B.previewPath(g.balls, hint);
      const sim = B.simulate(g.balls, hint);
      const fall = sim.events.find((e) => e.a === hint.target && e.type === 'pocket');
      assert.equal(fall.pocket, hint.pocket);
      assert.equal(preview.hit, hint.target);
      assert.equal(preview.potted, true);
      assert.equal(preview.pocket, hint.pocket);
      assert.deepEqual(preview.object.at(-1), { x: fall.x, y: fall.y });
    }
  }
});

test('the player break hint is deterministic and uses the existing cue position', () => {
  const g = B.fresh('fort', 0, seedAt(0));
  const initial = structuredClone(g);
  const shot = B.hint(g);
  assert.deepEqual(B.hint(g), shot);
  assert.deepEqual(g, initial);
  assert.equal(shot.place, undefined);
  assert.ok(shot.power >= 9.7);
  assert.deepEqual(B.play(g, { ...shot, place: { x: headString, y: W / 4 } }).sim, B.simulate(initial.balls, shot));
  assert.ok(B.undo(g));
  assert.deepEqual(g, initial);
});

test('the default and hinted breaks reload with their opening rack for seeds 0 through 2000', () => {
  for (let seed = 0; seed <= 2000; seed++) {
    const initial = B.fresh('moyen', 0, seed);
    for (const [index, a] of initial.balls.entries()) {
      for (const b of initial.balls.slice(index + 1)) {
        assert.ok(distance(a, b) >= diameter, `Seed ${seed} overlaps balls ${a.id} and ${b.id}`);
      }
    }
    for (const [name, shot] of [['default', straight(9)], ['hint', B.hint(initial)]]) {
      const g = structuredClone(initial);
      B.play(g, shot);
      assert.deepEqual(B.restore(JSON.parse(JSON.stringify(g)), 2001), g, `Seed ${seed}, ${name} break`);
    }
  }
});

test('restore accepts tiny overlaps in the current position', () => {
  const current = position([pose(0, 0.4, 0.3), pose(8, 0.4 + diameter - 5e-7, 0.3)]);
  assert.deepEqual(B.restore(current, 2001), current);
});

test('a legacy rack reloads after a shot that leaves the rack untouched', () => {
  // The original positions from commit 4c399ac, before the seeded rack was widened.
  const coordinates = [
    [1.4849999999999999, 0.495], [1.5346409917355819, 0.46640520158302384],
    [1.534551884285024, 0.5235864220367942], [1.5842293880786833, 0.4377704860548896],
    [1.5841819923058458, 0.49502034774661646], [1.5842493312230175, 0.5522269630636077],
    [1.6337879945432272, 0.4091048530312395], [1.6337856649543199, 0.46636157863224736],
    [1.633750683529715, 0.5236758904353622], [1.6338207603141555, 0.5809355414720799],
    [1.683375604384404, 0.38040238241412794], [1.6834475477702575, 0.4377355311806232],
    [1.6833699335299488, 0.4949875608465937], [1.683351804228441, 0.5522961969329708],
    [1.6833646784326013, 0.6095556665856111]
  ];
  const g = B.fresh('moyen', 0, 637);
  coordinates.forEach(([x, y], i) => Object.assign(g.balls[i + 1], { x, y }));
  near(diameter - distance(pick(g.balls, 2), pick(g.balls, 6)), 5.03e-6, 1e-9);
  const reload = (save) => B.restore(JSON.parse(JSON.stringify(save)), 2001);
  const shot = sidePot(1);
  const loaded = reload(g), opening = structuredClone(loaded);
  assert.equal(loaded.seed, 637);
  for (const save of [loaded, g]) {
    const { sim } = B.play(save, shot);
    assert.equal(sim.firstHit, null);
    assert.equal(sim.events[0].type, 'cushion');
    const restored = reload(save);
    assert.equal(restored.seed, 637);
    assert.equal(restored.shots, 1);
    assert.equal(restored.turn, 'cpu');
    assert.deepEqual(reload(restored), restored);
    clearRest(restored.balls);
    assert.ok(B.undo(restored));
    assert.deepEqual(restored, opening);
  }
});

test('a hint and each CPU level can reach a blocked 8 off the cushions', () => {
  const balls = [pose(0, 0.15, 0.15), pose(9, 0.21, 0.15), pose(8, 1.10, 0.15)];
  const g = position(balls, { groups: groups() });
  const cpu = { ...g, turn: 'cpu', groups: { player: 'rayees' } };
  for (const shot of [B.hint(g), ...B.levels.map((level) => B.cpuShot({ ...cpu, level }))]) {
    const sim = B.simulate(balls, shot);
    assert.equal(sim.firstHit, 8);
    assert.equal(sim.events[0].type, 'cushion');
    assert.ok(!sim.pocketed.some(({ id }) => id === 0));
  }
});

test('on shot 19 of seed 2, the hint and each CPU level find the legal escape to the 10', () => {
  const g = B.fresh('facile', 0, 2);
  B.play(g, straight(9));
  while (g.shots < 18) {
    const shot = g.turn === 'player' ? B.hint(g) : B.cpuShot(g);
    assert.ok(B.play(g, shot));
  }
  assert.equal(g.turn, 'player');
  assert.equal(g.groups.player, 'rayees');
  assert.equal(B.simulate(g.balls, { angle: 143.5 * radians, power: 4.8 }).firstHit, 10);
  const cpu = { ...g, turn: 'cpu', groups: { player: 'pleines' } };
  assert.equal(B.simulate(g.balls, B.hint(g)).firstHit, 10, 'Hint');
  for (const level of B.levels) {
    assert.equal(B.simulate(g.balls, B.cpuShot({ ...cpu, level })).firstHit, 10, level);
  }
});

test('seeded games choose a legal first contact when the escape search can reach one', (t) => {
  let shots = 0, wrong = 0;
  for (let seed = 0; seed < 24; seed++) {
    const level = B.levels[seed % B.levels.length];
    const g = B.fresh(level, 0, seed);
    B.play(g, straight(9));
    while (g.shots < 80 && !g.over) {
      const shot = g.turn === 'player' ? B.hint(g) : B.cpuShot(g);
      const player = g.groups.player;
      const group = player && (g.turn === 'player' ? player : player === 'pleines' ? 'rayees' : 'pleines');
      const allowed = new Set(g.balls.map((b) => b.id).filter((id) => group ? B.groupOf(id) === group : B.groupOf(id)));
      if (group && !allowed.size) allowed.add(8);
      const balls = shot.place ? [pose(0, shot.place.x, shot.place.y), ...g.balls] : g.balls;
      const label = `Seed ${seed}, ${g.turn} on shot ${g.shots + 1}`;
      const result = B.play(g, shot);
      assert.ok(result, label);
      shots++;
      if (result.sim.firstHit === null || allowed.has(result.sim.firstHit)) continue;
      wrong++;
      for (let i = 0; i < 720; i++) {
        const angle = i * 0.5 * radians;
        for (const power of [3.5, 4.8, 7]) {
          const hit = B.simulate(balls, { angle, power }).firstHit;
          assert.ok(!allowed.has(hit), `${label} hit ${result.sim.firstHit}, but ${i * 0.5}° at power ${power} hits ${hit}`);
        }
      }
    }
  }
  t.diagnostic(`${shots} shots across 24 games, ${wrong} wrong first contacts`);
  assert.ok(shots >= 300);
});

test('seeded hints hit a legal ball first whenever the candidate shots can', () => {
  let state = 239875;
  const random = () => ((state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 4294967296);
  let reachable = 0;
  for (let i = 0; i < 64; i++) {
    const x = 0.15 + random() * 0.4, y = 0.15 + random() * 0.55;
    const balls = [
      pose(0, x, y), pose(9, x + diameter + random() * 0.04, y),
      pose(8, x + 0.5 + random() * 0.8, y + (random() - 0.5) * 0.12)
    ];
    for (let id = 10; id <= 12; id++) {
      const b = pose(id, 0.15 + random() * 1.68, 0.15 + random() * 0.69);
      if (balls.every((a) => distance(a, b) >= diameter)) balls.push(b);
    }
    const g = position(balls, { groups: groups() });
    const firstHit = (shot) => B.simulate(balls, shot).firstHit;
    const angles = Array.from({ length: 180 }, (_, j) => j * 2 * radians);
    if (angles.some((angle) => [4.8, 7].some((power) => firstHit({ angle, power }) === 8))) {
      reachable++;
      assert.equal(firstHit(B.hint(g)), 8, `Position ${i}`);
    }
  }
  assert.ok(reachable >= 48, `Only ${reachable} positions had a reachable 8`);
});

test('stronger levels win more seeded matches and think within the UI budget', (t) => {
  // René's thinking time is measured in breaks: the time one break takes on this machine, timed between
  // his shots, so a slower or busier machine (as in CI) does not fail the test.
  const unit = [];
  const timeBreak = () => {
    const start = performance.now();
    B.simulate(B.rack(seedAt(unit.length)), straight(10));
    unit.push(performance.now() - start);
  };
  const stats = Object.fromEntries(B.levels.map((level) => [level, {
    pots: 0, visits: 0, times: [], openingVisits: 0, openingRunouts: 0
  }]));
  const games = 48, shotLimit = 360;
  for (const [strong, weak, minimum] of [['fort', 'moyen', 0.85], ['moyen', 'facile', 0.65]]) {
    let wins = 0, unfinished = 0;
    for (let i = 0; i < games; i++) {
      const g = B.fresh(strong, 0, seedAt(i));
      const stronger = i % 2 ? 'player' : 'cpu';
      assert.ok(B.play(g, B.hint(g)));
      let pots = 0, firstVisit = true;
      while (g.shots < shotLimit && !g.over) {
        g.level = g.turn === stronger ? strong : weak;
        const record = stats[g.level];
        if (record.times.length % 25 === 0) timeBreak();
        const start = performance.now(), aim = B.cpuShot(g);
        record.times.push(performance.now() - start);
        const result = B.play(g, aim);
        assert.ok(result);
        pots += result.pocketed.own.length;
        if (!result.keepsTurn) {
          record.pots += pots;
          record.visits++;
          if (firstVisit) {
            record.openingVisits++;
            record.openingRunouts += Number(result.over?.reason === 'win');
            firstVisit = false;
          }
          pots = 0;
        }
      }
      wins += Number(g.over?.winner === stronger);
      unfinished += Number(g.over === null);
    }
    t.diagnostic(`${strong} vs ${weak}: ${wins}/${games} wins, ${unfinished} unfinished at ${shotLimit} shots`);
    assert.equal(unfinished, 0);
    assert.ok(wins / games >= minimum);
  }
  const breakTime = median(unit);
  for (const level of B.levels) {
    const { pots, visits, times, openingVisits, openingRunouts } = stats[level];
    const average = pots / visits, p95 = quantile(times, 0.95), max = Math.max(...times);
    t.diagnostic(`${level}: ${average.toFixed(3)} own balls per visit, cpuShot p95 ${p95.toFixed(2)} ms, max ${max.toFixed(2)} ms (${(p95 / breakTime).toFixed(0)} and ${(max / breakTime).toFixed(0)} breaks of ${breakTime.toFixed(3)} ms)`);
    t.diagnostic(`${level}: ${openingRunouts}/${openingVisits} run-outs on the first visit after a match break`);
    if (level === 'fort') assert.ok(average >= 1.5, `Fort averaged ${average.toFixed(3)} own balls per visit`);
    // On this PC a break takes about 0.65 ms: 600 breaks is about 400 ms, 1,800 about 1.2 s.
    assert.ok(p95 / breakTime < 600, `${level} cpuShot p95 is ${(p95 / breakTime).toFixed(0)} breaks`);
    assert.ok(max / breakTime < 1800, `${level} cpuShot max is ${(max / breakTime).toFixed(0)} breaks`);
  }
});

test('Fort runs out from well-spread post-break positions', (t) => {
  // Model a clean spread with one ball of each group down. Mirror and perturb the
  // layout so the benchmark covers both sides of the table and different cut angles.
  const spots = [
    [0.48, 0.49], [1.05, 0.24], [0.36, 0.17], [0.70, 0.71], [1.22, 0.81], [0.38, 0.82],
    [1.61, 0.13], [1.67, 0.81], [1.50, 0.44], [1.13, 0.59], [1.33, 0.18], [1.77, 0.54],
    [1.80, 0.25], [1.45, 0.70], [0.67, 0.27], [1.76, 0.68]
  ];
  const tries = 48;
  for (const level of B.levels) {
    let runouts = 0;
    for (let i = 0; i < tries; i++) {
      const seed = seedAt(i + 2000);
      let state = seed;
      const jitter = () => {
        state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
        return (state / 4294967296 - 0.5) * 0.065;
      };
      const balls = spots.map(([x, y], id) => pose(id, x + jitter(), (i % 2 ? W - y : y) + jitter()))
        .filter((b) => b.id !== 1 && b.id !== 9);
      const g = position(balls, { level, seed, shots: 1, groups: groups() });
      do {
        const result = B.play(g, B.cpuShot(g));
        assert.ok(result);
        if (!result.keepsTurn) break;
      } while (!g.over);
      runouts += Number(g.over?.winner === 'player' && g.over.reason === 'win');
    }
    t.diagnostic(`${level}: ${runouts}/${tries} run-outs on well-spread post-break tables (${(100 * runouts / tries).toFixed(1)}%)`);
    if (level === 'fort') assert.ok(runouts / tries >= 0.15);
  }
});

test('the median shot and break meet their simulation budgets', (t) => {
  const normal = [], breaks = [];
  const balls = [pose(0, 0.5, 0.3), pose(1, 1.2, 0.3), stripe, black];
  for (let i = 0; i < 100; i++) {
    const rack = B.rack(seedAt(i));
    let start = performance.now();
    B.simulate(balls, straight(4));
    normal.push(performance.now() - start);
    start = performance.now();
    B.simulate(rack, straight(10));
    breaks.push(performance.now() - start);
  }
  t.diagnostic(`Simulate medians: ${median(normal).toFixed(3)} ms normal, ${median(breaks).toFixed(3)} ms break`);
  assert.ok(median(normal) < 3);
  assert.ok(median(breaks) < 15);
});
