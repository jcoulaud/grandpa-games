// The library, its offline copy, the saves in the browser, the statistics and the admin page,
// against a local `wrangler dev` with a fresh database in a temporary folder.
import { spawn, execFileSync } from 'node:child_process';
import { writeFileSync, existsSync, readFileSync, rmSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { launch, OUT } from './harness.mjs';

// A random port, so two checkouts can run the tests at once.
const PORT = Number(process.env.PORT) || 8800 + Math.floor(Math.random() * 200), BASE = `http://localhost:${PORT}/`;

const data = mkdtempSync(join(tmpdir(), 'gg-d1-'));
const wrangler = (...args) => execFileSync('bunx', ['wrangler', ...args, '--persist-to', data], { stdio: 'pipe' }).toString();
const sql = q => JSON.parse(wrangler('d1', 'execute', 'grandpa-games', '--local', '--json', '--command', q))[0].results;

let failed = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : ' ' + extra}`); if (!ok) failed++; };

// The offline copy is versioned by public/version.js, which a deploy writes. Use test versions here.
const versionFile = new URL('../public/version.js', import.meta.url);
const oldVersion = existsSync(versionFile) ? readFileSync(versionFile, 'utf8') : null;
writeFileSync(versionFile, "self.VERSION = 'test-1';\n");

wrangler('d1', 'migrations', 'apply', 'grandpa-games', '--local');
const ADMIN = 'test-admin-password';
const dev = spawn('bunx', ['wrangler', 'dev', '--port', String(PORT), '--persist-to', data, '--var', `ADMIN_TOKEN:${ADMIN}`], { stdio: 'pipe' });
for (let i = 0; i < 60; i++) {
  try { if ((await fetch(BASE)).ok) break; } catch (e) {}
  await new Promise(r => setTimeout(r, 500));
}

const browser = await launch();
try {
  // 1. A new PC: the library shows the available games. It sends only anonymous statistics.
  const pc = await browser.newContext({ viewport: { width: 1366, height: 680 } });
  const page = await pc.newPage();
  const calls = [];
  page.on('request', r => { if (r.url().includes('/api/')) calls.push(r.method() + ' ' + r.url() + ' ' + (r.postData() || '')); });
  // A PC from the time of the online backup: its leftovers go, its games stay.
  await page.goto(BASE + 'manifest.webmanifest');
  await page.evaluate(() => {
    localStorage.setItem('gg:cloud:old', '{"data":1}');
    localStorage.setItem('gg:approved', 'true');
    localStorage.setItem('gg:save:old', '{"updatedAt":1,"data":{"n":1}}');
    localStorage.setItem('gg:device', '"ABCDEFGHJKLMNPQRSTUVWXYZ23"');
  });
  await page.goto(BASE);
  await page.waitForSelector('a.tile[data-id="solitaire"]');
  check('tile for solitaire', await page.locator('a.tile[data-id="solitaire"]').count() === 1);
  check('tile for freecell', await page.locator('a.tile[data-id="freecell"]').count() === 1);
  check('tile for dames', await page.locator('a.tile[data-id="dames"]').count() === 1);
  check('tile for dame de pique', await page.locator('a.tile[data-id="dame-de-pique"]').count() === 1);
  check('games follow the library header and the band of new games', await page.locator('header + #news + #games').count() === 1);
  check('no last game before the first game', await page.locator('#last').isHidden());
  check('no line about the saves under the games', await page.locator('#saves').count() === 0 && !(await page.textContent('main')).includes('gardées'));
  check('old backup data is removed', await page.evaluate(() => !localStorage.getItem('gg:cloud:old') && !localStorage.getItem('gg:approved')));
  check('old games are kept', await page.evaluate(() => GG.load('old').n === 1));
  await page.waitForTimeout(800);
  check('the PC keeps its old id for the statistics', sql("SELECT id FROM players")[0]?.id === 'ABCDEFGHJKLMNPQRSTUVWXYZ23');
  await page.screenshot({ path: join(OUT, 'library-new-pc.png') });

  // 2. Play: open the game from its tile, make a move, come back.
  await page.click('a.tile[data-id="solitaire"]');
  await page.waitForURL(/\/solitaire\//);
  // The first visit starts a game at Facile at once.
  await page.waitForTimeout(2500);
  await page.evaluate(() => clickStock());
  await page.waitForTimeout(600);
  await page.click('#home');
  await page.waitForSelector('a.tile[data-id="solitaire"]');
  check('the game is saved on the PC', await page.evaluate(() => !!GG.load('solitaire')));
  check('the tile shows no line about the saved game', !(await page.textContent('.family a.tile')).includes('Partie en cours') && !(await page.locator('a.tile .status').count()));
  check('button says resume', (await page.textContent('.family a.tile .play')).includes('Reprendre'));
  check('the resume key of a tile is yellow with the play triangle', await page.locator('.family a.tile .play svg').count() === 1 && await page.evaluate(() => getComputedStyle(document.querySelector('.family a.tile .play')).backgroundColor !== 'rgb(255, 255, 255)'));
  await page.screenshot({ path: join(OUT, 'library.png') });
  // Three games per row: the fourth one is on a second row, below the fold. The first row must show whole.
  check('first row of games fits a 1366x680 app window', await page.evaluate(() => document.querySelector('.family a.tile').getBoundingClientRect().bottom <= innerHeight),
    String(await page.evaluate(() => document.querySelector('.family a.tile').getBoundingClientRect().bottom)));
  check('no sideways scroll', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  check('one visit a day, however many pages', calls.filter(c => c.includes('"visit"')).length === 1, calls.join('\n'));
  check('no save is ever sent', !calls.some(c => c.includes('"S"') || c.includes('undo')), calls.join('\n'));
  const plays = sql("SELECT kind, n FROM plays WHERE game = 'solitaire'");
  check('the game start is counted', plays.some(p => p.kind === 'start' && p.n >= 1), JSON.stringify(plays));

  // 3. Offline: the library and the game still open.
  await pc.setOffline(true);
  await page.reload();
  check('library opens offline', await page.locator('a.tile[data-id="solitaire"]').count() === 1);
  await page.goto(BASE + 'solitaire/');
  await page.waitForTimeout(1500);
  check('game opens offline', await page.locator('#table .card').count() > 50);
  // The dames were never opened: they still open offline, and the computer answers from its worker.
  await page.goto(BASE + 'dames/');
  await page.waitForTimeout(800);
  check('dames open offline before their first visit', await page.locator('#board .pc').count() === 40);
  await page.evaluate(() => { tap(32); tap(28); });
  await page.waitForFunction(() => G.turn === 1 && phase === 'player', null, { timeout: 8000 }).catch(() => {});
  check('the computer answers offline, in its worker', await page.evaluate(() => G.turn === 1 && workerOk && !!worker));
  // The dame de pique was never opened either: it opens offline and deals.
  await page.goto(BASE + 'dame-de-pique/');
  await page.waitForTimeout(800);
  check('dame de pique opens offline before its first visit', await page.locator('.card.hand').count() === 13);
  await pc.setOffline(false);

  // 4. A new version starts when the library opens, never under an open game.
  const page3 = await pc.newPage();
  await page3.goto(BASE);
  await page3.waitForSelector('a.tile[data-id="solitaire"]');
  const v1 = await page3.evaluate(async () => (await caches.keys()).join());
  writeFileSync(versionFile, "self.VERSION = 'test-2';\n");
  // page is the solitaire: a game is open in another window.
  await page3.reload();
  await page3.waitForFunction(async () => (await caches.keys()).includes('grandpa-games-test-2'), null, { timeout: 15000 });
  await page3.waitForTimeout(1500);
  const during = await page3.evaluate(async () => (await caches.keys()).join());
  check('old version kept while a game is open', v1.includes('test-1') && during.includes('test-1'), during);
  await page.close();
  await page3.bringToFront();
  await page3.waitForFunction(async () => (await caches.keys()).join() === 'grandpa-games-test-2');
  check('the waiting update starts after the game closes with the library left open', true);
  await page3.close();
  writeFileSync(versionFile, "self.VERSION = 'test-3';\n");
  // The app opens again: one start is enough to get the newest version.
  const page4 = await pc.newPage();
  await page4.goto(BASE);
  await page4.waitForFunction(async () => (await caches.keys()).join() === 'grandpa-games-test-3', null, { timeout: 15000 })
    .then(() => check('the newest version starts at the first open', true))
    .catch(async () => check('the newest version starts at the first open', false, await page4.evaluate(async () => (await caches.keys()).join())));
  await page4.waitForTimeout(1000);
  await page4.waitForSelector('a.tile[data-id="solitaire"]');
  const ctl = await page4.evaluate(async () => {
    const c = navigator.serviceWorker.controller;
    return c ? (await (await fetch('version.js')).text()) : 'no controller';
  });
  check('the library is controlled by the new version', ctl.includes('test-3'), ctl);
  check('the game survives the update', await page4.evaluate(() => !!GG.load('solitaire')));

  // 5. Statistics: strangers can only add numbers, and only for known games.
  const post = (path, body) => fetch(BASE + 'api/' + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const id2 = 'ZZZZZZZZZZZZZZZZZZZZZZZZZZ';
  check('an unknown game is refused', (await post('stats', { id: id2, kind: 'start', game: 'nope' })).status === 400);
  check('a bad id is refused', (await post('stats', { id: 'x', kind: 'visit' })).status === 400);
  await post('stats', { id: id2, kind: 'won', game: 'solitaire' });
  await post('errors', { id: id2, message: 'Erreur de test', page: '/solitaire/', stack: 'at x' });
  for (let i = 0; i < 25; i++) await post('errors', { id: id2, message: 'spam ' + i });
  check('20 errors a day per PC', sql(`SELECT COUNT(*) AS n FROM errors WHERE pc = 'ZZZZZZ'`)[0].n === 20);

  // 6. Admin page: password, numbers, chart, games, errors.
  const noAuth = await fetch(BASE + 'api/admin/overview');
  check('admin API needs the password', noAuth.status === 401, String(noAuth.status));
  const adm = await (await browser.newContext({ viewport: { width: 1366, height: 900 } })).newPage();
  await adm.goto(BASE + 'admin/');
  await adm.fill('#pw', 'wrong');
  await adm.click('#login button');
  await adm.waitForFunction(() => document.querySelector('#loginErr').textContent.length > 0);
  check('wrong admin password refused', true);
  await adm.fill('#pw', ADMIN);
  await adm.click('#login button');
  await adm.waitForSelector('#games .game');
  check('admin counts the players', (await adm.textContent('#total')).startsWith('2 joueurs'), await adm.textContent('#total'));
  check('admin counts today', (await adm.textContent('#kToday')) === '2');
  check('admin draws 30 days', await adm.locator('#chartSvg circle').count() === 31);
  await adm.click('.seg button[data-range="7"]');
  check('admin switches to 7 days', await adm.locator('#chartSvg circle').count() === 8);
  await adm.hover('#chartSvg', { position: { x: 700, y: 120 } });
  check('admin shows a tooltip on hover', await adm.isVisible('#tip'));
  check('admin lists the games with a win rate', (await adm.textContent('#games')).includes('Solitaire') && (await adm.textContent('#games')).includes('%'));
  check('admin lists the errors', (await adm.textContent('#errors')).includes('Erreur de test'));
  await adm.screenshot({ path: join(OUT, 'admin.png'), fullPage: true });
  adm.once('dialog', d => d.accept());
  await adm.click('#clearErr');
  await adm.waitForFunction(() => document.querySelector('#errors').textContent.includes('Aucune erreur'));
  check('admin clears the errors', sql('SELECT COUNT(*) AS n FROM errors')[0].n === 0);

  // A logout discards an overview response that was already in flight.
  const overview = await (await fetch(BASE + 'api/admin/overview', { headers: { Authorization: 'Bearer ' + ADMIN } })).json();
  let respond;
  const pending = new Promise(resolve => respond = resolve);
  await adm.route('**/api/admin/overview', respond, { times: 1 });
  await adm.evaluate(() => { window.pendingOverview = load(); });
  const route = await pending;
  await adm.click('#logout');
  await route.fulfill({ json: overview });
  await adm.evaluate(() => window.pendingOverview);
  check('logout clears the dashboard and discards a pending overview', await adm.evaluate(() => (
    document.getElementById('app').hidden && !document.getElementById('total').textContent
  )));


  // 7. Phone width: no sideways scroll.
  const phone = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await phone.goto(BASE);
  check('no sideways scroll at 390 px', await phone.evaluate(() => document.documentElement.scrollWidth <= 390));
  await phone.screenshot({ path: join(OUT, 'library-phone.png'), fullPage: true });

  // 8. New games: a band under the heading names the games added in the last 60 days that he has not opened,
  // for 3 days after it first showed them, and their tiles carry a « Nouveau » tag. The clock is fixed at
  // the day after the last game was added, so the test does not depend on today's date.
  {
    const DAY = 864e5;
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 680 }, serviceWorkers: 'block' });
    const p = await ctx.newPage();
    await p.goto(BASE);
    const added = await p.evaluate(() => GAMES.filter(g => g.added).map(g => [g.id, new Date(g.added + 'T00:00').getTime()]));
    const t0 = Math.max(...added.map(([, t]) => t)) + DAY / 2;
    const expected = added.filter(([, t]) => t0 - t < 60 * DAY).map(([id]) => id).sort();
    await ctx.clock.setFixedTime(t0);
    await p.evaluate(() => localStorage.removeItem('gg:news-seen'));
    await p.reload();
    const band = () => p.evaluate(() => document.getElementById('news').hidden ? [] : [...document.querySelectorAll('#news a')].map(a => a.dataset.id).sort());
    const tags = () => p.evaluate(() => [...document.querySelectorAll('a.tile .art .new')].map(e => e.closest('a.tile').dataset.id).sort());
    const same = (a, b) => a.join() === b.join();
    check('new games: there are new games to show', expected.length > 0);
    check('new games: the band shows them on a new PC', same(await band(), expected), (await band()).join());
    check('new games: their tiles carry « Nouveau »', same(await tags(), expected), (await tags()).join());
    check('new games: one plain sentence', (await p.textContent('#news p')).trim() === (expected.length > 1 ? 'Nouveaux jeux :' : 'Nouveau jeu :'));
    const id0 = expected[0];
    check('new games: a name opens the game, like its tile', await p.getAttribute(`#news a[data-id="${id0}"]`, 'href') === await p.getAttribute(`a.tile[data-id="${id0}"]`, 'href'));
    check('new games: the first row of games shows whole at 1366x680', await p.evaluate(() => document.querySelector('.family a.tile').getBoundingClientRect().bottom <= Math.min(innerHeight, document.querySelector('main').getBoundingClientRect().bottom, document.querySelector('footer')?.getBoundingClientRect().top ?? innerHeight) + .5),
      String(await p.evaluate(() => [document.querySelector('.family a.tile').getBoundingClientRect().bottom, document.querySelector('main').getBoundingClientRect().bottom])));
    // Every window size: no text under 20 px, keys 44 px high or more, nothing past the sides.
    const layout = () => p.evaluate(() => {
      const bad = [];
      const els = [...document.querySelectorAll('#news, #news *, a.tile .new')];
      for (const e of els) {
        const r = e.getBoundingClientRect(), cs = getComputedStyle(e);
        if (r.left < -.5 || r.right > document.documentElement.clientWidth + .5) bad.push('outside: ' + (e.textContent || e.tagName));
        if (e.scrollWidth > e.clientWidth + 1 && cs.overflow !== 'visible') bad.push('cut: ' + e.textContent);
        if ([...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()) && parseFloat(cs.fontSize) < 20) bad.push('small: ' + e.textContent);
        if ((e.tagName === 'A' || e.tagName === 'BUTTON') && e.offsetHeight < 44) bad.push('low key: ' + e.textContent);
      }
      if (document.documentElement.scrollWidth > innerWidth) bad.push('sideways scroll');
      return bad;
    });
    for (const [w, h, z] of [[1366, 680, 1], [1093, 530, 1], [1920, 1000, 1], [1280, 620, 1], [390, 760, 1], [1366, 680, 1.3], [1920, 1000, 1.75]]) {
      await p.evaluate(z => localStorage.setItem('gg:size', String(z)), z);
      await p.setViewportSize({ width: w, height: h });
      await p.reload();
      await p.waitForSelector('#news a');
      await p.evaluate(() => document.fonts.ready);
      const bad = await layout();
      check(`new games: the band fits at ${w}x${h} and ${z * 100} %`, !bad.length, bad.join(' | '));
    }
    await p.evaluate(() => localStorage.setItem('gg:size', '1'));
    await p.setViewportSize({ width: 1366, height: 680 });
    await p.screenshot({ path: join(OUT, 'library-new-games.png') });

    // A game he opened is no longer new.
    await p.evaluate(id => GG.save(id, { n: 1 }, { summary: 'Partie en cours' }).then(GG.flush), id0);
    await p.reload();
    check('new games: a game he started drops out of the band and loses its tag', !(await band()).includes(id0) && !(await tags()).includes(id0) && (await band()).length === expected.length - 1);

    // Two days after the band first showed them, they are still new; three days after, they are gone.
    const seen = await p.evaluate(() => GG.get('news-seen'));
    check('new games: the first time each game was shown is kept', expected.every(id => seen[id] === t0), JSON.stringify(seen));
    const age = days => p.evaluate(([days, DAY]) => {
      const s = GG.get('news-seen');
      for (const id in s) s[id] = Date.now() - days * DAY;
      GG.set('news-seen', s);
    }, [days, DAY]);
    await age(2.9); await p.reload();
    check('new games: still shown 2.9 days after they were first shown', (await band()).length === expected.length - 1);
    await age(3); await p.reload();
    check('new games: gone 3 days after they were first shown', (await band()).length === 0 && (await tags()).length === 0 && await p.locator('#news').isHidden());
    // Without the band, the heading is followed by its line again.
    check('new games: the line under the heading is back', await p.locator('#tagline').isVisible());

    // « Masquer » puts the band away for good; the tags stay until the games are no longer new.
    await p.evaluate(id => { localStorage.removeItem('gg:news-seen'); localStorage.removeItem('gg:save:' + id); }, id0);
    await p.reload();
    check('new games: the band is back on a PC that has not seen it', same(await band(), expected));
    await p.click('#news button:has-text("Masquer")');
    check('new games: « Masquer » hides the band', await p.locator('#news').isHidden());
    await p.reload();
    check('new games: the band stays hidden after a reload', await p.locator('#news').isHidden() && same(await tags(), expected));

    // Sixty days after a game was added, a PC that sees the library for the first time shows nothing.
    await p.evaluate(() => { localStorage.removeItem('gg:news-seen'); localStorage.removeItem('gg:news-hidden'); });
    await ctx.clock.setFixedTime(t0 + 61 * DAY);
    await p.reload();
    check('new games: nothing is new 60 days after it was added', (await band()).length === 0 && (await tags()).length === 0);

    // A game first shown on day 59 keeps its 3 days, past the 60.
    await p.evaluate(() => localStorage.removeItem('gg:news-seen'));
    await ctx.clock.setFixedTime(t0 + 59 * DAY);
    await p.reload();
    await ctx.clock.setFixedTime(t0 + 61 * DAY);
    await p.reload();
    check('new games: a game first shown on day 59 still shows on day 61', (await band()).length > 0);

    // Back on the library tab with nothing changed, the tile he chose with the keyboard keeps the focus.
    await p.focus('.family a.tile');
    const kept = await p.evaluate(() => {
      const before = document.activeElement;
      document.dispatchEvent(new Event('visibilitychange'));
      return document.activeElement === before && before.isConnected && before.matches('a.tile');
    });
    check('new games: coming back to the tab keeps the focus on the chosen tile', kept);
    await ctx.close();

    // Without storage, the library still shows the band, and « Masquer » hides it in this window.
    const bare = await browser.newContext({ viewport: { width: 1366, height: 680 }, serviceWorkers: 'block' });
    await bare.addInitScript(() => Object.defineProperty(window, 'localStorage', { get() { throw new Error('denied'); } }));
    await bare.clock.setFixedTime(t0);
    const q = await bare.newPage();
    const errors = [];
    q.on('pageerror', e => errors.push(e.message));
    await q.goto(BASE);
    await q.waitForSelector('a.tile');
    check('new games: without storage, the band shows', await q.locator('#news a').count() === expected.length, errors.join());
    await q.click('#news button:has-text("Masquer")');
    check('new games: without storage, « Masquer » hides it', await q.locator('#news').isHidden() && !errors.length, errors.join());
    await bare.close();
  }

  // 9. Ten wrong admin passwords lock this network out, also with the right password. Last, as it locks the admin.
  const tryAdmin = pw => fetch(BASE + 'api/admin/overview', { headers: { Authorization: 'Bearer ' + pw } });
  sql('DELETE FROM admin_failures'); // the earlier steps tried wrong passwords too
  for (let i = 0; i < 9; i++) await tryAdmin('guess' + i);
  check('a wrong password before the limit gets 401', (await tryAdmin('guess9')).status === 401);
  check('the right password is refused once locked out', (await tryAdmin(ADMIN)).status === 429);
  check('a refused try does not extend the lockout', sql('SELECT COUNT(*) AS n FROM admin_failures')[0].n === 10);
} finally {
  await browser.close();
  dev.kill();
  rmSync(data, { recursive: true, force: true });
  if (oldVersion === null) rmSync(versionFile, { force: true }); else writeFileSync(versionFile, oldVersion);
}
console.log(failed ? `${failed} FAILED` : 'ALL PASSED');
process.exit(failed ? 1 : 0);
