// Miniature golf: holes built from a seed, the ball's physics, the solver and the saves. No DOM, so the page
// and the Node tests run the same code, and the dotted preview is the real shot.
//
// Metres and seconds, on the ground plane x, z. A hole is plain data:
//   spine     the centre line of the lane, [x, z, width] per joint; the lane is this line with its width
//   outline   the lane's border, a closed polygon; the ball stays inside it
//   regions   closed shapes inside the lane the ball cannot enter: stone, water, flowers, mill
//   bumpers   round posts, bumps (hills and dips), ramp (a raised green), mill (turning sails)
//   parts     what the scene draws for each obstacle: bridge, tunnel, gate, mill, bank
//   tee, cup, par, name
// A shot is a target point: the ball leaves towards it with the pace that stops it there on flat open
// ground. Every stroke starts the mill's clock at zero, so a shot replays the same way.
export const radius = 0.12,
  dt = 1 / 60;
export const levels = ['facile', 'moyen', 'fort'];
const ROLL = 1.1, // rolling friction, m/s²
  // A slow ball meets less friction, as on a real carpet: it rests only on a slope gentler than about 3°,
  // and a ball that stops on the side of a hill or a ramp rolls back down.
  SLOW = 0.3, // m/s
  REST = 0.35, // m/s², the friction under SLOW
  SLOPE = 6, // pull of a slope, m/s² per unit of gradient
  STEP = 0.05, // longest move in one sub-step, well under the ball's radius
  STEPS = 25 / dt,
  REACH = 24,
  CELL = 0.5,
  SLIP_A = 0.03, // the solver’s idea of a slip of the hand: 1.7° of aim and 10% of length
  SLIP_D = 0.1,
  // The cup. A ball that hangs over the rim tips towards the hole: a pull of up to LIP m/s² towards the
  // middle, strongest when half the ball is over the edge. A ball whose centre is over the hole falls;
  // it drops in when it reaches the far wall low enough, so the longer its way across the hole, the
  // faster it may go. A ball that crosses anyway loses some pace on the far lip.
  LIP = 5,
  FALL = Math.sqrt(9.8 / (2 * radius)),
  LIP_LOSS = 0.8;

export const LEVEL = {
  facile: { slip: [0.07, 0.24], width: [2.7, 3.1], cup: 0.36, catch: 1.15, bend: [18, 30], ramp: 0.18, bridge: 1.3, tunnel: 1.1, gate: 1, mill: 1, bumpers: [1, 2] },
  moyen: { slip: [0.05, 0.17], width: [2.2, 2.6], cup: 0.29, catch: 0.95, bend: [28, 42], ramp: 0.26, bridge: 1, tunnel: 0.85, gate: 0.8, mill: 0.8, bumpers: [2, 3] },
  fort: { slip: [0.035, 0.12], width: [1.85, 2.2], cup: 0.24, catch: 0.8, bend: [34, 48], ramp: 0.32, bridge: 0.85, tunnel: 0.72, gate: 0.6, mill: 0.66, bumpers: [3, 3] }
};
// Hole types: a lane shape and the obstacles on it. The level picks the pool; the first hole is gentle and
// the last one is the showpiece.
const T = (id, shape, ...features) => ({ id, shape, features });
const POOLS = {
  facile: {
    opener: [T('droit', 'straight')],
    middle: [T('champignons', 'straight', 'bumpers'), T('green', 'wide'), T('virage', 'dogleg'), T('terrasse', 'straight', 'ramp'), T('portillon-large', 'long', 'gate'), T('virage-champignons', 'dogleg', 'bumpers'), T('green-champignons', 'wide', 'bumpers')],
    finale: [T('grand-pont', 'bigdog', 'bridge')]
  },
  moyen: {
    opener: [T('green', 'wide'), T('droit', 'straight')],
    middle: [T('equerre', 'ell', 'bank'), T('colline', 'dogleg', 'hill'), T('cuvette', 'straight', 'dip'), T('tunnel', 'long', 'tunnel'), T('terrasse', 'dogleg', 'ramp'), T('champignons', 'wide', 'bumpers'), T('pont', 'long', 'bridge'), T('virage', 'dogleg', 'bank')],
    finale: [T('grande-terrasse', 'long', 'tunnel', 'ramp')]
  },
  fort: {
    opener: [T('virage', 'dogleg')],
    middle: [T('lacets', 'ess', 'bank'), T('portillon', 'long', 'gate'), T('equerre', 'ell', 'bank'), T('colline', 'dogleg', 'hill'), T('tunnel', 'dogleg', 'tunnel'), T('cuvette', 'long', 'dip', 'bumpers'), T('terrasse', 'straight', 'ramp'), T('lacets-portillon', 'ess', 'gate')],
    finale: [T('moulin', 'straight', 'mill')]
  }
};

// A small seeded random generator (mulberry32), as in the démineur: the same seed gives the same course.
export function random(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const point = (x, z) => ({ x, z });

// ---------- Geometry ----------
function inside(pts, x, z) {
  let hit = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, zi] = pts[i],
      [xj, zj] = pts[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) hit = !hit;
  }
  return hit;
}
function segDistance(ax, az, bx, bz, x, z) {
  const ex = bx - ax,
    ez = bz - az,
    t = clamp(((x - ax) * ex + (z - az) * ez) / (ex * ex + ez * ez || 1), 0, 1);
  return Math.hypot(x - ax - t * ex, z - az - t * ez);
}
// The lane's two borders from its centre line, with mitred corners.
export function borders(spine) {
  const left = [],
    right = [];
  for (let i = 0; i < spine.length; i++) {
    const [x, z, w] = spine[i];
    const dir = (a, b) => {
      const dx = b[0] - a[0],
        dz = b[1] - a[1],
        l = Math.hypot(dx, dz);
      return [dx / l, dz / l];
    };
    const d0 = i > 0 ? dir(spine[i - 1], spine[i]) : dir(spine[0], spine[1]);
    const d1 = i < spine.length - 1 ? dir(spine[i], spine[i + 1]) : d0;
    let mx = -d0[1] - d1[1],
      mz = d0[0] + d1[0];
    const ml = Math.hypot(mx, mz);
    mx /= ml;
    mz /= ml;
    const len = w / 2 / (mx * -d1[1] + mz * d1[0]);
    left.push([x + mx * len, z + mz * len]);
    right.push([x - mx * len, z - mz * len]);
  }
  return { left, right };
}
// Where the ball may be: inside the lane and outside every region.
export function free(h, x, z) {
  if (!inside(h.outline, x, z)) return false;
  for (const r of h.regions) if (inside(r.pts, x, z)) return false;
  return true;
}

// ---------- Terrain: hills and dips are cosine bumps; a ramp lifts the green ----------
export function height(h, x, z) {
  let y = 0;
  for (const b of h.bumps) {
    const d = Math.hypot(x - b.x, z - b.z);
    if (d < b.r) y += (b.h * (1 + Math.cos((Math.PI * d) / b.r))) / 2;
  }
  const r = h.ramp;
  if (r) {
    const s = ((x - r.x) * r.dx + (z - r.z) * r.dz) / r.len;
    if (s >= 1) y += r.h;
    else if (s > 0) y += r.h * s * s * (3 - 2 * s);
  }
  return y;
}
function slope(h, x, z, out) {
  let gx = 0,
    gz = 0;
  for (const b of h.bumps) {
    const dx = x - b.x,
      dz = z - b.z,
      d = Math.hypot(dx, dz);
    if (d < b.r && d > 1e-9) {
      const k = (-b.h * Math.PI * Math.sin((Math.PI * d) / b.r)) / (2 * b.r * d);
      gx += k * dx;
      gz += k * dz;
    }
  }
  const r = h.ramp;
  if (r) {
    const s = ((x - r.x) * r.dx + (z - r.z) * r.dz) / r.len;
    if (s > 0 && s < 1) {
      const k = (r.h * 6 * s * (1 - s)) / r.len;
      gx += k * r.dx;
      gz += k * r.dz;
    }
  }
  out[0] = gx;
  out[1] = gz;
}

// ---------- The mill: four sails turn in front of the gate in its base ----------
export const millAngle = (m, t) => m.phase + m.speed * t;
// True when a sail covers the lateral position v (from the gate's centre line) at time t.
function sailBlocks(m, v, t) {
  for (let k = 0; k < 4; k++) {
    const a = millAngle(m, t) + (k * Math.PI) / 2,
      c = Math.cos(a);
    // A sail that points down reaches the ball's height; its edge widens as it leans.
    if (c <= 0 || m.hub - m.sail * c > 2 * radius) continue;
    const lateral = (m.hub - radius) * Math.tan(a);
    if (Math.abs(v - lateral) < m.width / 2 / c + radius) return true;
  }
  return false;
}

// ---------- Collision data, built once per hole ----------
const prepared = new WeakMap();
function prepare(h) {
  let P = prepared.get(h);
  if (P) return P;
  const segs = [];
  const add = (pts, bounce) => {
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i],
        b = pts[(i + 1) % pts.length];
      segs.push({ ax: a[0], az: a[1], bx: b[0], bz: b[1], bounce });
    }
  };
  add(h.outline, 0.78);
  for (const r of h.regions) add(r.pts, r.kind === 'water' ? 0.6 : 0.7);
  let x0 = Infinity,
    z0 = Infinity,
    x1 = -Infinity,
    z1 = -Infinity;
  for (const [x, z] of h.outline) {
    x0 = Math.min(x0, x);
    z0 = Math.min(z0, z);
    x1 = Math.max(x1, x);
    z1 = Math.max(z1, z);
  }
  const cols = Math.ceil((x1 - x0) / CELL) + 1,
    rows = Math.ceil((z1 - z0) / CELL) + 1,
    grid = Array.from({ length: cols * rows }, () => []);
  const reach = radius + 0.06;
  const mark = (ax, az, bx, bz, item) => {
    const c0 = Math.max(0, Math.floor((Math.min(ax, bx) - reach - x0) / CELL)),
      c1 = Math.min(cols - 1, Math.floor((Math.max(ax, bx) + reach - x0) / CELL)),
      r0 = Math.max(0, Math.floor((Math.min(az, bz) - reach - z0) / CELL)),
      r1 = Math.min(rows - 1, Math.floor((Math.max(az, bz) + reach - z0) / CELL));
    for (let r = r0; r <= r1; r++)
      for (let c = c0; c <= c1; c++) {
        // Only cells the segment passes near.
        const cx = x0 + (c + 0.5) * CELL,
          cz = z0 + (r + 0.5) * CELL;
        if (segDistance(ax, az, bx, bz, cx, cz) <= reach + CELL * 0.75) grid[r * cols + c].push(item);
      }
  };
  for (const s of segs) mark(s.ax, s.az, s.bx, s.bz, s);
  for (const b of h.bumpers) mark(b.x - b.r, b.z - b.r, b.x + b.r, b.z + b.r, b);
  P = { grid, cols, rows, x0, z0, geo: null };
  prepared.set(h, P);
  return P;
}

// ---------- The shot ----------
// The pace that stops the ball after len metres on flat open ground: ROLL until SLOW, then REST.
function pace(len) {
  const tail = (SLOW * SLOW) / (2 * REST);
  return len <= tail ? Math.sqrt(2 * REST * len) : Math.sqrt(2 * ROLL * (len - tail) + SLOW * SLOW);
}
// The fixed-step simulation. With record, path holds the ball's place at each step of dt.
export function simulate(h, start, target, record = true) {
  const P = prepare(h),
    g = [0, 0],
    cup = h.cup,
    cupR2 = cup.r * cup.r,
    m = h.mill;
  let x = start.x,
    z = start.z;
  const len = Math.hypot(target.x - x, target.z - z),
    speed0 = pace(Math.min(len, REACH));
  let vx = len ? ((target.x - x) / len) * speed0 : 0,
    vz = len ? ((target.z - z) / len) * speed0 : 0;
  const path = record ? [point(x, z)] : null;
  let firstBounce = null,
    sunk = false,
    over = false,
    step = 0;
  // The rim adds its pull to the slope, so a ball that stops hanging over the hole still falls in.
  const lip = () => {
    const dx = x - cup.x,
      dz = z - cup.z,
      d = Math.hypot(dx, dz),
      edge = cup.r + radius / 2;
    if (d >= edge || d < 1e-6) return;
    const k = d > cup.r ? (edge - d) / (radius / 2) : 1;
    g[0] += (dx / d) * (LIP / SLOPE) * k;
    g[1] += (dz / d) * (LIP / SLOPE) * k;
  };
  while (++step <= STEPS) {
    slope(h, x, z, g);
    lip();
    vx -= SLOPE * g[0] * dt;
    vz -= SLOPE * g[1] * dt;
    let v = Math.hypot(vx, vz);
    const fr = v > SLOW ? ROLL : REST;
    if (v <= fr * dt) {
      vx = vz = 0;
      // At rest, unless the slope is steeper than the friction can hold.
      if (SLOPE * Math.hypot(g[0], g[1]) <= REST) break;
      if (record) path.push(point(x, z));
      continue;
    }
    const f = (v - fr * dt) / v;
    vx *= f;
    vz *= f;
    v *= f;
    const n = Math.ceil((v * dt) / STEP),
      hs = dt / n;
    for (let i = 0; i < n; i++) {
      const ox = x,
        oz = z;
      x += vx * hs;
      z += vz * hs;
      let hit = false;
      const c = Math.floor((x - P.x0) / CELL),
        r = Math.floor((z - P.z0) / CELL);
      const cell = c >= 0 && r >= 0 && c < P.cols && r < P.rows ? P.grid[r * P.cols + c] : null;
      if (cell)
        for (const s of cell) {
          if (s.ax === undefined) {
            // A round bumper.
            const dx = x - s.x,
              dz = z - s.z,
              d = Math.hypot(dx, dz),
              min = s.r + radius;
            if (d >= min) continue;
            const nx = d > 1e-9 ? dx / d : 1,
              nz = d > 1e-9 ? dz / d : 0;
            x = s.x + nx * min;
            z = s.z + nz * min;
            const vn = vx * nx + vz * nz;
            if (vn < 0) {
              vx -= 1.9 * vn * nx;
              vz -= 1.9 * vn * nz;
            }
            hit = true;
            continue;
          }
          const ex = s.bx - s.ax,
            ez = s.bz - s.az,
            t = clamp(((x - s.ax) * ex + (z - s.az) * ez) / (ex * ex + ez * ez), 0, 1),
            cx = s.ax + t * ex,
            cz = s.az + t * ez;
          let dx = x - cx,
            dz = z - cz;
          const d2 = dx * dx + dz * dz;
          if (d2 >= radius * radius) continue;
          let d = Math.sqrt(d2);
          if (d < 1e-9) {
            dx = ox - cx;
            dz = oz - cz;
            d = Math.hypot(dx, dz) || 1;
          }
          const nx = dx / d,
            nz = dz / d;
          x = cx + nx * radius;
          z = cz + nz * radius;
          const vn = vx * nx + vz * nz;
          if (vn < 0) {
            vx -= (1 + s.bounce) * vn * nx;
            vz -= (1 + s.bounce) * vn * nz;
            // The rail also takes a little of the run along it.
            vx *= 0.97;
            vz *= 0.97;
          }
          hit = true;
        }
      if (m) {
        // Crossing the plane of the sails while a sail covers the gate: the ball bounces back.
        const u0 = (ox - m.x) * m.dx + (oz - m.z) * m.dz,
          u1 = (x - m.x) * m.dx + (z - m.z) * m.dz;
        if ((u0 < 0) !== (u1 < 0)) {
          const lat = (x - m.x) * -m.dz + (z - m.z) * m.dx - m.o;
          if (Math.abs(lat) < m.gate / 2 + radius && sailBlocks(m, lat, (step - 1) * dt + (i + 1) * hs)) {
            x = ox;
            z = oz;
            const vu = vx * m.dx + vz * m.dz;
            vx -= 1.6 * vu * m.dx;
            vz -= 1.6 * vu * m.dz;
            hit = true;
          }
        }
      }
      // A push that left the lane is undone, so the walls never let the ball out.
      if (hit && !free(h, x, z)) {
        x = ox;
        z = oz;
        vx *= -0.5;
        vz *= -0.5;
      }
      if (hit && firstBounce === null) firstBounce = step;
      const dx = x - cup.x,
        dz = z - cup.z,
        inside = dx * dx + dz * dz < cupR2;
      if (inside) {
        // The way across the hole along the ball's line, and the pace that still reaches the far wall
        // low enough to drop. Never less than the level's catch, so a slow ball always drops.
        const v2 = vx * vx + vz * vz,
          v = Math.sqrt(v2),
          off = v > 1e-9 ? Math.abs(dx * vz - dz * vx) / v : 0,
          chord = 2 * Math.sqrt(Math.max(0, cupR2 - off * off)),
          most = Math.max(h.catch, (chord - radius) * FALL);
        if (v < most) {
          sunk = true;
          x = cup.x;
          z = cup.z;
          break;
        }
        over = true;
      } else if (over) {
        // Too fast: it jumps the hole and loses pace on the far lip.
        over = false;
        vx *= LIP_LOSS;
        vz *= LIP_LOSS;
      }
    }
    if (record) path.push(point(x, z));
    if (sunk) break;
  }
  return { path, end: point(x, z), firstBounce, sunk, steps: step };
}
// How much of the path the preview shows. The scene fades the dots out over the last FADE metres, so the
// end reads as a choice, not a cut. Facile: all of it. Moyen: until 0.7 m after the first bounce.
// Difficile: the first 3 m.
export const FADE = { facile: 0, moyen: 0.7, fort: 1 };
export function reveal(level, shot) {
  const n = shot.path.length - 1;
  if (level === 'facile') return n;
  const bounce = level === 'moyen' ? (shot.firstBounce ?? n) : 0,
    limit = level === 'moyen' ? 0.7 : 3;
  let run = 0,
    i = 1;
  for (; i < n; i++) {
    if (i > bounce) run += Math.hypot(shot.path[i].x - shot.path[i - 1].x, shot.path[i].z - shot.path[i - 1].z);
    if (run > limit) break;
  }
  return Math.min(n, i);
}

// ---------- The solver ----------
// Walking distance to the cup around the walls, on a 0.2 m grid.
function geoField(h) {
  const P = prepare(h);
  if (P.geo) return P.geo;
  const C = 0.2,
    cols = Math.ceil((P.cols * CELL) / C) + 1,
    rows = Math.ceil((P.rows * CELL) / C) + 1,
    n = cols * rows,
    open = new Uint8Array(n),
    dist = new Float64Array(n).fill(Infinity);
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) open[r * cols + c] = free(h, P.x0 + (c + 0.5) * C, P.z0 + (r + 0.5) * C) ? 1 : 0;
  const cell = (x, z) => [Math.floor((x - P.x0) / C), Math.floor((z - P.z0) / C)];
  // Dijkstra with a binary heap.
  const heap = [],
    push = (d, i) => {
      heap.push([d, i]);
      let k = heap.length - 1;
      while (k) {
        const p = (k - 1) >> 1;
        if (heap[p][0] <= heap[k][0]) break;
        [heap[p], heap[k]] = [heap[k], heap[p]];
        k = p;
      }
    },
    pop = () => {
      const top = heap[0],
        last = heap.pop();
      if (heap.length) {
        heap[0] = last;
        let k = 0;
        for (;;) {
          const a = 2 * k + 1,
            b = a + 1;
          let s = k;
          if (a < heap.length && heap[a][0] < heap[s][0]) s = a;
          if (b < heap.length && heap[b][0] < heap[s][0]) s = b;
          if (s === k) break;
          [heap[s], heap[k]] = [heap[k], heap[s]];
          k = s;
        }
      }
      return top;
    };
  const [cc, cr] = cell(h.cup.x, h.cup.z),
    start = cr * cols + cc;
  dist[start] = 0;
  push(0, start);
  const steps = [
    [1, 0, 1],
    [-1, 0, 1],
    [0, 1, 1],
    [0, -1, 1],
    [1, 1, Math.SQRT2],
    [1, -1, Math.SQRT2],
    [-1, 1, Math.SQRT2],
    [-1, -1, Math.SQRT2]
  ];
  while (heap.length) {
    const [d, i] = pop();
    if (d > dist[i]) continue;
    const c = i % cols,
      r = (i - c) / cols;
    for (const [dc, dr, w] of steps) {
      const nc = c + dc,
        nr = r + dr;
      if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) continue;
      const j = nr * cols + nc;
      if (!open[j] || (dc && dr && !(open[r * cols + nc] && open[nr * cols + c]))) continue;
      const nd = d + w * C;
      if (nd < dist[j]) {
        dist[j] = nd;
        push(nd, j);
      }
    }
  }
  P.geo = (x, z) => {
    const [c, r] = cell(x, z);
    let best = Infinity;
    for (let k = -1; k <= 1; k++)
      for (let l = -1; l <= 1; l++) {
        const nc = c + l,
          nr = r + k;
        if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) continue;
        const d = dist[nr * cols + nc];
        if (d < Infinity)
          best = Math.min(best, d + Math.hypot(x - (P.x0 + (nc + 0.5) * C), z - (P.z0 + (nr + 0.5) * C)));
      }
    return best;
  };
  return P.geo;
}
// A good target from the ball's place: one that sinks the ball even after a slip, else the one that leaves it
// nearest the cup along the lane. Straight at the cup first, then a fan of directions and paces, then a finer look around
// the best. Deterministic, so the par and every hint replay the same way.
export function hint(h, start) {
  const P = prepare(h),
    key = start.x + ',' + start.z;
  P.hints ||= new Map();
  if (!P.hints.has(key)) P.hints.set(key, search(h, start));
  return P.hints.get(key);
}
function search(h, start) {
  const geo = geoField(h),
    aim = (a, d) => point(start.x + Math.cos(a) * d, start.z + Math.sin(a) * d),
    run = (a, d) => simulate(h, start, aim(a, d), false),
    slips = (a, d) => [[a - SLIP_A, d], [a + SLIP_A, d], [a, d * (1 - SLIP_D)], [a, d * (1 + SLIP_D)]];
  // What is left on average after the shot and its four slips: 0 for a sink.
  const expected = (a, d) => {
    let sum = 0;
    for (const [sa, sd] of [[a, d], ...slips(a, d)]) {
      const r = run(sa, sd);
      sum += r.sunk ? 0 : geo(r.end.x, r.end.z);
    }
    return sum / 5;
  };
  const seen = [];
  // A sink counts only if each slip still sinks: a human plan, not a lucky one. A lucky sink is not
  // kept as a lag shot either.
  const shot = (a, d) => {
    const r = run(a, d);
    if (r.sunk) return slips(a, d).every(([sa, sd]) => run(sa, sd).sunk) ? aim(a, d) : null;
    seen.push([geo(r.end.x, r.end.z), a, d]);
    return null;
  };
  const ac = Math.atan2(h.cup.z - start.z, h.cup.x - start.x),
    D = Math.hypot(h.cup.z - start.z, h.cup.x - start.x);
  for (const k of [0, -1, 1, -2, 2])
    for (const extra of [0.2, 0.45, 0.8, 1.3, 2.1, 3.2]) {
      const t = shot(ac + k * 0.025, D + extra);
      if (t) return t;
    }
  for (let i = 0; i < 28; i++)
    for (const d of [1.3, 2.2, 3.3, 4.6, 6.2, 8, 10.2, 13]) {
      const t = shot(ac + (i * Math.PI * 2) / 28, d);
      if (t) return t;
    }
  // The safest of the best lag shots, then a finer look around it.
  seen.sort((p, q) => p[0] - q[0]);
  let best = null,
    score = Infinity;
  for (const [, a, d] of seen.slice(0, 8)) {
    const s = expected(a, d);
    if (s < score) [score, best] = [s, [a, d]];
  }
  if (!best) return aim(ac, D);
  for (const around of [0.08, 0.035]) {
    const [a0, d0] = best;
    for (const [da, f] of [[-1, 1], [1, 1], [0, 0.88], [0, 1.12], [-1, 0.92], [1, 1.08]]) {
      const a = a0 + da * around,
        d = d0 * f,
        r = run(a, d);
      if (r.sunk && slips(a, d).every(([sa, sd]) => run(sa, sd).sunk)) return aim(a, d);
      if (r.sunk) continue;
      const s = expected(a, d);
      if (s < score) [score, best] = [s, [a, d]];
    }
  }
  return aim(...best);
}
// Strokes to sink the ball when each shot follows the hint, the target turned by slip radians and its
// length scaled by 1 + stretch (signs alternating). Infinity over six.
export function playout(h, slip = 0, stretch = 0) {
  let p = h.tee;
  for (let n = 1; n <= 6; n++) {
    const t = hint(h, p),
      sign = n % 2 ? 1 : -1,
      a = Math.atan2(t.z - p.z, t.x - p.x) + sign * slip,
      d = Math.hypot(t.z - p.z, t.x - p.x) * (1 + sign * stretch);
    const shot = simulate(h, p, point(p.x + Math.cos(a) * d, p.z + Math.sin(a) * d), false);
    if (shot.sunk) return n;
    p = shot.end;
  }
  return Infinity;
}
// The par: what a player needs, played twice with slips of the hand (the worse of the two), never under
// what the hint needs. The slips are larger in Facile and smaller in Difficile: a harder level asks for a
// steadier hand. Null when the hole is too hard for par 4.
function parOf(h) {
  const hinted = playout(h);
  if (hinted > 4) return null;
  const [a, d] = LEVEL[h.level].slip,
    human = Math.max(playout(h, a, d), playout(h, -a, -d));
  if (human > 4) return null;
  return clamp(Math.max(hinted, human), 2, 4);
}

// ---------- Building a hole ----------
const NOUNS = {
  droit: [['m', 'chemin'], ['f', 'allée'], ['m', 'couloir']],
  green: [['m', 'green'], ['f', 'prairie'], ['f', 'clairière']],
  virage: [['m', 'virage'], ['f', 'courbe'], ['m', 'détour']],
  equerre: [['m', 'coude'], ['f', 'équerre'], ['m', 'angle']],
  lacets: [['m', 'serpentin'], ['m', 'zigzag'], ['f', 'boucle']],
  terrasse: [['f', 'terrasse'], ['m', 'plateau'], ['f', 'montée']],
  champignons: [['m', 'bosquet'], ['m', 'sous-bois'], ['f', 'clairière']],
  pont: [['m', 'pont'], ['f', 'passerelle']],
  colline: [['f', 'colline'], ['f', 'bosse'], ['m', 'mamelon']],
  cuvette: [['f', 'cuvette'], ['m', 'creux'], ['m', 'vallon']],
  tunnel: [['m', 'tunnel'], ['m', 'passage'], ['f', 'grotte']],
  portillon: [['m', 'portillon'], ['f', 'porte'], ['m', 'col']],
  moulin: [['m', 'moulin']]
};
const SHAPE_NAMES = { straight: 'droit', long: 'droit', wide: 'green', dogleg: 'virage', bigdog: 'virage', ell: 'equerre', ess: 'lacets' };
const BEFORE = { m: ['petit', 'grand', 'joli'], f: ['petite', 'grande', 'jolie'] };
const AFTER = { m: ['tranquille', 'fleuri', 'secret', 'enchanté'], f: ['tranquille', 'fleurie', 'secrète', 'enchantée'] };
const OF = ['des fleurs', 'des pins', 'du lac', 'des écureuils', 'du meunier', 'des cerisiers', 'des roses', 'des lavandes', 'du jardin', 'des bouleaux', 'des papillons', 'des lilas'];
const kindOfName = (id) =>
  id === 'grand-pont' ? 'pont' : id === 'grande-terrasse' ? 'terrasse' : id === 'lacets-portillon' ? 'portillon' : id.split('-')[0];
function nameFor(type, rnd, taken) {
  const nouns = NOUNS[kindOfName(type.id)];
  for (let k = 0; k < 40; k++) {
    const [g, noun] = nouns[Math.floor(rnd() * nouns.length)];
    const article = /^[aeéiou]/.test(noun) ? 'L’' : g === 'm' ? 'Le ' : 'La ';
    const form = Math.floor(rnd() * 3);
    const list = form === 0 ? BEFORE[g] : form === 1 ? AFTER[g] : OF,
      word = list[Math.floor(rnd() * list.length)];
    const name = form === 0 ? (g === 'm' ? 'Le ' : 'La ') + word + ' ' + noun : article + noun + ' ' + word;
    if (!taken.has(name)) return name;
  }
  return 'Le trou ' + (taken.size + 1);
}
const rad = (d) => (d * Math.PI) / 180;
function spineFor(shape, L, r, m, w) {
  switch (shape) {
    case 'straight':
      return [[0, 0, w], [r(7.4, 8.8), 0, w]];
    case 'long':
      return [[0, 0, w], [r(9.4, 10.8), 0, w]];
    case 'wide': {
      const a = r(5, 6.2),
        g = w * r(1.45, 1.6);
      return [[0, 0, w], [a, 0, w], [a + 1.3, 0, g], [a + 1.3 + r(2.5, 3), 0, g]];
    }
    case 'dogleg': {
      const a = r(4.8, 5.8),
        b = r(4.2, 5),
        t = rad(r(...L.bend));
      return [[0, 0, w], [a, 0, w], [a + b * Math.cos(t), m * b * Math.sin(t), w]];
    }
    case 'bigdog': {
      // The showpiece dogleg: a long first leg for the bridge.
      const a = r(7.2, 8),
        b = r(4, 4.8),
        t = rad(r(...L.bend));
      return [[0, 0, w], [a, 0, w], [a + b * Math.cos(t), m * b * Math.sin(t), w]];
    }
    case 'ell': {
      const a = r(5, 6),
        b = r(3.8, 4.6);
      return [[0, 0, w], [a, 0, w], [a, m * b, w]];
    }
    default: {
      // ess: two bends of 50 to 65°, back to the first direction.
      const a = r(3.4, 4.1),
        b = r(3, 3.5),
        c = r(3.4, 4),
        t = rad(r(50, 65));
      return [[0, 0, w], [a, 0, w], [a + b * Math.cos(t), m * b * Math.sin(t), w], [a + b * Math.cos(t) + c, m * b * Math.sin(t), w]];
    }
  }
}
function build(level, type, rnd) {
  const L = LEVEL[level],
    r = (a, b) => a + (b - a) * rnd(),
    m = rnd() < 0.5 ? 1 : -1,
    w = r(...L.width);
  const spine = spineFor(type.shape, L, r, m, w);
  const { left, right } = borders(spine);
  const h = {
    type: type.id,
    level,
    spine,
    outline: [...left, ...[...right].reverse()],
    regions: [],
    bumpers: [],
    bumps: [],
    ramp: null,
    mill: null,
    parts: [],
    catch: L.catch,
    // The longest pull: see h.reach below.
    reach: 0,
    palette: Math.floor(rnd() * 4),
    decor: Math.floor(rnd() * 2 ** 32)
  };
  const segs = spine.slice(1).map((b, k) => {
    const a = spine[k],
      len = Math.hypot(b[0] - a[0], b[1] - a[1]),
      dx = (b[0] - a[0]) / len,
      dz = (b[1] - a[1]) / len;
    return { a, len, dx, dz, w: a[2], wb: b[2] };
  });
  const at = (k, s, v) => {
    const g = segs[k];
    return [g.a[0] + g.dx * s - g.dz * v, g.a[1] + g.dz * s + g.dx * v];
  };
  // How far from each end of segment k the mitre of a bend reaches into it.
  const trim = (k) => {
    const g = segs[k],
      bend = (i) => (i < 0 || i >= segs.length ? 0 : Math.abs(Math.atan2(g.dx * segs[i].dz - g.dz * segs[i].dx, g.dx * segs[i].dx + g.dz * segs[i].dz)));
    return [(g.w / 2) * Math.tan(bend(k - 1) / 2), (g.w / 2) * Math.tan(bend(k + 1) / 2)];
  };
  const last = segs.length - 1,
    straight = segs.findIndex((g) => g.w === g.wb && g.len === Math.max(...segs.filter((s) => s.w === s.wb).map((s) => s.len)));
  const teeV = r(-0.22, 0.22) * w;
  h.tee = point(...at(0, 0.9, teeV));
  const green = segs[last],
    cupS = green.len - r(0.95, 1.4),
    cupV = r(-0.28, 0.28) * green.w;
  h.cup = { ...point(...at(last, cupS, cupV)), r: L.cup };
  // A closed shape across the lane, leaving a channel of width c at lateral offset o. f is the length of
  // the funnel walls that lead in and out.
  const channel = (k, s, len, c, o, f, kind) => {
    const g = segs[k],
      e = g.w / 2 + 0.2;
    h.regions.push({ kind, pts: [at(k, s - len / 2 - f, e), at(k, s - len / 2, o + c / 2), at(k, s + len / 2, o + c / 2), at(k, s + len / 2 + f, e)] });
    h.regions.push({ kind, pts: [at(k, s - len / 2 - f, -e), at(k, s + len / 2 + f, -e), at(k, s + len / 2, o - c / 2), at(k, s - len / 2, o - c / 2)] });
    const [x, z] = at(k, s, o);
    return { x, z, dx: g.dx, dz: g.dz, len, width: c, lane: g.w, o, f, cx: at(k, s, 0) };
  };
  // A free stretch of a segment of even width for an obstacle of the given half-length, clear of the tee,
  // the cup and the other obstacles. The preferred segment first, then the longest ones.
  const used = segs.map(() => []);
  const place = (half, from = 0.5, prefer = straight) => {
    const order = [prefer, ...segs.map((_, k) => k).sort((a, b) => segs[b].len - segs[a].len)].filter((k) => segs[k].w === segs[k].wb);
    for (const k of order) {
      const g = segs[k],
        [t0, t1] = trim(k),
        lo = (k === 0 ? 2.1 : t0 + 0.4) + half,
        hi = g.len - (k === last ? g.len - cupS + 1.1 : t1 + 0.4) - half;
      if (lo > hi) continue;
      for (const f of [from, 0.5, 0.2, 0.8, 0, 1]) {
        const s = lo + (hi - lo) * f;
        if (used[k].every(([a, b]) => s + half + 0.3 < a || s - half - 0.3 > b)) {
          used[k].push([s - half, s + half]);
          return { k, s };
        }
      }
    }
    return null;
  };
  // A raised green comes first: it takes the end of the last segment.
  for (const feature of [...type.features].sort((a, b) => (b === 'ramp') - (a === 'ramp'))) {
    if (feature === 'bank') {
      // Angled boards across the outer corner of each bend, for bank shots. A flower bed fills the corner.
      for (let k = 1; k < spine.length - 1; k++) {
        const a = segs[k - 1],
          b = segs[k],
          turn = a.dx * b.dz - a.dz * b.dx;
        if (Math.abs(Math.asin(clamp(turn, -1, 1))) < rad(25)) continue;
        const outer = turn > 0 ? right : left,
          C = outer[k],
          cut = w * r(0.45, 0.6);
        const A = [C[0] - a.dx * cut, C[1] - a.dz * cut],
          B = [C[0] + b.dx * cut, C[1] + b.dz * cut];
        h.regions.push({ kind: 'flowers', pts: [A, C, B] });
        h.parts.push({ kind: 'bank', a: A, b: B, c: C });
      }
    } else if (feature === 'bumpers') {
      // Toadstools in a zigzag, one every 0.9 m.
      const count = Math.round(r(L.bumpers[0], L.bumpers[1] + 0.49)),
        spot = place(0.45 * count, r(0.3, 0.7), type.shape === 'wide' ? last : straight);
      if (!spot) return null;
      const g = segs[spot.k],
        side = rnd() < 0.5 ? 1 : -1;
      for (let i = 0; i < count; i++) {
        const s = spot.s + (i - (count - 1) / 2) * 0.9,
          size = r(0.19, 0.25),
          // Room for the ball between a toadstool and the wall.
          v = side * (i % 2 ? -1 : 1) * Math.min(r(0.12, 0.3) * g.w, g.w / 2 - size - 3 * radius - 0.03),
          [x, z] = at(spot.k, s, v);
        h.bumpers.push({ x, z, r: size });
      }
    } else if (feature === 'hill' || feature === 'dip') {
      const R = clamp(r(0.95, 1.25) * (w / 2.3), 0.85, 1.3),
        spot = place(R * 0.6, r(0.35, 0.65));
      if (!spot) return null;
      const [x, z] = at(spot.k, spot.s, r(-0.2, 0.2) * w);
      h.bumps.push({ x, z, r: R, h: feature === 'hill' ? r(0.3, 0.42) : -r(0.22, 0.3) });
    } else if (feature === 'ramp') {
      const g = segs[last],
        [t0] = trim(last),
        len = r(1.0, 1.3),
        s0 = Math.max(t0 + 0.6, cupS - 0.9 - len - r(0.2, 0.9)),
        [x, z] = at(last, s0, 0);
      used[last].push([s0 - 0.4, g.len]);
      h.ramp = { x, z, dx: g.dx, dz: g.dz, len, h: L.ramp * r(0.9, 1.1), s0 };
      h.parts.push({ kind: 'ramp', x, z, dx: g.dx, dz: g.dz, len });
    } else {
      // bridge, tunnel, gate, mill: a channel through a closed shape across the lane.
      const size = { bridge: [r(2, 2.5), L.bridge, 0.65, 'water'], tunnel: [r(1.3, 1.6), L.tunnel, 0.5, 'stone'], gate: [0.36, L.gate, 0, 'stone'], mill: [1.0, L.mill, 0, 'mill'] }[feature],
        [len, c, f, kind] = size,
        twice = feature === 'gate' && type.shape === 'long',
        spot = place(len / 2 + f, twice ? 0.15 : r(0.4, 0.6));
      if (!spot) return null;
      const { k, s } = spot,
        g = segs[k],
        room = Math.max(0, (g.w - c) / 2 - 0.3),
        o = feature === 'mill' || level === 'facile' ? 0 : r(-room, room) * 0.7;
      const part = channel(k, s, len, c, o, f, kind);
      h.parts.push({ kind: feature, ...part });
      if (twice) {
        const second = place(len / 2, 0.9, k);
        if (second && second.k === k && second.s - s > 1.6) h.parts.push({ kind: 'gate', ...channel(k, second.s, len, c, -o * 0.8 + (o ? 0 : r(-room, room) * 0.6), 0, 'stone') });
      }
      if (feature === 'mill') {
        // The sails turn in a plane just before the base, facing the tee.
        const [x, z] = at(k, s - len / 2 - 0.12, 0);
        h.mill = { x, z, dx: g.dx, dz: g.dz, o, gate: c, hub: 1.05, sail: 1.02, width: 0.36, speed: 1.55, phase: r(0, Math.PI / 2) };
      }
    }
  }
  const xs = h.outline.map((p) => p[0]),
    zs = h.outline.map((p) => p[1]);
  // The longest pull: half as far again as the whole hole, so a full pull feels strong and comes back off
  // the end wall.
  h.reach = clamp(1.5 * Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs)), 9, REACH);
  return h;
}
// The checks a hole must pass before the solver tries it.
function sound(h) {
  const segs = [];
  const add = (pts) => pts.forEach((a, i) => segs.push([a, pts[(i + 1) % pts.length]]));
  add(h.outline);
  h.regions.forEach((r) => add(r.pts));
  const clear = (p, room) =>
    free(h, p.x, p.z) && segs.every(([a, b]) => segDistance(a[0], a[1], b[0], b[1], p.x, p.z) >= room) && h.bumpers.every((b) => Math.hypot(b.x - p.x, b.z - p.z) >= b.r + room);
  if (!clear(h.tee, 0.4) || !clear(h.cup, h.cup.r + 0.12)) return false;
  // The cup and the tee sit on flat ground.
  const g = [0, 0];
  for (const p of [h.cup, h.tee]) {
    slope(h, p.x, p.z, g);
    if (Math.hypot(g[0], g[1]) > 1e-6) return false;
  }
  // A raised green starts after the tunnel or the bridge ends.
  const r = h.ramp;
  if (r && h.parts.some((p) => p.len && (p.x - r.x) * r.dx + (p.z - r.z) * r.dz + p.len / 2 + p.f > -0.4)) return false;
  for (const b of h.bumpers) {
    const other = { ...h, bumpers: h.bumpers.filter((o) => o !== b) };
    if (!free(h, b.x, b.z) || !segs.every(([p, q]) => segDistance(p[0], p[1], q[0], q[1], b.x, b.z) >= b.r + 3 * radius)) return false;
    if (other.bumpers.some((o) => Math.hypot(o.x - b.x, o.z - b.z) < o.r + b.r + 3 * radius)) return false;
  }
  return true;
}

// ---------- The course ----------
function order(level, rnd) {
  const P = POOLS[level],
    pick = (list) => list[Math.floor(rnd() * list.length)];
  for (;;) {
    const middle = [...P.middle];
    for (let i = middle.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [middle[i], middle[j]] = [middle[j], middle[i]];
    }
    const list = [pick(P.opener), ...middle.slice(0, 7), pick(P.finale)];
    const kind = (t) => t.features[0] || t.shape;
    if (list.every((t, i) => !i || (t.id !== list[i - 1].id && kind(t) !== kind(list[i - 1])))) return list;
  }
}
// Nine holes for a level and a seed. Each hole is checked: the solver must sink it in 2 to 4 strokes
// (1 counts as 2), which also sets its par. A hole that fails is built again from the next numbers of
// the same generator, so a seed always gives the same course.
export function generate(level, seed) {
  const rnd = random(seed),
    types = order(level, rnd),
    taken = new Set(),
    holes = [];
  types.forEach((type, index) => {
    let h = null,
      par = null,
      plain = false;
    // After 20 tries the obstacles go, then the shape: a plain lane always works.
    for (let attempt = 0; attempt < 40 && !par; attempt++) {
      plain = attempt >= 20;
      h = build(level, !plain ? type : attempt < 30 ? { ...type, features: [] } : T(type.id, 'straight'), rnd);
      if (h && sound(h)) par = parOf(h);
    }
    h.index = index;
    h.par = par || 4;
    // A hole that lost its obstacles is named after its shape.
    h.name = nameFor(plain ? T(SHAPE_NAMES[h.spine.length === 2 ? 'straight' : type.shape]) : type, rnd, taken);
    taken.add(h.name);
    holes.push(h);
  });
  return holes;
}
// The course of a game, built once and kept for the replays.
const courses = new Map();
export function course(level, seed) {
  const key = level + ':' + (seed >>> 0);
  if (!courses.has(key)) {
    if (courses.size > 4) courses.delete(courses.keys().next().value);
    courses.set(key, generate(level, seed));
  }
  return courses.get(key);
}

// ---------- The game and its save ----------
// Only the seed and the targets are saved. Replaying rebuilds and checks every stroke.
export const fresh = (level = 'facile', finished = 0, seed = 1) => ({
  v: 2,
  level,
  seed: seed >>> 0,
  finished,
  credited: false,
  won: false,
  rounds: [[]]
});
const valid = (h, ball, t) => t && Number.isFinite(t.x) && Number.isFinite(t.z) && Math.hypot(t.x - ball.x, t.z - ball.z) <= 40;
export function current(s, i = s.rounds.length - 1) {
  const h = course(s.level, s.seed)[i];
  let ball = h.tee,
    done = false;
  for (const t of s.rounds[i]) {
    if (done || !valid(h, ball, t)) throw Error('Coup invalide');
    const shot = simulate(h, ball, t, false);
    ball = shot.end;
    done = shot.sunk;
  }
  done ||= s.rounds[i].length === 8;
  return { h, ball: done ? point(h.cup.x, h.cup.z) : ball, done, count: s.rounds[i].length };
}
export function play(s, target) {
  const { h, ball, done } = current(s);
  if (done || !valid(h, ball, target)) return null;
  const shot = simulate(h, ball, target);
  s.rounds.at(-1).push({ x: target.x, z: target.z });
  return shot;
}
export function undo(s) {
  if (!s.rounds.at(-1).length && s.rounds.length > 1) s.rounds.pop();
  return s.rounds.at(-1).pop();
}
// A save that does not replay gives null, and the page starts a fresh course. An old save from the first
// version, without a seed, also gives null; oldLevel and oldFinished let the page keep its level and count.
export function restore(raw) {
  try {
    if (
      raw.v !== 2 ||
      !Number.isSafeInteger(raw.seed) ||
      raw.seed < 0 ||
      raw.seed > 0xffffffff ||
      !Number.isSafeInteger(raw.finished) ||
      raw.finished < 0 ||
      typeof raw.credited !== 'boolean' ||
      typeof raw.won !== 'boolean' ||
      (raw.won && !raw.credited) ||
      (raw.credited && !raw.finished) ||
      !Array.isArray(raw.rounds) ||
      !raw.rounds.length ||
      raw.rounds.length > 9
    )
      return null;
    const s = { ...raw, level: levels.includes(raw.level) ? raw.level : 'facile' };
    for (let i = 0; i < s.rounds.length; i++) {
      if (!Array.isArray(s.rounds[i]) || s.rounds[i].length > 8) return null;
      if (!current(s, i).done && i < s.rounds.length - 1) return null;
    }
    return s;
  } catch {
    return null;
  }
}
export const oldLevel = (raw) => (raw && levels.includes(raw.level) ? raw.level : null);
export const oldFinished = (raw) => (raw && Number.isSafeInteger(raw.finished) && raw.finished >= 0 ? raw.finished : 0);
