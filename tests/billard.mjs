// Play the billard through the page: the rules guide, the layout at each window size, a shot with the hint,
// a click that aims, undo, the white in hand, René's turn and a won game.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { OUT, launch } from './harness.mjs';

const browser = await launch();
try {
  const page = await browser.newPage({ viewport: { width: 1366, height: 680 }, reducedMotion: 'reduce' });
  const errors = [],
    stats = [];
  page.on('pageerror', (err) => {
    console.error(err);
    errors.push(err.message);
  });
  // Serve ES modules with their MIME types at a local origin.
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
    [1920, 1000, 1.75],
    [1024, 768, 1]
  ];
  const setSize = async (width, height, zoom) => {
    await page.setViewportSize({ width, height });
    await page.evaluate((z) => localStorage.setItem('gg:zoom', JSON.stringify(z)), zoom);
    await page.reload();
  };
  const saved = () =>
    page.evaluate(async () => {
      await GG.flush();
      return GG.load('billard');
    });
  const frame = () => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));

  // ---------- The rules guide fits at every size ----------
  // The first visit starts a game at Facile at once, with the coach on « Tirer »: the cue already points at the rack.
  await page.goto('http://localhost/billard/');
  await page.locator('#shoot.coach').waitFor();
  assert.equal(await page.evaluate(() => Kit.isOpen()), false);
  assert.match(await page.textContent('#msg'), /^À vous de casser : .*cliquez sur « Tirer »\.$/);
  assert.match(await page.getAttribute('#undoBtn', 'data-why'), /pas encore de coup/);
  await page.waitForFunction(() => GG.load('billard')?.level === 'facile');
  for (const [width, height, zoom] of sizes) {
    await setSize(width, height, zoom);
    await page.click('#helpBtn');
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
  assert.deepEqual(stats.filter((s) => s === 'start').length, 1);

  // ---------- The layout at every size and level ----------
  for (const [width, height, zoom] of sizes) {
    await setSize(width, height, zoom);
    await page.waitForSelector('#you .tray');
    await frame();
    const boxes = await page.evaluate(() => {
      const rect = (el) => el.getBoundingClientRect().toJSON();
      return {
        table: rect(document.getElementById('table')),
        stage: rect(document.getElementById('stage')),
        parts: ['players', 'console'].map((id) => [id, rect(document.getElementById(id))]),
        buttons: [...document.querySelectorAll('#console button:not([hidden]), #bar button')].map((b) => [b.id, rect(b), b.scrollWidth - b.clientWidth]),
        small: [...document.querySelectorAll('#side *')]
          .filter((el) => !el.closest('.mb') && el.childNodes.length && [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()) && el.getClientRects().length)
          .map((el) => [el.className || el.id || el.tagName, parseFloat(getComputedStyle(el).fontSize) * (window.Zoom?.z?.() ?? 1)])
      };
    });
    const where = [width, height, zoom].join(' ');
    assert.ok(boxes.stage.height >= (width < 700 ? 180 : 300) * Math.min(1, zoom), 'stage ' + where + ' ' + boxes.stage.height);
    for (const [id, box] of boxes.parts) {
      assert.ok(box.right <= width + 1 && box.left >= -1, id + ' sides ' + where);
      assert.ok(box.bottom <= boxes.table.bottom + 1, id + ' bottom ' + where + ' ' + box.bottom + ' ' + boxes.table.bottom);
    }
    for (const [id, box, overflow] of boxes.buttons) {
      if (!box.width) continue;
      assert.ok(box.height >= 44 - 1 && overflow <= 1 && box.right <= width + 1, 'button ' + id + ' ' + where + ' ' + JSON.stringify(box));
    }
    for (const [name, size] of boxes.small) assert.ok(size >= (width < 700 ? 13 : 20) - 0.5, 'text ' + name + ' ' + size + ' ' + where);
    if (process.env.SHOTS) await page.screenshot({ path: join(OUT, ['billard', width, height, zoom].join('-') + '.png') });
  }
  await setSize(1366, 680, 1);

  // ---------- Aiming with a click on a ball ----------
  const ballAt = (id) =>
    page.evaluate((id) => {
      const c = document.querySelector('canvas'),
        r = c.getBoundingClientRect(),
        p = c.ballAt(id);
      return p && { x: r.left + p.x, y: r.top + p.y };
    }, id);
  const one = await ballAt(1);
  await page.mouse.click(one.x, one.y);
  assert.match(await page.getAttribute('#aimLabel', 'aria-label'), /^La \d+ |^La noire$|^La bande$/);
  assert.match(await page.textContent('#msg'), /^Vous visez la 1 jaune : cliquez sur « Tirer »\.$/);
  // His own aim: « Tirer » is the nudge, and the automatic hint waits.
  assert.equal(await page.getAttribute('#shoot', 'data-nudge'), '');
  assert.equal(await page.getAttribute('#hintBtn', 'data-auto'), 'no');
  // « Effet » says what it does, and what to click next.
  await page.click('#spinUp');
  assert.match(await page.textContent('#msg'), /^Effet coulé : .*Puis cliquez sur « Tirer »\.$/);
  await page.click('#spinDown');
  assert.match(await page.textContent('#msg'), /^Effet au centre/);

  // ---------- The break, then René, then his turn again ----------
  const before = (await saved()).shots;
  await page.click('#shoot');
  await page.waitForFunction((n) => GG.load('billard').shots > n, before);
  // René plays by himself, slowly, until the turn comes back or the game ends.
  await page.waitForFunction(() => {
    const g = GG.load('billard');
    return g.over || (g.turn === 'player' && !document.querySelector('#shoot').disabled);
  }, null, { timeout: 120000 });
  assert.equal(await page.textContent('#shoot'), 'Tirer');
  assert.ok((await page.textContent('#msg')).length > 10);

  // ---------- Undo puts the balls back ----------
  const g1 = await saved();
  if (!g1.over && g1.history.length) {
    const shotsBefore = g1.history.at(-1).shots ?? null;
    await page.click('#undoBtn');
    await page.waitForFunction((n) => GG.load('billard').history.length === n - 1, g1.history.length);
    assert.match(await page.textContent('#msg'), /annulé/);
    if (shotsBefore !== null) assert.equal((await saved()).shots, shotsBefore);
  }

  // ---------- René's turn: a click on the table or a grey button says to wait ----------
  await page.evaluate(async () => {
    const E = await import('/billard/engine.js');
    const g = E.fresh('moyen', 0, 5);
    g.broken = true;
    g.shots = 1;
    g.turn = 'cpu';
    await GG.save('billard', g, { summary: '' });
  });
  await page.reload();
  await page.waitForSelector('#you .tray');
  const lane = await page.locator('#stage canvas').boundingBox();
  await page.mouse.click(lane.x + lane.width / 2, lane.y + lane.height / 2);
  assert.equal(await page.textContent('#msg'), 'René joue, attendez votre tour.');
  assert.equal(await page.getAttribute('#shoot', 'data-why'), 'René joue, attendez votre tour.');

  // ---------- At Facile, a click on a ball lines it up with a pocket; René's ball warns ----------
  await page.evaluate(async () => {
    const E = await import('/billard/engine.js');
    const T = E.table,
      g = E.fresh('facile', 0, 9);
    const q = [1, 0, 0, 0];
    g.broken = true;
    g.shots = 4;
    g.groups = { player: 'pleines' };
    g.balls = [
      { id: 0, x: T.L - 0.55, y: T.W - 0.32, q },
      { id: 3, x: T.L - 0.25, y: T.W - 0.25, q },
      { id: 12, x: T.L * 0.3, y: T.W * 0.3, q },
      { id: 8, x: T.L * 0.3, y: T.W * 0.7, q }
    ];
    await GG.save('billard', g, { summary: '' });
  });
  await page.reload();
  await page.waitForSelector('#you .tray .mb');
  const twelve = await ballAt(12);
  await page.mouse.click(twelve.x, twelve.y);
  assert.equal(await page.textContent('#msg'), 'C’est une bille de René : la toucher d’abord est une faute. Cliquez sur une de vos billes.');
  const three = await ballAt(3);
  await page.mouse.click(three.x, three.y);
  assert.match(await page.textContent('#msg'), /^Vous visez la 3 rouge vers le trou du coin en bas à droite : cliquez sur « Tirer »\.$/);
  await page.click('#shoot');
  await page.waitForFunction(() => GG.load('billard').shots > 4);
  assert.ok(!(await saved()).balls.some((b) => b.id === 3), 'the aimed ball drops');
  await page.waitForFunction(() => /Rejouez : cliquez sur une bille pour viser, puis sur « Tirer »\./.test(document.querySelector('#msg').textContent));

  // ---------- The white in hand ----------
  await page.evaluate(async () => {
    const E = await import('/billard/engine.js');
    const g = E.fresh('moyen', 0, 7);
    g.broken = true;
    g.shots = 1;
    g.balls = g.balls.filter((b) => b.id !== 0);
    g.ballInHand = true;
    await GG.save('billard', g, { summary: '' });
  });
  await page.reload();
  await page.waitForSelector('#place:not([hidden])');
  const spot = await page.evaluate(() => {
    const c = document.querySelector('canvas'),
      r = c.getBoundingClientRect();
    return { x: r.left + r.width * 0.2, y: r.top + r.height * 0.75 };
  });
  await page.click('#place');
  assert.match(await page.textContent('#msg'), /Cliquez sur le tapis/);
  await page.mouse.click(spot.x, spot.y);
  assert.match(await page.textContent('#msg'), /La blanche est posée/);
  await page.click('#hintBtn');
  assert.ok((await page.textContent('#msg')).length > 10);
  await page.click('#shoot');
  await page.waitForFunction(() => !GG.load('billard').ballInHand || GG.load('billard').turn === 'cpu' || GG.load('billard').shots > 1);

  // ---------- A won game: only the black is left, in front of a pocket ----------
  await page.evaluate(async () => {
    const E = await import('/billard/engine.js');
    const T = E.table,
      g = E.fresh('facile', 2, 9);
    const pocket = T.pockets.find((p) => p.id === 'bd');
    g.broken = true;
    g.shots = 20;
    g.groups = { player: 'pleines' };
    const q = [1, 0, 0, 0];
    g.balls = [
      { id: 0, x: pocket.x - 0.5, y: pocket.y - 0.5, q },
      { id: 8, x: pocket.x - 0.25, y: pocket.y - 0.25, q },
      { id: 12, x: T.L * 0.3, y: T.W * 0.3, q }
    ];
    await GG.save('billard', g, { summary: '' });
  });
  await page.reload();
  await page.waitForSelector('#you .tray .mb');
  await page.click('#hintBtn');
  await page.click('#shoot');
  await page.locator('#over.on, #box:has-text("Vous avez gagné")').first().waitFor({ timeout: 20000 });
  const g2 = await saved();
  assert.equal(g2.over?.winner, 'player');
  // The game is over: « Nouvelle partie » is the nudge.
  assert.equal(await page.getAttribute('#newBtn', 'data-nudge'), '');
  assert.equal(g2.wins, 3);
  await page.waitForFunction(() => true);
  assert.ok(stats.includes('won'));

  // ---------- With the animations on: the break and René's reply play to the end ----------
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.evaluate(async () => {
    const E = await import('/billard/engine.js');
    await GG.save('billard', E.fresh('moyen', 0, 11), { summary: '' });
  });
  await page.reload();
  await page.waitForSelector('#you .tray');
  await page.click('#shoot');
  await page.waitForFunction(() => !/La blanche part/.test(document.querySelector('#msg').textContent), null, { timeout: 25000 });
  if ((await saved()).turn === 'cpu')
    await page.waitForFunction(() => GG.load('billard').turn === 'player' || GG.load('billard').over, null, { timeout: 120000 });
  await page.emulateMedia({ reducedMotion: 'reduce' });

  assert.deepEqual(errors, []);
  console.log('PASS billard');
} finally {
  await browser.close();
}
