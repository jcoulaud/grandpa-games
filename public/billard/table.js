// The table seen from above, drawn on one canvas. Table coordinates are metres: x along the table, from the
// head rail (left) to the foot rail, y from the top rail down. A phone shows the table upright, head at the bottom.
// The wood, the cloth, the cushions and the pockets are drawn once per size. The balls are shaded pixel by pixel
// from their orientation, so the numbers and the stripes roll with the ball.

import { drawFrame, holeOf, WOOD, CUSHION } from './frame.js';
export const COLOURS = {
  1: [242, 190, 20], 2: [30, 76, 178], 3: [206, 36, 44], 4: [92, 45, 140], 5: [240, 118, 22], 6: [18, 128, 74],
  7: [128, 30, 34], 8: [22, 22, 24]
};
export const colourOf = (id) => COLOURS[id > 8 ? id - 8 : id] ?? [250, 248, 240];
const IVORY = [250, 247, 236];

export function createTable(canvas, T) {
  const ctx = canvas.getContext('2d');
  const { L, W, R } = T;
  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  let s = 1, // device pixels per metre
    dpr = 1,
    portrait = false,
    e = 0,
    f = 0,
    bg = null;
  // What the next frame shows. game.js sets it; the animations change balls, cue and drops.
  const state = {
    balls: [],
    cue: null, // { angle, pull (m), alpha }
    preview: null, // { aim, cue, object: [{x,y}], ghost: {x,y} | null, gold: bool }
    rings: [], // { x, y, r } in metres, yellow
    marks: [], // ids of the balls he may play, edged in soft gold at Facile
    hand: null, // { x, y, ok } the white under the mouse while he places it
    headLine: false,
    hover: null, // { id, x, y }
    drops: [] // { id, x, y, q, k } balls falling into a pocket, k from 0 to 1
  };

  // ---------- Size and the mapping between the table and the canvas ----------
  function layout() {
    dpr = Math.min(3, window.devicePixelRatio || 1);
    const cw = canvas.clientWidth,
      ch = canvas.clientHeight;
    if (!cw || !ch) return false;
    canvas.width = Math.round(cw * dpr);
    canvas.height = Math.round(ch * dpr);
    portrait = ch > cw * 1.15;
    const ew = L + 2 * (WOOD + CUSHION),
      eh = W + 2 * (WOOD + CUSHION),
      [aw, ah] = portrait ? [eh, ew] : [ew, eh];
    s = Math.min(canvas.width / aw, canvas.height / ah);
    const ox = (canvas.width - aw * s) / 2 + (WOOD + CUSHION) * s,
      oy = (canvas.height - ah * s) / 2 + (WOOD + CUSHION) * s;
    // Upright, X = ox + y s and Y = oy + (L - x) s: the head rail at the bottom, the top rail on the left.
    e = ox;
    f = portrait ? oy + L * s : oy;
    bg = background();
    return true;
  }
  const toScreen = (x, y) => (portrait ? { X: e + y * s, Y: f - x * s } : { X: e + x * s, Y: f + y * s });
  const world = (c) => (portrait ? c.setTransform(0, -s, s, 0, e, f) : c.setTransform(s, 0, 0, s, e, f));
  // A pointer event, in table metres.
  function toTable(ev) {
    const r = canvas.getBoundingClientRect(),
      X = ((ev.clientX - r.left) / r.width) * canvas.width,
      Y = ((ev.clientY - r.top) / r.height) * canvas.height;
    return portrait ? { x: (f - Y) / s, y: (X - e) / s } : { x: (X - e) / s, y: (Y - f) / s };
  }
  // One css pixel, in metres.
  const px = (n) => (n * dpr) / s;

  // ---------- The table without its balls, drawn once per size (frame.js) ----------
  function background() {
    const c = document.createElement('canvas');
    c.width = canvas.width;
    c.height = canvas.height;
    const g = c.getContext('2d');
    // Around the table the canvas stays clear, so the felt of the page shows.
    world(g);
    drawFrame(g, T, px);
    g.setTransform(1, 0, 0, 1, 0, 0);
    return c;
  }

  // ---------- The balls ----------
  // Each number is drawn once into a small white disc; the shader reads it when the disc faces up.
  const TEX = 64;
  const numbers = {};
  function numberTexture(id) {
    if (numbers[id]) return numbers[id];
    const c = document.createElement('canvas');
    c.width = c.height = TEX;
    const g = c.getContext('2d');
    g.fillStyle = '#fff';
    g.fillRect(0, 0, TEX, TEX);
    g.fillStyle = '#16181A';
    g.font = `800 ${id > 9 ? 34 : 40}px "Segoe UI", system-ui, sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(String(id), TEX / 2, TEX / 2 + 2);
    return (numbers[id] = g.getImageData(0, 0, TEX, TEX).data);
  }
  const sprites = new Map();
  // The light comes from a lamp above and a little to the top left of the screen.
  const LIGHT = norm([-0.38, -0.5, 0.78]),
    HALF = norm([LIGHT[0], LIGHT[1], LIGHT[2] + 1]);
  function sprite(id, q) {
    const rp = R * s,
      size = Math.ceil(rp * 2 + 2),
      key = size + ':' + (portrait ? 'p' : 'l') + ':' + q.map((v) => v.toFixed(3)).join(',');
    let sp = sprites.get(id);
    if (sp && sp.key === key) return sp;
    if (!sp || sp.canvas.width !== size) {
      const c = document.createElement('canvas');
      c.width = c.height = size;
      sp = { canvas: c, g: c.getContext('2d'), key: '' };
      sprites.set(id, sp);
    }
    sp.key = key;
    const img = sp.g.createImageData(size, size),
      data = img.data,
      m = matrix(q),
      base = id === 0 ? IVORY : colourOf(id),
      stripe = id > 8,
      tex = id > 0 ? numberTexture(id) : null,
      c0 = size / 2;
    for (let j = 0; j < size; j++) {
      for (let i = 0; i < size; i++) {
        const u = (i + 0.5 - c0) / rp,
          v = (j + 0.5 - c0) / rp,
          r2 = u * u + v * v;
        const edge = (1 - Math.sqrt(r2)) * rp + 0.5;
        if (edge <= 0) continue;
        const w = Math.sqrt(Math.max(0, 1 - r2));
        // The normal in table coordinates: the screen turns with the table on a phone, and the top is -z.
        const nx = portrait ? -v : u,
          ny = portrait ? u : v,
          nz = -w;
        // Into the ball's own frame: the transpose of its rotation.
        const bx = m[0] * nx + m[3] * ny + m[6] * nz,
          by = m[1] * nx + m[4] * ny + m[7] * nz,
          bz = m[2] * nx + m[5] * ny + m[8] * nz;
        let col = base;
        if (id === 0) {
          // A training ball: six small red dots, so the spin shows.
          const d = Math.max(Math.abs(bx), Math.abs(by), Math.abs(bz));
          if (d > 0.985) col = [196, 32, 44];
        } else {
          if (stripe && Math.abs(bz) > 0.52) col = IVORY;
          const ax = Math.abs(bx);
          if (ax > 0.8) {
            // The number disc, on both sides, read the right way round on each.
            const tu = ((bx > 0 ? by : -by) / 0.6 + 1) / 2,
              tv = ((-bz / 0.6) + 1) / 2,
              ti = Math.min(TEX - 1, Math.max(0, Math.floor(tu * TEX))),
              tj = Math.min(TEX - 1, Math.max(0, Math.floor(tv * TEX))),
              k = (tj * TEX + ti) * 4;
            const dr = Math.hypot(by, bz) / 0.6;
            col = dr < 0.92 ? [tex[k], tex[k + 1], tex[k + 2]] : dr < 1 ? [235, 233, 226] : col;
          }
        }
        // Light: diffuse from the lamp, a little ambient from the cloth, a sharp highlight and a soft rim.
        const lam = Math.max(0, u * LIGHT[0] + v * LIGHT[1] + w * LIGHT[2]),
          spec = Math.pow(Math.max(0, u * HALF[0] + v * HALF[1] + w * HALF[2]), 70),
          rim = Math.pow(1 - w, 3);
        const shade = 0.34 + 0.78 * lam - 0.18 * rim,
          k = (j * size + i) * 4;
        data[k] = Math.min(255, col[0] * shade + 255 * spec * 0.95 + 18 * rim);
        data[k + 1] = Math.min(255, col[1] * shade + 255 * spec * 0.95 + 40 * rim);
        data[k + 2] = Math.min(255, col[2] * shade + 255 * spec * 0.95 + 70 * rim);
        data[k + 3] = Math.min(1, edge) * 255;
      }
    }
    sp.g.putImageData(img, 0, 0);
    return sp;
  }
  function drawBall(b, scale = 1, dark = 0) {
    const { X, Y } = toScreen(b.x, b.y),
      sp = sprite(b.id, b.q ?? [1, 0, 0, 0]),
      size = sp.canvas.width * scale;
    ctx.drawImage(sp.canvas, X - size / 2, Y - size / 2, size, size);
    if (dark > 0) {
      ctx.fillStyle = `rgba(0,0,0,${dark})`;
      ctx.beginPath();
      ctx.arc(X, Y, R * s * scale + 0.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  function drawShadow(b, scale = 1, alpha = 1) {
    const { X, Y } = toScreen(b.x, b.y),
      r = R * s * scale,
      gx = X + r * 0.22,
      gy = Y + r * 0.3,
      grad = ctx.createRadialGradient(gx, gy, r * 0.2, gx, gy, r * 1.28);
    grad.addColorStop(0, `rgba(0,10,25,${0.5 * alpha})`);
    grad.addColorStop(1, 'rgba(0,10,25,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(gx, gy, r * 1.3, 0, Math.PI * 2);
    ctx.fill();
  }

  // ---------- The cue stick ----------
  // Drawn in table metres behind the white: a blue chalked tip, a white ferrule, a maple shaft and an ebony butt.
  function drawCue(cue, white) {
    if (!cue || !white) return;
    world(ctx);
    ctx.save();
    ctx.globalAlpha = cue.alpha ?? 1;
    ctx.translate(white.x, white.y);
    ctx.rotate(cue.angle + Math.PI);
    const start = R + 0.006 + (cue.pull ?? 0),
      len = 1.45,
      w0 = 0.0065,
      w1 = 0.0145;
    // Its shadow on the cloth.
    ctx.save();
    ctx.translate(0.008, 0.012);
    ctx.fillStyle = 'rgba(0,10,30,.28)';
    taper(start, len, w0, w1);
    ctx.fill();
    ctx.restore();
    const shaft = ctx.createLinearGradient(0, -w1, 0, w1);
    shaft.addColorStop(0, '#F3DEB0');
    shaft.addColorStop(0.45, '#E2C38A');
    shaft.addColorStop(1, '#A9874F');
    ctx.fillStyle = shaft;
    taper(start, len, w0, w1);
    ctx.fill();
    // The butt: ebony with a brass ring.
    const butt = start + len * 0.56;
    ctx.save();
    ctx.beginPath();
    taper(start, len, w0, w1);
    ctx.clip();
    const eb = ctx.createLinearGradient(0, -w1, 0, w1);
    eb.addColorStop(0, '#4A3A33');
    eb.addColorStop(0.5, '#1E1512');
    eb.addColorStop(1, '#0C0806');
    ctx.fillStyle = eb;
    ctx.fillRect(butt, -w1 * 2, len, w1 * 4);
    // Points of ebony into the maple, as on a real cue.
    ctx.beginPath();
    for (const side of [-1, 1]) {
      ctx.moveTo(butt, side * w1);
      ctx.lineTo(butt - 0.2, 0);
      ctx.lineTo(butt, side * w1 * 0.2);
    }
    ctx.fill();
    ctx.fillStyle = '#C9A24A';
    ctx.fillRect(butt - 0.004, -w1 * 2, 0.008, w1 * 4);
    ctx.fillStyle = '#E8E2D6';
    ctx.fillRect(start, -w1, 0.022, w1 * 2);
    ctx.fillStyle = '#3F6EA8';
    ctx.fillRect(start, -w1, 0.0045, w1 * 2);
    ctx.restore();
    // A highlight along the shaft.
    ctx.strokeStyle = 'rgba(255,255,255,.35)';
    ctx.lineWidth = px(1.2);
    ctx.beginPath();
    ctx.moveTo(start + 0.03, -w0 * 0.45);
    ctx.lineTo(start + len, -w1 * 0.45);
    ctx.stroke();
    ctx.restore();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }
  function taper(a, len, w0, w1) {
    ctx.beginPath();
    ctx.moveTo(a, -w0);
    ctx.lineTo(a + len, -w1);
    ctx.arc(a + len, 0, w1, -Math.PI / 2, Math.PI / 2);
    ctx.lineTo(a, w0);
    ctx.arc(a, 0, w0, Math.PI / 2, -Math.PI / 2);
    ctx.closePath();
  }

  // ---------- The preview of the shot ----------
  function drawPreview(p) {
    if (!p) return;
    world(ctx);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const line = (pts, colour, width, dash) => {
      if (!pts || pts.length < 2) return;
      ctx.setLineDash(dash.map(px));
      ctx.lineWidth = px(width + 2.5);
      ctx.strokeStyle = 'rgba(0,20,40,.45)';
      stroke(pts);
      ctx.lineWidth = px(width);
      ctx.strokeStyle = colour;
      stroke(pts);
      ctx.setLineDash([]);
    };
    const stroke = (pts) => {
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (const q of pts.slice(1)) ctx.lineTo(q.x, q.y);
      ctx.stroke();
    };
    // The cue ball's way to the contact, then where it goes after.
    line(p.aim, 'rgba(255,255,255,.95)', 3, [1, 9]);
    line(p.cue, 'rgba(255,255,255,.75)', 2.5, [1, 8]);
    // The object ball's way: gold when it goes in.
    line(p.object, p.gold ? '#FFC83D' : 'rgba(255,255,255,.95)', 4, [0.1, 9]);
    if (p.ghost) {
      ctx.setLineDash([px(4), px(4)]);
      ctx.lineWidth = px(2);
      ctx.strokeStyle = 'rgba(255,255,255,.9)';
      ctx.beginPath();
      ctx.arc(p.ghost.x, p.ghost.y, R, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }
  // The balls he may play, at Facile: a thin soft-gold edge, so he sees them without moving the mouse.
  function drawMarks() {
    if (!state.marks.length) return;
    ctx.lineWidth = 3 * dpr;
    ctx.strokeStyle = 'rgba(255, 214, 120, .85)';
    for (const b of state.balls) {
      if (!state.marks.includes(b.id)) continue;
      const { X, Y } = toScreen(b.x, b.y);
      ctx.beginPath();
      ctx.arc(X, Y, R * s + 3.5 * dpr, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  function drawRings() {
    const t = performance.now() / 1000;
    for (const r of state.rings) {
      const { X, Y } = toScreen(r.x, r.y),
        rad = (r.r ?? R * 1.6) * s + (reduced() ? 0 : Math.sin(t * 3) * 1.5 * dpr);
      ctx.lineWidth = 5 * dpr;
      ctx.strokeStyle = '#1B2422';
      ctx.beginPath();
      ctx.arc(X, Y, rad + 1.5 * dpr, 0, Math.PI * 2);
      ctx.stroke();
      ctx.lineWidth = 4 * dpr;
      ctx.strokeStyle = '#FFC83D';
      ctx.beginPath();
      ctx.arc(X, Y, rad, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  function drawHand(h) {
    if (!h) return;
    const { X, Y } = toScreen(h.x, h.y),
      r = R * s;
    ctx.globalAlpha = h.ok ? 0.9 : 0.45;
    drawShadow(h);
    drawBall({ id: 0, x: h.x, y: h.y, q: [1, 0, 0, 0] });
    ctx.globalAlpha = 1;
    ctx.setLineDash(h.ok ? [6 * dpr, 4 * dpr] : []);
    ctx.lineWidth = 3 * dpr;
    ctx.strokeStyle = h.ok ? '#FFC83D' : '#FF6B5E';
    ctx.beginPath();
    ctx.arc(X, Y, r * 1.6, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  // The name of the ball under the mouse, in a cream label above it, large enough to read.
  function drawLabel(hv) {
    if (!hv) return;
    const { X, Y } = toScreen(hv.x, hv.y),
      text = hv.text;
    ctx.font = `700 ${20 * dpr}px Lexend, "Segoe UI", system-ui, sans-serif`;
    const w = ctx.measureText(text).width + 24 * dpr,
      h = 36 * dpr;
    let x = X - w / 2,
      y = Y - R * s - h - 10 * dpr;
    if (y < 4 * dpr) y = Y + R * s + 10 * dpr;
    x = Math.max(4 * dpr, Math.min(canvas.width - w - 4 * dpr, x));
    ctx.fillStyle = 'rgba(0,0,0,.3)';
    rounded(ctx, x + 2 * dpr, y + 3 * dpr, w, h, 10 * dpr);
    ctx.fill();
    ctx.fillStyle = '#FFF4D6';
    rounded(ctx, x, y, w, h, 10 * dpr);
    ctx.fill();
    ctx.fillStyle = '#1B2422';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x + w / 2, y + h / 2 + dpr);
  }

  // ---------- One frame ----------
  function draw() {
    if (!bg && !layout()) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bg, 0, 0);
    if (state.headLine) {
      world(ctx);
      ctx.setLineDash([px(6), px(6)]);
      ctx.lineWidth = px(2);
      ctx.strokeStyle = 'rgba(255,255,255,.55)';
      ctx.beginPath();
      ctx.moveTo(T.headString, 0);
      ctx.lineTo(T.headString, W);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    }
    for (const d of state.drops) drawShadow(d, 1 - 0.3 * d.k, 1 - d.k);
    for (const b of state.balls) drawShadow(b);
    drawPreview(state.preview);
    for (const d of state.drops) drawBall(d, 1 - 0.3 * d.k, Math.min(0.85, d.k * 1.1));
    for (const b of state.balls) drawBall(b);
    drawMarks();
    drawRings();
    drawHand(state.hand);
    drawCue(state.cue, state.balls.find((b) => b.id === 0) ?? state.hand);
    drawLabel(state.hover);
  }
  let queued = false;
  function redraw() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      draw();
      // The rings breathe: keep drawing while one shows.
      if (state.rings.length && !reduced()) redraw();
    });
  }
  new ResizeObserver(() => {
    bg = null;
    sprites.clear();
    if (layout()) draw();
  }).observe(canvas);

  // ---------- Animations ----------
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  // A frame that throws must never leave the game waiting: the animation ends at once, and the error
  // still reaches the error reports.
  const guard = (tick, finish) => (now) => {
    try {
      tick(now);
    } catch (err) {
      finish();
      setTimeout(() => {
        throw err;
      });
    }
  };
  function tween(ms, step) {
    if (reduced() || ms <= 0) {
      step(1);
      draw();
      return Promise.resolve();
    }
    return new Promise((done) => {
      const t0 = performance.now();
      const tick = guard((now) => {
        const k = Math.min(1, (now - t0) / ms);
        step(k);
        draw();
        if (k < 1) requestAnimationFrame(tick);
        else done();
      }, done);
      requestAnimationFrame(tick);
    });
  }
  const ease = (k) => (k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2);
  // The cue turns from one direction to another, the shorter way round.
  function turnCue(from, to, ms = 700) {
    let d = ((to - from + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    return tween(ms, (k) => {
      state.cue = { angle: from + d * ease(k), pull: 0.03, alpha: 1 };
    });
  }
  // The stroke: the cue draws back slowly, then comes through fast to the ball.
  async function stroke(angle, power) {
    const back = 0.04 + power * 0.012;
    await tween(380 + power * 25, (k) => {
      state.cue = { angle, pull: 0.03 + (back - 0.03) * ease(k), alpha: 1 };
    });
    await wait(reduced() ? 0 : 120);
    await tween(Math.max(55, 150 - power * 9), (k) => {
      state.cue = { angle, pull: back * (1 - k * k), alpha: 1 };
    });
    window.Sound?.play('hit');
  }
  // The shot itself: the frames of the engine at their own times, then each pocketed ball drops into its pocket.
  function play(sim) {
    const frames = sim.frames ?? [];
    // Each ball that falls leaves the frames where the engine caught it, at (x, y) with its speed (vx, vy).
    // It keeps rolling into the hole and sinks, slower when it came in slowly.
    const drops = (sim.events ?? [])
      .filter((ev) => ev.type === 'pocket' && ev.drop)
      .map((ev) => {
        const h = holeOf(T, T.pockets.find((p) => p.id === ev.pocket) ?? { ...ev.drop }),
          drop = { x: h.x, y: h.y },
          d = Math.hypot(drop.x - ev.x, drop.y - ev.y),
          v = Math.max(0.35, Math.hypot(ev.vx ?? 0, ev.vy ?? 0));
        // The curve's middle point: a little way along its speed, never further than half the way in.
        const reach = Math.min(d * 0.5, v * 0.06),
          control = { x: ev.x + ((ev.vx ?? 0) / v) * reach, y: ev.y + ((ev.vy ?? 0) / v) * reach };
        return { ...ev, drop, control, id: ev.a, span: Math.min(0.5, Math.max(0.2, (d / v) * 1.6)) };
      });
    const DROP = drops.reduce((m, d) => Math.max(m, d.span), 0);
    if (reduced() || !frames.length) {
      if (sim.pocketed?.length) setTimeout(() => window.Sound?.play('pocket'), 300);
      state.cue = null;
      state.drops = [];
      state.balls = (sim.balls ?? []).map((b) => ({ ...b }));
      draw();
      return Promise.resolve();
    }
    const end = frames.at(-1).t + DROP;
    const last = new Map(); // the last place seen of each ball, where a falling ball starts
    // The knocks of the balls, in time order. A rattle of the same kind plays at most once per 80 ms.
    const knocks = (sim.events ?? []).filter((ev) => ev.type === 'pocket' || ev.speed > 0.05),
      heard = {};
    let due = 0;
    return new Promise((done) => {
      const t0 = performance.now();
      const finish = () => {
        state.drops = [];
        state.cue = null;
        state.balls = (sim.balls ?? []).map((x) => ({ ...x, q: last.get(x.id)?.q ?? x.q }));
        draw();
        done();
      };
      const tick = guard((now) => {
        const t = (now - t0) / 1000;
        for (; due < knocks.length && knocks[due].t <= t; due++) {
          const ev = knocks[due],
            name = ev.type === 'ball' ? 'clack' : ev.type === 'pocket' ? 'pocket' : 'cushion';
          if (name !== 'pocket' && now - (heard[name] ?? -Infinity) < 80) continue;
          heard[name] = now;
          window.Sound?.play(name);
        }
        // The frame at or before t, and the next one, mixed.
        let i = Math.min(frames.length - 1, Math.max(0, Math.floor(t * 60)));
        while (i > 0 && frames[i].t > t) i--;
        while (i < frames.length - 1 && frames[i + 1].t <= t) i++;
        const a = frames[i],
          b = frames[Math.min(frames.length - 1, i + 1)],
          k = b.t > a.t ? Math.min(1, Math.max(0, (t - a.t) / (b.t - a.t))) : 0;
        const next = new Map(b.balls.map((x) => [x.id, x]));
        state.balls = a.balls.map((x) => {
          const y = next.get(x.id) ?? x,
            ball = { id: x.id, x: x.x + (y.x - x.x) * k, y: x.y + (y.y - x.y) * k, q: slerp(x.q, y.q, k) };
          last.set(x.id, ball);
          return ball;
        });
        // The cue follows through a few centimetres and fades.
        if (state.cue) {
          const c = Math.min(1, t / 0.35);
          state.cue = c >= 1 ? null : { ...state.cue, pull: -0.025 * Math.sin(c * Math.PI / 2), alpha: 1 - c };
        }
        state.drops = [];
        for (const d of drops) {
          const k2 = (t - d.t) / d.span;
          if (k2 < 0 || k2 >= 1) continue;
          // It leaves along its own speed and curves into the middle of the hole, never past it.
          const c = d.control,
            u = 1 - (1 - k2) * (1 - k2),
            m = 1 - u;
          state.drops.push({
            id: d.id,
            q: last.get(d.id)?.q,
            x: m * m * d.x + 2 * m * u * c.x + u * u * d.drop.x,
            y: m * m * d.y + 2 * m * u * c.y + u * u * d.drop.y,
            k: k2
          });
        }
        draw();
        if (t < end) requestAnimationFrame(tick);
        else finish();
      }, finish);
      requestAnimationFrame(tick);
    });
  }

  layout();
  return {
    state,
    draw: redraw,
    toTable,
    toScreen: (x, y) => {
      const { X, Y } = toScreen(x, y);
      return { x: X / dpr, y: Y / dpr };
    },
    turnCue,
    stroke,
    play,
    wait
  };
}

// ---------- Small helpers ----------
function norm(v) {
  const d = Math.hypot(...v);
  return v.map((x) => x / d);
}
function rounded(g, x, y, w, h, r) {
  g.beginPath();
  g.roundRect(x, y, w, h, r);
}
// The rotation matrix of a unit quaternion [w, x, y, z], row by row.
function matrix([w, x, y, z]) {
  return [
    1 - 2 * (y * y + z * z), 2 * (x * y - w * z), 2 * (x * z + w * y),
    2 * (x * y + w * z), 1 - 2 * (x * x + z * z), 2 * (y * z - w * x),
    2 * (x * z - w * y), 2 * (y * z + w * x), 1 - 2 * (x * x + y * y)
  ];
}
function slerp(a, b, k) {
  if (!a || !b) return a ?? b ?? [1, 0, 0, 0];
  let d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
  const s = d < 0 ? -1 : 1;
  d *= s;
  // Close orientations: a plain mix is enough, then normalised.
  const out = a.map((v, i) => v * (1 - k) + s * b[i] * k);
  return norm(out);
}
