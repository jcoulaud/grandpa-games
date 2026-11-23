// The golf page in a browser: the rules guide, the pull and the click, undo across a reload, a whole
// course with the hint, the score card at the listed window sizes, old and broken saves, and no WebGL.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { launch } from './harness.mjs';

const browser = await launch();
try {
  const page = await browser.newPage({ viewport: { width: 1366, height: 680 }, reducedMotion: 'reduce' });
  const errors = [];
  const stats = [];
  page.on('pageerror', (err) => errors.push(err.message));
  // Serve ES modules with their MIME types at a local origin, without an external service.
  await page.route('http://localhost/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.startsWith('/api/')) {
      if (path === '/api/stats') stats.push(route.request().postDataJSON().kind);
      return route.fulfill({ json: { ok: true } });
    }
    const file = path.endsWith('/') ? path + 'index.html' : path;
    const mime = { js: 'text/javascript', css: 'text/css', html: 'text/html', svg: 'image/svg+xml', woff2: 'font/woff2', webp: 'image/webp' };
    try {
      await route.fulfill({ contentType: mime[file.split('.').pop()], body: await readFile(new URL('../public' + file, import.meta.url)) });
    } catch {
      await route.fulfill({ status: 404, body: '' });
    }
  });
  const sizes = [
    [1366, 680, 1],
    [1093, 530, 1],
    [1920, 1000, 1],
    [1280, 620, 1],
    [390, 760, 1],
    [1366, 680, 1.3],
    [1920, 1000, 1.75]
  ];
  const setSize = async (width, height, zoom) => {
    await page.setViewportSize({ width, height });
    await page.evaluate((z) => localStorage.setItem('gg:size', JSON.stringify(z)), zoom);
    await page.reload();
  };
  await page.goto('http://localhost/golf/');
  await page.locator('#help.on').waitFor();
  for (const [width, height, zoom] of sizes) {
    await setSize(width, height, zoom);
    await page.locator('#help.on').waitFor();
    for (let i = 0; i < 5; i++) {
      const fits = await page.evaluate(() => {
        const b = document.querySelector('#helpBox').getBoundingClientRect(),
          t = document.querySelector('#helpText');
        return b.left >= -1 && b.right <= innerWidth + 1 && b.bottom <= innerHeight + 1 && (innerHeight < 620 || t.scrollHeight <= t.clientHeight + 1);
      });
      assert.ok(fits, 'rules ' + [width, height, zoom, i]);
      if (i < 4) await page.click('#helpNext');
    }
  }
  await setSize(1366, 680, 1);
  await page.click('#helpClose');
  await page.getByRole('button', { name: 'Facile', exact: true }).click();
  const strokes = () => page.textContent('#strokes');
  // Where the ball is on the screen: the game says where it draws it in the canvas.
  const ball = () =>
    page.evaluate(() => {
      const c = document.querySelector('canvas'),
        r = c.getBoundingClientRect(),
        b = c.ballAt();
      return { x: r.left + b.x * Zoom.z(), y: r.top + b.y * Zoom.z() };
    });
  const cupAt = () =>
    page.evaluate(() => {
      const c = document.querySelector('canvas'),
        r = c.getBoundingClientRect(),
        b = c.cupAt();
      return { x: r.left + b.x * Zoom.z(), y: r.top + b.y * Zoom.z() };
    });
  // A pull: press 20 px from the ball, pull away from the cup, and let go there.
  async function pull(length, back = false) {
    const b = await ball(),
      c = await cupAt(),
      l = Math.hypot(c.x - b.x, c.y - b.y),
      ux = (b.x - c.x) / l,
      uy = (b.y - c.y) / l;
    await page.mouse.move(b.x + 14, b.y + 14);
    await page.mouse.down();
    for (let k = 1; k <= 6; k++) await page.mouse.move(b.x + (ux * length * k) / 6, b.y + (uy * length * k) / 6);
    assert.ok(await page.evaluate(() => parseFloat(document.querySelector('#force b').style.width) > 0), 'the strength shows during a pull');
    assert.ok(await page.locator('#band').isVisible(), 'the band shows during a pull');
    if (back) await page.mouse.move(b.x + 4, b.y + 4, { steps: 4 });
    await page.mouse.up();
  }

  // 1. The pull plays the shot on release, as the preview showed it.
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await pull(110);
  await page.waitForFunction(() => document.querySelector('#strokes').textContent === '1');
  await page.waitForFunction(() => /arrête|trou/.test(document.querySelector('#msg').textContent), null, { timeout: 15000 });
  assert.equal(await page.evaluate(() => document.querySelector('#force b').style.width), '0%');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  // 2. Back on the ball, the pull is cancelled.
  await pull(110, true);
  assert.equal(await strokes(), '1');
  assert.match(await page.textContent('#msg'), /annulé/);
  // 3. A press that moves less than 16 px is a click: it sets a target and the yellow button plays it.
  const b = await ball(),
    c = await cupAt();
  await page.mouse.move((b.x + c.x) / 2, (b.y + c.y) / 2);
  await page.mouse.down();
  await page.mouse.move((b.x + c.x) / 2 + 8, (b.y + c.y) / 2 + 5);
  await page.mouse.up();
  assert.ok(await page.locator('#shoot').isEnabled());
  assert.equal(await strokes(), '1');
  assert.match(await page.textContent('#msg'), /Taper la balle/);
  // 4. A click off the lane says where to click. At least one corner of the view is off the lane.
  const rect = await page.locator('canvas').boundingBox();
  let off = false;
  for (const [x, y] of [[30, 30], [rect.width - 30, 30], [30, rect.height - 30], [rect.width - 30, rect.height - 30]]) {
    await page.mouse.click(rect.x + x, rect.y + y);
    off ||= /intérieur/.test(await page.textContent('#msg'));
  }
  assert.ok(off, 'a click off the lane says where to click');
  // 5. The stroke survives a reload, and undo takes it back.
  await page.evaluate(() => GG.flush());
  await page.reload();
  assert.equal(await strokes(), '1');
  await page.click('#undoBtn');
  assert.equal(await strokes(), '0');
  await page.evaluate(() => GG.flush());
  // 6. At 130 %, the pull still starts on the ball.
  await setSize(1366, 680, 1.3);
  await pull(90);
  await page.waitForFunction(() => document.querySelector('#strokes').textContent === '1');
  await page.click('#undoBtn');
  await page.evaluate(() => GG.flush());
  await setSize(1366, 680, 1);
  assert.equal(await strokes(), '0');

  // 7. The main screen fits every listed window: nothing past the sides, buttons 44 px high.
  for (const [width, height, zoom] of sizes) {
    await setSize(width, height, zoom);
    const ok = await page.evaluate(() => {
      const inside = (e) => {
        const r = e.getBoundingClientRect();
        return r.width > 0 && r.left >= -1 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1;
      };
      const stage = document.querySelector('#stage').getBoundingClientRect();
      return (
        document.body.scrollWidth <= innerWidth &&
        [...document.querySelectorAll('#bar button, #actions button, #holeHead, #stats, #stage')].every(inside) &&
        [...document.querySelectorAll('#actions button')].every((e) => e.getBoundingClientRect().height >= 44 * Zoom.z() - 1) &&
        stage.height > 220
      );
    });
    assert.ok(ok, 'screen ' + [width, height, zoom]);
  }
  await setSize(1366, 680, 1);

  // 8. The whole course with the hint, at par or better.
  const flush = () => page.evaluate(() => GG.flush());
  for (let i = 0; i < 9; i++) {
    while (await page.locator('#hintBtn').isEnabled()) {
      await page.click('#hintBtn');
      const before = await strokes();
      await page.click('#shoot');
      await page.waitForFunction((old) => document.querySelector('#strokes').textContent !== old, before);
      await flush();
      assert.ok(+(await strokes()) <= +(await page.textContent('#par')), 'the hint makes par on hole ' + (i + 1));
    }
    if (i < 8) {
      await page.getByRole('button', { name: 'Trou suivant' }).click();
      await page.waitForFunction((n) => document.querySelector('#holeOf').textContent === 'Trou ' + n + ' sur 9', i + 2);
      await flush();
    }
  }
  await page.waitForSelector('#over.on .scores');
  assert.equal(await page.locator('.scores tbody tr').count(), 9);
  assert.match(await page.textContent('#overText'), /gagné/);
  // The score card fits without scrolling in the laptop window, at 125 % text and on a phone.
  for (const [width, height] of [
    [1366, 680],
    [1093, 530],
    [390, 760]
  ]) {
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(100);
    const fits = await page.evaluate(() => {
      const box = document.querySelector('#box'),
        r = box.getBoundingClientRect();
      return r.top >= -1 && r.left >= -1 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1 && box.scrollHeight <= box.clientHeight + 1;
    });
    assert.ok(fits, 'score card ' + [width, height]);
  }
  await page.setViewportSize({ width: 1366, height: 680 });
  await page.reload();
  await page.click('#overBtns button:first-child');
  await page.setViewportSize({ width: 390, height: 760 });
  await page.click('#undoBtn');
  await page.click('#hintBtn');
  await page.click('#shoot');
  await page.waitForSelector('#over.on .scores');
  assert.ok(await page.evaluate(() => document.body.scrollWidth <= innerWidth));
  assert.equal(stats.filter((kind) => kind === 'start').length, 1);
  assert.equal(stats.filter((kind) => kind === 'won').length, 1);

  // 9. A save that no longer replays gives a fresh course at its level, without a crash.
  await page.setViewportSize({ width: 1366, height: 680 });
  const seedOf = () => page.evaluate(() => JSON.parse(localStorage.getItem('gg:save:golf')).data.seed);
  const seed = await seedOf();
  await page.evaluate(() => {
    const record = JSON.parse(localStorage.getItem('gg:save:golf'));
    record.data.rounds[0] = [{ x: 99, z: 0 }];
    localStorage.setItem('gg:save:golf', JSON.stringify(record));
  });
  await page.reload();
  await page.waitForFunction(() => /nouveau parcours/.test(document.querySelector('#msg').textContent));
  assert.notEqual(await seedOf(), seed);
  assert.match(await page.textContent('#level'), /facile/);
  // 10. A save of the first version, without a seed, also starts a fresh course at its level.
  await page.evaluate(() =>
    localStorage.setItem('gg:save:golf', JSON.stringify({ updatedAt: Date.now(), summary: '', data: { v: 1, level: 'fort', finished: 2, credited: false, won: false, rounds: [[{ x: 1, z: 0 }]] } }))
  );
  await page.reload();
  await page.waitForFunction(() => /nouveau parcours/.test(document.querySelector('#msg').textContent));
  assert.match(await page.textContent('#level'), /difficile/);
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('gg:save:golf')).data.v), 3);

  // 11. No WebGL: a plain message.
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...args) {
      return type.includes('webgl') ? null : original.call(this, type, ...args);
    };
  });
  await page.reload();
  await page.getByRole('heading', { name: 'Le terrain ne peut pas s’afficher' }).waitFor();
  assert.deepEqual(errors, []);
  console.log('ALL PASSED');
} finally {
  await browser.close();
}
