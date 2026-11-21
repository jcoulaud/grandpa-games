// The library and the cloud backup, against a local Worker with a local D1 database.
// It starts `wrangler dev` itself, with a fresh database in a temporary folder.
import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { launch, OUT } from './harness.mjs';

const PORT = 8791, BASE = `http://localhost:${PORT}/`;
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
  // 1. A new PC: the library shows the game, the note and the code to approve.
  const pc = await browser.newContext({ viewport: { width: 1366, height: 680 } });
  const page = await pc.newPage();
  await page.goto(BASE);
  await page.waitForSelector('#sync svg');
  check('tile for solitaire', await page.locator('a.tile[data-id="solitaire"]').count() === 1);
  check('new badge on an unplayed game', await page.locator('a.tile .badge').count() === 1);
  check('note from message.json', await page.locator('#note.on').count() === 1);
  const code = await page.evaluate(() => GG.code);
  check('code shown before approval', (await page.textContent('#code')).includes(code.slice(0, 3)));
  check('PC recorded, not approved', sql(`SELECT approved FROM devices WHERE code = '${code}'`)[0]?.approved === 0);
  await page.screenshot({ path: join(OUT, 'library-new-pc.png') });

  // 2. Approve it, as `bun run approve` does.
  sql(`UPDATE devices SET approved = 1, player = '${code}' WHERE code = '${code}'`);
  await page.reload();
  await page.waitForFunction(() => document.querySelector('#sync').textContent.includes('en ligne'));
  check('approved PC says saves are online', true);
  check('code hidden once approved', (await page.textContent('#code')).trim() === '');

  // 3. Play: open the game from its tile, make a move, come back.
  await page.click('a.tile[data-id="solitaire"]');
  await page.waitForURL(/games\/solitaire/);
  await page.waitForTimeout(2500);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  await page.evaluate(() => clickStock());
  await page.waitForTimeout(4500); // the save goes to the server after 3 s
  const row = sql(`SELECT summary, length(data) AS n FROM saves WHERE player = '${code}' AND game = 'solitaire'`)[0];
  check('save reached the server', !!row && row.n > 100, JSON.stringify(row));
  check('cloud copy has no undo steps', !!row && row.n < 20000, String(row && row.n));
  await page.click('#home');
  await page.waitForSelector('#sync svg');
  check('trophy line shows wins only', !(await page.textContent('a.tile')).includes('Partie en cours'));
  check('button says resume', (await page.textContent('a.tile .play')).includes('Reprendre'));
  check('badge gone after the first game', await page.locator('a.tile .badge').count() === 0);
  await page.screenshot({ path: join(OUT, 'library.png') });
  check('fits a 1366x680 app window without scrolling', await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight),
    String(await page.evaluate(() => document.documentElement.scrollHeight)));

  // 4. Offline: the library and the game still open.
  await pc.setOffline(true);
  await page.reload();
  check('library opens offline', await page.locator('a.tile[data-id="solitaire"]').count() === 1);
  await page.goto(BASE + 'games/solitaire/');
  await page.waitForTimeout(1500);
  check('game opens offline', await page.locator('#table .card').count() > 50);
  await pc.setOffline(false);

  // 5. A new PC joins the same player and gets the saved game back,
  //    even if someone played on it before the approval.
  const pc2 = await browser.newContext({ viewport: { width: 1366, height: 680 } });
  const page2 = await pc2.newPage();
  await page2.goto(BASE);
  await page2.waitForSelector('#sync svg');
  const code2 = await page2.evaluate(() => GG.code);
  await page2.goto(BASE + 'games/solitaire/');
  await page2.waitForTimeout(2500);
  await page2.keyboard.press('Escape');
  await page2.evaluate(() => { clickStock(); clickStock(); clickStock(); });
  await page2.waitForTimeout(600);
  const own = await page2.evaluate(() => JSON.stringify(S));
  await page2.goto(BASE);
  await page2.waitForSelector('#sync svg');
  sql(`UPDATE devices SET approved = 1, player = (SELECT player FROM devices WHERE code = '${code}') WHERE code = '${code2}'`);
  // The first download fails once: the PC must stay "first" and must not upload its own game.
  let failOnce = true;
  await page2.route('**/api/saves', route => { if (failOnce) { failOnce = false; return route.fulfill({ status: 503, body: '{}' }); } return route.continue(); });
  await page2.reload();
  await page2.waitForSelector('#sync svg');
  await page2.waitForTimeout(4000);
  const afterFail = JSON.stringify(JSON.parse(sql(`SELECT data FROM saves WHERE player = '${code}' AND game = 'solitaire'`)[0].data).S);
  check('failed first download uploads nothing', afterFail !== own);
  await page2.reload();
  await page2.waitForFunction(() => document.querySelector('#sync').textContent.includes('en ligne'));
  check('new PC restores the game from the cloud', true);
  const restored = await page2.evaluate(() => JSON.stringify(GG.load('solitaire').S));
  const server = JSON.stringify(JSON.parse(sql(`SELECT data FROM saves WHERE player = '${code}' AND game = 'solitaire'`)[0].data).S);
  check('new PC has the server game', restored === server);
  check('new PC did not overwrite the server copy', server !== own);

  // 5b. A move made while an upload is on its way is still backed up.
  await page.goto(BASE);
  await page.waitForSelector('#sync svg');
  await page.evaluate(() => {
    const f = window.fetch;
    window.fetch = (u, o) => (o && o.method === 'PUT') ? new Promise(r => setTimeout(r, 1500)).then(() => f(u, o)) : f(u, o);
    GG.save('race', { n: 1 });
    setTimeout(() => GG.save('race', { n: 2 }), 3600); // during the slow upload of n = 1
  });
  await page.waitForTimeout(10000);
  const race = sql(`SELECT data FROM saves WHERE player = '${code}' AND game = 'race'`)[0];
  check('move during an upload reaches the server', race && JSON.parse(race.data).n === 2, JSON.stringify(race));

  // 5c. A new version starts only after the app window is closed.
  const page3 = await pc.newPage();
  await page3.goto(BASE);
  await page3.waitForSelector('#sync svg');
  const v1 = await page3.evaluate(async () => (await caches.keys()).join());
  writeFileSync(versionFile, "self.VERSION = 'test-2';\n");
  await page.close();
  await page3.reload();
  await page3.waitForFunction(async () => (await caches.keys()).includes('grandpa-games-test-2'), null, { timeout: 15000 });
  const during = await page3.evaluate(async () => (await caches.keys()).join());
  check('old version kept while the window is open', v1.includes('test-1') && during.includes('test-1'), during);
  await page3.close();
  await new Promise(r => setTimeout(r, 1000));
  const page4 = await pc.newPage();
  await page4.goto(BASE);
  await page4.waitForFunction(async () => (await caches.keys()).join() === 'grandpa-games-test-2', null, { timeout: 15000 })
    .then(() => check('new version starts after the window is closed', true))
    .catch(async () => check('new version starts after the window is closed', false, await page4.evaluate(async () => (await caches.keys()).join())));

  // 6. Strangers cannot save.
  const r = await fetch(BASE + 'api/saves/solitaire', { method: 'PUT', headers: { 'X-Device': 'ZZZZZZZZZZZZZZZZZZZZZZZZZZ' }, body: '{"updatedAt":1,"data":{}}' });
  check('unapproved PC cannot save', r.status === 403, String(r.status));
  const big = await fetch(BASE + 'api/saves/solitaire', { method: 'PUT', headers: { 'X-Device': (await page4.evaluate(() => GG.get('device'))) }, body: JSON.stringify({ updatedAt: Date.now(), data: 'x'.repeat(120000) }) });
  check('save over 100 KB refused', big.status === 413 || big.status === 429, String(big.status));

  // 6b. Errors: a crash on an approved PC reaches the server.
  await page4.evaluate(() => setTimeout(() => { throw new Error('Erreur de test'); }));
  await page4.waitForTimeout(2500);
  const errRow = sql(`SELECT message, page FROM errors WHERE device_code = '${code}'`)[0];
  check('error reaches the server', errRow && errRow.message.includes('Erreur de test'), JSON.stringify(errRow));
  const crashes = await fetch(BASE + 'api/errors', { method: 'POST', headers: { 'X-Device': 'ZZZZZZZZZZZZZZZZZZZZZZZZZZ' }, body: '{"items":[{"message":"x"}]}' });
  check('unapproved PC cannot send errors', crashes.status === 403, String(crashes.status));

  // 6c. Admin page: password, PCs, approval from the page, errors.
  const noAuth = await fetch(BASE + 'api/admin/overview');
  check('admin API needs the password', noAuth.status === 401, String(noAuth.status));
  const pc3 = await browser.newContext({ viewport: { width: 1366, height: 680 } });
  const page5 = await pc3.newPage();
  await page5.goto(BASE);
  await page5.waitForSelector('#sync svg');
  const code3 = await page5.evaluate(() => GG.code);
  const adm = await (await browser.newContext({ viewport: { width: 1366, height: 900 } })).newPage();
  await adm.goto(BASE + 'admin/');
  await adm.fill('#pw', 'wrong');
  await adm.click('#login button');
  await adm.waitForFunction(() => document.querySelector('#loginErr').textContent.length > 0);
  check('wrong admin password refused', true);
  await adm.fill('#pw', ADMIN);
  await adm.click('#login button');
  await adm.waitForSelector('#pcs table');
  check('admin lists the PCs', (await adm.textContent('#pcs')).includes(code3.slice(0, 3)));
  check('admin lists the saves', (await adm.textContent('#saves')).includes('Solitaire'));
  check('admin lists the error', (await adm.textContent('#errors')).includes('Erreur de test'));
  adm.once('dialog', d => d.accept('PC de Papi'));
  await adm.click(`tr[data-code="${code}"] button[data-act="rename"]`);
  await adm.waitForFunction(() => document.querySelector('#pcs').textContent.includes('PC de Papi'));
  check('admin renames a PC', true);
  await adm.selectOption(`tr[data-code="${code3}"] select[data-as]`, code);
  await adm.click(`tr[data-code="${code3}"] button[data-act="approve"]`);
  await adm.waitForFunction(c => !document.querySelector(`tr[data-code="${c}"] button[data-act="approve"]`), code3);
  const d3 = sql(`SELECT approved, player FROM devices WHERE code = '${code3}'`)[0];
  check('admin approves a PC with the saves of another', d3.approved === 1 && d3.player === code, JSON.stringify(d3));
  await adm.screenshot({ path: join(OUT, 'admin.png'), fullPage: true });

  // 6d. A PC that is behind cannot overwrite a newer save from another PC.
  await page5.reload();
  await page5.waitForFunction(() => document.querySelector('#sync').textContent.includes('en ligne'));
  await page4.evaluate(() => GG.save('race', { n: 7 }));
  await page4.waitForTimeout(4500);
  await page5.evaluate(() => GG.save('race', { n: 99 })); // newer clock, but based on an older server copy
  await page5.waitForTimeout(4500);
  const raceNow = JSON.parse(sql(`SELECT data FROM saves WHERE player = '${code}' AND game = 'race'`)[0].data).n;
  check('PC behind cannot overwrite a newer save', raceNow === 7, String(raceNow));
  await page5.reload();
  await page5.waitForFunction(() => document.querySelector('#sync').textContent.includes('en ligne'));
  check('PC behind takes the newer save at its next start', await page5.evaluate(() => GG.load('race').n) === 7);

  // 6d2. The server stores a save but the answer is lost: the PC's next save is not "behind".
  let dropAnswer = true;
  await page5.route('**/api/saves/race', async route => {
    if (!dropAnswer) return route.continue();
    dropAnswer = false;
    await route.fetch(); // the server gets and stores it
    return route.abort(); // the PC never hears back
  });
  await page5.evaluate(() => GG.save('race', { n: 20 }));
  await page5.waitForTimeout(4500);
  await page5.evaluate(() => GG.save('race', { n: 21 }));
  await page5.waitForTimeout(4500);
  const lost = JSON.parse(sql(`SELECT data FROM saves WHERE player = '${code}' AND game = 'race'`)[0].data).n;
  check('a lost answer does not make the PC lose its next save', lost === 21, String(lost));
  await page5.unroute('**/api/saves/race');

  // 6d3. An admin restore wins, even against the PC that wrote the save before it.
  sql(`INSERT INTO history (player, game, updated_at, data, saved_at) VALUES ('${code}', 'race', 1, '{"n":5}', 1)`);
  const hid = sql(`SELECT MAX(id) AS id FROM history`)[0].id;
  sql(`INSERT INTO saves (player, game, updated_at, data, summary) SELECT player, game, ${Date.now()}, data, '' FROM history WHERE id = ${hid}
       ON CONFLICT (player, game) DO UPDATE SET updated_at = excluded.updated_at, data = excluded.data, summary = '', device = NULL, rev = saves.rev + 1`);
  await page5.evaluate(() => GG.save('race', { n: 22 })); // the PC that wrote n = 21, before it syncs
  await page5.waitForTimeout(4500);
  const afterRestore = JSON.parse(sql(`SELECT data FROM saves WHERE player = '${code}' AND game = 'race'`)[0].data).n;
  check('an admin restore is not overwritten by the last writer', afterRestore === 5, String(afterRestore));
  await page5.reload();
  await page5.waitForFunction(() => document.querySelector('#sync').textContent.includes('en ligne'));
  check('the last writer takes the restore at its next start', await page5.evaluate(() => GG.load('race').n) === 5);

  // 6d4. A window that loaded a game stops saving it once a sync brought a newer copy.
  const win = await pc3.newPage();
  await win.goto(BASE);
  await win.waitForSelector('#sync svg');
  await win.evaluate(() => GG.load('race'));
  await page4.reload();
  await page4.waitForFunction(() => document.querySelector('#sync').textContent.includes('en ligne'));
  await page4.evaluate(() => GG.save('race', { n: 30 }));
  await page4.waitForTimeout(4500);
  await page5.reload();
  await page5.waitForFunction(() => document.querySelector('#sync').textContent.includes('en ligne'));
  await page5.waitForTimeout(500);
  check('an outdated window cannot save', await win.evaluate(() => GG.save('race', { n: 2 })) === false);
  await win.close();
  check('the newer copy stays on the PC', await page5.evaluate(() => GG.load('race').n) === 30);

  // 6e. A removed PC keeps playing. Approved again, it keeps those games and sends them.
  sql(`UPDATE devices SET approved = 0 WHERE code = '${code3}'`);
  await page5.reload();
  await page5.waitForSelector('#sync svg');
  await page5.evaluate(() => GG.save('race', { n: 12 }));
  await page5.waitForTimeout(500);
  sql(`UPDATE devices SET approved = 1 WHERE code = '${code3}'`);
  await page5.reload();
  await page5.waitForFunction(() => document.querySelector('#sync').textContent.includes('en ligne'));
  await page5.waitForTimeout(1500);
  check('PC approved again keeps its own newer game', await page5.evaluate(() => GG.load('race').n) === 12);
  const raceAfter = JSON.parse(sql(`SELECT data FROM saves WHERE player = '${code}' AND game = 'race'`)[0].data).n;
  check('PC approved again sends that game', raceAfter === 12, String(raceAfter));
  adm.once('dialog', d => d.accept());
  await adm.click('#clearErr');
  await adm.waitForFunction(() => document.querySelector('#errors').textContent.includes('Aucune erreur'));
  check('admin clears the errors', sql('SELECT COUNT(*) AS n FROM errors')[0].n === 0);

  // 7. Phone width: no sideways scroll.
  const phone = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await phone.goto(BASE);
  check('no sideways scroll at 390 px', await phone.evaluate(() => document.documentElement.scrollWidth <= 390));
  await phone.screenshot({ path: join(OUT, 'library-phone.png'), fullPage: true });
} finally {
  await browser.close();
  dev.kill();
  rmSync(data, { recursive: true, force: true });
  if (oldVersion === null) rmSync(versionFile, { force: true }); else writeFileSync(versionFile, oldVersion);
}
console.log(failed ? `${failed} FAILED` : 'ALL PASSED');
process.exit(failed ? 1 : 0);
