// Play the pétanque through the page controls, with local module requests served from disk.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { OUT, launch } from './harness.mjs';

const browser = await launch();
let failed = false;
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
    [1024, 768, 1],
    [1280, 800, 1.2]
  ];
  const setSize = async (width, height, zoom) => {
    await page.setViewportSize({ width, height });
    await page.evaluate((z) => localStorage.setItem('gg:size', JSON.stringify(z)), zoom);
    await page.reload();
    await page.locator('#mene').waitFor();
  };
  const saved = () =>
    page.evaluate(async () => {
      await GG.flush();
      return GG.load('petanque');
    });
  const ready = () => page.waitForFunction(() => !document.querySelector('#shoot').disabled, null, { timeout: 60000 });
  const msg = () => page.textContent('#msg');

  // The first visit starts a game at Facile at once, with the coach on « Lancer le cochonnet ».
  await page.goto('http://localhost/petanque/');
  await page.locator('#shoot.coach').waitFor();
  assert.equal(await page.evaluate(() => Kit.isOpen()), false);
  assert.match(await page.textContent('#level'), /facile/);
  assert.match(await msg(), /cliquez sur « Lancer le cochonnet »\.$/);
  assert.equal(await page.textContent('#shoot'), 'Lancer le cochonnet');
  assert.match(await page.getAttribute('#undoBtn', 'data-why'), /pas encore de coup/);
  assert.equal(await page.textContent('#goalLine'), 'Partie en 7 points');
  // The cochonnet's length, half a metre per press, from 6 to 10 m.
  await page.click('#longer');
  assert.equal(await msg(), 'Le cochonnet ira à 8 m, puis cliquez sur « Lancer le cochonnet ».');
  assert.equal(await page.getAttribute('#shoot', 'data-nudge'), '');
  assert.equal(await page.getAttribute('#hintBtn', 'data-auto'), 'no');
  for (let i = 0; i < 5; i++) await page.click('#longer');
  assert.match(await msg(), /^Le cochonnet se lance à 10 m au plus\./);
  assert.equal(await page.textContent('#lenLabel'), '10 m');
  // A click on the terrain says where the throw is set.
  await page.click('#stage canvas');
  assert.match(await msg(), /^Réglez votre lancer avec les boutons à droite, puis cliquez sur « Lancer le cochonnet »\.$/);
  // The rules guide fits at every size, page after page.
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
    await page.keyboard.press('Escape');
  }
  await setSize(1366, 680, 1);

  // He throws the cochonnet, then his first boule.
  await page.click('#shoot');
  await ready();
  assert.match(await msg(), /^Votre cochonnet est à [0-9,]+ m\. Choisissez votre lancer, puis cliquez sur « Lancer la boule »\.$/);
  assert.equal((await saved()).actions.length, 1);
  // Facile has no tir.
  assert.equal(await page.locator('#styles [data-style="tir"]').isVisible(), false);
  await page.click('#styles [data-style="plombee"]');
  assert.match(await msg(), /^Plombée : la boule monte haut et tombe près du cochonnet, puis cliquez sur « Lancer la boule »\.$/);
  assert.equal(await page.getAttribute('#styles [data-style="plombee"]', 'aria-pressed'), 'true');
  await page.click('#shorter');
  assert.equal(await page.textContent('#lenLabel'), '10 cm plus court');
  await page.click('#right');
  assert.equal(await page.textContent('#dirLabel'), '5 cm à droite');
  assert.match(await msg(), /^Vous visez 5 cm à droite, puis cliquez sur « Lancer la boule »\.$/);
  await page.click('#shoot');
  await ready();
  const one = await saved();
  assert.ok(one.actions.length >= 2);
  assert.equal(one.actions[1].style, 'plombee');
  assert.equal(one.actions[1].who, 'you');
  // Every throw starts again from a demi-portée straight at the cochonnet.
  if (await page.evaluate(() => document.querySelector('#shoot').textContent === 'Lancer la boule')) {
    assert.equal(await page.getAttribute('#styles [data-style="demi"]', 'aria-pressed'), 'true');
    assert.equal(await page.textContent('#lenLabel'), 'Au cochonnet');
    assert.equal(await page.textContent('#dirLabel'), 'Droit');
  }
  // Undo takes back his boule and Marius's answers; the same throw lands in the same place.
  const where = async () => (await page.evaluate(async () => {
    const E = await import('/petanque/engine.js');
    return E.situation(GG.load('petanque')).mene.boules.find((b) => b.id === 1);
  }));
  const first = await where();
  await page.click('#undoBtn');
  await page.waitForFunction(() => GG.load('petanque').actions.length === 1);
  assert.match(await msg(), /^Votre dernier lancer est annulé\./);
  await page.click('#styles [data-style="plombee"]');
  await page.click('#shorter');
  await page.click('#right');
  await page.click('#shoot');
  await ready();
  assert.deepEqual(await where(), first);
  // A reload keeps the game.
  const before = (await saved()).actions.length;
  await page.reload();
  await page.locator('#mene').waitFor();
  await ready();
  assert.ok((await saved()).actions.length >= before);

  // The hint sets a throw and ends with the button to press.
  await page.evaluate(async () => {
    const E = await import('/petanque/engine.js');
    const g = E.fresh('moyen', 3, 42);
    for (let guard = 0; guard < 40; guard++) {
      const t = E.turn(g);
      if (t.who === 'you' && t.kind === 'boule' && E.situation(g).mene.boules.filter((b) => b.owner === 'cpu').length >= 2) break;
      E.play(g, t.who === 'cpu' ? E.cpuChoice(g) : t.kind === 'cochonnet' ? { aim: { x: 0, z: 8 } } : { style: 'demi', aim: { x: 0.4, z: 9 } });
      g.ack = E.situation(g).menes.length;
    }
    await GG.save('petanque', g, { summary: '' });
  });
  await page.reload();
  await ready();
  await page.click('#hintBtn');
  assert.match(await msg(), /\. Cliquez sur « Lancer la boule »\.$/);
  assert.equal(await page.getAttribute('#hintBtn', 'data-auto'), null);
  // Moyen offers the tir, aimed at one of Marius's boules.
  await page.click('#styles [data-style="tir"]');
  assert.equal(await page.locator('#targetRow').isVisible(), true);
  assert.equal(await page.locator('#lenRow').isVisible(), false);
  assert.match(await page.textContent('#targetLabel'), /^À [0-9,]+ c?m$/);
  // Every screen fits: the longest message, the buttons, the panel.
  for (const [width, height, zoom] of sizes) {
    await setSize(width, height, zoom);
    await ready();
    for (const style of ['demi', 'tir']) {
      await page.click(`#styles [data-style="${style}"]`);
      await page.evaluate(() =>
        Kit.say('On mesure : votre boule est à 12 cm, celle de Marius à 15 cm. Marius a le point. Encore 2 boules : cliquez sur « Lancer la boule ».')
      );
      const problems = await page.evaluate(() => {
        const issue = [],
          r = (e) => e.getBoundingClientRect();
        const msg = document.querySelector('#msg');
        if (msg.scrollHeight > msg.clientHeight + 1 || msg.scrollWidth > msg.clientWidth + 1) issue.push(['#msg', 'cut']);
        const table = r(document.getElementById('table')),
          panel = r(document.getElementById('console'));
        for (const e of document.querySelectorAll('#bar button,#card,.player,#stage,#console,#console button')) {
          const b = r(e);
          if (!b.width) continue;
          if (b.x < -1 || b.right > innerWidth + 1 || b.bottom > innerHeight + 1) issue.push([e.id || e.textContent.trim(), 'bounds']);
          if (e.closest('#console') && e.tagName === 'BUTTON' && b.bottom > panel.bottom + 1) issue.push([e.id || e.textContent.trim(), 'hidden']);
          if (e.tagName === 'BUTTON' && b.height < 44 * Zoom.z() - 1) issue.push([e.id || e.textContent.trim(), 'height']);
          if (e.tagName === 'BUTTON' && e.scrollWidth > e.clientWidth + 1) issue.push([e.id || e.textContent.trim(), 'text cut']);
        }
        if (panel.bottom > table.bottom + 1) issue.push(['console', 'below the table']);
        for (const e of document.querySelectorAll('.meter span')) if (e.offsetParent && e.scrollWidth > e.clientWidth + 1) issue.push([e.textContent, 'meter cut']);
        // Text is 20 px or more, 13 px or more on a phone.
        for (const e of document.querySelectorAll('#console *, #card *, #sheet *'))
          if (!e.childElementCount && e.textContent.trim() && r(e).width && parseFloat(getComputedStyle(e).fontSize) * Zoom.z() < (innerWidth < 700 ? 13 : 20) - 0.5)
            issue.push([e.textContent.trim(), 'small text']);
        const buttons = [...document.querySelectorAll('#console button')].filter((b) => r(b).width);
        for (const [i, a] of buttons.entries())
          for (const b of buttons.slice(i + 1)) {
            const A = r(a),
              B = r(b);
            if (Math.min(A.right, B.right) - Math.max(A.left, B.left) > 1 && Math.min(A.bottom, B.bottom) - Math.max(A.top, B.top) > 1)
              issue.push([a.textContent.trim(), b.textContent.trim(), 'overlap']);
          }
        if (r(document.getElementById('stage')).height < 180) issue.push('terrain too small');
        return issue;
      });
      assert.deepEqual(problems, [], 'screen ' + [width, height, zoom, style] + ' ' + JSON.stringify(problems));
      if (process.env.SHOTS && zoom === 1) await page.screenshot({ path: join(OUT, ['petanque', width, height, style].join('-') + '.png') });
    }
  }
  await setSize(1366, 680, 1);

  // The end of a mène: the sheet on the terrain and « Mène suivante », also after a reload.
  await page.evaluate(async () => {
    const E = await import('/petanque/engine.js');
    const g = E.fresh('facile', 1, 9);
    while (!E.situation(g).menes.length) {
      const t = E.turn(g);
      E.play(g, t.who === 'cpu' ? E.cpuChoice(g) : t.kind === 'cochonnet' ? { aim: { x: 0, z: 7 } } : E.choiceFor(g, 'you', 'fort'));
    }
    await GG.save('petanque', g, { summary: '' });
  });
  await page.reload();
  await page.locator('#sheet:not([hidden])').waitFor();
  assert.equal(await page.textContent('#shoot'), 'Mène suivante');
  assert.match(await msg(), /^Fin de la mène : .*\. Cliquez sur « Mène suivante »\.$/);
  assert.equal(await page.getAttribute('#shoot', 'data-nudge'), '');
  assert.match(await page.textContent('#sheetText'), /^Vous \d+ · Marius \d+$/);
  for (const [width, height, zoom] of sizes) {
    await setSize(width, height, zoom);
    const fits = await page.evaluate(() => {
      const s = document.getElementById('sheet').getBoundingClientRect(),
        t = document.getElementById('stage').getBoundingClientRect();
      return s.left >= t.left - 1 && s.right <= t.right + 1 && s.bottom <= t.bottom + 1 && s.top >= t.top - 1;
    });
    assert.ok(fits, 'sheet ' + [width, height, zoom]);
  }
  await setSize(1366, 680, 1);
  await page.click('#shoot');
  await page.waitForFunction(() => document.getElementById('sheet').hidden);
  assert.equal((await saved()).ack, 1);
  assert.equal(await page.textContent('#mene'), 'Mène 2');

  // The last throw of a game that he wins: the result opens, and the win is counted once.
  await page.evaluate(async () => {
    const E = await import('/petanque/engine.js');
    for (let seed = 1; seed < 400; seed++) {
      const g = E.fresh('facile', 2, seed);
      for (let guard = 0; guard < 300 && E.turn(g); guard++) {
        const t = E.turn(g),
          s = E.situation(g),
          m = s.mene;
        if (t.who === 'you' && t.kind === 'boule' && m.left.you === 1 && !m.left.cpu) {
          const p = E.point(m);
          if (p.holder === 'you' && s.score.you + p.count >= 7) {
            g.ack = s.menes.length;
            await GG.save('petanque', g, { summary: '' });
            return seed;
          }
        }
        E.play(g, t.who === 'cpu' ? E.cpuChoice(g) : t.kind === 'cochonnet' ? { aim: { x: 0, z: 7 } } : E.choiceFor(g, 'you', 'fort'));
        g.ack = E.situation(g).menes.length;
      }
    }
    throw new Error('no game found');
  });
  await page.reload();
  await ready();
  // A roulette far to the side keeps his point.
  await page.click('#styles [data-style="roulette"]');
  for (let i = 0; i < 20; i++) await page.click('#left');
  for (let i = 0; i < 20; i++) await page.click('#shorter');
  await page.click('#shoot');
  await page.waitForSelector('#over.on');
  assert.match(await page.textContent('#overTitle'), /gagné/);
  assert.match(await page.textContent('#overText'), /Vous : \d+ points/);
  assert.equal((await saved()).wins, 3);
  for (const [width, height, zoom] of sizes) {
    await setSize(width, height, zoom);
    await page.waitForSelector('#over.on #overBtns .primary');
    assert.ok(
      await page.evaluate(() => {
        const box = document.querySelector('#box').getBoundingClientRect();
        return box.top >= 0 && box.bottom <= innerHeight + 1 && box.left >= 0 && box.right <= innerWidth + 1;
      }),
      'end sheet ' + [width, height, zoom]
    );
  }
  await setSize(1366, 680, 1);
  // A broken save starts a new game and keeps the wins.
  await page.evaluate(async () => {
    await GG.save('petanque', { v: 1, level: 'fort', wins: 4, seed: 44, actions: [null] }, { summary: '' });
  });
  await page.reload();
  await page.waitForFunction(() => document.querySelector('#msg').textContent.includes('nouvelle partie'));
  assert.equal((await saved()).wins, 4);
  assert.equal((await saved()).actions.length, 0);
  // A newer save in another window blocks this window's start and its statistics.
  const starts = stats.filter((k) => k === 'start').length;
  await page.evaluate(() => {
    const record = JSON.parse(localStorage.getItem('gg:save:petanque'));
    record.updatedAt++;
    localStorage.setItem('gg:save:petanque', JSON.stringify(record));
  });
  await page.click('#newBtn');
  await page.getByRole('button', { name: 'Moyen', exact: true }).click();
  await page.getByRole('heading', { name: 'Le jeu a changé ailleurs' }).waitFor();
  assert.equal(stats.filter((k) => k === 'start').length, starts);
  assert.deepEqual(errors, []);
  assert.equal(stats.filter((k) => k === 'won').length, 1);
  console.log('PASS petanque');
} catch (e) {
  failed = true;
  console.error(e);
  console.log('FAIL petanque');
} finally {
  await browser.close();
  if (failed) process.exitCode = 1;
}
