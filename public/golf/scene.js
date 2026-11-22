// The 3D view of a hole: a small floating island with the lane, its obstacles and some scenery, seen
// through a still perspective camera framed on the hole. Three.js 0.160.1, vendored with its MIT licence
// for offline play. The scene draws a frame only while something moves.
import * as T from '../lib/three/three.module.min.js';
import { height, radius, millAngle, dt, borders, reveal, FADE, random, free } from './engine.js';

const PITCH = (48 * Math.PI) / 180,
  FOV = 30,
  SPEED = 1.25; // the shot plays a little faster than real time
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
// Scenery colours: one set per hole, picked by the generator.
const PALETTES = [
  { rail: 0xc98d52, leaves: [0x4e9a3a, 0x3d8636, 0x69ad41], flowers: [0xffc83d, 0xff7b67, 0xffffff, 0xd07ef0], meadow: 0x9dcb68 },
  { rail: 0xf1ece2, leaves: [0x7c9b48, 0x66883c, 0x93ad55], flowers: [0x9d7ad8, 0xb89cf0, 0xffffff, 0xffd35c], meadow: 0xb2ca6e },
  { rail: 0xb06d3c, leaves: [0xe58b2f, 0xd45a2b, 0xe9b53a, 0x7aa43f], flowers: [0xffc83d, 0xff8c42, 0xffffff, 0xe0453a], meadow: 0xa9c460 },
  { rail: 0xdcb37e, leaves: [0xf3a7c8, 0x6aad41, 0xf6bfd8], flowers: [0xff9ec7, 0xffffff, 0xffc83d, 0x8ec5ff], meadow: 0x98cb66 }
];

function canvasTexture(size, draw, repeat = true) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new T.CanvasTexture(c);
  t.colorSpace = T.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = T.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}
const noise = (g, size, n, alpha, light) => {
  const rnd = random(size * 7 + n);
  for (let i = 0; i < n; i++) {
    g.fillStyle = `rgba(${light ? '255,255,255' : '0,0,0'},${alpha * rnd()})`;
    g.fillRect(rnd() * size, rnd() * size, 1 + rnd() * 2, 1 + rnd() * 2);
  }
};

export function createScene(canvas) {
  const renderer = new T.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFSoftShadowMap;
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  renderer.setClearColor(0x000000, 0);
  const scene = new T.Scene(),
    camera = new T.PerspectiveCamera(FOV, 1, 0.5, 200);
  scene.add(new T.HemisphereLight(0xe4f2ff, 0x6c7f45, 1.35));
  const sun = new T.DirectionalLight(0xfff1d9, 2.5);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.02;
  sun.shadow.radius = 3;
  scene.add(sun, sun.target);

  // ---------- Shared textures and materials ----------
  const turfMap = canvasTexture(256, (g, s) => {
    // Two mowing bands, light and dark, with fine grain.
    g.fillStyle = '#3f9e4f';
    g.fillRect(0, 0, s, s);
    g.fillStyle = '#48aa57';
    g.fillRect(0, 0, s / 2, s);
    noise(g, s, 5000, 0.12, false);
    noise(g, s, 3000, 0.1, true);
  });
  const grain = canvasTexture(256, (g, s) => {
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, s, s);
    const rnd = random(11);
    for (let i = 0; i < 70; i++) {
      g.strokeStyle = `rgba(90,55,20,${0.05 + 0.1 * rnd()})`;
      g.lineWidth = 1 + rnd() * 2;
      g.beginPath();
      const y = rnd() * s;
      g.moveTo(0, y);
      g.bezierCurveTo(s / 3, y + rnd() * 8 - 4, (2 * s) / 3, y + rnd() * 8 - 4, s, y);
      g.stroke();
    }
  });
  const stoneMap = canvasTexture(128, (g, s) => {
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, s, s);
    noise(g, s, 2600, 0.16, false);
  });
  const meadowMap = canvasTexture(256, (g, s) => {
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, s, s);
    noise(g, s, 6000, 0.09, false);
    noise(g, s, 3000, 0.12, true);
  });
  const cupMap = canvasTexture(
    256,
    (g, s) => {
      const c = s / 2;
      g.fillStyle = '#ffffff';
      g.beginPath();
      g.arc(c, c, c, 0, Math.PI * 2);
      g.fill();
      // Inside: dark, with the far wall lit, as seen from above at an angle.
      const r = c * 0.86,
        grad = g.createLinearGradient(0, c - r, 0, c + r);
      grad.addColorStop(0, '#6d6f69');
      grad.addColorStop(0.3, '#2b2e2a');
      grad.addColorStop(1, '#0d0f0d');
      g.fillStyle = grad;
      g.beginPath();
      g.arc(c, c, r, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#0a0b0a';
      g.beginPath();
      g.ellipse(c, c + r * 0.2, r * 0.78, r * 0.7, 0, 0, Math.PI * 2);
      g.fill();
    },
    false
  );
  const ballMap = canvasTexture(
    256,
    (g, s) => {
      g.fillStyle = '#ffffff';
      g.fillRect(0, 0, s, s);
      const rnd = random(5);
      for (let i = 0; i < 260; i++) {
        g.fillStyle = `rgba(150,160,170,${0.18 + 0.12 * rnd()})`;
        g.beginPath();
        g.arc(rnd() * s, rnd() * s, 3 + rnd() * 2, 0, Math.PI * 2);
        g.fill();
      }
      // A thin band so the roll shows.
      g.fillStyle = 'rgba(230,60,50,.75)';
      g.fillRect(0, s * 0.47, s, s * 0.06);
    },
    false
  );
  const shadowMap = canvasTexture(
    128,
    (g, s) => {
      const grad = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
      grad.addColorStop(0, 'rgba(10,40,30,.4)');
      grad.addColorStop(1, 'rgba(10,40,30,0)');
      g.fillStyle = grad;
      g.fillRect(0, 0, s, s);
    },
    false
  );
  const std = (color, extra = {}) => new T.MeshStandardMaterial({ color, roughness: 0.85, ...extra });
  const M = {
    // The turf strips and the rails are wound either way: draw both faces.
    turf: std(0xffffff, { map: turfMap, roughness: 0.95, vertexColors: true, side: T.DoubleSide }),
    stoneDark: std(0x9c9384, { map: stoneMap, side: T.DoubleSide }),
    mound: std(0x5daa4c, { map: meadowMap }),
    brick: std(0xc4613d, { map: stoneMap }),
    slate: std(0x56606b, { flatShading: true }),
    inside: std(0x3b3833, { side: T.BackSide, roughness: 1 }),
    soil: std(0x8b5a36, { roughness: 1 }),
    soilDark: std(0x6d4329, { roughness: 1 }),
    stone: std(0xe0d8c7, { map: stoneMap }),
    plaster: std(0xf6efe0, { map: stoneMap }),
    wood: std(0xa86b39, { map: grain, roughness: 0.7, side: T.DoubleSide }),
    deck: std(0xc58d55, { map: grain, roughness: 0.7 }),
    water: std(0x46a9d6, { roughness: 0.12, metalness: 0.1 }),
    waterRim: std(0xa5dcef, { roughness: 0.4 }),
    ball: std(0xffffff, { map: ballMap, roughness: 0.35, emissive: 0x2a2a2a }),
    cup: new T.MeshStandardMaterial({ map: cupMap, transparent: true, roughness: 0.9 }),
    pole: std(0xffffff, { roughness: 0.4 }),
    mat: std(0x2f6f3d, { roughness: 1 }),
    white: std(0xffffff),
    red: std(0xe0402f, { roughness: 0.6 }),
    stem: std(0xf4ecd8),
    trunk: std(0x7a4e2d, { flatShading: true }),
    stalk: std(0x3f7d34),
    petal: std(0xffffff, { flatShading: true, roughness: 0.6 }),
    rock: std(0xb9b3a7, { flatShading: true }),
    sail: std(0xffffff, { side: T.DoubleSide, roughness: 0.6 }),
    spar: std(0x5e3b22),
    contact: new T.MeshBasicMaterial({ map: shadowMap, transparent: true, depthWrite: false }),
    dot: new T.MeshBasicMaterial({ color: 0xffffff, depthTest: false, transparent: true }),
    gold: new T.MeshBasicMaterial({ color: 0xffc83d, depthTest: false, transparent: true, side: T.DoubleSide }),
    ring: new T.MeshBasicMaterial({ color: 0xffffff, depthTest: false, transparent: true, side: T.DoubleSide }),
    halo: new T.MeshBasicMaterial({ color: 0xffc83d, transparent: true, opacity: 0.95, side: T.DoubleSide, depthWrite: false })
  };
  const leafMats = new Map(),
    leaf = (c) => leafMats.get(c) || (leafMats.set(c, std(c, { flatShading: true, roughness: 0.9 })), leafMats.get(c));

  let h = null,
    course = null,
    ballMesh,
    halo,
    flag,
    flagBase,
    sails = null,
    arches = [],
    cupDisc,
    preview,
    island = null,
    yaw = 0;
  const dots = new T.InstancedMesh(new T.SphereGeometry(0.065, 12, 8), M.dot, 400);
  dots.renderOrder = 10;
  dots.frustumCulled = false;
  dots.setColorAt(0, new T.Color(0xffffff)); // per-dot colours, for the fade
  const gold = new T.InstancedMesh(new T.SphereGeometry(0.065, 12, 8), M.gold, 400);
  gold.renderOrder = 10;
  gold.frustumCulled = false;
  // The last shot stays on the turf as a faint trail, until he aims the next one: then only the new
  // preview shows, so two dotted lines never mix.
  const trail = new T.InstancedMesh(new T.SphereGeometry(0.035, 8, 6), new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.3, depthTest: false }), 400);
  trail.renderOrder = 9;
  trail.frustumCulled = false;
  trail.count = 0;
  const ringGeo = (r, w) => new T.RingGeometry(r - w, r, 48).rotateX(-Math.PI / 2);
  const targetRing = new T.Mesh(ringGeo(0.26, 0.07), M.gold),
    stopRing = new T.Mesh(ringGeo(0.2, 0.06), M.ring);
  targetRing.renderOrder = stopRing.renderOrder = 11;

  const mesh = (parent, geometry, material, x = 0, y = 0, z = 0, shadow = true) => {
    const m = new T.Mesh(geometry, material);
    m.position.set(x, y, z);
    m.castShadow = shadow;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  };
  const yAt = (x, z) => height(h, x, z);

  // ---------- Lane pieces ----------
  // The turf follows the lane's centre line in strips, so the mowing bands follow the bends.
  function turf() {
    const { left, right } = borders(h.spine),
      maxW = Math.max(...h.spine.map((p) => p[2])),
      across = Math.ceil(maxW / 0.16),
      pos = [],
      uv = [],
      col = [],
      index = [];
    let arc = 0;
    for (let k = 0; k < h.spine.length - 1; k++) {
      const a = h.spine[k],
        b = h.spine[k + 1],
        len = Math.hypot(b[0] - a[0], b[1] - a[1]),
        along = Math.max(2, Math.ceil(len / 0.16)),
        base = pos.length / 3;
      for (let i = 0; i <= along; i++) {
        const t = i / along,
          L = [left[k][0] + (left[k + 1][0] - left[k][0]) * t, left[k][1] + (left[k + 1][1] - left[k][1]) * t],
          R = [right[k][0] + (right[k + 1][0] - right[k][0]) * t, right[k][1] + (right[k + 1][1] - right[k][1]) * t];
        for (let j = 0; j <= across; j++) {
          const s = j / across,
            x = L[0] + (R[0] - L[0]) * s,
            z = L[1] + (R[1] - L[1]) * s;
          const y = yAt(x, z),
            k = Math.max(0.62, Math.min(1.45, 1 + y * 1.5));
          pos.push(x, y, z);
          col.push(k, k, k);
          uv.push((arc + len * t) / 1.5, (s * maxW) / 1.5);
        }
      }
      for (let i = 0; i < along; i++)
        for (let j = 0; j < across; j++) {
          const p = base + i * (across + 1) + j,
            q = p + across + 1;
          index.push(p, q, p + 1, p + 1, q, q + 1);
        }
      arc += len;
    }
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
    // Higher turf is lighter and lower turf darker, so hills, dips and the raised green read at a glance.
    g.setAttribute('color', new T.Float32BufferAttribute(col, 3));
    g.setIndex(index);
    g.computeVertexNormals();
    // Strips wound either way: make every normal point up.
    const n = g.attributes.normal;
    for (let i = 0; i < n.count; i++) if (n.getY(i) < 0) n.setXYZ(i, -n.getX(i), -n.getY(i), -n.getZ(i));
    return mesh(course, g, M.turf, 0, 0, 0, false);
  }
  // A rounded rail along a closed loop. side 1 puts it outside the loop, -1 inside it, so its face is
  // where the ball bounces. top(x, z) is the height of the top, base the height of the foot.
  function rail(loop, side, thick, tall, material, base = -0.06, follow = true) {
    let area = 0;
    loop.forEach((a, i) => {
      const b = loop[(i + 1) % loop.length];
      area += a[0] * b[1] - b[0] * a[1];
    });
    const sign = (area > 0 ? -1 : 1) * side,
      n = loop.map((a, i) => {
        const b = loop[(i + 1) % loop.length],
          l = Math.hypot(b[0] - a[0], b[1] - a[1]);
        return [(-(b[1] - a[1]) / l) * sign, ((b[0] - a[0]) / l) * sign];
      });
    const mitre = loop.map((_, i) => {
      const p = n[(i + loop.length - 1) % loop.length],
        q = n[i];
      let mx = p[0] + q[0],
        mz = p[1] + q[1];
      const ml = Math.hypot(mx, mz) || 1;
      mx /= ml;
      mz /= ml;
      const k = 1 / Math.max(0.35, mx * q[0] + mz * q[1]);
      return [mx * k, mz * k];
    });
    const arcs = 7,
      profile = [[0, null]];
    for (let k = 0; k <= arcs; k++) {
      const t = Math.PI - (Math.PI * k) / arcs;
      profile.push([thick / 2 + (thick / 2) * Math.cos(t), (thick / 2) * Math.sin(t) - thick / 2]);
    }
    profile.push([thick, null]);
    const pos = [],
      uv = [],
      index = [];
    loop.forEach((a, i) => {
      const j = (i + 1) % loop.length,
        b = loop[j],
        len = Math.hypot(b[0] - a[0], b[1] - a[1]),
        count = Math.max(1, Math.ceil(len / 0.3)),
        start = pos.length / 3;
      for (let s = 0; s <= count; s++) {
        const t = s / count,
          x = a[0] + (b[0] - a[0]) * t,
          z = a[1] + (b[1] - a[1]) * t,
          off = s === 0 ? mitre[i] : s === count ? mitre[j] : n[i],
          top = (follow ? yAt(x, z) : 0) + tall;
        profile.forEach(([o, dy], p) => {
          pos.push(x + off[0] * o, dy === null ? Math.min(base, top - tall - 0.05) : top + dy, z + off[1] * o);
          uv.push((len * t) / 1.2, p / profile.length);
        });
      }
      const w = profile.length;
      for (let s = 0; s < count; s++)
        for (let p = 0; p < w - 1; p++) {
          const q = start + s * w + p,
            r = q + w;
          if (sign > 0) index.push(q, q + 1, r, r, q + 1, r + 1);
          else index.push(q, r, q + 1, q + 1, r, r + 1);
        }
    });
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
    g.setIndex(index);
    g.computeVertexNormals();
    return mesh(course, g, material);
  }
  const shapeWithoutHoles = (shape) => new T.Shape(shape.getPoints(10));
  const shapeOf = (pts) => new T.Shape(pts.map(([x, z]) => new T.Vector2(x, -z)));
  // A solid block from a closed shape on the ground, tall metres high.
  function block(pts, tall, material, bevel = 0.04) {
    const g = new T.ExtrudeGeometry(shapeOf(pts), { depth: tall - bevel, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelOffset: -bevel, bevelSegments: 2 });
    g.rotateX(-Math.PI / 2);
    return mesh(course, g, material);
  }
  function flat(pts, y, material) {
    const g = new T.ShapeGeometry(shapeOf(pts));
    g.rotateX(-Math.PI / 2);
    return mesh(course, g, material, 0, y, 0, false);
  }
  // Positions along a part, u along the lane and v across it.
  const along = (p, u, v) => [p.x + p.dx * u - p.dz * v, p.z + p.dz * u + p.dx * v];
  const angleOf = (p) => Math.atan2(-p.dz, p.dx);

  function parts(pal) {
    for (const p of h.parts) {
      if (p.kind === 'bank') {
        flat([p.a, p.c, p.b], 0.012, M.soil);
        rail([p.a, p.b, p.c], -1, 0.12, 0.2, M.wood);
        const rnd = random(Math.round(p.a[0] * 1000) >>> 0);
        for (let i = 0; i < 9; i++) {
          const s = rnd(),
            t = rnd() * (1 - s),
            x = p.c[0] + (p.a[0] - p.c[0]) * (s * 0.8 + 0.08) + (p.b[0] - p.c[0]) * (t * 0.8 + 0.06),
            z = p.c[1] + (p.a[1] - p.c[1]) * (s * 0.8 + 0.08) + (p.b[1] - p.c[1]) * (t * 0.8 + 0.06);
          flower(x, z, pal.flowers[i % pal.flowers.length], 0.5 + rnd() * 0.4);
        }
      } else if (p.kind === 'bridge') {
        // Planks across the channel, low wooden kerbs along the water, and four posts.
        const planks = Math.round(p.len / 0.2);
        for (let i = 0; i < planks; i++) {
          const [x, z] = along(p, -p.len / 2 + ((i + 0.5) * p.len) / planks, 0),
            m = mesh(course, new T.BoxGeometry(p.len / planks - 0.025, 0.03, p.width + 0.05), M.deck, x, 0.012, z, false);
          m.rotation.y = angleOf(p);
        }
        for (const u of [-1, 1])
          for (const v of [-1, 1]) {
            const [x, z] = along(p, (u * p.len) / 2, v * (p.width / 2 + 0.07));
            mesh(course, new T.CylinderGeometry(0.05, 0.06, 0.42, 10), M.wood, x, 0.21, z);
            mesh(course, new T.SphereGeometry(0.065, 12, 8), M.wood, x, 0.44, z);
          }
      } else if (p.kind === 'tunnel') {
        // A stone arch over the channel.
        const r = p.width / 2 + 0.16,
          g = new T.CylinderGeometry(r, r, p.len, 24, 1, true, 0, Math.PI);
        g.rotateZ(Math.PI / 2);
        // Its own see-through materials: the arch fades while the ball is under it, so the ball and its
        // ring stay in sight.
        const glass = [M.mound.clone(), M.inside.clone()];
        glass.forEach((m) => (m.transparent = true));
        trash.push(...glass);
        const [tx, tz] = along(p, 0, 0),
          roof = mesh(course, g, glass[0], tx, 0.24, tz),
          inner = mesh(course, g, glass[1], tx, 0.24, tz, false);
        roof.rotation.y = inner.rotation.y = angleOf(p);
        arches.push({ roof, glass, len: p.len / 2 + 0.1, r });
        // A darker stone ring frames each mouth.
        for (const u of [-1, 1]) {
          const ring = new T.RingGeometry(r - 0.1, r + 0.06, 24, 1, 0, Math.PI),
            [x, z] = along(p, (u * (p.len + 0.02)) / 2, 0),
            m = mesh(course, ring, M.stoneDark, x, 0.24, z);
          m.rotation.y = angleOf(p) + Math.PI / 2;
        }
      } else if (p.kind === 'gate') {
        // A little wooden arch over the gap.
        const g = new T.TorusGeometry(p.width / 2 + 0.06, 0.045, 8, 24, Math.PI),
          [x, z] = along(p, 0, 0),
          m = mesh(course, g, M.wood, x, 0.36, z);
        m.rotation.y = angleOf(p) + Math.PI / 2;
      } else if (p.kind === 'mill') mill(p);
    }
  }
  function mill(p) {
    // A little brick mill house over the lane: the ball goes through the white arch in its base, and the
    // sails turn on the gable that faces the tee.
    const [x, z] = along(p, 0, p.o),
      [cx, cz] = along(p, 0, 0),
      top = 1.25,
      lintel = mesh(course, new T.BoxGeometry(p.len - 0.02, top - 0.52, p.width + 0.1), M.brick, x, 0.52 + (top - 0.52) / 2, z);
    lintel.rotation.y = angleOf(p);
    const arch = new T.CylinderGeometry(p.width / 2 + 0.05, p.width / 2 + 0.05, p.len + 0.04, 18, 1, false, 0, Math.PI);
    arch.rotateZ(Math.PI / 2);
    const a = mesh(course, arch, M.plaster, x, 0.5, z);
    a.rotation.y = angleOf(p);
    a.scale.set(1, 0.6, 1);
    // The gable roof, a prism along the lane.
    const span = p.lane / 2 + 0.42,
      gable = new T.Shape([new T.Vector2(-span, 0), new T.Vector2(span, 0), new T.Vector2(0, 0.62)]),
      roofGeo = new T.ExtrudeGeometry(gable, { depth: p.len + 0.36, bevelEnabled: false });
    roofGeo.translate(0, 0, -(p.len + 0.36) / 2);
    const roof = mesh(course, roofGeo, M.slate, cx, top, cz);
    roof.rotation.y = Math.atan2(p.dx, p.dz);
    const wall = new T.ExtrudeGeometry(new T.Shape([new T.Vector2(-span + 0.3, 0), new T.Vector2(span - 0.3, 0), new T.Vector2(0, 0.4)]), { depth: p.len - 0.02, bevelEnabled: false });
    wall.translate(0, 0, -(p.len - 0.02) / 2);
    const w = mesh(course, wall, M.brick, cx, top, cz);
    w.rotation.y = roof.rotation.y;
    // A round window in the gable and white corners.
    const [gx, gz] = along(p, -p.len / 2 - 0.005, 0),
      win = mesh(course, new T.CircleGeometry(0.1, 20), M.plaster, gx, top + 0.15, gz, false);
    win.rotation.y = angleOf(p) - Math.PI / 2;
    // Sails: a hub, four spars with cloth.
    const m = h.mill;
    sails = new T.Group();
    sails.position.set(m.x - m.dz * m.o, m.hub, m.z + m.dx * m.o);
    sails.rotation.y = angleOf(p);
    course.add(sails);
    const turning = new T.Group();
    sails.add(turning);
    sails.userData.turning = turning;
    mesh(sails, new T.CylinderGeometry(0.1, 0.1, 0.22, 16).rotateZ(Math.PI / 2), M.spar);
    for (let k = 0; k < 4; k++) {
      const arm = new T.Group();
      arm.rotation.x = (k * Math.PI) / 2;
      turning.add(arm);
      mesh(arm, new T.BoxGeometry(0.05, m.sail + 0.04, 0.06), M.spar, -0.08, -(m.sail + 0.04) / 2, 0);
      const cloth = mesh(arm, new T.BoxGeometry(0.02, m.sail - 0.24, m.width), M.sail, -0.09, -0.24 - (m.sail - 0.24) / 2, m.width / 2 - 0.03);
      cloth.castShadow = true;
      for (let i = 1; i <= 3; i++) mesh(arm, new T.BoxGeometry(0.03, 0.03, m.width + 0.02), M.spar, -0.1, -0.24 - ((m.sail - 0.24) * i) / 3.2, m.width / 2 - 0.03);
    }
    poseMill(0);
  }
  function poseMill(t) {
    if (sails) sails.userData.turning.rotation.x = -millAngle(h.mill, t);
  }
  // ---------- Scenery ----------
  let flowerList = [];
  function flower(x, z, color, size = 1) {
    flowerList.push([x, z, color, size]);
  }
  function plantFlowers() {
    if (!flowerList.length) return;
    const stems = new T.InstancedMesh(new T.CylinderGeometry(0.012, 0.012, 1, 5), M.stalk, flowerList.length),
      heads = new T.InstancedMesh(new T.IcosahedronGeometry(0.06, 0), M.petal, flowerList.length),
      mat = new T.Matrix4(),
      col = new T.Color();
    flowerList.forEach(([x, z, color, size], i) => {
      const y = 0.16 * size;
      mat.makeScale(1, y, 1).setPosition(x, y / 2 - 0.04, z);
      stems.setMatrixAt(i, mat);
      mat.makeScale(size, size, size).setPosition(x, y - 0.03, z);
      heads.setMatrixAt(i, mat);
      heads.setColorAt(i, col.setHex(color));
    });
    stems.castShadow = heads.castShadow = true;
    course.add(stems, heads);
    flowerList = [];
  }
  // Trees and bushes are kept in tall, so the camera can leave out any that would hide the lane.
  let tall = [];
  function plant(x, z, top, reach) {
    const g = new T.Group();
    g.position.set(x, 0, z);
    course.add(g);
    tall.push({ g, x, z, top, reach });
    return g;
  }
  function tree(x, z, s, pal, rnd) {
    const g = plant(x, z, 1.5 * s, 0.55 * s);
    mesh(g, new T.CylinderGeometry(0.07 * s, 0.1 * s, 0.6 * s, 7), M.trunk, 0, 0.26 * s, 0);
    const c = pal.leaves[Math.floor(rnd() * pal.leaves.length)];
    if (rnd() < 0.35) {
      for (let i = 0; i < 3; i++) mesh(g, new T.ConeGeometry((0.55 - i * 0.13) * s, 0.6 * s, 8), leaf(pal.leaves[1] ?? c), 0, (0.7 + i * 0.36) * s, 0);
    } else {
      mesh(g, new T.IcosahedronGeometry(0.5 * s, 1), leaf(c), 0, 0.95 * s, 0);
      mesh(g, new T.IcosahedronGeometry(0.34 * s, 1), leaf(c), 0.28 * s, 0.78 * s, 0.12 * s);
      mesh(g, new T.IcosahedronGeometry(0.3 * s, 1), leaf(c), -0.22 * s, 1.18 * s, -0.1 * s);
    }
  }
  function bush(x, z, s, pal, rnd) {
    const c = leaf(pal.leaves[Math.floor(rnd() * pal.leaves.length)]),
      g = plant(x, z, 0.3 * s, 0.45 * s);
    for (let i = 0; i < 3; i++) {
      const m = mesh(g, new T.IcosahedronGeometry((0.26 - i * 0.05) * s, 1), c, (i - 1) * 0.2 * s, 0.12 * s, (i % 2) * 0.12 * s);
      m.scale.y = 0.8;
    }
    if (rnd() < 0.5) for (let i = 0; i < 4; i++) flower(x + (rnd() - 0.5) * 0.5 * s, z + (rnd() - 0.5) * 0.4 * s, pal.flowers[0], 0.7);
  }
  function rock(x, z, s, rnd) {
    const m = mesh(course, new T.DodecahedronGeometry(0.2 * s, 0), M.rock, x, 0.02, z);
    m.scale.set(1, 0.55 + rnd() * 0.3, 0.8 + rnd() * 0.3);
    m.rotation.y = rnd() * 6;
  }
  function pond(x, z, rx, rz, angle) {
    const pts = [];
    for (let i = 0; i < 28; i++) {
      const a = (i / 28) * Math.PI * 2,
        wob = 1 + 0.07 * Math.sin(a * 3 + rx);
      pts.push([x + Math.cos(a) * rx * wob * Math.cos(angle) - Math.sin(a) * rz * wob * Math.sin(angle), z + Math.cos(a) * rx * wob * Math.sin(angle) + Math.sin(a) * rz * wob * Math.cos(angle)]);
    }
    const grow = (k) => pts.map(([px, pz]) => [x + (px - x) * k, z + (pz - z) * k]);
    flat(grow(1.1), -0.035, M.waterRim);
    flat(pts, -0.03, M.water);
    return pts;
  }
  // Distance from a point to the lane, negative inside it.
  function gap(x, z) {
    let d = Infinity;
    for (let i = 0; i < h.outline.length; i++) {
      const a = h.outline[i],
        b = h.outline[(i + 1) % h.outline.length],
        ex = b[0] - a[0],
        ez = b[1] - a[1],
        t = Math.max(0, Math.min(1, ((x - a[0]) * ex + (z - a[1]) * ez) / (ex * ex + ez * ez)));
      d = Math.min(d, Math.hypot(x - a[0] - t * ex, z - a[1] - t * ez));
    }
    return free({ outline: h.outline, regions: [] }, x, z) ? -d : d;
  }
  // Leave out a tree or a bush when, seen from the camera, it stands in front of the lane.
  function unmask() {
    const eye = camera.position;
    for (const t of tall) {
      let hides = false;
      for (let k = 0; k <= 4 && !hides; k++) {
        // From the foot to where the line of sight over its top meets the ground, widened by its crown.
        const y = (t.top * k) / 4,
          f = eye.y / (eye.y - y),
          gx = eye.x + (t.x - eye.x) * f,
          gz = eye.z + (t.z - eye.z) * f;
        hides = gap(gx, gz) < t.reach + 0.2;
      }
      t.g.visible = !hides;
    }
  }
  function scenery(pal, bounds) {
    const rnd = random(h.decor),
      lane = (x, z) => {
        return gap(x, z);
      };
    const taken = [];
    const room = (x, z, r) => taken.every(([tx, tz, tr]) => Math.hypot(x - tx, z - tz) > r + tr);
    // A pond: under the bridge, or in the widest free corner.
    const bridge = h.parts.find((p) => p.kind === 'bridge');
    if (bridge) {
      const [x, z] = bridge.cx;
      pond(x, z, bridge.len / 2 + 0.5, bridge.lane / 2 + 1.5, Math.atan2(bridge.dz, bridge.dx));
      taken.push([x, z, bridge.lane / 2 + 1.5]);
    } else if (rnd() < 0.6) {
      let best = null;
      for (let i = 0; i < 60; i++) {
        const x = bounds.x0 + 1.2 + rnd() * (bounds.x1 - bounds.x0 - 2.4),
          z = bounds.z0 + 1.2 + rnd() * (bounds.z1 - bounds.z0 - 2.4),
          d = lane(x, z);
        if (d > 1.4 && (!best || d > best[2])) best = [x, z, d];
      }
      if (best) {
        const r = Math.min(1.2, best[2] - 0.4);
        pond(best[0], best[1], r, r * 0.75, rnd() * 3);
        for (let i = 0; i < 3; i++) {
          const a = rnd() * 6,
            pad = mesh(course, new T.CircleGeometry(0.1, 12, 0.3, 5.8).rotateX(-Math.PI / 2), leaf(0x5fa83e), best[0] + Math.cos(a) * r * 0.45, -0.02, best[1] + Math.sin(a) * r * 0.35, false);
          pad.rotation.y = a;
        }
        taken.push([best[0], best[1], r + 0.15]);
      }
    }
    for (let x = bounds.x0 + 0.5; x < bounds.x1 - 0.4; x += 0.8)
      for (let z = bounds.z0 + 0.5; z < bounds.z1 - 0.4; z += 0.8) {
        const px = x + (rnd() - 0.5) * 0.6,
          pz = z + (rnd() - 0.5) * 0.6,
          d = lane(px, pz),
          roll = rnd();
        if (d < 0.35) continue;
        if (d > 1.55 && roll < 0.3 && room(px, pz, 0.7)) {
          tree(px, pz, 0.85 + rnd() * 0.5, pal, rnd);
          taken.push([px, pz, 0.6]);
        } else if (d > 0.75 && roll < 0.45 && room(px, pz, 0.4)) {
          bush(px, pz, 0.9 + rnd() * 0.5, pal, rnd);
          taken.push([px, pz, 0.35]);
        } else if (roll < 0.56 && room(px, pz, 0.3)) {
          const c = pal.flowers[Math.floor(rnd() * pal.flowers.length)];
          for (let i = 0; i < 11; i++) {
            const a = rnd() * Math.PI * 2,
              r = Math.sqrt(rnd()) * 0.28;
            flower(px + Math.cos(a) * r, pz + Math.sin(a) * r, i % 4 ? c : 0xffffff, 0.85 + rnd() * 0.35);
          }
          taken.push([px, pz, 0.3]);
        } else if (roll < 0.62 && room(px, pz, 0.25)) {
          rock(px, pz, 0.7 + rnd() * 0.8, rnd);
          taken.push([px, pz, 0.25]);
        }
      }
  }

  // ---------- Building a hole ----------
  // Geometries go with the hole; materials and textures made for one hole are listed in trash.
  let trash = [];
  function clear() {
    if (!course) return;
    course.traverse((m) => {
      if (m !== dots && m !== gold && m !== trail && m !== targetRing && m !== stopRing) m.geometry?.dispose();
    });
    trash.forEach((t) => t.dispose());
    trash = [];
    course.removeFromParent();
  }
  function load(next) {
    clear();
    h = next;
    course = new T.Group();
    scene.add(course);
    sails = null;
    arches = [];
    tall = [];
    const pal = PALETTES[h.palette % PALETTES.length];
    M.wood.color.setHex(pal.rail);
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
    const margin = 2.3,
      bounds = { x0: x0 - margin, z0: z0 - margin, x1: x1 + margin, z1: z1 + margin };
    // The island: a grassy slab on a block of earth.
    const r = 1.3,
      w = bounds.x1 - bounds.x0,
      d = bounds.z1 - bounds.z0,
      shape = new T.Shape();
    shape.moveTo(-w / 2 + r, -d / 2);
    shape.lineTo(w / 2 - r, -d / 2);
    shape.quadraticCurveTo(w / 2, -d / 2, w / 2, -d / 2 + r);
    shape.lineTo(w / 2, d / 2 - r);
    shape.quadraticCurveTo(w / 2, d / 2, w / 2 - r, d / 2);
    shape.lineTo(-w / 2 + r, d / 2);
    shape.quadraticCurveTo(-w / 2, d / 2, -w / 2, d / 2 - r);
    shape.lineTo(-w / 2, -d / 2 + r);
    shape.quadraticCurveTo(-w / 2, -d / 2, -w / 2 + r, -d / 2);
    const cx = (bounds.x0 + bounds.x1) / 2,
      cz = (bounds.z0 + bounds.z1) / 2;
    // The grass slab has a hole under the lane, so a dip in the lane shows its own turf. The hole is a
    // little wider than the lane and hides under the rails.
    const wider = h.spine.map(([x, z, w]) => [x, z, w + 0.24]),
      [a, b] = [wider[0], wider[1]],
      [c, d2] = [wider.at(-1), wider.at(-2)],
      stretch = (p, q) => {
        const l = Math.hypot(p[0] - q[0], p[1] - q[1]);
        return [p[0] + ((p[0] - q[0]) / l) * 0.12, p[1] + ((p[1] - q[1]) / l) * 0.12, p[2]];
      };
    wider[0] = stretch(a, b);
    wider[wider.length - 1] = stretch(c, d2);
    const { left: gl, right: gr } = borders(wider);
    shape.holes.push(new T.Path([...gl, ...gr.reverse()].map(([x, z]) => new T.Vector2(x - cx, -(z - cz)))));
    const grass = new T.ExtrudeGeometry(shape, { depth: 0.12, bevelEnabled: true, bevelThickness: 0.08, bevelSize: 0.1, bevelSegments: 3, curveSegments: 10 });
    grass.rotateX(-Math.PI / 2);
    const meadow = std(pal.meadow, { map: meadowMap.clone(), roughness: 1 });
    meadow.map.repeat.set(w / 4, d / 4);
    trash.push(meadow, meadow.map);
    const top = mesh(course, grass, [meadow, meadow], cx, -0.26, cz, false);
    const ground = new T.ExtrudeGeometry(shapeWithoutHoles(shape), { depth: 1.1, bevelEnabled: true, bevelThickness: 0.1, bevelSize: 0.05, bevelSegments: 2, curveSegments: 10 });
    ground.rotateX(-Math.PI / 2);
    mesh(course, ground, [M.soilDark, M.soil], cx, -1.62, cz, false);
    top.receiveShadow = true;
    const contact = mesh(course, new T.PlaneGeometry(w * 1.25, d * 1.35).rotateX(-Math.PI / 2), M.contact, cx, -2.2, cz + 0.4, false);
    contact.receiveShadow = false;
    island = { ...bounds, cx, cz };
    turf();
    rail(h.outline, 1, 0.17, 0.2, M.wood);
    for (const g of h.regions) {
      if (g.kind === 'stone') block(g.pts, 0.38, h.parts.some((p) => p.kind === 'tunnel') ? [M.mound, M.stone] : M.stone);
      else if (g.kind === 'mill') block(g.pts, 1.25, M.brick, 0.03);
      else if (g.kind === 'water') {
        flat(g.pts, 0.004, M.water);
        rail(g.pts, -1, 0.1, 0.12, M.wood, -0.02, false);
      }
    }
    for (const b of h.bumpers) {
      const y = yAt(b.x, b.z);
      mesh(course, new T.CylinderGeometry(b.r * 0.62, b.r * 0.7, 0.2, 18), M.stem, b.x, y + 0.1, b.z);
      const cap = mesh(course, new T.SphereGeometry(b.r, 22, 12, 0, Math.PI * 2, 0, Math.PI / 2), M.red, b.x, y + 0.17, b.z);
      cap.scale.y = 0.75;
      const rnd = random(Math.round(b.x * 1000) >>> 0);
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2 + rnd(),
          e = 0.5 + rnd() * 0.4;
        mesh(course, new T.SphereGeometry(0.03, 8, 6), M.white, b.x + Math.cos(a) * b.r * Math.sin(e), y + 0.17 + b.r * 0.75 * Math.cos(e), b.z + Math.sin(a) * b.r * Math.sin(e), false);
      }
    }
    parts(pal);
    scenery(pal, bounds);
    plantFlowers();
    // The tee: a rubber mat. The cup: a white liner and a dark hole, with its flag.
    const tee = mesh(course, new T.BoxGeometry(0.62, 0.02, 0.62), M.mat, h.tee.x, yAt(h.tee.x, h.tee.z) + 0.004, h.tee.z, false);
    tee.rotation.y = angleOf({ dx: h.spine[1][0] - h.spine[0][0], dz: h.spine[1][1] - h.spine[0][1] });
    const cy = yAt(h.cup.x, h.cup.z);
    cupDisc = mesh(course, new T.CircleGeometry(h.cup.r + 0.035, 40).rotateX(-Math.PI / 2), M.cup, h.cup.x, cy + 0.006, h.cup.z, false);
    flagBase = new T.Group();
    flagBase.position.set(h.cup.x, cy, h.cup.z);
    course.add(flagBase);
    mesh(flagBase, new T.CylinderGeometry(0.022, 0.022, 1.35, 10), M.pole, 0, 0.675, 0);
    for (let i = 0; i < 3; i++) mesh(flagBase, new T.CylinderGeometry(0.024, 0.024, 0.12, 10), M.red, 0, 0.25 + i * 0.3, 0, false);
    const cloth = new T.PlaneGeometry(0.62, 0.38, 12, 4);
    cloth.translate(0.31, 0, 0);
    cloth.userData.rest = cloth.attributes.position.array.slice();
    flag = mesh(flagBase, cloth, flagMaterial(h.index + 1), 0, 1.15, 0);
    wave(0);
    ballMesh = mesh(course, new T.SphereGeometry(radius, 32, 20), M.ball);
    halo = new T.Mesh(ringGeo(0.36, 0.06), M.halo);
    course.add(halo);
    preview = new T.Group();
    trail.count = 0;
    preview.add(trail, dots, gold, targetRing, stopRing);
    course.add(preview);
    trace(null);
    frame();
  }
  const flagMats = new Map();
  function flagMaterial(n) {
    if (flagMats.has(n)) return flagMats.get(n);
    const map = canvasTexture(
      128,
      (g, s) => {
        g.fillStyle = '#e23b2e';
        g.fillRect(0, 0, s, s);
        g.fillStyle = '#ffffff';
        g.font = '700 84px Lexend, "Segoe UI", sans-serif';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText(String(n), s * 0.45, s * 0.54);
      },
      false
    );
    const m = std(0xffffff, { map, side: T.DoubleSide, roughness: 0.7 });
    flagMats.set(n, m);
    return m;
  }
  function wave(t) {
    const g = flag.geometry,
      a = g.attributes.position,
      rest = g.userData.rest;
    for (let i = 0; i < a.count; i++) {
      const x = rest[i * 3];
      a.setZ(i, Math.sin(x * 7 - t * 3.2) * 0.05 * x * 1.6);
      a.setY(i, rest[i * 3 + 1] - x * x * 0.08);
    }
    a.needsUpdate = true;
    g.computeVertexNormals();
  }

  // ---------- Camera ----------
  const v = new T.Vector3();
  function frame() {
    const w = canvas.clientWidth,
      hh = canvas.clientHeight;
    if (!h || !w || !hh) return;
    renderer.setSize(w, hh, false);
    camera.aspect = w / hh;
    camera.updateProjectionMatrix();
    const pts = [];
    for (const [x, z] of h.outline) pts.push(new T.Vector3(x, yAt(x, z) + 0.2, z), new T.Vector3(x, -0.05, z));
    if (h.mill) for (const p of h.parts.filter((p) => p.kind === 'mill')) pts.push(new T.Vector3(p.cx[0], 2.3, p.cx[1]));
    pts.push(new T.Vector3(h.cup.x, 1.5, h.cup.z));
    const center = new T.Vector3();
    pts.forEach((p) => center.add(p));
    center.divideScalar(pts.length);
    const fit = (a) => {
      const dir = new T.Vector3(Math.sin(a) * Math.cos(PITCH), Math.sin(PITCH), Math.cos(a) * Math.cos(PITCH)),
        target = center.clone();
      let dist = 30;
      for (let k = 0; k < 4; k++) {
        camera.position.copy(target).addScaledVector(dir, dist);
        camera.lookAt(target);
        camera.updateMatrixWorld();
        let x0 = Infinity,
          x1 = -Infinity,
          y0 = Infinity,
          y1 = -Infinity;
        for (const p of pts) {
          v.copy(p).project(camera);
          x0 = Math.min(x0, v.x);
          x1 = Math.max(x1, v.x);
          y0 = Math.min(y0, v.y);
          y1 = Math.max(y1, v.y);
        }
        const tan = Math.tan((FOV * Math.PI) / 360),
          right = new T.Vector3().setFromMatrixColumn(camera.matrixWorld, 0),
          up = new T.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
        target.addScaledVector(right, ((x0 + x1) / 2) * dist * tan * camera.aspect).addScaledVector(up, ((y0 + y1) / 2) * dist * tan);
        dist *= Math.max((x1 - x0) / 1.86, (y1 - y0) / 1.8);
      }
      camera.position.copy(target).addScaledVector(dir, dist);
      camera.lookAt(target);
      camera.updateMatrixWorld();
      const tee = v.copy(new T.Vector3(h.tee.x, 0, h.tee.z)).project(camera).clone(),
        cup = new T.Vector3(h.cup.x, 0, h.cup.z).project(camera);
      // Prefer the tee at the left or at the bottom, nearer the eye than the cup.
      const portrait = camera.aspect < 1,
        bad = portrait ? tee.y > cup.y : tee.x > cup.x,
        // The sails of a mill face the tee: look at them from that side, not edge on.
        side = h.mill && (dir.x * -h.mill.dx + dir.z * -h.mill.dz) / Math.cos(PITCH) < Math.cos((55 * Math.PI) / 180);
      return { a, dist: dist * (bad ? 1.12 : 1) * (side ? 100 : 1) * (1 + 0.02 * Math.abs(Math.sin(a))), target: target.clone(), dir };
    };
    let best = null;
    for (let i = 0; i < 48; i++) {
      const f = fit((i * Math.PI) / 24);
      if (!best || f.dist < best.dist - 1e-6) best = f;
    }
    const f = fit(best.a);
    yaw = f.a;
    camera.position.copy(f.target).addScaledVector(f.dir, f.dist);
    camera.lookAt(f.target);
    camera.near = f.dist * 0.4;
    camera.far = f.dist * 3;
    camera.updateProjectionMatrix();
    // The sun, from the upper left of the view, and its shadow box around the island.
    const sunDir = new T.Vector3(-0.55, 1.1, 0.35).applyAxisAngle(new T.Vector3(0, 1, 0), yaw).normalize();
    sun.target.position.set(island.cx, 0, island.cz);
    sun.position.copy(sun.target.position).addScaledVector(sunDir, 30);
    const s = Math.max(island.x1 - island.x0, island.z1 - island.z0) * 0.62;
    Object.assign(sun.shadow.camera, { left: -s, right: s, top: s, bottom: -s, near: 10, far: 50 });
    sun.shadow.camera.updateProjectionMatrix();
    unmask();
    // The far wall of the cup and the flag face the eye.
    cupDisc.rotation.y = yaw;
    flagBase.rotation.y = yaw + 0.35;
    draw();
  }
  new ResizeObserver(() => frame()).observe(canvas);

  // ---------- Drawing on demand ----------
  const tasks = new Set();
  let raf = 0,
    waveUntil = 0;
  const draw = () => {
    if (!raf) raf = requestAnimationFrame(tick);
  };
  function tick(now) {
    raf = 0;
    for (const task of [...tasks]) if (task(now) === false) tasks.delete(task);
    if (h && !reduced() && now < waveUntil) {
      wave(now / 1000);
      if (!tasks.size) draw();
    }
    renderer.render(scene, camera);
    if (tasks.size) draw();
  }
  // The flag waves for a few seconds after each action, then the view rests.
  function wake() {
    waveUntil = performance.now() + 5000;
    draw();
  }

  // ---------- Ball, preview and shots ----------
  let spin = new T.Quaternion(),
    last = null;
  function place(p, sunk = false) {
    const y = yAt(p.x, p.z);
    if (last) {
      const dx = p.x - last.x,
        dz = p.z - last.z,
        d = Math.hypot(dx, dz);
      if (d > 1e-6) spin.premultiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(dz / d, 0, -dx / d), d / radius));
    }
    last = { x: p.x, z: p.z };
    ballMesh.quaternion.copy(spin);
    ballMesh.position.set(p.x, y + (sunk ? -radius * 1.4 : radius), p.z);
    ballMesh.visible = !sunk;
    halo.position.set(p.x, y + 0.012, p.z);
    for (const a of arches) {
      const q = a.roof.worldToLocal(v.set(p.x, y, p.z)),
        under = !sunk && Math.abs(q.x) < a.len && Math.abs(q.z) < a.r;
      a.glass.forEach((m) => (m.opacity = under ? 0.3 : 1));
    }
  }
  function pose(p, ready, sunk = false) {
    place(p, sunk);
    halo.visible = ready;
    poseMill(0);
    wake();
  }
  // Show the shot: dots along the part of the path this level reveals, the target in yellow, the stop in
  // white. Where the level hides the rest, the dots shrink and fade over the last metre, so the end reads as
  // a choice, not a cut. Difficile never shows the stop. A shot that sinks shows gold dots.
  const dim = new T.Color(),
    white = new T.Color(0xffffff),
    fadeTo = new T.Color(0x5fae63);
  function trace(shot, target, level = 'facile', full = false) {
    dots.count = gold.count = 0;
    targetRing.visible = stopRing.visible = false;
    trail.visible = !shot;
    if (shot) {
      const n = full ? shot.path.length - 1 : reveal(level, shot),
        whole = n === shot.path.length - 1,
        // Difficile never shows where the ball stops, also on a short putt.
        fade = full ? 0 : whole && level !== 'fort' ? 0 : FADE[level] || 0,
        list = whole && shot.sunk ? gold : dots,
        mat = new T.Matrix4(),
        at = [0];
      for (let i = 1; i <= n; i++) at.push(at[i - 1] + Math.hypot(shot.path[i].x - shot.path[i - 1].x, shot.path[i].z - shot.path[i - 1].z));
      const length = at[n];
      let run = -0.12;
      for (let i = 1; i <= n && list.count < 400; i++) {
        const p = shot.path[i];
        run += at[i] - at[i - 1];
        if (run < 0.27 && i < n) continue;
        run = 0;
        if (whole && shot.sunk && Math.hypot(p.x - h.cup.x, p.z - h.cup.z) < h.cup.r * 0.6) continue;
        const k = fade ? Math.min(1, Math.max(0, (length - at[i]) / fade)) : 1;
        if (fade && k < 0.08) break;
        const size = 0.35 + 0.65 * k;
        mat.makeScale(size, size, size).setPosition(p.x, yAt(p.x, p.z) + 0.06, p.z);
        list.setMatrixAt(list.count, mat);
        if (list === dots) list.setColorAt(list.count, dim.copy(fadeTo).lerp(white, 0.25 + 0.75 * k));
        list.count++;
      }
      dots.instanceMatrix.needsUpdate = gold.instanceMatrix.needsUpdate = true;
      if (dots.instanceColor) dots.instanceColor.needsUpdate = true;
      if (target) {
        targetRing.position.set(target.x, yAt(target.x, target.z) + 0.02, target.z);
        targetRing.visible = free(h, target.x, target.z);
      }
      if (whole && !shot.sunk && (full || level !== 'fort')) {
        stopRing.position.set(shot.end.x, yAt(shot.end.x, shot.end.z) + 0.02, shot.end.z);
        stopRing.visible = true;
      }
    }
    wake();
  }
  // The faint trail of the last shot, or none.
  function remember(shot) {
    trail.count = 0;
    if (shot) {
      const mat = new T.Matrix4();
      let run = 0,
        prev = shot.path[0];
      for (const p of shot.path) {
        run += Math.hypot(p.x - prev.x, p.z - prev.z);
        prev = p;
        if (run < 0.18) continue;
        run = 0;
        if (trail.count >= 400) break;
        trail.setMatrixAt(trail.count++, mat.makeTranslation(p.x, yAt(p.x, p.z) + 0.03, p.z));
      }
      trail.instanceMatrix.needsUpdate = true;
    }
    wake();
  }
  // Play a shot: the ball rolls along its path with spin; the mill turns; a sunk ball drops into the cup.
  function animate(shot) {
    halo.visible = false;
    trace(null);
    if (reduced()) {
      place(shot.end, shot.sunk);
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      const start = performance.now(),
        n = shot.path.length - 1;
      let sinkAt = 0;
      tasks.add((now) => {
        const f = Math.min(n, (Math.max(0, now - start) / 1000 / dt) * SPEED),
          i = Math.floor(f),
          a = shot.path[i],
          b = shot.path[Math.min(n, i + 1)],
          t = f - i;
        poseMill(f * dt);
        if (f < n) {
          place({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t });
          return true;
        }
        if (!shot.sunk) {
          place(shot.end);
          settleMill(f * dt);
          resolve();
          return false;
        }
        // The drop: the ball slides to the middle of the cup and sinks in 0.4 s.
        sinkAt ||= now;
        const k = Math.min(1, Math.max(0, now - sinkAt) / 400),
          y = yAt(h.cup.x, h.cup.z);
        place(h.cup);
        ballMesh.position.y = y + radius - k * k * radius * 2.6;
        if (k < 1) return true;
        ballMesh.visible = false;
        settleMill(f * dt);
        celebrate();
        resolve();
        return false;
      });
      wake();
      draw();
    });
  }
  // The sails turn back to where every stroke starts.
  function settleMill(t) {
    if (!sails) return;
    // Bound to this mill: a hole loaded meanwhile does not stop the drawing.
    const turning = sails.userData.turning;
    const from = millAngle(h.mill, t),
      to = from + ((h.mill.phase - from) % (Math.PI / 2) + Math.PI / 2) % (Math.PI / 2),
      start = performance.now();
    tasks.add((now) => {
      const k = Math.min(1, Math.max(0, now - start) / 900),
        e = 1 - (1 - k) ** 3;
      turning.rotation.x = -(from + (to - from) * e);
      return k < 1;
    });
  }
  // Confetti from the cup, 1.6 s.
  function celebrate() {
    if (reduced()) return;
    const count = 70,
      geo = new T.PlaneGeometry(0.11, 0.17),
      bits = new T.InstancedMesh(geo, new T.MeshBasicMaterial({ side: T.DoubleSide }), count),
      colors = [0xffc83d, 0xe23b2e, 0x3d8bfd, 0xffffff, 0x4fbf5a, 0xff8ad1],
      rnd = random(h.index * 31 + 7),
      parts = Array.from({ length: count }, (_, i) => {
        const a = rnd() * Math.PI * 2,
          s = 0.9 + rnd() * 1.8;
        bits.setColorAt(i, new T.Color(colors[i % colors.length]));
        return { vx: Math.cos(a) * s, vz: Math.sin(a) * s, vy: 3.4 + rnd() * 2.6, spin: rnd() * 10 };
      }),
      y0 = yAt(h.cup.x, h.cup.z) + 0.1,
      start = performance.now(),
      mat = new T.Matrix4(),
      q = new T.Quaternion(),
      e = new T.Euler(),
      at = new T.Vector3(),
      size = new T.Vector3();
    bits.frustumCulled = false;
    course.add(bits);
    tasks.add((now) => {
      const t = Math.max(0, now - start) / 1000;
      parts.forEach((p, i) => {
        const y = Math.max(y0 - 0.08, y0 + p.vy * t - 4.2 * t * t),
          k = Math.max(0, 1 - Math.max(0, t - 1) / 0.6);
        q.setFromEuler(e.set(p.spin * t, p.spin * t * 0.7, 0));
        mat.compose(at.set(h.cup.x + p.vx * t, y, h.cup.z + p.vz * t), q, size.setScalar(k));
        bits.setMatrixAt(i, mat);
      });
      bits.instanceMatrix.needsUpdate = true;
      if (t < 1.6) return true;
      bits.removeFromParent();
      geo.dispose();
      bits.material.dispose();
      return false;
    });
    wake();
  }

  // ---------- The mouse ----------
  const ray = new T.Raycaster(),
    ndc = new T.Vector2();
  // Positions from the mouse are in screen pixels; the page may be drawn larger (Zoom.z()).
  function local(e) {
    const r = canvas.getBoundingClientRect(),
      z = window.Zoom ? Zoom.z() : 1;
    return { x: (e.clientX - r.left) / z, y: (e.clientY - r.top) / z };
  }
  function cast(p) {
    ndc.set((2 * p.x) / canvas.clientWidth - 1, 1 - (2 * p.y) / canvas.clientHeight);
    ray.setFromCamera(ndc, camera);
  }
  return {
    load,
    pose,
    trace,
    remember,
    animate,
    wake,
    local,
    ballHeight: (p) => yAt(p.x, p.z) + radius,
    // The lane under a point of the canvas, or null.
    pick(p) {
      if (!h) return null;
      cast(p);
      const hit = ray.intersectObject(course.children.find((m) => m.material === M.turf))[0]?.point;
      return hit && free(h, hit.x, hit.z) ? { x: hit.x, z: hit.z } : null;
    },
    // A point of the canvas on the flat plane at the height y.
    ground(p, y) {
      cast(p);
      const t = (y - ray.ray.origin.y) / ray.ray.direction.y;
      return t > 0 ? { x: ray.ray.origin.x + ray.ray.direction.x * t, z: ray.ray.origin.z + ray.ray.direction.z * t } : null;
    },
    // Where a point of the hole is on the canvas.
    screen(p, lift = radius) {
      v.set(p.x, yAt(p.x, p.z) + lift, p.z).project(camera);
      return { x: ((v.x + 1) / 2) * canvas.clientWidth, y: ((1 - v.y) / 2) * canvas.clientHeight };
    },
    // How many canvas pixels one metre is at a point.
    scale(p) {
      const a = this.screen(p, 0),
        b = this.screen({ x: p.x + 0.5, z: p.z }, 0),
        c = this.screen({ x: p.x, z: p.z + 0.5 }, 0);
      return Math.max(Math.hypot(b.x - a.x, b.y - a.y), Math.hypot(c.x - a.x, c.y - a.y)) * 2;
    }
  };
}
