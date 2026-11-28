// The 3D view of the boulodrome: a gravel terrain between wooden boards, on a village square in Provence,
// under plane trees. Three.js 0.160.1, kept in lib/three/. The engine measures z away from the circle;
// Three.js sees the terrain along negative Z. The scene draws a frame only while something moves.
import * as T from '../lib/three/three.module.min.js';
import { R, RC, HALF, END, BACK, random, gap } from './engine.js';

const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const v = (x, y, z) => new T.Vector3(x, y, -z);
// His colour and Marius's, as on the cards beside the terrain.
export const COLOURS = { you: '#2f6fd6', cpu: '#c4502e' };

function texture(w, h, paint, repeat = false) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  paint(c.getContext('2d'), w, h);
  const t = new T.CanvasTexture(c);
  t.colorSpace = T.SRGBColorSpace;
  t.anisotropy = 8;
  if (repeat) t.wrapS = t.wrapT = T.RepeatWrapping;
  return t;
}
// Fine pale gravel, with small grey and ochre stones and their shadows.
function gravel(base, seed, count) {
  return texture(
    512,
    512,
    (c, w, h) => {
      c.fillStyle = base;
      c.fillRect(0, 0, w, h);
      const rnd = random(seed);
      for (let i = 0; i < count; i++) {
        const x = rnd() * w,
          y = rnd() * h,
          r = 0.6 + rnd() * rnd() * 3.2;
        const tone = rnd();
        c.fillStyle = 'rgba(70,50,30,.22)';
        c.beginPath();
        c.ellipse(x + 0.8, y + 0.9, r, r * 0.8, 0, 0, Math.PI * 2);
        c.fill();
        c.fillStyle = tone < 0.4 ? '#efe4cc' : tone < 0.7 ? '#c9b48f' : tone < 0.9 ? '#a99a86' : '#d79f6a';
        c.beginPath();
        c.ellipse(x, y, r, r * 0.8, rnd() * 3, 0, Math.PI * 2);
        c.fill();
      }
    },
    true
  );
}
// The bark of a plane tree: cream, olive and grey patches.
function bark() {
  return texture(
    256,
    256,
    (c, w, h) => {
      c.fillStyle = '#cfc6a6';
      c.fillRect(0, 0, w, h);
      const rnd = random(7);
      for (let i = 0; i < 90; i++) {
        c.fillStyle = ['#8f8a64', '#b7ae86', '#e6dfc6', '#7d7c63', '#a49c7a'][i % 5];
        c.beginPath();
        const x = rnd() * w,
          y = rnd() * h;
        c.moveTo(x, y);
        for (let k = 0; k < 7; k++) c.lineTo(x + (rnd() - 0.5) * 50, y + (rnd() - 0.5) * 34);
        c.fill();
      }
    },
    true
  );
}
// The grooves of a boule: two great circles of three fine lines, which show it roll.
function grooves(tint) {
  return texture(512, 256, (c, w, h) => {
    c.fillStyle = tint;
    c.fillRect(0, 0, w, h);
    const rnd = random(tint.length * 31);
    for (let i = 0; i < 2600; i++) {
      c.fillStyle = 'rgba(0,0,0,' + 0.05 * rnd() + ')';
      c.fillRect(rnd() * w, rnd() * h, 2, 2);
    }
    c.strokeStyle = 'rgba(20,16,12,.75)';
    c.lineWidth = 2;
    for (const lon of [0, 0.25, 0.5, 0.75])
      for (const d of [-6, 0, 6]) {
        c.beginPath();
        c.moveTo(lon * w + d, 0);
        c.lineTo(lon * w + d, h);
        c.stroke();
      }
  });
}
// The facades at the end of the square: ochre plaster, blue shutters, a red awning for the café.
function facade(colour, shutter, seed, cafe) {
  return texture(512, 256, (c, w, h) => {
    c.fillStyle = colour;
    c.fillRect(0, 0, w, h);
    const rnd = random(seed);
    for (let i = 0; i < 400; i++) {
      c.fillStyle = 'rgba(120,80,40,' + 0.05 * rnd() + ')';
      c.fillRect(rnd() * w, rnd() * h, 6 + rnd() * 20, 2 + rnd() * 6);
    }
    const cols = 4;
    for (let row = 0; row < 2; row++)
      for (let i = 0; i < cols; i++) {
        const x = 40 + i * ((w - 80) / (cols - 1)) - 22,
          y = 34 + row * 110;
        if (cafe && row === 1) continue;
        c.fillStyle = '#3a3028';
        c.fillRect(x, y, 44, 66);
        c.fillStyle = shutter;
        c.fillRect(x - 20, y, 18, 66);
        c.fillRect(x + 46, y, 18, 66);
        c.fillStyle = 'rgba(0,0,0,.18)';
        for (let k = 0; k < 6; k++) {
          c.fillRect(x - 20, y + 6 + k * 10, 18, 2);
          c.fillRect(x + 46, y + 6 + k * 10, 18, 2);
        }
      }
    if (cafe) {
      for (let i = 0; i < 12; i++) {
        c.fillStyle = i % 2 ? '#f3ecdc' : '#b3362b';
        c.fillRect(30 + i * 38, 150, 38, 26);
      }
      c.fillStyle = '#3a3028';
      c.fillRect(60, 182, 160, 74);
      c.fillRect(300, 182, 150, 74);
      c.fillStyle = '#f3ecdc';
      c.font = 'bold 30px Georgia';
      c.textAlign = 'center';
      c.fillText('CAFÉ DE LA PLACE', w / 2, 140);
    }
  });
}
// The tape of the measure: white with black centimetre marks.
function tapeMap() {
  return texture(
    512,
    32,
    (c, w, h) => {
      c.fillStyle = '#fbf8ef';
      c.fillRect(0, 0, w, h);
      c.fillStyle = '#1d1d1d';
      for (let i = 0; i < 50; i++) c.fillRect(i * (w / 50), 0, 2, i % 5 ? 9 : 18);
    },
    true
  );
}

export function createScene(canvas, inset) {
  const renderer = new T.WebGLRenderer({ canvas, antialias: true, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFSoftShadowMap;
  renderer.toneMapping = T.NoToneMapping;
  const scene = new T.Scene(),
    camera = new T.PerspectiveCamera(40, 1, 0.02, 120),
    headCam = new T.PerspectiveCamera(36, 1, 0.02, 60);
  scene.background = texture(16, 256, (c, w, h) => {
    const g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#7fb3e0');
    g.addColorStop(0.55, '#cfe3ef');
    g.addColorStop(1, '#f6e7c8');
    c.fillStyle = g;
    c.fillRect(0, 0, w, h);
  });
  scene.fog = new T.Fog('#dfe6dc', 45, 95);
  // A soft sky for the steel to mirror.
  const pmrem = new T.PMREMGenerator(renderer);
  const sky = new T.Scene();
  sky.add(
    new T.Mesh(
      new T.SphereGeometry(10, 32, 16),
      new T.MeshBasicMaterial({
        side: T.BackSide,
        map: texture(16, 256, (c, w, h) => {
          const g = c.createLinearGradient(0, 0, 0, h);
          g.addColorStop(0, '#9cc6ec');
          g.addColorStop(0.48, '#f4f1e6');
          g.addColorStop(0.52, '#b49a72');
          g.addColorStop(1, '#6f5a3f');
          c.fillStyle = g;
          c.fillRect(0, 0, w, h);
        })
      })
    )
  );
  const sunSpot = new T.Mesh(new T.SphereGeometry(1.2, 12, 8), new T.MeshBasicMaterial({ color: '#fff8e0' }));
  sunSpot.position.set(-5, 6, 4);
  sky.add(sunSpot);
  scene.environment = pmrem.fromScene(sky, 0.03).texture;
  scene.add(new T.HemisphereLight('#d6e6f7', '#8f7550', 0.95));
  // The late sun, from the left and behind him, through the leaves.
  const sun = new T.DirectionalLight('#ffe9c4', 1.9);
  sun.position.set(-9, 14, 6);
  sun.target.position.set(0, 0, -7);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -11, right: 11, top: 14, bottom: -14, near: 1, far: 50 });
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.02;
  scene.add(sun, sun.target);
  const mesh = (geo, mat, parent = scene) => {
    const m = new T.Mesh(geo, mat);
    parent.add(m);
    return m;
  };
  const mat = (color, extra) => new T.MeshStandardMaterial({ color, roughness: 0.85, ...extra });

  // ---------- The square ----------
  const dust = gravel('#bfa47a', 3, 2600);
  dust.repeat.set(18, 18);
  const square = mesh(new T.PlaneGeometry(80, 80), mat('#ffffff', { map: dust }));
  square.rotation.x = -Math.PI / 2;
  square.position.set(0, -0.004, -12);
  square.receiveShadow = true;
  const fine = gravel('#d2b98d', 11, 5200);
  const length = END - BACK;
  fine.repeat.set(4 / 1.2, length / 1.2);
  const terrain = mesh(new T.PlaneGeometry(2 * HALF, length), mat('#ffffff', { map: fine, roughness: 0.95 }));
  terrain.rotation.x = -Math.PI / 2;
  terrain.position.copy(v(0, 0, (END + BACK) / 2));
  terrain.receiveShadow = true;
  // The boards, with a darker cap.
  const oak = mat('#9b6b3d', { roughness: 0.7 }),
    capWood = mat('#6e4625', { roughness: 0.6 });
  function board(x, z, w, d) {
    const b = mesh(new T.BoxGeometry(w, 0.1, d), oak);
    b.position.copy(v(x, 0.05, z));
    b.castShadow = b.receiveShadow = true;
    const c = mesh(new T.BoxGeometry(w + 0.004, 0.012, d + 0.004), capWood);
    c.position.copy(v(x, 0.104, z));
  }
  board(-HALF - 0.025, (END + BACK) / 2, 0.05, length + 0.1);
  board(HALF + 0.025, (END + BACK) / 2, 0.05, length + 0.1);
  board(0, END + 0.025, 2 * HALF + 0.1, 0.05);
  // The throwing circle: a red ring of 50 cm on the gravel.
  const circle = mesh(new T.TorusGeometry(0.25, 0.012, 8, 48), mat('#b8402c', { roughness: 0.5 }));
  circle.rotation.x = Math.PI / 2;
  circle.position.copy(v(0, 0.01, 0));
  circle.castShadow = true;
  // Plane trees along both sides, their crowns throwing a dappled shade on the terrain.
  const barkMap = bark(),
    trunkMat = mat('#ffffff', { map: barkMap }),
    leafMats = ['#5f8f3a', '#6f9e42', '#517f33', '#7aa74a'].map((c) => mat(c, { roughness: 0.9, flatShading: true }));
  const rnd = random(19);
  function planeTree(x, z, s) {
    const g = new T.Group();
    g.position.copy(v(x, 0, z));
    scene.add(g);
    const trunk = mesh(new T.CylinderGeometry(0.17 * s, 0.26 * s, 4.2 * s, 10), trunkMat, g);
    trunk.position.y = 2.1 * s;
    trunk.castShadow = true;
    for (const [bx, by, bz, r] of [
      [0.6, 3.6, 0.2, 0.09],
      [-0.5, 3.8, -0.3, 0.08]
    ]) {
      const bough = mesh(new T.CylinderGeometry(r * 0.6 * s, r * s, 1.6 * s, 7), trunkMat, g);
      bough.position.set(bx * s * 0.6, by * s, bz * s);
      bough.rotation.z = -bx * 0.9;
      bough.castShadow = true;
    }
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 + rnd(),
        d = 1.1 + rnd() * 1.3;
      const c = mesh(new T.IcosahedronGeometry((1.15 + rnd() * 0.7) * s, 1), leafMats[i % 4], g);
      c.position.set(Math.cos(a) * d * s, (5 + rnd() * 1.6) * s, Math.sin(a) * d * s);
      c.scale.y = 0.72;
      c.castShadow = true;
    }
  }
  for (const z of [-4, 2.5, 9, 15.5, 22]) {
    planeTree(-3.6 - rnd() * 0.5, z + rnd(), 1 + rnd() * 0.15);
    planeTree(3.7 + rnd() * 0.5, z + 1.5 + rnd(), 1 + rnd() * 0.15);
  }
  // Benches along the right side, a low stone wall on the left.
  const iron = mat('#2f3b36', { roughness: 0.5, metalness: 0.4 }),
    slat = mat('#7c5232');
  for (const z of [4.5, 11]) {
    const g = new T.Group();
    g.position.copy(v(3.0, 0, z));
    g.rotation.y = Math.PI / 2;
    scene.add(g);
    for (const [y, dz, h] of [
      [0.45, 0, 0.04],
      [0.72, -0.2, 0.3]
    ]) {
      const s = mesh(new T.BoxGeometry(1.6, h, 0.36), slat, g);
      s.position.set(0, y, dz);
      s.castShadow = true;
    }
    for (const x of [-0.7, 0.7]) {
      const leg = mesh(new T.BoxGeometry(0.05, 0.45, 0.4), iron, g);
      leg.position.set(x, 0.22, 0);
    }
  }
  const stone = texture(
    256,
    64,
    (c, w, h) => {
      c.fillStyle = '#d8c7a4';
      c.fillRect(0, 0, w, h);
      const r2 = random(5);
      for (let y = 0; y < h; y += 16)
        for (let x = (y / 16) % 2 ? -18 : 0; x < w; x += 36) {
          c.fillStyle = ['#cdb995', '#e3d5b6', '#c2ad86'][Math.floor(r2() * 3)];
          c.fillRect(x + 1, y + 1, 34, 14);
        }
    },
    true
  );
  stone.repeat.set(8, 1);
  const wall = mesh(new T.BoxGeometry(0.45, 0.7, 26), mat('#ffffff', { map: stone }));
  wall.position.copy(v(-5.2, 0.35, 8));
  wall.castShadow = wall.receiveShadow = true;
  // The houses at the end of the square, and the café.
  const houses = [
    ['#e8c48e', '#4f7fa8', -9],
    ['#e9b38b', '#5d8a6e', -3.2],
    ['#f0d3a2', '#4f7fa8', 2.8],
    ['#dfae7d', '#6a8fb4', 8.6]
  ];
  houses.forEach(([colour, shutter, x], i) => {
    const h = 6.5 + (i % 2) * 1.4;
    const front = mesh(new T.BoxGeometry(5.8, h, 4), [
      mat(colour),
      mat(colour),
      mat('#b0563a'),
      mat(colour),
      mat('#ffffff', { map: facade(colour, shutter, 40 + i, i === 2) }),
      mat(colour)
    ]);
    front.position.copy(v(x, h / 2, 31));
    front.receiveShadow = true;
    const roof = mesh(new T.CylinderGeometry(0.01, 3.3, 1.4, 4, 1), mat('#b55a3a', { flatShading: true }));
    roof.rotation.y = Math.PI / 4;
    roof.scale.set(1.25, 1, 0.85);
    roof.position.copy(v(x, h + 0.7, 31));
  });
  // A few café tables under the trees, on the right at the far end.
  for (const [x, z] of [
    [4.6, 18.5],
    [6.0, 20.2],
    [4.4, 21.6]
  ]) {
    const top = mesh(new T.CylinderGeometry(0.35, 0.35, 0.03, 20), mat('#e8e3d6', { metalness: 0.3, roughness: 0.4 }));
    top.position.copy(v(x, 0.72, z));
    top.castShadow = true;
    const foot = mesh(new T.CylinderGeometry(0.03, 0.03, 0.72, 8), iron);
    foot.position.copy(v(x, 0.36, z));
  }

  // ---------- The boules and the cochonnet ----------
  const steel = { you: mat('#ffffff', { map: grooves('#d9dde3'), metalness: 1, roughness: 0.27 }), cpu: mat('#ffffff', { map: grooves('#8c5a36'), metalness: 0.9, roughness: 0.33 }) };
  const soft = texture(64, 64, (c, w, h) => {
    const g = c.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    g.addColorStop(0, 'rgba(30,20,10,.55)');
    g.addColorStop(1, 'rgba(30,20,10,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, w, h);
  });
  const bodies = new Map();
  function makeBody(id, owner) {
    const r = id === 0 ? RC : R;
    const m = mesh(new T.SphereGeometry(r, 32, 20), id === 0 ? mat('#e2482a', { roughness: 0.55 }) : steel[owner]);
    m.castShadow = true;
    // A soft contact shadow under each body, so it sits on the gravel.
    const sh = mesh(new T.PlaneGeometry(r * 3.2, r * 3.2), new T.MeshBasicMaterial({ map: soft, transparent: true, depthWrite: false }));
    sh.rotation.x = -Math.PI / 2;
    const b = { id, owner, m, sh, r, fade: 1 };
    bodies.set(id, b);
    return b;
  }
  function bodyOf(id, owner) {
    const b = bodies.get(id);
    if (b && (id === 0 || b.owner === owner)) return b;
    if (b) drop(id);
    return makeBody(id, owner);
  }
  function drop(id) {
    const b = bodies.get(id);
    if (!b) return;
    scene.remove(b.m, b.sh);
    b.m.geometry.dispose();
    bodies.delete(id);
  }
  function place(b, x, y, z) {
    b.m.position.copy(v(x, y, z));
    b.sh.position.copy(v(x, 0.002, z));
    const lift = Math.max(0, y - b.r);
    b.sh.material.opacity = Math.max(0, 1 - lift * 2.5);
    b.sh.scale.setScalar(1 + lift * 3);
  }
  // A body rolls by the distance it travels on the gravel.
  const axis = new T.Vector3(),
    turn = new T.Quaternion();
  function roll(b, dx, dz) {
    const d = Math.hypot(dx, dz);
    if (d < 1e-6) return;
    axis.set(-dz / d, 0, -dx / d);
    turn.setFromAxisAngle(axis, d / b.r);
    b.m.quaternion.premultiply(turn);
  }
  // Where the cochonnet is, seen from far: a soft orange glow on the gravel under it.
  const glow = mesh(
    new T.CircleGeometry(0.09, 32),
    new T.MeshBasicMaterial({
      map: texture(64, 64, (c, w, h) => {
        const g = c.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
        g.addColorStop(0, 'rgba(255,140,70,.75)');
        g.addColorStop(1, 'rgba(255,140,70,0)');
        c.fillStyle = g;
        c.fillRect(0, 0, w, h);
      }),
      transparent: true,
      depthWrite: false
    })
  );
  glow.rotation.x = -Math.PI / 2;
  glow.visible = false;
  // The ring around the boule that holds the point, in its player's colour.
  const pointRing = new T.Group();
  for (const [inner, outer, color] of [
    [R + 0.012, R + 0.032, '#1d2125'],
    [R + 0.016, R + 0.028, '#ffffff']
  ]) {
    const ring = mesh(new T.RingGeometry(inner, outer, 40), new T.MeshBasicMaterial({ color, transparent: true, depthWrite: false }), pointRing);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = color === '#ffffff' ? 0.004 : 0.003;
  }
  scene.add(pointRing);
  pointRing.visible = false;

  // ---------- The preview ----------
  // White dots along the flight and the roll, a white ring where the boule lands, and in Facile a ring
  // where it stops. All of it is drawn in the scene, so it lies on the gravel where the boule will go.
  const dotGeo = new T.SphereGeometry(0.026, 12, 8);
  const dotMat = new T.MeshBasicMaterial({ color: '#ffffff', transparent: true }),
    dotDark = new T.MeshBasicMaterial({ color: '#2a2a2a', transparent: true, opacity: 0.35 });
  const dots = new T.InstancedMesh(dotGeo, dotMat, 260),
    dotShadows = new T.InstancedMesh(new T.CircleGeometry(0.022, 12), dotDark, 260);
  dots.renderOrder = dotShadows.renderOrder = 3;
  dots.frustumCulled = dotShadows.frustumCulled = false;
  scene.add(dots, dotShadows);
  dots.count = dotShadows.count = 0;
  function ring(radius, width, color, edge) {
    const g = new T.Group();
    for (const [inner, outer, c, y] of [
      [radius - width / 2 - 0.006, radius + width / 2 + 0.006, edge, 0.004],
      [radius - width / 2, radius + width / 2, color, 0.005]
    ]) {
      const r = mesh(new T.RingGeometry(inner, outer, 48), new T.MeshBasicMaterial({ color: c, transparent: true, depthWrite: false }), g);
      r.rotation.x = -Math.PI / 2;
      r.position.y = y;
      r.renderOrder = 4;
    }
    g.visible = false;
    scene.add(g);
    return g;
  }
  const landRing = ring(0.16, 0.04, '#ffffff', '#2b2b2b'),
    landArea = ring(0.38, 0.045, '#ffffff', '#2b2b2b'),
    stopRing = ring(R + 0.035, 0.03, '#ffffff', '#2b2b2b'),
    aimRing = ring(R + 0.035, 0.03, '#ffffff', '#2b2b2b');
  const matrix = new T.Matrix4();
  function clearPreview() {
    dots.count = dotShadows.count = 0;
    for (const r of [landRing, landArea, stopRing, aimRing]) r.visible = false;
  }
  // path: the intended path of the throw; cut: how much of the roll to show (1 all, 0.5 half, 0 none).
  function preview(path, { cut = 1, stop = true, area = false, target = null } = {}) {
    clearPreview();
    if (!path) return invalidate();
    const landing = path.findIndex((p) => !p.air);
    const landAt = landing > 0 ? path[landing] : path.at(-1);
    let n = 0;
    const put = (p, size = 1) => {
      if (n >= 260) return;
      matrix.makeScale(size, size, size).setPosition(p.x, p.y, -p.z);
      dots.setMatrixAt(n, matrix);
      matrix.makeRotationX(-Math.PI / 2).setPosition(p.x, 0.003, -p.z);
      dotShadows.setMatrixAt(n, matrix);
      n++;
    };
    // The flight: a small dot every 40 cm of the arc, until the landing.
    let last = null;
    const flight = landing > 0 ? path.slice(0, landing) : path;
    if (!area)
      for (const p of flight) {
        if (last && Math.hypot(p.x - last.x, p.z - last.z, p.y - last.y) < 0.4) continue;
        put(p, 0.55);
        last = p;
      }
    // The roll on the gravel, until the cut.
    if (cut > 0 && landing > 0) {
      const roll = path.slice(landing);
      const total = roll.reduce((s, p, i) => s + (i ? Math.hypot(p.x - roll[i - 1].x, p.z - roll[i - 1].z) : 0), 0);
      let along = 0;
      last = roll[0];
      for (let i = 1; i < roll.length; i++) {
        along += Math.hypot(roll[i].x - roll[i - 1].x, roll[i].z - roll[i - 1].z);
        if (along > total * cut) break;
        if (Math.hypot(roll[i].x - last.x, roll[i].z - last.z) < 0.2) continue;
        put({ ...roll[i], y: 0.02 });
        last = roll[i];
      }
    }
    dots.count = dotShadows.count = n;
    dots.instanceMatrix.needsUpdate = dotShadows.instanceMatrix.needsUpdate = true;
    const lr = area ? landArea : landRing;
    lr.visible = !target;
    lr.position.copy(v(landAt.x, 0, landAt.z));
    const end = path.at(-1);
    stopRing.visible = stop && cut >= 1 && !target;
    stopRing.position.copy(v(end.x, 0, end.z));
    if (target) {
      aimRing.visible = true;
      aimRing.position.copy(v(target.x, 0, target.z));
    }
    invalidate();
  }

  // ---------- The measure ----------
  const tapes = [];
  const tapeTex = tapeMap();
  function label(text, colour) {
    const t = texture(256, 96, (c, w, h) => {
      c.fillStyle = colour;
      c.beginPath();
      c.roundRect(4, 8, w - 8, h - 16, 30);
      c.fill();
      c.lineWidth = 4;
      c.strokeStyle = '#ffffff';
      c.stroke();
      c.fillStyle = '#ffffff';
      c.font = 'bold 50px Segoe UI, Lexend, sans-serif';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(text, w / 2, h / 2 + 2);
    });
    const s = new T.Sprite(new T.SpriteMaterial({ map: t, depthTest: false }));
    s.renderOrder = 6;
    return s;
  }
  function clearMeasure() {
    for (const t of tapes.splice(0)) {
      scene.remove(t);
      t.traverse((o) => o.material?.map?.dispose?.());
    }
    invalidate();
  }
  // A tape from the cochonnet to each boule, edge to edge, with its length in a label above it.
  function measure(list, c) {
    clearMeasure();
    for (const { x, z, owner, cm } of list) {
      const g = new T.Group();
      const dx = x - c.x,
        dz = z - c.z,
        d = Math.hypot(dx, dz);
      const from = { x: c.x + (dx / d) * RC, z: c.z + (dz / d) * RC },
        to = { x: x - (dx / d) * R, z: z - (dz / d) * R };
      const len = Math.max(0.005, Math.hypot(to.x - from.x, to.z - from.z));
      const map = tapeTex.clone();
      map.repeat.set(len / 0.5, 1);
      map.needsUpdate = true;
      const strip = mesh(new T.PlaneGeometry(len, 0.016), new T.MeshBasicMaterial({ map, depthTest: false }), g);
      strip.renderOrder = 5;
      strip.rotation.set(-Math.PI / 2, 0, Math.atan2(to.z - from.z, to.x - from.x));
      strip.position.copy(v((from.x + to.x) / 2, 0.012, (from.z + to.z) / 2));
      const tag = label(cm + ' cm', COLOURS[owner]);
      tag.position.copy(v((from.x + to.x) / 2, 0.09, (from.z + to.z) / 2));
      tag.scale.set(0.2, 0.075, 1);
      g.add(tag);
      g.userData.tag = tag;
      scene.add(g);
      tapes.push(g);
    }
    invalidate();
  }

  // ---------- Cameras ----------
  // The aim view: from behind the circle, at the height of a standing man's eyes, the terrain running
  // away to the far board. The view of the jeu, in the corner and after each throw: just behind and
  // above the cochonnet, so the boules around it read large.
  let head = { x: 0, z: 8 };
  const aimEye = () => v(0, 1.75, -1.4),
    aimLook = () => v(head.x * 0.6, 0, head.z + 0.6);
  // The lens of the aim view frames the gravel from 3.6 m before the cochonnet to as far behind it, so
  // the jeu reads as large as a real eye sees it when it looks there.
  function aimFov() {
    const eye = aimEye(),
      a = aimLook().sub(eye).normalize(),
      b = v(0, 0, Math.max(2.5, head.z - 3.6)).sub(eye).normalize();
    return 2 * T.MathUtils.radToDeg(Math.acos(T.MathUtils.clamp(a.dot(b), -1, 1)));
  }
  const headEye = (h = head, far = 1.7) => v(h.x, far * 0.78, h.z - far),
    headLook = (h = head) => v(h.x, 0, h.z + 0.25);
  let headFar = 1.7;
  // How far the view of the jeu stands back: enough to keep in view the boules within two metres of
  // the cochonnet.
  function farFor(h, list) {
    let reach = 0.35;
    for (const b of list) {
      const d = Math.hypot(b.x - h.x, b.z - h.z);
      if (d < 2) reach = Math.max(reach, d + 0.15);
    }
    return Math.min(3.2, 0.6 + reach * 1.1);
  }
  function frameHead(list) {
    headFar = farFor(head, list);
  }
  function cameraAt(cam, eye, look, fov) {
    cam.position.copy(eye);
    cam.lookAt(look);
    cam.fov = fov;
    cam.updateProjectionMatrix();
  }
  let view = 'aim';
  function setCamera(k = view === 'head' ? 1 : 0) {
    const eye = aimEye().lerp(headEye(head, headFar), k),
      look = aimLook().lerp(headLook(), k);
    cameraAt(camera, eye, look, T.MathUtils.lerp(aimFov(), 40, k));
    cameraAt(headCam, headEye(head, headFar), headLook(), 40);
  }

  // ---------- Drawing ----------
  let pending = 0,
    insetBox = null;
  function draw() {
    const w = canvas.clientWidth,
      h = canvas.clientHeight;
    if (!w || !h) return;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setViewport(0, 0, w, h);
    renderer.setScissorTest(false);
    // The labels of the measure always face the camera that draws them.
    renderer.render(scene, camera);
    if (!inset || inset.hidden || view === 'head') return;
    const box = insetBox;
    headCam.aspect = box.w / box.h;
    headCam.updateProjectionMatrix();
    const y = h - box.top - box.h;
    renderer.setViewport(box.left, y, box.w, box.h);
    renderer.setScissor(box.left, y, box.w, box.h);
    renderer.setScissorTest(true);
    renderer.render(scene, headCam);
    renderer.setScissorTest(false);
  }
  function invalidate() {
    if (!pending)
      pending = requestAnimationFrame(() => {
        pending = 0;
        draw();
      });
  }
  // The inset of the jeu: in the top right corner, 40 % of the stage, from 180 to 420 px wide, with a
  // caption under its picture. It hides on a narrow stage, where the camera goes to the jeu instead.
  function layoutInset() {
    const w = canvas.clientWidth,
      h = canvas.clientHeight;
    if (!inset) return;
    inset.hidden = w < 420 || h < 200 || view === 'head' || !show.cochonnet;
    if (inset.hidden) return;
    const iw = Math.round(Math.min(420, Math.max(180, w * 0.4))),
      ih = Math.round(Math.min(h * 0.62, iw * 0.72));
    inset.style.width = iw + 'px';
    inset.style.height = ih + 'px';
    const caption = inset.querySelector('span')?.offsetHeight ?? 26;
    insetBox = { left: w - 8 - iw + 2, top: 8 + 2, w: iw - 4, h: ih - caption - 4 };
  }
  function resize() {
    const w = canvas.clientWidth,
      h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    layoutInset();
    setCamera(active ? undefined : view === 'head' ? 1 : 0);
    draw();
  }
  new ResizeObserver(resize).observe(canvas);

  // ---------- What lies on the terrain ----------
  const show = { cochonnet: null };
  let active = false;
  // Puts every body at rest where the game says: { cochonnet, boules: [{ id, owner, x, z, dead }] }.
  function setState(m, { holder = null, near = null } = {}) {
    const keep = new Set();
    show.cochonnet = m.cochonnet && !m.cochonnet.dead ? m.cochonnet : null;
    if (show.cochonnet) {
      const c = bodyOf(0, null);
      place(c, show.cochonnet.x, RC, show.cochonnet.z);
      keep.add(0);
      head = { x: show.cochonnet.x, z: show.cochonnet.z };
      glow.visible = true;
      glow.position.copy(v(head.x, 0.003, head.z));
    } else glow.visible = false;
    for (const b of m.boules) {
      if (b.dead) continue;
      const body = bodyOf(b.id, b.owner);
      place(body, b.x, R, b.z);
      keep.add(b.id);
    }
    for (const id of [...bodies.keys()]) if (!keep.has(id)) drop(id);
    frameHead(m.boules.filter((b) => !b.dead));
    pointRing.visible = !!(holder && near != null && bodies.get(near));
    if (pointRing.visible) {
      const b = m.boules.find((x) => x.id === near);
      pointRing.position.copy(v(b.x, 0, b.z));
      for (const r of pointRing.children) if (r.material.color.getHexString() !== '1d2125') r.material.color.set(COLOURS[holder]);
    }
    layoutInset();
    setCamera();
    invalidate();
  }
  function setView(name) {
    view = name;
    layoutInset();
    setCamera();
    canvas.dataset.phase = name;
    invalidate();
  }
  // A glide of the camera from one view to the other.
  function glide(to, ms = 800) {
    if (reduced() || view === to) {
      setView(to);
      return Promise.resolve();
    }
    const from = view === 'head' ? 1 : 0,
      k1 = to === 'head' ? 1 : 0;
    view = to;
    layoutInset();
    const start = performance.now();
    return new Promise((resolve) => {
      function tick(now) {
        const k = Math.min(1, (now - start) / ms),
          e = k * k * (3 - 2 * k);
        setCamera(from + (k1 - from) * e);
        draw();
        if (k < 1) requestAnimationFrame(tick);
        else {
          canvas.dataset.phase = to;
          resolve();
        }
      }
      requestAnimationFrame(tick);
    });
  }
  // Plays a throw: ids name the bodies in the order of the frames, owners their players. The camera
  // follows the boule from the circle, then settles on the jeu. sound(name) plays the events.
  function animate(sim, ids, owners, sound = () => {}) {
    clearPreview();
    clearMeasure();
    pointRing.visible = false;
    const thrown = ids.at(-1);
    const items = ids.map((id, i) => bodyOf(id, owners[i]));
    active = true;
    view = 'follow';
    layoutInset();
    const frames = sim.frames,
      end = frames.at(-1).t;
    const events = sim.events.slice();
    // Where the camera ends: the view of the jeu as it lies after the throw.
    const c = sim.bodies.find((b) => b.id === 0);
    const target = c && !c.dead ? { x: c.x, z: c.z } : head,
      targetFar = farFor(target, sim.bodies.filter((b) => b.id && !b.dead));
    const landing = sim.events.find((e) => e.type === 'land' && e.id === thrown)?.t ?? end;
    if (reduced()) {
      const last = frames.at(-1).b;
      items.forEach((b, i) => place(b, ...last[i]));
      active = false;
      head = target;
      headFar = targetFar;
      setView('head');
      return Promise.resolve();
    }
    const start = performance.now();
    let prev = frames[0].b;
    canvas.dataset.phase = 'throw';
    return new Promise((resolve) => {
      function tick(now) {
        const t = Math.min(end, (now - start) / 1000);
        let i = Math.min(frames.length - 2, Math.max(0, Math.floor(t * 60)));
        while (i < frames.length - 2 && frames[i + 1].t < t) i++;
        const a = frames[i].b,
          b = frames[i + 1].b,
          f = Math.min(1, Math.max(0, (t - frames[i].t) / (frames[i + 1].t - frames[i].t || 1)));
        items.forEach((body, k) => {
          const x = a[k][0] + (b[k][0] - a[k][0]) * f,
            y = a[k][1] + (b[k][1] - a[k][1]) * f,
            z = a[k][2] + (b[k][2] - a[k][2]) * f;
          const was = prev[k];
          if (y < body.r + 0.01) roll(body, x - was[0], z - was[2]);
          else if (k === items.length - 1) body.m.rotation.x += 0.04;
          place(body, x, y, z);
          prev[k] = [x, y, z];
        });
        while (events.length && events[0].t <= t) {
          const e = events.shift();
          if (e.type === 'land') sound(e.id === 0 ? 'land-c' : 'land');
          else if (e.type === 'hit' && e.speed > 0.25) sound(e.a === 0 || e.b === 0 ? 'tick' : 'clack');
          else if (e.type === 'board') sound('board');
        }
        // The camera: it turns to follow the boule in its flight, then comes down onto the jeu.
        const ball = prev[items.length - 1];
        const smooth = (k) => {
          k = Math.min(1, Math.max(0, k));
          return k * k * (3 - 2 * k);
        };
        const sweep = smooth((t - 0.2) / (landing + 1.2)),
          follow = 0.7 * (1 - smooth((t - landing) / 0.9));
        const eye = aimEye().lerp(headEye(target, targetFar), sweep);
        const look = aimLook()
          .lerp(headLook(target), sweep)
          .lerp(v(ball[0], ball[1], ball[2]), follow);
        cameraAt(camera, eye, look, T.MathUtils.lerp(aimFov() + 16 * follow, 40, sweep));
        draw();
        if (t < end) requestAnimationFrame(tick);
        else {
          active = false;
          head = target;
          headFar = targetFar;
          view = 'head';
          canvas.dataset.phase = 'head';
          setCamera(1);
          draw();
          resolve();
        }
      }
      prev = frames[0].b.map((p) => [...p]);
      requestAnimationFrame(tick);
    });
  }
  // A dead boule fades away after the throw.
  function fadeOut(ids) {
    const list = ids.map((id) => bodies.get(id)).filter(Boolean);
    if (!list.length) return Promise.resolve();
    if (reduced()) {
      ids.forEach(drop);
      invalidate();
      return Promise.resolve();
    }
    for (const b of list) b.m.material = b.m.material.clone();
    for (const b of list) b.m.material.transparent = true;
    const start = performance.now();
    return new Promise((resolve) => {
      function tick(now) {
        const k = Math.min(1, (now - start) / 700);
        for (const b of list) {
          b.m.material.opacity = 1 - k;
          b.sh.material.opacity = 1 - k;
        }
        draw();
        if (k < 1) requestAnimationFrame(tick);
        else {
          ids.forEach(drop);
          invalidate();
          resolve();
        }
      }
      requestAnimationFrame(tick);
    });
  }
  // Where a body is drawn, in css pixels of the canvas, for the tests.
  function bodyAt(id) {
    const b = bodies.get(id);
    if (!b) return null;
    const p = b.m.position.clone().project(camera);
    return { x: ((1 + p.x) * canvas.clientWidth) / 2, y: ((1 - p.y) * canvas.clientHeight) / 2 };
  }
  setCamera(0);
  resize();
  canvas.dataset.phase = 'aim';
  return { setState, setView, glide, preview, clearPreview, animate, measure, clearMeasure, fadeOut, bodyAt, redraw: invalidate, gap };
}
