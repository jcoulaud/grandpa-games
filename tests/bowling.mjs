// Play bowling through the page controls, with local module requests served from disk.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import * as Bowling from '../public/bowling/engine.js';
import { OUT, launch } from './harness.mjs';

const browser = await launch();
try {
  const page = await browser.newPage({ viewport: { width: 1366, height: 680 }, reducedMotion: 'reduce' });
  const errors = [];
  const stats = [];
  page.on('pageerror', (err) => {
    console.error(err);
    errors.push(err.message);
  });
  // Serve ES modules with their MIME types at a local origin, without an external service.
  await page.route('http://localhost/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.startsWith('/api/')) {
      if (path === '/api/stats') stats.push(route.request().postDataJSON().kind);
      return route.fulfill({ json: { ok: true } });
    }
    const file = path.endsWith('/') ? path + 'index.html' : path;
    const mime = {
      js: 'text/javascript',
      css: 'text/css',
      html: 'text/html',
      svg: 'image/svg+xml',
      woff2: 'font/woff2',
      webp: 'image/webp'
    };
    try {
      await route.fulfill({
        contentType: mime[file.split('.').pop()],
        body: await readFile(new URL('../public' + file, import.meta.url))
      });
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
    [1920, 1000, 1.75],
    // Sizes that once broke the panel or the score sheet.
    [1280, 800, 1.2],
    [1150, 680, 1],
    [1024, 768, 1]
  ];
  const setSize = async (width, height, zoom) => {
    await page.setViewportSize({ width, height });
    await page.evaluate((z) => localStorage.setItem('gg:size', JSON.stringify(z)), zoom);
    await page.reload();
  };
  await page.goto('http://localhost/bowling/');
  await page.locator('#help.on').waitFor();
  for (const [width, height, zoom] of sizes) {
    await setSize(width, height, zoom);
    await page.locator('#help.on').waitFor();
    for (let i = 0; i < 3; i++) {
      const fits = await page.evaluate(() => {
        const b = document.querySelector('#helpBox').getBoundingClientRect(),
          t = document.querySelector('#helpText');
        return (
          b.left >= -1 &&
          b.right <= innerWidth + 1 &&
          b.bottom <= innerHeight + 1 &&
          (innerHeight < 620 || t.scrollHeight <= t.clientHeight + 1)
        );
      });
      assert.ok(fits, 'rules ' + [width, height, zoom, i]);
      if (i < 2) await page.click('#helpNext');
    }
  }
  await setSize(1366, 680, 1);
  await page.click('#helpClose');
  await page.getByRole('button', { name: 'Facile', exact: true }).click();
  const saved = () =>
    page.evaluate(async () => {
      await GG.flush();
      return GG.load('bowling');
    });
  async function roll() {
    const n = (await saved()).throws.length;
    await page.click('#shoot');
    await page.waitForFunction((n) => GG.load('bowling').throws.length === n + 1, n);
    return (await saved()).throws.at(-1);
  }
  async function timedRoll() {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.evaluate(async () => {
      const T = await import('/lib/three/three.module.min.js');
      const before = T.Mesh.prototype.onBeforeRender;
      window.footGaps = [];
      T.Mesh.prototype.onBeforeRender = function (...args) {
        before.apply(this, args);
        if (this.geometry.type !== 'LatheGeometry' || this.parent.type !== 'Group' ||
          !['impact','hold'].includes(canvas.dataset.phase) || this.parent.quaternion.w !== 1) return;
        const vertices = this.geometry.attributes.position, v = new T.Vector3();
        let min = Infinity;
        for (let i = 0; i < vertices.count; i++) {
          min = Math.min(min, v.fromBufferAttribute(vertices, i).applyMatrix4(this.matrixWorld).y);
        }
        window.footGaps.push(min);
      };
      window.restorePinRender = () => { T.Mesh.prototype.onBeforeRender = before; };
      const canvas = document.querySelector('canvas');
      window.bowlingPhases = {};
      const observer = new MutationObserver(() => {
        const key = canvas.dataset.phase;
        window.bowlingPhases[key] ??= performance.now();
        if (key === 'aim') observer.disconnect();
      });
      observer.observe(canvas, { attributes: true, attributeFilter: ['data-phase'] });
    });
    const thrown = await roll();
    await page.waitForFunction(() => document.querySelector('#stage canvas').dataset.phase !== 'aim');
    await page.waitForFunction(() => !document.querySelector('#shoot').disabled, null, { timeout: 20000 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const phases = await page.evaluate(() => window.bowlingPhases);
    const gaps = await page.evaluate(() => {
      window.restorePinRender();
      return window.footGaps;
    });
    assert.ok(gaps.length && gaps.every(gap => Math.abs(gap) <= 0.001), 'standing pin base touches deck');
    const clear = phases.pickup ?? phases.sweep;
    // Allow a few missed paints with software WebGL on a busy runner.
    for (const [actual, expected] of [
      [clear - phases.hold, 1200],
      [phases.return - clear, 2500],
      [phases.aim - phases.return, 800]
    ]) {
      assert.ok(Math.abs(actual - expected) < 420, JSON.stringify(phases));
    }
    assert.ok(phases.set > phases.sweep && phases.sweep >= clear);
    assert.equal(Boolean(phases.pickup), thrown.count !== 10);
    return thrown;
  }
  const aimMessage = await page.textContent('#msg');
  await page.click('#deckInset');
  assert.equal(await page.textContent('#msg'), aimMessage);
  const crossShot = { aim: 23.3, speed: 6, curve: -2 };
  const browserPhysics = await page.evaluate(async (shot) => {
    const engine = await import('/bowling/engine.js');
    const result = engine.simulate(engine.rack(2654435761), shot, 'moyen', true);
    return [result.standing, result.frames[24], result.frames.at(-1), result.sleeping];
  }, crossShot);
  const native = Bowling.simulate(Bowling.rack(2654435761), crossShot, 'moyen', true);
  assert.deepEqual(browserPhysics, [native.standing, native.frames[24], native.frames.at(-1), native.sleeping]);
  await page.evaluate(async () => {
    const E = await import('/bowling/engine.js');
    await GG.save('bowling', E.fresh('facile', 0, 42), { summary: '' });
  });
  await page.reload();
  const first = await timedRoll();
  assert.deepEqual([first.aim, first.speed, first.curve], [20, 6, 0]);
  await page.reload();
  await page.locator('#roll').waitFor();
  assert.equal(await page.textContent('#roll'), '2e lancer');
  assert.equal(await page.textContent('#score'), String(first.count));
  assert.equal(await page.textContent('#total'), String(first.count));
  assert.deepEqual((await saved()).throws[0], first);
  await page.click('#undoBtn');
  await saved();
  assert.equal((await saved()).throws.length, 0);
  for (let i = 0; i < 15; i++) await page.click('#right');
  await page.click('#startLeft');
  await page.click('#startLeft');
  assert.equal(await page.textContent('#startLabel'), '2 à gauche');
  await page.click('#startRight');
  await page.click('#left');
  await page.click('#right');
  await page.click('#right');
  await page.click('#faster');
  await page.click('#faster');
  await page.click('#slower');
  await page.getByRole('button', { name: 'Courber plus vers la gauche' }).click();
  const chosen = await roll();
  assert.ok(chosen.aim > 35);
  assert.equal(chosen.speed, 7);
  assert.equal(chosen.curve, -1);
  // The start spot is saved with the throw.
  assert.equal(chosen.start, 19);
  // Every throw starts again from the middle, straight, at force 6, also after a reload.
  const reset = async () => {
    assert.equal(await page.textContent('#startLabel'), 'Au milieu');
    assert.equal(await page.textContent('#aimLabel'), 'Au milieu');
    assert.equal(await page.textContent('#curveLabel'), 'Tout droit');
    assert.equal(await page.textContent('#meter span'), '6 sur 10');
  };
  await reset();
  await page.reload();
  await page.waitForSelector('#pins .pin');
  await reset();
  await page.click('#undoBtn');
  await saved();
  const ball = () =>
    page.evaluate(() => {
      const c = document.querySelector('canvas'),
        r = c.getBoundingClientRect(),
        p = c.ballAt();
      return { x: r.left + p.x * Zoom.z(), y: r.top + p.y * Zoom.z() };
    });
  // The lane takes no mouse input: a click or a drag on it changes nothing and throws nothing.
  const lane0 = await page.locator('#stage canvas').boundingBox();
  await page.mouse.click(lane0.x + lane0.width * 0.6, lane0.y + lane0.height * 0.4);
  await page.mouse.move(lane0.x + lane0.width / 2, lane0.y + lane0.height * 0.85);
  await page.mouse.down();
  await page.mouse.move(lane0.x + lane0.width / 2 - 25, lane0.y + lane0.height * 0.5, { steps: 5 });
  await page.mouse.up();
  assert.equal((await saved()).throws.length, 0);
  assert.equal(await page.textContent('#aimLabel'), 'Au milieu');
  await page.click('#hintBtn');
  assert.match(await page.textContent('#msg'), /poche/);
  const advised = await timedRoll();
  assert.ok(Number.isInteger(advised.curve));
  await page.click('#undoBtn');
  await saved();
  for (const [width, height, zoom] of sizes) {
    await setSize(width, height, zoom);
    await page.waitForFunction(() => document.querySelector('#pins .pin'));
    await page.evaluate(() =>
      Kit.say('Vous avez fait tomber 1 quille. Il reste les quilles 2, 3, 4, 5, 6, 7, 8, 9 et 10.')
    );
    const problems = await page.evaluate(() => {
      const issue = [];
      const r = (e) => e.getBoundingClientRect();
      for (const e of document.querySelectorAll(
        '#bar button,#card,#pins .pin,#strip,#stage,#console button,#console .controls'
      )) {
        const b = r(e);
        if (b.width && (b.x < -1 || b.right > innerWidth + 1 || b.bottom > innerHeight + 1))
          issue.push([e.id || e.textContent, 'bounds']);
        if (e.tagName === 'BUTTON' && b.width && b.height < 44 * Zoom.z() - 1) issue.push([e.textContent, 'height']);
      }
      const buttons = [...document.querySelectorAll('#console button')];
      for (const [i, e] of buttons.entries())
        for (const f of buttons.slice(i + 1)) {
          const a = r(e),
            b = r(f);
          if (
            Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 &&
            Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1
          )
            issue.push([e.textContent, f.textContent, 'overlap']);
        }
      if (r(document.querySelector('#stage')).height < 110) issue.push('lane too small');
      return issue;
    });
    assert.deepEqual(problems, [], 'screen ' + [width, height, zoom] + ' ' + JSON.stringify(problems));
  }
  // A game nine frames deep, with three-digit totals: at every size the totals fit their boxes and
  // « Lancer la boule » stays above the bottom bar.
  await page.evaluate(async () => {
    const E = await import('/bowling/engine.js');
    const g = E.fresh('facile', 0, 7);
    while (E.sheet(g).next < 9) E.play(g, E.hint(g));
    await GG.save('bowling', g, { summary: '' });
  });
  for (const [width, height, zoom] of sizes) {
    await setSize(width, height, zoom);
    await page.waitForSelector('#pins .pin');
    const fit = await page.evaluate(() => {
      const crowded = [...document.querySelectorAll('#strip .frame b, #strip .boxes i')].some(
        (e) => e.offsetParent && e.scrollWidth > e.clientWidth + 1
      );
      const shoot = document.getElementById('shoot').getBoundingClientRect(),
        rail = document.getElementById('rail').getBoundingClientRect(),
        total = document.getElementById('score').textContent;
      return { crowded, below: rail.height > 0 && shoot.bottom > rail.top + 1, total };
    });
    assert.ok(Number(fit.total) >= 100 && !fit.crowded && !fit.below, JSON.stringify({ width, height, zoom, ...fit }));
  }
  await setSize(1366, 680, 1);
  // Compare full and single-pin renders. Count bright pin pixels against the deck
  // to measure the visible rack without relying on camera constants.
  await setSize(1366, 680, 1);
  const lane = page.locator('#stage canvas');
  async function rackImage(singlePin) {
    await page.evaluate(async (singlePin) => {
      const E = await import('/bowling/engine.js');
      const g = E.fresh('facile', 0, 42);
      if (singlePin) g.throws.push({ ...E.defaults(), count: 9, standing: E.rack(42).slice(0, 1) });
      await GG.save('bowling', g, { summary: '' });
    }, singlePin);
    await page.reload();
    await page.waitForSelector('#pins .pin');
    return (await lane.screenshot()).toString('base64');
  }
  const frames = [await rackImage(false), await rackImage(true)];
  const rackWidth = await page.evaluate(async (frames) => {
    const [full, leave] = await Promise.all(
      frames.map(async (frame) => {
        const img = new Image();
        img.src = 'data:image/png;base64,' + frame;
        await img.decode();
        const c = document.createElement('canvas');
        c.width = img.width;
        c.height = img.height;
        const ctx = c.getContext('2d');
        ctx.drawImage(img, 0, 0);
        return ctx.getImageData(0, 0, c.width, c.height);
      })
    );
    let left = full.width,
      right = 0;
    for (let y = 0; y < full.height / 2; y++) {
      for (let x = Math.floor(full.width * 0.28); x < full.width * 0.72; x++) {
        const i = 4 * (y * full.width + x);
        if (full.data[i] > 155 && full.data[i] - leave.data[i] > 45) {
          left = Math.min(left, x);
          right = Math.max(right, x);
        }
      }
    }
    return right - left + 1;
  }, frames);
  console.log('Visible rack width at 1366x680:', rackWidth);
  // The aim view uses a real lens, so the far rack is small; the « Les quilles » inset shows it large.
  assert.ok(rackWidth >= 16, 'rack ' + rackWidth);
  for (const [width, height, zoom] of sizes) {
    await setSize(width, height, zoom);
    for (const level of ['facile', 'moyen', 'fort']) {
      await page.evaluate(async (level) => {
        const E = await import('/bowling/engine.js');
        await GG.save('bowling', E.fresh(level, 0, 42), { summary: '' });
      }, level);
      await page.reload();
      await page.waitForSelector('#pins .pin');
      const capture = async (state) => {
        await page.evaluate(
          () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
        );
        if (process.env.SHOTS && zoom === 1)
          await page.screenshot({ path: join(OUT, [width, height, level, state].join('-') + '.png') });
      };
      async function checkLayout() {
        const boxes = await page.evaluate(() => {
          const rect = (id) => document.getElementById(id).getBoundingClientRect().toJSON();
          return Object.fromEntries(['table', 'card', 'strip', 'stage', 'console'].map((id) => [id, rect(id)]));
        });
        const { table, card, strip, stage } = boxes;
        for (const [name, box] of Object.entries(boxes)) {
          assert.ok(box.bottom <= table.bottom + 1, [name, width, height, zoom, box.bottom, table.bottom].join(' '));
        }
        const panel = boxes.console;
        if (width < 700 && height / zoom > 660) {
          // A tall phone: the sheet beside the lane, under the card.
          assert.ok(strip.left >= stage.right - 1 && strip.bottom <= panel.top + 1 && card.bottom <= strip.top + 1);
        } else if (width >= 700) {
          // A computer: the sheet in the right column above the panel, or above the lane when the panel
          // needs the column, as the page measured it.
          assert.ok(
            (strip.left >= stage.right - 1 && strip.bottom <= panel.top + 1) ||
              (strip.bottom <= stage.top + 1 && Math.abs(strip.left - stage.left) < 1),
            ['sheet', width, height, zoom].join(' ')
          );
          assert.ok(panel.right <= table.right + 1, ['panel', width, height, zoom].join(' '));
        }
      }
      assert.equal(await page.textContent('#curveLabel'), 'Tout droit');
      await checkLayout();
      await capture('straight');
      for (let i = 0; i < 3; i++) await page.click('#curveLeft');
      assert.equal(await page.textContent('#curveLabel'), 'Fort vers la gauche');
      assert.equal(await page.locator('#curveSegments .on').count(), 3);
      await checkLayout();
      await capture('left');
      for (let i = 0; i < 6; i++) await page.click('#curveRight');
      assert.equal(await page.textContent('#curveLabel'), 'Fort vers la droite');
      await checkLayout();
      await capture('right');
      const stage = await page.locator('canvas').boundingBox(),
        at = await ball();
      const release = Bowling.trajectory({ start: 20, aim: 20, speed: 6, curve: 3 }, level)[0].x; // the curve never moves the ball: it stays at its start
      assert.ok(release ? (at.x - stage.x - stage.width / 2) * release > 0 : Math.abs(at.x - stage.x - stage.width / 2) < 1);
      const inset = await page.locator('#deckInset').boundingBox();
      assert.equal(Boolean(inset), stage.width / zoom >= 420);
      if (level === 'facile' && zoom === 1)
        console.log(width, height, 'stage', stage.width, stage.height, 'inset', inset?.width || 0, inset?.height || 0);
      if (inset)
        assert.ok(
          Math.abs(inset.width / zoom - Math.min(320, Math.max(170, Math.round((stage.width / zoom) * 0.34)))) < 1
        );
      const controls = await page.locator('#console button:visible').evaluateAll((keys) =>
        keys.map((key) => {
          const r = key.getBoundingClientRect();
          return [key.id || key.textContent, r.bottom, r.height, key.scrollWidth - key.clientWidth];
        })
      );
      for (const [key, bottom, h, overflow] of controls) {
        assert.ok(
          bottom <= height + 1 && h >= (key === 'shoot' ? 48 : 46) * zoom - 1 && overflow <= 1,
          JSON.stringify({ width, height, level, zoom, key, bottom, h, overflow })
        );
      }
      await capture('panel');
      if (process.env.SHOTS && zoom === 1) await page.emulateMedia({ reducedMotion: 'no-preference' });
      await page.click('#shoot');
      if (process.env.SHOTS && zoom === 1) {
        await page.waitForSelector('#shoot:disabled');
        await page.waitForTimeout(1600);
        await capture('roll');
        await page.emulateMedia({ reducedMotion: 'reduce' });
      }
      await page.waitForFunction(() => GG.load('bowling')?.throws.length === 1);
      const result = (await saved()).throws[0];
      assert.equal(result.speed, 6);
      assert.equal(result.curve, 3);
    }
  }
  await setSize(1366, 680, 1);
  // Start one throw before each possible ending. Use the real engine to build the save.
  for (const win of [false, true]) {
    await page.evaluate(async (win) => {
      const E = await import('/bowling/engine.js'),
        g = E.fresh('moyen', 2, 42);
      while (E.sheet(g).next < 9 || E.sheet(g).roll < 1) {
        E.play(g, win ? E.hint(g) : { ...E.defaults(), aim: 45 });
      }
      await GG.save('bowling', g, { summary: '' });
    }, win);
    await page.reload();
    for (let i = 0; i < 2; i++) {
      if (win) await page.click('#hintBtn');
      await roll();
      if (await page.locator('#over.on').count()) break;
    }
    await page.waitForSelector('#over.on');
    assert.match(await page.textContent('#overTitle'), win ? /gagné/ : /terminée/);
    assert.match(await page.textContent('#overText'), /Pour gagner : 160 points/);
    assert.equal((await saved()).wins, win ? 3 : 2);
    if (win)
      for (const [width, height, zoom] of sizes) {
        await setSize(width, height, zoom);
        await page.waitForSelector('#over.on #overBtns .primary');
        assert.ok(
          await page.evaluate(() => {
            const box = document.querySelector('#box').getBoundingClientRect();
            // The win sheet is the shared one, centred and large, as in the other games.
            return (
              Math.abs(box.left + box.right - innerWidth) < 4 &&
              box.top >= 0 &&
              box.bottom <= innerHeight + 1 &&
              box.left >= 0 &&
              box.right <= innerWidth + 1
            );
          }),
          'end sheet ' + [width, height, zoom]
        );
      }
  }
  await page.evaluate(async () => {
    await GG.save('bowling', { v: 1, level: 'fort', wins: 4, seed: 44, throws: [null] }, { summary: '' });
  });
  await page.reload();
  await page.waitForFunction(() => document.querySelector('#msg').textContent.includes('nouvelle partie'));
  assert.equal((await saved()).wins, 4);
  assert.equal((await saved()).throws.length, 0);
  // A newer save in another window blocks this window's start and its statistics.
  const starts = stats.filter((k) => k === 'start').length;
  await page.evaluate(() => {
    const record = JSON.parse(localStorage.getItem('gg:save:bowling'));
    record.updatedAt++;
    localStorage.setItem('gg:save:bowling', JSON.stringify(record));
  });
  await page.click('#newBtn');
  await page.getByRole('button', { name: 'Moyen', exact: true }).click();
  await page.getByRole('heading', { name: 'Le jeu a changé ailleurs' }).waitFor();
  assert.equal(stats.filter((k) => k === 'start').length, starts);
  assert.deepEqual(errors, []);
  assert.equal(stats.filter((k) => k === 'won').length, 1);
  console.log('ALL PASSED');
} finally {
  await browser.close();
}
