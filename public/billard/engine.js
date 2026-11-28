// Metres, seconds and kilograms. The table frame has x right, y down and z into the cloth.
const L = 1.98, W = 0.99, R = 0.028575, diameter = 2 * R;
const mass = 0.17, inertia = 0.4 * R * R; // Moment of inertia divided by mass.
const g0 = 9.81, slide = 0.2 * g0, roll = 0.01 * g0, spinDrag = 11;
const ballRestitution = 0.95, railRestitution = 0.72, jawRestitution = 0.67;
// Raised nose and rail grip follow Mathavan, Jackson and Parkin (2010).
// The normal coefficient is tuned for the effective rebound on this pool table.
const ballFriction = 0.036, railFriction = 0.14, noseHeight = 0.29;
const step = 1 / 120, frameStep = 1 / 60, maxTime = 20;
const tiny = 1e-9, still = 0.001, jawRadius = 0.003;
const clamp = (x, low, high) => Math.min(high, Math.max(low, x));
const length = (x, y) => Math.sqrt(x * x + y * y);
const dist = (a, b) => length(a.x - b.x, a.y - b.y);
const point = (x, y) => ({ x, y });
const toward = (a, b) => Math.atan2(b.y - a.y, b.x - a.x);
const other = (who) => who === 'player' ? 'cpu' : 'player';

const cornerMouth = 0.1143, sideMouth = 0.127, cushionDepth = 0.05;
const cornerTip = cornerMouth / Math.SQRT2, sideTip = sideMouth / 2;
// The facing angles inside the rubber are 142° at the corners and 104° at the sides.
const cornerBack = cornerTip - cushionDepth / Math.tan(38 * Math.PI / 180);
const sideBack = sideTip - cushionDepth * Math.tan(14 * Math.PI / 180);
const top = [
  [point(cornerBack, -cushionDepth), point(cornerTip, 0), point(L / 2 - sideTip, 0),
    point(L / 2 - sideBack, -cushionDepth)],
  [point(L / 2 + sideBack, -cushionDepth), point(L / 2 + sideTip, 0), point(L - cornerTip, 0),
    point(L - cornerBack, -cushionDepth)]
];
const right = [
  point(L + cushionDepth, cornerBack), point(L, cornerTip), point(L, W - cornerTip),
  point(L + cushionDepth, W - cornerBack)
];
const opposite = (p) => point(L - p.x, W - p.y);
const chains = [...top, right, ...top.map((rail) => rail.map(opposite)), right.map(opposite)];
const cushions = chains.flatMap((rail) => rail.slice(1).map((b, i) => ({ a: rail[i], b, kind: i === 1 ? 'cushion' : 'jaw' })));
const jaws = chains.flatMap((rail) => rail.map(({ x, y }) => ({ x, y, r: jawRadius })));
const segments = cushions.map(({ a, b, kind }) => {
  const len = dist(a, b), tx = (b.x - a.x) / len, ty = (b.y - a.y) / len;
  return { x: a.x, y: a.y, tx, ty, nx: -ty, ny: tx, len, kind };
});
const pocketAt = (id, x, y, nx, ny) => {
  const side = nx === 0, mouth = side ? sideMouth : cornerMouth;
  const shelf = side ? 0.008 : 0.048;
  const mouthLine = side ? 0 : cornerMouth / 2;
  const capture = side ? -cushionDepth : (cornerBack - cushionDepth) * Math.SQRT1_2;
  const width = side ? sideBack : (cornerBack + cushionDepth) * Math.SQRT1_2;
  // The front rim sets the shelf. The circle passes through both back ends of the jaws.
  const rise = mouthLine - shelf - capture;
  const radius = (width ** 2 + rise ** 2) / (2 * rise);
  const centre = mouthLine - shelf - radius;
  const drop = point(x + nx * centre, y + ny * centre);
  return { id, x, y, mouth, nx, ny, shelf, capture, width, radius, drop, hole: { ...drop, r: radius } };
};
const diagonal = Math.SQRT1_2;
const pockets = [
  pocketAt('hg', 0, 0, diagonal, diagonal), pocketAt('hm', L / 2, 0, 0, 1),
  pocketAt('hd', L, 0, -diagonal, diagonal), pocketAt('bg', 0, W, diagonal, -diagonal),
  pocketAt('bm', L / 2, W, 0, -1), pocketAt('bd', L, W, -diagonal, -diagonal)
];
export const table = {
  L, W, R, mass, cushions, jaws, pockets,
  headSpot: point(L / 4, W / 2), footSpot: point(3 * L / 4, W / 2), headString: L / 4
};
export const pocketNames = {
  hg: 'le trou du coin en haut à gauche', hm: 'le trou du milieu en haut', hd: 'le trou du coin en haut à droite',
  bg: 'le trou du coin en bas à gauche', bm: 'le trou du milieu en bas', bd: 'le trou du coin en bas à droite'
};

function random(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x9e3779b9) >>> 0;
    let n = Math.imul(state ^ (state >>> 16), 0x21f0aaad);
    n = Math.imul(n ^ (n >>> 15), 0x735a2d97);
    return ((n ^ (n >>> 15)) >>> 0) / 4294967296;
  };
}

function orientation(next) {
  const mix = next(), a = next() * 2 * Math.PI, b = next() * 2 * Math.PI;
  const u = Math.sqrt(mix), v = Math.sqrt(1 - mix);
  return [u * Math.cos(b), v * Math.sin(a), v * Math.cos(a), u * Math.sin(b)];
}

export const groupOf = (id) => id >= 1 && id <= 7 ? 'pleines' : id >= 9 && id <= 15 ? 'rayees' : null;
const oppositeGroup = (group) => group === null ? null : group === 'pleines' ? 'rayees' : 'pleines';
const groupFor = (g, who) => who === 'player' ? g.groups.player : oppositeGroup(g.groups.player);
export const remaining = (g, who) => {
  const group = groupFor(g, who);
  return group === null ? [] : g.balls.filter((b) => groupOf(b.id) === group).map((b) => b.id);
};
export const levels = ['facile', 'moyen', 'fort'];

function rackLayout(seed) {
  const next = random(seed);
  const solid = 1 + Math.floor(next() * 7), stripe = 9 + Math.floor(next() * 7);
  const ids = Array.from({ length: 15 }, (_, i) => i + 1).filter((id) => id !== 8 && id !== solid && id !== stripe);
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  const corners = next() < 0.5 ? [solid, stripe] : [stripe, solid];
  ids.splice(9, 0, corners[0]);
  ids.push(corners[1]);
  ids.splice(4, 0, 8);
  const pose = (id, x, y) => ({ id, x, y, q: orientation(next) });
  const balls = [pose(0, table.headSpot.x, table.headSpot.y)];
  const spacing = diameter + 0.00012 + 0.000035 * next();
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col <= row; col++) {
      const x = table.footSpot.x + spacing * row * Math.sqrt(0.75);
      const y = table.footSpot.y + spacing * (col - row / 2);
      balls.push(pose(ids[balls.length - 1], x + (row ? (next() - 0.5) * 0.000105 : 0), y + (row ? (next() - 0.5) * 0.000105 : 0)));
    }
  }
  return balls;
}

export function rack(seed) {
  const balls = rackLayout(seed);
  // Preserve the seeded layout, expanding it about the apex only if the jitter closed a gap.
  let nearest = Infinity;
  for (let i = 1; i < balls.length; i++) {
    for (let j = i + 1; j < balls.length; j++) nearest = Math.min(nearest, dist(balls[i], balls[j]));
  }
  const minimum = diameter + 1e-6;
  if (nearest < minimum) {
    const scale = minimum / nearest, apex = balls[1];
    for (const b of balls.slice(2)) {
      b.x = apex.x + (b.x - apex.x) * scale;
      b.y = apex.y + (b.y - apex.y) * scale;
    }
  }
  return balls;
}

// Time of impact for a moving point and a circle, using relative motion for two balls.
function circleTime(dx, dy, vx, vy, radius, limit) {
  const reachX = radius + Math.abs(vx) * limit, reachY = radius + Math.abs(vy) * limit;
  if (Math.abs(dx) > reachX || Math.abs(dy) > reachY) return Infinity;
  const along = dx * vx + dy * vy;
  if (along >= -tiny) return Infinity;
  const gap = dx * dx + dy * dy - radius * radius;
  if (gap <= 0) return 0;
  const speed2 = vx * vx + vy * vy;
  const discriminant = along * along - speed2 * gap;
  return discriminant > 0 ? gap / (-along + Math.sqrt(discriminant)) : Infinity;
}

function segmentTime(x, y, vx, vy, s, limit) {
  const approach = vx * s.nx + vy * s.ny;
  if (approach >= -tiny) return Infinity;
  const dx = x - s.x, dy = y - s.y;
  const gap = dx * s.nx + dy * s.ny - R;
  if (gap < -R) return Infinity; // This is the back of a facing on the adjacent rail.
  const t = Math.max(0, -gap / approach);
  if (t > limit) return Infinity;
  const along = (dx + vx * t) * s.tx + (dy + vy * t) * s.ty;
  return along >= 0 && along <= s.len ? t : Infinity;
}

function pocketTime(x, y, vx, vy, p, limit) {
  const normal = vx * p.nx + vy * p.ny;
  if (normal >= -tiny) return Infinity;
  const dx = x - p.x, dy = y - p.y;
  const t = Math.max(0, (p.capture - dx * p.nx - dy * p.ny) / normal);
  if (t > limit) return Infinity;
  const cross = (dy + vy * t) * p.nx - (dx + vx * t) * p.ny;
  return Math.abs(cross) <= p.width ? t : Infinity;
}

function overHole(x, y, p) {
  return (x - p.hole.x) ** 2 + (y - p.hole.y) ** 2 < p.radius ** 2;
}

// All contact impulses below are divided by ball mass.
function strikeBall(a, b, nx, ny) {
  const vx = a.vx - b.vx, vy = a.vy - b.vy;
  const speed = vx * nx + vy * ny;
  if (speed <= tiny) return 0;
  const normal = speed * (1 + ballRestitution) / 2;
  const slip = -vx * ny + vy * nx + R * (a.wz + b.wz);
  const grip = ballFriction * normal;
  // Both equal spheres can translate and spin. The transverse effective inverse mass is 2 + 2 R²/I.
  const tangent = clamp(slip / 7, -grip, grip);
  const dx = normal * nx - tangent * ny, dy = normal * ny + tangent * nx;
  a.vx -= dx; a.vy -= dy;
  b.vx += dx; b.vy += dy;
  a.wz -= R * tangent / inertia;
  b.wz -= R * tangent / inertia;
  return speed;
}

function strikeCushion(b, nx, ny, restitution) {
  const normal = b.vx * nx + b.vy * ny;
  if (normal >= -tiny) return 0;
  const tx = -ny, ty = nx;
  const wn = b.wx * nx + b.wy * ny, wt = b.wx * tx + b.wy * ty;
  const h = noseHeight, a = Math.sqrt(1 - h * h);
  // The nose sits above the equator. The normal passes through the centre; two surface
  // impulses exchange angular and linear momentum. The cloth constrains vertical translation.
  const rebound = -restitution * normal;
  const slipT = b.vx * tx + b.vy * ty + R * (h * wn - a * b.wz);
  const slipM = h * rebound - R * wt;
  let jt = -slipT / 3.5, jm = -slipM / (h * h + 2.5);
  const grip = railFriction * (rebound - normal) / a;
  const limit = Math.min(1, grip / Math.max(tiny, length(jt, jm)));
  jt *= limit; jm *= limit;
  const dvn = rebound - normal + h * jm;
  b.vx += dvn * nx + jt * tx; b.vy += dvn * ny + jt * ty;
  b.wx += R * (h * jt * nx - jm * tx) / inertia;
  b.wy += R * (h * jt * ny - jm * ty) / inertia;
  b.wz -= R * a * jt / inertia;
  return -normal;
}

function rotate(b, wx, wy, wz, dt) {
  if (dt <= tiny) return;
  const rate = Math.sqrt(wx * wx + wy * wy + wz * wz);
  if (rate <= tiny) return;
  const half = dt * rate / 2, s = Math.sin(half) / rate, c = Math.cos(half);
  const a = wx * s, d = wy * s, e = wz * s, q = b.q;
  const w = c * q[0] - a * q[1] - d * q[2] - e * q[3];
  const x = c * q[1] + a * q[0] + d * q[3] - e * q[2];
  const y = c * q[2] - a * q[3] + d * q[0] + e * q[1];
  const z = c * q[3] + a * q[2] - d * q[1] + e * q[0];
  q[0] = w; q[1] = x; q[2] = y; q[3] = z;
}

function cloth(b, dt, poses) {
  let sliding = 0;
  const sx = b.vx + R * b.wy, sy = b.vy - R * b.wx;
  const slip2 = sx * sx + sy * sy;
  const endSpin = Math.sign(b.wz) * Math.max(0, Math.abs(b.wz) - spinDrag * dt);
  const spin = (b.wz + endSpin) / 2;
  if (slip2 > tiny * tiny) {
    const slip = Math.sqrt(slip2);
    sliding = Math.min(dt, slip / (3.5 * slide));
    const factor = slide * sliding / slip, dx = sx * factor, dy = sy * factor;
    const oldX = b.wx, oldY = b.wy;
    b.vx -= dx; b.vy -= dy;
    b.wx += 2.5 * dy / R; b.wy -= 2.5 * dx / R;
    if (poses) rotate(b, (oldX + b.wx) / 2, (oldY + b.wy) / 2, spin, sliding);
  }
  const rolling = dt - sliding;
  if (rolling > tiny) {
    const speed = length(b.vx, b.vy);
    const factor = speed > still ? Math.max(0, 1 - roll * rolling / speed) : 0;
    const average = (1 + factor) / (2 * R);
    if (poses) rotate(b, b.vy * average, -b.vx * average, spin, rolling);
    b.vx *= factor; b.vy *= factor;
    b.wx = b.vy / R; b.wy = -b.vx / R;
  }
  b.wz = endSpin;
}

const speedAt = (power) => 0.6 + 6.9 * ((clamp(power, 1, 10) - 1) / 9) ** 1.86;
const powerAt = (speed) => clamp(1 + 9 * ((Math.max(0, speed - 0.6)) / 6.9) ** (1 / 1.86), 1, 10);
const startQ = () => [1, 0, 0, 0];

function copyPose({ id, x, y, q }) {
  return { id, x, y, q: q ? [...q] : startQ() };
}

function savePose(b) {
  const pose = copyPose(b);
  const norm = Math.hypot(...pose.q);
  if (Math.abs(norm - 1) > 1e-12) pose.q = pose.q.map((n) => n / norm);
  return pose;
}

function launch(b, shot) {
  const directionX = Math.cos(shot.angle), directionY = Math.sin(shot.angle), speed = speedAt(shot.power);
  const spin = (n) => Number.isFinite(n) ? clamp(n, -1, 1) : 0;
  const side = spin(shot.spin?.side), top = spin(shot.spin?.top);
  // A chalked tip delivers a horizontal impulse at a radial offset of at most half a radius.
  const offset = 0.5 / Math.max(1, length(side, top));
  const squirt = -0.022 * side * offset / 0.5;
  const cos = Math.cos(squirt), sin = Math.sin(squirt);
  b.vx = speed * (directionX * cos - directionY * sin);
  b.vy = speed * (directionY * cos + directionX * sin);
  b.wx = offset * R * top * b.vy / inertia;
  b.wy = -offset * R * top * b.vx / inertia;
  b.wz = offset * R * side * speed / inertia;
}

// The swept tests use linear motion between short cloth updates. Even a break cannot
// skip a ball or a facing between samples. Each impact is resolved before advancing.
function run(balls, shot, record, poses) {
  const bodies = balls.map((b) => ({
    ...copyPose(b), vx: 0, vy: 0, wx: 0, wy: 0, wz: 0, active: false, down: false
  }));
  const cue = bodies.find((b) => b.id === 0);
  if (cue && Number.isFinite(shot?.angle) && Number.isFinite(shot?.power)) {
    launch(cue, shot);
    cue.active = true;
  }
  const events = [], pocketed = [], frames = [];
  let firstHit = null, cushionHits = 0, t = 0;
  const dropBall = (b, p) => {
    b.down = true; b.active = false;
    pocketed.push({ id: b.id, pocket: p.id, t });
    events.push({
      t, type: 'pocket', a: b.id, pocket: p.id, speed: length(b.vx, b.vy),
      x: b.x, y: b.y, vx: b.vx, vy: b.vy, drop: { ...p.drop }
    });
  };
  const sample = (t) => {
    const inPlay = bodies.filter((b) => !b.down);
    if (!poses) {
      frames.push({ t, balls: inPlay.filter((b) => b.id === 0 || b.id === firstHit).map(({ id, x, y }) => ({ id, x, y })) });
      return;
    }
    let energy = 0;
    for (const b of inPlay) {
      energy += b.vx ** 2 + b.vy ** 2 + inertia * (b.wx ** 2 + b.wy ** 2 + b.wz ** 2);
    }
    frames.push({ t, balls: inPlay.map(savePose), energy: energy * mass / 2 });
  };
  if (record) sample(0);
  for (let tick = 1; tick <= maxTime / step && bodies.some((b) => b.active); tick++) {
    const end = tick * step;
    let limit = end - t, impacts = 0;
    while (limit > tiny) {
      let time = limit, hit = null, partner = null, surface = null, kind = null;
      for (let i = 0; i < bodies.length; i++) {
        const a = bodies[i];
        if (a.down) continue;
        for (let j = i + 1; j < bodies.length; j++) {
          const b = bodies[j];
          if (b.down || (!a.active && !b.active)) continue;
          const collision = circleTime(b.x - a.x, b.y - a.y, b.vx - a.vx, b.vy - a.vy, diameter, time);
          if (collision < time) {
            time = collision; hit = a; partner = b; kind = 'ball';
          }
        }
        if (!a.active || (a.vx === 0 && a.vy === 0)) continue;
        const nearSide = R + jawRadius + Math.abs(a.vy) * time;
        const nearEnd = R + jawRadius + Math.abs(a.vx) * time;
        if (a.x > nearEnd && a.x < L - nearEnd && a.y > nearSide && a.y < W - nearSide) continue;
        for (const s of segments) {
          const collision = segmentTime(a.x, a.y, a.vx, a.vy, s, time);
          if (collision < time) {
            time = collision; hit = a; surface = s; kind = s.kind;
          }
        }
        for (const j of jaws) {
          const collision = circleTime(a.x - j.x, a.y - j.y, a.vx, a.vy, R + j.r, time);
          if (collision < time) {
            time = collision; hit = a; surface = j; kind = 'jaw-point';
          }
        }
        for (const p of pockets) {
          const collision = pocketTime(a.x, a.y, a.vx, a.vy, p, time);
          if (collision < time) {
            time = collision; hit = a; surface = p; kind = 'pocket';
          }
        }
      }
      // In a compressed cluster, finish the contact sequence before advancing the cloth clock.
      const elapsed = impacts >= 256 ? limit : time;
      if (elapsed > tiny) {
        const next = t + elapsed;
        for (const b of bodies) {
          if (!b.active) continue;
          b.x += b.vx * elapsed;
          b.y += b.vy * elapsed;
          cloth(b, elapsed, poses);
          b.active = b.vx !== 0 || b.vy !== 0 || b.wz !== 0 || length(b.wx, b.wy) * R > still;
        }
        t = next;
      }
      if (impacts++ >= 256 || !hit) break;
      if (kind === 'pocket') {
        dropBall(hit, surface);
      } else if (kind === 'ball') {
        const dx = partner.x - hit.x, dy = partner.y - hit.y;
        const separation = length(dx, dy);
        const nx = dx / separation, ny = dy / separation;
        const speed = strikeBall(hit, partner, nx, ny);
        hit.active = partner.active = true;
        if (speed > tiny) {
          if (firstHit === null && (hit.id === 0 || partner.id === 0)) firstHit = hit.id === 0 ? partner.id : hit.id;
          events.push({ t, type: 'ball', a: hit.id, b: partner.id, speed });
        }
      } else {
        let nx = surface.nx, ny = surface.ny;
        if (kind === 'jaw-point') {
          const dx = hit.x - surface.x, dy = hit.y - surface.y, distance = length(dx, dy);
          nx = dx / distance; ny = dy / distance;
        }
        const speed = strikeCushion(hit, nx, ny, kind === 'cushion' ? railRestitution : jawRestitution);
        hit.active = true;
        if (speed > tiny) {
          if (firstHit !== null) cushionHits++;
          events.push({ t, type: kind === 'cushion' ? 'cushion' : 'jaw', a: hit.id, speed });
        }
      }
      limit = end - t;
    }
    t = end;
    // The slate cannot support a ball that runs out of speed over the opening.
    for (const b of bodies) {
      if (!b.down && b.vx === 0 && b.vy === 0 &&
          (b.y < R || b.y > W - R || b.x < R || b.x > L - R)) {
        const p = pockets.find((p) => overHole(b.x, b.y, p));
        if (p) dropBall(b, p);
      }
    }
    if (record && tick % 2 === 0) sample(Math.round(t / frameStep) * frameStep);
  }
  const settled = bodies.filter((b) => !b.down).map(savePose);
  if (record && frames.at(-1).t < t - tiny) sample(t);
  return { balls: settled, pocketed, firstHit, cushionHits, events, duration: t, ...(record && { frames }) };
}

export function simulate(balls, shot, record = false) {
  return run(balls, shot, record, true);
}

function surfaceTime(x, y, vx, vy, length) {
  let time = length;
  for (const s of segments) time = Math.min(time, segmentTime(x, y, vx, vy, s, time));
  for (const j of jaws) time = Math.min(time, circleTime(x - j.x, y - j.y, vx, vy, R + j.r, time));
  for (const p of pockets) time = Math.min(time, pocketTime(x, y, vx, vy, p, time));
  return time;
}

export function aimLine(balls, angle) {
  const cue = balls.find((b) => b.id === 0);
  if (!cue) return { contact: null, hit: null, cushion: null, objectDir: null, cueDir: null };
  const vx = Math.cos(angle), vy = Math.sin(angle);
  const bound = surfaceTime(cue.x, cue.y, vx, vy, L + W);
  let time = bound, target = null;
  for (const b of balls) {
    if (b.id === 0) continue;
    const impact = circleTime(cue.x - b.x, cue.y - b.y, vx, vy, diameter, time);
    if (impact < time) {
      time = impact;
      target = b;
    }
  }
  const contact = point(cue.x + vx * time, cue.y + vy * time);
  if (!target) return { contact, hit: null, cushion: contact, objectDir: null, cueDir: null };
  const objectDir = toward(contact, target);
  const side = Math.sign(Math.sin(angle - objectDir)) || 1;
  return { contact, hit: target.id, cushion: null, objectDir, cueDir: objectDir + side * Math.PI / 2 };
}

export function previewPath(balls, shot) {
  const sim = run(balls, shot, true, false);
  const path = (id) => {
    if (id === null) return [];
    const initial = balls.find((b) => b.id === id);
    const points = initial ? [point(initial.x, initial.y)] : [];
    for (const { balls } of sim.frames) {
      const b = balls.find((ball) => ball.id === id);
      if (b && (!points.length || dist(b, points.at(-1)) > tiny)) points.push(point(b.x, b.y));
    }
    const fall = sim.events.find((e) => e.type === 'pocket' && e.a === id);
    if (fall) points.push(point(fall.x, fall.y));
    return points;
  };
  const pocket = sim.pocketed.find((b) => b.id === sim.firstHit)?.pocket ?? null;
  return { cue: path(0), object: path(sim.firstHit), hit: sim.firstHit, potted: pocket !== null, pocket };
}

export function fresh(level, wins, seed) {
  seed >>>= 0;
  return {
    v: 1, level: levels.includes(level) ? level : 'facile',
    wins: Number.isSafeInteger(wins) && wins > 0 ? wins : 0, seed, balls: rack(seed),
    turn: 'player', groups: { player: null }, ballInHand: false,
    behindLine: false, broken: false, shots: 0, over: null, history: []
  };
}

function inside(x, y, allowShelf = false) {
  const withinNoses = x >= 0 && y >= 0 && x <= L && y <= W;
  if (!withinNoses && !allowShelf) return false;
  let onShelf = false;
  for (const p of pockets) {
    const dx = x - p.x, dy = y - p.y;
    if (overHole(x, y, p)) return false;
    const depth = dx * p.nx + dy * p.ny;
    if (depth >= p.capture && depth <= (p.nx === 0 ? 0 : p.mouth / 2) &&
        Math.abs(dy * p.nx - dx * p.ny) < p.width) onShelf = true;
  }
  if (!withinNoses && !onShelf) return false;
  for (const s of segments) {
    const dx = x - s.x, dy = y - s.y, along = dx * s.tx + dy * s.ty;
    if (along >= 0 && along <= s.len && Math.abs(dx * s.nx + dy * s.ny) < R - tiny) return false;
  }
  for (const j of jaws) {
    if ((x - j.x) ** 2 + (y - j.y) ** 2 < (R + j.r - tiny) ** 2) return false;
  }
  return true;
}

function free(g, x, y) {
  return inside(x, y) && g.balls.every((b) => b.id === 0 || (x - b.x) ** 2 + (y - b.y) ** 2 >= diameter ** 2);
}

export function canPlace(g, x, y) {
  return g.ballInHand && !g.over && Number.isFinite(x) && Number.isFinite(y) &&
    (!g.behindLine || x <= table.headString) && free(g, x, y);
}

export function placeCue(g, x, y) {
  if (!canPlace(g, x, y)) return false;
  g.balls = g.balls.filter((b) => b.id !== 0);
  g.balls.unshift({ id: 0, x, y, q: startQ() });
  g.ballInHand = g.behindLine = false;
  return true;
}

function snapshot(g) {
  return {
    balls: g.balls.map(copyPose), turn: g.turn, groups: { ...g.groups }, ballInHand: g.ballInHand,
    behindLine: g.behindLine, broken: g.broken, shots: g.shots, wins: g.wins, over: g.over
  };
}

export function undo(g) {
  const previous = g.history.pop();
  if (!previous) return false;
  Object.assign(g, previous);
  return true;
}

function canHit(g, who, id) {
  const group = groupFor(g, who);
  if (id === null || id === 0) return false;
  if (!group) return id !== 8;
  return id === 8 ? !remaining(g, who).length : groupOf(id) === group;
}

function spotEight(g, previous) {
  const { x, y } = table.footSpot;
  // Each interfering ball forbids an interval on the spotting line.
  const ends = [x, ...g.balls.filter((b) => Math.abs(b.y - y) < diameter)
    .map((b) => b.x + Math.sqrt(diameter ** 2 - (b.y - y) ** 2) + tiny)];
  ends.sort((a, b) => a - b);
  const spot = ends.find((s) => s >= x && free(g, s, y) && g.balls.every((b) => b.id !== 0 || dist(b, point(s, y)) >= diameter));
  if (spot !== undefined) g.balls.push({ ...copyPose(previous), x: spot, y });
  else {
    // An unusually crowded foot string can fill the space toward the foot rail.
    const rear = g.balls.filter((b) => Math.abs(b.y - y) < diameter)
      .map((b) => b.x - Math.sqrt(diameter ** 2 - (b.y - y) ** 2) - tiny)
      .sort((a, b) => b - a)
      .find((s) => s < x && free(g, s, y) && g.balls.every((b) => b.id !== 0 || dist(b, point(s, y)) >= diameter));
    if (rear !== undefined) g.balls.push({ ...copyPose(previous), x: rear, y });
  }
}

const openingRack = (g) => !g.broken && g.balls.length === 16 && g.balls[0].id === 0;

export function play(g, shot, record = false) {
  if (g.over || !Number.isFinite(shot?.angle) || !Number.isFinite(shot?.power)) return null;
  const shooter = g.turn, before = shooter === 'player' ? snapshot(g) : null;
  if (g.ballInHand && (!shot.place || !placeCue(g, shot.place.x, shot.place.y))) return null;
  if (!g.balls.some((b) => b.id === 0)) return null;
  if (before) {
    g.history.push(before);
    if (g.history.length > 40) g.history.shift();
  }
  const opening = !g.broken, group = groupFor(g, shooter);
  const eightLegal = canHit(g, shooter, 8);
  const sim = simulate(g.balls, shot, record);
  const down = sim.pocketed.map((p) => p.id), eight = down.includes(8);
  const foul = down.includes(0) ? 'scratch' : sim.firstHit === null ? 'miss' : !canHit(g, shooter, sim.firstHit) ? 'wrong' : null;
  const assigned = !foul && !group ? down.map(groupOf).find(Boolean) ?? null : null;
  if (assigned) g.groups.player = shooter === 'player' ? assigned : oppositeGroup(assigned);
  const own = down.filter((id) => groupOf(id) && (group ?? assigned) === groupOf(id));
  const others = down.filter((id) => groupOf(id) && (group ?? assigned) !== groupOf(id));
  const black = g.balls.find((b) => b.id === 8);
  g.balls = sim.balls.slice();
  g.broken = true;
  g.shots++;
  if (eight && opening) spotEight(g, black);
  if (eight && !opening) {
    g.over = eightLegal && !foul
      ? { winner: shooter, reason: 'win' }
      : { winner: other(shooter), reason: foul ? '8-foul' : '8-early' };
    if (g.over.winner === 'player') g.wins++;
  }
  g.ballInHand = !!foul && !g.over;
  g.behindLine = g.ballInHand && opening;
  if (g.ballInHand) g.balls = g.balls.filter((b) => b.id !== 0);
  const keepsTurn = !foul && !g.over && own.length > 0;
  if (!keepsTurn && !g.over) g.turn = other(shooter);
  return { sim, foul, pocketed: { own, other: others, eight }, assigned, keepsTurn, over: g.over };
}

function savedPose(b) {
  if (b.q === undefined) return copyPose(b);
  if (!Array.isArray(b.q) || b.q.length !== 4 || !b.q.every(Number.isFinite)) return null;
  const norm = Math.hypot(...b.q);
  if (!Number.isFinite(norm) || norm < tiny) return null;
  return savePose(b);
}

const validSide = (side) => side === 'player' || side === 'cpu';
const validGroup = (group) => group === 'pleines' || group === 'rayees';

function separateRest(balls) {
  // Recheck neighbours because moving a ball can close a gap in the cluster.
  for (let pass = 0; pass < 32; pass++) {
    let overlap = false;
    for (let i = 0; i < balls.length; i++) {
      const a = balls[i];
      for (let j = i + 1; j < balls.length; j++) {
        const b = balls[j], distance = dist(a, b);
        if (distance >= diameter) continue;
        overlap = true;
        const scale = (diameter + tiny - distance) / (2 * distance);
        const dx = (b.x - a.x) * scale, dy = (b.y - a.y) * scale;
        if (inside(a.x - dx, a.y - dy, true) && inside(b.x + dx, b.y + dy, true)) {
          a.x -= dx; a.y -= dy;
          b.x += dx; b.y += dy;
        } else if (inside(a.x - 2 * dx, a.y - 2 * dy, true)) {
          a.x -= 2 * dx; a.y -= 2 * dy;
        } else if (inside(b.x + 2 * dx, b.y + 2 * dy, true)) {
          b.x += 2 * dx; b.y += 2 * dy;
        }
      }
    }
    if (!overlap) return true;
  }
  return false;
}

function readPosition(raw, atLegacySpot) {
  if (!raw || !validSide(raw.turn) || !Array.isArray(raw.balls) || raw.balls.length > 16 ||
      !Number.isSafeInteger(raw.wins) || raw.wins < 0 || !Number.isSafeInteger(raw.shots) || raw.shots < 0 ||
      typeof raw.ballInHand !== 'boolean' || typeof raw.behindLine !== 'boolean' || typeof raw.broken !== 'boolean' ||
      raw.broken !== (raw.shots > 0) || (raw.behindLine && (!raw.ballInHand || raw.shots !== 1)) ||
      !raw.groups) return null;
  const { player, cpu } = raw.groups;
  if ((player !== null && !validGroup(player)) || (cpu !== undefined && cpu !== oppositeGroup(player))) return null;
  const ids = new Set(), balls = [];
  let needsSeparation = false;
  for (const b of raw.balls) {
    if (!b || !Number.isInteger(b.id) || b.id < 0 || b.id > 15 || ids.has(b.id) ||
        !Number.isFinite(b.x) || !Number.isFinite(b.y) || !inside(b.x, b.y, true)) return null;
    for (const a of balls) {
      const overlap = diameter - dist(a, b);
      // Old racks could overlap by up to 24 µm, even after a shot that left the pair untouched.
      if (overlap > 24e-6 || (overlap > 1e-6 && raw.broken && !(atLegacySpot(a) && atLegacySpot(b)))) return null;
      if (overlap > (raw.broken ? 1e-6 : 0)) needsSeparation = true;
    }
    const pose = savedPose(b);
    if (!pose) return null;
    balls.push(pose);
    ids.add(b.id);
  }
  let over = null;
  if (raw.over !== null) {
    if (!validSide(raw.over?.winner) || raw.ballInHand || ids.has(8) || !raw.broken) return null;
    const { winner, reason } = raw.over;
    if (reason === 'win') {
      const group = groupFor(raw, winner);
      if (winner !== raw.turn || !group || balls.some((b) => groupOf(b.id) === group)) return null;
    } else if ((reason !== '8-early' && reason !== '8-foul') || winner === raw.turn) return null;
    if (winner === 'player' && raw.wins === 0) return null;
    if (!ids.has(0) && reason !== '8-foul') return null;
    over = { winner, reason };
  } else if (!ids.has(8) || ids.has(0) === raw.ballInHand) return null;
  if (!raw.broken && (balls.length !== 16 || raw.turn !== 'player' || player !== null)) return null;
  if (needsSeparation && !separateRest(balls)) return null;
  return snapshot({ ...raw, balls, groups: { player }, over });
}

export function restore(raw, seed) {
  const reset = fresh(raw?.level, raw?.wins, seed);
  if (raw?.v !== 1 || raw.level !== reset.level || !Number.isInteger(raw.seed) || raw.seed < 0 ||
      raw.seed > 0xffffffff || !Array.isArray(raw.history) || raw.history.length > 40) return reset;
  let legacy;
  const atLegacySpot = (ball) => {
    legacy ??= rackLayout(raw.seed);
    return legacy.some(({ id, x, y }) => id === ball.id && x === ball.x && y === ball.y);
  };
  const position = readPosition(raw, atLegacySpot);
  if (!position) return reset;
  const history = [];
  const won = position.over?.winner === 'player' ? 1 : 0;
  let lastShot = -1, previousIds = null;
  for (const entry of raw.history) {
    const s = readPosition(entry, atLegacySpot);
    if (!s || s.over || s.turn !== 'player' || s.shots <= lastShot || s.shots >= position.shots ||
        s.wins !== position.wins - won ||
        (previousIds && s.balls.some((b) => b.id && !previousIds.has(b.id)))) return reset;
    history.push(s);
    lastShot = s.shots;
    previousIds = new Set(s.balls.map((b) => b.id));
  }
  if (previousIds && position.balls.some((b) => b.id && !previousIds.has(b.id))) return reset;
  return { ...reset, ...position, seed: raw.seed, history };
}

// Clear a swept ball-width lane. The caller handles the pocket and the target separately.
function clearLane(a, b, balls, skip, radius = diameter) {
  const dx = b.x - a.x, dy = b.y - a.y, len2 = dx * dx + dy * dy;
  if (len2 < tiny) return true;
  for (const blocker of balls) {
    if (blocker.id === 0 || blocker.id === skip) continue;
    const t = clamp(((blocker.x - a.x) * dx + (blocker.y - a.y) * dy) / len2, 0, 1);
    if ((a.x + dx * t - blocker.x) ** 2 + (a.y + dy * t - blocker.y) ** 2 < radius * radius) return false;
  }
  return true;
}

function pocketRoute(target, p, offset, balls) {
  const end = point(p.x + p.nx * p.capture - p.ny * offset, p.y + p.ny * p.capture + p.nx * offset);
  const distance = dist(target, end);
  if (distance < tiny || !clearLane(target, end, balls, target.id)) return null;
  const angle = toward(target, end);
  const vx = Math.cos(angle), vy = Math.sin(angle);
  if (vx * p.nx + vy * p.ny > -0.12 || surfaceTime(target.x, target.y, vx, vy, distance) < distance - 1e-7) return null;
  return { target, pocket: p, distance, angle, offset };
}

function ghostFor(cue, route) {
  const { target, angle } = route;
  let hitAngle = angle, ghost, aim, cut;
  // Compensate for the transverse impulse of an initially spin-free object ball.
  for (let i = 0; i < 4; i++) {
    ghost = point(target.x - diameter * Math.cos(hitAngle), target.y - diameter * Math.sin(hitAngle));
    aim = toward(cue, ghost);
    cut = Math.cos(aim - hitAngle);
    if (cut <= 0.12) return null;
    const throwAngle = Math.atan(clamp(Math.sin(aim - hitAngle) / (7 * 0.975 * cut), -ballFriction, ballFriction));
    hitAngle = angle - throwAngle;
  }
  return { ghost, angle: aim, cut };
}

function routesFor(g, who, wide) {
  const routes = [];
  for (const target of g.balls) {
    if (!canHit(g, who, target.id)) continue;
    for (const pocket of pockets) {
      const clearance = pocket.width - R - jawRadius;
      for (const fraction of wide ? [0, -0.5, 0.5, -0.85, 0.85] : [0, -0.5, 0.5]) {
        const offset = clearance * fraction;
        const route = pocketRoute(target, pocket, offset, g.balls);
        if (route) routes.push(route);
      }
    }
  }
  return routes;
}

function candidate(g, cue, route, place) {
  const aim = ghostFor(cue, route);
  if (!aim || !inside(aim.ghost.x, aim.ghost.y) || !clearLane(cue, aim.ghost, g.balls, route.target.id)) return null;
  const distance = dist(cue, aim.ghost);
  // Estimate the energy needed after the cut, including the object ball's initial slide.
  const objectSpeed = Math.sqrt((route.distance + 0.24) / 2.65);
  const impactSpeed = objectSpeed / (aim.cut * (1 + ballRestitution) / 2);
  const speed = Math.sqrt((impactSpeed ** 2 + 2 * roll * distance) / (5 / 7) ** 2);
  const power = powerAt(speed);
  const difficulty = (distance + 0.14) * (route.distance + 0.14) / aim.cut ** 2 +
    0.21 * route.distance + 0.12 * distance + 7 * Math.abs(route.offset);
  return { angle: aim.angle, power, target: route.target.id, pocket: route.pocket.id,
    ...(place && { place }), difficulty };
}

function placements(g, routes) {
  const maxX = g.behindLine ? table.headString : L - R;
  const places = [];
  const add = (x, y) => {
    if (canPlace(g, x, y) && !places.some((p) => dist(p, point(x, y)) < 0.02)) places.push(point(x, y));
  };
  add(table.headSpot.x, table.headSpot.y);
  for (const { target, angle } of routes) {
    const dx = Math.cos(angle), dy = Math.sin(angle);
    for (const spacing of [0.14, 0.28]) {
      const x = target.x - dx * spacing, y = target.y - dy * spacing;
      add(x, y);
      if (x > maxX && dx > 0.05) add(maxX, target.y - dy * ((target.x - maxX) / dx));
    }
  }
  for (let x = 0.08; x <= maxX; x += 0.12) {
    for (let y = 0.08; y < W - 0.05; y += 0.12) add(x, y);
  }
  return places;
}

function candidates(g, who, wide) {
  const routes = routesFor(g, who, wide), choices = [];
  if (g.ballInHand) {
    const places = placements(g, routes);
    for (const route of routes) {
      let best = null;
      for (const place of places) {
        const shot = candidate(g, place, route, place);
        if (shot && (!best || shot.difficulty < best.difficulty)) best = shot;
      }
      if (best) choices.push(best);
    }
  } else {
    const cue = g.balls.find((b) => b.id === 0);
    if (!cue) return [];
    for (const route of routes) {
      const shot = candidate(g, cue, route);
      if (shot) choices.push(shot);
    }
  }
  return choices.sort((a, b) => a.difficulty - b.difficulty);
}

function basis(g, shot) {
  return shot.place ? [{ id: 0, ...shot.place }, ...g.balls.filter((b) => b.id !== 0)] : g.balls;
}

function trial(g, who, shot, fallbacks) {
  // Same physics as simulate(), without updating the ball orientations.
  const sim = run(basis(g, shot), shot, false, false);
  const scratch = sim.pocketed.some((b) => b.id === 0);
  const eight = sim.pocketed.some((b) => b.id === 8);
  const firstLegal = canHit(g, who, sim.firstHit);
  const legal = firstLegal && !scratch && (!eight || !g.broken || canHit(g, who, 8));
  if (firstLegal && fallbacks) fallbacks.push({ shot, sim, legal });
  return { sim, legal };
}

function positionAfter(g, who, sim) {
  const assigned = g.groups.player ?? sim.pocketed.map((b) => groupOf(b.id)).find(Boolean) ?? null;
  const player = g.groups.player ?? (who === 'player' ? assigned : oppositeGroup(assigned));
  return { ...g, balls: sim.balls, groups: { player }, ballInHand: false, broken: true };
}

function leave(g, who, sim) {
  const after = { ...g, balls: sim.balls, ballInHand: false };
  const cue = sim.balls.find((b) => b.id === 0);
  if (!cue) return Infinity;
  let score = 1.5;
  for (const b of sim.balls) {
    if (!canHit(after, who, b.id)) continue;
    for (const p of pockets) {
      const route = pocketRoute(b, p, 0, sim.balls);
      if (!route) continue;
      const next = candidate(after, cue, route);
      if (next) score = Math.min(score, next.difficulty);
    }
    if (score < 0.07) break;
  }
  return score;
}

export function suggestPlace(g) {
  if (!g.ballInHand || g.over) return null;
  const shots = candidates(g, g.turn, false);
  for (const shot of shots.slice(0, 6)) {
    const { legal, sim } = trial(g, g.turn, shot);
    if (legal && sim.pocketed.some((b) => b.id === shot.target)) return shot.place;
  }
  const head = table.headSpot, places = placements(g, []);
  for (const b of g.balls) {
    if (dist(b, head) >= diameter) continue;
    const direction = toward(b, head);
    for (let i = 0; i < 8; i++) {
      const angle = direction + i * Math.PI / 4;
      const p = point(b.x + (diameter + tiny) * Math.cos(angle), b.y + (diameter + tiny) * Math.sin(angle));
      if (canPlace(g, p.x, p.y)) places.push(p);
    }
  }
  return places.sort((a, b) => dist(a, head) - dist(b, head))[0] ?? null;
}

function breakHint(g) {
  const who = g.turn;
  const cue = g.balls.find((b) => b.id === 0), apex = g.balls[1];
  const angle = toward(cue, apex);
  let best = null, score = -Infinity;
  const fallbacks = [];
  for (const offset of [0, -0.003, 0.003, -0.018, 0.018, -0.04, 0.04]) {
    const shot = { angle: angle + offset, power: 10, target: apex.id };
    const { sim, legal } = trial(g, who, shot, fallbacks);
    if (!legal) continue;
    const down = sim.pocketed.find((b) => groupOf(b.id));
    let value = down ? 12 : 0;
    for (const ball of sim.balls) {
      if (ball.id && dist(ball, g.balls.find((b) => b.id === ball.id)) > 0.2) value++;
    }
    if (value > score) {
      score = value;
      best = { ...shot, target: sim.firstHit, ...(down && { pocket: down.pocket, potted: down.id }) };
    }
  }
  return best ?? safety(g, who, 'fort', fallbacks);
}

function safety(g, who, level, fallbacks) {
  const place = g.ballInHand ? suggestPlace(g) : null;
  const balls = basis(g, { place });
  const cue = balls.find((b) => b.id === 0);
  if (!cue) return { angle: 0, power: 1 };
  const targets = balls.filter((b) => canHit(g, who, b.id)).sort((a, b) => dist(a, cue) - dist(b, cue));
  const ownPot = (sim) => sim.pocketed.find(({ id }) => canHit(g, who, id));
  let best = null, score = -Infinity, attempts = 0;
  const rate = ({ shot, sim, legal }) => {
    if (!legal) {
      return (sim.pocketed.some(({ id }) => id === 8) && !canHit(g, who, 8) ? -200 : -100) -
        shot.power;
    }
    return (ownPot(sim) ? 10 : 0) + leave(g, other(who), sim) - 0.16 * leave(g, who, sim) - 0.05 * shot.power;
  };
  const consider = (checked) => {
    const value = rate(checked);
    if (value > score) {
      best = checked;
      score = value;
    }
  };
  const describe = ({ shot, sim, legal }) => {
    const pot = legal && ownPot(sim);
    const bank = sim.events[0]?.type === 'cushion';
    const { pocket, ...aim } = shot;
    return { ...aim, target: pot ? pot.id : sim.firstHit,
      ...(pot && { pocket: pot.pocket, first: sim.firstHit }), ...(bank && { bank }) };
  };
  const budget = level === 'facile' ? 2 : level === 'moyen' ? 5 : 9;
  for (const b of targets) {
    const direct = toward(cue, b), spread = Math.asin(Math.min(1, diameter / dist(cue, b)));
    for (const fraction of [0, -0.65, 0.65, -0.9, 0.9]) {
      const angle = direct + spread * fraction;
      const aim = aimLine(balls, angle);
      if (aim.hit === null || !canHit(g, who, aim.hit)) continue;
      const power = powerAt(Math.sqrt((dist(cue, aim.contact) + (fraction ? 0.24 : 0.15)) / 2.65));
      const shot = { angle, power, target: aim.hit, ...(place && { place }) };
      const { legal, sim } = trial(g, who, shot, fallbacks);
      if (legal) {
        const checked = { shot, sim, legal };
        if (ownPot(sim)) return describe(checked);
        consider(checked);
      }
      if (++attempts >= budget) break;
    }
    if (attempts >= budget) break;
  }
  if (best) return describe(best);
  // An obscured group can still be reached off a cushion. Fan out the first rail contact.
  for (const b of targets.slice(0, 4)) {
    for (const image of [point(-b.x + 2 * R, b.y), point(2 * (L - R) - b.x, b.y),
      point(b.x, -b.y + 2 * R), point(b.x, 2 * (W - R) - b.y)]) {
      const direct = toward(cue, image);
      for (const offset of [0, -0.04, 0.04, -0.085, 0.085]) {
        const shot = { angle: direct + offset, power: 4.8, target: b.id, ...(place && { place }) };
        const { legal, sim } = trial(g, who, shot, fallbacks);
        if (legal) return describe({ shot, sim, legal });
      }
    }
  }
  const lastResort = { angle: targets.length ? toward(cue, targets[0]) : 0, power: 3.5, ...(place && { place }) };
  trial(g, who, lastResort, fallbacks);
  for (const checked of fallbacks) consider(checked);
  if (best?.legal || !targets.length) return best ? describe(best) : lastResort;
  const examine = (shot) => {
    const { sim, legal } = trial(g, who, shot);
    if (canHit(g, who, sim.firstHit)) consider({ shot, sim, legal });
  };
  // Cover the whole table, including paths that use more than one cushion.
  for (let i = 0; i < 720; i++) {
    const angle = i * 0.5 * (Math.PI / 180);
    const { hit } = aimLine(balls, angle);
    if (hit !== null && !canHit(g, who, hit)) continue;
    for (const power of [3.5, 4.8, 7]) examine({ angle, power, ...(place && { place }) });
  }
  if (best) {
    const shot = best.shot;
    for (const offset of [-0.25, -0.125, 0, 0.125, 0.25]) {
      for (const change of [-0.35, 0, 0.35]) {
        if (offset || change) {
          examine({ ...shot, angle: shot.angle + offset * Math.PI / 180, power: clamp(shot.power + change, 1, 10) });
        }
      }
    }
  }
  return best ? describe(best) : lastResort;
}

function indirectRoutes(g, who, hard = false) {
  const cue = g.balls.find((b) => b.id === 0);
  if (!cue) return [];
  const choices = [];
  for (const route of routesFor(g, who, true)) {
    const end = point(route.target.x - diameter * Math.cos(route.angle), route.target.y - diameter * Math.sin(route.angle));
    for (const first of g.balls) {
      if (first.id === route.target.id || first.id === 8 || !canHit(g, who, first.id)) continue;
      const approach = toward(first, end), transfer = Math.cos(approach - route.angle);
      if (transfer < 0.6 || !inside(end.x, end.y) ||
          !clearLane(first, end, g.balls.filter((b) => b.id !== route.target.id), first.id)) continue;
      const lead = { ...route, target: first, angle: approach,
        distance: dist(first, end) + (route.distance + 0.07) / (0.7 * transfer ** 2) };
      const shot = candidate(g, cue, lead);
      if (shot) choices.push({ ...shot, target: route.target.id, bank: false });
    }
  }
  if (hard) choices.push(...railPots(g, who, cue));
  for (const target of g.balls) {
    if (!canHit(g, who, target.id)) continue;
    for (const p of pockets) {
      const end = point(p.x + p.nx * p.capture, p.y + p.ny * p.capture);
      for (const image of [point(2 * R - end.x, end.y), point(2 * (L - R) - end.x, end.y),
        point(end.x, 2 * R - end.y), point(end.x, 2 * (W - R) - end.y)]) {
        const angle = toward(target, image), dx = Math.cos(angle), dy = Math.sin(angle);
        const bounce = surfaceTime(target.x, target.y, dx, dy, dist(target, image));
        const rail = point(target.x + bounce * dx, target.y + bounce * dy);
        if (bounce < 0.035 || !inside(rail.x, rail.y) ||
            !clearLane(target, rail, g.balls, target.id) || !clearLane(rail, end, g.balls, target.id)) continue;
        const shot = candidate(g, cue, { target, angle, pocket: p, offset: 0, distance: bounce + dist(rail, end) / 0.54 });
        if (shot) choices.push({ ...shot, bank: true });
      }
    }
  }
  return choices.sort((a, b) => a.difficulty - b.difficulty);
}

function indirectPot(g, who, fallbacks) {
  const choices = indirectRoutes(g, who);
  let attempts = 0;
  for (const { difficulty, bank, ...shot } of choices) {
    for (const bias of bank ? [0, -0.005, 0.005, -0.012, 0.012, -0.023, 0.023] : [0, -0.004, 0.004, -0.01, 0.01]) {
      for (const scale of [1, 1.27]) {
        const attempt = { ...shot, angle: shot.angle + bias, power: powerAt(speedAt(shot.power) * scale) };
        const { sim, legal } = trial(g, who, attempt, fallbacks);
        if (legal && sim.pocketed.some((b) => b.id === shot.target && b.pocket === shot.pocket)) {
          return { ...attempt, first: sim.firstHit, bank };
        }
        if (++attempts === 100) return null;
      }
    }
  }
  return null;
}

function planPot(g, who, level, takesRisk, advice, fallbacks) {
  let best = null, bestScore = Infinity, attempts = 0;
  const found = new Set();
  const testLimit = advice ? 90 : level === 'moyen' ? 14 : 5;
  const potLimit = advice ? 1 : level === 'moyen' ? 2 : takesRisk ? 3 : 1;
  for (const candidate of candidates(g, who, advice)) {
    const { difficulty, ...shot } = candidate;
    const key = shot.target + shot.pocket;
    if (found.has(key) || (level === 'facile' && !takesRisk && difficulty > 1.15)) continue;
    const variations = advice ? [1, 0.84, 1.2] : level !== 'facile' ? [1, 0.88, 1.22] : [1, 1.2];
    for (const scale of variations) {
      const attempt = { ...shot, power: powerAt(speedAt(shot.power) * scale) };
      const { sim, legal } = trial(g, who, attempt, fallbacks);
      attempts++;
      if (legal && sim.pocketed.some((b) => b.id === shot.target && b.pocket === shot.pocket)) {
        if (shot.target === 8 || advice) return attempt;
        const position = level === 'moyen' ? 0.7 * leave(g, who, sim) : 0;
        const value = (takesRisk ? -difficulty : difficulty) + position;
        if (value < bestScore) {
          best = attempt;
          bestScore = value;
        }
        found.add(key);
        if (level === 'facile') break;
      }
      if (attempts >= testLimit) break;
    }
    if (found.size >= potLimit || attempts >= testLimit) break;
  }
  const tryBank = !g.ballInHand && (advice || (level === 'moyen' && canHit(g, who, 8)));
  return best ?? (tryBank ? indirectPot(g, who, fallbacks) : null);
}

function spreadScore(g, who) {
  let open = 0;
  for (const b of g.balls) {
    if (b.id !== 8 && !canHit(g, who, b.id)) continue;
    let nearest = 0.22;
    for (const a of g.balls) {
      if (a.id && a.id !== b.id) nearest = Math.min(nearest, dist(a, b));
    }
    open += nearest;
  }
  return open;
}

// Keep routes to distinct pockets near the top of the search. Try the other
// lines into the same pocket if the first one fails.
function distinctPots(shots) {
  const seen = new Set();
  return shots.filter(({ target, pocket }) => {
    const key = target + pocket;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function potResult(g, who, shot, fallbacks) {
  const { legal, sim } = trial(g, who, shot, fallbacks);
  return legal && sim.pocketed.some((b) => b.id === shot.target && b.pocket === shot.pocket) ? sim : null;
}

function positionShot(shot, scale, top, side = 0) {
  // Correct for squirt and estimate the speed after the cue ball starts rolling.
  const offset = 1 / Math.max(1, length(side, top));
  const speed = speedAt(shot.power) * scale / (1 + 0.5 * top * offset);
  return { ...shot, angle: shot.angle + 0.022 * side * offset, power: powerAt(speed), spin: { side, top } };
}

const positionProfiles = [
  [1, 0], [0.85, 0], [1.22, 0], [1, 0.6], [1, -0.65], [1, 1], [1, -1],
  [1.13, 0.4], [1.13, -0.4], [1.42, 0.6], [1.42, -0.6], [1.5, 0],
  [0.88, 0.7], [0.88, -0.7], [1.17, 0], [1.26, 0.8], [1.26, -0.8],
  [1.1, 0, -0.6], [1.1, 0, 0.6], [1.34, 0.35, -0.6], [1.34, 0.35, 0.6]
];

function hardLeave(g, who) {
  const cue = g.balls.find((b) => b.id === 0);
  let best = 2.4, second = 2.4, trouble = 0;
  for (const b of g.balls) {
    const legal = canHit(g, who, b.id);
    if (!legal && b.id !== 8) continue;
    let difficulty = 2.4, objectDistance = Infinity;
    for (const p of pockets) {
      const route = pocketRoute(b, p, 0, g.balls);
      if (!route) continue;
      objectDistance = Math.min(objectDistance, route.distance);
      const shot = legal ? candidate(g, cue, route) : null;
      if (shot) difficulty = Math.min(difficulty, 1.1 * Math.log1p(shot.difficulty * 1.7));
    }
    trouble += Math.min(0.42, objectDistance * 0.14);
    if (!legal) continue;
    if (difficulty < best) {
      second = best;
      best = difficulty;
    } else second = Math.min(second, difficulty);
  }
  return 1.35 * best + 0.19 * second + trouble - 0.64 * spreadScore(g, who);
}

function variedShot(shot, direction, radians, power) {
  return { ...shot, angle: shot.angle + direction * radians, power: shot.power * (1 + direction * power) };
}

function potAfter(g, who, shot) {
  const { legal, sim } = trial(g, who, shot);
  const potted = legal && sim.pocketed.some((b) => b.id === shot.target && b.pocket === shot.pocket);
  return { legal, after: potted ? positionAfter(g, who, sim) : null };
}

function currentRisk(g, who, shot, nominalLeave) {
  let risk = 0;
  for (const [direction, radians, power] of [[-1, 0.002, 0.02], [1, 0.002, -0.02], [-1, 0.0042, -0.02], [1, 0.0042, 0.02]]) {
    const { legal, after } = potAfter(g, who, variedShot(shot, direction, radians, power));
    if (after) {
      if (nominalLeave !== undefined) risk += Math.max(0, hardLeave(after, who) - nominalLeave) * 0.09;
    } else risk += legal ? 0.6 : 1.25;
  }
  return risk;
}

function followingPot(g, who, depth = 1) {
  let value = 1.5;
  const ranked = candidates(g, who, false);
  const probes = depth > 1 ? 6 : 4;
  for (const { difficulty, ...follow } of distinctPots(ranked).slice(0, probes)) {
    for (const profile of positionProfiles.slice(0, depth > 1 ? 7 : 5)) {
      const shot = positionShot(follow, ...profile);
      const { after } = potAfter(g, who, shot);
      if (!after) continue;
      const estimate = follow.target === 8 ? -0.7 : 0.22 * Math.log1p(difficulty) + 0.35 * hardLeave(after, who);
      if (estimate >= value) continue;
      const risk = Number(!potResult(g, who, variedShot(shot, -1, 0.0026, 0.02))) +
        Number(!potResult(g, who, variedShot(shot, 1, 0.0026, 0.02)));
      let total = estimate + 0.45 * risk;
      if (depth > 1 && follow.target !== 8 && total < value + 0.5) total += 0.55 * followingPot(after, who);
      value = Math.min(value, total);
    }
  }
  return value;
}

function hardPot(g, who, fallbacks) {
  const ranked = candidates(g, who, true);
  const distinct = distinctPots(ranked);
  const choices = [], tried = new Set();
  const examine = (candidate, profiles) => {
    const { difficulty, ...base } = candidate;
    for (const profile of profiles) {
      const shot = positionShot(base, ...profile);
      const key = [shot.angle, shot.power, ...profile.slice(1), shot.place?.x, shot.place?.y].join();
      if (tried.has(key)) continue;
      tried.add(key);
      const sim = potResult(g, who, shot, fallbacks);
      if (!sim) continue;
      const after = positionAfter(g, who, sim);
      const group = groupFor(after, who);
      const own = sim.pocketed.filter((b) => group && groupOf(b.id) === group).length;
      const value = shot.target === 8 ? -10 : 0.62 * Math.log1p(difficulty) + hardLeave(after, who) - 0.44 * own;
      choices.push({ shot, after, value });
    }
  };
  // Simulation budgets depend on counts so a restored game yields the same shot.
  for (const candidate of distinct.slice(0, 10)) examine(candidate, positionProfiles);
  for (const candidate of ranked.slice(0, 25)) {
    examine(candidate, positionProfiles.slice(0, 5));
  }
  choices.sort((a, b) => a.value - b.value);
  let best = null, bestScore = Infinity;
  const endgame = groupFor(g, who) && remaining(g, who).length <= 2;
  const byPocket = new Map();
  let examined = 0;
  for (const { shot, after, value } of choices) {
    const key = shot.target + shot.pocket;
    const count = byPocket.get(key) ?? 0;
    if (count >= 6) continue;
    byPocket.set(key, count + 1);
    if (++examined > 20) break;
    const nominalLeave = shot.target === 8 ? undefined : hardLeave(after, who);
    const risk = currentRisk(g, who, shot, nominalLeave);
    let score = value + risk * 1.25;
    if (shot.target !== 8 && score < bestScore + 0.8) {
      score += followingPot(after, who, endgame && examined <= 5 ? 2 : 1);
    }
    if (score < bestScore) {
      bestScore = score;
      best = shot;
    }
    if (risk > 0 && examined <= 12) {
      for (const offset of [-0.0014, 0.0014, -0.003, 0.003]) {
        const aim = { ...shot, angle: shot.angle + offset };
        const sim = potResult(g, who, aim, fallbacks);
        if (!sim) continue;
        const corrected = positionAfter(g, who, sim);
        const correctedLeave = shot.target === 8 ? undefined : hardLeave(corrected, who);
        let rating = correctedLeave === undefined ? -10 : value + correctedLeave - nominalLeave;
        rating += 1.25 * currentRisk(g, who, aim, correctedLeave);
        if (shot.target !== 8 && rating < bestScore + 0.8) rating += followingPot(corrected, who);
        if (rating < bestScore) {
          bestScore = rating;
          best = aim;
        }
      }
    }
  }
  if (best) {
    const risk = currentRisk(g, who, best);
    if (risk >= 1.2) {
      const alternative = hardIndirect(g, who, fallbacks);
      if (alternative && currentRisk(g, who, alternative) + 0.6 < risk) return alternative;
    }
  }
  return best;
}

const bankRails = segments.filter((rail) => rail.kind === 'cushion');

function railRebound(from, end, rail, speed) {
  const { nx, ny, tx, ty } = rail;
  const railX = rail.x + R * nx, railY = rail.y + R * ny;
  const depth = (end.x - railX) * nx + (end.y - railY) * ny;
  if (depth <= 0.02) return null;
  let lo = R, hi = rail.len - R;
  // Find a point on the cushion whose outgoing rolling line reaches the destination.
  for (let i = 0; i < 12; i++) {
    const mid = (lo + hi) / 2;
    const bounce = point(railX + tx * mid, railY + ty * mid);
    const angle = toward(from, bounce);
    const vx = speed * Math.cos(angle), vy = speed * Math.sin(angle);
    if (vx * nx + vy * ny > -0.05) return null;
    const body = { vx, vy, wx: vy / R, wy: -vx / R, wz: 0 };
    strikeCushion(body, nx, ny, railRestitution);
    const vx0 = body.vx, vy0 = body.vy;
    const sliding = length(vx0 + R * body.wy, vy0 - R * body.wx) / (3.5 * slide);
    cloth(body, sliding, false);
    const glideX = (vx0 + body.vx) / 2 * sliding;
    const glideY = (vy0 + body.vy) / 2 * sliding;
    const normal = body.vx * nx + body.vy * ny;
    if (normal <= 0) return null;
    const t = (depth - glideX * nx - glideY * ny) / normal;
    const error = (bounce.x + glideX + t * body.vx - end.x) * tx +
      (bounce.y + glideY + t * body.vy - end.y) * ty;
    if (Math.abs(error) < 0.001 || i === 11 && Math.abs(error) < 0.035) return bounce;
    if (error < 0) lo = mid;
    else hi = mid;
  }
  return null;
}

function railPots(g, who, cue) {
  const choices = [];
  for (const b of g.balls) {
    if (!canHit(g, who, b.id)) continue;
    for (const p of pockets) {
      const end = point(p.x + p.nx * p.capture, p.y + p.ny * p.capture);
      for (const rail of bankRails) {
        const bounce = railRebound(b, end, rail, 1.1);
        if (!bounce || dist(b, bounce) < 0.19 || !clearLane(b, bounce, g.balls, b.id) ||
            !clearLane(bounce, end, g.balls, b.id)) continue;
        const shot = candidate(g, cue, {
          target: b, pocket: p, offset: 0, angle: toward(b, bounce),
          distance: dist(b, bounce) + 2.7 * dist(bounce, end)
        });
        if (shot) choices.push({ ...shot, bank: true, difficulty: shot.difficulty + 0.28 });
      }
    }
  }
  for (const route of routesFor(g, who, false)) {
    const b = route.target;
    for (const rail of bankRails) {
      const bounce = railRebound(cue, b, rail, 1.2);
      if (!bounce || !clearLane(cue, bounce, g.balls, b.id)) continue;
      const aim = ghostFor(bounce, route);
      if (!aim || !clearLane(bounce, aim.ghost, g.balls, b.id)) continue;
      const lead = railRebound(cue, aim.ghost, rail, 1.2);
      if (!lead || !clearLane(cue, lead, g.balls, b.id)) continue;
      const { power, difficulty } = candidate(g, lead, route) ?? {};
      if (!power) continue;
      choices.push({ angle: toward(cue, lead), target: b.id, pocket: route.pocket.id,
        power: powerAt(Math.sqrt((speedAt(power) / 0.66) ** 2 + dist(cue, lead) * 0.24)),
        difficulty: difficulty + dist(cue, lead) * 0.5 + 0.7, bank: true });
    }
  }
  return choices;
}

function hardIndirect(g, who, fallbacks) {
  const ranked = indirectRoutes(g, who, true);
  let best = null, bestScore = Infinity, attempts = 0;
  const seen = new Set();
  for (const { difficulty, bank, ...shot } of ranked) {
    const key = [shot.target, shot.pocket, Math.round(shot.angle * 125)].join();
    if (seen.has(key)) continue;
    seen.add(key);
    for (const bias of bank ? [0, -0.007, 0.007, -0.016, 0.016, -0.028, 0.028] : [0, -0.004, 0.004, -0.01, 0.01]) {
      for (const scale of [1, 1.23, 0.88]) {
        const aim = { ...shot, angle: shot.angle + bias, power: powerAt(speedAt(shot.power) * scale) };
        const sim = potResult(g, who, aim, fallbacks);
        attempts++;
        if (sim) {
          const after = positionAfter(g, who, sim);
          let score = shot.target === 8 ? -5 : hardLeave(after, who) + 0.25 * Math.log1p(difficulty);
          if (score < bestScore) {
            for (const sign of [-1, 1]) {
              const variant = { ...aim, angle: aim.angle + sign * 0.003, power: aim.power * (1 + sign * 0.023) };
              if (!potResult(g, who, variant)) score += 1.5;
            }
            if (score < bestScore) {
              bestScore = score;
              best = aim;
            }
          }
        }
        if (attempts >= 270 || bestScore < -4 || best && attempts >= 120) return best;
      }
    }
  }
  return best;
}

function hardSafety(g, who, fallbacks) {
  const place = g.ballInHand ? suggestPlace(g) : null;
  const balls = basis(g, { place });
  const cue = balls.find((b) => b.id === 0);
  if (!cue) return safety(g, who, 'fort', fallbacks);
  const targets = balls.filter((b) => canHit(g, who, b.id));
  const choices = [];
  const examine = (shot) => {
    const { sim, legal } = trial(g, who, shot, fallbacks);
    if (!legal) return;
    const after = positionAfter(g, who, sim);
    const pot = sim.pocketed.find((b) => canHit(g, who, b.id));
    const value = pot ? 12 - hardLeave(after, who) : 0.56 * hardLeave(after, other(who)) -
      0.32 * hardLeave(after, who) + 1.7 * spreadScore(after, who);
    choices.push({
      shot: pot ? { ...shot, target: pot.id, pocket: pot.pocket } : { ...shot, target: sim.firstHit },
      value
    });
  };
  for (const target of targets) {
    const direct = toward(cue, target);
    const spread = Math.asin(Math.min(1, diameter / dist(cue, target)));
    for (const fraction of [0, -0.53, 0.53, -0.81, 0.81]) {
      const angle = direct + spread * fraction;
      if (aimLine(balls, angle).hit !== target.id) continue;
      for (const [power, top] of [[2.2, 0], [3.5, 0.7], [4.7, -0.55], [5.6, 0.5], [6.3, -0.6]]) {
        examine({ angle, power, spin: { side: 0, top }, ...(place && { place }) });
      }
    }
  }
  if (!choices.length) {
    for (const target of targets) {
      for (const rail of bankRails) {
        const bounce = railRebound(cue, target, rail, 1.2);
        if (!bounce || !clearLane(cue, bounce, balls, target.id)) continue;
        for (const offset of [0, -0.022, 0.022]) {
          examine({ angle: toward(cue, bounce) + offset, power: 4.8, ...(place && { place }) });
        }
      }
    }
  }
  choices.sort((a, b) => b.value - a.value);
  let best = null, bestScore = -Infinity;
  for (const { shot, value } of choices.slice(0, 8)) {
    let rating = value;
    for (const direction of [-1, 1]) {
      if (!trial(g, who, variedShot(shot, direction, 0.003, 0.023)).legal) rating -= 2;
    }
    if (rating > bestScore) {
      best = shot;
      bestScore = rating;
    }
  }
  return best ?? safety(g, who, 'fort', fallbacks);
}

const execution = {
  facile: { angle: 1.6, power: 0.15 }, moyen: { angle: 0.5, power: 0.07 }, fort: { angle: 0.15, power: 0.03 }
};

export function cpuShot(g) {
  const next = random(g.seed ^ Math.imul(g.shots + 1, 0x9e3779b9));
  const settings = execution[g.level] ?? execution.facile;
  const who = g.turn, hard = g.level === 'fort', fallbacks = [];
  const pot = hard
    ? hardPot(g, who, fallbacks) ?? (!g.ballInHand ? hardIndirect(g, who, fallbacks) : null)
    : planPot(g, who, g.level, g.level === 'facile' && next() < 0.64, false, fallbacks);
  const { bank, first, ...shot } = pot ?? (hard ? hardSafety(g, who, fallbacks) : safety(g, who, g.level, fallbacks));
  const gaussian = Math.sqrt(-2 * Math.log(Math.max(tiny, next()))) * Math.cos(2 * Math.PI * next());
  const aim = { ...shot,
    angle: shot.angle + gaussian * settings.angle * Math.PI / 180,
    power: clamp(shot.power + shot.power * settings.power * (2 * next() - 1), 1, 10)
  };
  const { sim, legal } = trial(g, who, aim);
  // A pot attempt can still miss, but execution error cannot change contact to the wrong group.
  if (pot) return sim.firstHit === null || canHit(g, who, sim.firstHit) ? aim : shot;
  return legal ? aim : shot;
}

// A ball as he sees it: « la rouge pleine », « la rouge rayée », « la noire ». No number: he can hardly read
// the small digits, and the colour and the family tell each ball apart.
const COLOUR_NAMES = { 1: 'jaune', 2: 'bleue', 3: 'rouge', 4: 'violette', 5: 'orange', 6: 'verte', 7: 'bordeaux' };
export const ballName = (id) =>
  id === 0 ? 'la blanche' : id === 8 ? 'la noire' : `la ${COLOUR_NAMES[id > 8 ? id - 8 : id]} ${id > 8 ? 'rayée' : 'pleine'}`;

export function hint(g) {
  const fallbacks = [];
  const { potted, bank, first, ...shot } = openingRack(g)
    ? breakHint(g)
    : planPot(g, g.turn, 'fort', false, true, fallbacks) ?? safety(g, g.turn, 'fort', fallbacks);
  const target = potted ?? shot.target ?? null, pocket = shot.pocket ?? null;
  let reason;
  if (pocket) {
    const destination = pocketNames[pocket];
    if (first && first !== target) reason = `Jouez ${ballName(first)} sur ${ballName(target)} vers ${destination}.`;
    else if (bank) reason = `Jouez ${ballName(target)} par la bande vers ${destination}.`;
    else reason = `Visez ${ballName(target)} vers ${destination}.`;
  } else if (!g.broken) reason = 'Visez la première bille du triangle et frappez fort.';
  else if (bank) reason = `Jouez par la bande pour toucher ${ballName(target)}.`;
  else if (target) reason = `Aucune bille ne rentre facilement. Touchez ${ballName(target)}.`;
  else reason = g.ballInHand ? 'Placez la blanche pour trouver un coup.' : 'Aucun coup sûr trouvé.';
  return { ...shot, target, pocket, reason };
}

// A ball he may touch first without a foul.
export const legalFirst = (g, id) => canHit(g, g.turn, id);

// At Facile, a click on a ball aims the cue so that this ball goes toward its easiest pocket: the
// direct lines are tried from the easiest, and the first one the physics pots wins. Null when no
// pocket is in line, and the game then aims at the middle of the ball.
export function aimFor(g, id, cue) {
  const target = g.balls.find((b) => b.id === id);
  if (!target || !cue) return null;
  const shots = [];
  for (const pocket of pockets) {
    for (const fraction of [0, -0.5, 0.5]) {
      const route = pocketRoute(target, pocket, (pocket.width - R - jawRadius) * fraction, g.balls);
      const shot = route && candidate(g, cue, route, { x: cue.x, y: cue.y });
      if (shot) shots.push(shot);
    }
  }
  shots.sort((a, b) => a.difficulty - b.difficulty);
  for (const { difficulty, ...shot } of shots.slice(0, 6)) {
    for (const scale of [1, 1.2]) {
      const attempt = { ...shot, power: Math.min(10, powerAt(speedAt(shot.power) * scale)) };
      const sim = run(basis(g, attempt), attempt, false, false);
      if (sim.pocketed.some((b) => b.id === id && b.pocket === shot.pocket) && !sim.pocketed.some((b) => b.id === 0))
        return { angle: attempt.angle, power: attempt.power, pocket: shot.pocket };
    }
  }
  return shots.length ? { angle: shots[0].angle, power: Math.min(10, shots[0].power), pocket: shots[0].pocket, unsure: true } : null;
}
