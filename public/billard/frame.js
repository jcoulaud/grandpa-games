// The table without its balls, drawn once per size in table metres, the way a real table looks from above
// (see the Wikipedia diagram of an American pool table): walnut rails, a black pocket plate at each pocket,
// the cloth under a lamp, the round hole of each pocket, and six cushions whose jaws lean in towards the
// pocket. The cushions are the engine's own collision lines, so a ball bounces where the rubber shows.

export const WOOD = 0.115, // the visible wood beyond the cushions
  CUSHION = 0.05; // the cushion rubber, from its nose to the wood
export const CLOTH = [42, 116, 176];
const rgb = (c, a = 1) => `rgba(${c.map((v) => Math.round(Math.max(0, Math.min(255, v)))).join(',')},${a})`;
const shade = (c, d) => c.map((v) => v + d);

export function drawFrame(g, T, px) {
  const { L, W } = T,
    out = WOOD + CUSHION;
  wood(g, L, W, out, px);
  const holes = T.pockets.map((p) => holeOf(T, p));
  for (const h of holes) plate(g, T, h, px);
  // The cloth, lit by a lamp over the middle of the table, up to the wood.
  const lamp = g.createRadialGradient(L / 2, W / 2, 0.05, L / 2, W / 2, L * 0.62);
  lamp.addColorStop(0, rgb(shade(CLOTH, 16)));
  lamp.addColorStop(0.55, rgb(CLOTH));
  lamp.addColorStop(1, rgb(shade(CLOTH, -14)));
  g.fillStyle = lamp;
  g.fillRect(-CUSHION, -CUSHION, L + 2 * CUSHION, W + 2 * CUSHION);
  // A fine twill, so the cloth does not look like plastic.
  g.save();
  g.beginPath();
  g.rect(-CUSHION, -CUSHION, L + 2 * CUSHION, W + 2 * CUSHION);
  g.clip();
  g.globalAlpha = 0.045;
  g.strokeStyle = '#001020';
  g.lineWidth = px(0.6);
  g.beginPath();
  for (let x = -CUSHION - W; x < L + CUSHION; x += px(3)) {
    g.moveTo(x, -CUSHION);
    g.lineTo(x + W + 2 * CUSHION, W + CUSHION);
  }
  g.stroke();
  g.restore();
  // The holes, then the cushions over their edges, as the rubber overhangs the slate.
  for (const h of holes) hole(g, h, px);
  for (const r of railsOf(T)) cushion(g, r, px);
  diamonds(g, L, W, px);
  // The foot spot and the head spot, two small marks on the cloth.
  g.fillStyle = 'rgba(255,255,255,.32)';
  for (const p of [T.footSpot, T.headSpot]) {
    g.beginPath();
    g.arc(p.x, p.y, px(2.5), 0, Math.PI * 2);
    g.fill();
  }
}

function frameShape(g, L, W, out) {
  g.beginPath();
  g.roundRect(-out, -out, L + 2 * out, W + 2 * out, 0.06);
}

// Walnut, with a grain along each rail, mitred at the corners, and a soft bevel on its outer edge.
function wood(g, L, W, out, px) {
  const grad = g.createLinearGradient(0, -out, 0, W + out);
  grad.addColorStop(0, '#7E4726');
  grad.addColorStop(0.5, '#5A2E16');
  grad.addColorStop(1, '#6C391D');
  frameShape(g, L, W, out);
  g.fillStyle = grad;
  g.fill();
  // Each rail is its own plank, mitred at the corners, with its grain along it.
  const i = CUSHION,
    planks = [
      [[-out, -out], [L + out, -out], [L + i, -i], [-i, -i]],
      [[-out, W + out], [L + out, W + out], [L + i, W + i], [-i, W + i]],
      [[-out, -out], [-i, -i], [-i, W + i], [-out, W + out]],
      [[L + out, -out], [L + i, -i], [L + i, W + i], [L + out, W + out]]
    ];
  let seed = 7;
  const rnd = () => (seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) / 4294967296;
  g.lineWidth = px(1);
  planks.forEach((corners, k) => {
    g.save();
    frameShape(g, L, W, out);
    g.clip();
    g.beginPath();
    corners.forEach(([x, y], j) => (j ? g.lineTo(x, y) : g.moveTo(x, y)));
    g.closePath();
    g.clip();
    const long = k < 2,
      from = long ? (k ? W + i : -out) : k === 2 ? -out : L + i;
    for (let n = 0; n < (long ? 34 : 18); n++) {
      const at = from + rnd() * WOOD,
        a = 0.04 + rnd() * 0.08,
        wave = () => (rnd() - 0.5) * 0.008;
      g.strokeStyle = rnd() < 0.55 ? `rgba(30,12,4,${a})` : `rgba(255,214,170,${a * 0.55})`;
      g.beginPath();
      if (long) {
        g.moveTo(-out, at);
        g.bezierCurveTo(L * 0.3, at + wave(), L * 0.7, at + wave(), L + out, at);
      } else {
        g.moveTo(at, -out);
        g.bezierCurveTo(at + wave(), W * 0.3, at + wave(), W * 0.7, at, W + out);
      }
      g.stroke();
    }
    g.restore();
  });
  // A bevel: light on the outer edge, then a darker step before the cushions.
  g.lineWidth = px(2);
  g.strokeStyle = 'rgba(255,222,184,.32)';
  g.beginPath();
  g.roundRect(-out + px(1.5), -out + px(1.5), L + 2 * out - px(3), W + 2 * out - px(3), 0.058);
  g.stroke();
  g.lineWidth = px(3);
  g.strokeStyle = 'rgba(0,0,0,.25)';
  g.strokeRect(-CUSHION - px(4), -CUSHION - px(4), L + 2 * CUSHION + px(8), W + 2 * CUSHION + px(8));
}

// The round hole of a pocket: the engine's slate hole when it gives one, else a circle around its drop point.
export function holeOf(T, pk) {
  const h = pk.hole ?? { ...(pk.drop ?? pk), r: pk.radius ?? 0.06 },
    corner = Math.abs(h.x - T.L / 2) > T.L / 4;
  return { id: pk.id, x: h.x, y: h.y, r: h.r, corner };
}

// The pocket plate: black rubber over the rail around each pocket, a rounded block at a corner and a
// rounded tab at the middle of a long rail, as on the diagram of a real table.
function plate(g, T, h, px) {
  const { L, W } = T,
    s = WOOD * 0.78 + CUSHION,
    grad = g.createRadialGradient(h.x, h.y, h.r, h.x, h.y, h.r + s);
  grad.addColorStop(0, '#2E2E31');
  grad.addColorStop(1, '#1A1A1C');
  g.fillStyle = grad;
  const ext = s - CUSHION,
    box = (x0, x1, y0, y1, radius) => g.roundRect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0), radius);
  g.beginPath();
  if (h.corner) {
    const x = h.x < L / 2 ? -CUSHION : L + CUSHION,
      y = h.y < W / 2 ? -CUSHION : W + CUSHION,
      dx = x < 0 ? -1 : 1,
      dy = y < 0 ? -1 : 1,
      reach = h.r * 1.9;
    // Along both rails a little past the hole, rounded on the outside.
    box(x - dx * reach, x + dx * ext, y, y + dy * ext, 0.025);
    box(x, x + dx * ext, y - dy * reach, y + dy * ext, 0.025);
  } else {
    const y = h.y < W / 2 ? -CUSHION : W + CUSHION,
      dy = y < 0 ? -1 : 1,
      w = h.r * 2.7;
    box(h.x - w / 2, h.x + w / 2, y - dy * 0.01, y + dy * ext, 0.025);
  }
  g.fill();
}

// The hole: black on the near side, its far inner wall a little lighter, as when one looks into it,
// inside a thin rubber rim.
function hole(g, { x, y, r }, px) {
  g.fillStyle = '#121214';
  g.beginPath();
  g.arc(x, y, r + px(3), 0, Math.PI * 2);
  g.fill();
  const grad = g.createRadialGradient(x + r * 0.25, y + r * 0.25, r * 0.1, x, y, r);
  grad.addColorStop(0, '#000');
  grad.addColorStop(0.7, '#030304');
  grad.addColorStop(1, '#1C1C1F');
  g.fillStyle = grad;
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.fill();
}

// The cushion of each rail, in the engine's order: a jaw, the nose, the other jaw, with the side towards the wood.
function railsOf(T) {
  const mid = { x: T.L / 2, y: T.W / 2 },
    rails = [];
  for (let i = 0; i + 2 < T.cushions.length; i += 3) {
    const [j0, nose, j1] = T.cushions.slice(i, i + 3),
      dx = nose.b.x - nose.a.x,
      dy = nose.b.y - nose.a.y,
      d = Math.hypot(dx, dy);
    let n = { x: -dy / d, y: dx / d };
    if (n.x * (nose.a.x - mid.x) + n.y * (nose.a.y - mid.y) < 0) n = { x: -n.x, y: -n.y };
    const depth = (p) => (p.x - nose.a.x) * n.x + (p.y - nose.a.y) * n.y;
    // Each jaw carries on to the back of the cushion, where the wood starts.
    const toBack = (a, b) => {
      const da = depth(a),
        db = depth(b),
        k = Math.abs(db - da) < 1e-9 ? 1 : (CUSHION - da) / (db - da);
      return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
    };
    rails.push({ nose, n, start: toBack(j0.b, j0.a), end: toBack(j1.a, j1.b) });
  }
  return rails;
}
// A cushion: the lamp lights the bevel of its nose, then its flat top darkens towards the wood. Its two jaws
// are rubber faces that turn away from the lamp.
function cushion(g, { nose, n, start, end }, px) {
  const shape = () => {
    g.beginPath();
    g.moveTo(start.x, start.y);
    g.lineTo(nose.a.x, nose.a.y);
    g.lineTo(nose.b.x, nose.b.y);
    g.lineTo(end.x, end.y);
    g.closePath();
  };
  // A soft shadow on the cloth along the nose.
  const sh = g.createLinearGradient(nose.a.x, nose.a.y, nose.a.x - n.x * 0.016, nose.a.y - n.y * 0.016);
  sh.addColorStop(0, 'rgba(0,12,30,.4)');
  sh.addColorStop(1, 'rgba(0,12,30,0)');
  g.fillStyle = sh;
  g.beginPath();
  g.moveTo(nose.a.x, nose.a.y);
  g.lineTo(nose.b.x, nose.b.y);
  g.lineTo(nose.b.x - n.x * 0.016, nose.b.y - n.y * 0.016);
  g.lineTo(nose.a.x - n.x * 0.016, nose.a.y - n.y * 0.016);
  g.closePath();
  g.fill();
  const band = g.createLinearGradient(nose.a.x, nose.a.y, nose.a.x + n.x * CUSHION, nose.a.y + n.y * CUSHION);
  band.addColorStop(0, rgb(shade(CLOTH, 34)));
  band.addColorStop(0.26, rgb(shade(CLOTH, 16)));
  band.addColorStop(0.28, rgb(shade(CLOTH, -12)));
  band.addColorStop(1, rgb(shade(CLOTH, -24)));
  g.fillStyle = band;
  shape();
  g.fill();
  // The edges: dark where the cushion meets the cloth and the wood, a bright line along the nose.
  g.lineJoin = 'round';
  g.lineWidth = px(1.2);
  g.strokeStyle = 'rgba(0,10,28,.5)';
  shape();
  g.stroke();
  g.strokeStyle = 'rgba(255,255,255,.3)';
  g.beginPath();
  g.moveTo(nose.a.x + n.x * px(1.6), nose.a.y + n.y * px(1.6));
  g.lineTo(nose.b.x + n.x * px(1.6), nose.b.y + n.y * px(1.6));
  g.stroke();
}

// Mother-of-pearl diamonds on the rails, at the eighths of the long rails and the quarters of the short ones.
function diamonds(g, L, W, px) {
  const rail = CUSHION + WOOD * 0.5;
  const dm = (x, y, turn) => {
    const d = 0.012;
    g.save();
    g.translate(x, y);
    if (turn) g.rotate(Math.PI / 2);
    g.beginPath();
    g.moveTo(-d, 0);
    g.lineTo(0, -d * 0.55);
    g.lineTo(d, 0);
    g.lineTo(0, d * 0.55);
    g.closePath();
    g.fillStyle = 'rgba(0,0,0,.35)';
    g.translate(px(0.8), px(1.2));
    g.fill();
    g.translate(-px(0.8), -px(1.2));
    const pearl = g.createLinearGradient(-d, -d, d, d);
    pearl.addColorStop(0, '#FFFFFF');
    pearl.addColorStop(0.5, '#EDE6F2');
    pearl.addColorStop(1, '#CFC6B5');
    g.fillStyle = pearl;
    g.fill();
    g.restore();
  };
  for (let i = 1; i < 8; i++) {
    if (i === 4) continue;
    dm((L * i) / 8, -rail);
    dm((L * i) / 8, W + rail);
  }
  for (let j = 1; j < 4; j++) {
    dm(-rail, (W * j) / 4, true);
    dm(L + rail, (W * j) / 4, true);
  }
}
