// The pétanque: the rules of a tête-à-tête, the physics of the boules on gravel, Marius and the hint.
// No DOM, so the page and the tests run the same code. Every throw is a function of the game and of its
// seed, saved with it, so a reload or an undo replays the same throw.
//
// Axes: x across the terrain (+ to the right as he looks down it), z from the throwing circle (0) towards
// the far board, y up. Lengths in metres, times in seconds.

export const R = 0.0375, // a boule: 75 mm
  RC = 0.015, // the cochonnet: 30 mm
  MASS = 0.7,
  MASS_C = 0.012,
  HALF = 2, // the side boards stand at x = ±2
  END = 15, // the far board
  BACK = -1.5, // the line behind the circle
  G = 9.81,
  DT = 1 / 480,
  FRAME = 1 / 60;
// Game length: 13 points, as in every club. Facile plays to 7: a game of about ten minutes, and fewer
// mènes leave a little more room to luck, which helps a beginner against Marius.
export const GOAL = { facile: 7, moyen: 13, fort: 13 };
export const BOULES = 3;
export const NAME = 'Marius';
export const STYLES = ['roulette', 'demi', 'plombee', 'tir'];
export const STYLE_NAMES = { roulette: 'Roulette', demi: 'Demi-portée', plombee: 'Plombée', tir: 'Tir' };
// The cochonnet is thrown between 6 and 10 m. He chooses its length in half metres.
export const COCHONNET = { min: 6, max: 10, step: 0.5, start: 7.5 };
const other = (who) => (who === 'you' ? 'cpu' : 'you');
export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

// ---------- Random numbers ----------
export function random(seed) {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function gauss(rnd) {
  const u = Math.max(1e-9, rnd()),
    v = rnd();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
const mix = (a, b) => (Math.imul(a ^ (b + 0x9e3779b9), 0x85ebca6b) ^ (b * 0xc2b2ae35)) >>> 0;

// ---------- Physics ----------
// The model and its numbers come from a second opinion (GPT-6.2 Astra): a ballistic flight, one landing in
// the gravel that keeps part of the speed, then a skid that turns into a roll. Each body keeps its speed
// along the ground v and its roll q, both in m/s: q = v when it rolls without sliding.
//
// How each style leaves the hand: the height of the hand and the top of the arc, both for the centre of
// the boule. The plombée climbs higher for a longer throw.
export const LAUNCH = {
  roulette: { release: 0.6, apex: () => 0.65 },
  demi: { release: 0.6, apex: () => 1.7 },
  plombee: { release: 0.6, apex: (d) => 3 + 0.25 * clamp(d - 6, -2, 6) },
  tir: { release: 0.9, apex: () => 1.5 },
  cochonnet: { release: 0.6, apex: () => 1.5 }
};
// The first landing in the gravel, for each style: F the share of the speed along the ground it keeps
// (a little less for a steep fall), eG the share of the vertical speed that comes back as a hop, and eta
// the share of the speed kept that is already roll. A plombée beds in and stops within a metre.
export const LANDING = {
  roulette: { F: 0.98, eG: 0.08, eta: 0.9 },
  demi: { F: 0.73, eG: 0.075, eta: 0.85 },
  plombee: { F: 0.3, eG: 0.028, eta: 0.55 },
  tir: { F: 0.75, eG: 0.14, eta: 0.75 },
  cochonnet: { F: 0.73, eG: 0.075, eta: 0.85 }
};
// The gravel. A boule rolls with a steady loss of 0.9 m/s², the light wooden cochonnet with 1.3. A body
// that slides loses 0.45 g until it rolls. k is the inertia of a hollow steel boule (0.57) and of the
// solid cochonnet (0.4). Every 10 cm of roll, a pebble turns the boule a little; now and then a bigger
// stone turns it 4 to 8 degrees.
export const GRAVEL = {
  roll: 0.9,
  rollC: 1.3,
  skid: 0.45 * G,
  k: 0.57,
  kC: 0.4,
  hop: 0.3, // a hop slower than this (m/s) settles at once
  every: 0.1,
  steer: 0.016 * Math.sqrt(0.1),
  stone: 1 - Math.exp(-0.012 * 0.1),
  landYaw: (0.5 * Math.PI) / 180,
  landKeep: 0.015,
  board: 0.1 // the height of the boards
};
// Steel on steel, and steel on wood.
export const BOUNCE = { boule: 0.7, cochonnet: 0.55 };
// The hand: one sigma of heading (degrees) and of speed (share), for pointing and for a tir, as a base
// that each hand scales. At 8 m in demi-portée the base misses by 33 cm in the middle case. Marius's hand
// is 2.6 times the base at Facile, 1.4 at Moyen and 1.2 at Difficile.
export const HAND = { angle: 1.4, speed: 0.022, tirAngle: 0.3, tirSpeed: 0.0065 };
export const LEVEL_HAND = { facile: 2.6, moyen: 1.4, fort: 1.2 };
// His own hand sits between Moyen's and Difficile's: he sets his throw with care, but the gravel and the
// arm are never perfect.
export const HIS_HAND = 1.3;

const radius = (b) => (b.id === 0 ? RC : R);
const mass = (b) => (b.id === 0 ? MASS_C : MASS);
// The time of flight and the speed into the ground of an arc from the hand to the ground.
function arc(style, d, r) {
  const { release, apex } = LAUNCH[style];
  const H = Math.max(apex(d), release + 0.01);
  const up = Math.sqrt(2 * G * (H - release)),
    down = Math.sqrt(2 * G * (H - r));
  return { up, down, T: (up + down) / G };
}
// How far a pointing throw goes on an empty terrain, for a speed u along the ground: the flight, the hop,
// the skid and the roll. The same numbers as the simulation, without the pebbles.
function reach(style, u, d) {
  const cochonnet = style === 'cochonnet';
  const r = cochonnet ? RC : R,
    k = cochonnet ? GRAVEL.kC : GRAVEL.k,
    a = cochonnet ? GRAVEL.rollC : GRAVEL.roll,
    b = GRAVEL.skid;
  const { down, T } = arc(style, d, r);
  const L = LANDING[style];
  const f = L.F * (1 - (0.16 * down * down) / (u * u + down * down));
  const s = u * f,
    roll = (s * (1 + k * L.eta)) / (1 + k);
  const hop = L.eG * down >= GRAVEL.hop ? (2 * L.eG * down * s) / G : 0;
  return u * T + hop + (s * s - roll * roll) / (2 * b) + (roll * roll) / (2 * a);
}
// The speed along the ground that sends a pointing throw of this style to stop d metres from the hand.
export function speedFor(style, d) {
  const { T } = arc(style, d, style === 'cochonnet' ? RC : R);
  let lo = 0,
    hi = d / T;
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2;
    if (reach(style, mid, d) < d) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}
const HAND_Z = 0.3; // the hand is above the front of the circle
// The launch of an action, with the hand's error when rnd is given: { id, owner, style, u, up, yaw, release }.
export function launchOf(action, rnd = null, scale = 1) {
  const style = action.kind === 'cochonnet' ? 'cochonnet' : action.style;
  const dx = action.aim.x,
    dz = action.aim.z - HAND_Z;
  const d = Math.hypot(dx, dz);
  const r = style === 'cochonnet' ? RC : R;
  const { up, T } = arc(style, d, style === 'tir' ? R : r);
  // A tir flies straight through the centre of its target; a pointing throw stops on its aim.
  let u = style === 'tir' ? d / T : speedFor(style, d),
    vy = up,
    yaw = Math.atan2(dx, dz);
  if (rnd) {
    const tir = style === 'tir';
    yaw += (gauss(rnd) * (tir ? HAND.tirAngle : HAND.angle) * scale * Math.PI) / 180;
    const k = 1 + clamp(gauss(rnd), -3, 3) * (tir ? HAND.tirSpeed : HAND.speed) * scale;
    u *= k;
    vy *= k;
  }
  return { id: action.kind === 'cochonnet' ? 0 : action.id, owner: action.who ?? null, style, u, up: vy, yaw, release: LAUNCH[style].release };
}
// One throw. bodies: what lies on the terrain, [{ id, owner, x, z }] with the cochonnet id 0. rnd: the
// gravel, or null for the intended path. Returns the bodies at rest, the events, the path of the thrown
// body and, with record, the place of every body each 1/60 s.
export function simulate(bodies, launch, rnd = null, record = false) {
  const body = (b, extra) => ({ id: b.id, owner: b.owner ?? null, x: b.x, z: b.z, y: radius(b), vx: 0, vy: 0, vz: 0, qx: 0, qz: 0, air: false, landed: true, dead: false, moved: 0, next: GRAVEL.every, ...extra });
  const list = bodies.map((b) => body(b));
  const ball = body(
    { id: launch.id, owner: launch.owner, x: 0, z: HAND_Z },
    { y: launch.release, vx: launch.u * Math.sin(launch.yaw), vz: launch.u * Math.cos(launch.yaw), vy: launch.up, air: true, landed: false, style: launch.style }
  );
  list.push(ball);
  const n = () => (rnd ? gauss(rnd) : 0);
  const events = [],
    frames = [],
    path = [{ x: ball.x, y: ball.y, z: ball.z, t: 0, air: true }];
  let t = 0,
    nextFrame = FRAME,
    nextPath = 1 / 30;
  if (record) frames.push({ t, b: list.map((b) => [b.x, b.y, b.z]) });
  const turn = (b, a) => {
    const c = Math.cos(a),
      s = Math.sin(a);
    [b.vx, b.vz] = [b.vx * c + b.vz * s, b.vz * c - b.vx * s];
    [b.qx, b.qz] = [b.qx * c + b.qz * s, b.qz * c - b.qx * s];
  };
  while (t < 20) {
    let moving = false;
    for (const b of list) {
      if (b.dead) continue;
      const r = radius(b);
      const inside = Math.abs(b.x) + r < HALF && b.z + r < END && b.z - r > BACK;
      if (b.air) {
        moving = true;
        b.vy -= G * DT;
        b.x += b.vx * DT;
        b.y += b.vy * DT;
        b.z += b.vz * DT;
        if (b.y <= r && b.vy < 0) {
          b.y = r;
          const down = -b.vy;
          if (!b.landed) {
            // The first landing: the gravel keeps part of the speed along the ground, more for a low throw.
            b.landed = true;
            const L = LANDING[b.style] ?? LANDING.demi,
              u2 = b.vx * b.vx + b.vz * b.vz;
            const f = clamp(L.F * (1 - (0.16 * down * down) / (u2 + down * down || 1)) * (1 + GRAVEL.landKeep * n()), 0, 1);
            b.vx *= f;
            b.vz *= f;
            turn(b, GRAVEL.landYaw * n());
            b.qx = L.eta * b.vx;
            b.qz = L.eta * b.vz;
            const hop = L.eG * down;
            if (hop >= GRAVEL.hop) b.vy = hop;
            else {
              b.vy = 0;
              b.air = false;
            }
          } else {
            b.vy = 0;
            b.air = false;
          }
          events.push({ t, type: 'land', id: b.id, x: b.x, z: b.z, speed: down });
        }
      } else {
        const sx = b.vx - b.qx,
          sz = b.vz - b.qz,
          slip = Math.hypot(sx, sz);
        const k = b.id === 0 ? GRAVEL.kC : GRAVEL.k;
        if (slip > 1e-7) {
          // The skid: friction slows the body and spins it up until it rolls.
          moving = true;
          const dv = Math.min(GRAVEL.skid * DT, slip / (1 + 1 / k));
          const ux = sx / slip,
            uz = sz / slip;
          b.vx -= ux * dv;
          b.vz -= uz * dv;
          b.qx += (ux * dv) / k;
          b.qz += (uz * dv) / k;
          if (dv < GRAVEL.skid * DT) {
            b.qx = b.vx;
            b.qz = b.vz;
          }
        } else {
          const v = Math.hypot(b.vx, b.vz);
          const loss = (b.id === 0 ? GRAVEL.rollC : GRAVEL.roll) * DT;
          if (v <= loss) {
            b.vx = b.vz = b.qx = b.qz = 0;
          } else {
            moving = true;
            const keep = (v - loss) / v;
            b.vx *= keep;
            b.vz *= keep;
            b.qx = b.vx;
            b.qz = b.vz;
          }
        }
        const v = Math.hypot(b.vx, b.vz);
        if (v > 0) {
          b.x += b.vx * DT;
          b.z += b.vz * DT;
          // The pebbles: every 10 cm a small turn, and now and then a stone.
          if (rnd) {
            b.moved += v * DT;
            while (b.moved >= b.next) {
              b.next += GRAVEL.every;
              turn(b, GRAVEL.steer * n());
              if (rnd() < GRAVEL.stone) {
                turn(b, ((rnd() < 0.5 ? -1 : 1) * (4 + 4 * rnd()) * Math.PI) / 180);
                for (const key of ['vx', 'vz', 'qx', 'qz']) b[key] *= 0.96;
              }
            }
          }
        }
      }
      // The boards: a body that touches one is dead and stops against it. One that flies over them is
      // dead where it lands.
      if (Math.abs(b.x) + r >= HALF || b.z + r >= END || b.z - r <= BACK) {
        if (inside && b.y - r <= GRAVEL.board) {
          b.x = clamp(b.x, -HALF + r, HALF - r);
          b.z = clamp(b.z, BACK + r, END - r);
        } else if (b.air) continue;
        b.y = r;
        b.vx = b.vy = b.vz = b.qx = b.qz = 0;
        b.air = false;
        b.dead = true;
        events.push({ t, type: 'board', id: b.id, x: b.x, z: b.z });
      }
    }
    contacts(list, events, t);
    t += DT;
    if (record && t >= nextFrame - 1e-9) {
      nextFrame += FRAME;
      frames.push({ t, b: list.map((b) => [b.x, b.y, b.z]) });
    }
    if (t >= nextPath && !ball.dead) {
      nextPath += 1 / 30;
      path.push({ x: ball.x, y: ball.y, z: ball.z, t, air: ball.air });
    }
    if (!moving) break;
  }
  path.push({ x: ball.x, y: ball.y, z: ball.z, t, air: false });
  if (record) frames.push({ t, b: list.map((b) => [b.x, b.y, b.z]) });
  return {
    bodies: list.map(({ id, owner, x, z, dead }) => ({ id, owner, x, z, ...(dead && { dead: true }) })),
    events,
    frames,
    path,
    time: t
  };
}
// The bodies that touch: the impulse runs along the line of their centres, in three dimensions. A body on
// the ground cannot move down, so it takes only the part along the ground. The roll of each body is kept:
// the gravel then turns the slide back into a roll, so a rolling boule that hits square follows on a
// little, and one that hits from the air, with no roll, stops on the spot: the carreau.
function contacts(list, events, t) {
  const pairs = [];
  for (let i = 0; i < list.length; i++) {
    const a = list[i];
    if (a.dead) continue;
    for (let j = i + 1; j < list.length; j++) {
      const b = list[j];
      if (b.dead) continue;
      const reach = radius(a) + radius(b);
      const dx = b.x - a.x,
        dy = b.y - a.y,
        dz = b.z - a.z;
      if (Math.abs(dx) >= reach || Math.abs(dz) >= reach || Math.abs(dy) >= reach) continue;
      const d = Math.hypot(dx, dy, dz);
      if (d >= reach || d < 1e-9) continue;
      const nx = dx / d,
        ny = dy / d,
        nz = dz / d;
      // Push the two apart along the ground, the lighter one more; a body in the air goes up too.
      const wa = 1 / mass(a),
        wb = 1 / mass(b),
        over = reach - d;
      a.x -= (nx * over * wa) / (wa + wb);
      a.z -= (nz * over * wa) / (wa + wb);
      b.x += (nx * over * wb) / (wa + wb);
      b.z += (nz * over * wb) / (wa + wb);
      if (a.air) a.y -= ny * over;
      if (b.air) b.y += ny * over;
      const inv = (body) => (body.air ? 1 : nx * nx + nz * nz) / mass(body);
      const K = inv(a) + inv(b);
      const rel = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny + (a.vz - b.vz) * nz;
      const e = a.id === 0 || b.id === 0 ? BOUNCE.cochonnet : BOUNCE.boule;
      pairs.push({ a, b, nx, ny, nz, K, target: rel > 0.15 ? e * rel : 0, total: 0 });
      if (rel > 0.05) events.push({ t, type: 'hit', a: a.id, b: b.id, speed: rel, x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 });
    }
  }
  // Sequential impulses, so a cochonnet pinched between two boules settles too.
  for (let pass = 0; pass < 24 && pairs.length; pass++) {
    let worst = 0;
    for (const p of pairs) {
      const { a, b, nx, ny, nz } = p;
      const rel = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny + (a.vz - b.vz) * nz;
      const want = rel + p.target;
      const total = Math.max(0, p.total + want / p.K),
        j = total - p.total;
      p.total = total;
      if (!j) continue;
      worst = Math.max(worst, Math.abs(want));
      for (const [body, s] of [
        [a, -1],
        [b, 1]
      ]) {
        const w = (s * j) / mass(body);
        body.vx += w * nx;
        body.vz += w * nz;
        if (body.air) body.vy += w * ny;
      }
    }
    if (worst < 1e-5) break;
  }
}
// A gauss draw for the outside: the tests and the page use the same numbers.
export { gauss };

// ---------- The rules ----------
// A new game. He throws the cochonnet of the first mène.
export function fresh(level = 'facile', wins = 0, seed = 1) {
  return { v: 1, level: GOAL[level] ? level : 'facile', wins, seed: seed >>> 0, actions: [], ack: 0 };
}
const levelOf = (g) => (GOAL[g.level] ? g.level : 'facile');
// Distance from a boule to the cochonnet: from edge to edge, as a tape measures it.
export const gap = (b, c) => Math.hypot(b.x - c.x, b.z - c.z) - R - RC;
// Who has the point: the player with the boule nearest the cochonnet, and how many of his boules are
// nearer than the best of the other's. A tie within a millimetre has no holder.
export function point(m) {
  const c = m.cochonnet;
  if (!c || c.dead) return { holder: null, count: 0, best: {} };
  const best = { you: Infinity, cpu: Infinity },
    near = { you: null, cpu: null };
  for (const b of m.boules)
    if (!b.dead) {
      const d = gap(b, c);
      if (d < best[b.owner]) {
        best[b.owner] = d;
        near[b.owner] = b.id;
      }
    }
  if (best.you === Infinity && best.cpu === Infinity) return { holder: null, count: 0, best, near };
  if (Math.abs(best.you - best.cpu) < 0.001) return { holder: null, tie: true, count: 0, best, near };
  const holder = best.you < best.cpu ? 'you' : 'cpu';
  const count = m.boules.filter((b) => !b.dead && b.owner === holder && gap(b, c) < best[other(holder)]).length;
  return { holder, count, best, near };
}
// Who plays next in a mène, or null when it is over.
function turnOf(m) {
  if (!m.cochonnet) return m.starter;
  if (m.cochonnet.dead) return null;
  const { you, cpu } = m.left;
  if (!you && !cpu) return null;
  if (!you) return 'cpu';
  if (!cpu) return 'you';
  if (!m.boules.length) return m.starter;
  const p = point(m);
  if (p.holder) return other(p.holder);
  // A tie: the last to play plays again. No boule in play: the other player.
  return p.tie ? m.last : other(m.last);
}
// The result of a mène that is over.
function result(m) {
  if (m.cochonnet.dead) {
    const { you, cpu } = m.left;
    // The cochonnet is out: a player who still has boules scores them if the other has none.
    if (you && !cpu) return { winner: 'you', points: you, reason: 'out' };
    if (cpu && !you) return { winner: 'cpu', points: cpu, reason: 'out' };
    return { winner: null, points: 0, reason: 'out' };
  }
  const p = point(m);
  if (!p.holder) return { winner: null, points: 0, reason: p.tie ? 'tie' : 'none' };
  return { winner: p.holder, points: p.count, reason: 'point' };
}
function newMene(n, starter) {
  return { n, starter, cochonnet: null, boules: [], left: { you: BOULES, cpu: BOULES }, last: null };
}
const copyMene = (m) => ({
  ...m,
  cochonnet: m.cochonnet && { ...m.cochonnet },
  boules: m.boules.map((b) => ({ ...b })),
  left: { ...m.left }
});
// The state after every action: the score, the mènes played and the mène in play.
const cache = new WeakMap();
export function situation(g) {
  const hit = cache.get(g);
  if (hit && hit.n === g.actions.length && hit.first === g.actions[0]) return hit.s;
  let s = hit && hit.n < g.actions.length && hit.first === g.actions[0] ? hit.s : null;
  let from = s ? hit.n : 0;
  if (!s) s = { score: { you: 0, cpu: 0 }, menes: [], mene: newMene(1, 'you'), over: null };
  for (let i = from; i < g.actions.length; i++) s = apply(g, s, g.actions[i]).after;
  cache.set(g, { n: g.actions.length, first: g.actions[0], s });
  return s;
}
// What lies on the terrain, as the simulation takes it.
export function onTerrain(m) {
  const list = [];
  if (m.cochonnet && !m.cochonnet.dead) list.push({ id: 0, owner: null, x: m.cochonnet.x, z: m.cochonnet.z });
  for (const b of m.boules) if (!b.dead) list.push({ id: b.id, owner: b.owner, x: b.x, z: b.z });
  return list;
}
// The error of a hand: his, or Marius's at the level of the game.
// The tests can give his side the hand of a level, to pit two levels of Marius against each other.
const handOf = (g, who) => (who === 'you' ? (g.you ? LEVEL_HAND[g.you] : HIS_HAND) : LEVEL_HAND[levelOf(g)]);
// Plays one action on a state and returns the new state with the simulation.
function apply(g, s, action, record = false) {
  const m = copyMene(s.mene);
  const before = s;
  const rnd = random(action.seed);
  let sim;
  if (action.kind === 'cochonnet') {
    const aim = { x: 0, z: clamp(action.aim.z, COCHONNET.min + 0.3, COCHONNET.max - 0.3) };
    sim = simulate([], launchOf({ ...action, aim }, rnd, Math.min(handOf(g, action.who), 1.6)), rnd, record);
    const c = sim.bodies[0];
    // A cochonnet thrown out of the 6 to 10 m, or less than 50 cm from a board, is put back at the
    // nearest place that counts, as the umpire would place it.
    m.cochonnet = { x: clamp(c.x, -HALF + 0.5, HALF - 0.5), z: clamp(c.z, COCHONNET.min, COCHONNET.max) };
  } else {
    const id = m.boules.length + 1;
    sim = simulate(onTerrain(m), launchOf({ ...action, id }, rnd, handOf(g, action.who)), rnd, record);
    m.left[action.who]--;
    m.last = action.who;
    const at = new Map(sim.bodies.map((b) => [b.id, b]));
    for (const b of m.boules) {
      if (b.dead) continue;
      const p = at.get(b.id);
      Object.assign(b, { x: p.x, z: p.z, dead: !!p.dead });
    }
    const mine = at.get(id);
    m.boules.push({ id, owner: action.who, x: mine.x, z: mine.z, dead: !!mine.dead });
    const c = at.get(0);
    if (c) Object.assign(m.cochonnet, { x: c.x, z: c.z, dead: !!c.dead });
  }
  const after = { score: { ...s.score }, menes: s.menes, mene: m, over: null };
  let ended = null;
  if (action.kind === 'boule' && !turnOf(m)) {
    ended = { n: m.n, ...result(m), boules: m.boules.map((b) => ({ ...b })), cochonnet: { ...m.cochonnet } };
    if (ended.winner) after.score[ended.winner] += ended.points;
    after.menes = [...s.menes, ended];
    // The winner of a mène throws the next cochonnet; after a mène with no point, the same player again.
    after.mene = newMene(m.n + 1, ended.winner || m.starter);
    const goal = GOAL[levelOf(g)];
    if (after.score.you >= goal || after.score.cpu >= goal) after.over = { winner: after.score.you >= goal ? 'you' : 'cpu' };
  }
  return { before, after, sim, ended, mene: m };
}
// Whose turn it is and what to throw: 'cochonnet' or 'boule'. Null when the game is over.
export function turn(g) {
  const s = situation(g);
  if (s.over) return null;
  const m = s.mene;
  return { who: turnOf(m), kind: m.cochonnet ? 'boule' : 'cochonnet' };
}
// Plays an action for whoever's turn it is. Returns the simulation, the mène as it ends, and the mène
// result when it ends. action: { style, aim: { x, z }, target } for a boule, { aim: { z } } for the cochonnet.
export function play(g, choice, record = false) {
  const t = turn(g);
  if (!t) return null;
  const action = {
    who: t.who,
    kind: t.kind,
    ...(t.kind === 'boule' && { style: choice.style }),
    aim: { x: +(choice.aim.x ?? 0), z: +choice.aim.z },
    ...(choice.target != null && { target: choice.target }),
    seed: mix(g.seed, g.actions.length + 1)
  };
  const s = situation(g);
  const res = apply(g, s, action, record);
  g.actions.push(action);
  cache.set(g, { n: g.actions.length, first: g.actions[0], s: res.after });
  // His win counts once, when the throw that ends the game is played.
  if (res.after.over?.winner === 'you') g.wins++;
  return { action, ...res };
}
// Takes back his last throw and Marius's throws after it. False when he has not thrown yet.
export function undo(g) {
  let i = g.actions.length - 1;
  while (i >= 0 && g.actions[i].who !== 'you') i--;
  if (i < 0) return false;
  g.actions.length = i;
  cache.delete(g);
  g.ack = Math.min(g.ack ?? 0, situation(g).menes.length);
  return true;
}
// A save read back: checked whole and replayed. A broken one starts a new game, keeping the wins.
export function restore(raw, seed) {
  const level = GOAL[raw?.level] ? raw.level : 'facile';
  const wins = Number.isInteger(raw?.wins) && raw.wins >= 0 ? raw.wins : 0;
  try {
    if (raw?.v !== 1 || !Array.isArray(raw.actions) || !Number.isInteger(raw.seed)) throw 0;
    const g = { ...fresh(level, wins, raw.seed), ack: Number.isInteger(raw.ack) ? raw.ack : 0, ...(raw.reported && { reported: true }) };
    for (const a of raw.actions) {
      const t = turn(g);
      if (!t || a?.who !== t.who || a.kind !== t.kind || !a.aim || !Number.isFinite(a.aim.z) || !Number.isFinite(a.aim.x ?? 0)) throw 0;
      if (a.kind === 'boule' && !STYLES.includes(a.style)) throw 0;
      g.actions.push({ who: a.who, kind: a.kind, ...(a.kind === 'boule' && { style: a.style }), aim: { x: +(a.aim.x ?? 0), z: +a.aim.z }, ...(a.target != null && { target: a.target }), seed: a.seed >>> 0 });
      situation(g);
    }
    situation(g);
    g.ack = clamp(g.ack, 0, situation(g).menes.length);
    return g;
  } catch {
    return fresh(level, wins, seed);
  }
}

// ---------- Marius, and the hint ----------
// How good a mène looks for a player once a throw has settled: the points he would score now, how safe
// that point is, and the boules each side still holds.
function value(m, me) {
  const them = other(me);
  if (!m.cochonnet || m.cochonnet.dead) {
    const r = result({ ...m, cochonnet: { dead: true } });
    return r.winner === me ? r.points : r.winner ? -r.points : 0;
  }
  const p = point(m);
  let v = 0;
  if (p.holder === me) v += p.count;
  else if (p.holder === them) v -= p.count;
  // A point held by a few centimetres is weaker than one held by half a metre.
  const a = p.best?.[me] ?? Infinity,
    b = p.best?.[them] ?? Infinity;
  if (a !== Infinity || b !== Infinity) v += 0.6 * clamp((Math.min(b, 1.5) - Math.min(a, 1.5)) / 0.6, -1, 1);
  // The player with more boules to come has the last word.
  v += 0.45 * (m.left[me] - m.left[them]);
  return v;
}
// The cochonnet's length for Marius: anywhere from 6.5 to 9.5 m.
function cochonnetChoice(g) {
  const rnd = random(mix(g.seed ^ 0x51ed, g.actions.length));
  return { aim: { x: 0, z: 6.5 + Math.round(rnd() * 6) / 2 } };
}
// The intended throw of each style at the cochonnet, a few centimetres short or long.
function pointing(m, lengths = [0]) {
  const c = m.cochonnet,
    from = HAND_Z,
    dist = Math.hypot(c.x, c.z - from),
    ux = c.x / dist,
    uz = (c.z - from) / dist;
  const list = [];
  for (const style of ['roulette', 'demi', 'plombee'])
    for (const dl of lengths) list.push({ style, aim: { x: c.x + ux * dl, z: c.z + uz * dl } });
  return list;
}
// The other player's boules worth a tir: in play and within 1.2 m of the cochonnet.
function targets(m, me) {
  return m.boules.filter((b) => !b.dead && b.owner !== me && gap(b, m.cochonnet) < 1.2).map((b) => ({ style: 'tir', aim: { x: b.x, z: b.z }, target: b.id }));
}
// Tries a throw several times with the hand of the player and returns the mean value for him.
function judge(g, m, who, choice, samples, salt) {
  const id = m.boules.length + 1;
  let total = 0;
  for (let k = 0; k < samples; k++) {
    const rnd = samples > 1 ? random(mix(salt, k)) : null;
    const sim = simulate(onTerrain(m), launchOf({ ...choice, who, kind: 'boule', id }, rnd, handOf(g, who)), rnd);
    const next = copyMene(m);
    next.left[who]--;
    next.last = who;
    const at = new Map(sim.bodies.map((b) => [b.id, b]));
    for (const b of next.boules) if (!b.dead) Object.assign(b, { ...at.get(b.id), owner: b.owner });
    const mine = at.get(id);
    next.boules.push({ id, owner: who, x: mine.x, z: mine.z, dead: !!mine.dead });
    const c = at.get(0);
    if (c) Object.assign(next.cochonnet, { x: c.x, z: c.z, dead: !!c.dead });
    total += value(next, who);
  }
  return total / samples;
}
// The best throw for a player, by trying each choice with his own hand. Used by Difficile and the hint.
function best(g, who, samples = 8) {
  const m = situation(g).mene;
  const salt = mix(g.seed ^ 0xbee5, g.actions.length);
  const choices = [...pointing(m, [0, -0.2, 0.2]), ...targets(m, who)];
  let top = null;
  for (const [i, c] of choices.entries()) {
    const v = judge(g, m, who, c, samples, mix(salt, i));
    if (!top || v > top.value + 1e-9) top = { ...c, value: v };
  }
  return top;
}
// A player's choice at a level. Facile points a demi-portée at the cochonnet. Moyen picks the style whose
// intended path ends best. Difficile weighs every style a little short and long, and a tir on each boule
// of the other near the cochonnet, by trying each one eight times with its own hand.
export function choiceFor(g, who, level) {
  const t = turn(g);
  if (!t || t.who !== who) return null;
  if (t.kind === 'cochonnet') return cochonnetChoice(g);
  const m = situation(g).mene;
  if (level === 'facile') return pointing(m)[1];
  if (level === 'moyen') {
    // Moyen shoots only a boule that holds the point very close when its own best is far.
    const p = point(m),
      them = other(who);
    if (p.holder === them && p.best[them] < 0.15 && p.best[who] > 0.4 && m.left[who] >= 2)
      return targets(m, who).find((c) => c.target === p.near[them]);
    let top = null;
    for (const c of pointing(m)) {
      const v = judge(g, m, who, c, 1, 0);
      if (!top || v > top.value + 1e-9) top = { ...c, value: v };
    }
    return top;
  }
  return best(g, who);
}
// Marius's choice, at the level of the game.
export const cpuChoice = (g) => choiceFor(g, 'cpu', levelOf(g));
// The hint: the throw that does best with his hand, and why, in one sentence.
export function hint(g) {
  const t = turn(g);
  if (!t || t.who !== 'you') return null;
  if (t.kind === 'cochonnet') return { aim: { x: 0, z: COCHONNET.start }, reason: 'Lancez le cochonnet à 7,5 m, une bonne longueur pour commencer.' };
  const s = situation(g),
    m = s.mene,
    pick = best(g, 'you');
  const p = point(m);
  let reason;
  if (pick.style === 'tir') reason = 'Tirez la boule de ' + NAME + ' : elle tient le point de trop près pour pointer.';
  else if (pick.style === 'plombee')
    reason = m.boules.some((b) => !b.dead) ? 'Pointez en plombée : la boule passe au-dessus du jeu et s’arrête vite.' : 'Pointez en plombée : la boule tombe près du cochonnet et roule peu.';
  else if (pick.style === 'roulette') reason = 'Pointez en roulette : le chemin est libre jusqu’au cochonnet.';
  else reason = p.holder === 'cpu' ? 'Pointez en demi-portée pour reprendre le point.' : 'Pointez en demi-portée, droit sur le cochonnet.';
  return { ...pick, reason };
}
// For the tests: who plays next in a mène, and how a finished mène scores.
export { turnOf as nextPlayer, result as meneResult };
