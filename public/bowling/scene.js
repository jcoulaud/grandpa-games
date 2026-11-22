// The engine measures z towards the pit. Three.js sees the lane along negative Z.
import * as T from '../lib/three/three.module.min.js';
import {
  profile,
  com,
  frameStep,
  deckEnd,
  pitFloor,
  cushionZ,
  wallX,
  width,
  length,
  step,
  gutterWidth,
  radius,
  rack,
  boardX,
  trajectory,
  arrival
} from './engine.js';
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const v = (x, y, z) => new T.Vector3(x, y, -z);
const material = (color, extra) => new T.MeshStandardMaterial({ color, ...extra });
function texture(w, h, paint) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  paint(c.getContext('2d'), w, h);
  const t = new T.CanvasTexture(c);
  t.colorSpace = T.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
function boards() {
  return texture(780, 2048, (c, w, h) => {
    c.fillStyle = '#E2BC84';
    c.fillRect(0, 0, w, h);
    for (let i = 0; i < 39; i++) {
      const x = i * 20;
      c.fillStyle = 'rgba(112,63,27,' + (0.02 + 0.13 * (0.5 + 0.5 * Math.sin(i * 35))) + ')';
      c.fillRect(x, 0, 20, h);
      c.fillStyle = '#b99463';
      c.fillRect(x, 0, 1, h);
      for (let j = 0; j < 6; j++) {
        const y = (i * 341 + j * 373) % h;
        c.fillStyle = 'rgba(109,66,33,.23)';
        c.fillRect(x, y, 20, 1);
        c.strokeStyle = 'rgba(132,74,30,.16)';
        c.beginPath();
        c.moveTo(x + 3, y);
        c.bezierCurveTo(x + 18, y + 83, x + 2, y + 190, x + 8, y + 260);
        c.stroke();
      }
    }
    // Texture runs from the pit to the approach.
    const at = (z) => ((19.4 - z) / 22.4) * h;
    c.fillStyle = 'rgba(100,49,16,.13)';
    c.fillRect(0, 0, w, at(4.6));
    c.fillStyle = '#33291e';
    c.fillRect(0, at(0), w, 5);
    for (let i = -3; i <= 3; i++) {
      const x = w / 2 + i * 100,
        y = at(4.6);
      c.beginPath();
      c.moveTo(x, y - 17);
      c.lineTo(x + 12, y + 8);
      c.lineTo(x - 12, y + 8);
      c.fill();
      c.beginPath();
      c.ellipse(x, at(2), 5, 2.5, 0, 0, Math.PI * 2);
      c.fill();
    }
  });
}
function panel(n) {
  return texture(512, 160, (c, w, h) => {
    c.fillStyle = '#252551';
    c.fillRect(0, 0, w, h);
    for (const [x, y, r] of [
      [68, 53, 19],
      [127, 99, 10],
      [363, 47, 12],
      [434, 98, 22],
      [460, 34, 7]
    ]) {
      c.fillStyle = '#ffe2a3';
      c.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = (i * Math.PI) / 4,
          d = i % 2 ? r * 0.18 : r;
        c.lineTo(x + Math.cos(a) * d, y + Math.sin(a) * d);
      }
      c.fill();
    }
    c.fillStyle = '#ffc86d';
    c.fillRect(0, 133, w, 4);
    c.fillStyle = '#b84b55';
    c.fillRect(0, 145, w, 7);
    c.fillStyle = '#fff1ca';
    c.textAlign = 'center';
    c.font = 'bold 108px Georgia';
    c.fillText(String(n).padStart(2, '0'), w / 2, 113);
  });
}
export function createScene(canvas) {
  const renderer = new T.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
  const scene = new T.Scene(),
    camera = new T.PerspectiveCamera(32, 1, 0.025, 75);
  scene.background = new T.Color('#252141');
  scene.fog = new T.FogExp2('#39334e', 0.007);
  scene.add(new T.HemisphereLight(0xfff1cf, 0xb598a0, 1.8));
  const key = new T.DirectionalLight(0xffe7c2, 2.6);
  key.position.set(-2, 6, -8);
  scene.add(key);
  const fill = new T.DirectionalLight(0xffffff, 1);
  fill.position.set(2, 3, 3);
  scene.add(fill);
  const mesh = (geo, mat, parent = scene) => {
    const m = new T.Mesh(geo, mat);
    parent.add(m);
    return m;
  };
  function box(x, y, z, w, h, d, mat) {
    const m = mesh(new T.BoxGeometry(w, h, d), mat);
    m.position.copy(v(x, y, z));
    return m;
  }
  const wood = boards(),
    cap = material('#875532'),
    dark = material('#211e2c'),
    chrome = material('#b4b4bb', { metalness: 0.48, roughness: 0.26 });
  const light = new T.MeshBasicMaterial({ color: 0xffdfa2 });
  const laneSpace = width + 2 * gutterWidth + 0.095;
  const neighbourCap = material('#403630');
  const neighbourChrome = material('#515156', { roughness: 0.65, side: T.DoubleSide });
  const neighbourLight = new T.MeshBasicMaterial({ color: '#766e62' });
  const pinMap = texture(16, 512, (c, w, h) => {
    c.fillStyle = '#fff6e6';
    c.fillRect(0, 0, w, h);
    c.fillStyle = '#bc213c';
    for (const f of [0.324, 0.39]) c.fillRect(0, f * h, w, 13);
  });
  const pinGeo = new T.LatheGeometry(
    profile.map(([r, h]) => new T.Vector2(r, h)),
    24
  );
  const uv = pinGeo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setY(i, pinGeo.attributes.position.getY(i) / 0.381);
  const pinMat = material(0xffffff, { map: pinMap, roughness: 0.21 });
  const soft = texture(64, 64, (c, w) => {
    const g = c.createRadialGradient(32, 32, 1, 32, 32, 32);
    g.addColorStop(0, 'rgba(38,18,12,.55)');
    g.addColorStop(1, 'rgba(38,18,12,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, w, w);
  });
  const shadowMat = new T.MeshBasicMaterial({ map: soft, transparent: true, depthWrite: false });
  const neighbourPin = material('#68676a', { map: pinMap });
  const pins = [];
  for (let lane = -2; lane <= 2; lane++) {
    const x = lane * laneSpace;
    const surface = mesh(
      new T.PlaneGeometry(width, deckEnd + 3),
      material(lane ? '#535463' : '#ffffff', { map: wood, roughness: lane ? 0.95 : 0.36 })
    );
    surface.rotation.x = -Math.PI / 2;
    surface.position.copy(v(x, 0, (deckEnd - 3) / 2));
    box(x, pitFloor - 0.04, deckEnd + 0.3, laneSpace, 0.08, 0.85, dark);
    box(x, 0.45, cushionZ + 0.045, 2 * wallX, 1.75, 0.09, dark);
    for (const side of [-1, 1]) {
      const gx = x + (side * (width + gutterWidth)) / 2;
      const trough = new T.CylinderGeometry(gutterWidth / 2, gutterWidth / 2, 22.4, 20, 1, true, Math.PI / 2, Math.PI);
      const m = mesh(trough, lane ? neighbourChrome : chrome);
      m.material.side = T.DoubleSide;
      m.rotation.x = -Math.PI / 2;
      m.position.copy(v(gx, -0.013, 8.2));
      box(x + side * (laneSpace / 2 - 0.022), -0.011, 8.2, 0.048, 0.06, 22.4, lane ? neighbourCap : cap);
      box(x + side * (laneSpace / 2 - 0.03), 0.17, 19.1, 0.055, 0.42, 1.9, lane ? neighbourCap : cap);
      box(x + side * (wallX + 0.025), 0.69, length + 0.6, 0.05, 0.62, 2.12, dark);
    }
    const mask = material(lane ? '#686979' : '#ffffff', { map: panel(lane + 3), roughness: 0.62 });
    box(x, 1.1, length - 0.49, laneSpace - 0.01, 0.68, 0.095, mask);
    box(x, 0.748, length - 0.54, laneSpace - 0.06, 0.019, 0.055, lane ? neighbourLight : light);
    for (const p of rack(1)) {
      const m = mesh(pinGeo, lane ? neighbourPin : pinMat);
      m.position.copy(v(x + p.x, 0, p.z));
      if (!lane) {
        const sh = mesh(new T.PlaneGeometry(0.13, 0.13), shadowMat.clone());
        sh.rotation.x = -Math.PI / 2;
        const pose = new T.Group();
        scene.add(pose);
        pose.position.copy(m.position);
        m.position.set(0, -com, 0);
        pose.add(m);
        pins.push({ m, pose, sh, id: p.id });
      }
    }
  }
  // Walnut acoustic panels, brass inlay and suspended warm strips surround the five lanes.
  const walnut = texture(512, 256, (c, w, h) => {
    c.fillStyle = '#654538';
    c.fillRect(0, 0, w, h);
    for (let i = 0; i < 64; i++) {
      c.fillStyle = i % 3 ? '#584036' : '#755340';
      c.fillRect(i * 8, 0, 3, h);
      c.fillStyle = '#392e30';
      c.fillRect(i * 8 + 5, 0, 2, h);
    }
  });
  const wall = material('#ffffff', { map: walnut });
  box(0, 1.55, 20.12, 12, 4.2, 0.16, wall);
  box(0, 1.42, 20, 12, 0.055, 0.12, cap);
  box(0, 1.46, 19.92, 12, 0.012, 0.035, light);
  box(0, 2.85, 8, 12, 0.12, 27, material('#4a404e'));
  for (const z of [1, 6.3, 11.6, 16.9]) {
    box(0, 2.75, z, 11, 0.13, 0.15, cap);
    for (const x of [-2.9, 0, 2.9]) box(x, 2.67, z, 2.42, 0.025, 0.11, light);
  }
  for (const x of [-4.55, 4.55]) {
    box(x, 1.23, 8, 0.15, 3.2, 26, wall);
    box(x, 1.35, 8, 0.17, 0.025, 26, light);
  }
  box(0, pitFloor - 0.2, 7, 12, 0.1, 28, dark);
  // His ball: a reactive resin shell in deep cherry with pearl veins. The pattern is worked out on
  // the sphere itself, so it has no seam and no pinch at the poles, and it turns as the ball rolls.
  const ballMap = texture(512, 256, (c, w, h) => {
    const img = c.createImageData(w, h);
    const waves = [
      [1.3, 2.1, -0.7, 0.4],
      [-1.9, 0.8, 1.5, 2.2],
      [0.6, -1.7, -1.8, 4.1],
      [2.4, 1.1, 0.9, 1.3]
    ];
    const field = (x, y, z, k) => {
      let s = 0;
      for (const [a, b, d, p] of waves) s += Math.sin(k * (a * x + b * y + d * z) + p);
      return s / 4;
    };
    const mix = (a, b, t) => a + (b - a) * t;
    for (let j = 0; j < h; j++) {
      const th = ((j + 0.5) / h) * Math.PI,
        y = Math.cos(th),
        r = Math.sin(th);
      for (let i = 0; i < w; i++) {
        const ph = ((i + 0.5) / w) * 2 * Math.PI,
          x = -Math.cos(ph) * r,
          z = Math.sin(ph) * r;
        // The point drifts through a smooth field before the bands are drawn, which folds them into loops.
        const qx = x + 0.85 * field(y, z, x, 1.7),
          qy = y + 0.85 * field(z, x, y, 1.9),
          qz = z + 0.85 * field(x, y, z, 2.3);
        const band = Math.sin(2.6 * (qx + 0.6 * qy - 0.3 * qz) + 2.6 * field(qx, qy, qz, 3.1));
        const cloud = 0.5 + 0.5 * field(qz, qx, qy, 4.3);
        const mist = Math.min(1, Math.max(0, (field(qy, qz, qx, 2.2) - 0.05) * 2.2)),
          pearl = (1 - Math.abs(band)) ** 6,
          halo = (1 - Math.abs(band)) ** 3,
          deep = Math.max(0, band) ** 3;
        // Wine in the depths, cherry in between, soft clouds of pearl, a pink glow around each vein
        // and a bright pearl core.
        let R = mix(78, 160, cloud),
          G = mix(8, 26, cloud),
          B = mix(22, 42, cloud);
        R = mix(R, 52, deep * 0.8);
        G = mix(G, 4, deep * 0.8);
        B = mix(B, 18, deep * 0.8);
        R = mix(R, 196, mist * 0.4);
        G = mix(G, 92, mist * 0.4);
        B = mix(B, 104, mist * 0.4);
        R = mix(R, 210, halo * 0.35);
        G = mix(G, 70, halo * 0.35);
        B = mix(B, 84, halo * 0.35);
        R = mix(R, 244, pearl * 0.55);
        G = mix(G, 190, pearl * 0.55);
        B = mix(B, 192, pearl * 0.55);
        img.data.set([R, G, B, 255], (j * w + i) * 4);
      }
    }
    c.putImageData(img, 0, 0);
  });
  // A small painted room for the reflections: the warm strip lights over the lane ahead, the dark
  // ceiling and the lit maple below. The lights are far brighter than white, as real lamps are, so
  // the clear coat shows them. Three.js blurs it for the gloss, so it costs one small texture.
  const paint = (draw) => {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 128;
    draw(c.getContext('2d'), 256, 128);
    return c.getContext('2d').getImageData(0, 0, 256, 128).data;
  };
  const backdrop = paint((c, w, h) => {
    const sky = c.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, '#1d1a2c');
    sky.addColorStop(0.48, '#4a4058');
    sky.addColorStop(0.52, '#a27a4c');
    sky.addColorStop(1, '#3a2a1e');
    c.fillStyle = sky;
    c.fillRect(0, 0, w, h);
  });
  const lamps = paint((c, w, h) => {
    c.filter = 'blur(2px)';
    // Elevation e in degrees and azimuth in turns, 0.25 straight down the lane, 0.75 behind him.
    const glow = (u, e, du, de, alpha) => {
      c.fillStyle = 'rgba(255,236,204,' + alpha + ')';
      c.fillRect((u - du) * w, h * (0.5 - (e + de) / 180), 2 * du * w, (2 * de * h) / 180);
    };
    for (const [e, du] of [
      [62, 0.2],
      [24, 0.12],
      [14, 0.08],
      [9, 0.06]
    ])
      glow(0.25, e, du, 3, 1);
    glow(0.75, 40, 0.1, 8, 0.6);
    glow(0.5, 50, 0.05, 8, 0.35);
    glow(1, 50, 0.05, 8, 0.35);
  });
  const roomData = new Uint16Array(256 * 128 * 4),
    linear = (byte) => (byte / 255) ** 2.2;
  for (let j = 0; j < 128; j++)
    for (let i = 0; i < 256 * 4; i++) {
      const from = j * 1024 + i,
        to = (127 - j) * 1024 + i;
      roomData[to] = T.DataUtils.toHalfFloat(i % 4 === 3 ? 1 : linear(backdrop[from]) + 14 * linear(lamps[from]));
    }
  const room = new T.DataTexture(roomData, 256, 128, T.RGBAFormat, T.HalfFloatType);
  room.mapping = T.EquirectangularReflectionMapping;
  room.magFilter = room.minFilter = T.LinearFilter;
  room.needsUpdate = true;
  const ball = new T.Group();
  scene.add(ball);
  const shell = mesh(
    new T.SphereGeometry(radius, 48, 32),
    new T.MeshPhysicalMaterial({
      map: ballMap,
      roughness: 0.5,
      clearcoat: 1,
      clearcoatRoughness: 0.06,
      envMap: room,
      envMapIntensity: 0.4,
      // Drawn with the see-through things, after the path band, which lies under it.
      transparent: true
    }),
    ball
  );
  shell.renderOrder = 3;
  // The finger holes: a cap that lies on the ball, painted with a cream insert rim and a hole that
  // darkens towards its bottom. The thumb hole is larger and sits lower, about 9 cm from the fingers.
  const holeFace = texture(128, 128, (c, w) => {
    const g = c.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
    for (const [at, color] of [
      [0, '#050304'],
      [0.5, '#0b0607'],
      [0.74, '#3a1a20'],
      [0.8, '#56303a'],
      [0.82, '#efe2cf'],
      [0.9, '#c9b8a4'],
      [0.95, '#5a1c26'],
      [1, 'rgba(90,28,38,0)']
    ])
      g.addColorStop(at, color);
    c.fillStyle = g;
    c.fillRect(0, 0, w, w);
  });
  const holeFinish = new T.MeshStandardMaterial({
    map: holeFace,
    roughness: 0.45,
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2
  });
  const up = new T.Vector3(0, 1, 0);
  for (const [x, y, z, size] of [
    [-0.135, 0.72, 0.68, 0.0135],
    [0.135, 0.72, 0.68, 0.0135],
    [-0.02, 0.05, 1, 0.0155]
  ]) {
    const angle = size / radius,
      cap = new T.SphereGeometry(radius + 0.0003, 24, 3, 0, Math.PI * 2, 0, angle),
      p = cap.attributes.position,
      span = 2 * (radius + 0.0003) * Math.sin(angle);
    for (let i = 0; i < p.count; i++) cap.attributes.uv.setXY(i, 0.5 + p.getX(i) / span, 0.5 - p.getZ(i) / span);
    const hole = mesh(cap, holeFinish, shell);
    hole.renderOrder = 4;
    hole.quaternion.setFromUnitVectors(up, new T.Vector3(x, y, z).normalize());
  }
  // A soft contact shadow: dark where the ball touches the boards, fading out, a little towards him
  // because the main light is over the pins.
  const contact = texture(128, 128, (c, w) => {
    const g = c.createRadialGradient(w / 2, 70, 0, w / 2, 70, w / 2);
    for (const [at, alpha] of [
      [0, 0.78],
      [0.16, 0.62],
      [0.42, 0.24],
      [0.72, 0.07],
      [1, 0]
    ])
      g.addColorStop(at, 'rgba(30,12,8,' + alpha + ')');
    c.fillStyle = g;
    c.fillRect(0, 0, w, w);
  });
  const ballShadow = mesh(
    new T.PlaneGeometry(0.34, 0.34),
    new T.MeshBasicMaterial({ map: contact, transparent: true, depthWrite: false })
  );
  ballShadow.rotation.x = -Math.PI / 2;
  const table = new T.Group(),
    sweep = new T.Group();
  scene.add(table, sweep);
  function part(group, x, y, z, w, h, d, finish) {
    const m = mesh(new T.BoxGeometry(w, h, d), finish, group);
    m.position.set(x, y, -z);
    return m;
  }
  const steel = material('#38404a', { metalness: 0.65, roughness: 0.38 });
  const rubber = material('#9f2639', { roughness: 0.7 });
  for (const x of [-0.55, 0.55]) {
    part(table, x, 0.07, 0.4, 0.044, 0.055, 1.02, steel);
    part(table, x, 0.35, 0.4, 0.025, 0.58, 0.035, chrome);
    part(sweep, x, 0.51, 0.025, 0.026, 1.02, 0.035, steel);
  }
  for (let row = 0; row < 4; row++) part(table, 0, 0.07, row * 0.3048 * Math.sqrt(0.75), 1.1, 0.04, 0.027, steel);
  const cups = rack(0).map((p) => {
    const cup = mesh(new T.CylinderGeometry(0.041, 0.055, 0.068, 20, 1, true), steel, table);
    cup.material.side = T.DoubleSide;
    const rim = mesh(new T.TorusGeometry(0.054, 0.004, 8, 24), chrome, cup);
    rim.rotation.x = Math.PI / 2;
    rim.position.y = -0.033;
    cup.position.set(p.x, 0.023, length - p.z);
    return cup;
  });
  const pad = mesh(new T.CapsuleGeometry(0.043, 2 * wallX - 0.12, 5, 20), rubber, sweep);
  pad.rotation.z = Math.PI / 2;
  part(sweep, 0, 0.036, 0.015, 2 * wallX - 0.09, 0.018, 0.025, chrome);
  table.visible = sweep.visible = false;
  // The ball return of a 1960s alley stands on the approach, between his lane and the next one, clear
  // of his gutter. The ball comes up under the hood at the back and rolls forward on a chrome rack
  // to the balls that wait against the curved stop.
  const ret = new T.Group();
  scene.add(ret);
  ret.position.copy(v(1.02, 0.12, 0.1));
  // A box with rounded edges along its length and bevelled ends, centred on v(x, y, z) in the machine.
  // Upright, it is rounded in plan instead.
  function rounded(w, h, d, r, finish, x, y, z, upright = false) {
    if (upright) [h, d] = [d, h];
    const b = Math.min(r, 0.012),
      rr = Math.max(0.002, r - b),
      a = w / 2 - b - rr,
      c = h / 2 - b - rr,
      s = new T.Shape();
    s.absarc(a, -c, rr, -Math.PI / 2, 0);
    s.absarc(a, c, rr, 0, Math.PI / 2);
    s.absarc(-a, c, rr, Math.PI / 2, Math.PI);
    s.absarc(-a, -c, rr, Math.PI, 1.5 * Math.PI);
    const g = new T.ExtrudeGeometry(s, {
      depth: d - 2 * b,
      bevelThickness: b,
      bevelSize: b,
      bevelSegments: 2,
      curveSegments: 4
    });
    g.center();
    if (upright) g.rotateX(-Math.PI / 2);
    const m = mesh(g, finish, ret);
    m.position.copy(v(x, y, z));
    return m;
  }
  const lacquer = material('#B8323F', { roughness: 0.3, metalness: 0.05 }),
    enamel = material('#FFF2CE', { roughness: 0.45 }),
    brass = material('#c9a253', { metalness: 0.7, roughness: 0.3 });
  // A low cherry cabinet on a dark toe kick, with a cream band, a brass line and a chrome foot strip.
  // Under the hood it widens into a pedestal, round in plan.
  rounded(0.28, 0.2, 1.84, 0.03, dark, 0, -0.16, -2.03);
  rounded(0.34, 0.36, 1.9, 0.07, lacquer, 0, 0.12, -2.03);
  rounded(0.46, 0.39, 0.62, 0.12, lacquer, 0, 0.105, -2.66, true);
  for (const [w, h, y, r, finish] of [
    [0.348, 0.06, 0.12, 0.02, enamel],
    [0.35, 0.01, 0.165, 0.004, brass],
    [0.346, 0.014, -0.05, 0.006, chrome]
  ]) {
    rounded(w, h, 1.26, r, finish, 0, y, -1.72);
    rounded(w + 0.12, h, 0.63, 0.122, finish, 0, y + (y < 0 ? -0.03 : 0), -2.66, true);
  }
  rounded(0.17, 0.02, 1.2, 0.008, dark, 0, 0.3, -1.72);
  // One chrome tube: two rails that slope gently forward and bend up into the stop.
  const rail = [
    [0.065, 0.335, -2.4],
    [0.065, 0.327, -1.8],
    [0.065, 0.32, -1.3],
    [0.063, 0.33, -1.16],
    [0.045, 0.37, -1.09],
    [0, 0.385, -1.07]
  ];
  const railPoints = [...rail, ...rail.slice(0, -1).reverse().map(([x, y, z]) => [-x, y, z])];
  mesh(new T.TubeGeometry(new T.CatmullRomCurve3(railPoints.map((p) => v(...p))), 72, 0.012, 8, false), chrome, ret);
  const post = mesh(new T.CylinderGeometry(0.012, 0.018, 0.09, 10), chrome, ret);
  post.position.copy(v(0, 0.33, -1.1));
  // The hood: a cherry cowl with a chrome rim around its dark mouth, a brass medallion on each side.
  const hood = new T.Group();
  ret.add(hood);
  hood.position.copy(v(0, 0.29, -2.51));
  hood.scale.y = 1.2;
  const arch = mesh(new T.CylinderGeometry(0.23, 0.23, 0.3, 28, 1, true, -Math.PI / 2, Math.PI), lacquer, hood);
  arch.rotation.x = -Math.PI / 2;
  mesh(new T.SphereGeometry(0.23, 28, 8, 0, Math.PI, 0, Math.PI / 2), lacquer, hood).position.copy(v(0, 0, -0.15));
  const rim = mesh(new T.TorusGeometry(0.232, 0.015, 8, 28, Math.PI), chrome, hood);
  rim.position.copy(v(0, 0, 0.15));
  const seam = mesh(new T.TorusGeometry(0.232, 0.009, 6, 28, Math.PI), chrome, hood);
  seam.position.copy(v(0, 0, -0.15));
  const mouth = mesh(new T.CircleGeometry(0.225, 24, 0, Math.PI), material('#100d16', { side: T.DoubleSide }), hood);
  mouth.position.copy(v(0, 0, 0.1));
  for (const side of [-1, 1]) {
    const medal = mesh(new T.CylinderGeometry(0.05, 0.05, 0.012, 24), brass, hood);
    medal.rotation.z = Math.PI / 2;
    medal.position.copy(v(side * 0.22, 0.07, -0.02));
    const face = mesh(new T.CylinderGeometry(0.032, 0.032, 0.014, 20), enamel, hood);
    face.rotation.z = Math.PI / 2;
    face.position.copy(v(side * 0.222, 0.07, -0.02));
  }
  // The air blower on top: a chrome drum with a round grille.
  const grille = texture(128, 128, (c, w) => {
    c.fillStyle = '#2a2630';
    c.fillRect(0, 0, w, w);
    c.strokeStyle = '#b8b8c0';
    c.lineWidth = 4;
    for (let r = 12; r < 62; r += 11) {
      c.beginPath();
      c.arc(64, 64, r, 0, Math.PI * 2);
      c.stroke();
    }
    c.fillStyle = '#c9a253';
    c.beginPath();
    c.arc(64, 64, 8, 0, Math.PI * 2);
    c.fill();
  });
  const blower = mesh(new T.CylinderGeometry(0.075, 0.085, 0.04, 28), [
    chrome,
    material('#ffffff', { map: grille, metalness: 0.3, roughness: 0.4 }),
    chrome
  ], ret);
  blower.position.copy(v(0, 0.575, -2.56));
  // Two other balls wait on the rack, navy and emerald.
  for (const [z, color] of [
    [-1.25, '#22346e'],
    [-1.47, '#17765a']
  ]) {
    const other = mesh(new T.SphereGeometry(radius, 32, 20), material(color, { roughness: 0.16, metalness: 0.1 }), ret);
    other.position.copy(v(0, 0.421 + (0.015 * (-1.3 - z)) / 1.1, z));
    other.rotation.set(0.4 * z, 2 * z, 0.3);
    for (const dir of [
      [-0.23, 0.62, 0.75],
      [0.13, 0.62, 0.78],
      [-0.03, 0.22, 0.97]
    ]) {
      const m = mesh(new T.CircleGeometry(0.012, 16), dark, other);
      m.position
        .set(...dir)
        .normalize()
        .multiplyScalar(radius + 0.0004);
      m.lookAt(m.position.clone().multiplyScalar(3));
    }
  }
  // His ball rises inside the hood and rolls out of its mouth to stop behind the waiting balls.
  const returnPath = new T.CatmullRomCurve3(
    [
      [0.12, -2.6],
      [0.3, -2.58],
      [0.42, -2.48],
      [0.432, -2.25],
      [0.429, -1.95],
      [0.426, -1.69]
    ].map(([y, z]) => v(0, y, z).add(ret.position))
  );
  // The path: one slim warm white band, about 7 cm wide by the ball and 13 cm at the pins, flat on the boards, with a thin dark edge so it
  // reads on the light maple, and small gold chevrons that point to the pins. It is a single mesh whose
  // points are rewritten each time he changes the shot, so aiming allocates nothing.
  const pathFace = texture(128, 256, (c, w, h) => {
    const g = c.createLinearGradient(0, 0, w, 0);
    for (const [at, color] of [
      [0, 'rgba(42,34,51,0)'],
      [0.08, 'rgba(42,34,51,.85)'],
      [0.2, 'rgba(42,34,51,.85)'],
      [0.24, 'rgba(255,248,232,.97)'],
      [0.76, 'rgba(255,248,232,.97)'],
      [0.8, 'rgba(42,34,51,.85)'],
      [0.92, 'rgba(42,34,51,.85)'],
      [1, 'rgba(42,34,51,0)']
    ])
      g.addColorStop(at, color);
    c.fillStyle = g;
    c.fillRect(0, 0, w, h);
    // A small gold chevron every few metres, pointing to the pins.
    c.strokeStyle = '#d99a1c';
    c.lineWidth = 16;
    c.lineCap = 'round';
    c.lineJoin = 'round';
    c.beginPath();
    c.moveTo(w * 0.34, 150);
    c.lineTo(w / 2, 106);
    c.lineTo(w * 0.66, 150);
    c.stroke();
  });
  pathFace.wrapT = T.RepeatWrapping;
  pathFace.anisotropy = 8;
  const samples = 160,
    pathGeo = new T.BufferGeometry(),
    pathPos = new Float32Array(samples * 6),
    pathUv = new Float32Array(samples * 4),
    pathTint = new Float32Array(samples * 8);
  pathGeo.setAttribute('position', new T.BufferAttribute(pathPos, 3));
  pathGeo.setAttribute('uv', new T.BufferAttribute(pathUv, 2));
  pathGeo.setAttribute('color', new T.BufferAttribute(pathTint, 4));
  const order = [];
  for (let i = 0; i < 2 * samples - 2; i += 2) order.push(i, i + 2, i + 1, i + 1, i + 2, i + 3);
  pathGeo.setIndex(order);
  const pathLine = mesh(
    pathGeo,
    new T.MeshBasicMaterial({
      map: pathFace,
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      fog: false,
      // So far down the lane the depth buffer cannot tell the band from the boards a few
      // millimetres below, so it skips the depth test and the ball is drawn over it afterwards.
      depthTest: false,
      side: T.DoubleSide
    })
  );
  pathLine.frustumCulled = false;
  pathLine.renderOrder = 1;
  // The height of the band at x: just over the boards, or down the round trough of a gutter.
  const trough = (width + gutterWidth) / 2,
    troughRadius = gutterWidth / 2;
  const floorAt = (x) => {
    const d = Math.min(Math.abs(x) - trough, 0.8 * troughRadius);
    return Math.abs(x) <= width / 2 ? 0.003 : 0.006 - 0.013 - Math.sqrt(troughRadius ** 2 - d * d);
  };
  // Lays the band along the path from one distance to another. It fades over the last metre before
  // the cut, and turns red once the ball is in a gutter. It widens a little with distance and the
  // chevrons spread out, so they stay readable far down the lane.
  function drawPath(path, from, to, cut) {
    let k = 0,
      gutter = false,
      fell = 0;
    for (let i = 0; i < samples; i++) {
      const z = from + ((to - from) * i) / (samples - 1);
      while (k < path.length - 2 && path[k + 1].z < z) k++;
      const a = path[k],
        b = path[k + 1],
        slope = (b.x - a.x) / (b.z - a.z || 1);
      let x = a.x + slope * (z - a.z);
      if (a.gutter && !gutter) fell = z;
      gutter ||= !!a.gutter;
      // In a gutter the band slides over half a metre into the middle of the trough and narrows
      // to fit it, then runs straight on.
      const drop = gutter ? Math.min(1, (z - fell) / 0.5) : 0;
      x += (Math.sign(x) * trough - x) * drop;
      const half = (0.035 + 0.0016 * z) * (1 - drop) + 0.035 * drop,
        nx = gutter ? half : half / Math.sqrt(1 + slope * slope),
        nz = gutter ? 0 : -slope * nx,
        alpha = Math.min(1, cut - z, 0.4 + 2 * (z - from)),
        along = 24 * Math.log(0.7 + 0.05 * z);
      for (const side of [0, 1]) {
        const s = side ? 1 : -1,
          px = x + s * nx,
          n = 2 * i + side;
        pathPos.set([px, floorAt(px), -(z + s * nz)], 3 * n);
        pathUv.set([side, along], 2 * n);
        pathTint.set(gutter ? [1, 0.32, 0.3, alpha] : [1, 1, 1, alpha], 4 * n);
      }
    }
    for (const name of ['position', 'uv', 'color']) pathGeo.attributes[name].needsUpdate = true;
  }
  // The target: a yellow ring with a dark rim, flat on the boards just in front of the head pin,
  // where the path ends. It is part of the scene, so it can never drift off the path.
  const target = new T.Group();
  for (const [inner, outer, color, y] of [
    [0.075, 0.2, '#2a2233', 0.006],
    [0.095, 0.18, '#ffc83d', 0.008]
  ]) {
    // Drawn after the path band, so the band runs under the ring.
    const ring = mesh(new T.RingGeometry(inner, outer, 40), new T.MeshBasicMaterial({ color, transparent: true }), target);
    ring.renderOrder = 2;
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = y;
  }
  scene.add(target);
  const targetZ = length - 0.32;
  const aimEye = v(0, 2.6, -9),
    aimLook = v(0, 0, 0),
    deckEye = v(0, 1.3, length - 3.6),
    deckLook = v(0, 0.17, length + 0.42);
  const inset = document.getElementById('deckInset');
  const insetCamera = new T.PerspectiveCamera();
  insetCamera.position.copy(deckEye);
  insetCamera.lookAt(deckLook);
  let active = false,
    level = '',
    pending = 0,
    aimFocal = 600,
    insetWidth = 0,
    insetHeight = 0;
  // A real lens, as in a bowling hall: the eye of a standing player behind the ball, so the lane narrows
  // towards the pins. The deck view keeps the two kickbacks across the width.
  const focalAt = (blend) =>
    T.MathUtils.lerp(aimFocal, Math.min(canvas.clientWidth * (inset.hidden ? 1.9 : 1.45), canvas.clientHeight * 3.2), blend);
  function cameraAt(eye, look, blend = 0) {
    camera.position.copy(eye);
    camera.lookAt(look);
    camera.updateMatrixWorld();
    const w = canvas.clientWidth,
      h = canvas.clientHeight;
    if (!w || !h) return;
    const f = focalAt(blend);
    camera.fov = T.MathUtils.radToDeg(2 * Math.atan(h / (2 * f)));
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  function screen(x, y, z) {
    const p = v(x, y, z).project(camera);
    return { x: ((1 + p.x) * canvas.clientWidth) / 2, y: ((1 - p.y) * canvas.clientHeight) / 2 };
  }
  function draw() {
    const w = canvas.clientWidth,
      h = canvas.clientHeight;
    renderer.setViewport(0, 0, w, h);
    // Spread the deck across the wide stage while keeping the ball and pins round.
    renderer.render(scene, camera);
    if (inset.hidden) return;
    const iw = insetWidth;
    const frameHeight = insetHeight;
    inset.style.height = frameHeight + 'px';
    inset.style.width = iw + 'px';
    const caption = 28;
    const ih = frameHeight - caption - 2;
    insetCamera.aspect = (iw - 4) / ih;
    const focal = Math.min(iw * 3.05, ih * 6.2);
    insetCamera.fov = T.MathUtils.radToDeg(2 * Math.atan(ih / (2 * focal)));
    insetCamera.updateProjectionMatrix();
    const x = w - 8 - iw + 2,
      y = h - 8 - frameHeight + 2;
    renderer.setViewport(x, y, iw - 4, ih);
    renderer.setScissor(x, y, iw - 4, ih);
    renderer.setScissorTest(true);
    renderer.render(scene, insetCamera);
    renderer.setScissorTest(false);
  }
  function invalidate() {
    if (!pending)
      pending = requestAnimationFrame(() => {
        pending = 0;
        draw();
      });
  }
  function resize() {
    const w = canvas.clientWidth,
      h = canvas.clientHeight;
    if (!h || !w) return;
    renderer.setSize(w, h, false);
    inset.hidden = w < 420 || h < 60;
    insetWidth = Math.min(320, Math.max(170, Math.round(w * 0.34)));
    insetHeight = Math.round(Math.min(h * 0.62, insetWidth * 0.63));
    // Frame the foot of the ball at 90 % of the height and the tops of the back pins at 10 %:
    // the pitch is halfway between the two rays, and the focal length fits them.
    const eyeY = aimEye.y,
      back = length + 0.79 + aimEye.z, // aimEye.z is in scene axes, where the lane runs to -z
      down = Math.atan2(eyeY, aimEye.z),
      up = Math.atan2(eyeY - 0.381, back),
      pitch = (down + up) / 2;
    aimFocal = (0.4 * h) / Math.tan((down - up) / 2);
    aimLook.set(0, eyeY - Math.tan(pitch) * 10, aimEye.z - 10);
    if (!active) {
      cameraAt(aimEye, aimLook);
      draw();
    }
  }
  cameraAt(aimEye, aimLook);
  new ResizeObserver(resize).observe(canvas);
  resize();
  const orientation = new T.Quaternion();
  function rotation(target, p) {
    if (p.q) {
      const [x, y, z, w] = p.q;
      return target.set(-x, -y, z, w);
    }
    const axis = v(Math.sin(p.heading) * Math.sin(p.tilt), Math.cos(p.tilt), Math.cos(p.heading) * Math.sin(p.tilt));
    return target.setFromUnitVectors(new T.Vector3(0, 1, 0), axis);
  }
  const axis = new T.Vector3();
  function showPins(list, next = list, fraction = 0) {
    for (const { pose, m, sh, id } of pins) {
      const p = list.find((p) => p.id === id);
      m.visible = !!p;
      sh.visible = !!p;
      if (!p) continue;
      const n = next.find((n) => n.id === id) || p;
      rotation(pose.quaternion, p).slerp(rotation(orientation, n), fraction);
      pose.position.set(
        T.MathUtils.lerp(p.x, n.x, fraction),
        T.MathUtils.lerp(p.y ?? com, n.y ?? com, fraction),
        -T.MathUtils.lerp(p.z, n.z, fraction)
      );
      // The shadow follows the lowest point of the turned profile as the pin tips.
      axis.set(0, 1, 0).applyQuaternion(pose.quaternion);
      const lateral = Math.sqrt(axis.x * axis.x + axis.z * axis.z);
      let gap = Infinity, along = 0;
      for (const [r, h] of profile) {
        const y = pose.position.y + (h - com) * axis.y - r * lateral;
        if (y < gap) {
          gap = y;
          along = h - com + (lateral > 1e-6 ? r * axis.y / lateral : 0);
        }
      }
      const x = pose.position.x + along * axis.x, z = pose.position.z + along * axis.z;
      sh.visible = gap > -0.03 && gap < 0.20 && -z <= deckEnd && Math.abs(x) < width / 2;
      sh.position.set(x, 0.0004, z);
      sh.material.opacity = T.MathUtils.clamp(1 - gap / 0.20, 0, 1);
      sh.scale.setScalar(1 + Math.max(0, gap) * 3);
    }
  }
  function setBall(x, z, gutter = false, y = radius - (gutter ? 0.085 : 0)) {
    ball.visible = true;
    ball.position.copy(v(x, y, z));
    ballShadow.visible = z <= deckEnd && !gutter && y > 0;
    ballShadow.position.copy(v(x, 0.002, z));
  }
  function aim(list, shot, lvl) {
    active = false;
    level = lvl;
    cameraAt(aimEye, aimLook);
    showPins(list);
    const path = trajectory(shot, lvl);
    setBall(path[0].x, 0);
    shell.rotation.set(0, 0, 0);
    sweep.visible = table.visible = false;
    canvas.dataset.phase = 'aim';
    const cut = { facile: length + 1, moyen: length / 2, fort: 4.6 }[lvl];
    let index = 0;
    const xAt = (z) => {
      while (index < path.length - 1 && path[index].z < z) index++;
      const a = path[Math.max(0, index - 1)],
        b = path[index];
      return b.z === a.z ? b.x : a.x + ((b.x - a.x) * (z - a.z)) / (b.z - a.z);
    };
    // In Facile the band runs into the middle of the ring; elsewhere it fades out at the cut.
    drawPath(path, radius, Math.min(cut, targetZ), cut);
    pathLine.visible = true;
    // A ball that drops into the gutter first has no target.
    target.visible = arrival(path) !== null;
    target.position.copy(v(xAt(targetZ), 0, targetZ));
    invalidate();
  }
  function animate(result, settled, nextRack, replace) {
    if (reduced()) {
      settled();
      return Promise.resolve();
    }
    active = true;
    target.visible = false;
    pathLine.visible = false;
    const { path, frames, impact } = result;
    const hold = impact + (frames.length - 1) * frameStep,
      clear = hold + 1.2,
      back = clear + 2.5,
      end = back + 0.8;
    const keep = new Set(result.standing.map((p) => p.id));
    const last = frames.at(-1);
    const ease = (time, from, to) => {
      const k = T.MathUtils.clamp((time - from) / (to - from), 0, 1);
      return k * k * (3 - 2 * k);
    };
    let announced = false;
    const start = performance.now();
    return new Promise((resolve) => {
      function tick(now) {
        const t = Math.max(0, now - start) / 1000;
        const u = T.MathUtils.clamp((t - impact) / frameStep, 0, frames.length - 1);
        const frame = frames[Math.floor(u)],
          next = frames[Math.min(frames.length - 1, Math.floor(u) + 1)],
          f = u % 1;
        const p = t < impact ? path[Math.min(path.length - 1, Math.floor(t / step))] : frame.ball;
        if (t < impact) setBall(p.x, p.z, p.gutter);
        else {
          setBall(
            T.MathUtils.lerp(p.x, next.ball.x, f),
            T.MathUtils.lerp(p.z, next.ball.z, f),
            p.gutter,
            T.MathUtils.lerp(p.y, next.ball.y, f)
          );
          rotation(shell.quaternion, p).slerp(rotation(orientation, next.ball), f);
        }
        if (t < impact) shell.rotation.set(-p.z / radius, 0, p.x / radius);
        if (t < impact) {
          // The camera follows behind the ball and settles at the deck as the ball nears the pins.
          // One steady glide from the aim view to the deck view over the whole roll, driven by the
          // ball, not by the clock: the camera closes from 9 m to 3.3 m behind the ball, comes down,
          // and turns from keeping the ball low in the picture to framing the deck. At the impact it
          // is exactly at the deck view, so nothing jumps. An earlier version stayed in the follow view
          // and changed in the last metres, which looked like a sudden zoom.
          const end = path.at(-1).z,
            deckZ = length - 3.6;
          let k = Math.min(1, Math.max(0, p.z / end));
          k = k * k * (3 - 2 * k);
          const eyeZ = p.z - T.MathUtils.lerp(aimEye.z, end - deckZ, k), // aimEye.z is +9 in scene axes: 9 m behind
            eyeY = T.MathUtils.lerp(aimEye.y, deckEye.y, k),
            h = canvas.clientHeight || 1,
            onBall = Math.atan2(eyeY - radius, p.z - eyeZ) - Math.atan((0.356 * h) / focalAt(k)),
            onDeck = Math.atan2(eyeY - deckLook.y, length + 0.42 - eyeZ),
            pitch = T.MathUtils.lerp(onBall, onDeck, k * k);
          cameraAt(v(0, eyeY, eyeZ), v(0, eyeY - Math.tan(pitch) * 10, eyeZ + 10), k);
        } else cameraAt(deckEye, deckLook, 1);
        canvas.dataset.phase = t < impact ? 'roll' : t < hold ? 'impact' : 'hold';
        if (t >= impact) showPins(frame.pins, next.pins, f);
        if (t >= hold && !announced) {
          announced = true;
          settled();
        }
        if (t >= clear) {
          const time = t - clear;
          const lower = ease(time, 0, 0.34),
            lift = ease(time, 0.34, 0.66);
          const deposit = ease(time, 1.77, 2.16),
            rise = ease(time, 2.16, 2.5);
          const travel = 0.56,
            cupY = 0.345;
          const height = replace ? travel * (1 - deposit + rise) : travel * (1 - lower + lift - deposit + rise);
          table.visible = time < 2.5 && (!replace || time >= 1.52);
          table.position.copy(v(0, cupY + height, length));
          for (const p of nextRack) cups[p.id - 1].position.set(p.x, 0.023, length - p.z);
          const drop = ease(time, 0.55, 0.85),
            push = ease(time, 0.85, 1.48),
            retract = ease(time, 1.48, 1.93);
          const sweepZ = length - 0.4 + 1.93 * (push - retract);
          sweep.visible = time >= 0.55 && time < 1.93;
          sweep.position.copy(v(0, 0.053 + 0.77 * (1 - drop + retract), sweepZ));
          sweep.rotation.x = 0.15 * Math.sin(Math.PI * push);
          canvas.dataset.phase = time < 0.66 && !replace ? 'pickup' : time < 1.77 ? 'sweep' : 'set';
          if (time >= 1.52 && replace) showPins(nextRack);
          for (const { id, m, pose, sh } of pins) {
            if (!m.visible) continue;
            if ((replace && time >= 1.52) || (!replace && keep.has(id))) {
              const shift = travel * (replace ? 1 - deposit : lift - deposit);
              pose.position.y += shift;
              if (shift > 0.04) sh.visible = false;
            } else if (time >= 0.85) {
              const z = Math.max(-pose.position.z, length - 0.4 + 1.93 * push + 0.06);
              pose.position.z = -z;
              if (z > deckEnd) {
                pose.position.y -= Math.min(0.45, (z - deckEnd) * 2);
                sh.visible = false;
              }
              if (push === 1) m.visible = sh.visible = false;
            }
          }
          if (last.ball.z < deckEnd && time >= 0.85)
            setBall(
              last.ball.x,
              Math.max(last.ball.z, length - 0.4 + 1.93 * push + radius),
              false,
              last.ball.y - 0.42 * ease(push, 0.77, 1)
            );
        }
        if (t >= back) {
          canvas.dataset.phase = 'return';
          const k = 1 - (1 - ease(t, back, end)) ** 3;
          cameraAt(deckEye.clone().lerp(aimEye, k), deckLook.clone().lerp(aimLook, k), 1 - k);
          const at = returnPath.getPointAt(ease(t, back + 0.1, end));
          setBall(at.x, -at.z, false, at.y);
          shell.rotation.set(at.z / radius, 0, 0);
        }
        draw();
        if (t < end) requestAnimationFrame(tick);
        else resolve();
      }
      requestAnimationFrame(tick);
    });
  }
  function pick(p) {
    const ray = new T.Raycaster();
    ray.setFromCamera({ x: (2 * p.x) / canvas.clientWidth - 1, y: 1 - (2 * p.y) / canvas.clientHeight }, camera);
    const hit = ray.intersectObjects(pins.filter((p) => p.m.visible).map((p) => p.m))[0];
    if (hit) return { x: hit.object.parent.position.x, z: -hit.object.parent.position.z, pin: true };
    const at = new T.Vector3();
    if (!ray.ray.intersectPlane(new T.Plane(new T.Vector3(0, 1, 0), 0), at) || -at.z < 0.1) return null;
    return { x: at.x, z: Math.min(length, -at.z) };
  }
  function ballAt() {
    const center = screen(ball.position.x, radius, 0);
    return { ...center, radius: screen(ball.position.x + radius, radius, 0).x - center.x };
  }
  return { aim, animate, pick, ballAt };
}
