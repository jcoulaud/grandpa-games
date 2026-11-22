// Metres, kilograms and seconds. Positive z goes from the foul line to the pit.
export const length = 18.29,
  width = 1.0541,
  board = width / 39,
  gutterWidth = 0.235;
export const step = 1 / 180,
  deckEnd = length + 1.06,
  radius = 0.109;
export const goals = { facile: 145, moyen: 160, fort: 175 };
export const defaults = () => ({ start: 20, aim: 20, speed: 6, curve: 0 });
export const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
export const boardAt = (x) => clamp(20 + x / board, -5, 45);
export const boardX = (aim) => (aim - 20) * board;

export function rack(seed) {
  let state = seed >>> 0;
  const jitter = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return (state / 4294967296 - 0.5) * 0.0104;
  };
  const pins = [];
  for (let row = 0; row < 4; row++) {
    for (let i = 0; i <= row; i++)
      pins.push({
        id: pins.length + 1,
        x: (i - row / 2) * 0.3048 + jitter(),
        z: length + row * 0.3048 * Math.sqrt(0.75) + jitter(),
        tilt: 0,
        heading: 0
      });
  }
  return pins;
}

// Integrate the slip at the contact patch in launch coordinates. Friction
// changes translation and spin together. The oiled boards offer little side grip.
export function trajectory(shot, level, through = length, edges = true, error = null) {
  const initial = 5.5 + ((shot.speed - 1) * 4) / 9 + (error?.speed ?? 0);
  let vz = initial,
    vx = 0,
    x = 0,
    z = 0;
  let slipZ = initial * 0.43,
    slipX = -shot.curve * (1.16 + 0.045 * Math.abs(shot.curve)) * (1 + 0.08 * (shot.speed - 6));
  // Extra side spin changes the entry direction. The launch line below
  // compensates for its displacement, preserving the sampled board error.
  slipX -= (error?.angle ?? 0) * initial * 4.4;
  const path = [{ x, z, vx, vz, slipX, slipZ, t: 0 }];
  let target = 0;
  for (let i = 1; z <= deckEnd; i++) {
    const dry = clamp((z - (level === 'fort' ? 11 : 10.4)) / 1.0, 0, 1);
    const friction = 0.003 + dry * (level === 'fort' ? 0.235 : 0.19);
    const slip = Math.sqrt(slipX * slipX + slipZ * slipZ);
    if (slip > 1e-6) {
      const impulse = Math.min(1 / 3.5, (friction * 9.81 * step) / slip);
      const dx = -slipX * impulse,
        dz = -slipZ * impulse;
      vx += dx;
      vz += dz;
      slipX += 3.5 * dx;
      slipZ += 3.5 * dz;
    }
    x += vx * step;
    const last = z;
    z += vz * step;
    if (last < through && z >= through) target = x - (vx * (z - through)) / vz;
    path.push({ x, z, vx, vz, slipX, slipZ, t: i * step });
  }
  // The start spot depends only on the curve: the middle for a straight ball, then 5 boards
  // towards the side of the hook for each step. So the ball moves only when he changes the curve,
  // and the widest hooks stay on the boards. A faster ball carries more spin, so each step bends
  // about as much at every force.
  const centreSlope = (boardX(shot.aim) - target) / through;
  // The ball leaves from the board he chose on the foul line. A throw saved before he could
  // choose starts 5 boards towards the side of its hook for each curve step.
  const release = error?.release ?? (Number.isFinite(shot.start) ? boardX(shot.start) : shot.curve * 5 * board);
  const slope = centreSlope - release / through + (error?.offset ?? 0) / length;
  let gutter = 0;
  for (const p of path) {
    p.vx += slope * p.vz;
    p.x += release + slope * p.z;
    p.slipX += slope * p.slipZ;
    if (edges && (gutter || Math.abs(p.x) > width / 2)) {
      gutter ||= Math.sign(p.x);
      p.x = gutter * clamp(Math.abs(p.x), width / 2, width / 2 + gutterWidth / 2);
      p.gutter = true;
    }
  }
  return path;
}

// Where the ball meets the head pin row, or null when it is in the gutter before.
export function arrival(path) {
  const i = path.findIndex((p) => p.z >= length);
  if (i < 1 || path[i].gutter) return null;
  const a = path[i - 1],
    b = path[i];
  return a.x + ((b.x - a.x) * (length - a.z)) / (b.z - a.z);
}

// Nominal USBC tenpin diameter stations, converted from inches.
export const profile = [
  [0, 0],
  [2.031, 0],
  [2.22, 0.12],
  [2.828, 0.75],
  [3.906, 2.25],
  [4.51, 3.375],
  [4.766, 4.5],
  [4.563, 5.875],
  [3.703, 7.25],
  [2.472, 8.625],
  [1.965, 9.375],
  [1.797, 10],
  [1.87, 10.875],
  [2.094, 11.75],
  [2.406, 12.625],
  [2.547, 13.5],
  [2.4, 14],
  [1.85, 14.6],
  [0.8, 14.95],
  [0, 15]
].map(([diameter, height]) => [diameter * 0.0127, height * 0.0254]);

// Integrate the transverse and axial moments of the turned pin as thin disks.
// The belly carries more mass than the neck and head.
export const com = 0.145,
  pitFloor = -0.42,
  cushionZ = deckEnd + 0.51,
  wallX = width / 2 + gutterWidth,
  frameStep = 1 / 120;
const pinMass = 1.53,
  ballMass = 4.55,
  tipping = Math.PI / 12;
// JS engines may round transcendental functions differently by one last bit.
// Fix their precision at the boundary, before they enter the contact solver.
const stable = (value) => Math.round(value * 1e12) / 1e12 || 0;
// This axial density gradient puts the first moment of the disks at com.
const densitySlope = -0.265209;
function moments() {
  let mass = 0,
    transverse = 0,
    axial = 0;
  for (let i = 1; i < profile.length; i++) {
    const [r0, h0] = profile[i - 1],
      [r1, h1] = profile[i];
    for (let j = 0; j < 12; j++) {
      const t = (j + 0.5) / 12,
        h = h0 + t * (h1 - h0),
        r = r0 + t * (r1 - r0);
      const dm = ((r * r * (h1 - h0)) / 12) * Math.exp(densitySlope * h);
      mass += dm;
      transverse += dm * ((h - com) ** 2 + (r * r) / 4);
      axial += (dm * r * r) / 2;
    }
  }
  return [stable(mass / (transverse * pinMass)), stable(mass / (axial * pinMass))];
}
const [invTransverse, invAxial] = moments();
export const pinShape = [
  [0.034, 0.034],
  [0.082, 0.056],
  [0.1143, 0.0605],
  [0.149, 0.0565],
  [0.18, 0.046],
  [0.211, 0.033],
  [0.24, 0.024],
  [0.266, 0.0226],
  [0.294, 0.0255],
  [0.32, 0.03],
  [0.346, 0.0323],
  [0.36, 0.021]
];
function body(pin, ball = false) {
  const half = (pin.tilt || 0) / 2,
    heading = pin.heading || 0;
  const [qx, qy, qz, qw] = pin.q || [
    stable(Math.cos(heading) * Math.sin(half)),
    0,
    stable(-Math.sin(heading) * Math.sin(half)),
    stable(Math.cos(half))
  ];
  return {
    id: pin.id,
    x: pin.x,
    y: pin.y ?? com,
    z: pin.z,
    qx,
    qy,
    qz,
    qw,
    vx: 0,
    vy: 0,
    vz: 0,
    wx: 0,
    wy: 0,
    wz: 0,
    ux: 0,
    uy: 1,
    uz: 0,
    im: 1 / (ball ? ballMass : pinMass),
    it: ball ? 2.5 / (ballMass * radius ** 2) : invTransverse,
    diff: ball ? 0 : invAxial - invTransverse,
    spheres: (ball ? [[com, radius]] : pinShape).map(([h, r]) => ({ offset: h - com, r, x: 0, y: 0, z: 0 })),
    restX: pin.x,
    restY: pin.y ?? com,
    restZ: pin.z,
    restQx: qx,
    restQy: qy,
    restQz: qz,
    restQw: qw,
    still: 0,
    asleep: !ball && half === 0,
    quiet: 0,
    grounded: false,
    touching: false,
    support: null,
    ball,
    gutter: false
  };
}
function shape(b) {
  b.ux = 2 * (b.qx * b.qy - b.qw * b.qz);
  b.uy = 1 - 2 * (b.qx * b.qx + b.qz * b.qz);
  b.uz = 2 * (b.qy * b.qz + b.qw * b.qx);
  let xmin = Infinity,
    ymin = Infinity,
    zmin = Infinity;
  let xmax = -Infinity,
    ymax = -Infinity,
    zmax = -Infinity;
  for (const s of b.spheres) {
    s.x = b.x + b.ux * s.offset;
    s.y = b.y + b.uy * s.offset;
    s.z = b.z + b.uz * s.offset;
    xmin = Math.min(xmin, s.x - s.r);
    xmax = Math.max(xmax, s.x + s.r);
    ymin = Math.min(ymin, s.y - s.r);
    ymax = Math.max(ymax, s.y + s.r);
    zmin = Math.min(zmin, s.z - s.r);
    zmax = Math.max(zmax, s.z + s.r);
  }
  b.xmin = xmin;
  b.xmax = xmax;
  b.ymin = ymin;
  b.ymax = ymax;
  b.zmin = zmin;
  b.zmax = zmax;
}
function integrate(b, dt) {
  b.vy -= 9.81 * dt;
  b.x += b.vx * dt;
  b.y += b.vy * dt;
  b.z += b.vz * dt;
  const { qx, qy, qz, qw, wx, wy, wz } = b,
    h = dt / 2;
  const x = qx + h * (wx * qw + wy * qz - wz * qy),
    y = qy + h * (wy * qw + wz * qx - wx * qz),
    z = qz + h * (wz * qw + wx * qy - wy * qx),
    w = qw - h * (wx * qx + wy * qy + wz * qz);
  const inv = 1 / Math.sqrt(x * x + y * y + z * z + w * w);
  b.qx = x * inv;
  b.qy = y * inv;
  b.qz = z * inv;
  b.qw = w * inv;
  const oldX = b.ux,
    oldY = b.uy,
    oldZ = b.uz;
  shape(b);
  if (!b.ball) {
    const spin = (invTransverse / invAxial - 1) * (wx * oldX + wy * oldY + wz * oldZ);
    b.wx += spin * (oldX - b.ux);
    b.wy += spin * (oldY - b.uy);
    b.wz += spin * (oldZ - b.uz);
  }
}
// Angular effective mass at an offset from the centre, in world axes.
function effective(b, rx, ry, rz, nx, ny, nz) {
  const x = ry * nz - rz * ny,
    y = rz * nx - rx * nz,
    z = rx * ny - ry * nx;
  const along = x * b.ux + y * b.uy + z * b.uz;
  return b.im + b.it * (x * x + y * y + z * z) + b.diff * along * along;
}
function apply(b, rx, ry, rz, jx, jy, jz) {
  b.vx += jx * b.im;
  b.vy += jy * b.im;
  b.vz += jz * b.im;
  const x = ry * jz - rz * jy,
    y = rz * jx - rx * jz,
    z = rx * jy - ry * jx;
  const along = b.diff * (x * b.ux + y * b.uy + z * b.uz);
  b.wx += b.it * x + along * b.ux;
  b.wy += b.it * y + along * b.uy;
  b.wz += b.it * z + along * b.uz;
}
function velocity(c) {
  const { a, b, ax, ay, az, bx, by, bz } = c;
  c.dx = a.vx + a.wy * az - a.wz * ay;
  c.dy = a.vy + a.wz * ax - a.wx * az;
  c.dz = a.vz + a.wx * ay - a.wy * ax;
  if (b) {
    c.dx -= b.vx + b.wy * bz - b.wz * by;
    c.dy -= b.vy + b.wz * bx - b.wx * bz;
    c.dz -= b.vz + b.wx * by - b.wy * bx;
  }
}
function solve(c) {
  velocity(c);
  const { a, b, nx, ny, nz, dx, dy, dz } = c,
    vn = dx * nx + dy * ny + dz * nz;
  const next = Math.max(0, c.normal + (c.target - vn) * c.inverse),
    j = next - c.normal;
  c.normal = next;
  let tx = dx - vn * nx,
    ty = dy - vn * ny,
    tz = dz - vn * nz;
  const speed2 = tx * tx + ty * ty + tz * tz;
  if (speed2 > 1e-10) {
    const speed = Math.sqrt(speed2);
    tx /= speed;
    ty /= speed;
    tz /= speed;
    const mass =
      (a.asleep ? 0 : effective(a, c.ax, c.ay, c.az, tx, ty, tz)) +
      (b && !b.asleep ? effective(b, c.bx, c.by, c.bz, tx, ty, tz) : 0);
    tx = c.fx - (tx * speed) / mass;
    ty = c.fy - (ty * speed) / mass;
    tz = c.fz - (tz * speed) / mass;
    const limit = c.mu * next,
      magnitude = tx * tx + ty * ty + tz * tz;
    if (magnitude > limit * limit) {
      const scale = limit / Math.sqrt(magnitude);
      tx *= scale;
      ty *= scale;
      tz *= scale;
    }
    const ox = c.fx,
      oy = c.fy,
      oz = c.fz;
    c.fx = tx;
    c.fy = ty;
    c.fz = tz;
    tx -= ox;
    ty -= oy;
    tz -= oz;
  } else tx = ty = tz = 0;
  const jx = j * nx + tx,
    jy = j * ny + ty,
    jz = j * nz + tz;
  if (!a.asleep) apply(a, c.ax, c.ay, c.az, jx, jy, jz);
  if (b && !b.asleep) apply(b, c.bx, c.by, c.bz, -jx, -jy, -jz);
}
// Each block has two opposite corners, restitution and friction.
const blocks = [
  [-width / 2, pitFloor, -4, width / 2, 0, deckEnd, 0.35, 0.25],
  [-wallX, pitFloor, -4, -width / 2, -0.1, deckEnd, 0.18, 0.42],
  [width / 2, pitFloor, -4, wallX, -0.1, deckEnd, 0.18, 0.42],
  [-wallX - 0.12, -0.45, length - 0.46, -wallX, 1.0, cushionZ + 0.1, 0.45, 0.22],
  [wallX, -0.45, length - 0.46, wallX + 0.12, 1.0, cushionZ + 0.1, 0.45, 0.22],
  [-wallX - 0.12, pitFloor, cushionZ, wallX + 0.12, 1.7, cushionZ + 0.15, 0.08, 0.65]
].map(([xmin, ymin, zmin, xmax, ymax, zmax, restitution, friction]) => ({
  xmin,
  ymin,
  zmin,
  xmax,
  ymax,
  zmax,
  restitution,
  friction
}));
function pose(b) {
  return {
    id: b.id,
    x: b.x,
    y: b.y,
    z: b.z,
    q: [b.qx, b.qy, b.qz, b.qw],
    tilt: stable(Math.acos(clamp(b.uy, -1, 1))),
    heading: stable(Math.atan2(b.ux, b.uz))
  };
}
export function simulate(pins, shot, level, record = false, hz = 480, audit = null) {
  let state = shot.seed ?? Math.round((pins[0]?.x ?? 0) * 1e9) >>> 0;
  const normal = () => {
    let n = -3;
    for (let i = 0; i < 6; i++) {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      n += state / 4294967296;
    }
    return n * Math.SQRT2;
  };
  const error = { offset: normal() * board * 0.6, speed: normal() * 0.12, angle: normal() * 0.00524 };
  error.release = trajectory(shot, level)[0].x;
  const path = trajectory(shot, level, length, true, error),
    front = Math.min(length, ...pins.map((p) => p.z));
  const start = path.findIndex((p) => p.z >= front - 0.28),
    entry = path[start];
  const ball = body({ ...entry, id: 0, y: radius }, true),
    bodies = [ball, ...pins.map((p) => body(p))];
  function follow(p) {
    ball.x = p.x;
    ball.z = p.z;
    ball.y = radius - (p.gutter ? 0.085 : 0);
    ball.vx = p.vx;
    ball.vz = p.vz;
    ball.wx = (p.vz - p.slipZ) / radius;
    ball.wz = (p.slipX - p.vx) / radius;
    ball.wy = shot.curve * -8;
    ball.qx = stable(Math.sin(p.z / (2 * radius)));
    ball.qw = stable(Math.cos(p.z / (2 * radius)));
    ball.gutter = !!p.gutter;
  }
  follow(entry);
  bodies.forEach(shape);
  const frames = [],
    pool = [];
  let count = 0,
    free = true;
  // Time is counted in 1/1920 s ticks. Keep the recording clock independent of substeps.
  let dt,
    tick = 0;
  // Each pin has 256 static contact keys. The next range indexes body pairs.
  const pairBase = 11 * 256;
  const cache = Array(pairBase + 121).fill(null);
  function contact(a, b, x, y, z, nx, ny, nz, depth, e, mu, key) {
    a.touching = true;
    if (b) b.touching = true;
    const c = (pool[count] ||= {});
    count++;
    c.a = a;
    c.b = b;
    c.nx = nx;
    c.ny = ny;
    c.nz = nz;
    c.mu = mu;
    c.ax = x - a.x;
    c.ay = y - a.y;
    c.az = z - a.z;
    c.bx = b ? x - b.x : 0;
    c.by = b ? y - b.y : 0;
    c.bz = b ? z - b.z : 0;
    velocity(c);
    const vn = c.dx * nx + c.dy * ny + c.dz * nz;
    const previous = cache[key];
    const persists = previous?.end === tick && previous.nx * nx + previous.ny * ny + previous.nz * nz > 0.9;
    c.approach = vn;
    c.target = previous?.end !== tick && vn < -0.32 ? -vn * e : 0;
    c.normal = persists && previous.resting ? (previous.normal * dt) / previous.dt : 0;
    c.fx = c.fy = c.fz = 0;
    c.key = key;
    c.depth = depth;
    if (b) {
      a.support = b;
      b.support = a;
      if (vn < -0.015 || depth > 0.0005) {
        if (a.asleep) a.quiet = a.still = 0;
        if (b.asleep) b.quiet = b.still = 0;
        a.asleep = b.asleep = false;
      }
    }
    c.inverse =
      1 /
      ((a.asleep ? 0 : effective(a, c.ax, c.ay, c.az, nx, ny, nz)) +
        (b && !b.asleep ? effective(b, c.bx, c.by, c.bz, nx, ny, nz) : 0));
  }
  const candidates = [];
  const deepest = new Array(blocks.length + 1);
  const surfaceEnd = new Int32Array(11 * 7).fill(-1);
  function environment(a) {
    const first = count;
    candidates.length = 0;

    for (let j = 0; j < blocks.length; j++) {
      const box = blocks[j];
      if (
        a.xmax > box.xmin &&
        a.xmin < box.xmax &&
        a.ymax > box.ymin &&
        a.ymin < box.ymax &&
        a.zmax > box.zmin &&
        a.zmin < box.zmax
      )
        candidates.push(j);
    }
    const base = a.id * 256;
    for (let i = 0; i < a.spheres.length; i++) {
      const s = a.spheres[i],
        key = base + 12 * i;
      if (s.y - s.r < pitFloor) {
        contact(a, null, s.x, pitFloor, s.z, 0, 1, 0, pitFloor - s.y + s.r, 0.12, 0.65, key);
        a.grounded = true;
      }
      for (const j of candidates) {
        const box = blocks[j];
        if (
          s.x + s.r <= box.xmin ||
          s.x - s.r >= box.xmax ||
          s.z + s.r <= box.zmin ||
          s.z - s.r >= box.zmax ||
          s.y - s.r >= box.ymax ||
          s.y + s.r <= box.ymin
        )
          continue;
        const x = clamp(s.x, box.xmin, box.xmax),
          y = clamp(s.y, box.ymin, box.ymax),
          z = clamp(s.z, box.zmin, box.zmax);
        const dx = s.x - x,
          dy = s.y - y,
          dz = s.z - z,
          d2 = dx * dx + dy * dy + dz * dz;
        if (d2 >= s.r * s.r) continue;
        // Centres normally stay outside the solid. A very fast impact can cross
        // a face in one step. Use the nearest face to recover its normal.
        if (d2 === 0) {
          const gaps = [s.x - box.xmin, box.xmax - s.x, s.y - box.ymin, box.ymax - s.y, s.z - box.zmin, box.zmax - s.z];
          const gap = Math.min(...gaps),
            face = gaps.indexOf(gap);
          const nx = Number(face === 1) - Number(face === 0),
            ny = Number(face === 3) - Number(face === 2),
            nz = Number(face === 5) - Number(face === 4);
          contact(
            a,
            null,
            x + nx * gap,
            y + ny * gap,
            z + nz * gap,
            nx,
            ny,
            nz,
            s.r + gap,
            box.restitution,
            box.friction,
            key + 1 + j
          );
          if (ny > 0) a.grounded = true;
          continue;
        }
        const d = Math.sqrt(d2);
        contact(
          a,
          null,
          x,
          y,
          z,
          dx / d,
          dy / d,
          dz / d,
          s.r - d,
          box.restitution,
          a.ball && j === 0 ? 0.2 : box.friction,
          key + 1 + j
        );
        if (dy / d > 0.4) a.grounded = true;
      }
    }
    // The lowest point of the flat circular foot supplies the restoring moment
    // during a wobble. At vertical, opposite rim contacts support the base.
    if (!a.ball && a.uy > 0.65 && a.y < com + 0.035 && a.z <= deckEnd && Math.abs(a.x) <= width / 2) {
      const lateral = Math.sqrt(a.ux * a.ux + a.uz * a.uz);
      for (let side = -1; side <= 1; side += 2) {
        const r = profile[1][0] * side;
        const x = a.x - com * a.ux + (lateral ? (r * a.uy * a.ux) / lateral : r);
        const z = a.z - com * a.uz + (lateral ? (r * a.uy * a.uz) / lateral : 0);
        const y = a.y - com * a.uy - r * lateral;
        if (y < 0) {
          contact(a, null, x, y, z, 0, 1, 0, -y, 0.05, 0.27, base + 200 + side);
          // The rim touches over an arc at small tilt. Its two ends oppose
          // precession when the pin rocks on a loaded foot.
          const cos30 = 0.866025403784;
          const arcY = a.y - com * a.uy - r * lateral * cos30;
          if (side === 1 && lateral > 1e-8 && arcY < 0) {
            for (const end of [-0.5, 0.5]) {
              const arcX = a.x - com * a.ux + (r * (cos30 * a.uy * a.ux - end * a.uz)) / lateral;
              const arcZ = a.z - com * a.uz + (r * (cos30 * a.uy * a.uz + end * a.ux)) / lateral;
              contact(a, null, arcX, arcY, arcZ, 0, 1, 0, -arcY, 0.05, 0.27, base + 204 + 2 * end);
            }
          }
          a.grounded = true;
        }
      }
    }
    // The foot and the neighbouring spheres form one manifold on each surface.
    // Only its deepest contact may bounce or project the body out of the surface.
    if (count === first) return;
    deepest.fill(null);
    for (let j = first; j < count; j++) {
      const c = pool[j],
        feature = c.key - base,
        face = feature >= 190 ? 1 : feature % 12;
      if (deepest[face] && deepest[face].depth >= c.depth) {
        c.target = c.depth = 0;
      } else {
        if (deepest[face]) deepest[face].target = deepest[face].depth = 0;
        deepest[face] = c;
      }
    }
    for (let face = 0; face < deepest.length; face++) {
      if (!deepest[face]) continue;
      if (surfaceEnd[a.id * 7 + face] === tick) deepest[face].target = 0;
      surfaceEnd[a.id * 7 + face] = tick + Math.round(dt * 1920);
    }
  }
  function saveFrame() {
    const p = pose(ball);
    let energy = 0;
    for (const b of bodies) {
      const axial = b.wx * b.ux + b.wy * b.uy + b.wz * b.uz;
      const angular = b.wx * b.wx + b.wy * b.wy + b.wz * b.wz;
      energy +=
        (9.81 * (b.y - pitFloor) + (b.vx * b.vx + b.vy * b.vy + b.vz * b.vz) / 2) / b.im +
        (angular - axial * axial) / (2 * b.it) +
        (axial * axial) / (2 * (b.it + b.diff));
    }
    frames.push({ ball: { ...p, gutter: ball.gutter }, pins: bodies.slice(1).map(pose), energy });
  }
  if (record) saveFrame();
  while (tick < 20 * 1920) {
    let ticks = hz === 1920 ? 1 : Math.min(4, 16 - (tick % 16));
    if (ticks > 1) {
      near: for (const a of bodies) {
        if (a.asleep || a.vx * a.vx + a.vy * a.vy + a.vz * a.vz < 1) continue;
        for (const b of bodies) {
          if (a !== b && (a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2 < 0.25) {
            ticks = 1;
            break near;
          }
        }
      }
    }
    dt = ticks / 1920;
    count = 0;
    if (free) {
      const u = start + (tick + ticks) / 1920 / step,
        lo = Math.floor(u),
        p = path[lo],
        next = path[lo + 1];
      if (next && p.z <= deckEnd) {
        const t = u - lo;
        follow({
          x: p.x + t * (next.x - p.x),
          z: p.z + t * (next.z - p.z),
          vx: p.vx + t * (next.vx - p.vx),
          vz: p.vz + t * (next.vz - p.vz),
          slipX: p.slipX + t * (next.slipX - p.slipX),
          slipZ: p.slipZ + t * (next.slipZ - p.slipZ),
          gutter: p.gutter
        });
        shape(ball);
      } else free = false;
    }
    for (const b of bodies) {
      if (b.asleep && b.support && !b.support.asleep && b.uy < 0.9998477 && b.uy > 0.173648) {
        b.asleep = false;
        b.quiet = 0;
      }
      if (b.asleep || (b.ball && free)) continue;
      b.touching = b.grounded = false;
      b.support = null;
      integrate(b, dt);
      environment(b);
    }
    for (let j = 1; j < bodies.length; j++) {
      const a = bodies[j];
      for (let k = 0; k < j; k++) {
        const b = bodies[k];
        if (
          (a.asleep && b.asleep) ||
          (b.ball && b.gutter) ||
          a.xmin > b.xmax ||
          a.xmax < b.xmin ||
          a.zmin > b.zmax ||
          a.zmax < b.zmin ||
          a.ymin > b.ymax ||
          a.ymax < b.ymin
        )
          continue;
        let best = 0,
          sa,
          sb,
          distance;
        for (let si = 0; si < a.spheres.length; si++) {
          const s = a.spheres[si];
          if (
            s.x - s.r > b.xmax ||
            s.x + s.r < b.xmin ||
            s.z - s.r > b.zmax ||
            s.z + s.r < b.zmin ||
            s.y - s.r > b.ymax ||
            s.y + s.r < b.ymin
          )
            continue;
          for (let ti = 0; ti < b.spheres.length; ti++) {
            const t = b.spheres[ti];
            const dx = s.x - t.x,
              dy = s.y - t.y,
              dz = s.z - t.z,
              r = s.r + t.r,
              d2 = dx * dx + dy * dy + dz * dz;
            if (d2 >= r * r || d2 < 1e-12) continue;
            const d = Math.sqrt(d2);
            if (r - d > best) {
              best = r - d;
              distance = d;
              sa = s;
              sb = t;
            }
          }
        }
        if (best > 0) {
          const nx = (sa.x - sb.x) / distance,
            ny = (sa.y - sb.y) / distance,
            nz = (sa.z - sb.z) / distance;
          contact(
            a,
            b,
            sa.x - sa.r * nx,
            sa.y - sa.r * ny,
            sa.z - sa.r * nz,
            nx,
            ny,
            nz,
            best,
            b.ball ? 0.67 : 0.45,
            b.ball ? 0.07 : 0.06,
            pairBase + a.id * 11 + b.id
          );
          if (b.ball) free = false;
        }
      }
    }
    for (let j = 0; j < count; j++) {
      const c = pool[j],
        n = c.normal;
      if (!n) continue;
      if (!c.a.asleep) apply(c.a, c.ax, c.ay, c.az, n * c.nx, n * c.ny, n * c.nz);
      if (c.b && !c.b.asleep) apply(c.b, c.bx, c.by, c.bz, -n * c.nx, -n * c.ny, -n * c.nz);
    }
    for (let pass = 0; pass < 8; pass++) for (let j = 0; j < count; j++) solve(pool[j]);
    for (let j = 0; j < count; j++) {
      const c = pool[j],
        { a, b, nx, ny, nz } = c;
      if (audit && b) {
        audit.maxDepth = Math.max(audit.maxDepth ?? 0, c.depth);
        if (c.target > 0) {
          velocity(c);
          audit.impacts.push({
            a: a.id,
            b: b.id,
            approach: -c.approach,
            target: c.target,
            separation: c.dx * nx + c.dy * ny + c.dz * nz
          });
        }
      }
      const memo = (cache[c.key] ||= {});
      memo.normal = c.normal;
      memo.resting = c.target === 0;
      memo.nx = nx;
      memo.ny = ny;
      memo.nz = nz;
      memo.end = tick + ticks;
      memo.dt = dt;
      // Project the overlap apart without adding momentum.
      const shift = Math.max(0, c.depth - 0.00015) * 0.6;
      if (!shift) continue;
      const ia = a.asleep ? 0 : a.im,
        ib = b && !b.asleep ? b.im : 0;
      const correction = shift / (ia + ib);
      a.x += ia * correction * nx;
      a.y += ia * correction * ny;
      a.z += ia * correction * nz;
      if (b) {
        b.x -= ib * correction * nx;
        b.y -= ib * correction * ny;
        b.z -= ib * correction * nz;
      }
    }
    for (const b of bodies) {
      if (b.asleep || !b.touching) continue;
      const pit = b.z > deckEnd || Math.abs(b.x) > width / 2;
      if (pit && b.grounded) {
        const damping = 1 - dt * 10;
        b.wx *= damping;
        b.wy *= damping;
        b.wz *= damping;
        b.vx *= damping;
        b.vz *= damping;
      } else if (!b.ball && b.grounded && b.uy < 0.174) {
        const spin = Math.sqrt(b.wx * b.wx + b.wy * b.wy + b.wz * b.wz);
        const resistance = Math.max(0, 1 - (0.02 * b.it * dt) / Math.max(spin, 1e-8));
        b.wx *= resistance;
        b.wy *= resistance;
        b.wz *= resistance;
      }
      const dot = b.qx * b.restQx + b.qy * b.restQy + b.qz * b.restQz + b.qw * b.restQw;
      const drift = (b.x - b.restX) ** 2 + (b.y - b.restY) ** 2 + (b.z - b.restZ) ** 2;
      if (drift > 0.007 ** 2 || Math.abs(dot) < (pit ? 0.992 : 0.999)) {
        b.restX = b.x;
        b.restY = b.y;
        b.restZ = b.z;
        b.restQx = b.qx;
        b.restQy = b.qy;
        b.restQz = b.qz;
        b.restQw = b.qw;
        b.still = 0;
      } else b.still += ticks;
      if (
        b.vx * b.vx + b.vy * b.vy + b.vz * b.vz < 0.004 &&
        b.wx * b.wx + b.wy * b.wy + b.wz * b.wz < (pit ? 1.8 : 0.16)
      )
        b.quiet += ticks;
      else b.quiet = 0;
      if (
        (pit && b.still >= 384) ||
        (b.quiet >= 80 && (pit || b.ball || b.uy > 0.9998477 || b.uy < 0.173648 || b.support?.asleep))
      ) {
        b.asleep = true;
        b.vx = b.vy = b.vz = b.wx = b.wy = b.wz = 0;
      }
    }
    tick += ticks;
    if (record && tick % 16 === 0) saveFrame();
    if (!free && tick % 16 === 0 && bodies.every((b) => b.asleep)) break;
  }
  const standing = bodies
    .slice(1)
    .filter((p) => p.uy > Math.cos(tipping) && Math.abs(p.x) <= width / 2 && p.z <= deckEnd && p.z >= length - 0.4)
    .map(({ id, x, z }) => ({ id, x, z, tilt: 0, heading: 0 }));
  return {
    standing,
    count: pins.length - standing.length,
    gutter: ball.gutter,
    ...(record && { path: path.slice(0, start + 1), frames, impact: entry.t, sleeping: bodies.every((b) => b.asleep) })
  };
}

export function score(counts) {
  const frames = [];
  let offset = 0,
    total = 0,
    next = 0,
    roll = 0,
    freshRack = true;
  for (let i = 0; i < 10; i++) {
    const first = counts[offset],
      second = counts[offset + 1];
    const tenth = i === 9;
    const size = tenth ? (first === 10 || first + second === 10 ? 3 : 2) : first === 10 ? 1 : 2;
    const hits = counts.slice(offset, offset + size);
    const marks = [];
    let left = 10;
    for (const n of hits) {
      marks.push(n === 10 && (!marks.length || ['X', '/'].includes(marks.at(-1))) ? 'X' : n === left ? '/' : n || '−');
      left -= n;
      if (!left) left = 10;
    }
    const complete = hits.length === size;
    let pts = null;
    if (complete) {
      const required = !tenth && (first === 10 || first + second === 10) ? 3 : size;
      const bonus = counts.slice(offset, offset + required);
      if (bonus.length === required) pts = bonus.reduce((a, b) => a + b, 0);
      offset += size;
      next = i + 1;
    } else if (next === i) {
      roll = hits.length;
      freshRack = !hits.length || ['X', '/'].includes(marks.at(-1));
    }
    total += pts ?? hits.reduce((sum, n) => sum + n, 0);
    frames.push({ hits, marks, total: pts === null ? null : total });
    if (!complete) offset = counts.length;
  }
  return { frames, total, next, roll, freshRack, done: next === 10 };
}
export const sheet = (g) => score(g.throws.map((t) => t.count));
export function fresh(level, wins, seed) {
  if (!Object.hasOwn(goals, level)) level = 'facile';
  return {
    v: 1,
    level,
    goal: goals[level],
    wins: Number.isSafeInteger(wins) && wins > 0 ? wins : 0,
    seed,
    throws: []
  };
}
export function pinsFor(g) {
  const s = sheet(g);
  if (s.done) return g.throws.at(-1).standing;
  if (s.freshRack) return rack(g.seed + Math.imul(g.throws.length, 0x9e3779b1));
  return g.throws.at(-1).standing.map(({ id, x, z }) => ({ id, x, z, tilt: 0, heading: 0 }));
}
const throwSeed = (g) => (g.seed + Math.imul(g.throws.length + 1, 0x85ebca6b)) >>> 0;
export function play(g, shot, record = false) {
  if (sheet(g).done) return null;
  const { start, aim, speed, curve } = shot;
  const seed = throwSeed(g);
  const result = simulate(pinsFor(g), { ...shot, seed }, g.level, record);
  g.throws.push({ ...(Number.isFinite(start) && { start }), aim, speed, curve, seed, count: result.count, standing: result.standing });
  const s = sheet(g);
  if (s.done && s.total >= g.goal) g.wins++;
  return result;
}
export function undo(g) {
  if (!g.throws.length) return false;
  const s = sheet(g);
  if (s.done && s.total >= g.goal) g.wins--;
  g.throws.pop();
  return true;
}
export function restore(raw, seed) {
  const reset = fresh(raw?.level, raw?.wins, seed);
  if (
    raw?.v !== 1 ||
    raw.level !== reset.level ||
    raw.wins !== reset.wins ||
    !Number.isInteger(raw.seed) ||
    raw.seed < 0 ||
    raw.seed > 0xffffffff ||
    !Array.isArray(raw.throws) ||
    raw.throws.length > 21
  )
    return reset;
  // Keep the goal and pin positions recorded under earlier rules.
  const oldGoal = { facile: 105, moyen: 120, fort: 140 }[raw.level];
  const goal = raw.goal ?? oldGoal;
  const previousGoal = { facile: 100, moyen: 120, fort: 145 }[raw.level];
  if (![oldGoal, previousGoal, { facile: 130, moyen: 150, fort: 170 }[raw.level], reset.goal].includes(goal))
    return reset;
  const g = { ...reset, goal, seed: raw.seed, throws: [] };
  if (raw.reported === true) g.reported = true;
  for (const t of raw.throws) {
    const pins = pinsFor(g);
    const curve = t && (Object.hasOwn(t, 'curve') ? t.curve : { none: 0, left: -2, right: 2 }[t.spin]);
    if (
      sheet(g).done ||
      !t ||
      (t.seed !== undefined && t.seed !== throwSeed(g)) ||
      (t.start !== undefined && (!Number.isFinite(t.start) || t.start < 1 || t.start > 39)) ||
      !Number.isFinite(t.aim) ||
      t.aim < -5 ||
      t.aim > 45 ||
      !Number.isInteger(t.speed) ||
      t.speed < 1 ||
      t.speed > 10 ||
      !Number.isInteger(curve) ||
      Math.abs(curve) > 3 ||
      !Number.isInteger(t.count) ||
      t.count < 0 ||
      !Array.isArray(t.standing) ||
      t.count + t.standing.length !== pins.length
    )
      return reset;
    const ids = new Set(pins.map((p) => p.id));
    for (const p of t.standing) {
      if (
        !p ||
        !ids.delete(p.id) ||
        ![p.x, p.z, p.heading, p.tilt].every(Number.isFinite) ||
        (p.q !== undefined &&
          (!Array.isArray(p.q) ||
            p.q.length !== 4 ||
            !p.q.every(Number.isFinite) ||
            Math.abs(Math.hypot(...p.q) - 1) > 1e-5 ||
            Math.abs(1 - 2 * (p.q[0] ** 2 + p.q[2] ** 2) - Math.cos(p.tilt)) > 1e-5)) ||
        (p.y !== undefined && (!Number.isFinite(p.y) || p.y < 0.1 || p.y > 0.4)) ||
        Math.abs(p.x) > width / 2 ||
        p.z < length - 0.4 ||
        p.z > deckEnd ||
        p.tilt < 0 ||
        p.tilt >= tipping
      )
        return reset;
    }
    g.throws.push({
      ...(t.start !== undefined && { start: t.start }),
      aim: t.aim,
      speed: t.speed,
      curve,
      ...(t.seed !== undefined && { seed: t.seed }),
      count: t.count,
      standing: t.standing
    });
  }
  if (sheet(g).done && sheet(g).total >= g.goal && !g.wins) return reset;
  return g;
}
export function hint(g) {
  const pins = pinsFor(g),
    full = pins.length === 10;
  let best = null,
    most = -1;
  const targets = full
    ? [22.5, 22.25, 22, 23, 21.875, 17.5, 18]
    : pins.flatMap((p) => [boardAt((p.x * length) / p.z), boardAt((p.x * length) / p.z + 0.04)]);
  let attempts = 0;
  search: for (const speed of [7, 6, 9]) {
    for (const strength of full ? [2, 1, 3, 0, -1] : [0, 1, -1, 2, -2]) {
      for (const aim of targets) {
        const curve = strength * (aim > 20 ? -1 : 1),
          start = 20 + curve * 5;
        const count = simulate(pins, { start, aim, speed, curve, seed: throwSeed(g) }, g.level).count;
        if (count > most) {
          most = count;
          best = { start, aim, speed, curve };
        }
        if (++attempts >= 18 || count === pins.length) break search;
      }
    }
  }
  const nearest = [...pins].sort((a, b) => Math.abs(a.x - boardX(best.aim)) - Math.abs(b.x - boardX(best.aim)))[0];
  const reason = full
    ? 'Visez la poche, entre la quille 1 et la quille ' +
      (best.aim > 20 ? '3' : '2') +
      (best.curve ? ', avec une courbe vers la ' + (best.curve < 0 ? 'gauche.' : 'droite.') : ', tout droit.')
    : 'Visez la quille ' +
      nearest.id +
      (pins.length === 1 ? ' : elle est seule.' : ' pour faire tomber les quilles restantes.');
  return { ...best, reason };
}
